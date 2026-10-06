"""Relais communautaires : habilitation, accord, alertes, transfert complet du dossier à la personne."""

from datetime import timedelta
from unittest import mock

from django.utils import timezone

from accounts.models import Relative, User
from care.models import Measurement
from community.models import CommunityAgent, CommunityFollow

from .test_security import ApiTestCase


class CommunityTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.relais = self.make_user("relais@test.sn", "Ndèye Relais")
        CommunityAgent.objects.create(user=self.relais, organization="Badiénou Gokh de Pikine", area="Pikine Est")

    def add(self, **extra):
        return self.client_for(self.relais).post("/api/community/people", {
            "full_name": "Mame Coumba Diop", "birth_date": "1950-03-01", "sex": "F", "village": "Pikine Est",
            "consent": "oral", "consent_witness": "Sa fille", **extra}, format="json")

    def test_access_and_consent(self):
        self.assertEqual(self.client_for(self.p1).get("/api/community/people").status_code, 403)
        self.assertEqual(self.add(consent="").status_code, 400)
        res = self.add()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(self.client_for(self.relais).get("/api/auth/me").data["user"]["is_community_agent"])

    def test_alerts_sorted_first(self):
        rid = self.add().data["relative_id"]
        self.add(full_name="Aïda Sow")
        Measurement.objects.create(patient=self.relais, relative_id=rid, kind="blood_pressure", systolic=185, diastolic=112, measured_at=timezone.now())
        data = self.client_for(self.relais).get("/api/community/people").data
        self.assertEqual(data["people"][0]["full_name"], "Mame Coumba Diop")
        self.assertEqual(data["people"][0]["alerts"][0]["level"], "urgent")
        self.assertEqual(data["counts"]["urgent"], 1)

    def test_transfer_moves_whole_record(self):
        res = self.add()
        rel = Relative.objects.get(id=res.data["relative_id"])
        Measurement.objects.create(patient=self.relais, relative=rel, kind="weight", value=60, measured_at=timezone.now() - timedelta(days=1))
        appt = self.book(self.relais, relative_id=str(rel.id))
        self.assertEqual(appt.status_code, 200, appt.data)
        url = f"/api/community/people/{res.data['id']}/transfer"
        with mock.patch("community.views.secrets.randbelow", return_value=123456):
            self.client_for(self.relais).post(url, {"phone": "78 111 22 33"}, format="json")
        self.assertEqual(self.client_for(self.relais).post(url + "/confirm", {"code": "000000"}, format="json").status_code, 400)
        done = self.client_for(self.relais).post(url + "/confirm", {"code": "123456"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["status"], "transferred")
        owner = User.objects.get(phone="+221781112233")
        self.assertTrue(owner.phone_verified)
        self.assertEqual(owner.full_name, "Mame Coumba Diop")
        self.assertEqual(Measurement.objects.get(kind="weight").patient, owner)
        from appointments.models import Appointment

        a = Appointment.objects.get(id=appt.data["id"])
        self.assertEqual((a.patient_id, a.relative_id), (owner.id, None))
        self.assertFalse(Relative.objects.filter(id=rel.id).exists())
        self.assertEqual(CommunityFollow.objects.get().status, "transferred")

    def test_admin_enables_agent(self):
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        res = self.client_for(admin).post("/api/admin/community-agents", {"email": "p2@test.sn", "organization": "Poste de santé", "area": "Ndiaganiao"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(CommunityAgent.objects.filter(user=self.p2).exists())
