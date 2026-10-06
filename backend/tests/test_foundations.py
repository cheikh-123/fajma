"""Fondations : connexion par téléphone (code SMS), journal d'audit, supervision, tâches."""

from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import totp
from accounts.models import OtpCode, TwoFactor, User
from appointments.models import Appointment
from audit.models import AuditEvent

from .test_security import ApiTestCase


@override_settings(DEBUG=True)
class PhoneLoginTests(ApiTestCase):
    def request_code(self, client, phone="77 555 44 33"):
        res = client.post("/api/auth/otp/request", {"phone": phone}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["dev_code"]

    def test_signup_with_phone_only(self):
        client = APIClient()
        code = self.request_code(client)
        res = client.post("/api/auth/otp/verify", {"phone": "771234000", "code": code}, format="json")
        self.assertEqual(res.status_code, 401)  # autre numéro : pas de code valide
        res = client.post("/api/auth/otp/verify", {"phone": "+221 77 555 44 33", "code": code}, format="json")
        self.assertTrue(res.data["needs_name"])
        res = client.post("/api/auth/otp/verify", {"phone": "775554433", "full_name": "Fatou Sow"}, format="json")
        self.assertEqual(res.data["user"]["full_name"], "Fatou Sow")
        user = User.objects.get(phone="+221775554433")
        self.assertTrue(user.phone_verified)
        self.assertIsNone(user.email)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(client.get("/api/auth/me").data["user"]["id"], str(user.id))

    def test_existing_phone_logs_in_and_code_is_single_use(self):
        User.objects.create_user(email=None, full_name="Ami", phone="+221775554433", phone_verified=True)
        client = APIClient()
        code = self.request_code(client)
        self.assertEqual(client.post("/api/auth/otp/verify", {"phone": "775554433", "code": code}, format="json").data["user"]["full_name"], "Ami")
        other = APIClient()
        self.assertEqual(other.post("/api/auth/otp/verify", {"phone": "775554433", "code": code}, format="json").status_code, 401)

    def test_wrong_codes_lock_after_five_attempts(self):
        client = APIClient()
        code = self.request_code(client)
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(client.post("/api/auth/otp/verify", {"phone": "775554433", "code": wrong}, format="json").status_code, 401)
        res = client.post("/api/auth/otp/verify", {"phone": "775554433", "code": code}, format="json")
        self.assertEqual(res.status_code, 429)

    def test_expired_code_refused(self):
        client = APIClient()
        code = self.request_code(client)
        OtpCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(client.post("/api/auth/otp/verify", {"phone": "775554433", "code": code}, format="json").status_code, 401)

    def test_rate_limit_per_phone(self):
        client = APIClient()
        for _ in range(3):
            self.request_code(client)
        self.assertEqual(client.post("/api/auth/otp/request", {"phone": "775554433"}, format="json").status_code, 429)

    def test_invalid_phone(self):
        self.assertEqual(APIClient().post("/api/auth/otp/request", {"phone": "12"}, format="json").status_code, 400)

    def test_sms_sent_through_task_queue(self):
        with mock.patch("notifications.tasks.send_message") as send:
            send.return_value = mock.Mock(ok=True, sid="SM1", channel="sms", error="")
            with self.captureOnCommitCallbacks(execute=True):
                APIClient().post("/api/auth/otp/request", {"phone": "775554433"}, format="json")
        self.assertEqual(send.call_count, 1)
        self.assertIn("votre code est", send.call_args.kwargs["body"])
        self.assertEqual(send.call_args.kwargs["to"], "+221775554433")

    def test_logged_in_user_verifies_phone(self):
        client = self.client_for(self.p2)
        code = self.request_code(client, "78 111 22 33")
        res = client.post("/api/auth/otp/verify", {"phone": "781112233", "code": code}, format="json")
        self.assertTrue(res.data["user"]["phone_verified"])
        self.p2.refresh_from_db()
        self.assertEqual(self.p2.phone, "+221781112233")

    def test_phone_of_another_account_refused(self):
        User.objects.create_user(email="x@test.sn", full_name="X", phone="+221781112233", phone_verified=True)
        client = self.client_for(self.p2)
        code = self.request_code(client, "781112233")
        self.assertEqual(client.post("/api/auth/otp/verify", {"phone": "781112233", "code": code}, format="json").status_code, 400)

    def test_mfa_still_required_after_sms_code(self):
        user = User.objects.create_user(email=None, full_name="Dr MFA", phone="+221775554433", phone_verified=True)
        secret = totp.new_secret()
        TwoFactor.objects.create(user=user, secret=secret, enabled=True)
        client = APIClient()
        code = self.request_code(client)
        self.assertTrue(client.post("/api/auth/otp/verify", {"phone": "775554433", "code": code}, format="json").data["mfa_required"])
        self.assertIsNone(client.get("/api/auth/me").data["user"])
        self.assertEqual(client.post("/api/auth/login/mfa", {"code": totp.current_code(secret)}, format="json").status_code, 200)


class AuditTests(ApiTestCase):
    def test_doctor_access_is_logged_and_visible_to_patient(self):
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        self.client_for(self.doc_user).get(f"/api/pro/patients/{self.p1.id}")
        event = AuditEvent.objects.get(action="patient_file_viewed")
        self.assertEqual((event.actor_id, event.patient_id), (self.doc_user.id, self.p1.id))
        log = self.client_for(self.p1).get("/api/patient/access-log").data
        self.assertEqual(log[0]["who"], "Dr Test")
        self.assertEqual(self.client_for(self.p2).get("/api/patient/access-log").data, [])

    def test_audit_events_are_immutable(self):
        event = AuditEvent.objects.create(action="login")
        event.action = "login_failed"
        with self.assertRaises(ValueError):
            event.save()
        with self.assertRaises(ValueError):
            event.delete()

    def test_failed_login_logged_and_admin_can_read(self):
        APIClient().post("/api/auth/login", {"email": "p1@test.sn", "password": "mauvais"}, format="json")
        self.assertTrue(AuditEvent.objects.filter(action="login_failed").exists())
        self.assertEqual(self.client_for(self.p1).get("/api/admin/audit").status_code, 403)
        admin = self.make_user("admin@test.sn", "Admin", is_staff=True)
        self.assertGreaterEqual(len(self.client_for(admin).get("/api/admin/audit").data["results"]), 1)


class OpsTests(ApiTestCase):
    def test_health(self):
        self.assertEqual(self.client_for().get("/api/health").json()["status"], "ok")

    def test_client_error_accepted(self):
        res = self.client_for().post("/api/client-errors", {"message": "boom", "route": "/pro"}, format="json")
        self.assertEqual(res.status_code, 200)
