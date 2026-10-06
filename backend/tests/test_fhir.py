"""
Export du dossier au format HL7 FHIR R4 : contenu, codes internationaux (CIM-10, LOINC) et cloisonnement
(on n'exporte que son propre dossier et celui de ses proches).
"""

from datetime import date, timedelta

from accounts.models import Relative
from care.models import Measurement
from carnet.models import VaccineDose
from django.utils import timezone
from labs.models import LabOrder
from medical.models import HealthProfile, MedicalRecord, Prescription

from .test_security import ApiTestCase


class FhirExportTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.child = Relative.objects.create(owner=self.p1, full_name="Awa Diop", relationship="enfant",
                                             birth_date=date(2019, 5, 2), sex="F")
        HealthProfile.objects.create(user=self.p1, allergies="Pénicilline (œdème)", blood_group="O+")
        res = self.book(self.p1)
        self.appt_id = res.data["id"]
        self.set_appointment(self.appt_id, status="completed", scheduled_at=self.slot - timedelta(days=5))
        from appointments.models import Appointment

        self.appt = Appointment.objects.get(id=self.appt_id)
        MedicalRecord.objects.create(appointment=self.appt, patient=self.p1, doctor=self.doctor,
                                     summary="Fièvre depuis 3 jours", condition_code="paludisme",
                                     condition_status="confirmed")
        Prescription.objects.create(appointment=self.appt, patient=self.p1, doctor=self.doctor,
                                    content="x", items=[{"name": "Coartem", "dosage": "20/120 mg",
                                                         "posology": "4 cp matin et soir, 3 jours"}],
                                    valid_until=date.today() + timedelta(days=30))
        LabOrder.objects.create(doctor=self.doctor, patient=self.p1, tests="Goutte épaisse",
                                status="completed", completed_at=timezone.now(), result_note="Positif")
        Measurement.objects.create(patient=self.p1, kind="blood_pressure", systolic=145, diastolic=92,
                                   pulse=80, measured_at=timezone.now())
        Measurement.objects.create(patient=self.p1, kind="glucose", value=1.35, context="fasting",
                                   measured_at=timezone.now())
        VaccineDose.objects.create(owner=self.p1, relative=self.child, vaccine_code="bcg", given_on=date(2019, 5, 3))

    def bundle(self, user=None):
        res = self.client_for(user or self.p1).get("/api/patient/medical-record/fhir")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def kinds(self, bundle):
        return [e["resource"]["resourceType"] for e in bundle["entry"]]

    def first(self, bundle, kind):
        return next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == kind)

    def test_structure_du_bundle(self):
        b = self.bundle()
        self.assertEqual(b["resourceType"], "Bundle")
        self.assertEqual(b["type"], "collection")
        self.assertTrue(b["timestamp"])
        present = set(self.kinds(b))
        for kind in ("Patient", "RelatedPerson", "Practitioner", "Encounter", "Condition",
                     "MedicationRequest", "AllergyIntolerance", "Observation", "ServiceRequest",
                     "DiagnosticReport", "Immunization"):
            self.assertIn(kind, present, kind)
        # Chaque entrée a une URL et une ressource identifiée
        for e in b["entry"]:
            self.assertTrue(e["fullUrl"].startswith("urn:uuid:"))
            self.assertTrue(e["resource"]["id"])

    def test_identite_et_proche(self):
        b = self.bundle()
        patient = self.first(b, "Patient")
        self.assertEqual(patient["name"][0]["text"], self.p1.full_name)
        related = self.first(b, "RelatedPerson")
        self.assertEqual(related["name"][0]["text"], "Awa Diop")
        self.assertEqual(related["gender"], "female")
        self.assertEqual(related["birthDate"], "2019-05-02")
        self.assertTrue(related["patient"]["reference"].startswith("Patient/"))

    def test_diagnostic_code_cim10(self):
        cond = self.first(self.bundle(), "Condition")
        systems = {c["system"]: c["code"] for c in cond["code"]["coding"]}
        self.assertEqual(systems["http://hl7.org/fhir/sid/icd-10"], "B54")  # paludisme
        self.assertEqual(cond["verificationStatus"]["coding"][0]["code"], "confirmed")

    def test_mesures_avec_codes_loinc(self):
        b = self.bundle()
        observations = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "Observation"]
        tension = next(o for o in observations if o["code"]["text"] == "Pression artérielle")
        values = {c["code"]["coding"][0]["code"]: c["valueQuantity"]["value"] for c in tension["component"]}
        self.assertEqual(values["8480-6"], 145)
        self.assertEqual(values["8462-4"], 92)
        self.assertEqual(values["8867-4"], 80)
        glycemie = next(o for o in observations if o["code"]["text"] == "Glycémie")
        self.assertEqual(glycemie["valueQuantity"], {"value": 1.35, "unit": "g/L"})
        self.assertEqual(glycemie["code"]["coding"][0]["code"], "2339-0")

    def test_ordonnance_et_analyses(self):
        b = self.bundle()
        rx = self.first(b, "MedicationRequest")
        self.assertIn("Coartem", rx["medicationCodeableConcept"]["text"])
        self.assertIn("4 cp", rx["dosageInstruction"][0]["text"])
        self.assertEqual(rx["status"], "active")
        report = self.first(b, "DiagnosticReport")
        self.assertEqual(report["conclusion"], "Positif")
        self.assertTrue(report["basedOn"][0]["reference"].startswith("ServiceRequest/"))

    def test_vaccin_rattache_au_proche(self):
        b = self.bundle()
        vaccin = self.first(b, "Immunization")
        self.assertEqual(vaccin["vaccineCode"]["coding"][0]["code"], "bcg")
        self.assertTrue(vaccin["patient"]["reference"].startswith("RelatedPerson/"))

    def test_cloisonnement(self):
        """Le dossier d'un autre patient n'apparaît jamais, et il faut être connecté."""
        b = self.bundle(self.p2)
        self.assertEqual(self.kinds(b).count("Patient"), 1)
        self.assertEqual(self.first(b, "Patient")["name"][0]["text"], self.p2.full_name)
        for e in b["entry"]:
            self.assertNotIn("Coartem", str(e))
        self.assertEqual(self.client.get("/api/patient/medical-record/fhir").status_code, 403)

    def test_export_journalise(self):
        from audit.models import AuditEvent

        self.bundle()
        event = AuditEvent.objects.filter(action="data_exported", actor=self.p1).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.metadata.get("format"), "fhir")
