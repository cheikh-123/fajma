"""Revenus des médecins (solde, virements, abonnement) et suivi financier de l'administration."""

import secrets

from django.conf import settings
from django.db.models import Count, Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, get_choice, get_int, get_str, iso, not_found, require_user

from . import ledger
from .models import LedgerEntry, Payout, Refund, SubscriptionPayment
from .paydunya import create_invoice, sync_invoice
from .plans import DURATIONS, PLANS, effective_plan, plans_payload, price_for


def payout_dict(p: Payout) -> dict:
    return {
        "id": str(p.id),
        "reference": p.reference,
        "amount": p.amount,
        "method": p.method,
        "method_label": p.get_method_display(),
        "destination": p.destination,
        "status": p.status,
        "note": p.note or None,
        "created_at": iso(p.created_at),
        "processed_at": iso(p.processed_at),
    }


# ── Espace médecin ───────────────────────────────────────────────────


@api_view(["GET"])
def pro_finance(request):
    doctor = my_doctor(require_user(request))
    plan = effective_plan(doctor)
    sub = getattr(doctor, "subscription", None)
    entries = LedgerEntry.objects.filter(doctor=doctor)
    totals = entries.filter(kind="earning").aggregate(gross=Sum("gross"), commission=Sum("commission"), count=Count("id"))
    return Response(
        {
            "balance": ledger.balance(doctor),
            "min_payout": ledger.MIN_PAYOUT,
            "currency": doctor.currency,
            "totals": {"gross": totals["gross"] or 0, "commission": totals["commission"] or 0, "count": totals["count"]},
            "entries": [
                {
                    "id": str(e.id),
                    "kind": e.kind,
                    "label": e.get_kind_display(),
                    "amount": e.amount,
                    "gross": e.gross,
                    "commission": e.commission,
                    "description": e.description,
                    "created_at": iso(e.created_at),
                }
                for e in entries[:50]
            ],
            "payouts": [payout_dict(p) for p in doctor.payouts.all()[:20]],
            "subscription": {
                "plan": plan,
                "plan_name": PLANS[plan]["name"],
                "commission_percent": float(PLANS[plan]["commission_percent"]),
                "current_period_end": iso(sub.current_period_end) if sub and plan != "essentiel" else None,
            },
            "plans": plans_payload(),
            "durations": [{"months": m, "discount_percent": d} for m, d in DURATIONS.items()],
        }
    )


@api_view(["POST"])
def pro_request_payout(request):
    doctor = my_doctor(require_user(request))
    data = body(request)
    amount = get_int(data, "amount", min_value=1, max_value=100_000_000)
    if amount is None:
        raise ApiError("Montant requis")
    method = get_choice(data, "method", {"wave", "orange_money", "bank"})
    destination = get_str(data, "destination", required=True, min_len=6, max_len=60)
    payout = ledger.request_payout(doctor, amount, method, destination)
    audit.log(request, "payout_requested", target=payout, amount=amount, method=method)
    return Response(payout_dict(payout))


@api_view(["POST"])
def pro_subscription_checkout(request):
    doctor = my_doctor(require_user(request))
    data = body(request)
    plan = get_choice(data, "plan", set(PLANS) - {"essentiel"})
    months = get_int(data, "months", default=1)
    if months not in DURATIONS:
        raise ApiError("Durée invalide")
    sp = SubscriptionPayment.objects.create(
        doctor=doctor, plan=plan, months=months, amount=price_for(plan, months), reference=f"ABO-{secrets.token_hex(4).upper()}"
    )
    base = settings.PUBLIC_SITE_URL
    token, url = create_invoice(
        amount=sp.amount,
        description=f"Abonnement Fajma {PLANS[plan]['name']} — {months} mois — réf. {sp.reference}",
        payment_id=str(sp.id),
        return_url=f"{base}/pro?abonnement={sp.id}",
        cancel_url=f"{base}/pro?abonnement={sp.id}",
        callback_url=f"{base}/api/payments/paydunya/webhook",
    )
    sp.provider_token, sp.checkout_url = token, url
    sp.save(update_fields=["provider_token", "checkout_url", "updated_at"])
    return Response({"url": url, "reference": sp.reference, "amount": sp.amount})


