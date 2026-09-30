"""Dossier médical : documents déposés, comptes-rendus, ordonnances et vérification publique."""

import logging
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import User
from audit import log as audit
from appointments.models import Appointment
from appointments.views import my_doctor
from notifications.service import notify
from sunusante.uploads import decode_upload, serve, store
from sunusante.api import ApiError, ScopedThrottle, body, forbidden, get_choice, get_str, get_uuid, iso, not_found, require_user

from directory.models import Doctor

from care.views import measurements_for_doctor
from labs.views import orders_for_doctor

from .prescriptions import create_prescription, prescription_dict
from .models import DocumentShare, HealthProfile, MedicalDocument, MedicalRecord, PatientNote, PatientRecall, Prescription

logger = logging.getLogger(__name__)


class PublicLookupThrottle(ScopedThrottle):
    scope = "public_lookup"


def _storage_path(relative: str) -> Path:
    root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
    path = (root / relative).resolve()
    if root not in path.parents:
        raise forbidden()
    return path


def doctor_can_see_patient(user, patient_id) -> bool:
    """
    Un médecin n'accède au dossier que s'il a un rendez-vous confirmé ou terminé avec le patient,
    comme titulaire ou comme remplaçant qui assure ce rendez-vous.
    """
    return Appointment.objects.filter(
        Q(doctor__user=user) | Q(practitioner__user=user), patient_id=patient_id, status__in=("confirmed", "completed")
    ).exists()


# ── Documents ────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
def my_documents(request):
    user = require_user(request)
    if request.method == "GET":
        return Response(
            [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "category": d.category,
                    "mime_type": d.mime_type or None,
                    "size_bytes": d.size_bytes,
                    "created_at": iso(d.created_at),
                    "file_path": d.file_path,
                    "shared_with": [{"doctor_id": str(s.doctor_id), "doctor_name": s.doctor.full_name} for s in d.shares.all()],
                }
                for d in MedicalDocument.objects.filter(patient=user).prefetch_related("shares__doctor")
            ]
        )
    data = body(request)
    title = get_str(data, "title", required=True, min_len=2, max_len=160)
    category = get_choice(data, "category", {"analyse", "imagerie", "ordonnance", "autre"}, default="autre")
    # Type réel déduit du contenu (PDF ou image) : le type annoncé par le navigateur est ignoré.
    content, mime_type, safe_name = decode_upload(data)
    relative = store(str(user.id), safe_name, content)
    MedicalDocument.objects.create(
        patient=user, uploaded_by=user, title=title, category=category, file_path=relative, mime_type=mime_type, size_bytes=len(content)
    )
    return Response({"ok": True})


@api_view(["POST"])
def document_url(request, document_id):
    user = require_user(request)
    doc = MedicalDocument.objects.filter(id=document_id).first()
    if not doc or not can_read_document(user, doc):
        raise not_found("Document introuvable")
    return Response({"url": f"/api/documents/{doc.id}/download"})


@api_view(["GET"])
def download_document(request, document_id):
    user = require_user(request)
    doc = MedicalDocument.objects.filter(id=document_id).first()
    if not doc or not can_read_document(user, doc):
        raise not_found("Document introuvable")
    path = _storage_path(doc.file_path)
    if not path.exists():
        raise not_found("Fichier introuvable")
    if doc.patient_id != user.id:
        audit.log(request, "document_viewed", patient=doc.patient, target=doc)
    return serve(doc.file_path, doc.mime_type)


@api_view(["POST"])
def delete_document(request, document_id):
    user = require_user(request)
    doc = MedicalDocument.objects.filter(id=document_id, patient=user).first()
    if not doc:
        raise not_found("Document introuvable")
    path = _storage_path(doc.file_path)
    doc.delete()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # Fichier encore ouvert (Windows) : l'entrée est supprimée, le fichier orphelin sera purgé plus tard.
        logger.warning("Suppression différée du fichier %s", doc.file_path)
    return Response({"ok": True})


# ── Compte-rendu et ordonnance (médecin) ─────────────────────────────


