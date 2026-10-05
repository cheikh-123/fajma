"""Paiements : mobile money via PayDunya, ou paiement au cabinet."""

import json
import re
import secrets

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.models import Appointment
from sunusante.api import ApiError, body, get_choice, get_uuid, not_found, require_user

from insurance.logic import insurance_dict

from .models import Payment
from .paydunya import create_invoice, sync_payment


@api_view(["POST"])
def start_payment(request):
    """
    Espèces : paiement « en attente », à régler au cabinet.
    Mobile money : facture PayDunya ; le paiement ne passe à « payé » qu'après confirmation PayDunya.
    """
    user = require_user(request)
    data = body(request)
    method = get_choice(data, "method", {"wave", "orange_money", "free_money", "cash", "credit"})
    appt = Appointment.objects.filter(id=get_uuid(data, "appointment_id"), patient=user).select_related("doctor").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if appt.status == "cancelled":
        raise ApiError("Ce rendez-vous est annulé")
    if method == "credit":
        # Crédit santé offert par un proche (entraide familiale).
        from family.logic import credit_link_for, pay_with_credit

        link = credit_link_for(user, appt.amount_due)
        if not link:
            raise ApiError("Crédit santé insuffisant pour cette consultation")
        paid = pay_with_credit(appt, link, by_user=user)
        return Response({"kind": "paid", "reference": paid.reference, "amount": paid.amount})
    existing = appt.payments.order_by("-created_at").first()
    if existing and existing.status == "paid":
        raise ApiError("Ce rendez-vous est déjà payé")
    amount = appt.amount_due
    if amount <= 0:
        raise ApiError("Aucun montant à régler pour ce rendez-vous")

    payment = existing or Payment(appointment=appt, patient=user, reference=f"SUNU-{secrets.token_hex(4).upper()}")
    payment.amount = amount
    payment.currency = appt.doctor.currency
    payment.method = method
    payment.status = "pending"
    payment.provider = "cash" if method == "cash" else "paydunya"
    payment.provider_token = None
    payment.checkout_url = ""
    payment.save()
    if method == "cash":
        return Response({"kind": "cash", "reference": payment.reference, "amount": amount})

    base = settings.PUBLIC_SITE_URL
    token, url = create_invoice(
        amount=amount,
        description=f"Consultation {appt.doctor.full_name} — réf. {payment.reference}",
        payment_id=str(payment.id),
        return_url=f"{base}/paiement/retour?payment={payment.id}",
        cancel_url=f"{base}/paiement/retour?payment={payment.id}",
        callback_url=f"{base}/api/payments/paydunya/webhook",
    )
    payment.provider_token = token
    payment.checkout_url = url
    payment.save(update_fields=["provider_token", "checkout_url", "updated_at"])
    return Response({"kind": "redirect", "url": url, "reference": payment.reference, "amount": amount})


@api_view(["POST"])
def refresh_payment(request, payment_id):
    user = require_user(request)
    from django.db.models import Q

    payment = Payment.objects.filter(Q(patient=user) | Q(payer=user), id=payment_id).first()
    if not payment:
        raise not_found("Paiement introuvable")
    status = sync_payment(payment)
    return Response({"status": status, "amount": payment.amount, "reference": payment.reference, "method": payment.method})


@csrf_exempt
@require_POST
def paydunya_webhook(request):
    """
    Notification PayDunya (IPN). Le contenu reçu n'est pas cru : on n'en extrait que le jeton
    de facture, puis on relit son état directement auprès de l'API PayDunya.
    """
    token = None
    if request.content_type == "application/json":
        try:
            payload = json.loads(request.body or b"{}")
            token = (payload.get("data") or {}).get("invoice", {}).get("token") or (payload.get("data") or {}).get("token")
        except (ValueError, AttributeError):
            return JsonResponse({"ok": False}, status=400)
    else:
        token = request.POST.get("data[invoice][token]") or request.POST.get("data[token]") or request.POST.get("token")
    if not token or not re.fullmatch(r"[\w-]{4,128}", token):
        return JsonResponse({"ok": False}, status=400)
    payment = Payment.objects.filter(provider_token=token).first()
    if payment:
        return JsonResponse({"ok": True, "status": sync_payment(payment)})
    from .models import SubscriptionPayment
    from .views_finance import sync_subscription

    sub_payment = SubscriptionPayment.objects.filter(provider_token=token).first()
    if sub_payment:
        return JsonResponse({"ok": True, "status": sync_subscription(sub_payment)})
    from family.models import CreditTopUp
    from family.views import sync_topup

    topup = CreditTopUp.objects.filter(provider_token=token).select_related("link__sponsor", "link__beneficiary").first()
    if topup:
        return JsonResponse({"ok": True, "status": sync_topup(topup)})
    return JsonResponse({"ok": True, "status": None})


@api_view(["POST"])
def mark_cash_paid(request, appointment_id):
    """Le médecin (ou son secrétariat) indique que la consultation a été réglée au cabinet."""
    from secrets import token_hex

    from django.utils import timezone

    from appointments.views import my_doctor

    from django.db.models import Q

    doctor = my_doctor(require_user(request))
    # Le remplaçant encaisse au cabinet pour le compte du titulaire (la recette est créditée au titulaire).
    appt = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id)
        .exclude(patient=None)
        .select_related("doctor")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    doctor = appt.doctor
    payment = appt.payments.order_by("-created_at").first()
    if payment and payment.status == "paid":
        raise ApiError("Ce rendez-vous est déjà réglé")
    payment = payment or Payment(appointment=appt, patient=appt.patient, reference=f"SUNU-{token_hex(4).upper()}")
    payment.amount = appt.amount_due
    payment.currency, payment.method, payment.provider = doctor.currency, "cash", "cash"
    payment.status, payment.paid_at = "paid", timezone.now()
    payment.save()
    return Response({"ok": True, "reference": payment.reference})


@api_view(["GET"])
def receipt(request, payment_id):
    """Données du reçu (le PDF est généré dans le navigateur). Uniquement pour un paiement encaissé."""
    from sunusante.api import iso

    user = require_user(request)
    p = (
        Payment.objects.filter(id=payment_id, status="paid")
        .select_related("appointment__doctor__specialty", "appointment__relative", "patient", "payer", "appointment__consultation_type")
        .first()
    )
    if not p or user.id not in (p.patient_id, p.payer_id, p.appointment.doctor.user_id):
        raise not_found("Reçu introuvable")
    a = p.appointment
    return Response(
        {
            "reference": p.reference,
            "receipt_number": p.receipt_number,
            "amount": p.amount,
            "currency": p.currency,
            "method": p.get_method_display(),
            "paid_at": iso(p.paid_at),
            "appointment_at": iso(a.scheduled_at),
            "consultation": a.consultation_type.name if a.consultation_type else ("Téléconsultation" if a.mode == "teleconsultation" else "Consultation"),
            "patient_name": a.relative.full_name if a.relative else p.patient.full_name,
            "payer_name": p.payer.full_name if p.payer_id else p.patient.full_name,
            "doctor_name": a.doctor.full_name,
            "doctor_specialty": a.doctor.specialty.name if a.doctor.specialty else None,
            "doctor_address": ", ".join(x for x in (a.doctor.address, a.doctor.city) if x),
            # Feuille de soins : le patient la présente à son organisme pour être remboursé.
            "insurance": insurance_dict(a),
            "full_price": a.price,
        }
    )
