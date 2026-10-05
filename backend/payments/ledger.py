"""
Argent des médecins : crédit des paiements en ligne (moins la commission), remboursements,
virements et abonnements. Toute variation de solde passe par une écriture LedgerEntry.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from directory.models import Doctor
from sunusante.api import ApiError

from .models import LedgerEntry, Payment, Payout, Refund, Subscription, SubscriptionPayment
from .plans import PERIOD_DAYS_PER_MONTH, PLANS, commission_for, effective_plan

MIN_PAYOUT = 5000


def balance(doctor: Doctor) -> int:
    return LedgerEntry.objects.filter(doctor=doctor).aggregate(total=Sum("amount"))["total"] or 0


def _entry(**fields) -> LedgerEntry | None:
    """Écriture idempotente : si elle existe déjà (même paiement/virement et même nature), on n'en crée pas d'autre."""
    try:
        with transaction.atomic():
            return LedgerEntry.objects.create(**fields)
    except IntegrityError:
        return None


def record_earning(payment: Payment) -> None:
    """Paiement en ligne encaissé : on crédite le médecin du montant moins la commission de sa formule."""
    # Crédit santé : l'argent a été encaissé en ligne à la recharge ; la consultation est créditée au médecin.
    if payment.provider not in ("paydunya", "credit") or payment.status != "paid":
        return
    doctor = payment.appointment.doctor
    percent = PLANS[effective_plan(doctor)]["commission_percent"]
    commission = commission_for(payment.amount, percent)
    _entry(
        doctor=doctor,
        kind="earning",
        amount=payment.amount - commission,
        gross=payment.amount,
        commission=commission,
        commission_percent=percent,
        payment=payment,
        description=f"Consultation du {timezone.localtime(payment.appointment.scheduled_at):%d/%m/%Y} — réf. {payment.reference}",
    )


def open_refund(appointment, reason: str = "") -> Refund | None:
    """
    RDV annulé alors qu'il était payé en ligne : remboursement intégral du patient (commission comprise),
    et la part créditée au médecin lui est retirée.
    """
    payment = appointment.payments.filter(status="paid", provider__in=("paydunya", "credit")).first()
    if not payment or Refund.objects.filter(payment=payment).exists():
        return None
    refund = Refund.objects.create(payment=payment, amount=payment.amount, reason=reason[:200])
    if payment.provider == "credit":
        # Payé avec le crédit santé : remboursé aussitôt sur ce crédit, sans virement à faire.
        from family.logic import refund_to_credit

        refund_to_credit(payment, reason)
        refund.status, refund.processed_at, refund.transfer_reference = "done", timezone.now(), "crédit santé"
        refund.save(update_fields=["status", "processed_at", "transfer_reference", "updated_at"])
        Payment.objects.filter(id=payment.id).update(status="refunded", updated_at=timezone.now())
    earning = LedgerEntry.objects.filter(payment=payment, kind="earning").first()
    if earning:
        _entry(
            doctor=earning.doctor,
            kind="refund",
            amount=-earning.amount,
            gross=earning.gross,
            commission=earning.commission,
            commission_percent=earning.commission_percent,
            payment=payment,
            description=f"RDV annulé — remboursement réf. {payment.reference}",
        )
    return refund


def complete_refund(refund: Refund, admin, transfer_reference: str) -> None:
    if refund.status != "pending":
        raise ApiError("Ce remboursement est déjà traité")
    refund.status, refund.processed_by, refund.processed_at = "done", admin, timezone.now()
    refund.transfer_reference = transfer_reference
    refund.save(update_fields=["status", "processed_by", "processed_at", "transfer_reference", "updated_at"])
    Payment.objects.filter(id=refund.payment_id).update(status="refunded", updated_at=timezone.now())


@transaction.atomic
def request_payout(doctor: Doctor, amount: int, method: str, destination: str) -> Payout:
    # Verrou sur la fiche médecin : deux demandes simultanées ne peuvent pas dépasser le solde.
    Doctor.objects.select_for_update().filter(id=doctor.id).first()
    if Payout.objects.filter(doctor=doctor, status="requested").exists():
        raise ApiError("Une demande de virement est déjà en cours de traitement")
    available = balance(doctor)
    if amount < MIN_PAYOUT:
        raise ApiError(f"Montant minimum : {MIN_PAYOUT} FCFA")
    if amount > available:
        raise ApiError("Montant supérieur au solde disponible")
    payout = Payout.objects.create(
        doctor=doctor, amount=amount, method=method, destination=destination, reference=f"VIR-{secrets.token_hex(4).upper()}"
    )
    _entry(doctor=doctor, kind="payout", amount=-amount, payout=payout, description=f"Virement {payout.get_method_display()} — réf. {payout.reference}")
    return payout


@transaction.atomic
def process_payout(payout: Payout, admin, decision: str, note: str = "") -> None:
    payout = Payout.objects.select_for_update().get(id=payout.id)
    if payout.status != "requested":
        raise ApiError("Ce virement est déjà traité")
    payout.status, payout.processed_by, payout.processed_at, payout.note = decision, admin, timezone.now(), note[:200]
    payout.save(update_fields=["status", "processed_by", "processed_at", "note", "updated_at"])
    if decision == "rejected":
        _entry(
            doctor=payout.doctor,
            kind="payout_reversal",
            amount=payout.amount,
            payout=payout,
            description=f"Virement refusé, montant recrédité — réf. {payout.reference}",
        )


@transaction.atomic
def activate_subscription(sp: SubscriptionPayment) -> None:
    """Abonnement payé : prolonge la formule (ou la démarre aujourd'hui si on change de formule)."""
    sp = SubscriptionPayment.objects.select_for_update().get(id=sp.id)
    if sp.period_end:  # déjà appliqué (webhook et retour navigateur peuvent arriver en même temps)
        return
    sub, _ = Subscription.objects.select_for_update().get_or_create(doctor=sp.doctor)
    now = timezone.now()
    start = sub.current_period_end if sub.plan == sp.plan and sub.current_period_end and sub.current_period_end > now else now
    sub.plan = sp.plan
    sub.current_period_end = start + timedelta(days=PERIOD_DAYS_PER_MONTH * sp.months)
    sub.save()
    sp.period_end = sub.current_period_end
    sp.save(update_fields=["period_end", "updated_at"])
