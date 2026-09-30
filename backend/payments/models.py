from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Payment(BaseModel):
    METHODS = [("wave", "Wave"), ("orange_money", "Orange Money"), ("free_money", "Free Money"), ("cash", "Espèces")]
    STATUSES = [("pending", "En attente"), ("paid", "Payé"), ("failed", "Échoué"), ("refunded", "Remboursé")]

    appointment = models.ForeignKey("appointments.Appointment", on_delete=models.CASCADE, related_name="payments")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payments")
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="XOF")
    method = models.CharField(max_length=15, choices=METHODS)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    reference = models.CharField(max_length=40)
    phone = models.CharField(max_length=30, blank=True)
    provider = models.CharField(max_length=20, default="paydunya")
    provider_token = models.CharField(max_length=128, null=True, blank=True, unique=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Refund(BaseModel):
    """Remboursement d'un paiement en ligne (RDV annulé). Versé au patient par l'administration."""

    STATUSES = [("pending", "À rembourser"), ("done", "Remboursé")]

    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="refund")
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    reason = models.CharField(max_length=200, blank=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    processed_at = models.DateTimeField(null=True, blank=True)
    transfer_reference = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Payout(BaseModel):
    """Virement demandé par un médecin, à partir de son solde de paiements en ligne."""

    METHODS = [("wave", "Wave"), ("orange_money", "Orange Money"), ("bank", "Virement bancaire")]
    STATUSES = [("requested", "Demandé"), ("paid", "Versé"), ("rejected", "Refusé")]

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="payouts")
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=15, choices=METHODS)
    destination = models.CharField(max_length=60, help_text="Numéro mobile money ou IBAN")
    status = models.CharField(max_length=10, choices=STATUSES, default="requested")
    reference = models.CharField(max_length=40, unique=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    processed_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Une seule demande en cours par médecin : évite les doubles retraits.
            models.UniqueConstraint(fields=["doctor"], condition=models.Q(status="requested"), name="one_open_payout_per_doctor"),
        ]


class LedgerEntry(BaseModel):
    """
    Journal comptable du médecin : chaque mouvement de son solde, jamais modifié ni supprimé.
    Solde = somme des montants. Seuls les paiements en ligne y figurent (les espèces vont directement au médecin).
    """

    KINDS = [
        ("earning", "Consultation payée en ligne"),
        ("refund", "Remboursement au patient"),
        ("payout", "Virement au médecin"),
        ("payout_reversal", "Virement refusé (recrédité)"),
    ]

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="ledger")
    kind = models.CharField(max_length=20, choices=KINDS)
    amount = models.IntegerField(help_text="Montant net pour le médecin (négatif = débit)")
    gross = models.PositiveIntegerField(default=0)
    commission = models.PositiveIntegerField(default=0)
    commission_percent = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries")
    payout = models.ForeignKey(Payout, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries")
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Idempotence : un paiement ne peut être crédité (ou remboursé) qu'une fois.
            models.UniqueConstraint(fields=["payment", "kind"], condition=models.Q(payment__isnull=False), name="ledger_once_per_payment"),
            models.UniqueConstraint(fields=["payout", "kind"], condition=models.Q(payout__isnull=False), name="ledger_once_per_payout"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Une écriture comptable ne peut pas être modifiée")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Une écriture comptable ne peut pas être supprimée")


class Subscription(BaseModel):
    """Formule du médecin. Sans abonnement payé en cours, il est en formule Essentiel (gratuite)."""

    doctor = models.OneToOneField("directory.Doctor", on_delete=models.CASCADE, related_name="subscription")
    plan = models.CharField(max_length=20, default="essentiel")
    current_period_end = models.DateTimeField(null=True, blank=True)


class SubscriptionPayment(BaseModel):
    STATUSES = [("pending", "En attente"), ("paid", "Payé"), ("failed", "Échoué")]

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="subscription_payments")
    plan = models.CharField(max_length=20)
    months = models.PositiveSmallIntegerField()
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    reference = models.CharField(max_length=40, unique=True)
    provider_token = models.CharField(max_length=128, null=True, blank=True, unique=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
