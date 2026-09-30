"""Accès démo sans identification : disponible en développement, impossible quand il est désactivé."""

from django.test import override_settings

from .test_security import ApiTestCase


class DemoLoginTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.demo_patient = self.make_user("patient@fajma.local", "Awa Ndiaye")

    @override_settings(DEMO_LOGIN=True)
    def test_demo_login_opens_session(self):
        client = self.client_for()
        self.assertTrue(client.get("/api/auth/demo-login").data["enabled"])
        res = client.post("/api/auth/demo-login", {"account": "patient"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["user"]["email"], "patient@fajma.local")
        self.assertEqual(client.get("/api/auth/me").data["user"]["email"], "patient@fajma.local")
        # Compte inconnu ou non créé par seed_demo : refusé.
        self.assertEqual(client.post("/api/auth/demo-login", {"account": "root"}, format="json").status_code, 400)
        self.assertEqual(client.post("/api/auth/demo-login", {"account": "admin"}, format="json").status_code, 400)

    @override_settings(DEMO_LOGIN=False)
    def test_demo_login_disabled(self):
        client = self.client_for()
        self.assertFalse(client.get("/api/auth/demo-login").data["enabled"])
        res = client.post("/api/auth/demo-login", {"account": "patient"}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertIsNone(client.get("/api/auth/me").data["user"])
