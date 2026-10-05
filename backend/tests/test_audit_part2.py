"""
Audit (volets 7 à 15) : révocation des sessions, réservation chez soi-même, idempotence de la réservation,
numérotation légale des reçus, désinscription SMS (STOP), rappels jamais envoyés deux fois, purge des comptes
inactifs, détail de /api/health, JSON corrompu.
"""

from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from appointments.models import Appointment
from notifications.models import SmsOptOut, SmsReminder
from payments.models import Payment

from .test_security import PASSWORD, ApiTestCase


class SessionRevocationTests(ApiTestCase):
    def login(self):
        client = APIClient()
        self.assertEqual(client.post("/api/auth/login", {"email": "p1@test.sn", "password": PASSWORD}, format="json").status_code, 200)
        return client

    def test_logout_other_devices_keeps_current_one(self):
        phone, laptop = self.login(), self.login()
        res = laptop.post("/api/auth/sessions/logout-others")
        self.assertEqual(res.data["closed"], 1)
        self.assertIsNone(phone.get("/api/auth/me").data["user"])  # téléphone perdu : déconnecté
        self.assertEqual(laptop.get("/api/auth/me").data["user"]["email"], "p1@test.sn")


class BookingRulesTests(ApiTestCase):
    def test_doctor_cannot_book_with_himself(self):
        res = self.client_for(self.doc_user).post(
            "/api/appointments/", {"doctor_id": str(self.doctor.id), "scheduled_at": self.slot.isoformat()}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_doctor_can_be_patient_of_a_colleague(self):
        from directory.models import Doctor

        colleague_user = self.make_user("confrere@test.sn", "Dr Confrère")
        Doctor.objects.create(user=colleague_user, full_name="Dr Confrère", specialty=self.spec, city="Dakar", consultation_price=1, is_verified=True)
        res = self.client_for(colleague_user).post(
            "/api/appointments/", {"doctor_id": str(self.doctor.id), "scheduled_at": self.slot.isoformat()}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)

    def test_retried_booking_returns_the_same_appointment(self):
        first = self.book(self.p1)
        again = self.book(self.p1)  # même requête renvoyée après une coupure réseau
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data["id"], first.data["id"])
        self.assertEqual(Appointment.objects.filter(patient=self.p1).count(), 1)

    def test_corrupted_json_is_refused_cleanly(self):
        res = self.client_for(self.p1).post("/api/appointments/", data="{pas du json", content_type="application/json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.data)


class ReceiptNumberTests(ApiTestCase):
    def test_paid_receipts_are_numbered_sequentially(self):
        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        year = timezone.localdate().year
        a = Payment.objects.create(appointment=appt, patient=self.p1, amount=100, method="wave", reference="R-A")
        self.assertIsNone(a.receipt_number)  # pas encore encaissé : pas de numéro
        a.status, a.paid_at = "paid", timezone.now()
        a.save(update_fields=["status", "paid_at"])
        b = Payment.objects.create(appointment=appt, patient=self.p1, amount=100, method="cash", reference="R-B", status="paid", paid_at=timezone.now())
        a.refresh_from_db()
        self.assertEqual((a.receipt_number, b.receipt_number), (f"FJ-{year}-000001", f"FJ-{year}-000002"))
        b.save()  # un nouvel enregistrement ne change jamais le numéro
        self.assertEqual(Payment.objects.get(pk=b.pk).receipt_number, f"FJ-{year}-000002")
        res = self.client_for(self.p1).get(f"/api/payments/{a.id}/receipt")
        self.assertEqual(res.data["receipt_number"], f"FJ-{year}-000001")


class SmsOptOutTests(ApiTestCase):
    def post_whatsapp(self, text):
        with mock.patch("bots.views.twilio_signature_ok", return_value=True):
            return APIClient().post("/api/bots/whatsapp", {"From": "whatsapp:+221771234567", "Body": text, "MessageSid": f"SM{text}"})

    def test_stop_then_start(self):
        from notifications.sms import send_message

        res = self.post_whatsapp("STOP")
        self.assertIn("ne recevrez plus", res.content.decode())
        self.assertTrue(SmsOptOut.objects.filter(phone="+221771234567").exists())
        self.assertIn("désinscrit", send_message(to="+221771234567", body="Rappel").error)
        # Un code de connexion demandé par la personne reste envoyé (ici : Twilio non configuré).
        self.assertNotIn("désinscrit", send_message(to="+221771234567", body="Code", essential=True).error)
        self.post_whatsapp("start")
        self.assertFalse(SmsOptOut.objects.exists())

    def test_inbound_sms_stop_and_carrier_unsubscribed(self):
        with mock.patch("bots.views.twilio_signature_ok", return_value=True):
            res = APIClient().post("/api/notifications/twilio-inbound", {"From": "+221781112233", "Body": "Arrêt"})
        self.assertIn("ne recevrez plus", res.content.decode())
        self.assertEqual(SmsOptOut.objects.get(phone="+221781112233").source, "sms")


class ReminderNoDuplicateTests(ApiTestCase):
    def make_reminder(self, **extra):
        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        return SmsReminder.objects.create(
            appointment=appt, kind="reminder_24h", recipient_phone="+221770000000", message="Rappel",
            scheduled_for=timezone.now() - timedelta(minutes=1), **extra,
        )

    def test_reminder_sent_once_even_if_scheduler_runs_twice(self):
        from notifications.management.commands.send_reminders import Command
        from notifications.sms import SendResult

        self.make_reminder()
        with mock.patch("notifications.management.commands.send_reminders.send_message", return_value=SendResult(True, sid="SM1")) as send:
            Command().send_due(timezone.now())
            Command().send_due(timezone.now())
        self.assertEqual(send.call_count, 1)

    def test_interrupted_send_is_not_resent(self):
        from notifications.management.commands.send_reminders import Command

        r = self.make_reminder(status="sending", attempts=1)
        SmsReminder.objects.filter(pk=r.pk).update(updated_at=timezone.now() - timedelta(hours=1))
        with mock.patch("notifications.management.commands.send_reminders.send_message") as send:
            Command().send_due(timezone.now())
        send.assert_not_called()
        self.assertEqual(SmsReminder.objects.get(pk=r.pk).status, "failed")


class InactiveAccountTests(ApiTestCase):
    def test_notice_then_anonymization(self):
        from accounts.erasure import purge_inactive_accounts

        old = timezone.now() - timedelta(days=1200)
        User.objects.filter(pk=self.p2.pk).update(last_login=old, date_joined=old)
        warned, purged = purge_inactive_accounts(1095)
        self.assertEqual((warned, purged), (1, 0))  # préavis d'abord, rien d'effacé
        self.assertTrue(User.objects.get(pk=self.p2.pk).is_active)
        User.objects.filter(pk=self.p2.pk).update(inactive_notice_at=timezone.now() - timedelta(days=31))
        warned, purged = purge_inactive_accounts(1095)
        self.assertEqual(purged, 1)
        gone = User.objects.get(pk=self.p2.pk)
        self.assertEqual((gone.full_name, gone.is_active), ("Compte supprimé", False))
        self.assertTrue(User.objects.get(pk=self.p1.pk).is_active)  # compte actif jamais touché

    def test_login_after_notice_keeps_account(self):
        from accounts.erasure import purge_inactive_accounts

        old = timezone.now() - timedelta(days=1200)
        User.objects.filter(pk=self.p2.pk).update(last_login=old, date_joined=old, inactive_notice_at=timezone.now() - timedelta(days=40))
        User.objects.filter(pk=self.p2.pk).update(last_login=timezone.now())  # la personne s'est reconnectée
        self.assertEqual(purge_inactive_accounts(1095), (0, 0))
        self.assertTrue(User.objects.get(pk=self.p2.pk).is_active)


@override_settings(HEALTH_TOKEN="jeton-supervision", BACKUP_DIR="", CLAMAV_ADDRESS="")
class HealthTests(ApiTestCase):
    def test_public_gets_status_only_and_supervision_gets_details(self):
        public = APIClient().get("/api/health").json()
        self.assertEqual(public, {"status": "ok"})
        detailed = APIClient().get("/api/health?token=jeton-supervision").json()
        self.assertEqual(detailed["checks"]["base de données"], "ok")
        self.assertIn("SMS (Twilio)", detailed["checks"])
        self.assertEqual(APIClient().get("/api/health?token=faux").json(), {"status": "ok"})
