from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models

from sunusante.models import BaseModel


class Insurer(BaseModel):
    """Organisme qui rembourse les soins : IPM d'entreprise, mutuelle (CMU), assureur privé."""

    KINDS = [("ipm", "IPM"), ("mutuelle", "Mutuelle de santé / CMU"), ("assurance", "Assurance privée"), ("public", "Programme public")]

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=KINDS)
    default_coverage_percent = models.PositiveSmallIntegerField(default=80, validators=[MaxValueValidator(100)])
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["kind", "name"]

    def __str__(self):
        return self.name


class PatientCoverage(BaseModel):
    """Prise en charge déclarée par le patient, pour lui ou pour un proche (numéro d'adhérent, taux)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coverages")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.CASCADE, related_name="coverages")
    insurer = models.ForeignKey(Insurer, on_delete=models.PROTECT, related_name="coverages")
    member_number = models.CharField(max_length=40)
    coverage_percent = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    valid_until = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]


class DoctorInsurer(BaseModel):
    """
    Organisme accepté par le médecin. Avec tiers payant, le patient ne règle que sa part ;
    le reste est facturé par le cabinet à l'organisme.
    """

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="accepted_insurers")
    insurer = models.ForeignKey(Insurer, on_delete=models.CASCADE, related_name="doctors")
    tiers_payant = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["doctor", "insurer"], name="doctor_insurer_unique")]