@api_view(["POST"])
@transaction.atomic
def save_consultation_record(request, appointment_id):
    user = require_user(request)
    doctor = my_doctor(user)
    appt = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id)
        .select_related("patient", "relative", "location", "doctor")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if not appt.patient_id:
        raise ApiError("Le dossier en ligne est réservé aux patients inscrits sur Fajma")
    data = body(request)
    _, created = MedicalRecord.objects.update_or_create(
        appointment=appt,
        defaults={
            "patient_id": appt.patient_id,
            "doctor": doctor,
            "summary": get_str(data, "summary", required=True, min_len=2, max_len=3000),
            "diagnosis": get_str(data, "diagnosis", max_len=2000) or "",
            "treatment": get_str(data, "treatment", max_len=3000) or "",
        },
    )
    audit.log(request, "record_written", patient=appt.patient, target=appt)
    prescription = create_prescription(appt, doctor, data)
    who = f" pour {appt.relative.full_name}" if appt.relative else ""
    if prescription:
        notify(appt.patient, kind="prescription", title=f"Nouvelle ordonnance{who}",
               body=f"{doctor.full_name} — à retrouver dans votre dossier, à envoyer à votre pharmacie en un clic.", link="/dossier", sms=True)
    elif created:
        notify(appt.patient, kind="record", title=f"Compte-rendu de consultation{who}", body=doctor.full_name, link="/dossier")
    return Response({"ok": True, "prescription_id": str(prescription.id) if prescription else None})


def _prescription_for(user, prescription_id) -> Prescription:
    p = (
        Prescription.objects.filter(Q(patient=user) | Q(doctor__user=user) | Q(appointment__doctor__user=user), id=prescription_id)
        .select_related("doctor__specialty", "patient", "relative")
        .first()
    )
    if not p:
        raise not_found("Ordonnance introuvable")
    return p


@api_view(["GET"])
def get_prescription(request, prescription_id):
    user = require_user(request)
    p = _prescription_for(user, prescription_id)
    if p.patient_id != user.id:
        audit.log(request, "prescription_viewed", patient=p.patient, target=p)
    return Response(prescription_dict(p))


@api_view(["POST"])
@throttle_classes([PublicLookupThrottle])
def verify_prescription(request):
    """Vérification publique (QR code) : jamais de contenu médical ni d'identité du patient."""
    reference = (get_str(body(request), "reference", required=True, min_len=4, max_len=40) or "").upper()
    if reference.startswith("DOC-"):
        from .issued import verify_issued

        return Response(verify_issued(reference) or {"valid": False})
    p = Prescription.objects.filter(reference=reference).select_related("doctor__specialty").first()
    if not p:
        return Response({"valid": False})
    issuer = p.issuer or {}
    return Response(
        {
            "valid": True,
            "expired": bool(p.valid_until and p.valid_until < timezone.localdate()),
            "reference": p.reference,
            "created_at": iso(p.created_at),
            "valid_until": p.valid_until.isoformat() if p.valid_until else None,
            "doctor_name": p.doctor.full_name,
            "doctor_specialty": p.doctor.specialty.name if p.doctor.specialty else None,
            "doctor_city": issuer.get("city") or p.doctor.city,
            # Le pharmacien peut contrôler l'inscription à l'Ordre et le lieu d'exercice.
            "doctor_order_number": issuer.get("order_number") or p.doctor.order_number or None,
            "replacing": issuer.get("replacing") or None,
            "practice_name": issuer.get("practice_name") or p.doctor.practice_name or None,
            "renewals": p.renewals,
        }
    )


# ── Profil de santé (patient) ────────────────────────────────────────

HEALTH_FIELDS = {"allergies": 2000, "conditions": 2000, "treatments": 2000, "vaccinations": 2000, "emergency_contact": 160}


def health_profile_dict(hp: HealthProfile | None) -> dict:
    return {
        "blood_group": hp.blood_group if hp else "",
        **{f: getattr(hp, f) if hp else "" for f in HEALTH_FIELDS},
        "updated_at": iso(hp.updated_at) if hp else None,
    }


