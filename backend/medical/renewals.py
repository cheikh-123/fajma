"""
Renouvellement d'ordonnance à la demande du patient (traitements au long cours).

Le patient demande le renouvellement d'une ordonnance de moins d'un an ; le médecin qui l'a délivrée
renouvelle (nouvelle ordonnance, mêmes médicaments, en-tête et signature actuels, nouvelle référence)
ou refuse avec un motif (« une consultation est nécessaire »). Un rappel prévient le patient quelques
jours avant la fin de validité d'une ordonnance de traitement long.
"""

from __future__ import annotations

import re
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.views import my_doctor
from audit import log as audit
from notifications.service import notify
from sunusante.api import ApiError, body, get_choice, get_str, iso, not_found, require_user

from .issuer import issuer_snapshot, missing_mentions
from .models import Prescription, PrescriptionRenewal
from .prescriptions import DEFAULT_VALIDITY_MONTHS, items_text

MAX_AGE_DAYS = 365  # au-delà, une consultation est de toute façon nécessaire
REMIND_DAYS_BEFORE = 7
# Traitement au long cours : durée en mois ou « au long cours », ou renouvellements prévus en pharmacie.
LONG_TERM = re.compile(r"mois|\ban\b|ans\b|long cours|continu|à vie|chronique", re.IGNORECASE)


def is_long_term(p: Prescription) -> bool:
    return p.renewals > 0 or any(LONG_TERM.search(str(item.get("duration", ""))) for item in (p.items or []))


def renewal_dict(r: PrescriptionRenewal, for_doctor: bool = False) -> dict:
    p = r.prescription
    subject = p.relative or p.patient
    out = {
        "id": str(r.id),
        "status": r.status,
        "prescription_id": str(p.id),
        "prescription_reference": p.reference,
        "medicines": items_text(p.items) if p.items else p.content,
        "patient_note": r.patient_note or None,
        "doctor_reply": r.doctor_reply or None,
        "new_prescription_id": str(r.new_prescription_id) if r.new_prescription_id else None,
        "created_at": iso(r.created_at),
        "decided_at": iso(r.decided_at) if r.decided_at else None,
        "doctor": {"id": str(r.doctor_id), "full_name": r.doctor.full_name},
    }
    if for_doctor:
        out["patient"] = {"id": str(p.patient_id), "full_name": subject.full_name, "is_relative": bool(p.relative_id)}
        out["prescribed_at"] = iso(p.created_at)
    return out


# ── Patient ──────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
def my_renewals(request):
    """GET : mes demandes. POST {prescription_id, note?} : demander le renouvellement."""
    user = require_user(request)
    if request.method == "GET":
        qs = PrescriptionRenewal.objects.filter(patient=user).select_related("prescription__relative", "prescription__patient", "doctor")
        return Response([renewal_dict(r) for r in qs[:50]])
    data = body(request)
    p = Prescription.objects.filter(id=data.get("prescription_id"), patient=user).select_related("doctor__user").first()
    if not p:
        raise not_found("Ordonnance introuvable")
    if p.created_at < timezone.now() - timedelta(days=MAX_AGE_DAYS):
        raise ApiError("Ordonnance de plus d'un an : prenez rendez-vous pour une nouvelle consultation.")
    if not p.doctor.user.is_active or not p.doctor.is_verified:
        raise ApiError("Ce médecin ne reçoit plus de demandes sur Fajma : prenez rendez-vous avec un autre médecin.")
    try:
        with transaction.atomic():
            r = PrescriptionRenewal.objects.create(
                prescription=p, patient=user, doctor=p.doctor, patient_note=get_str(data, "note", max_len=500) or ""
            )
    except IntegrityError as err:
        raise ApiError("Une demande de renouvellement est déjà en cours pour cette ordonnance.") from err
    who = f" pour {p.relative.full_name}" if p.relative_id else ""
    notify(
        p.doctor.user,
        kind="renewal_request",
        title=f"Demande de renouvellement{who}",
        body=f"{user.full_name} — ordonnance {p.reference}.",
        link="/pro",
        email=True,
    )
    audit.log(request, "renewal_requested", patient=user, target=r)
    return Response(renewal_dict(r))


@api_view(["POST"])
def cancel_renewal(request, renewal_id):
    user = require_user(request)
    updated = PrescriptionRenewal.objects.filter(id=renewal_id, patient=user, status="pending").update(
        status="cancelled", decided_at=timezone.now()
    )
    if not updated:
        raise not_found("Demande introuvable")
    return Response({"ok": True})


# ── Médecin ──────────────────────────────────────────────────────────


