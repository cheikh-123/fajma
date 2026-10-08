"""Exploitation : purge des données techniques anciennes (sans toucher au médical) et supervision."""

import io
import os
import tempfile
import time
from unittest import mock
from datetime import timedelta

from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from accounts.models import OtpCode
from appointments.models import Appointment
from audit.models import AuditEvent
from medical.models import MedicalRecord
from notifications.models import Notification, SmsReminder

from .test_security import ApiTestCase


def run(*args) -> str:
    out = io.StringIO()
    try:
        call_command(*args, stdout=out, stderr=io.StringIO())
    except SystemExit:
        pass
    return out.getvalue()


class PurgeTests(ApiTestCase):
    def test_old_technical_data_purged_medical_kept(self):
        old = timezone.now() - timedelta(days=2000)
        OtpCode.objects.create(phone="+221770000000", code_hash="x", expires_at=old)
        OtpCode.objects.filter().update(created_at=old)
        Notification.objects.create(user=self.p1, kind="test", title="vieille")
        Notification.objects.update(created_at=old)
        Notification.objects.create(user=self.p1, kind="test", title="récente")
        AuditEvent.objects.create(action="login")
        AuditEvent.objects.update(created_at=old)
        walk_in = Appointment.objects.create(
            doctor=self.doctor, external_patient_name="Moussa Diallo", external_patient_phone="770000000",
            scheduled_at=old, status="completed", reason="Toux",
        )
        MedicalRecord.objects.create(appointment=walk_in, patient=self.p1, doctor=self.doctor, summary="Ancien compte-rendu")
        self.assertIn("codes SMS : 1 à supprimer", run("purge_data", "--dry-run"))
        self.assertEqual(OtpCode.objects.count(), 1)  # --dry-run ne supprime rien
        run("purge_data")
        self.assertEqual(OtpCode.objects.count(), 0)
        self.assertEqual(list(Notification.objects.values_list("title", flat=True)), ["récente"])
        self.assertEqual(AuditEvent.objects.count(), 0)
        walk_in.refresh_from_db()
        self.assertEqual((walk_in.external_patient_name, walk_in.external_patient_phone, walk_in.reason), ("Patient anonymisé", "", ""))
        self.assertEqual(MedicalRecord.objects.count(), 1)  # jamais de purge médicale


@override_settings(ALERT_EMAILS=["ops@fajma.sn"], PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class MonitorTests(ApiTestCase):
    def test_backup_check_and_alert_once_then_resolved(self):
        backups = tempfile.mkdtemp()
        with override_settings(BACKUP_DIR=backups):
            run("monitor")
            self.assertEqual(len(mail.outbox), 1)
            self.assertIn("aucune sauvegarde", mail.outbox[0].body)
            run("monitor")
            self.assertEqual(len(mail.outbox), 1)  # pas de répétition avant 6 h
            path = os.path.join(backups, "fajma-2026-10-01_0300.tar.gz")
            with open(path, "wb") as f:
                f.write(b"x" * 4096)
            run("monitor")
            self.assertIn("Résolu", mail.outbox[-1].subject)
            old = time.time() - 30 * 3600
            os.utime(path, (old, old))
            run("monitor")
            self.assertIn("vieille de 30 h", mail.outbox[-1].body)

    def test_overdue_reminders_detected(self):
        appt = Appointment.objects.create(doctor=self.doctor, patient=self.p1, scheduled_at=timezone.now() + timedelta(hours=1))
        SmsReminder.objects.create(
            appointment=appt, kind="reminder_2h", recipient_phone="+221771234567", message="x",
            scheduled_for=timezone.now() - timedelta(hours=1),
        )
        with override_settings(BACKUP_DIR=""):
            out = run("monitor")
        self.assertIn("1 rappel(s) non envoyé(s)", out)


@override_settings(ALERT_EMAILS=["ops@fajma.sn"], BACKUP_DIR="", PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class SecurityAlertTests(ApiTestCase):
    """Les signaux qui trahissent une attaque en cours sont lus dans le journal d'audit et déclenchent une
    alerte. Les seuils sont larges à dessein : une alerte qui sonne pour rien finit ignorée."""

    def fail_logins(self, email: str, count: int, *, minutes_ago: int = 1):
        for _ in range(count):
            AuditEvent.objects.create(action="login_failed", metadata={"email": email})
        AuditEvent.objects.filter(action="login_failed", created_at__gte=timezone.now() - timedelta(seconds=5)).update(
            created_at=timezone.now() - timedelta(minutes=minutes_ago)
        )

    def test_vague_de_mots_de_passe_detectee(self):
        self.fail_logins("victime@test.sn", 59)
        self.assertNotIn("mots de passe essayés en masse :", run("monitor").replace("mots de passe essayés en masse : ok", ""))
        self.fail_logins("victime@test.sn", 1)
        out = run("monitor")
        self.assertIn("60 échecs de connexion en 15 min", out)
        self.assertIn("ALERTE", mail.outbox[-1].subject)

    def test_rien_ne_sonne_sous_le_seuil(self):
        self.fail_logins("victime@test.sn", 20)
        out = run("monitor")
        self.assertIn("mots de passe essayés en masse : ok", out)
        # L'espace disque de la machine peut déclencher sa propre alerte : on vérifie seulement qu'aucune
        # alerte de sécurité n'est partie.
        self.assertFalse([m for m in mail.outbox if "mots de passe" in m.body])

    def test_attaque_repartie_sur_plusieurs_comptes(self):
        # Chaque compte reste sous le seuil global, mais cinq comptes atteignent leur verrou : c'est le
        # schéma d'une attaque répartie, invisible pour une limite par adresse IP.
        for i in range(5):
            self.fail_logins(f"cible{i}@test.sn", 10, minutes_ago=40)
        out = run("monitor")
        self.assertIn("5 compte(s) verrouillé(s) en 1 h", out)

    def test_fiches_urgence_consultees_en_masse(self):
        for _ in range(30):
            AuditEvent.objects.create(action="emergency_card_viewed")
        self.assertIn("30 consultations par QR code", run("monitor"))

    def test_rafale_d_actions_d_administration(self):
        for _ in range(10):
            AuditEvent.objects.create(action="admin_user_reset_mfa")
        self.assertIn("réinitialisations de 2FA en 1 h", run("monitor"))

    def test_les_alertes_graves_partent_aussi_par_sms(self):
        self.fail_logins("victime@test.sn", 60)
        with override_settings(ALERT_PHONES=["+221770000000"]), mock.patch(
            "notifications.sms.send_message"
        ) as send:
            run("monitor")
        self.assertEqual(send.call_count, 1)
        self.assertIn("mots de passe essayés en masse", send.call_args.kwargs["body"])
        self.assertTrue(send.call_args.kwargs["essential"])  # jamais bloqué par un STOP

    def test_un_probleme_mineur_ne_reveille_personne_par_sms(self):
        for _ in range(30):
            AuditEvent.objects.create(action="emergency_card_viewed")
        with override_settings(ALERT_PHONES=["+221770000000"]), mock.patch(
            "notifications.sms.send_message"
        ) as send:
            run("monitor")
        self.assertEqual(send.call_count, 0)
        self.assertIn("ALERTE", mail.outbox[-1].subject)  # mais l'email, lui, part bien
