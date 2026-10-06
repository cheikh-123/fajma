"""API de l'avis médical écrit : offre du médecin, demande du patient (photos, mesures), réponse, délais."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import Relative
from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from directory.models import Doctor
from medical.models import DocumentShare, MedicalDocument, MedicalRecord
from notifications.service import notify
from sunusante.api import ApiError, ScopedThrottle, body, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user
from sunusante.uploads import decode_upload, store

from .models import AsyncOffer, AsyncRequest

MAX_PHOTOS = 4


class AsyncThrottle(ScopedThrottle):
    scope = "booking"


def offer_dict(o: AsyncOffer | None) -> dict | None:
    if not o or not o.enabled:
        return None
    return {"price": o.price, "response_hours": o.response_hours, "instructions": o.instructions or None}


def request_dict(r: AsyncRequest, *, for_doctor: bool = False) -> dict:
    a = r.appointment
    photos = MedicalDocument.objects.filter(appointment=a, category="autre", title__startswith="Photo")
    paid = any(p.status == "paid" for p in a.payments.all())
    data = {
        "id": str(r.id),
        "appointment_id": str(a.id),
        "status": r.status,
        "status_label": r.get_status_display(),
        "created_at": iso(r.created_at),
        "deadline_at": iso(r.deadline_at),
        "reason": a.reason or None,
        "symptoms": r.symptoms,
        "since": r.since or None,
        "temperature": float(r.temperature) if r.temperature is not None else None,
        "systolic": r.systolic,
        "diastolic": r.diastolic,
        "weight": float(r.weight) if r.weight is not None else None,
        "current_treatments": r.current_treatments or None,
        "photos": [{"id": str(p.id), "url": f"/api/documents/{p.id}/download"} for p in photos],
        "answer": r.answer or None,
        "outcome": r.outcome or None,
        "outcome_label": r.get_outcome_display() if r.outcome else None,
        "answered_at": iso(r.answered_at),
        "amount": a.amount_due,
        "paid": paid,
        "doctor": {"id": str(a.doctor_id), "full_name": a.doctor.full_name, "specialty": a.doctor.specialty.name if a.doctor.specialty_id else None},
        "for_relative": a.relative.full_name if a.relative_id else None,
    }
    if for_doctor:
        who = a.relative if a.relative_id else a.patient
        data["patient"] = {"id": str(a.patient_id), "full_name": who.full_name,
                           "birth_date": who.birth_date.isoformat() if who.birth_date else None, "sex": who.sex or None}
    return data


# ── Offre du médecin ──────────────────────────────────────────────────


@api_view(["GET"])
def public_offer(request, doctor_id):
    return Response(offer_dict(AsyncOffer.objects.filter(doctor_id=doctor_id, doctor__is_verified=True).first()))


@api_view(["GET", "POST"])
def my_offer(request):
    doctor = my_doctor(require_user(request))
    offer, _ = AsyncOffer.objects.get_or_create(doctor=doctor)
    if request.method == "POST":
        data = body(request)
        offer.enabled = bool(data.get("enabled"))
        offer.price = get_int(data, "price", default=offer.price, min_value=0, max_value=200_000)
        hours = get_int(data, "response_hours", default=offer.response_hours)
        if hours not in (24, 48):
            raise ApiError("Délai de réponse : 24 ou 48 heures")
        offer.response_hours = hours
        offer.instructions = get_str(data, "instructions", max_len=400) or ""
        offer.save()
    return Response({"enabled": offer.enabled, "price": offer.price, "response_hours": offer.response_hours, "instructions": offer.instructions})


# ── Patient ───────────────────────────────────────────────────────────


def _decimal(data, key, lo, hi):
    raw = data.get(key)
    if raw in (None, ""):
        return None
    try:
        value = Decimal(str(raw).replace(",", "."))
    except InvalidOperation as err:
        raise ApiError("Mesure invalide") from err
    if not lo <= value <= hi:
        raise ApiError("Mesure hors des valeurs possibles")
    return value


def activate(appt) -> None:
    """Paiement reçu (ou avis gratuit) : la demande part chez le médecin, le délai démarre."""
    r = AsyncRequest.objects.filter(appointment=appt, status="awaiting_payment").select_related("appointment__doctor").first()
    if not r:
        return
    offer = AsyncOffer.objects.filter(doctor=appt.doctor).first()
    hours = offer.response_hours if offer else 24
    r.status, r.deadline_at = "submitted", timezone.now() + timedelta(hours=hours)
    r.save(update_fields=["status", "deadline_at", "updated_at"])
    Appointment.objects.filter(pk=appt.pk).update(status="confirmed")
    if appt.doctor.user_id:
        notify(appt.doctor.user, kind="async", title="Nouvelle demande d'avis écrit",
               body=f"À traiter avant le {timezone.localtime(r.deadline_at):%d/%m à %H:%M}.", link="/pro?onglet=avis", sms=True)


@api_view(["GET", "POST"])
@throttle_classes([AsyncThrottle])
def my_requests(request):
    """POST {doctor_id, relative_id?, reason, symptoms, since?, temperature?, systolic?, diastolic?, weight?,
    current_treatments?, photos?: [{file_name, content_base64}]}."""
    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id"), is_verified=True).first()
        offer = AsyncOffer.objects.filter(doctor=doctor, enabled=True).first() if doctor else None
        if not offer:
            raise ApiError("Ce médecin ne propose pas d'avis écrit")
        if doctor.user_id == user.id:
            raise ApiError("Vous ne pouvez pas vous adresser une demande")
        relative = None
        if rid := get_uuid(data, "relative_id", required=False):
            relative = Relative.objects.filter(id=rid, owner=user).first()
            if not relative:
                raise not_found("Proche introuvable")
        if AsyncRequest.objects.filter(appointment__patient=user, appointment__doctor=doctor, status__in=["awaiting_payment", "submitted"]).count() >= 2:
            raise ApiError("Vous avez déjà des demandes en cours avec ce médecin")
        photos = data.get("photos") or []
        if not isinstance(photos, list) or len(photos) > MAX_PHOTOS:
            raise ApiError(f"{MAX_PHOTOS} photos au plus")
        decoded = []
        for ph in photos:
            content, mime, name = decode_upload(ph if isinstance(ph, dict) else {})
            if not mime.startswith("image/"):
                raise ApiError("Seules les photos sont acceptées")
            decoded.append((content, mime, name))
        fields = {
            "symptoms": get_str(data, "symptoms", required=True, min_len=10, max_len=3000),
            "since": get_str(data, "since", max_len=80) or "",
            "temperature": _decimal(data, "temperature", 34, 43),
            "systolic": get_int(data, "systolic", min_value=50, max_value=260),
            "diastolic": get_int(data, "diastolic", min_value=30, max_value=160),
            "weight": _decimal(data, "weight", 1, 300),
            "current_treatments": get_str(data, "current_treatments", max_len=500) or "",
        }
        now = timezone.now()
        with transaction.atomic():
            appt = Appointment.objects.create(
                patient=user, doctor=doctor, relative=relative, scheduled_at=now, duration_minutes=0, mode="async",
                reason=get_str(data, "reason", required=True, min_len=3, max_len=200), status="pending",
                price=offer.price, channel="web",
            )
            r = AsyncRequest.objects.create(appointment=appt, **fields)
            for i, (content, mime, name) in enumerate(decoded, 1):
                doc = MedicalDocument.objects.create(
                    patient=user, uploaded_by=user, appointment=appt, title=f"Photo {i} — avis écrit", category="autre",
                    file_path=store(f"documents/{user.id}", name, content), mime_type=mime, size_bytes=len(content),
                )
                DocumentShare.objects.create(document=doc, doctor=doctor)
        if offer.price == 0:
            activate(appt)
            r.refresh_from_db()
        return Response(request_dict(r))
    rows = AsyncRequest.objects.filter(appointment__patient=user).select_related(
        "appointment__doctor__specialty", "appointment__relative").prefetch_related("appointment__payments")[:50]
    return Response([request_dict(r) for r in rows])


@api_view(["POST"])
def cancel_request(request, request_id):
    """Le patient renonce avant que le médecin ait répondu : remboursé s'il avait payé."""
    from appointments.views import cancel

    user = require_user(request)
    r = AsyncRequest.objects.filter(id=request_id, appointment__patient=user).select_related("appointment__doctor").first()
    if not r:
        raise not_found("Demande introuvable")
    if r.status not in ("awaiting_payment", "submitted"):
        raise ApiError("Cette demande ne peut plus être annulée")
    cancel(r.appointment, "patient", "Avis écrit annulé par le patient", quiet=True)
    r.status = "cancelled"
    r.save(update_fields=["status", "updated_at"])
    return Response({"ok": True})