@api_view(["POST"])
def pro_subscription_refresh(request, payment_id):
    doctor = my_doctor(require_user(request))
    sp = SubscriptionPayment.objects.filter(id=payment_id, doctor=doctor).first()
    if not sp:
        raise not_found("Paiement d'abonnement introuvable")
    status = sync_subscription(sp)
    sp.refresh_from_db()
    return Response({"status": status, "plan": sp.plan, "period_end": iso(sp.period_end)})


def sync_subscription(sp: SubscriptionPayment) -> str:
    status = sync_invoice(sp, ledger.activate_subscription)
    if status == "paid":  # rattrapage si l'activation avait échoué (sans effet si déjà appliquée)
        ledger.activate_subscription(sp)
    return status


# ── Administration ───────────────────────────────────────────────────


@api_view(["GET"])
def admin_finance(request):
    require_admin(request)
    earnings = LedgerEntry.objects.filter(kind="earning").aggregate(gross=Sum("gross"), commission=Sum("commission"))
    refunded = LedgerEntry.objects.filter(kind="refund").aggregate(commission=Sum("commission"))
    subs = SubscriptionPayment.objects.filter(status="paid").aggregate(total=Sum("amount"))
    return Response(
        {
            "totals": {
                "online_volume": earnings["gross"] or 0,
                "commission": (earnings["commission"] or 0) - (refunded["commission"] or 0),
                "subscriptions": subs["total"] or 0,
                "doctors_balance": LedgerEntry.objects.aggregate(total=Sum("amount"))["total"] or 0,
            },
            "payouts": [
                {**payout_dict(p), "doctor_name": p.doctor.full_name}
                for p in Payout.objects.select_related("doctor").order_by("status", "-created_at")[:100]
            ],
            "refunds": [
                {
                    "id": str(r.id),
                    "amount": r.amount,
                    "status": r.status,
                    "reason": r.reason or None,
                    "payment_reference": r.payment.reference,
                    "method": r.payment.get_method_display(),
                    "patient_name": r.payment.patient.full_name,
                    "patient_phone": r.payment.patient.phone or r.payment.phone or None,
                    "doctor_name": r.payment.appointment.doctor.full_name,
                    "transfer_reference": r.transfer_reference or None,
                    "created_at": iso(r.created_at),
                    "processed_at": iso(r.processed_at),
                }
                for r in Refund.objects.select_related("payment__patient", "payment__appointment__doctor").order_by("-status", "-created_at")[:100]
            ],
        }
    )


@api_view(["POST"])
def admin_process_payout(request, payout_id):
    admin = require_admin(request)
    data = body(request)
    decision = get_choice(data, "decision", {"paid", "rejected"})
    payout = Payout.objects.filter(id=payout_id).first()
    if not payout:
        raise not_found("Virement introuvable")
    note = get_str(data, "note", max_len=200) or ""
    if decision == "paid" and not note:
        raise ApiError("Indiquez la référence du transfert effectué")
    ledger.process_payout(payout, admin, decision, note)
    audit.log(request, "payout_processed", target=payout, decision=decision, amount=payout.amount)
    return Response({"ok": True})


@api_view(["POST"])
def admin_complete_refund(request, refund_id):
    admin = require_admin(request)
    refund = Refund.objects.filter(id=refund_id).first()
    if not refund:
        raise not_found("Remboursement introuvable")
    transfer = get_str(body(request), "transfer_reference", required=True, min_len=3, max_len=80)
    ledger.complete_refund(refund, admin, transfer)
    audit.log(request, "refund_processed", target=refund, amount=refund.amount)
    return Response({"ok": True})
