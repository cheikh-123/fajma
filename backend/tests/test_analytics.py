"""Tableau de bord de pilotage."""

from appointments.models import Appointment

from .test_security import ApiTestCase


class AnalyticsTests(ApiTestCase):
    def test_public_stats_are_real(self):
        data = self.client.get("/api/directory/stats").data
        self.assertEqual((data["doctors"], data["cities"], data["rating"]), (1, 1, None))
        self.assertEqual(data["by_specialty"], {"medecine-generale": 1})

    def test_admin_only_and_figures(self):
        admin = self.make_user("adm@test.sn", "Admin")
        admin.is_staff = True
        admin.save()
        self.book(self.p1)
        Appointment.objects.update(channel="whatsapp")
        self.assertEqual(self.client_for(self.p1).get("/api/admin/analytics").status_code, 403)
        data = self.client_for(admin).get("/api/admin/analytics", {"weeks": 8}).data
        self.assertEqual(len(data["series"]), 8)
        self.assertEqual(sum(w["booked"] for w in data["series"]), 1)
        self.assertEqual(data["by_channel"], [{"channel": "whatsapp", "n": 1}])
        self.assertEqual(data["by_specialty"][0]["name"], "Médecine générale")
        self.assertEqual(data["kpis"]["doctors_verified"], 1)
