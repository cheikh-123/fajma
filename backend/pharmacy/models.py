from django.conf import settings
from django.db import models

from sunusante.models import BaseModel

OPEN_ORDER_STATUSES = ("sent", "preparing", "ready")


class PharmacyMember(BaseModel):
    """Pharmacien (ou employé) rattaché à une officine par l'administration, après vérification."""

    pharmacy = models.ForeignKey("directory.Pharmacy", on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pharmacy_memberships")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["pharmacy", "user"], name="pharmacy_member_unique")]


class MedicineQuery(BaseModel):
    """« Avez-vous ce médicament ? » : question d'un patient à quelques pharmacies, qui répondent dans les 24 h."""

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="medicine_queries")
    medicine = models.CharField(max_length=160)
    note = models.CharField(max_length=200, blank=True, help_text="Dosage, quantité, générique accepté…")
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]


class MedicineAnswer(BaseModel):
    STATUSES = [("pending", "En attente"), ("available", "Disponible"), ("unavailable", "Indisponible")]

    query = models.ForeignKey(MedicineQuery, on_delete=models.CASCADE, related_name="answers")
    pharmacy = models.ForeignKey("directory.Pharmacy", on_delete=models.CASCADE, related_name="medicine_answers")
    status = models.CharField(max_length=12, choices=STATUSES, default="pending")
    price = models.PositiveIntegerField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["query", "pharmacy"], name="unique_medicine_answer")]


class PrescriptionOrder(BaseModel):
    """
    Ordonnance transmise par le patient à une pharmacie : la pharmacie prépare les médicaments,
    le patient est prévenu quand c'est prêt (ou si un produit manque) et vient les retirer.
    """

    STATUSES = [
        ("sent", "Envoyée"),
        ("preparing", "En préparation"),
        ("ready", "Prête à retirer"),
        ("unavailable", "Indisponible"),
        ("collected", "Retirée"),
        ("cancelled", "Annulée"),
    ]
    TRANSITIONS = {
        "sent": {"preparing", "ready", "unavailable"},
        "preparing": {"ready", "unavailable"},
        "ready": {"collected"},
    }

    prescription = models.ForeignKey("medical.Prescription", on_delete=models.CASCADE, related_name="orders")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pharmacy_orders")
    pharmacy = models.ForeignKey("directory.Pharmacy", on_delete=models.CASCADE, related_name="orders")
    status = models.CharField(max_length=12, choices=STATUSES, default="sent")
    patient_note = models.CharField(max_length=300, blank=True)
    pharmacy_note = models.CharField(max_length=300, blank=True)
    total_price = models.PositiveIntegerField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True, help_text="Première consultation par la pharmacie")
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Une ordonnance n'est en cours que dans une seule pharmacie à la fois.
            models.UniqueConstraint(
                fields=["prescription"], condition=models.Q(status__in=OPEN_ORDER_STATUSES), name="one_open_order_per_prescription"
            ),
        ]
