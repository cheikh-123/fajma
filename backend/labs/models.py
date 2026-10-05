import secrets

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Laboratory(BaseModel):
    name = models.CharField(max_length=160)
    city = models.CharField(max_length=80)
    district = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=200)
    phone = models.CharField(max_length=30, blank=True)
    opening_hours = models.CharField(max_length=160, blank=True, help_text="Ex. lun.–sam. 7 h 30 – 18 h, prélèvements jusqu'à 11 h")
    # Reçoit les demandes d'analyses en ligne seulement après contrôle de ses justificatifs par Fajma.
    is_verified = models.BooleanField(default=False)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["city", "name"]
        verbose_name_plural = "laboratories"


class LaboratoryMember(BaseModel):
    """Compte du personnel d'un laboratoire, rattaché par l'administration après vérification."""

    laboratory = models.ForeignKey(Laboratory, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lab_memberships")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["laboratory", "user"], name="unique_lab_member")]


def new_lab_reference() -> str:
    return f"LAB-{secrets.token_hex(4).upper()}"


class LabOrder(BaseModel):
    """
    Prescription d'analyses. Cycle : prescrite → envoyée (au laboratoire choisi par le patient) → prélèvement
    reçu → résultats disponibles. Les résultats sont des documents du dossier du patient, partagés
    automatiquement avec le médecin prescripteur.
    """

    STATUSES = [
        ("prescribed", "Prescrite"),
        ("sent", "Envoyée au laboratoire"),
        ("received", "Prélèvement effectué"),
        ("completed", "Résultats disponibles"),
        ("cancelled", "Annulée"),
    ]

    reference = models.CharField(max_length=16, unique=True, default=new_lab_reference)
    appointment = models.ForeignKey("appointments.Appointment", null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_orders")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="lab_orders")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_orders")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    tests = models.TextField(max_length=2000)
    instructions = models.CharField(max_length=300, blank=True, help_text="Ex. à jeun depuis 12 h")
    urgent = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=STATUSES, default="prescribed", db_index=True)
    laboratory = models.ForeignKey(Laboratory, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    sent_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    result_note = models.TextField(blank=True, max_length=2000)
    results = models.ManyToManyField("medical.MedicalDocument", blank=True, related_name="lab_orders")

    class Meta:
        ordering = ["-created_at"]
