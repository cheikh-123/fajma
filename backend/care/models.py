from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Measurement(BaseModel):
    """
    Mesure saisie par le patient (ou pour son proche) : tension, glycémie ou poids. Visible par les médecins
    qui le suivent (mêmes règles que le profil de santé).
    """

    KINDS = [("blood_pressure", "Tension artérielle"), ("glucose", "Glycémie"), ("weight", "Poids")]
    CONTEXTS = [("", "—"), ("fasting", "À jeun"), ("after_meal", "Après un repas"), ("random", "Autre moment")]

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="measurements")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.CASCADE, related_name="measurements")
    kind = models.CharField(max_length=15, choices=KINDS)
    systolic = models.PositiveSmallIntegerField(null=True, blank=True)  # mmHg
    diastolic = models.PositiveSmallIntegerField(null=True, blank=True)  # mmHg
    pulse = models.PositiveSmallIntegerField(null=True, blank=True)  # battements par minute
    value = models.FloatField(null=True, blank=True)  # glycémie en g/L, poids en kg
    context = models.CharField(max_length=12, choices=CONTEXTS, blank=True)
    measured_at = models.DateTimeField()
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-measured_at"]
        indexes = [models.Index(fields=["patient", "kind", "measured_at"])]


class MedicationReminder(BaseModel):
    """Rappel de prise d'un médicament, aux heures choisies (heure de Dakar), du début à la fin du traitement."""

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="medication_reminders")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    prescription = models.ForeignKey("medical.Prescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    medicine = models.CharField(max_length=160)
    dosage = models.CharField(max_length=160, blank=True, help_text="Ex. 1 comprimé")
    times = models.JSONField(default=list)  # ["08:00", "20:00"]
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    sms = models.BooleanField(default=False, help_text="Aussi par SMS/WhatsApp (sinon notification gratuite sur le téléphone)")
    active = models.BooleanField(default=True)
    sent_keys = models.JSONField(default=list)  # « AAAA-MM-JJ HH:MM » déjà envoyés (les 30 derniers)

    class Meta:
        ordering = ["-created_at"]
