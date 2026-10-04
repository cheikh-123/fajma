"""
Dossier médical complet du patient, pour l'export en PDF (« Télécharger mon dossier ») : identité, profil de
santé, comptes-rendus, ordonnances, certificats, analyses, mesures à domicile, vaccins et liste des documents.
Uniquement les données du titulaire du compte et de ses proches ; chaque export est journalisé.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from audit import log as audit
from sunusante.api import iso, require_user

from .models import HealthProfile, IssuedDocument, MedicalDocument, MedicalRecord, Prescription
from .prescriptions import items_text


def _vaccine_names() -> dict[str, str]:
    from carnet import schedules

    names: dict[str, str] = {}
    for value in vars(schedules).values():
        if isinstance(value, list):
            for dose in value:
                if isinstance(dose, schedules.Dose):
                    names[dose.code] = dose.name
    return names


def _for(obj) -> str | None:
    return obj.relative.full_name if getattr(obj, "relative_id", None) else None


@api_view(["GET"])
def my_medical_record(request):
    from care.logic import assess
    from care.models import Measurement
    from carnet.models import VaccineDose
    from labs.models import LabOrder

    user = require_user(request)
    hp = HealthProfile.objects.filter(user=user).first()
    records = MedicalRecord.objects.filter(patient=user).select_related("doctor__specialty", "appointment__relative").order_by("-appointment__scheduled_at")
    prescriptions = Prescription.objects.filter(patient=user).select_related("doctor", "relative")
    issued = IssuedDocument.objects.filter(patient=user).select_related("doctor", "relative").order_by("-created_at")
    labs = LabOrder.objects.filter(patient=user).select_related("doctor", "relative", "laboratory").order_by("-created_at")
    since = timezone.now() - timedelta(days=183)
    measurements = Measurement.objects.filter(patient=user, measured_at__gte=since).select_related("relative")[:60]
    vaccine_names = _vaccine_names()
    doses = VaccineDose.objects.filter(owner=user).select_related("relative").order_by("given_on")

    data = {
        "generated_at": timezone.now().isoformat(),
        "patient": {
            "full_name": user.full_name,
            "birth_date": user.birth_date.isoformat() if user.birth_date else None,
            "sex": user.sex or None,
            "phone": user.phone or None,
            "email": user.email or None,
            "city": user.city or None,
        },
        "relatives": [
            {"full_name": r.full_name, "relationship": r.get_relationship_display(), "birth_date": r.birth_date.isoformat() if r.birth_date else None}
            for r in user.relatives.all()
        ],
        "health_profile": {
            "blood_group": hp.blood_group or None,
            "allergies": hp.allergies or None,
            "conditions": hp.conditions or None,
            "treatments": hp.treatments or None,
            "vaccinations": hp.vaccinations or None,
            "emergency_contact": hp.emergency_contact or None,
        }
        if hp
        else None,
        "records": [
            {
                "date": iso(r.appointment.scheduled_at),
                "doctor": r.doctor.full_name,
                "specialty": r.doctor.specialty.name if r.doctor.specialty else None,
                "for": r.appointment.relative.full_name if r.appointment.relative_id else None,
                "summary": r.summary,
                "diagnosis": r.diagnosis or None,
                "treatment": r.treatment or None,
            }
            for r in records
        ],
        "prescriptions": [
            {
                "date": iso(p.created_at),
                "reference": p.reference,
                "doctor": p.doctor.full_name,
                "for": _for(p),
                "content": items_text(p.items) if p.items else p.content,
                "instructions": p.instructions or None,
                "valid_until": p.valid_until.isoformat() if p.valid_until else None,
            }
            for p in prescriptions
        ],
        "issued_documents": [
            {
                "date": iso(d.created_at),
                "kind": d.get_kind_display(),
                "reference": d.reference,
                "doctor": d.doctor.full_name,
                "for": _for(d),
                "start_date": d.start_date.isoformat() if d.start_date else None,
                "end_date": d.end_date.isoformat() if d.end_date else None,
            }
            for d in issued
        ],
        "lab_orders": [
            {
                "date": iso(o.created_at),
                "reference": o.reference,
                "doctor": o.doctor.full_name,
                "for": _for(o),
                "tests": o.tests,
                "status": o.get_status_display(),
                "laboratory": o.laboratory.name if o.laboratory_id else None,
                "result_note": o.result_note or None,
                "completed_at": iso(o.completed_at) if o.completed_at else None,
            }
            for o in labs
        ],
        "measurements": [
            {
                "date": iso(m.measured_at),
                "kind": m.get_kind_display(),
                "for": _for(m),
                "systolic": m.systolic,
                "diastolic": m.diastolic,
                "pulse": m.pulse,
                "value": m.value,
                "context": m.context or None,
                "level": assess(m.kind, m.systolic, m.diastolic, m.value, m.context)[0],
            }
            for m in measurements
        ],
        "vaccines": [
            {
                "date": d.given_on.isoformat(),
                "vaccine": vaccine_names.get(d.vaccine_code, d.vaccine_code),
                "for": _for(d),
                "verified": d.recorded_by_doctor_id is not None,
            }
            for d in doses
        ],
        "documents": [
            {"date": iso(d.created_at), "title": d.title, "category": d.get_category_display()}
            for d in MedicalDocument.objects.filter(patient=user).order_by("-created_at")
        ],
    }
    audit.log(request, "medical_record_exported", patient=user)
    return Response(data)
