"""
Met en file les rappels des rendez-vous confirmés (24 h et 2 h avant), puis envoie ceux qui sont dus.
À lancer toutes les 10 minutes par le planificateur du serveur (cron, systemd timer, tâche Windows) :

    python manage.py send_reminders
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import IntegrityError
from django.utils import timezone

from appointments.models import Appointment
from notifications.models import SmsReminder
from notifications.service import seen_by
from notifications.sms import build_reminder_message, normalize_phone, send_message

MAX_ATTEMPTS = 3


class Command(BaseCommand):
    help = "Planifie et envoie les rappels SMS / WhatsApp des rendez-vous"

    def handle(self, *args, **options):
        now = timezone.now()
        horizon = now + timedelta(hours=25)
        queued = self.enqueue(now, horizon)
        sent, failed = self.send_due(now)
        recalls = self.send_recalls(now)
        from carnet.reminders import send_prenatal_reminders, send_vaccine_reminders

        vaccines, prenatal = send_vaccine_reminders(), send_prenatal_reminders(now)
        from care.views import send_medication_reminders

        medications = send_medication_reminders(now)
        from medical.renewals import send_renewal_reminders

        renewals = send_renewal_reminders(now)
        from directory.credentials import send_expiry_reminders

        expiring = send_expiry_reminders(now)
        from queues.logic import expire_old_tickets

        expired_tickets = expire_old_tickets()
        from family.logic import send_family_reminders

        family = send_family_reminders(now)
        from econsult.views import expire_overdue

        overdue = expire_overdue(now)
        self.stdout.write(
            f"rappels : {queued} planifiés, {sent} envoyés, {failed} en échec ; {recalls} rappels patients ; "
            f"{vaccines} rappels vaccins ; {prenatal} rappels prénataux ; {medications} rappels de médicaments ; "
            f"{renewals} rappels de renouvellement ; {expiring} justificatifs à renouveler ; {expired_tickets} tickets de file expirés ; {family} rappels de recharge famille ; {overdue} avis écrits sans réponse remboursés"
        )

    def send_recalls(self, now) -> int:
        """Rappels programmés par les médecins (vaccins, contrôles) arrivés à échéance."""
        from medical.models import PatientRecall
        from notifications.service import notify

        count = 0
        for r in PatientRecall.objects.filter(sent_at__isnull=True, due_date__lte=timezone.localdate()).select_related("doctor", "patient"):
            notify(r.patient, kind="recall", title=f"Rappel de {r.doctor.full_name}", body=f"{r.message} Prenez rendez-vous sur Fajma.",
                   link=f"/medecins/{r.doctor_id}", sms=True, email=True)
            r.sent_at = now
            r.save(update_fields=["sent_at"])
            count += 1
        return count

    def enqueue(self, now, horizon) -> int:
        queued = 0
        appts = Appointment.objects.filter(status="confirmed", scheduled_at__gte=now, scheduled_at__lte=horizon).select_related(
            "doctor", "patient", "practitioner", "location"
        )
        for a in appts:
            if a.patient:
                name, raw_phone = a.patient.full_name, a.patient.phone
                channel, lang = a.patient.notification_channel, a.patient.preferred_language
            else:  # patient sans compte, saisi par le secrétariat
                name, raw_phone, channel, lang = a.external_patient_name, a.external_patient_phone, "sms", "fr"
            phone = normalize_phone(raw_phone)
            for kind, delta in (("reminder_24h", timedelta(hours=24)), ("reminder_2h", timedelta(hours=2))):
                at = a.scheduled_at - delta
                if at > horizon or SmsReminder.objects.filter(appointment=a, kind=kind).exists():
                    continue
                fields = {
                    "appointment": a,
                    "kind": kind,
                    "recipient_phone": phone or raw_phone or "inconnu",
                    "channel": channel,
                    "scheduled_for": at,
                    "message": build_reminder_message(
                        kind=kind, patient_name=name or None, doctor_name=seen_by(a), scheduled_at=a.scheduled_at,
                        mode=a.mode, city=a.location.city if a.location else a.doctor.city, lang=lang,
                    ),
                }
                if not phone:
                    fields.update(status="failed", last_error="Numéro de téléphone manquant ou invalide", attempts=MAX_ATTEMPTS)
                try:
                    SmsReminder.objects.create(**fields)
                    queued += 1
                except IntegrityError:
                    pass  # déjà planifié par une exécution concurrente
        return queued

    def send_due(self, now) -> tuple[int, int]:
        token = settings.TWILIO["STATUS_TOKEN"]
        callback = f"{settings.PUBLIC_SITE_URL}/api/notifications/twilio-status?token={token}" if token else None
        sent = failed = 0
        # Envoi interrompu (serveur arrêté entre la réservation et la fin de l'envoi) : on ne sait pas si le SMS
        # est parti, il n'est donc PAS renvoyé (mieux vaut un rappel manquant que le même SMS plusieurs fois).
        SmsReminder.objects.filter(status="sending", updated_at__lt=now - timedelta(minutes=30)).update(
            status="failed", last_error="Envoi interrompu : non renvoyé pour éviter un doublon"
        )
        for r in SmsReminder.objects.filter(status="pending", scheduled_for__lte=now, attempts__lt=MAX_ATTEMPTS)[:50]:
            # Réservation atomique : si deux exécutions tournent en même temps, une seule obtient ce rappel.
            claimed = SmsReminder.objects.filter(pk=r.pk, status="pending", attempts=r.attempts).update(
                status="sending", attempts=r.attempts + 1, updated_at=timezone.now()
            )
            if not claimed:
                continue
            r.attempts += 1
            result = send_message(to=r.recipient_phone, body=r.message, channel=r.channel, status_callback=callback)
            if result.ok:
                sent += 1
                r.status, r.provider_sid, r.channel, r.sent_at, r.last_error = "sent", result.sid, result.channel, timezone.now(), ""
            else:
                failed += 1
                exhausted = result.permanent or r.attempts >= MAX_ATTEMPTS
                r.status = "failed" if exhausted else "pending"
                r.attempts = MAX_ATTEMPTS if result.permanent else r.attempts
                r.last_error = result.error
            r.save()
        return sent, failed
