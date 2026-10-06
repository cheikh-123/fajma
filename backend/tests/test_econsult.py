"""Avis médical écrit : offre, demande avec photos, paiement (crédit santé), réponse, délai dépassé remboursé."""

import base64
from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from econsult.models import AsyncOffer, AsyncRequest
from econsult.views import expire_overdue
from family.models import CareLink, CreditEntry
from medical.models import MedicalDocument, Prescription
from payments.models import Payment

from .test_security import ApiTestCase

# Plus petit PNG valide (1 × 1)
PNG = base64.b64encode(base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)).decode()


class AsyncConsultTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        AsyncOffer.objects.create(doctor=self.doctor, enabled=True, price=5000, response_hours=24)

    def ask(self, user=None, **extra):
        return self.client_for(user or self.p1).post("/api/econsult/requests", {
            "doctor_id": str(self.doctor.id), "reason": "Bouton sur le bras", "symptoms": "Plaque rouge qui gratte depuis une semaine",
            "since": "1 semaine", "temperature": "37,2", "photos": [{"file_name": "bras.png", "content_base64": PNG}], **extra,
        }, format="json")

    def pay_with_credit(self, appt_id):
        sponsor = self.make_user("fils@test.sn", "Fils")
        link = CareLink.objects.create(sponsor=sponsor, beneficiary=self.p1, label="Maman", status="active")
        CreditEntry.objects.create(link=link, kind="topup", amount=20_000)
        return self.client_for(self.p1).post("/api/payments/start", {"appointment_id": appt_id, "method": "credit"}, format="json")

    def test_offer_and_request(self):
        self.assertEqual(self.client_for().get(f"/api/econsult/offer/{self.doctor.id}").data["price"], 5000)
        res = self.ask()
        self.assertEqual((res.status_code, res.data["status"]), (200, "awaiting_payment"), res.data)
        self.assertEqual(len(res.data["photos"]), 1)
        appt = Appointment.objects.get(id=res.data["appointment_id"])
        self.assertEqual((appt.mode, appt.duration_minutes, appt.ends_at), ("async", 0, appt.scheduled_at))
        # N'apparaît ni dans les rendez-vous du patient ni dans l'agenda du médecin.
        self.assertNotIn(str(appt.id), [a["id"] for a in self.client_for(self.p1).get("/api/appointments/mine").data])
        self.assertEqual(self.client_for(self.doc_user).get("/api/econsult/pro/requests").data, [])  # pas encore payé
        self.assertEqual(self.client_for(self.p1).post("/api/payments/start", {"appointment_id": str(appt.id), "method": "cash"}, format="json").status_code, 400)
        # Photo : visible du médecin seulement une fois la demande payée, jamais d'un autre patient.
        photo = MedicalDocument.objects.get(appointment=appt)
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/documents/{photo.id}/download").status_code, 404)
        self.pay_with_credit(str(appt.id))
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/documents/{photo.id}/download").status_code, 200)
        self.assertEqual(self.client_for(self.p2).get(f"/api/documents/{photo.id}/download").status_code, 404)

    def test_paid_request_answered_with_prescription(self):
        from directory.models import Doctor

        Doctor.objects.filter(id=self.doctor.id).update(order_number="ONMS 1234", signature_path="signatures/test.png")
        appt_id = self.ask().data["appointment_id"]
        self.assertEqual(self.pay_with_credit(appt_id).data["kind"], "paid")
        r = AsyncRequest.objects.get(appointment_id=appt_id)
        self.assertEqual(r.status, "submitted")
        self.assertIsNotNone(r.deadline_at)
        rows = self.client_for(self.doc_user).get("/api/econsult/pro/requests").data
        self.assertEqual(rows[0]["patient"]["full_name"], "Awa P1")
        url = f"/api/econsult/pro/requests/{r.id}/answer"
        self.assertEqual(self.client_for(self.p2).post(url, {"answer": "x" * 20, "outcome": "advice"}, format="json").status_code, 404)
        res = self.client_for(self.doc_user).post(url, {
            "answer": "Probable eczéma de contact. Crème à appliquer deux fois par jour.", "outcome": "prescription",
            "items": [{"name": "Crème hydratante", "posology": "2 fois par jour", "duration": "10 jours"}],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Appointment.objects.get(id=appt_id).status, "completed")
        self.assertTrue(Prescription.objects.filter(appointment_id=appt_id).exists())
        mine = self.client_for(self.p1).get("/api/econsult/requests").data[0]
        self.assertEqual((mine["status"], mine["outcome"]), ("answered", "prescription"))
        self.assertEqual(self.client_for(self.doc_user).post(url, {"answer": "y" * 20, "outcome": "advice"}, format="json").status_code, 400)

    def test_overdue_request_is_refunded(self):
        appt_id = self.ask().data["appointment_id"]
        self.pay_with_credit(appt_id)
        AsyncRequest.objects.update(deadline_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(expire_overdue(), 1)
        self.assertEqual(AsyncRequest.objects.get().status, "expired")
        self.assertEqual(Payment.objects.get(appointment_id=appt_id).status, "refunded")
        self.assertEqual(sum(CreditEntry.objects.values_list("amount", flat=True)), 20_000)  # recrédité

    def test_rules(self):
        AsyncOffer.objects.update(enabled=False)
        self.assertEqual(self.ask().status_code, 400)
        AsyncOffer.objects.update(enabled=True, price=0)
        res = self.ask(photos=[{"file_name": "x.pdf", "content_base64": base64.b64encode(b"%PDF-1.4").decode()}])
        self.assertEqual(res.status_code, 400)
        free = self.ask(photos=[])
        self.assertEqual(free.data["status"], "submitted")  # gratuit : envoyé directement
        settings = self.client_for(self.doc_user).post("/api/econsult/pro/offer", {"enabled": True, "price": 3000, "response_hours": 48}, format="json")
        self.assertEqual((settings.data["price"], settings.data["response_hours"]), (3000, 48))
        self.assertEqual(self.client_for(self.doc_user).post("/api/econsult/pro/offer", {"response_hours": 12}, format="json").status_code, 400)
