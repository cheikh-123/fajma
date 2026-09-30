"""Notifications push : abonnement, envoi à chaque notification, nettoyage des abonnements expirés."""

from unittest import mock

from django.test import override_settings
from pywebpush import WebPushException

from notifications.models import PushSubscription
from notifications.service import notify

from .test_security import ApiTestCase

# Clés de test (générées par « manage.py vapid_keys », sans valeur en production).
KEYS = {
    "PUBLIC_KEY": "BKv1nX-S3vU04hm64FCN7umAumXYgnZytVCA1FATh4PXJaUwKGNlWqvl9ucU-R4Fx5nU6Spfl0yc2lmjfX50ScU",
    "PRIVATE_KEY": "C1uGx66mGJEXEtB_Klf1i-_gzRTjeq8Jni2rMjdENlo",
    "CONTACT": "mailto:test@fajma.sn",
}
SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "BPk", "auth": "xyz"}}


@override_settings(WEBPUSH=KEYS)
class PushTests(ApiTestCase):
    def subscribe(self, user=None, sub=SUB):
        return self.client_for(user or self.p1).post("/api/notifications/push/subscribe", sub, format="json")

    def test_key_and_subscription(self):
        self.assertEqual(self.client.get("/api/notifications/push/key").data["public_key"], KEYS["PUBLIC_KEY"])
        self.assertEqual(self.subscribe(sub={**SUB, "endpoint": "http://evil.example"}).status_code, 400)
        self.assertEqual(self.subscribe().status_code, 200)
        # Le même appareil repris par un autre compte n'est plus rattaché au premier.
        self.subscribe(user=self.p2)
        self.assertEqual(PushSubscription.objects.get().user, self.p2)
        self.client_for(self.p2).post("/api/notifications/push/unsubscribe", {"endpoint": SUB["endpoint"]}, format="json")
        self.assertFalse(PushSubscription.objects.exists())

    def test_notify_sends_push_and_drops_expired(self):
        self.subscribe()
        # L'envoi part après validation de la transaction : on exécute ces rappels dans le test.
        with mock.patch("pywebpush.webpush") as webpush, self.captureOnCommitCallbacks(execute=True):
            notify(self.p1, kind="test", title="RDV confirmé", body="Demain 10h", link="/mon-espace")
        payload = webpush.call_args.kwargs["data"]
        self.assertIn("RDV confirmé", payload)
        self.assertEqual(webpush.call_args.kwargs["vapid_claims"], {"sub": "mailto:test@fajma.sn"})
        gone = WebPushException("gone", response=mock.Mock(status_code=410))
        with mock.patch("pywebpush.webpush", side_effect=gone), self.captureOnCommitCallbacks(execute=True):
            notify(self.p1, kind="test", title="Autre")
        self.assertFalse(PushSubscription.objects.exists())

    @override_settings(WEBPUSH={"PUBLIC_KEY": "", "PRIVATE_KEY": "", "CONTACT": ""})
    def test_disabled_without_keys(self):
        self.assertIsNone(self.client.get("/api/notifications/push/key").data["public_key"])
        self.assertEqual(self.subscribe().status_code, 503)
