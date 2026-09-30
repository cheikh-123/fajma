"""Aide et contact (demandes au support) ; guide de démarrage du médecin."""

from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from notifications.models import Notification
from support.models import SupportRequest

from .test_security import ApiTestCase


class SupportTests(ApiTestCase):
    def send(self, client=None, **data):
        payload = {"name": "Fatou Ndiaye", "contact": "77 555 44 33", "topic": "rdv", "message": "Je n'arrive pas à annuler mon rendez-vous de demain.", **data}
        return (client or APIClient()).post("/api/support", payload, format="json")

    def test_visitor_can_contact_support(self):
        res = self.send()
        self.assertEqual(res.status_code, 200, res.data)
        req = SupportRequest.objects.get()
        self.assertEqual((req.topic, req.status, req.user), ("rdv", "open", None))

    def test_validation_and_honeypot(self):
        self.assertEqual(self.send(contact="pas un contact").status_code, 400)
        self.assertEqual(self.send(message="court").status_code, 400)
        self.assertEqual(self.send(topic="inconnu").status_code, 400)
        # Robot qui remplit le champ caché : réponse normale, rien d'enregistré.
        self.assertEqual(self.send(website="http://spam.example").status_code, 200)
        self.assertFalse(SupportRequest.objects.exists())

    def test_logged_in_user_is_linked_and_notified(self):
        res = self.send(self.client_for(self.p1), name="", contact="")
        self.assertEqual(res.status_code, 200, res.data)
        req = SupportRequest.objects.get()
        self.assertEqual(req.user, self.p1)
        self.assertEqual(req.name, "Awa P1")
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="support").exists())

    @override_settings(ALERT_EMAILS=["support@fajma.sn"])
    def test_admin_follow_up(self):
        self.send()
        admin = User.objects.create_user(email="admin@test.sn", password="Mot-de-passe-solide-2026", full_name="Admin", is_staff=True)
        staff = self.client_for(admin)
        self.assertEqual(self.client_for(self.p1).get("/api/admin/support").status_code, 403)
        items = staff.get("/api/admin/support").data
        self.assertEqual(len(items), 1)
        self.assertEqual(staff.get("/api/admin/todo").data["support_open"], 1)
        res = staff.post(f"/api/admin/support/{items[0]['id']}", {"note": "Rappelée, RDV annulé"}, format="json")
        self.assertEqual(res.data["status"], "closed")
        self.assertEqual(staff.get("/api/admin/todo").data["support_open"], 0)
        self.assertEqual(len(staff.get("/api/admin/support", {"status": "all"}).data), 1)


class OnboardingTests(ApiTestCase):
    def test_steps_follow_doctor_setup(self):
        doc = self.client_for(self.doc_user)
        data = doc.get("/api/pro/onboarding").data
        steps = {s["id"]: s["done"] for s in data["steps"]}
        self.assertEqual(data["total"], 7)
        self.assertTrue(steps["schedule"])  # plages créées par le jeu de test
        self.assertTrue(steps["published"])
        self.assertFalse(steps["credential"])
        self.assertFalse(steps["prescription"])
        self.assertFalse(steps["mfa"])
        # Sans plage horaire, l'étape « emploi du temps » redevient à faire.
        self.doctor.availability.all().delete()
        steps = {s["id"]: s["done"] for s in doc.get("/api/pro/onboarding").data["steps"]}
        self.assertFalse(steps["schedule"])
        # Réservé aux médecins.
        self.assertNotEqual(self.client_for(self.p1).get("/api/pro/onboarding").status_code, 200)
