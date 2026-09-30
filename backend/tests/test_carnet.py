"""Carnet de santé : calendrier vaccinal, doses, suivi de grossesse, rappels."""

from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from accounts.models import Relative
from carnet.models import VaccineDose, VaccineReminder
from notifications.models import Notification

from .test_security import ApiTestCase


class CarnetTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        # Enfant de 40 jours : les vaccins de 6 semaines arrivent dans 2 jours.
        self.child = Relative.objects.create(owner=self.p1, full_name="Moussa Jr", birth_date=self.today - timedelta(days=40))

    def carnet(self, user=None):
        return self.client_for(user or self.p1).get("/api/carnet/").data

    def child_card(self, data):
        return next(p for p in data["people"] if p["id"] == str(self.child.id))

    def test_schedule_statuses(self):
        vacc = {v["code"]: v for v in self.child_card(self.carnet())["vaccinations"]}
        self.assertEqual(vacc["bcg"]["status"], "late")  # naissance, non inscrit
        self.assertEqual(vacc["penta1"]["status"], "due")
        self.assertEqual(vacc["penta1"]["due_date"], (self.child.birth_date + timedelta(days=42)).isoformat())
        self.assertEqual(vacc["rr1"]["status"], "upcoming")
        # Sans date de naissance, pas de calendrier calculé.
        me = next(p for p in self.carnet()["people"] if p["id"] is None)
        self.assertEqual(me["vaccinations"][0]["status"], "unknown")

    def test_record_dose_rules(self):
        c = self.client_for(self.p1)
        body = {"relative_id": str(self.child.id), "vaccine_code": "bcg", "given_on": self.child.birth_date.isoformat()}
        self.assertEqual(c.post("/api/carnet/doses", body, format="json").status_code, 200)
        self.assertEqual(c.post("/api/carnet/doses", body, format="json").status_code, 400)  # doublon
        future = {**body, "vaccine_code": "vpo0", "given_on": (self.today + timedelta(days=3)).isoformat()}
        self.assertEqual(c.post("/api/carnet/doses", future, format="json").status_code, 400)
        self.assertEqual(c.post("/api/carnet/doses", {**body, "vaccine_code": "inconnu"}, format="json").status_code, 400)
        before_birth = {**body, "vaccine_code": "vpo0", "given_on": (self.child.birth_date - timedelta(days=1)).isoformat()}
        self.assertEqual(c.post("/api/carnet/doses", before_birth, format="json").status_code, 400)
        # Un autre parent ne peut pas écrire dans ce carnet.
        self.assertEqual(self.client_for(self.p2).post("/api/carnet/doses", {**body, "vaccine_code": "vpo0"}, format="json").status_code, 404)
        vacc = {v["code"]: v for v in self.child_card(self.carnet())["vaccinations"]}
        self.assertEqual(vacc["bcg"]["status"], "done")
        self.assertEqual(self.carnet(self.p2)["people"][1:], [])

    def test_doctor_records_verified_dose(self):
        appt_id = self.book(self.p1, relative_id=str(self.child.id)).data["id"]
        self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt_id}/status", {"status": "confirmed"}, format="json")
        res = self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt_id}/vaccination", {"vaccine_code": "penta1"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        vacc = {v["code"]: v for v in self.child_card(self.carnet())["vaccinations"]}
        self.assertTrue(vacc["penta1"]["verified"])
        # La famille ne peut pas supprimer une dose inscrite par le médecin.
        dose_id = vacc["penta1"]["dose_id"]
        self.assertEqual(self.client_for(self.p1).post(f"/api/carnet/doses/{dose_id}/delete").status_code, 400)
        # Un autre médecin (sans ce RDV) ne peut rien inscrire.
        other = self.make_user("doc2@test.sn", "Dr Deux")
        from directory.models import Doctor

        Doctor.objects.create(user=other, full_name="Dr Deux", specialty=self.spec, city="Dakar", is_verified=True)
        self.assertEqual(self.client_for(other).post(f"/api/pro/appointments/{appt_id}/vaccination", {"vaccine_code": "pcv1"}, format="json").status_code, 404)

    def test_vaccine_reminder_sent_once(self):
        call_command("send_reminders", stdout=StringIO())
        call_command("send_reminders", stdout=StringIO())
        notes = Notification.objects.filter(user=self.p1, kind="vaccine")
        self.assertEqual(notes.count(), 1)
        self.assertIn("Pentavalent", notes[0].body)
        self.assertEqual(VaccineReminder.objects.filter(relative=self.child).count(), 4)  # les 4 doses de 6 semaines

    def test_pregnancy_follow_up_and_birth(self):
        c = self.client_for(self.p1)
        lmp = self.today - timedelta(weeks=11, days=5)  # CPN 1 (12 SA) dans 2 jours
        res = c.post("/api/carnet/pregnancies", {"last_period": lmp.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data["weeks"], res.data["days"]), (11, 5))
        self.assertEqual(res.data["due_date"], (lmp + timedelta(days=280)).isoformat())
        self.assertEqual(c.post("/api/carnet/pregnancies", {"last_period": lmp.isoformat()}, format="json").status_code, 400)
        pid = res.data["id"]
        call_command("send_reminders", stdout=StringIO())
        call_command("send_reminders", stdout=StringIO())
        self.assertEqual(Notification.objects.filter(user=self.p1, kind="prenatal").count(), 1)
        res = c.post(f"/api/carnet/pregnancies/{pid}/visits", {"contact": 1, "done_on": self.today.isoformat()}, format="json")
        self.assertEqual(res.data["visits"][0]["status"], "done")
        self.assertEqual(self.client_for(self.p2).post(f"/api/carnet/pregnancies/{pid}/visits", {"contact": 2, "done_on": self.today.isoformat()}, format="json").status_code, 404)
        res = c.post(f"/api/carnet/pregnancies/{pid}/end", {"outcome": "birth", "child_name": "Awa Bébé"}, format="json")
        self.assertEqual(res.status_code, 200)
        baby = Relative.objects.get(id=res.data["child_id"])
        self.assertEqual((baby.birth_date, baby.relationship), (self.today, "enfant"))
        # Le carnet du bébé démarre : BCG attendu à la naissance.
        card = next(p for p in self.carnet()["people"] if p["id"] == str(baby.id))
        self.assertEqual(card["vaccinations"][0]["due_date"], self.today.isoformat())

    def test_delete_own_dose(self):
        c = self.client_for(self.p1)
        c.post("/api/carnet/doses", {"vaccine_code": "vaa", "given_on": "2001-05-01"}, format="json")
        dose = VaccineDose.objects.get(owner=self.p1, relative=None)
        self.assertEqual(self.client_for(self.p2).post(f"/api/carnet/doses/{dose.id}/delete").status_code, 404)
        self.assertEqual(c.post(f"/api/carnet/doses/{dose.id}/delete").status_code, 200)