@api_view(["GET", "POST"])
def my_health_profile(request):
    user = require_user(request)
    hp = HealthProfile.objects.filter(user=user).first()
    if request.method == "POST":
        data = body(request)
        hp = hp or HealthProfile(user=user)
        hp.blood_group = get_choice(data, "blood_group", {"", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}, default="") or ""
        for field, max_len in HEALTH_FIELDS.items():
            setattr(hp, field, get_str(data, field, max_len=max_len) or "")
        hp.save()
    return Response(health_profile_dict(hp))


# ── Fiche patient (médecin) ──────────────────────────────────────────


@api_view(["GET", "POST"])
def patient_file(request, patient_id):
    """Fiche patient : profil de santé, historique des RDV, comptes-rendus, notes privées du médecin."""
    user = require_user(request)
    doctor = my_doctor(user)
    if not doctor_can_see_patient(user, patient_id):
        raise not_found("Patient introuvable")
    patient = User.objects.filter(id=patient_id).first()
    if not patient:
        raise not_found("Patient introuvable")
    if request.method == "POST":
        PatientNote.objects.create(doctor=doctor, patient=patient, content=get_str(body(request), "content", required=True, max_len=4000))
    else:
        audit.log(request, "patient_file_viewed", patient=patient)
    from directory.replacements import covered_titulars

    # Continuité des soins : le titulaire lit ce qu'a écrit son remplaçant pour ses patients, et le remplaçant
    # lit, pendant le remplacement, le dossier tenu par le titulaire.
    titulars = covered_titulars(doctor)
    authored = Q(doctor=doctor) | Q(appointment__doctor=doctor) | Q(doctor_id__in=titulars)
    appointments = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor) | Q(doctor_id__in=titulars), patient=patient)
        .select_related("consultation_type", "relative", "doctor", "practitioner")
        .order_by("-scheduled_at")
    )
    return Response(
        {
            "patient": {"id": str(patient.id), "full_name": patient.full_name, "phone": patient.phone or None, "city": patient.city or None, "email": patient.email},
            "health_profile": health_profile_dict(HealthProfile.objects.filter(user=patient).first()),
            "appointments": [
                {
                    "id": str(a.id),
                    "scheduled_at": iso(a.scheduled_at),
                    "status": a.status,
                    "mode": a.mode,
                    "reason": a.reason or None,
                    "consultation_type": a.consultation_type.name if a.consultation_type else None,
                    "relative": a.relative.full_name if a.relative else None,
                    "seen_by": (a.practitioner or a.doctor).full_name if (a.practitioner or a.doctor) != doctor else None,
                }
                for a in appointments
            ],
            "records": [
                {
                    "id": str(r.id),
                    "created_at": iso(r.created_at),
                    "summary": r.summary,
                    "diagnosis": r.diagnosis or None,
                    "treatment": r.treatment or None,
                    "author": r.doctor.full_name if r.doctor_id != doctor.id else None,
                }
                for r in MedicalRecord.objects.filter(authored, patient=patient).select_related("doctor").distinct()
            ],
            # Ordonnances délivrées par ce médecin (relecture, réimpression, renouvellement).
            "prescriptions": [
                {
                    "id": str(p.id),
                    "reference": p.reference,
                    "created_at": iso(p.created_at),
                    "content": p.content,
                    "valid_until": p.valid_until.isoformat() if p.valid_until else None,
                    "renewals": p.renewals,
                    "for_relative": p.relative.full_name if p.relative else None,
                    "author": p.doctor.full_name if p.doctor_id != doctor.id else None,
                }
                for p in Prescription.objects.filter(authored, patient=patient).select_related("relative", "doctor").distinct()
            ],
            "documents": [
                {"id": str(d.id), "title": d.title, "category": d.category, "created_at": iso(d.created_at)}
                for d in MedicalDocument.objects.filter(
                    Q(shares__doctor=doctor) | Q(shares__doctor_id__in=titulars), patient=patient
                ).distinct()
            ],
            "recalls": [
                {"id": str(r.id), "due_date": r.due_date.isoformat(), "message": r.message, "sent": r.sent_at is not None}
                for r in PatientRecall.objects.filter(doctor=doctor, patient=patient)
            ],
            "notes": [{"id": str(n.id), "content": n.content, "created_at": iso(n.created_at)} for n in PatientNote.objects.filter(doctor=doctor, patient=patient)],
            # Mesures à domicile (tension, glycémie, poids) et analyses prescrites par ce médecin.
            "measurements": measurements_for_doctor(patient),
            "lab_orders": orders_for_doctor(doctor, patient),
            "stats": {
                "total": appointments.count(),
                "no_show": appointments.filter(status="no_show").count(),
                "completed": appointments.filter(status="completed").count(),
            },
        }
    )


