"""
Balayage des accès croisés (IDOR / BOLA) : un autre patient, un autre médecin et un visiteur tentent chaque
route qui prend un identifiant. Toutes doivent refuser (401/403/404) et ne rien modifier.
"""

import base64
import tempfile
from datetime import date, timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Relative
from appointments.models import Appointment
from care.models import Measurement, MedicationReminder
from directory.models import Doctor
from insurance.models import Insurer, PatientCoverage
from labs.models import LabOrder
from medical.models import MedicalDocument, Prescription, PrescriptionRenewal
from payments.models import Payment

from .test_prescriptions import PNG
from .test_security import ApiTestCase

REFUSED = {401, 403, 404}


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class CrossAccessSweep(ApiTestCase):
    def setUp(self):
        super().setUp()
        # Données du patient A (p1) chez le médecin A (self.doctor).
        self.appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        self.set_appointment(self.appt.id, status="confirmed", scheduled_at=timezone.now() - timedelta(hours=1))
        self.future = Appointment.objects.get(id=self.book(self.p1, when=self.slot + timedelta(minutes=30)).data["id"])
        doc = self.client_for(self.doc_user)
        doc.post("/api/pro/prescription-header", {"order_number": "ONMS 1", "practice_name": "Cabinet", "city": "Dakar"}, format="json")
        doc.post("/api/pro/prescription-header", {"image": "signature", "content_base64": base64.b64encode(PNG).decode()}, format="json")
        rid = doc.post(f"/api/pro/appointments/{self.appt.id}/record", {"summary": "Suivi", "items": [
            {"name": "Amlodipine", "dosage": "5 mg", "posology": "1 le matin", "duration": "3 mois", "quantity": "1"}]}, format="json").data["prescription_id"]
        self.rx = Prescription.objects.get(id=rid)
        pat = self.client_for(self.p1)
        pat.post("/api/documents/", {"title": "Bilan", "file_name": "b.pdf", "content_base64": base64.b64encode(b"%PDF-1.4 x").decode()}, format="json")
        self.document = MedicalDocument.objects.get(patient=self.p1)
        self.relative = Relative.objects.create(owner=self.p1, full_name="Enfant A", relationship="enfant", birth_date=date(2020, 1, 1))
        self.measure = Measurement.objects.create(patient=self.p1, kind="weight", value=70, measured_at=timezone.now())
        self.reminder = MedicationReminder.objects.create(patient=self.p1, medicine="X", times=["08:00"], start_date=date.today())
        self.payment = Payment.objects.create(appointment=self.appt, patient=self.p1, amount=15000, status="paid", method="wave", reference="PAY-TEST1")
        self.lab = LabOrder.objects.create(doctor=self.doctor, patient=self.p1, appointment=self.appt, tests="NFS")
        self.renewal = PrescriptionRenewal.objects.create(prescription=self.rx, patient=self.p1, doctor=self.doctor)
        insurer = Insurer.objects.first() or Insurer.objects.create(slug="ipm-test", name="IPM Test", kind="ipm")
        self.coverage = PatientCoverage.objects.create(user=self.p1, insurer=insurer, member_number="123", coverage_percent=80)
        # Attaquants.
        self.p2c = self.client_for(self.p2)
        other = self.make_user("autre-doc@test.sn", "Dr Autre")
        Doctor.objects.create(user=other, full_name="Dr Autre", specialty=self.spec, city="Dakar", consultation_price=10000, is_verified=True)
        self.doc2 = self.client_for(other)
        self.anon = APIClient()

    def assert_refused(self, client, method, url, data=None, who=""):
        res = getattr(client, method)(url, data or {}, format="json")
        self.assertIn(res.status_code, REFUSED, f"{who} {method.upper()} {url} → {res.status_code} {getattr(res, 'data', '')}")

    def test_other_patient_cannot_touch_patient_a_data(self):
        a, rx, d = self.appt.id, self.rx.id, self.document.id
        for method, url, data in [
            ("post", f"/api/appointments/{self.future.id}/cancel", {}),
            ("post", f"/api/appointments/{self.future.id}/reschedule", {"scheduled_at": (self.slot + timedelta(days=7)).isoformat()}),
            ("post", f"/api/appointments/{self.future.id}/questionnaire", {"answers": {}}),
            ("get", f"/api/appointments/{a}/ics", None),
            ("get", f"/api/appointments/{a}/teleconsultation", None),
            ("post", f"/api/payments/{self.payment.id}/refresh", {}),
            ("get", f"/api/payments/{self.payment.id}/receipt", None),
            ("post", f"/api/documents/{d}/url", {}),
            ("get", f"/api/documents/{d}/download", None),
            ("post", f"/api/documents/{d}/delete", {}),
            ("post", f"/api/documents/{d}/share", {"doctor_id": str(self.doctor.id)}),
            ("get", f"/api/documents/prescriptions/{rx}", None),
            ("post", f"/api/patient/measurements/{self.measure.id}/delete", {}),
            ("post", f"/api/patient/medication-reminders/{self.reminder.id}", {"active": False}),
            ("post", f"/api/patient/relatives/{self.relative.id}/delete", {}),
            ("post", f"/api/patient/renewals/{self.renewal.id}/cancel", {}),
            ("post", "/api/patient/renewals", {"prescription_id": str(rx)}),
            ("post", f"/api/labs/orders/{self.lab.id}/send", {"laboratory_id": str(self.lab.id)}),
            ("post", f"/api/insurance/coverages/{self.coverage.id}/delete", {}),
            ("post", "/api/pharmacy/orders", {"prescription_id": str(rx), "pharmacy_id": str(self.lab.id)}),
            ("get", f"/api/pro/patients/{self.p1.id}", None),
        ]:
            self.assert_refused(self.p2c, method, url, data, "patient B")
        # Rien n'a bougé.
        self.assertEqual(Appointment.objects.get(id=self.future.id).status, "pending")
        self.assertTrue(MedicalDocument.objects.filter(id=d).exists())
        self.assertTrue(Relative.objects.filter(id=self.relative.id).exists())
        self.assertEqual(PrescriptionRenewal.objects.get(id=self.renewal.id).status, "pending")

    def test_other_doctor_cannot_act_on_doctor_a_patients(self):
        a = self.appt.id
        for method, url, data in [
            ("post", f"/api/pro/appointments/{a}/status", {"status": "cancelled"}),
            ("post", f"/api/pro/appointments/{a}/record", {"summary": "Intrusion"}),
            ("post", f"/api/pro/appointments/{a}/ai-draft", {"notes": "x" * 30}),
            ("post", f"/api/pro/appointments/{a}/arrived", {"arrived": True}),
            ("post", f"/api/pro/appointments/{a}/lab-order", {"tests": "NFS"}),
            ("post", f"/api/pro/appointments/{a}/move", {"scheduled_at": (self.slot + timedelta(days=7)).isoformat()}),
            ("post", f"/api/pro/appointments/{a}/cash-paid", {}),
            ("post", f"/api/pro/appointments/{a}/documents", {"kind": "certificat", "body": "Certificat frauduleux"}),
            ("post", f"/api/pro/appointments/{a}/vaccination", {"vaccine_code": "bcg"}),
            ("post", f"/api/pro/lab-orders/{self.lab.id}/cancel", {}),
            ("get", f"/api/pro/patients/{self.p1.id}", None),
            ("post", f"/api/pro/patients/{self.p1.id}/recalls", {"message": "x", "due_date": "2030-01-01"}),
            ("post", f"/api/pro/renewals/{self.renewal.id}", {"decision": "accept"}),
            ("get", f"/api/documents/{self.document.id}/download", None),
        ]:
            self.assert_refused(self.doc2, method, url, data, "médecin B")
        self.assertEqual(Appointment.objects.get(id=a).status, "confirmed")

    def test_anonymous_is_refused_everywhere(self):
        for method, url in [
            ("get", "/api/appointments/mine"),
            ("get", f"/api/documents/{self.document.id}/download"),
            ("get", f"/api/documents/prescriptions/{self.rx.id}"),
            ("get", "/api/patient/health"),
            ("get", "/api/patient/medical-record"),
            ("get", f"/api/pro/patients/{self.p1.id}"),
            ("get", "/api/admin/activity-report"),
            ("get", f"/api/payments/{self.payment.id}/receipt"),
        ]:
            self.assert_refused(self.anon, method, url, None, "visiteur")
