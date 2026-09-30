"""Temps réel : le flux d'événements pousse les nouveaux messages et notifications du seul destinataire."""

from django.test import override_settings

from notifications.service import notify

from .test_security import ApiTestCase


@override_settings(EVENTS_STREAM_SECONDS=0.5, EVENTS_POLL_SECONDS=0.05)
class RealtimeTests(ApiTestCase):
    def read_stream(self, user, before=None):
        """Ouvre le flux, déclenche `before` pendant qu'il est ouvert, renvoie tout le texte reçu."""
        from django.test import Client

        from accounts.models import TwoFactor

        # Compte professionnel : la double authentification est obligatoire pour utiliser l'API.
        TwoFactor.objects.get_or_create(user=user, defaults={"secret": "JBSWY3DPEHPK3PXP", "enabled": True})
        client = Client()
        client.force_login(user)
        res = client.get("/api/events")
        self.assertEqual(res["Content-Type"], "text/event-stream; charset=utf-8")
        chunks = []
        for i, chunk in enumerate(res.streaming_content):
            chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
            if i == 0 and before:
                before()
        return "".join(chunks)

    def test_message_pushed_to_recipient_only(self):
        self.book(self.p1)

        def send():
            self.client_for(self.p1).post("/api/messages/send", {"doctor_id": str(self.doctor.id), "patient_id": str(self.p1.id), "body": "Bonjour docteur"}, format="json")

        text = self.read_stream(self.doc_user, before=send)
        self.assertIn("event: message", text)
        self.assertIn("Bonjour docteur", text)
        self.assertNotIn("Bonjour docteur", self.read_stream(self.p2, before=send))

    def test_notification_pushed(self):
        text = self.read_stream(self.p1, before=lambda: notify(self.p1, kind="test", title="RDV confirmé"))
        self.assertIn("event: notification", text)
        self.assertIn("RDV confirmé", text)
        self.assertTrue(text.startswith("retry: 3000"))

    def test_requires_login(self):
        self.assertEqual(self.client.get("/api/events").status_code, 401)
