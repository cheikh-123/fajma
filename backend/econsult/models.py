"""
Avis médical écrit (consultation asynchrone), pensé pour les zones où la vidéo passe mal : le patient décrit
ses symptômes, ajoute des photos et ses mesures, paie, et le médecin répond par écrit dans le délai qu'il a
choisi (24 ou 48 h), avec une ordonnance si besoin, ou en conseillant de consulter en personne.

Chaque demande est un rendez-vous sans durée (mode « async ») : paiement, reçu, crédit santé familial,
compte-rendu, ordonnance et reversement au médecin fonctionnent comme pour une consultation, sans bloquer
aucun créneau de l'agenda. Pas de réponse dans le délai : la demande est annulée et remboursée.
"""

from django.db import models

from sunusante.models import BaseModel


class AsyncOffer(BaseModel):
    """Le médecin propose (ou non) l'avis écrit, à son prix et avec son délai de réponse."""

    doctor = models.OneToOneField("directory.Doctor", on_delete=models.CASCADE, related_name="async_offer")
    enabled = models.BooleanField(default=False)
    price = models.PositiveIntegerField(default=5000)
    response_hours = models.PositiveSmallIntegerField(default=24)  # 24 ou 48
    instructions = models.CharField(max_length=400, blank=True)  # « Photos nettes, à la lumière du jour… »


class AsyncRequest(BaseModel):
    STATUSES = [
        ("awaiting_payment", "En attente de paiement"),
        ("submitted", "Envoyée au médecin"),
        ("answered", "Réponse reçue"),
        ("expired", "Sans réponse : remboursée"),
        ("cancelled", "Annulée"),
    ]
    OUTCOMES = [
        ("advice", "Conseils"),
        ("prescription", "Ordonnance"),
        ("in_person", "Consultation en personne conseillée"),
        ("emergency", "Urgence : consulter immédiatement"),
    ]

    appointment = models.OneToOneField("appointments.Appointment", on_delete=models.CASCADE, related_name="async_request")
    status = models.CharField(max_length=16, choices=STATUSES, default="awaiting_payment")
    symptoms = models.TextField(max_length=3000)
    since = models.CharField(max_length=80, blank=True)  # « depuis 3 jours »
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    current_treatments = models.CharField(max_length=500, blank=True)
    deadline_at = models.DateTimeField(null=True, blank=True)
    answer = models.TextField(max_length=4000, blank=True)
    outcome = models.CharField(max_length=12, choices=OUTCOMES, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "deadline_at"], name="async_deadline_idx")]