# ── Médecin ───────────────────────────────────────────────────────────


@api_view(["GET"])
def pro_requests(request):
    doctor = my_doctor(require_user(request))
    rows = (
        AsyncRequest.objects.filter(appointment__doctor=doctor, status__in=["submitted", "answered", "expired"])
        .select_related("appointment__doctor__specialty", "appointment__relative", "appointment__patient")
        .prefetch_related("appointment__payments")
        .order_by("status", "deadline_at")[:100]
    )
    return Response([request_dict(r, for_doctor=True) for r in rows])


@api_view(["POST"])
def answer(request, request_id):
    """{answer, outcome, diagnosis?, items?/prescription?} : réponse écrite, ordonnance éventuelle, patient prévenu."""
    from medical.prescriptions import create_prescription

    user = require_user(request)
    doctor = my_doctor(user)
    r = AsyncRequest.objects.filter(id=request_id, appointment__doctor=doctor).select_related("appointment__patient", "appointment__relative").first()
    if not r:
        raise not_found("Demande introuvable")
    if r.status != "submitted":
        raise ApiError("Cette demande n'attend pas de réponse")
    data = body(request)
    appt = r.appointment
    with transaction.atomic():
        r.answer = get_str(data, "answer", required=True, min_len=10, max_len=4000)
        r.outcome = get_choice(data, "outcome", {k for k, _ in AsyncRequest.OUTCOMES})
        r.status, r.answered_at = "answered", timezone.now()
        r.save(update_fields=["answer", "outcome", "status", "answered_at", "updated_at"])
        MedicalRecord.objects.update_or_create(
            appointment=appt,
            defaults={"patient_id": appt.patient_id, "doctor": doctor, "summary": r.answer,
                      "diagnosis": get_str(data, "diagnosis", max_len=2000) or "", "treatment": ""},
        )
        prescription = create_prescription(appt, doctor, data)
        appt.status = "completed"
        appt.save(update_fields=["status", "updated_at"])
    audit.log(request, "record_written", patient=appt.patient, target=appt, kind="avis écrit")
    who = f" pour {appt.relative.full_name}" if appt.relative_id else ""
    extra = " Une ordonnance est dans votre dossier." if prescription else ""
    if r.outcome == "emergency":
        extra += " Rendez-vous aux urgences ou appelez le SAMU (1515) sans attendre."
    notify(appt.patient, kind="async", title=f"Réponse de {doctor.full_name}{who}",
           body=f"{r.get_outcome_display()}.{extra}", link="/mon-espace#avis", sms=True, email=True)
    return Response(request_dict(r, for_doctor=True))


# ── Délais ────────────────────────────────────────────────────────────


def expire_overdue(now=None) -> int:
    """Demandes sans réponse dans le délai : annulées, patient remboursé et prévenu (planificateur)."""
    from appointments.views import cancel

    now = now or timezone.now()
    count = 0
    for r in AsyncRequest.objects.filter(status="submitted", deadline_at__lt=now).select_related("appointment__doctor", "appointment__patient"):
        cancel(r.appointment, "doctor", "Pas de réponse dans le délai annoncé", quiet=True)
        r.status = "expired"
        r.save(update_fields=["status", "updated_at"])
        notify(r.appointment.patient, kind="async", title="Avis écrit sans réponse : remboursé",
               body=f"{r.appointment.doctor.full_name} n'a pas pu répondre à temps. Votre paiement vous est remboursé.",
               link="/mon-espace#avis", sms=True, email=True)
        count += 1
    return count
