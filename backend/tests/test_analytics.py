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


class CatalogAndMapTests(ApiTestCase):
    def test_full_specialty_catalog_is_installed(self):
        """Base neuve (production comprise) : le catalogue complet existe, un médecin peut créer sa fiche."""
        from directory.specialties import CATALOG

        data = self.client.get("/api/directory/specialties").data
        self.assertEqual(len(data), len(CATALOG))
        self.assertGreaterEqual(len(CATALOG), 36)
        self.assertIn("ORL (oreilles, nez, gorge)", {s["name"] for s in data})

    def test_map_places_come_from_real_doctor_locations(self):
        self.doctor.latitude, self.doctor.longitude = 14.6928, -17.4467
        self.doctor.save()
        self.assertEqual(self.client.get("/api/directory/stats").data["places"], [[14.7, -17.4, 1]])
