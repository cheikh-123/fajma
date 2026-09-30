"""Exploitation : purge des données techniques anciennes (sans toucher au médical) et supervision."""

import io
import os
import tempfile
import time
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
