from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class VaccineDose(BaseModel):
    """Dose reçue (par le titulaire du compte ou un proche). Saisie par la famille ou par un médecin."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vaccine_doses")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.CASCADE, related_name="vaccine_doses")
    vaccine_code = models.CharField(max_length=20)
    given_on = models.DateField()
    recorded_by_doctor = models.ForeignKey("directory.Doctor", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["given_on"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "relative", "vaccine_code"], name="one_dose_per_code"),
            models.UniqueConstraint(
                fields=["owner", "vaccine_code"], condition=models.Q(relative__isnull=True), name="one_dose_per_code_self"
            ),
        ]


class VaccineReminder(BaseModel):
    """Trace d'un rappel envoyé (un seul par dose et par enfant)."""

    relative = models.ForeignKey("accounts.Relative", on_delete=models.CASCADE, related_name="+")
    vaccine_code = models.CharField(max_length=20)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["relative", "vaccine_code"], name="one_vaccine_reminder")]


class Pregnancy(BaseModel):
    STATUSES = [("active", "En cours"), ("ended", "Terminée")]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pregnancies")
    last_period = models.DateField(help_text="Premier jour des dernières règles")
    status = models.CharField(max_length=10, choices=STATUSES, default="active")
    ended_on = models.DateField(null=True, blank=True)
    child = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-last_period"]
        constraints = [
            models.UniqueConstraint(fields=["owner"], condition=models.Q(status="active"), name="one_active_pregnancy"),
        ]


class PrenatalVisit(BaseModel):
    """Consultation prénatale (CPN) faite, ou rappel envoyé pour ce contact."""

    pregnancy = models.ForeignKey(Pregnancy, on_delete=models.CASCADE, related_name="visits")
    contact = models.PositiveSmallIntegerField()
    done_on = models.DateField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["pregnancy", "contact"], name="one_visit_per_contact")]
