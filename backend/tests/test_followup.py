"""Suivi au long cours : renouvellement d'ordonnance, fiche d'urgence (QR code), alertes de mesures au médecin."""

import base64
import tempfile
from datetime import date, timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from appointments.models import Appointment
from audit.models import AuditEvent
from directory.models import Doctor
from medical.models import Prescription, PrescriptionRenewal
from medical.renewals import send_renewal_reminders
from notifications.models import Notification

from .test_prescriptions import PNG
from .test_security import ApiTestCase

LONG_TERM = [{"name": "Amlodipine", "dosage": "10 mg", "posology": "1 comprimé le matin", "duration": "3 mois", "quantity": "3 boîtes"}]
SHORT = [{"name": "Amoxicilline", "dosage": "1 g", "posology": "1 matin et soir", "duration": "7 jours", "quantity": "1 boîte"}]


class FollowUpCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        Appointment.objects.filter(id=self.appt.id).update(status="completed", scheduled_at=timezone.now() - timedelta(hours=2))
        self.doc = self.client_for(self.doc_user)
        self.pat = self.client_for(self.p1)

    def sign(self):
        self.doc.post("/api/pro/prescription-header", {"order_number": "ONMS 1234", "practice_name": "Cabinet", "city": "Dakar"}, format="json")
        self.doc.post("/api/pro/prescription-header", {"image": "signature", "content_base64": base64.b64encode(PNG).decode()}, format="json")

    def prescribe(self, items=LONG_TERM):
        self.sign()
        res = self.doc.post(f"/api/pro/appointments/{self.appt.id}/record", {"summary": "Suivi HTA", "items": items}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return Prescription.objects.get(id=res.data["prescription_id"])


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class RenewalTests(FollowUpCase):
    def test_request_accept_creates_new_prescription(self):
        rx = self.prescribe()
        res = self.pat.post("/api/patient/renewals", {"prescription_id": str(rx.id), "note": "Plus que 5 comprimés"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(Notification.objects.filter(user=self.doc_user, kind="renewal_request").exists())
        # Une seule demande en cours par ordonnance.
        self.assertEqual(self.pat.post("/api/patient/renewals", {"prescription_id": str(rx.id)}, format="json").status_code, 400)
        pending = self.doc.get("/api/pro/renewals").data
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["patient"]["full_name"], "Awa P1")
        decided = self.doc.post(f"/api/pro/renewals/{pending[0]['id']}", {"decision": "accept"}, format="json")
        self.assertEqual(decided.status_code, 200, decided.data)
        new = Prescription.objects.get(id=decided.data["new_prescription_id"])
        self.assertNotEqual(new.reference, rx.reference)
        self.assertEqual(new.items, rx.items)
        self.assertGreater(new.valid_until, date.today() + timedelta(days=80))
        self.assertTrue(Notification.objects.filter(user=self.p1, title__startswith="Ordonnance renouvelée").exists())
        self.assertEqual(self.doc.get("/api/pro/renewals").data, [])
        self.assertTrue(AuditEvent.objects.filter(action="renewal_accepted").exists())

    def test_refuse_needs_reason_and_other_doctor_cannot_decide(self):
        rx = self.prescribe()
        r = self.pat.post("/api/patient/renewals", {"prescription_id": str(rx.id)}, format="json").data
        other = self.make_user("autre@test.sn", "Dr Autre")
        Doctor.objects.create(user=other, full_name="Dr Autre", specialty=self.spec, city="Dakar", consultation_price=10000, is_verified=True)
        self.assertEqual(self.client_for(other).post(f"/api/pro/renewals/{r['id']}", {"decision": "accept"}, format="json").status_code, 404)
        self.assertEqual(self.doc.post(f"/api/pro/renewals/{r['id']}", {"decision": "refuse"}, format="json").status_code, 400)
        res = self.doc.post(f"/api/pro/renewals/{r['id']}", {"decision": "refuse", "message": "Une consultation est nécessaire."}, format="json")
        self.assertEqual(res.data["status"], "refused")
        mine = self.pat.get("/api/patient/renewals").data[0]
        self.assertEqual(mine["doctor_reply"], "Une consultation est nécessaire.")
        # Après un refus, une nouvelle demande reste possible.
        self.assertEqual(self.pat.post("/api/patient/renewals", {"prescription_id": str(rx.id)}, format="json").status_code, 200)

    def test_only_own_recent_prescriptions(self):
        rx = self.prescribe()
        self.assertEqual(self.client_for(self.p2).post("/api/patient/renewals", {"prescription_id": str(rx.id)}, format="json").status_code, 404)
        Prescription.objects.filter(id=rx.id).update(created_at=timezone.now() - timedelta(days=400))
        self.assertEqual(self.pat.post("/api/patient/renewals", {"prescription_id": str(rx.id)}, format="json").status_code, 400)

    def test_reminder_only_for_long_term_treatment(self):
        long_rx = self.prescribe(LONG_TERM)
        short_rx = Prescription.objects.create(
            appointment=self.appt, patient=self.p1, doctor=self.doctor, items=SHORT, content="Amoxicilline", valid_until=date.today() + timedelta(days=3)
        )
        Prescription.objects.filter(id=long_rx.id).update(valid_until=date.today() + timedelta(days=5))
        self.assertEqual(send_renewal_reminders(), 1)
        self.assertEqual(Notification.objects.filter(user=self.p1, kind="renewal_reminder").count(), 1)
        self.assertEqual(send_renewal_reminders(), 0)  # un seul rappel
        short_rx.refresh_from_db()
        self.assertIsNotNone(short_rx.renewal_reminded_at)


class EmergencyCardTests(FollowUpCase):
    def test_card_lifecycle(self):
        self.pat.post("/api/patient/health-profile", {"blood_group": "O+", "allergies": "Pénicilline", "conditions": "Asthme", "treatments": "Ventoline", "emergency_contact": "Moussa, 77 000 00 00"}, format="json")
        self.assertFalse(self.pat.get("/api/patient/emergency-card").data["enabled"])
        on = self.pat.post("/api/patient/emergency-card", {"enabled": True}, format="json").data
        token = on["token"]
        self.assertGreaterEqual(len(token), 40)
        public = APIClient()
        card = public.get(f"/api/emergency/{token}").data
        self.assertEqual((card["full_name"], card["blood_group"], card["allergies"]), ("Awa P1", "O+", "Pénicilline"))
        self.assertNotIn("conditions", card)  # non partagé par défaut
        self.assertTrue(AuditEvent.objects.filter(action="emergency_card_viewed", patient=self.p1).exists())
        public.get(f"/api/emergency/{token}")
        self.assertEqual(Notification.objects.filter(user=self.p1, kind="emergency_card_viewed").count(), 1)
        # Le patient choisit les informations : antécédents ajoutés, allergies retirées.
        self.pat.post("/api/patient/emergency-card", {"fields": ["blood_group", "conditions"]}, format="json")
        card = public.get(f"/api/emergency/{token}").data
        self.assertEqual(card.get("conditions"), "Asthme")
        self.assertNotIn("allergies", card)
        # Nouveau lien : l'ancien QR code ne fonctionne plus.
        new_token = self.pat.post("/api/patient/emergency-card", {"regenerate": True}, format="json").data["token"]
        self.assertNotEqual(new_token, token)
        self.assertEqual(public.get(f"/api/emergency/{token}").status_code, 404)
        self.pat.post("/api/patient/emergency-card", {"enabled": False}, format="json")
        self.assertEqual(public.get(f"/api/emergency/{new_token}").status_code, 404)
        self.assertEqual(self.pat.post("/api/patient/emergency-card", {"fields": ["mot_de_passe"]}, format="json").status_code, 400)


class MeasurementAlertTests(FollowUpCase):
    def measure(self, sys, dia, client=None):
        return (client or self.pat).post("/api/patient/measurements", {"kind": "blood_pressure", "systolic": sys, "diastolic": dia}, format="json")

    def alerts(self):
        return Notification.objects.filter(user=self.doc_user, kind="measurement_alert")

    def test_dangerous_value_alerts_following_doctor_once_a_day(self):
        self.measure(185, 115)
        self.assertEqual(self.alerts().count(), 1)
        self.assertIn("185/115", self.alerts().first().body)
        self.measure(190, 118)
        self.assertEqual(self.alerts().count(), 1)  # une alerte par 24 h
        # Patient sans lien avec ce médecin : aucune alerte.
        self.measure(185, 115, self.client_for(self.p2))
        self.assertEqual(self.alerts().count(), 1)

    def test_repeated_high_values_and_opt_out(self):
        self.measure(145, 92)
        self.measure(150, 95)
        self.assertEqual(self.alerts().count(), 0)
        self.measure(148, 94)
        self.assertEqual(self.alerts().count(), 1)
        self.assertIn("3 valeurs élevées", self.alerts().first().body)
        Notification.objects.all().delete()
        self.pat.post("/api/patient/emergency-card", {"alert_doctors": False}, format="json")
        self.measure(190, 120)
        self.assertEqual(self.alerts().count(), 0)