@api_view(["GET"])
def pro_renewals(request):
    doctor = my_doctor(require_user(request))
    status = get_choice(request.query_params, "status", {"pending", "all"}, default="pending")
    qs = PrescriptionRenewal.objects.filter(doctor=doctor).select_related("prescription__relative", "prescription__patient", "doctor")
    if status == "pending":
        qs = qs.filter(status="pending")
    return Response([renewal_dict(r, for_doctor=True) for r in qs[:100]])


@api_view(["POST"])
def pro_decide_renewal(request, renewal_id):
    """{decision: accept|refuse, message?} : renouveler (nouvelle ordonnance) ou refuser avec un motif."""
    doctor = my_doctor(require_user(request))
    data = body(request)
    decision = get_choice(data, "decision", {"accept", "refuse"})
    message = get_str(data, "message", max_len=500) or ""
    with transaction.atomic():
        r = (
            PrescriptionRenewal.objects.select_for_update(of=("self",))  # verrou sur cette ligne seulement (jointures facultatives)
            .filter(id=renewal_id, doctor=doctor, status="pending")
            .select_related("prescription__appointment__location", "prescription__relative", "patient")
            .first()
        )
        if not r:
            raise not_found("Demande introuvable ou déjà traitée")
        old = r.prescription
        if decision == "refuse":
            if len(message) < 5:
                raise ApiError("Indiquez le motif du refus au patient (ex. : une consultation est nécessaire).")
            r.status, r.doctor_reply, r.decided_at = "refused", message, timezone.now()
            r.save(update_fields=["status", "doctor_reply", "decided_at", "updated_at"])
        else:
            missing = missing_mentions(doctor)
            if missing:
                raise ApiError(
                    "Avant de délivrer une ordonnance, complétez dans « Ordonnances : en-tête et signature » : "
                    + ", ".join(missing) + "."
                )
            # Même durée de validité que l'ordonnance d'origine (3 mois si elle n'en avait pas).
            days = (old.valid_until - old.created_at.date()).days if old.valid_until else round(DEFAULT_VALIDITY_MONTHS * 30.44)
            months = max(1, round(days / 30.44))
            new = Prescription.objects.create(
                appointment=old.appointment,
                patient_id=old.patient_id,
                relative=old.relative,
                doctor=doctor,
                items=old.items,
                content=old.content,
                renewals=0,
                instructions=message or old.instructions,
                valid_until=timezone.localdate() + timedelta(days=round(months * 30.44)),
                patient_info=old.patient_info,
                issuer=issuer_snapshot(doctor, old.appointment),
            )
            r.status, r.doctor_reply, r.new_prescription, r.decided_at = "accepted", message, new, timezone.now()
            r.save(update_fields=["status", "doctor_reply", "new_prescription", "decided_at", "updated_at"])
    who = f" pour {old.relative.full_name}" if old.relative_id else ""
    if decision == "accept":
        notify(r.patient, kind="prescription", title=f"Ordonnance renouvelée{who}",
               body=f"{doctor.full_name} — à retrouver dans votre dossier, à envoyer à votre pharmacie en un clic.",
               link="/dossier", sms=True)
        audit.log(request, "renewal_accepted", patient=r.patient, target=r)
    else:
        notify(r.patient, kind="renewal_refused", title=f"Renouvellement non accordé{who}",
               body=f"{doctor.full_name} : {message}", link=f"/medecins/{doctor.id}", sms=True)
        audit.log(request, "renewal_refused", patient=r.patient, target=r)
    return Response(renewal_dict(r, for_doctor=True))


# ── Rappel avant la fin de validité ──────────────────────────────────


def send_renewal_reminders(now=None) -> int:
    """Traitement long qui arrive à échéance (dans 7 jours) sans demande en cours : le patient est prévenu."""
    now = now or timezone.now()
    today = timezone.localdate()
    due = (
        Prescription.objects.filter(
            renewal_reminded_at__isnull=True,
            valid_until__gte=today,
            valid_until__lte=today + timedelta(days=REMIND_DAYS_BEFORE),
            created_at__gte=now - timedelta(days=MAX_AGE_DAYS),
        )
        .exclude(Q(renewal_requests__status="pending") | Q(renewal_requests__status="accepted"))
        .select_related("patient", "relative", "doctor")
    )
    count = 0
    for p in due:
        if is_long_term(p):
            who = f" de {p.relative.full_name}" if p.relative_id else ""
            notify(
                p.patient,
                kind="renewal_reminder",
                title=f"Ordonnance{who} bientôt expirée",
                body=f"Valable jusqu'au {p.valid_until:%d/%m}. Demandez son renouvellement au {p.doctor.full_name} depuis votre dossier.",
                link="/dossier",
                sms=True,
            )
            count += 1
        p.renewal_reminded_at = now
        p.save(update_fields=["renewal_reminded_at"])
    return count
