"""Renforcements avant mise en service : chiffrement des fichiers, antivirus, inactivité, alerte nouvel appareil."""

import base64
import io
import tempfile
import time
from unittest import mock

from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.devices import COOKIE
from accounts.models import KnownDevice
from medical.models import MedicalDocument
from notifications.models import Notification
from sunusante import uploads

from .test_security import ApiTestCase

PDF = b"%PDF-1.4\n% Resultats confidentiels : glycemie 1,02 g/L\n"


def upload(client, content=PDF):
    return client.post(
        "/api/documents/",
        {"title": "Bilan", "file_name": "bilan.pdf", "content_base64": base64.b64encode(content).decode()},
        format="json",
    )


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class FileEncryptionTests(ApiTestCase):
    def test_documents_are_encrypted_on_disk(self):
        patient = self.client_for(self.p1)
        self.assertEqual(upload(patient).status_code, 200)
        doc = MedicalDocument.objects.get()
        on_disk = uploads.storage_path(doc.file_path).read_bytes()
        self.assertTrue(on_disk.startswith(uploads.ENCRYPTED_MAGIC))
        self.assertNotIn(b"glycemie", on_disk)
        res = patient.get(f"/api/documents/{doc.id}/download")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, PDF)

    def test_legacy_plain_files_still_readable_then_encrypted(self):
        path = uploads.storage_path("ancien/1-bilan.pdf")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PDF)
        self.assertEqual(uploads.read("ancien/1-bilan.pdf"), PDF)
        call_command("encrypt_files", stdout=io.StringIO())
        self.assertTrue(path.read_bytes().startswith(uploads.ENCRYPTED_MAGIC))
        self.assertEqual(uploads.read("ancien/1-bilan.pdf"), PDF)

    def test_tampered_file_is_refused(self):
        patient = self.client_for(self.p1)
        upload(patient)
        doc = MedicalDocument.objects.get()
        path = uploads.storage_path(doc.file_path)
        path.write_bytes(path.read_bytes()[:-5] + b"xxxxx")
        self.assertEqual(patient.get(f"/api/documents/{doc.id}/download").status_code, 404)


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp(), CLAMAV_ADDRESS="clamav:3310")
class AntivirusTests(ApiTestCase):
    def test_infected_file_refused(self):
        with mock.patch("sunusante.uploads._clamd_scan", return_value="Eicar-Test-Signature"):
            res = upload(self.client_for(self.p1))
        self.assertEqual(res.status_code, 400)
        self.assertIn("antivirus", res.data["error"])
        self.assertFalse(MedicalDocument.objects.exists())

    def test_antivirus_down_refuses_upload(self):
        with mock.patch("sunusante.uploads._clamd_scan", side_effect=OSError("connexion refusée")):
            res = upload(self.client_for(self.p1))
        self.assertEqual(res.status_code, 503)
        self.assertFalse(MedicalDocument.objects.exists())

    def test_clean_file_accepted(self):
        with mock.patch("sunusante.uploads._clamd_scan", return_value=None) as scan:
            self.assertEqual(upload(self.client_for(self.p1)).status_code, 200)
        scan.assert_called_once_with(PDF)


@override_settings(MFA_REQUIRED_FOR_PROS=False, PRO_IDLE_MINUTES=30)
class IdleTimeoutTests(ApiTestCase):
    def session_client(self, user):
        client = APIClient()
        client.force_login(user)
        return client

    def age_session(self, client, seconds):
        session = client.session
        session["active_at"] = int(time.time()) - seconds
        session.save()

    def test_professional_logged_out_after_inactivity(self):
        doc = self.session_client(self.doc_user)
        self.assertEqual(doc.get("/api/pro/appointments", HTTP_X_FAJMA_IDLE="0").status_code, 200)
        self.age_session(doc, 31 * 60)
        res = doc.get("/api/pro/appointments", HTTP_X_FAJMA_IDLE="0")
        self.assertEqual(res.status_code, 401)
        self.assertTrue(res.json()["session_expired"])
        self.assertIsNone(doc.get("/api/auth/me").json()["user"])

    def test_background_refresh_does_not_extend_session(self):
        doc = self.session_client(self.doc_user)
        doc.get("/api/pro/appointments", HTTP_X_FAJMA_IDLE="0")
        self.age_session(doc, 20 * 60)
        # Rafraîchissement automatique : l'utilisateur n'a rien touché depuis 20 min.
        doc.get("/api/pro/appointments", HTTP_X_FAJMA_IDLE=str(20 * 60))
        session = doc.session
        self.assertLessEqual(session["active_at"], int(time.time()) - 20 * 60 + 2)
        # Un vrai clic prolonge la session.
        doc.get("/api/pro/appointments", HTTP_X_FAJMA_IDLE="1")
        self.assertGreater(doc.session["active_at"], int(time.time()) - 5)

    def test_patient_not_affected(self):
        patient = self.session_client(self.p1)
        patient.get("/api/auth/me")
        self.age_session(patient, 3 * 3600)
        self.assertEqual(patient.get("/api/auth/me").status_code, 200)


class NewDeviceAlertTests(ApiTestCase):
    def login(self, client):
        return client.post("/api/auth/login", {"email": "p2@test.sn", "password": "Mot-de-passe-solide-2026"}, format="json")

    def test_alert_only_for_unknown_browser(self):
        home = APIClient()
        self.assertEqual(self.login(home).status_code, 200)
        self.assertIn(COOKIE, home.cookies)
        self.assertFalse(Notification.objects.filter(user=self.p2, kind="security").exists())  # premier appareil
        home.post("/api/auth/logout")
        self.login(home)
        self.assertFalse(Notification.objects.filter(user=self.p2, kind="security").exists())  # appareil connu
        elsewhere = APIClient(HTTP_USER_AGENT="Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36")
        self.login(elsewhere)
        alert = Notification.objects.get(user=self.p2, kind="security")
        self.assertIn("Chrome sur Android", alert.body)
        self.assertEqual(KnownDevice.objects.filter(user=self.p2).count(), 2)
        # Le jeton n'est stocké que haché.
        self.assertFalse(KnownDevice.objects.filter(token_hash=home.cookies[COOKIE].value).exists())
