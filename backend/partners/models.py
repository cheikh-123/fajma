"""
Partenaires et campagnes sponsorisées, dans le respect de la santé publique :
- campagnes de prévention, offres d'assurance ou de mutuelle, produits sans ordonnance autorisés ; jamais de
  médicament sur ordonnance, jamais de médecin mis en avant contre paiement (classement neutre) ;
- mention « Sponsorisé » toujours affichée ; validation par l'équipe Fajma avant publication ;
- emplacements limités (accueil, recherche de médecins en encart séparé, espace patient) : jamais dans le
  dossier médical, une ordonnance ou une téléconsultation ;
- ciblage par ville et langue seulement, jamais à partir des données de santé ;
- statistiques agrégées (affichages, clics par jour) : aucune donnée personnelle.
"""

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Partner(BaseModel):
    KINDS = [
        ("assureur", "Assurance, IPM, mutuelle"),
        ("operateur", "Opérateur, paiement"),
        ("pharmacie", "Pharmacie, laboratoire"),
        ("institution", "Institution publique"),
        ("ong", "ONG, fondation"),
        ("entreprise", "Entreprise"),
        ("autre", "Autre"),
    ]

    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=KINDS)
    description = models.CharField(max_length=400, blank=True)
    website = models.URLField(blank=True)
    logo_path = models.CharField(max_length=300, blank=True)
    logo_mime = models.CharField(max_length=60, blank=True)
    is_public = models.BooleanField(default=True)  # affiché sur la page « Nos partenaires »
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]


class Campaign(BaseModel):
    CATEGORIES = [
        ("prevention", "Campagne de prévention / santé publique"),
        ("assurance", "Assurance, mutuelle"),
        ("produit", "Produit sans ordonnance autorisé"),
        ("service", "Service de santé (dépistage, laboratoire…)"),
    ]
    PLACEMENTS = [("home", "Page d'accueil"), ("search", "Recherche de médecins"), ("patient", "Espace patient")]
    STATUSES = [("draft", "Brouillon"), ("approved", "Validée"), ("paused", "Suspendue")]

    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="campaigns")
    title = models.CharField(max_length=80)
    body = models.CharField(max_length=200)
    cta_label = models.CharField(max_length=30, default="En savoir plus")
    cta_url = models.CharField(max_length=300)  # https://… ou adresse interne (/medecins?…)
    category = models.CharField(max_length=12, choices=CATEGORIES)
    placements = models.JSONField(default=list)
    cities = models.JSONField(default=list)  # vide : tout le Sénégal
    languages = models.JSONField(default=list)  # vide : toutes
    starts_on = models.DateField()
    ends_on = models.DateField()
    status = models.CharField(max_length=8, choices=STATUSES, default="draft")
    charter_checked = models.BooleanField(default=False)  # conformité à la charte vérifiée avant validation
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-starts_on"]


class CampaignStat(models.Model):
    """Compteurs agrégés par jour et emplacement : aucune donnée sur la personne qui voit ou clique."""

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="stats")
    day = models.DateField()
    placement = models.CharField(max_length=10)
    impressions = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "day", "placement"], name="campaign_stat_unique")]
