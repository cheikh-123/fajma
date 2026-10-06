"""
Relais communautaires (« badiénou gokh », agents de santé communautaires, relais de quartier ou de village) :
ils suivent sur Fajma les personnes qui n'ont ni smartphone ni internet — personnes âgées, mères et enfants,
malades chroniques — avec leur accord.

Chaque personne suivie est un « proche » du compte du relais : rendez-vous, carnet de vaccination, mesures
(tension, glycémie), assurances fonctionnent sans rien de nouveau. Le jour où elle a son propre téléphone, son
dossier entier lui est transféré (avec son accord, par code SMS).
"""

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class CommunityAgent(BaseModel):
    """Relais habilité par l'équipe Fajma (sur présentation de sa structure : poste de santé, ONG, district)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_agent")
    organization = models.CharField(max_length=160)  # « Badiénou Gokh de Pikine Est », « Poste de santé de Ndiaganiao »
    area = models.CharField(max_length=160)  # quartiers ou villages couverts
    is_active = models.BooleanField(default=True)
    max_people = models.PositiveSmallIntegerField(default=300)


class CommunityFollow(BaseModel):
    CONSENTS = [("oral", "Accord oral (devant témoin)"), ("signed", "Formulaire signé"), ("guardian", "Accord du tuteur ou parent")]
    STATUSES = [("active", "Suivi"), ("transferred", "Dossier transféré à la personne"), ("ended", "Suivi arrêté")]

    agent = models.ForeignKey(CommunityAgent, on_delete=models.PROTECT, related_name="follows")
    relative = models.OneToOneField("accounts.Relative", null=True, on_delete=models.SET_NULL, related_name="community_follow")
    full_name = models.CharField(max_length=120)  # gardé après transfert, pour l'historique du relais
    village = models.CharField(max_length=120, blank=True)
    consent = models.CharField(max_length=10, choices=CONSENTS)
    consent_witness = models.CharField(max_length=120, blank=True)
    consent_at = models.DateTimeField()
    notes = models.CharField(max_length=500, blank=True)  # repères utiles au relais (pas de données médicales)
    status = models.CharField(max_length=12, choices=STATUSES, default="active")
    transfer_code_hash = models.CharField(max_length=64, blank=True)
    transfer_phone = models.CharField(max_length=20, blank=True)
    transfer_expires_at = models.DateTimeField(null=True, blank=True)
    transfer_attempts = models.PositiveSmallIntegerField(default=0)
    transferred_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["full_name"]
