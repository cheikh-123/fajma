"""
Secrétariat : fichier des patients de la clinique (reconstitué à partir des rendez-vous), recherche,
rapprochement des doublons.

- Patients inscrits : identifiés par leur compte.
- Patients sans compte (pris au guichet) : regroupés par numéro de téléphone, sinon par nom.
- Doublons : un même numéro saisi avec des orthographes différentes → « Unifier le nom » ;
  un patient sans compte qui a depuis ouvert un compte Fajma (même numéro vérifié) → « Rattacher au compte ».
Aucune information sur l'existence d'un compte n'est révélée pour une personne qui n'est pas déjà patiente
de la clinique (pas de sondage d'annuaire par numéro de téléphone).
"""

import unicodedata

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from appointments.models import Appointment
from audit import log as audit
from notifications.service import notify
from notifications.sms import normalize_phone
from sunusante.api import ApiError, body, get_str, iso, not_found, require_user

from .views import clinic_access


def _norm(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(c) != "Mn").strip()


def _clinic_appointments(clinic):
    return Appointment.objects.filter(doctor__clinic_memberships__clinic=clinic).select_related("patient", "relative").order_by("scheduled_at")


def build_directory(clinic) -> list[dict]:
    groups: dict[str, dict] = {}
    registered_phones: dict[str, User] = {}
    now = timezone.now()
    for a in _clinic_appointments(clinic):
        if a.patient_id:
            key = f"u:{a.patient_id}"
            g = groups.setdefault(key, {"key": key, "patient_id": str(a.patient_id), "names": set(), "phone": a.patient.phone or None, "registered": True})
            g["names"].add(a.patient.full_name)
            if a.patient.phone_verified and (p := normalize_phone(a.patient.phone)):
                registered_phones[p] = a.patient
        else:
            phone = normalize_phone(a.external_patient_phone)
            key = f"p:{phone}" if phone else f"n:{_norm(a.external_patient_name)}"
            g = groups.setdefault(key, {"key": key, "patient_id": None, "names": set(), "phone": phone, "registered": False})
            g["names"].add(a.external_patient_name.strip())
        g.setdefault("appointments", 0)
        g["appointments"] += 1
        g["last"] = a.scheduled_at if a.status == "completed" else g.get("last")
        if a.is_active and not g.get("next") and a.scheduled_at >= now:
            g["next"] = a.scheduled_at
    rows = []
    for g in groups.values():
        names = sorted(g["names"])
        account = registered_phones.get(g["phone"]) if not g["registered"] and g["phone"] else None
        rows.append(
            {
                "key": g["key"],
                "patient_id": g["patient_id"],
                "name": names[0],
                "name_variants": names if len(names) > 1 else [],
                "phone": g["phone"],
                "registered": g["registered"],
                "appointments": g["appointments"],
                "last_visit": iso(g.get("last")),
                "next_appointment": iso(g.get("next")),
                # Compte Fajma d'un patient déjà connu de la clinique, avec le même numéro vérifié.
                "matching_account": {"patient_id": str(account.id), "name": account.full_name} if account else None,
            }
        )
    return sorted(rows, key=lambda r: _norm(r["name"]))


@api_view(["GET"])
def clinic_patients(request, clinic_id):
    clinic, _ = clinic_access(require_user(request), clinic_id)
    rows = build_directory(clinic)
    if q := _norm(request.query_params.get("q", "")):
        digits = "".join(c for c in q if c.isdigit())
        rows = [
            r
            for r in rows
            if q in _norm(r["name"]) or any(q in _norm(n) for n in r["name_variants"]) or (len(digits) >= 4 and digits in (r["phone"] or ""))
        ]
    return Response(rows[:200])


def _walk_ins(clinic, phone: str):
    return Appointment.objects.filter(doctor__clinic_memberships__clinic=clinic, patient__isnull=True).filter(
        external_patient_phone__in=_phone_variants(clinic, phone)
    )


def _phone_variants(clinic, phone: str) -> list[str]:
    """Numéros tels que saisis (« 77 123 45 67 », « +221771234567 »…) correspondant au numéro normalisé."""
    raw = Appointment.objects.filter(doctor__clinic_memberships__clinic=clinic, patient__isnull=True).values_list("external_patient_phone", flat=True)
    return sorted({p for p in raw if normalize_phone(p) == phone})


@api_view(["POST"])
def unify_name(request, clinic_id):
    """Doublons sans compte : même numéro, orthographes différentes → un seul nom."""
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    data = body(request)
    phone = normalize_phone(get_str(data, "phone", required=True, max_len=30))
    name = get_str(data, "name", required=True, min_len=2, max_len=120)
    if not phone:
        raise ApiError("Numéro invalide")
    updated = _walk_ins(clinic, phone).update(external_patient_name=name)
    if not updated:
        raise not_found("Aucun rendez-vous pour ce numéro")
    return Response({"updated": updated})


@api_view(["POST"])
def link_to_account(request, clinic_id):
    """Rattache les RDV pris au guichet au compte Fajma du patient (numéro vérifié identique)."""
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    phone = normalize_phone(get_str(body(request), "phone", required=True, max_len=30))
    if not phone:
        raise ApiError("Numéro invalide")
    row = next((r for r in build_directory(clinic) if r["phone"] == phone and not r["registered"]), None)
    if not row or not row["matching_account"]:
        raise ApiError("Aucun compte patient correspondant parmi les patients de la clinique")
    account = User.objects.get(id=row["matching_account"]["patient_id"])
    with transaction.atomic():
        updated = _walk_ins(clinic, phone).update(patient=account, external_patient_name="", external_patient_phone="")
    audit.log(request, "admin_verification", patient=account, kind="walk_in_linked", clinic=str(clinic.id), appointments=updated)
    notify(
        account,
        kind="clinic_link",
        title=f"{updated} rendez-vous ajoutés à votre espace",
        body=f"Les rendez-vous pris au secrétariat de {clinic.name} apparaissent maintenant dans votre espace.",
        link="/mon-espace",
    )
    return Response({"updated": updated, "patient_id": str(account.id)})


def clinic_patient(clinic, patient_id) -> User:
    """Patient inscrit déjà connu de la clinique (utilisé pour la réservation au guichet)."""
    if not _clinic_appointments(clinic).filter(patient_id=patient_id).exists():
        raise not_found("Patient introuvable dans le fichier de la clinique")
    return User.objects.get(id=patient_id)
