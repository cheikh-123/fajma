"""
Tests de l'API : règles métier et sécurité (contrôle d'accès, anti double réservation, prix, etc.).
Lancement : python manage.py test
"""

from datetime import UTC, datetime, time, timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Relative, User
from appointments.models import Appointment
from directory.models import ConsultationType, Doctor, DoctorAvailability, Specialty
from medical.models import MedicalDocument
from payments.models import Payment

PASSWORD = "Mot-de-passe-solide-2026"


def next_weekday_at(hour: int, minute: int = 0, days_ahead: int = 2) -> datetime:
    """Prochain jour ouvré (lundi–vendredi) au moins `days_ahead` jours plus tard, à l'heure donnée (UTC)."""
    d = datetime.now(UTC) + timedelta(days=days_ahead)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0)


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


class ApiTestCase(TestCase):
    def setUp(self):
        cache.clear()  # remet à zéro les limites de débit
        self.spec = Specialty.objects.create(slug="medecine-generale", name="Médecine générale")
        self.doc_user = self.make_user("doc@test.sn", "Dr Test")
        self.doctor = Doctor.objects.create(
            user=self.doc_user, full_name="Dr Test", specialty=self.spec, city="Dakar", consultation_price=15000, is_verified=True, teleconsultation=True
        )
        for weekday in range(1, 6):
            DoctorAvailability.objects.create(doctor=self.doctor, weekday=weekday, start_time=time(9), end_time=time(12), slot_minutes=30)
        self.p1 = self.make_user("p1@test.sn", "Awa P1", phone="771234567")
        self.p2 = self.make_user("p2@test.sn", "Moussa P2")
        self.slot = next_weekday_at(10)

    def make_user(self, email, name, **extra):
        return User.objects.create_user(email=email, password=PASSWORD, full_name=name, **extra)

    def set_appointment(self, appt_id, **fields):
        """Modifie un RDV directement en base en recalculant l'heure de fin (comme save()), sinon PostgreSQL
        refuse le chevauchement apparent avec les autres RDV (contrainte appointment_no_overlap)."""
        appt = Appointment.objects.get(id=appt_id)
        if "scheduled_at" in fields:
            fields["ends_at"] = fields["scheduled_at"] + timedelta(minutes=fields.get("duration_minutes", appt.duration_minutes))
        Appointment.objects.filter(id=appt_id).update(**fields)

    def client_for(self, user=None) -> APIClient:
        client = APIClient()
        if user:
            client.force_authenticate(user)
        return client

    def book(self, user, when=None, **extra):
        return self.client_for(user).post(
            "/api/appointments/", {"doctor_id": str(self.doctor.id), "scheduled_at": iso(when or self.slot), "mode": "in_person", **extra}, format="json"
        )


