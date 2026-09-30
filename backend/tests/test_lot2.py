"""Tests du lot 2 : double authentification, lieux, partage de documents, rappels, téléconsultation, reçus."""

import base64
from datetime import time, timedelta

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import totp
from appointments.models import Appointment
from directory.models import DoctorAvailability, DoctorLocation
from medical.models import MedicalDocument, PatientRecall
from notifications.models import Notification
from payments.models import Payment

from .test_security import PASSWORD, ApiTestCase, iso


class TwoFactorTests(ApiTestCase):
    def test_enable_login_and_recovery(self):
        client = self.client_for(self.doc_user)
        secret = client.post("/api/auth/mfa", {"action": "start"}, format="json").data["secret"]
        self.assertEqual(client.post("/api/auth/mfa", {"action": "confirm", "code": "000000"}, format="json").status_code, 400)
        res = client.post("/api/auth/mfa", {"action": "confirm", "code": totp.current_code(secret)}, format="json")
        recovery = res.data["recovery_codes"]
        self.assertEqual(len(recovery), 8)

        anon = APIClient()
        res = anon.post("/api/auth/login", {"email": "doc@test.sn", "password": PASSWORD}, format="json")
        self.assertTrue(res.data["mfa_required"])
        self.assertIsNone(anon.get("/api/auth/me").data["user"])  # pas encore connecté
        self.assertEqual(anon.post("/api/auth/login/mfa", {"code": "123456"}, format="json").status_code, 401)
        # Code de secours : utilisable une seule fois.
        self.assertEqual(anon.post("/api/auth/login/mfa", {"code": recovery[0]}, format="json").status_code, 200)
        self.assertEqual(anon.get("/api/auth/me").data["user"]["email"], "doc@test.sn")

        anon2 = APIClient()
        anon2.post("/api/auth/login", {"email": "doc@test.sn", "password": PASSWORD}, format="json")
        self.assertEqual(anon2.post("/api/auth/login/mfa", {"code": recovery[0]}, format="json").status_code, 401)

    def test_mfa_step_requires_password_step(self):
        self.assertEqual(APIClient().post("/api/auth/login/mfa", {"code": "123456"}, format="json").status_code, 401)

    def test_disable_requires_password(self):
        client = self.client_for(self.p1)
        secret = client.post("/api/auth/mfa", {"action": "start"}, format="json").data["secret"]
        client.post("/api/auth/mfa", {"action": "confirm", "code": totp.current_code(secret)}, format="json")
        self.assertEqual(client.post("/api/auth/mfa", {"action": "disable", "password": "x"}, format="json").status_code, 403)
        self.assertEqual(client.post("/api/auth/mfa", {"action": "disable", "password": PASSWORD}, format="json").data["enabled"], False)


class LocationTests(ApiTestCase):
    def test_slots_carry_location_and_booking_stores_it(self):
        doc = self.client_for(self.doc_user)
        loc = doc.post("/api/pro/locations", {"name": "Cabinet de Rufisque", "address": "Route nationale", "city": "Rufisque", "latitude": 14.71, "longitude": -17.27}, format="json").data[0]
        DoctorAvailability.objects.filter(doctor=self.doctor).delete()
        doc.post("/api/pro/availability", {"weekday": (self.slot.weekday() + 1) % 7, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30, "location_id": loc["id"]}, format="json")
        slots = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}/slots").data["slots"]
        self.assertTrue(all(s["location_id"] == loc["id"] for s in slots))
        appt_id = self.book(self.p1).data["id"]
        self.assertEqual(str(Appointment.objects.get(id=appt_id).location_id), loc["id"])
        detail = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").data
        self.assertEqual(detail["locations"][0]["city"], "Rufisque")
        self.assertEqual(self.client_for(self.p1).get("/api/appointments/mine").data[0]["location"]["name"], "Cabinet de Rufisque")

    def test_cannot_use_other_doctors_location(self):
        from directory.models import Doctor

        other = Doctor.objects.create(full_name="Dr Autre", city="Dakar", is_verified=True)
        loc = DoctorLocation.objects.create(doctor=other, name="X", address="Y", city="Dakar")
        res = self.client_for(self.doc_user).post(
            "/api/pro/availability", {"weekday": 1, "start_time": "09:00", "end_time": "12:00", "location_id": str(loc.id)}, format="json"
        )
        self.assertEqual(res.status_code, 400)


class DocumentShareTests(ApiTestCase):
    def upload(self):
        self.client_for(self.p1).post(
            "/api/documents/",
            {"title": "Analyse", "category": "analyse", "file_name": "a.pdf", "mime_type": "application/pdf", "content_base64": base64.b64encode(b"%PDF-1.4 test").decode()},
            format="json",
        )
        return MedicalDocument.objects.get()

    def test_doctor_sees_only_shared_documents(self):
        doc = self.upload()
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        url = f"/api/documents/{doc.id}/download"
        self.assertEqual(self.client_for(self.doc_user).get(url).status_code, 404)  # pas encore partagé
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/pro/patients/{self.p1.id}").data["documents"], [])
        self.assertEqual(self.client_for(self.p1).get("/api/documents/share-targets").data[0]["full_name"], "Dr Test")
        self.client_for(self.p1).post(f"/api/documents/{doc.id}/share", {"doctor_id": str(self.doctor.id)}, format="json")
        res = self.client_for(self.doc_user).get(url)
        self.assertEqual(res.status_code, 200)
        res.close()
        self.assertEqual(len(self.client_for(self.doc_user).get(f"/api/pro/patients/{self.p1.id}").data["documents"]), 1)
        self.client_for(self.p1).post(f"/api/documents/{doc.id}/share", {"doctor_id": str(self.doctor.id), "shared": False}, format="json")
        self.assertEqual(self.client_for(self.doc_user).get(url).status_code, 404)

    def test_cannot_share_with_unknown_doctor(self):
        doc = self.upload()
        res = self.client_for(self.p1).post(f"/api/documents/{doc.id}/share", {"doctor_id": str(self.doctor.id)}, format="json")
        self.assertEqual(res.status_code, 400)  # aucun RDV avec ce médecin


