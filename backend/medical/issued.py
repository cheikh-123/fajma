"""Documents médicaux rédigés par le médecin : certificats, arrêts de travail, courriers."""

from datetime import date, timedelta

from django.conf import settings
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, get_choice, get_str, iso, not_found, require_user

from .issuer import issuer_public, issuer_snapshot, missing_mentions, require_started
from .models import IssuedDocument

MAX_SICK_LEAVE_DAYS = 180
BACKDATE_DAYS = 2  # un arrêt ne peut pas commencer plus de 2 jours avant la consultation


def _date(data, key) -> date | None:
    raw = data.get(key)
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError as err:
        raise ApiError("Date invalide") from err


def issued_dict(d: IssuedDocument) -> dict:
    doctor = d.doctor
    return {
        "id": str(d.id),
        "kind": d.kind,
        "kind_label": d.get_kind_display(),
        "reference": d.reference,
        "body": d.body,
        "start_date": d.start_date.isoformat() if d.start_date else None,
        "end_date": d.end_date.isoformat() if d.end_date else None,
        "recipient": d.recipient or None,
        "created_at": iso(d.created_at),
        "subject_name": d.subject_name,
        "subject_birth_date": d.relative.birth_date.isoformat() if d.relative and d.relative.birth_date else None,
        "doctor": {
            "full_name": doctor.full_name,
            "specialty": doctor.specialty.name if doctor.specialty else None,
            "address": doctor.address or None,
            "city": doctor.city,
        },
        "issuer": issuer_public(d.issuer, doctor),
        "verify_url": f"{settings.PUBLIC_SITE_URL}/verifier/{d.reference}",
    }


@api_view(["POST"])
def issue_document(request, appointment_id):
    doctor = my_doctor(require_user(request))
    appt = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id, status__in=("confirmed", "completed"))
        .exclude(patient=None)
        .select_related("patient", "relative", "location", "doctor")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable (il doit être confirmé ou terminé, avec un patient inscrit)")
    require_started(appt)
    missing = missing_mentions(doctor)
    if missing:
        raise ApiError("Avant de délivrer un document, complétez dans « Ordonnances : en-tête et signature » : " + ", ".join(missing) + ".")
    data = body(request)
    kind = get_choice(data, "kind", {k for k, _ in IssuedDocument.KINDS})
    text = get_str(data, "body", max_len=4000) or ""
    start, end = _date(data, "start_date"), _date(data, "end_date")
    recipient = get_str(data, "recipient", max_len=120) or ""
    if kind == "arret_travail":
        if not start or not end:
            raise ApiError("Indiquez le début et la fin de l'arrêt")
        if end < start or (end - start).days + 1 > MAX_SICK_LEAVE_DAYS:
            raise ApiError(f"Période d'arrêt invalide (au plus {MAX_SICK_LEAVE_DAYS} jours)")
        if start < appt.scheduled_at.date() - timedelta(days=BACKDATE_DAYS):
            raise ApiError(f"Un arrêt ne peut pas débuter plus de {BACKDATE_DAYS} jours avant la consultation")
    else:
        start = end = None
        if len(text) < 10:
            raise ApiError("Rédigez le contenu du document")
    if kind == "courrier" and not recipient:
        raise ApiError("Indiquez le destinataire du courrier")
    doc = IssuedDocument.objects.create(
        appointment=appt,
        patient=appt.patient,
        relative=appt.relative,
        doctor=doctor,
        kind=kind,
        body=text,
        start_date=start,
        end_date=end,
        recipient=recipient if kind == "courrier" else "",
        issuer=issuer_snapshot(doctor, appt),
    )
    audit.log(request, "record_written", patient=appt.patient, target=doc, kind=kind)
    return Response(issued_dict(doc))


def _issued_qs(user):
    # Le titulaire voit aussi les documents rédigés par son remplaçant pour ses patients.
    return IssuedDocument.objects.filter(Q(patient=user) | Q(doctor__user=user) | Q(appointment__doctor__user=user)).select_related(
        "doctor__specialty", "patient", "relative"
    )


@api_view(["GET"])
def my_issued_documents(request):
    user = require_user(request)
    return Response([issued_dict(d) for d in _issued_qs(user).filter(patient=user)])


@api_view(["GET"])
def get_issued_document(request, document_id):
    user = require_user(request)
    doc = _issued_qs(user).filter(id=document_id).first()
    if not doc:
        raise not_found("Document introuvable")
    return Response(issued_dict(doc))


def verify_issued(reference: str) -> dict | None:
    """Vérification publique : nature, dates et médecin. Ni contenu médical, ni nom complet du patient."""
    doc = IssuedDocument.objects.filter(reference=reference).select_related("doctor__specialty", "patient", "relative").first()
    if not doc:
        return None
    initials = " ".join(f"{part[0]}." for part in doc.subject_name.split()[:3] if part)
    return {
        "valid": True,
        "document": doc.get_kind_display(),
        "reference": doc.reference,
        "created_at": iso(doc.created_at),
        "start_date": doc.start_date.isoformat() if doc.start_date else None,
        "end_date": doc.end_date.isoformat() if doc.end_date else None,
        "patient_initials": initials,
        "doctor_name": doc.doctor.full_name,
        "doctor_specialty": doc.doctor.specialty.name if doc.doctor.specialty else None,
        "doctor_city": (doc.issuer or {}).get("city") or doc.doctor.city,
        "doctor_order_number": (doc.issuer or {}).get("order_number") or doc.doctor.order_number or None,
        "replacing": (doc.issuer or {}).get("replacing") or None,
        "practice_name": (doc.issuer or {}).get("practice_name") or doc.doctor.practice_name or None,
    }
