"""
Effacement d'un compte patient (droit à l'oubli) : à sa demande, ou automatiquement après une longue
inactivité (commande « purge_data », durée RETENTION_INACTIVE_ACCOUNT_DAYS, désactivée par défaut).

Les données personnelles, proches, profil de santé et documents déposés sont effacés ; les rendez-vous passés
et comptes-rendus restent chez le médecin (obligation de conservation), rattachés à un compte anonymisé.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from appointments.models import Appointment, AppointmentEvent

INACTIVE_NOTICE_DAYS = 30  # préavis par email avant l'anonymisation d'un compte inactif


def anonymize_patient(user, reason: str = "Compte supprimé") -> None:
    from medical.models import HealthProfile, MedicalDocument

    root = Path(settings.PRIVATE_MEDIA_ROOT)
    files = list(MedicalDocument.objects.filter(patient=user).values_list("file_path", flat=True))
    with transaction.atomic():
        MedicalDocument.objects.filter(patient=user).delete()
        HealthProfile.objects.filter(user=user).delete()
        user.support_requests.all().delete()
        user.relatives.all().delete()
        active = Appointment.objects.filter(patient=user, status__in=("pending", "confirmed"))
        AppointmentEvent.objects.bulk_create(
            AppointmentEvent(appointment=a, actor=user, action="cancelled", from_status=a.status, to_status="cancelled", note=reason)
            for a in active
        )
        active.update(status="cancelled", cancelled_by="patient", cancelled_at=timezone.now(), cancel_reason=reason)
        user.email = f"supprime-{user.id}@invalid.fajma"
        user.full_name = "Compte supprimé"
        user.phone = user.city = user.avatar_url = ""
        user.is_active = False
        user.phone_verified = False
        user.inactive_notice_at = None
        user.set_unusable_password()
        user.save()
    # Fichiers effacés après validation : jamais de document perdu pour une suppression annulée.
    for path in files:
        try:
            (root / path).unlink(missing_ok=True)
        except OSError:
            pass


def purge_inactive_accounts(days: int, *, dry_run: bool = False) -> tuple[int, int]:
    """
    Comptes patients sans connexion ni rendez-vous depuis `days` jours : préavis par email, puis anonymisation
    30 jours plus tard si la personne ne s'est pas reconnectée. Renvoie (préavis envoyés, comptes anonymisés).
    """
    from audit import log as audit
    from notifications.tasks import queue_email
    from sunusante.activity_report import patients_qs

    now = timezone.now()
    cutoff = now - timedelta(days=days)
    recent = Appointment.objects.filter(scheduled_at__gte=cutoff).values("patient_id")
    inactive = (
        patients_qs()
        .filter(is_active=True, date_joined__lt=cutoff)
        .exclude(last_login__gte=cutoff)
        .exclude(id__in=recent)
    )
    warned = purged = 0
    for user in inactive:
        notice = user.inactive_notice_at
        if notice and (user.last_login is None or user.last_login < notice):
            if notice <= now - timedelta(days=INACTIVE_NOTICE_DAYS):
                purged += 1
                if not dry_run:
                    anonymize_patient(user, "Compte inactif anonymisé")
                    audit.log(None, "inactive_account_purged", patient=user, inactive_days=days)
            continue
        warned += 1
        if dry_run:
            continue
        if user.email:
            queue_email(
                user.email,
                "Votre compte Fajma va être supprimé",
                f"Bonjour,\n\nVous ne vous êtes pas connecté à Fajma depuis longtemps. Sans connexion de votre part "
                f"d'ici {INACTIVE_NOTICE_DAYS} jours, votre compte sera anonymisé et vos documents effacés "
                f"(les comptes-rendus restent chez vos médecins, comme la loi l'exige).\n\n"
                f"Pour garder votre compte, connectez-vous simplement : {settings.PUBLIC_SITE_URL}/auth\n\nL'équipe Fajma",
            )
        user.inactive_notice_at = now
        user.save(update_fields=["inactive_notice_at"])
    return warned, purged