class RecallTests(ApiTestCase):
    def test_recall_created_and_sent_when_due(self):
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        url = f"/api/pro/patients/{self.p1.id}/recalls"
        self.assertEqual(self.client_for(self.doc_user).post(url, {"due_date": "2000-01-01", "message": "Vaccin"}, format="json").status_code, 400)
        due = (timezone.localdate() + timedelta(days=30)).isoformat()
        self.assertEqual(self.client_for(self.doc_user).post(url, {"due_date": due, "message": "Rappel vaccin fièvre jaune."}, format="json").status_code, 200)
        self.assertEqual(self.client_for(self.p2).post(url, {"due_date": due, "message": "x"}, format="json").status_code, 404)
        PatientRecall.objects.update(due_date=timezone.localdate())  # date de Dakar, pas celle de la machine
        call_command("send_reminders", stdout=open("nul" if __import__("os").name == "nt" else "/dev/null", "w"))
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="recall").exists())
        self.assertIsNotNone(PatientRecall.objects.get().sent_at)


class TeleconsultationTests(ApiTestCase):
    def make_video(self, minutes_from_now=5, status="confirmed"):
        at = (timezone.now() + timedelta(minutes=minutes_from_now)).replace(second=0, microsecond=0)
        return Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=at, mode="teleconsultation", status=status, price=15000)

    def test_waiting_room_flow(self):
        appt = self.make_video()
        url = f"/api/appointments/{appt.id}/teleconsultation"
        data = self.client_for(self.p1).get(url).data
        self.assertTrue(data["open_now"])
        self.assertIsNone(data["room"])  # le patient attend que le médecin ouvre
        self.client_for(self.p1).post(f"{url}/ready")
        self.assertTrue(self.client_for(self.doc_user).get(url).data["patient_ready"])
        self.assertIsNotNone(self.client_for(self.doc_user).get(url).data["room"])
        self.assertEqual(self.client_for(self.p1).post(f"{url}/start").status_code, 403)
        self.client_for(self.doc_user).post(f"{url}/start")
        self.assertIsNotNone(self.client_for(self.p1).get(url).data["room"])
        self.assertEqual(self.client_for(self.p2).get(url).status_code, 403)

    def test_room_not_available_long_before(self):
        appt = self.make_video(minutes_from_now=3 * 24 * 60)
        data = self.client_for(self.doc_user).get(f"/api/appointments/{appt.id}/teleconsultation").data
        self.assertFalse(data["open_now"])
        self.assertIsNone(data["room"])

    def test_prepayment_required(self):
        self.doctor.teleconsultation_prepayment = True
        self.doctor.save()
        appt = self.make_video()
        url = f"/api/appointments/{appt.id}/teleconsultation"
        self.client_for(self.doc_user).post(f"{url}/start")
        data = self.client_for(self.p1).get(url).data
        self.assertTrue(data["payment_required"])
        self.assertIsNone(data["room"])
        Payment.objects.create(appointment=appt, patient=self.p1, amount=15000, method="wave", status="paid", reference="T")
        self.assertIsNotNone(self.client_for(self.p1).get(url).data["room"])

    def test_room_name_is_random(self):
        appt = self.make_video()
        self.assertNotIn(appt.id.hex, appt.teleconsultation_room)


class ReceiptTests(ApiTestCase):
    def test_cash_paid_then_receipt(self):
        appt = Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=timezone.now() - timedelta(hours=1), status="completed", price=15000)
        self.assertEqual(self.client_for(self.p1).post(f"/api/pro/appointments/{appt.id}/cash-paid").status_code, 404)
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt.id}/cash-paid").status_code, 200)
        payment = Payment.objects.get()
        self.assertEqual((payment.status, payment.amount), ("paid", 15000))
        data = self.client_for(self.p1).get(f"/api/payments/{payment.id}/receipt").data
        self.assertEqual(data["doctor_name"], "Dr Test")
        self.assertEqual(self.client_for(self.p2).get(f"/api/payments/{payment.id}/receipt").status_code, 404)
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt.id}/cash-paid").status_code, 400)

    def test_no_receipt_for_unpaid(self):
        appt = Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=timezone.now() + timedelta(days=2), status="confirmed")
        p = Payment.objects.create(appointment=appt, patient=self.p1, amount=1, method="cash", status="pending", reference="X")
        self.assertEqual(self.client_for(self.p1).get(f"/api/payments/{p.id}/receipt").status_code, 404)


_ = (iso, time)