def can_read_document(user, doc: MedicalDocument) -> bool:
    """Le patient lit ses documents ; un médecin seulement ceux qu'il lui a partagés (et s'il le suit)."""
    if doc.patient_id == user.id:
        return True
    if DocumentShare.objects.filter(document=doc, doctor__user=user).exists() and doctor_can_see_patient(user, doc.patient_id):
        return True
    # Remplaçant : documents partagés avec le titulaire qu'il remplace, pour un patient qu'il reçoit.
    doctor = Doctor.objects.filter(user=user).first()
    if doctor and doctor_can_see_patient(user, doc.patient_id):
        from directory.replacements import covered_titulars

        titulars = covered_titulars(doctor)
        if titulars and DocumentShare.objects.filter(document=doc, doctor_id__in=titulars).exists():
            return True
    # Confrère sollicité en télé-expertise : uniquement les documents joints à la demande.
    from expertise.models import ExpertiseRequest

    return ExpertiseRequest.objects.filter(documents=doc, expert__user=user).exists()


@api_view(["GET"])
def share_targets(request):
    """Médecins avec qui le patient peut partager des documents (ceux qu'il a consultés ou va consulter)."""
    user = require_user(request)
    # Médecins consultés, y compris un remplaçant qui a assuré (ou assurera) un rendez-vous.
    doctors = (
        Doctor.objects.filter(Q(appointments__patient=user) | Q(replacement_appointments__patient=user))
        .distinct()
        .select_related("specialty")
    )
    return Response([{"id": str(d.id), "full_name": d.full_name, "specialty": d.specialty.name if d.specialty else None} for d in doctors])


@api_view(["POST"])
def share_document(request, document_id):
    user = require_user(request)
    doc = MedicalDocument.objects.filter(id=document_id, patient=user).first()
    if not doc:
        raise not_found("Document introuvable")
    data = body(request)
    doctor = (
        Doctor.objects.filter(Q(appointments__patient=user) | Q(replacement_appointments__patient=user), id=get_uuid(data, "doctor_id"))
        .distinct()
        .first()
    )
    if not doctor:
        raise ApiError("Vous ne pouvez partager qu'avec un médecin que vous consultez")
    if data.get("shared") is False:
        DocumentShare.objects.filter(document=doc, doctor=doctor).delete()
    else:
        DocumentShare.objects.get_or_create(document=doc, doctor=doctor)
    return Response({"ok": True})


@api_view(["POST"])
def add_recall(request, patient_id):
    """Le médecin programme un rappel (vaccin, contrôle annuel…) pour un patient qu'il suit."""
    from datetime import date

    user = require_user(request)
    doctor = my_doctor(user)
    if not doctor_can_see_patient(user, patient_id):
        raise not_found("Patient introuvable")
    data = body(request)
    try:
        due = date.fromisoformat(data.get("due_date") or "")
    except ValueError as err:
        raise ApiError("Date invalide") from err
    if due <= timezone.localdate():
        raise ApiError("La date du rappel doit être dans le futur")
    PatientRecall.objects.create(doctor=doctor, patient_id=patient_id, due_date=due, message=get_str(data, "message", required=True, min_len=3, max_len=300))
    return Response({"ok": True})


@api_view(["POST"])
def delete_recall(request, recall_id):
    doctor = my_doctor(require_user(request))
    deleted, _ = PatientRecall.objects.filter(id=recall_id, doctor=doctor).delete()
    if not deleted:
        raise not_found("Rappel introuvable")
    return Response({"ok": True})
