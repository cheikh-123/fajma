"""
Purge des données techniques au-delà de leur durée de conservation (settings.RETENTION_DAYS).
Lancée chaque nuit par le planificateur ; --dry-run affiche ce qui serait supprimé sans rien toucher.

    python manage.py purge_data [--dry-run]

Ne touche jamais aux données médicales : dossiers, comptes-rendus, ordonnances, documents, carnets.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone


class Command(BaseCommand):
    help = "Supprime les données techniques trop anciennes (durées : settings.RETENTION_DAYS)"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Compte sans supprimer")

    def handle(self, *args, dry_run=False, **options):
        from accounts.models import KnownDevice, OtpCode
        from appointments.models import Appointment
        from audit.models import AuditEvent
        from bots.models import BotSession
        from directory.models import ExternalBusy
        from notifications.models import Notification, SmsReminder
        from support.models import SupportRequest

        now = timezone.now()
        days = settings.RETENTION_DAYS

        def before(key):
            return now - timedelta(days=days[key])

        targets = {
            "sessions expirées": Session.objects.filter(expire_date__lt=now),
            "codes SMS": OtpCode.objects.filter(created_at__lt=before("otp_codes")),
            "conversations WhatsApp/USSD": BotSession.objects.filter(updated_at__lt=before("bot_sessions")),
            "SMS envoyés": SmsReminder.objects.filter(scheduled_for__lt=before("sms_reminders")),
            "notifications": Notification.objects.filter(created_at__lt=before("notifications")),
            "créneaux d'agendas importés": ExternalBusy.objects.filter(ends_at__lt=before("external_busy")),
            "demandes d'aide traitées": SupportRequest.objects.filter(status="closed", closed_at__lt=before("support_requests")),
            "appareils de connexion inutilisés": KnownDevice.objects.filter(last_seen_at__lt=before("known_devices")),
            "journal des accès": AuditEvent.objects.filter(created_at__lt=before("audit_events")),
        }
        # Patients sans compte (saisis au guichet) : on garde le RDV pour les statistiques, sans l'identité.
        walk_ins = Appointment.objects.filter(
            patient__isnull=True, scheduled_at__lt=before("walk_in_identity")
        ).exclude(external_patient_name="Patient anonymisé")

        report = {label: qs.count() for label, qs in targets.items()}
        report["identités de patients sans compte"] = walk_ins.count()
        if not dry_run:
            with transaction.atomic():
                for qs in targets.values():
                    qs.delete()
                walk_ins.update(external_patient_name="Patient anonymisé", external_patient_phone="", reason="", notes="")
        if days.get("inactive_accounts"):
            from accounts.erasure import purge_inactive_accounts

            warned, purged = purge_inactive_accounts(days["inactive_accounts"], dry_run=dry_run)
            report["préavis de compte inactif"] = warned
            report["comptes inactifs anonymisés"] = purged
        verb = "à supprimer" if dry_run else "supprimé(s)"
        self.stdout.write(" ; ".join(f"{label} : {n} {verb}" for label, n in report.items()))
