"""Demandes d'aide envoyées depuis la page « Aide et contact », traitées par l'équipe Fajma."""

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class SupportRequest(BaseModel):
    TOPICS = [
        ("compte", "Connexion et compte"),
        ("rdv", "Rendez-vous"),
        ("paiement", "Paiement et remboursement"),
        ("ordonnance", "Ordonnances et documents"),
        ("pro", "Espace professionnel"),
        ("donnees", "Mes données personnelles"),
        ("autre", "Autre question"),
    ]
    STATUSES = [("open", "À traiter"), ("closed", "Traitée")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="support_requests")
    name = models.CharField(max_length=120)
    contact = models.CharField(max_length=254)  # email ou téléphone pour la réponse
    topic = models.CharField(max_length=12, choices=TOPICS)
    message = models.TextField(max_length=3000)
    status = models.CharField(max_length=6, choices=STATUSES, default="open")
    admin_note = models.CharField(max_length=500, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
