from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Message(BaseModel):
    """Message d'un fil patient ↔ médecin (un fil = un couple médecin, patient)."""

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="messages")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="patient_messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sent_messages")
    body = models.TextField(max_length=4000, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    # Pièce jointe facultative (photo ou PDF), stockée hors du dossier public.
    attachment_path = models.CharField(max_length=300, blank=True)
    attachment_name = models.CharField(max_length=200, blank=True)
    attachment_mime = models.CharField(max_length=60, blank=True)
    attachment_size = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["doctor", "patient", "created_at"])]