class BookingTests(ApiTestCase):
    def test_booking_is_pending_with_server_price(self):
        res = self.book(self.p1, price=100, status="confirmed", duration_minutes=480)
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual(appt.status, "pending")
        self.assertEqual(appt.price, 15000)
        self.assertEqual(appt.duration_minutes, 30)
        self.assertEqual(appt.ends_at, self.slot + timedelta(minutes=30))

    def test_double_booking_refused(self):
        self.assertEqual(self.book(self.p1).status_code, 200)
        self.assertEqual(self.book(self.p2).status_code, 409)

    def test_partial_overlap_refused_and_next_slot_ok(self):
        ctype = ConsultationType.objects.create(doctor=self.doctor, name="Long", duration_minutes=60, price=20000)
        self.assertEqual(self.book(self.p1, consultation_type_id=str(ctype.id)).status_code, 200)
        self.assertEqual(self.book(self.p2, when=self.slot + timedelta(minutes=30)).status_code, 409)
        self.assertEqual(self.book(self.p2, when=self.slot + timedelta(minutes=60)).status_code, 200)

    def test_consultation_type_price_applied(self):
        ctype = ConsultationType.objects.create(doctor=self.doctor, name="Suivi", duration_minutes=30, price=9000)
        res = self.book(self.p1, consultation_type_id=str(ctype.id))
        self.assertEqual(Appointment.objects.get(id=res.data["id"]).price, 9000)

    def test_slot_outside_availability_refused(self):
        self.assertEqual(self.book(self.p1, when=next_weekday_at(3)).status_code, 400)
        self.assertEqual(self.book(self.p1, when=self.slot + timedelta(minutes=10)).status_code, 400)

    def test_unverified_doctor_hidden_and_not_bookable(self):
        self.doctor.is_verified = False
        self.doctor.save()
        self.assertEqual(self.client_for().get("/api/directory/doctors").data, [])
        self.assertEqual(self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").status_code, 404)
        self.assertEqual(self.book(self.p1).status_code, 404)

    def test_cannot_book_for_someone_elses_relative(self):
        rel = Relative.objects.create(owner=self.p1, full_name="Enfant P1")
        self.assertEqual(self.book(self.p2, relative_id=str(rel.id)).status_code, 400)
        self.assertEqual(self.book(self.p1, relative_id=str(rel.id)).status_code, 200)

    def test_max_four_upcoming_per_doctor(self):
        for i in range(4):
            self.assertEqual(self.book(self.p1, when=self.slot + timedelta(minutes=30 * i)).status_code, 200)
        res = self.book(self.p1, when=self.slot + timedelta(minutes=120))
        self.assertEqual(res.status_code, 400)
        self.assertIn("plusieurs rendez-vous", res.data["error"])

    def test_booking_requires_login(self):
        self.assertEqual(self.book(None).status_code, 403)

    def test_cancel_frees_slot(self):
        appt_id = self.book(self.p1).data["id"]
        self.assertEqual(self.client_for(self.p2).post(f"/api/appointments/{appt_id}/cancel").status_code, 404)
        self.assertEqual(self.client_for(self.p1).post(f"/api/appointments/{appt_id}/cancel").status_code, 200)
        self.assertEqual(self.book(self.p2).status_code, 200)

    def test_reschedule_sets_pending_and_frees_old_slot(self):
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        new_slot = self.slot + timedelta(minutes=60)
        res = self.client_for(self.p1).post(f"/api/appointments/{appt_id}/reschedule", {"scheduled_at": iso(new_slot)}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=appt_id)
        self.assertEqual((appt.status, appt.scheduled_at), ("pending", new_slot))
        self.assertEqual(self.book(self.p2).status_code, 200)

    def test_only_doctor_changes_status(self):
        appt_id = self.book(self.p1).data["id"]
        url = f"/api/pro/appointments/{appt_id}/status"
        self.assertEqual(self.client_for(self.p1).post(url, {"status": "confirmed"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.doc_user).post(url, {"status": "confirmed"}, format="json").status_code, 200)
        self.assertEqual(Appointment.objects.get(id=appt_id).status, "confirmed")


class AccountTests(ApiTestCase):
    def test_register_cannot_become_admin(self):
        client = APIClient(enforce_csrf_checks=False)
        res = client.post(
            "/api/auth/register",
            {"email": "evil@test.sn", "password": PASSWORD, "full_name": "Evil", "role": "admin", "is_staff": True},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(User.objects.get(email="evil@test.sn").is_staff)
        self.assertEqual(client.get("/api/admin/overview").status_code, 403)

    def test_weak_password_refused(self):
        res = APIClient().post("/api/auth/register", {"email": "x@test.sn", "password": "123456", "full_name": "X"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_login_and_me(self):
        client = APIClient()
        self.assertEqual(client.post("/api/auth/login", {"email": "p1@test.sn", "password": "faux"}, format="json").status_code, 401)
        self.assertEqual(client.post("/api/auth/login", {"email": "P1@test.sn", "password": PASSWORD}, format="json").status_code, 200)
        self.assertEqual(client.get("/api/auth/me").data["user"]["email"], "p1@test.sn")

    def test_account_locked_after_repeated_failures_from_many_addresses(self):
        from audit.models import AuditEvent

        # 10 échecs venus d'adresses différentes (la limite par IP ne les arrête pas).
        for i in range(10):
            AuditEvent.objects.create(action="login_failed", ip=f"10.0.0.{i}", metadata={"email": "p1@test.sn"})
        client = APIClient()
        res = client.post("/api/auth/login", {"email": "P1@test.sn", "password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 429)
        # Les autres comptes ne sont pas touchés.
        self.assertEqual(client.post("/api/auth/login", {"email": "p2@test.sn", "password": PASSWORD}, format="json").status_code, 200)
        # Les échecs anciens ne comptent plus.
        AuditEvent.objects.filter(action="login_failed").update(created_at=timezone.now() - timedelta(minutes=20))
        self.assertEqual(APIClient().post("/api/auth/login", {"email": "p1@test.sn", "password": PASSWORD}, format="json").status_code, 200)

    def test_csrf_enforced_on_login(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(client.post("/api/auth/login", {"email": "p1@test.sn", "password": PASSWORD}, format="json").status_code, 403)

    def test_doctor_cannot_self_verify_or_edit_rating(self):
        user = self.make_user("new@test.sn", "Nouveau Dr")
        res = self.client_for(user).post(
            "/api/pro/profile",
            {"full_name": "Nouveau Dr", "specialty_id": str(self.spec.id), "city": "Dakar", "is_verified": True, "rating": 5},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        doc = Doctor.objects.get(user=user)
        self.assertFalse(doc.is_verified)
        self.assertEqual(float(doc.rating), 0.0)

    def test_admin_endpoints_require_staff(self):
        self.assertEqual(self.client_for(self.p1).get("/api/admin/overview").status_code, 403)
        admin = self.make_user("admin@test.sn", "Admin", is_staff=True)
        self.assertEqual(self.client_for(admin).get("/api/admin/overview").status_code, 200)


class PaymentTests(ApiTestCase):
    def test_cash_payment_is_pending_with_server_amount(self):
        appt_id = self.book(self.p1).data["id"]
        res = self.client_for(self.p1).post("/api/payments/start", {"appointment_id": appt_id, "method": "cash", "amount": 1}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        payment = Payment.objects.get()
        self.assertEqual((payment.status, payment.amount), ("pending", 15000))

    def test_mobile_payment_never_marked_paid_without_provider(self):
        appt_id = self.book(self.p1).data["id"]
        res = self.client_for(self.p1).post("/api/payments/start", {"appointment_id": appt_id, "method": "wave"}, format="json")
        self.assertEqual(res.status_code, 503)  # PayDunya non configuré en test
        self.assertFalse(Payment.objects.filter(status="paid").exists())

    def test_cannot_pay_someone_elses_appointment(self):
        appt_id = self.book(self.p1).data["id"]
        res = self.client_for(self.p2).post("/api/payments/start", {"appointment_id": appt_id, "method": "cash"}, format="json")
        self.assertEqual(res.status_code, 404)


class PrivacyTests(ApiTestCase):
    def test_messages_only_between_patient_and_their_doctor(self):
        self.book(self.p1)
        thread = {"doctor_id": str(self.doctor.id), "patient_id": str(self.p1.id)}
        self.assertEqual(self.client_for(self.p1).post("/api/messages/send", {**thread, "body": "Bonjour"}, format="json").status_code, 200)
        self.assertEqual(len(self.client_for(self.doc_user).get("/api/messages/thread", thread).data["messages"]), 1)
        self.assertEqual(self.client_for(self.p2).get("/api/messages/thread", thread).status_code, 404)
        self.assertEqual(self.client_for(self.p2).post("/api/messages/send", {**thread, "body": "x"}, format="json").status_code, 403)
        own = {"doctor_id": str(self.doctor.id), "patient_id": str(self.p2.id), "body": "x"}
        self.assertEqual(self.client_for(self.p2).post("/api/messages/send", own, format="json").status_code, 403)

    def test_documents_private(self):
        import base64

        res = self.client_for(self.p1).post(
            "/api/documents/",
            {"title": "Analyse", "category": "analyse", "file_name": "a.pdf", "mime_type": "application/pdf", "content_base64": base64.b64encode(b"%PDF-1.4 test").decode()},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        doc = MedicalDocument.objects.get()
        url = f"/api/documents/{doc.id}/download"
        res = self.client_for(self.p1).get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"%PDF-1.4 test")
        self.assertEqual(self.client_for(self.p2).get(url).status_code, 404)
        # Médecin : accès seulement avec un rendez-vous confirmé.
        appt_id = self.book(self.p1).data["id"]
        self.assertEqual(self.client_for(self.doc_user).get(url).status_code, 404)
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        # RDV confirmé mais document non partagé : toujours invisible.
        self.assertEqual(self.client_for(self.doc_user).get(url).status_code, 404)
        self.client_for(self.p1).post(f"/api/documents/{doc.id}/share", {"doctor_id": str(self.doctor.id)}, format="json")
        res = self.client_for(self.doc_user).get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client_for(self.p1).post(f"/api/documents/{doc.id}/delete").status_code, 200)
        self.assertFalse(MedicalDocument.objects.exists())

    def test_anonymous_cannot_read_private_data(self):
        anon = self.client_for()
        for url in ["/api/patient/health", "/api/appointments/mine", "/api/messages/threads", "/api/documents/", "/api/pro/appointments"]:
            self.assertEqual(anon.get(url).status_code, 403, url)

    def test_prescription_verification_hides_patient(self):
        from medical.models import Prescription

        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        p = Prescription.objects.create(appointment=appt, patient=self.p1, doctor=self.doctor, content="Paracétamol")
        data = self.client_for().post("/api/documents/prescriptions/verify", {"reference": p.reference}, format="json").data
        self.assertTrue(data["valid"])
        self.assertNotIn("Paracétamol", str(data))
        self.assertNotIn("Awa", str(data))
        self.assertEqual(self.client_for(self.p2).get(f"/api/documents/prescriptions/{p.id}").status_code, 404)


class ClinicTests(ApiTestCase):
    def test_secretary_manages_agenda_but_outsiders_cannot(self):
        owner = self.make_user("owner@test.sn", "Owner")
        clinic_id = self.client_for(owner).post("/api/clinics/mine", {"name": "Clinique X", "city": "Dakar"}, format="json").data["id"]
        self.client_for(owner).post(f"/api/clinics/{clinic_id}/members", {"doctor_id": str(self.doctor.id)}, format="json")
        secretary = self.make_user("sec@test.sn", "Secrétaire")
        self.assertEqual(self.client_for(owner).post(f"/api/clinics/{clinic_id}/staff", {"email": "sec@test.sn"}, format="json").status_code, 200)
        booking = {"doctor_id": str(self.doctor.id), "scheduled_at": iso(self.slot), "patient_name": "Ndeye Guichet"}
        self.assertEqual(self.client_for(self.p2).post(f"/api/clinics/{clinic_id}/book", booking, format="json").status_code, 403)
        self.assertEqual(self.client_for(secretary).post(f"/api/clinics/{clinic_id}/book", booking, format="json").status_code, 200)
        self.assertEqual(self.client_for(secretary).post(f"/api/clinics/{clinic_id}/book", booking, format="json").status_code, 409)
        self.assertEqual(self.client_for(secretary).post(f"/api/clinics/{clinic_id}/staff", {"email": "p2@test.sn"}, format="json").status_code, 403)


class UploadSafetyTests(ApiTestCase):
    """Un fichier HTML/SVG déguisé en PDF ne doit jamais être accepté ni servi comme page."""

    def upload(self, content: bytes, name="a.pdf", mime="application/pdf"):
        import base64

        return self.client_for(self.p1).post(
            "/api/documents/",
            {"title": "Pièce", "file_name": name, "mime_type": mime, "content_base64": base64.b64encode(content).decode()},
            format="json",
        )

    def test_disguised_html_refused(self):
        self.assertEqual(self.upload(b"<html><script>alert(document.cookie)</script></html>", "x.pdf").status_code, 400)
        self.assertEqual(self.upload(b"<svg onload=alert(1)>", "x.png", "image/png").status_code, 400)

    def test_real_type_stored_and_served_sandboxed(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        self.assertEqual(self.upload(png, "photo.html", "text/html").status_code, 200)
        doc = MedicalDocument.objects.get(patient=self.p1)
        self.assertEqual(doc.mime_type, "image/png")
        self.assertTrue(doc.file_path.endswith(".png"))
        res = self.client_for(self.p1).get(f"/api/documents/{doc.id}/download")
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertIn("sandbox", res["Content-Security-Policy"])
