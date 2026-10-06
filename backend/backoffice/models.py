"""
Outils de l'équipe Fajma : rôles des administrateurs, réglages modifiables sans technicien, annonces groupées.
"""

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class StaffRole(BaseModel):
    """
    Rôle d'un membre de l'équipe (compte « staff »). Sans rôle enregistré : super-administrateur (tous les
    droits), ce qui garde le fonctionnement d'avant pour le fondateur.
    """

    ROLES = [
        ("superadmin", "Super-administrateur (tout)"),
        ("validation", "Validations (professionnels, justificatifs, réseau)"),
        ("support", "Support (comptes, demandes d'aide, avis, SMS)"),
        ("finance", "Finances (virements, remboursements)"),
        ("sante", "Santé publique (veille, déclarations)"),
        ("communication", "Communication (annonces, partenaires, campagnes)"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_role")
    role = models.CharField(max_length=14, choices=ROLES)


class PlatformSetting(BaseModel):
    """Réglage de la plateforme modifiable depuis l'administration (liste fermée : backoffice/settings_registry.py)."""

    key = models.CharField(max_length=40, unique=True)
    value = models.JSONField(null=True, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")


class Announcement(BaseModel):
    """Message envoyé à un groupe (médecins, pharmacies…) : notification, et au choix SMS et email."""

    AUDIENCES = [
        ("doctors", "Médecins"),
        ("pharmacies", "Pharmacies"),
        ("labs", "Laboratoires"),
        ("clinics", "Cliniques et secrétariats"),
        ("relais", "Relais communautaires"),
        ("patients", "Patients"),
        ("all", "Tous les utilisateurs"),
    ]

    audience = models.CharField(max_length=10, choices=AUDIENCES)
    city = models.CharField(max_length=80, blank=True)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=600)
    link = models.CharField(max_length=200, blank=True)
    sms = models.BooleanField(default=False)
    email = models.BooleanField(default=False)
    recipients = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
