"""Secrétariat : fichier patients, recherche, doublons, rattachement au compte, réservation d'un patient connu."""

from datetime import timedelta

from appointments.models import Appointment
from notifications.models import Notification

from .test_security import ApiTestCase, iso


class SecretariatTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@test.sn", "Responsable")
        self.secretary = self.make_user("sec@test.sn", "Secrétaire")
        owner = self.client_for(self.owner)
        self.clinic_id = owner.post("/api/clinics/mine", {"name": "Clinique X", "city": "Dakar"}, format="json").data["id"]
        owner.post(f"/api/clinics/{self.clinic_id}/members", {"doctor_id": str(self.doctor.id)}, format="json")
        owner.post(f"/api/clinics/{self.clinic_id}/staff", {"email": "sec@test.sn"}, format="json")
        self.sec = self.client_for(self.secretary)
        self.n = 0

    def walk_in(self, name, phone):
        self.n += 1
        when = self.slot + timedelta(days=7 * self.n)
        res = self.sec.post(
            f"/api/clinics/{self.clinic_id}/book",
            {"doctor_id": str(self.doctor.id), "scheduled_at": iso(when), "patient_name": name, "patient_phone": phone},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["id"]

    def directory(self, q=""):
        return self.sec.get(f"/api/clinics/{self.clinic_id}/patients", {"q": q}).data

    def test_duplicates_grouped_by_phone_and_unified(self):
        self.walk_in("Fatou Sow", "77 555 66 77")
        self.walk_in("Fatou  SOW", "+221775556677")
        self.walk_in("Ibrahima Fall", "")
        rows = self.directory()
        fatou = next(r for r in rows if r["phone"] == "+221775556677")
        self.assertEqual(fatou["appointments"], 2)
        self.assertEqual(len(fatou["name_variants"]), 2)
        self.assertEqual(len(self.directory("sow")), 1)
        self.assertEqual(len(self.directory("5556")), 1)
        res = self.sec.post(f"/api/clinics/{self.clinic_id}/patients/unify", {"phone": "775556677", "name": "Fatou Sow"}, format="json")
        self.assertEqual(res.data["updated"], 2)
        self.assertEqual(next(r for r in self.directory() if r["phone"] == "+221775556677")["name_variants"], [])

    def test_link_walk_ins_to_verified_account_of_known_patient(self):
        self.p1.phone, self.p1.phone_verified = "+221771234567", True
        self.p1.save()
        self.walk_in("Awa (guichet)", "77 123 45 67")
        link = f"/api/clinics/{self.clinic_id}/patients/link"
        # Pas encore patiente de la clinique avec son compte : pas de rattachement (ni d'indice sur son compte).
        self.assertEqual(self.sec.post(link, {"phone": "771234567"}, format="json").status_code, 400)
        self.assertIsNone(next(r for r in self.directory() if not r["registered"])["matching_account"])
        self.book(self.p1)  # RDV pris en ligne auprès du médecin de la clinique
        row = next(r for r in self.directory() if not r["registered"])
        self.assertEqual(row["matching_account"]["name"], self.p1.full_name)
        res = self.sec.post(link, {"phone": "771234567"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Appointment.objects.filter(patient=self.p1).count(), 2)
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="clinic_link").exists())
        self.assertTrue(all(r["registered"] for r in self.directory()))

    def test_book_known_patient_and_access_control(self):
        self.book(self.p1)
        pid = next(r for r in self.directory() if r["registered"])["patient_id"]
        when = self.slot + timedelta(days=21)
        body = {"doctor_id": str(self.doctor.id), "scheduled_at": iso(when), "patient_id": pid}
        self.assertEqual(self.sec.post(f"/api/clinics/{self.clinic_id}/book", body, format="json").status_code, 200)
        self.assertEqual(Appointment.objects.filter(patient=self.p1).count(), 2)
        # Un patient inconnu de la clinique ne peut pas être choisi par son identifiant.
        stranger = {**body, "patient_id": str(self.p2.id), "scheduled_at": iso(when + timedelta(days=7))}
        self.assertEqual(self.sec.post(f"/api/clinics/{self.clinic_id}/book", stranger, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p2).get(f"/api/clinics/{self.clinic_id}/patients").status_code, 403)
