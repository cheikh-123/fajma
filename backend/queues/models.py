"""
Ticket virtuel pour les hôpitaux et centres de santé : le patient prend son numéro depuis chez lui (site, SMS,
WhatsApp ou USSD sans internet), suit sa place en temps réel et part au bon moment ; le guichet appelle les
numéros, l'écran de la salle d'attente les affiche.
"""

import secrets

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Facility(BaseModel):
    KINDS = [
        ("hopital", "Hôpital"),
        ("centre_sante", "Centre de santé"),
        ("poste_sante", "Poste de santé"),
        ("clinique", "Clinique"),
    ]

    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=14, choices=KINDS, default="hopital")
    city = models.CharField(max_length=80)
    district = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["city", "name"]

    def __str__(self):
        return self.name


class FacilityAgent(BaseModel):
    """Personnel d'accueil : appelle les numéros. Le responsable gère aussi les services et voit les statistiques."""

    ROLES = [("agent", "Agent d'accueil"), ("manager", "Responsable")]

    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="agents")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="queue_roles")
    role = models.CharField(max_length=8, choices=ROLES, default="agent")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["facility", "user"], name="facility_agent_unique")]


class QueueService(BaseModel):
    """File d'un service (consultation générale, pédiatrie, maternité…), numérotée chaque jour avec sa lettre."""

    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="services")
    name = models.CharField(max_length=120)
    prefix = models.CharField(max_length=2, default="A")  # « P12 » pour la pédiatrie
    opens_at = models.TimeField()
    closes_at = models.TimeField()
    open_days = models.JSONField(default=list)  # 1 = lundi … 7 = dimanche
    daily_capacity = models.PositiveIntegerField(null=True, blank=True)  # vide : pas de limite
    avg_minutes = models.PositiveSmallIntegerField(default=10)  # estimation de départ, affinée par les passages du jour
    notice_ahead = models.PositiveSmallIntegerField(default=3)  # SMS « c'est bientôt » quand il reste N personnes
    is_paused = models.BooleanField(default=False)  # tickets suspendus (salle pleine, médecin absent…)
    pause_message = models.CharField(max_length=200, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]


def ticket_code() -> str:
    """Code de suivi non devinable (lien envoyé par SMS) : 10 caractères sans 0/O/1/I."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(10))


class QueueTicket(BaseModel):
    STATUSES = [
        ("waiting", "En attente"),
        ("called", "Appelé"),
        ("done", "Reçu"),
        ("no_show", "Absent"),
        ("cancelled", "Annulé"),
        ("expired", "Expiré"),
    ]
    CHANNELS = [("web", "Site"), ("whatsapp", "WhatsApp"), ("ussd", "USSD"), ("desk", "Guichet")]
    PRIORITIES = [
        ("", "Aucune"),
        ("enceinte", "Femme enceinte"),
        ("age", "Personne âgée"),
        ("handicap", "Handicap"),
        ("enfant", "Jeune enfant"),
        ("urgence", "Urgence"),
    ]

    service = models.ForeignKey(QueueService, on_delete=models.CASCADE, related_name="tickets")
    day = models.DateField()
    number = models.PositiveIntegerField()
    code = models.CharField(max_length=12, unique=True, default=ticket_code)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="queue_tickets")
    phone = models.CharField(max_length=20, blank=True)
    name = models.CharField(max_length=120, blank=True)
    lang = models.CharField(max_length=2, default="fr")
    channel = models.CharField(max_length=10, choices=CHANNELS, default="web")
    status = models.CharField(max_length=10, choices=STATUSES, default="waiting")
    priority = models.CharField(max_length=10, choices=PRIORITIES, blank=True)
    # Temps de trajet indiqué par le patient : SMS « Partez maintenant » quand l'attente restante s'en approche.
    travel_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    desk = models.CharField(max_length=30, blank=True)  # guichet / box qui a appelé
    called_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    recalls = models.PositiveSmallIntegerField(default=0)
    soon_sent_at = models.DateTimeField(null=True, blank=True)
    leave_sent_at = models.DateTimeField(null=True, blank=True)
    called_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["day", "number"]
        constraints = [models.UniqueConstraint(fields=["service", "day", "number"], name="queue_ticket_number_unique")]
        indexes = [models.Index(fields=["service", "day", "status"], name="queue_ticket_live_idx")]

    @property
    def label(self) -> str:
        return f"{self.service.prefix}{self.number}"
