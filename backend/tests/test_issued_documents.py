"""Certificats, arrêts de travail et courriers : droits, règles de dates, vérification publique."""

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from directory.models import Doctor

from .test_security import ApiTestCase


class IssuedDocumentTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        # Mentions obligatoires pour délivrer un document (voir test_prescriptions pour leur contrôle).
        Doctor.objects.filter(id=self.doctor.id).update(order_number="ONMS 1", signature_path="signatures/absente.png")
        self.appt_id = self.book(self.p1).data["id"]
        # Consultation qui vient d'avoir lieu (un document ne se rédige pas avant la consultation).
        self.seen_at = timezone.now() - timedelta(hours=1)
        Appointment.objects.filter(id=self.appt_id).update(status="confirmed", scheduled_at=self.seen_at)
        self.day = timezone.localtime(self.seen_at).date()

    def issue(self, user=None, **data):
        return self.client_for(user or self.doc_user).post(f"/api/pro/appointments/{self.appt_id}/documents", data, format="json")

    def test_certificate_flow_and_privacy(self):
        res = self.issue(kind="certificat", body="Certifie que l'état de santé de la patiente ne contre-indique pas le voyage.")
        self.assertEqual(res.status_code, 200, res.data)
        ref = res.data["reference"]
        self.assertTrue(ref.startswith("DOC-"))
        mine = self.client_for(self.p1).get("/api/documents/issued").data
        self.assertEqual(mine[0]["kind_label"], "Certificat médical")
        self.assertEqual(self.client_for(self.p2).get(f"/api/documents/issued/{res.data['id']}").status_code, 404)
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/documents/issued/{res.data['id']}").status_code, 200)
        check = self.client.post("/api/documents/prescriptions/verify", {"reference": ref.lower()}, format="json").data
        self.assertTrue(check["valid"])
        self.assertEqual(check["patient_initials"], "A. P.")
        self.assertNotIn("body", check)
        self.assertFalse(self.client.post("/api/documents/prescriptions/verify", {"reference": "DOC-0000000000"}, format="json").data["valid"])

    def test_sick_leave_rules(self):
        d = self.day
        self.assertEqual(self.issue(kind="arret_travail").status_code, 400)
        self.assertEqual(self.issue(kind="arret_travail", start_date=str(d), end_date=str(d - timedelta(days=1))).status_code, 400)
        self.assertEqual(self.issue(kind="arret_travail", start_date=str(d - timedelta(days=5)), end_date=str(d)).status_code, 400)
        self.assertEqual(self.issue(kind="arret_travail", start_date=str(d), end_date=str(d + timedelta(days=200))).status_code, 400)
        res = self.issue(kind="arret_travail", start_date=str(d - timedelta(days=1)), end_date=str(d + timedelta(days=3)))
        self.assertEqual(res.status_code, 200, res.data)
        check = self.client.post("/api/documents/prescriptions/verify", {"reference": res.data["reference"]}, format="json").data
        self.assertEqual(check["end_date"], str(d + timedelta(days=3)))

    def test_letter_needs_recipient_and_body(self):
        self.assertEqual(self.issue(kind="courrier", body="Cher confrère, je vous adresse ma patiente.").status_code, 400)
        self.assertEqual(self.issue(kind="courrier", recipient="Dr Sy, cardiologue").status_code, 400)
        self.assertEqual(self.issue(kind="courrier", recipient="Dr Sy, cardiologue", body="Cher confrère, je vous adresse ma patiente.").status_code, 200)

    def test_not_before_the_consultation(self):
        Appointment.objects.filter(id=self.appt_id).update(scheduled_at=timezone.now() + timedelta(days=2))
        res = self.issue(kind="certificat", body="Certifie avoir examiné ce jour le patient.")
        self.assertEqual(res.status_code, 400)
        self.assertIn("pas encore eu lieu", str(res.data))

    def test_only_the_doctor_of_a_confirmed_appointment(self):
        other = self.make_user("doc2@test.sn", "Dr Deux")
        Doctor.objects.create(user=other, full_name="Dr Deux", specialty=self.spec, city="Dakar", is_verified=True)
        body = {"kind": "certificat", "body": "Certificat de complaisance demandé."}
        self.assertEqual(self.issue(user=other, **body).status_code, 404)
        self.assertEqual(self.issue(user=self.p1, **body).status_code, 404)
        Appointment.objects.filter(id=self.appt_id).update(status="pending")
        self.assertEqual(self.issue(**body).status_code, 404)
