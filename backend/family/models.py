"""
« Je paie la santé de mes parents » : un proche (souvent à l'étranger) aide un membre de sa famille au Sénégal.

Lien d'entraide (CareLink) accepté par le bénéficiaire : il reçoit par SMS un code qu'il donne à son proche
(au téléphone) ; c'est la preuve de son accord, même sans smartphone. Droits choisis à l'invitation et annoncés
dans le SMS : payer ses consultations (toujours), prendre ses rendez-vous, recevoir ses comptes-rendus et
ordonnances. Le bénéficiaire peut retirer l'accès à tout moment.

Crédit santé : le proche recharge un montant (carte bancaire ou mobile money via PayDunya), utilisé ensuite pour
payer les consultations du bénéficiaire, par lui-même ou par le proche. Journal des mouvements jamais modifié.
"""

from django.conf import settings
from django.db import models

from payments.models import ReceiptNumbered
from sunusante.models import BaseModel


class CareLink(BaseModel):
    STATUSES = [("pending", "En attente d'accord"), ("active", "Actif"), ("revoked", "Retiré"), ("expired", "Invitation expirée")]

    sponsor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="care_links_given")
    beneficiary = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="care_links_received")
    label = models.CharField(max_length=60)  # comment le proche l'appelle : « Maman », « Tonton Ibrahima »
    status = models.CharField(max_length=8, choices=STATUSES, default="pending")
    can_book = models.BooleanField(default=False)
    can_see_records = models.BooleanField(default=False)
    invite_code_hash = models.CharField(max_length=64, blank=True)
    invite_expires_at = models.DateTimeField(null=True, blank=True)
    invite_attempts = models.PositiveSmallIntegerField(default=0)
    invites_sent = models.PositiveSmallIntegerField(default=0)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Rappel mensuel de recharge (0 : aucun), et alerte quand le crédit passe sous ce seuil.
    monthly_reminder_amount = models.PositiveIntegerField(default=0)
    monthly_reminded_at = models.DateTimeField(null=True, blank=True)
    low_balance_alert = models.PositiveIntegerField(default=5000)
    low_balance_alerted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["sponsor", "beneficiary"], condition=models.Q(status__in=["pending", "active"]), name="one_open_care_link"
            ),
            models.CheckConstraint(condition=~models.Q(sponsor=models.F("beneficiary")), name="care_link_not_self"),
        ]


class CreditTopUp(ReceiptNumbered, BaseModel):
    """Recharge du crédit santé, payée en ligne (carte ou mobile money) ; reçu numéroté une fois payée."""

    STATUSES = [("pending", "En attente"), ("paid", "Payé"), ("failed", "Échoué")]

    link = models.ForeignKey(CareLink, on_delete=models.PROTECT, related_name="topups")
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=8, choices=STATUSES, default="pending")
    reference = models.CharField(max_length=40, unique=True)
    provider_token = models.CharField(max_length=128, null=True, blank=True, unique=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class CreditEntry(BaseModel):
    """Mouvement du crédit santé d'un lien (recharge, consultation payée, remboursement). Solde = somme."""

    KINDS = [("topup", "Recharge"), ("spend", "Consultation payée"), ("refund", "Consultation annulée (recréditée)")]

    link = models.ForeignKey(CareLink, on_delete=models.PROTECT, related_name="credit_entries")
    kind = models.CharField(max_length=8, choices=KINDS)
    amount = models.IntegerField()  # positif : crédit ; négatif : dépense
    topup = models.OneToOneField(CreditTopUp, null=True, blank=True, on_delete=models.PROTECT, related_name="entry")
    payment = models.ForeignKey("payments.Payment", null=True, blank=True, on_delete=models.PROTECT, related_name="credit_entries")
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["payment", "kind"], condition=models.Q(payment__isnull=False), name="credit_once_per_payment"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Un mouvement de crédit ne peut pas être modifié")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Un mouvement de crédit ne peut pas être supprimé")
