from django.db import models

from sunusante.models import BaseModel


class BotSession(BaseModel):
    """
    Conversation en cours (WhatsApp : par numéro ; USSD : par session opérateur).
    inputs = réponses successives ; memo = listes proposées, figées pour que le choix n° 2
    désigne toujours ce qui a été affiché, même si l'agenda change entre deux messages.
    """

    CHANNELS = [("whatsapp", "WhatsApp"), ("ussd", "USSD")]

    channel = models.CharField(max_length=10, choices=CHANNELS)
    key = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    inputs = models.JSONField(default=list)
    memo = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["channel", "key"], name="bot_session_unique")]
