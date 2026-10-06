"""Administration : rôles de l'équipe, réglages, annonces groupées, recherche globale, fiche 360°, journal filtré."""

from backoffice.models import Announcement
from backoffice.settings_registry import get_setting
from notifications.models import Notification

from .test_security import ApiTestCase


class BackofficeTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin Principal", is_staff=True)
        self.doctor.is_verified = True
        self.doctor.save(update_fields=["is_verified"])

    def test_roles_limit_sections(self):
        c = self.client_for(self.admin)
        # Sans rôle : super-administrateur
        self.assertEqual(c.get("/api/admin/me").data["role"], "superadmin")
        staff = self.make_user("support@test.sn", "Agent Support")
        res = c.post("/api/admin/staff", {"email": "support@test.sn", "role": "support"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        staff.refresh_from_db()
        s = self.client_for(staff)
        self.assertEqual(s.get("/api/admin/me").data["role"], "support")
        self.assertEqual(s.get("/api/admin/users").status_code, 200)
        self.assertEqual(s.get("/api/admin/finance").status_code, 403)
        self.assertEqual(s.get("/api/admin/settings").status_code, 403)
        self.assertEqual(s.post("/api/admin/staff", {"email": "support@test.sn", "role": "superadmin"}, format="json").status_code, 403)
        # On ne modifie pas son propre accès ; retrait
        self.assertEqual(c.post("/api/admin/staff", {"email": "adm@test.sn", "remove": True}, format="json").status_code, 400)
        c.post("/api/admin/staff", {"email": "support@test.sn", "remove": True}, format="json")
        staff.refresh_from_db()
        self.assertEqual(self.client_for(staff).get("/api/admin/users").status_code, 403)
        # Un patient n'entre jamais
        self.assertEqual(self.client_for(self.p1).get("/api/admin/me").status_code, 403)

    def test_settings_editable_and_used(self):
        c = self.client_for(self.admin)
        self.assertEqual(c.post("/api/admin/settings", {"min_payout": 50}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/admin/settings", {"inconnu": 1}, format="json").status_code, 400)
        res = c.post("/api/admin/settings", {"min_payout": 10000, "maintenance_message": "Maintenance ce soir 22 h", "epidemic_hotline": "+221 33 800 00 00"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(get_setting("min_payout"), 10000)
        info = self.client.get("/api/site-info").data
        self.assertEqual(info["maintenance_message"], "Maintenance ce soir 22 h")
        self.assertNotIn("min_payout", info)
        self.assertNotIn("epidemic_hotline", info)
        hotline = self.client_for(self.doc_user).get("/api/pro/conditions").data["hotline"]
        self.assertEqual(hotline, "+221 33 800 00 00")

    def test_announcement_preview_and_send(self):
        c = self.client_for(self.admin)
        n = c.get("/api/admin/announcements?preview=1&audience=doctors").data["count"]
        self.assertEqual(n, 1)
        res = c.post("/api/admin/announcements", {"audience": "doctors", "title": "Nouvelle fonction", "body": "Le diagnostic codé est disponible.", "link": "/pro"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(Notification.objects.filter(user=self.doc_user, title="Nouvelle fonction").exists())
        self.assertFalse(Notification.objects.filter(user=self.p1, title="Nouvelle fonction").exists())
        self.assertEqual(Announcement.objects.get().recipients, 1)
        self.assertEqual(c.post("/api/admin/announcements", {"audience": "doctors", "title": "x", "body": "abc"}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/admin/announcements", {"audience": "doctors", "title": "Titre", "body": "Message ok", "link": "https://evil.com"}, format="json").status_code, 400)

    def test_search_overview_and_audit(self):
        c = self.client_for(self.admin)
        results = c.get("/api/admin/search?q=" + self.doctor.full_name[:5]).data["results"]
        self.assertTrue(any(r["type"] == "doctor" and r["id"] == str(self.doctor.id) for r in results))
        ov = c.get(f"/api/admin/doctors/{self.doctor.id}/overview")
        self.assertEqual(ov.status_code, 200, ov.data)
        self.assertIn("stats", ov.data)
        self.assertIn("balance", ov.data["finance"])
        self.assertEqual(len(c.get("/api/admin/doctors?status=verified").data), 1)
        log = c.get("/api/admin/audit?action=admin_user_search").data
        self.assertGreaterEqual(log["total"], 1)
        self.assertTrue(all(r["action"] == "admin_user_search" for r in log["results"]))
        self.assertTrue(log["actions"])
        self.assertEqual(c.get("/api/admin/audit?from=pas-une-date").status_code, 400)
        csv = c.get("/api/admin/audit?export=csv")
        self.assertEqual(csv.status_code, 200)
        self.assertIn("Recherche de compte", csv.content.decode("utf-8"))
