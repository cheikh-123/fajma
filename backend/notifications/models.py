from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class SmsReminder(BaseModel):
    KINDS = [("reminder_24h", "Rappel 24 h"), ("reminder_2h", "Rappel 2 h")]
    STATUSES = [
        ("pending", "En attente"),
        ("sending", "En cours d'envoi"),
        ("sent", "Envoyé"),
        ("delivered", "Livré"),
        ("failed", "Échec"),
    ]
    CHANNELS = [("sms", "SMS"), ("whatsapp", "WhatsApp")]

    appointment = models.ForeignKey("appointments.Appointment", on_delete=models.CASCADE, related_name="reminders")
    recipient_phone = models.CharField(max_length=30)
    message = models.TextField()
    kind = models.CharField(max_length=15, choices=KINDS)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    channel = models.CharField(max_length=10, choices=CHANNELS, default="sms")
    attempts = models.PositiveSmallIntegerField(default=0)
    provider_sid = models.CharField(max_length=64, blank=True, db_index=True)
    last_error = models.TextField(blank=True)
    scheduled_for = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-scheduled_for"]
        indexes = [models.Index(fields=["status", "scheduled_for"])]
        constraints = [models.UniqueConstraint(fields=["appointment", "kind"], name="unique_reminder_kind")]


class Notification(BaseModel):
    """Notification affichée dans l'application (cloche), éventuellement doublée d'un SMS ou d'un email."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, max_length=1000)
    link = models.CharField(max_length=300, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]


class PushSubscription(BaseModel):
    """Navigateur ou téléphone abonné aux notifications push (un par appareil)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.CharField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=200, blank=True)


class SmsOptOut(BaseModel):
    """
    Numéro qui a répondu STOP (SMS ou WhatsApp) ou que l'opérateur signale désinscrit : plus aucun SMS
    automatique (rappels, alertes), seulement les codes de connexion qu'il demande lui-même. START le réactive.
    """

    SOURCES = [("sms", "Réponse STOP par SMS"), ("whatsapp", "STOP sur WhatsApp"), ("carrier", "Désinscrit chez l'opérateur")]

    phone = models.CharField(max_length=30, unique=True)
    source = models.CharField(max_length=10, choices=SOURCES)
