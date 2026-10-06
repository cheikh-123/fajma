"""
Export du dossier au format **HL7 FHIR R4** : le langage que parlent les logiciels hospitaliers, les
systèmes nationaux et les autres applications de santé. C'est ce qui permet à un patient de quitter Fajma
avec un dossier réellement réutilisable ailleurs, et à un hôpital de recevoir le dossier d'un patient sans
ressaisie.

Portée : les données du titulaire du compte et de ses proches, celles-là seules. Chaque export est
journalisé comme les autres sorties de données.

Ressources produites (profil « Bundle » de type collection) :
- Patient, RelatedPerson : identité du titulaire et de ses proches ;
- Practitioner : les médecins cités ;
- Encounter : les consultations ;
- Condition : les diagnostics codés (CIM-10, voir medical/conditions.py) ;
- MedicationRequest : les lignes d'ordonnance ;
- AllergyIntolerance : les allergies déclarées ;
- Observation : les mesures à domicile (tension, glycémie, poids…) ;
- ServiceRequest et DiagnosticReport : analyses et imagerie, et leurs résultats ;
- Immunization : les vaccins du carnet.

Aucune pièce jointe n'est incluse : les documents restent chiffrés et se téléchargent séparément.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from audit import log as audit
from sunusante.api import require_user

from .conditions import BY_CODE as CONDITIONS
from .models import HealthProfile, MedicalRecord, Prescription
from .record_export import _vaccine_names

FHIR_VERSION = "4.0.1"
SYSTEM_ICD10 = "http://hl7.org/fhir/sid/icd-10"
SYSTEM_FAJMA = "https://fajma.sn/fhir"
SEX = {"F": "female", "M": "male"}
# LOINC : codes universels des mesures, reconnus par tous les logiciels de santé.
MEASURE_CODES = {
    "blood_pressure": ("85354-9", "Pression artérielle", ""),
    "glucose": ("2339-0", "Glycémie", "g/L"),
    "weight": ("29463-7", "Poids", "kg"),
}


def _id(prefix: str, value) -> str:
    return f"{prefix}-{value}"


def _when(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _person(obj, resource: str, ref_id: str, extra: dict | None = None) -> dict:
    """Patient ou RelatedPerson : nom, date de naissance, sexe."""
    name = (obj.full_name or "").strip()
    parts = name.split()
    data = {
        "resourceType": resource,
        "id": ref_id,
        "name": [{"text": name, "family": parts[-1] if parts else name, "given": parts[:-1] or [name]}],
    }
    if getattr(obj, "birth_date", None):
        data["birthDate"] = obj.birth_date.isoformat()
    if getattr(obj, "sex", ""):
        data["gender"] = SEX.get(obj.sex, "unknown")
    if getattr(obj, "phone", ""):
        data["telecom"] = [{"system": "phone", "value": obj.phone}]
    return {**data, **(extra or {})}


def build_bundle(user) -> dict:
    """Dossier complet du titulaire et de ses proches, en FHIR R4."""
    from care.models import Measurement
    from carnet.models import VaccineDose
    from labs.models import LabOrder

    entries: list[dict] = []
    add = lambda res: entries.append({"fullUrl": f"urn:uuid:{res['id']}", "resource": res})  # noqa: E731

    patient_id = _id("patient", user.id)
    add(_person(user, "Patient", patient_id, {
        "identifier": [{"system": SYSTEM_FAJMA, "value": str(user.id)}],
        "address": [{"city": user.city}] if user.city else [],
    }))
    relatives = {}
    for r in user.relatives.all():
        rid = _id("related", r.id)
        relatives[r.id] = rid
        add(_person(r, "RelatedPerson", rid, {
            "patient": {"reference": f"Patient/{patient_id}"},
            "relationship": [{"text": r.get_relationship_display()}],
        }))

    def subject_of(obj) -> dict:
        """Le sujet réel : le proche soigné, ou le titulaire du compte."""
        rid = getattr(obj, "relative_id", None)
        if rid and rid in relatives:
            return {"reference": f"RelatedPerson/{relatives[rid]}", "display": obj.relative.full_name}
        return {"reference": f"Patient/{patient_id}", "display": user.full_name}

    # Médecins cités
    doctors: dict = {}

    def practitioner(doctor) -> dict:
        if doctor.id not in doctors:
            pid = _id("practitioner", doctor.id)
            doctors[doctor.id] = pid
            res = {
                "resourceType": "Practitioner", "id": pid,
                "name": [{"text": doctor.full_name}],
                "qualification": [{"code": {"text": doctor.specialty.name}}] if doctor.specialty_id else [],
            }
            if doctor.order_number:
                res["identifier"] = [{"system": "https://ordredesmedecins.sn", "value": doctor.order_number}]
            add(res)
        return {"reference": f"Practitioner/{doctors[doctor.id]}"}

    # Allergies déclarées
    hp = HealthProfile.objects.filter(user=user).first()
    if hp and hp.allergies.strip():
        add({
            "resourceType": "AllergyIntolerance", "id": _id("allergy", user.id),
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]},
            "patient": {"reference": f"Patient/{patient_id}"},
            "code": {"text": hp.allergies.strip()},
            "note": [{"text": "Déclaré par le patient"}],
        })

    # Consultations et diagnostics
    records = (
        MedicalRecord.objects.filter(patient=user)
        .select_related("doctor__specialty", "appointment__relative")
        .order_by("-created_at")[:300]
    )
    for r in records:
        appt = r.appointment
        enc_id = _id("encounter", r.id)
        add({
            "resourceType": "Encounter", "id": enc_id, "status": "finished",
            "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                      "code": "VR" if appt.mode == "teleconsultation" else "AMB",
                      "display": "Téléconsultation" if appt.mode == "teleconsultation" else "Consultation"},
            "subject": subject_of(appt),
            "participant": [{"individual": practitioner(r.doctor)}],
            "period": {"start": _when(appt.scheduled_at)},
            "reasonCode": [{"text": r.summary[:500]}] if r.summary else [],
        })
        if r.condition_code:
            cond = CONDITIONS.get(r.condition_code)
            coding = []
            if cond and cond.icd10:
                coding.append({"system": SYSTEM_ICD10, "code": cond.icd10, "display": cond.label})
            coding.append({"system": f"{SYSTEM_FAJMA}/conditions", "code": r.condition_code,
                           "display": cond.label if cond else r.condition_code})
            add({
                "resourceType": "Condition", "id": _id("condition", r.id),
                "verificationStatus": {"coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": {"confirmed": "confirmed", "probable": "provisional", "suspected": "unconfirmed"}.get(r.condition_status, "unconfirmed"),
                }]},
                "code": {"coding": coding, "text": cond.label if cond else r.condition_code},
                "subject": subject_of(appt),
                "encounter": {"reference": f"Encounter/{enc_id}"},
                "recordedDate": _when(r.created_at),
            })

    # Ordonnances : une demande par médicament
    for p in Prescription.objects.filter(patient=user).select_related("doctor", "relative").order_by("-created_at")[:200]:
        for index, item in enumerate(p.items or [{"name": p.content[:200], "posology": ""}]):
            add({
                "resourceType": "MedicationRequest", "id": _id("medication", f"{p.id}-{index}"),
                "status": "active" if (p.valid_until and p.valid_until >= timezone.localdate()) else "completed",
                "intent": "order",
                "identifier": [{"system": f"{SYSTEM_FAJMA}/prescriptions", "value": p.reference}],
                "medicationCodeableConcept": {"text": " ".join(filter(None, [item.get("name"), item.get("dosage")]))},
                "subject": subject_of(p),
                "requester": practitioner(p.doctor),
                "authoredOn": _when(p.created_at),
                "dosageInstruction": [{"text": item.get("posology") or ""}],
                "dispenseRequest": {"validityPeriod": {"end": _when(p.valid_until)}} if p.valid_until else {},
                "note": [{"text": p.instructions}] if p.instructions else [],
            })

    # Analyses et imagerie
    for o in LabOrder.objects.filter(patient=user).select_related("doctor", "relative", "laboratory").order_by("-created_at")[:200]:
        req_id = _id("servicerequest", o.id)
        add({
            "resourceType": "ServiceRequest", "id": req_id,
            "status": {"prescribed": "active", "sent": "active", "received": "active",
                       "completed": "completed", "cancelled": "revoked"}.get(o.status, "unknown"),
            "intent": "order",
            "identifier": [{"system": f"{SYSTEM_FAJMA}/lab-orders", "value": o.reference}],
            "category": [{"text": "Imagerie médicale" if o.kind == "imagerie" else "Analyses de biologie"}],
            "code": {"text": o.tests[:500]},
            "subject": subject_of(o),
            "requester": practitioner(o.doctor),
            "authoredOn": _when(o.created_at),
            "priority": "urgent" if o.urgent else "routine",
        })
        if o.status == "completed":
            add({
                "resourceType": "DiagnosticReport", "id": _id("report", o.id), "status": "final",
                "code": {"text": o.tests[:500]},
                "basedOn": [{"reference": f"ServiceRequest/{req_id}"}],
                "subject": subject_of(o),
                "effectiveDateTime": _when(o.completed_at),
                "performer": [{"display": o.laboratory.name}] if o.laboratory_id else [],
                "conclusion": o.result_note or None,
            })

    # Mesures à domicile (6 derniers mois)
    since = timezone.now() - timedelta(days=183)
    for m in Measurement.objects.filter(patient=user, measured_at__gte=since).select_related("relative").order_by("-measured_at")[:200]:
        code, label, unit = MEASURE_CODES.get(m.kind, ("", m.get_kind_display(), ""))
        res = {
            "resourceType": "Observation", "id": _id("observation", m.id), "status": "final",
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                      "code": "vital-signs"}]}],
            "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": label}] if code else [],
                     "text": label},
            "subject": subject_of(m),
            "effectiveDateTime": _when(m.measured_at),
        }
        if m.kind == "blood_pressure":
            res["component"] = [
                {"code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolique"}]},
                 "valueQuantity": {"value": m.systolic, "unit": "mm[Hg]"}},
                {"code": {"coding": [{"system": "http://loinc.org", "code": "8462-4", "display": "Diastolique"}]},
                 "valueQuantity": {"value": m.diastolic, "unit": "mm[Hg]"}},
            ]
            if m.pulse:
                res["component"].append(
                    {"code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Pouls"}]},
                     "valueQuantity": {"value": m.pulse, "unit": "/min"}})
        elif m.value is not None:
            res["valueQuantity"] = {"value": m.value, "unit": unit}
        if m.context:
            res["note"] = [{"text": m.get_context_display()}]
        add(res)

    # Vaccins
    names = _vaccine_names()
    for d in VaccineDose.objects.filter(owner=user).select_related("relative").order_by("given_on")[:200]:
        add({
            "resourceType": "Immunization", "id": _id("immunization", d.id), "status": "completed",
            "vaccineCode": {"coding": [{"system": f"{SYSTEM_FAJMA}/vaccines", "code": d.vaccine_code}],
                            "text": names.get(d.vaccine_code, d.vaccine_code)},
            "patient": subject_of(d),
            "occurrenceDateTime": _when(d.given_on),
            "performer": [{"actor": practitioner(d.recorded_by_doctor)}] if d.recorded_by_doctor_id else [],
            "note": [{"text": d.notes}] if d.notes else [],
        })

    return {
        "resourceType": "Bundle",
        "id": str(uuid.uuid4()),
        "type": "collection",
        "timestamp": timezone.now().isoformat(),
        "meta": {"profile": [f"http://hl7.org/fhir/StructureDefinition/Bundle|{FHIR_VERSION}"]},
        "entry": entries,
    }


@api_view(["GET"])
def my_record_fhir(request):
    """Dossier du patient au format FHIR R4, prêt à être repris par un autre logiciel de santé."""
    user = require_user(request)
    bundle = build_bundle(user)
    audit.log(request, "data_exported", patient=user, format="fhir", resources=len(bundle["entry"]))
    response = Response(bundle)
    response["Content-Disposition"] = 'attachment; filename="dossier-fajma-fhir.json"'
    return response
