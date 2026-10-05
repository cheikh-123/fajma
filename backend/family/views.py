"""
API « Famille » : le proche aidant invite, recharge le crédit santé, paie et (si autorisé) prend les rendez-vous
et voit les comptes-rendus du bénéficiaire ; le bénéficiaire voit qui l'aide, accepte ou retire l'accès.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import User
from appointments.models import ACTIVE_STATUSES, Appointment
from audit import log as audit
from notifications.sms import normalize_phone
from sunusante.api import ApiError, ScopedThrottle, body, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from . import logic
from .models import CareLink, CreditEntry, CreditTopUp


class FamilyThrottle(ScopedThrottle):
    scope = "family"


# ── Représentations ───────────────────────────────────────────────────


def _appt_dict(a: Appointment) -> dict:
    paid = next((p for p in a.payments.all() if p.status == "paid"), None)
    return {
        "id": str(a.id),
        "scheduled_at": iso(a.scheduled_at),
        "status": a.status,
        "status_label": a.get_status_display(),
        "mode": a.mode,
        "doctor": {"id": str(a.doctor_id), "full_name": a.doctor.full_name, "specialty": a.doctor.specialty.name if a.doctor.specialty_id else None,
                   "city": a.doctor.city},
        "amount_due": a.amount_due,
        "paid": bool(paid),
        "paid_with": paid.get_method_display() if paid else None,
    }


def link_dict(link: CareLink, *, viewer) -> dict:
    sponsor_view = viewer.id == link.sponsor_id
    bal = logic.balance(link) if link.status == "active" else 0
    data = {
        "id": str(link.id),
        "role": "sponsor" if sponsor_view else "beneficiary",
        "label": link.label,
        "status": link.status,
        "status_label": link.get_status_display(),
        "can_book": link.can_book,
        "can_see_records": link.can_see_records,
        "sponsor": {"full_name": link.sponsor.full_name},
        "beneficiary": {"full_name": link.beneficiary.full_name, "phone_hint": f"•• {link.beneficiary.phone[-4:]}" if link.beneficiary.phone else None},
        "balance": bal,
        "balance_eur": logic.eur(bal),
        "accepted_at": iso(link.accepted_at),
        "monthly_reminder_amount": link.monthly_reminder_amount,
        "low_balance_alert": link.low_balance_alert,
        "invite_expires_at": iso(link.invite_expires_at) if link.status == "pending" else None,
    }
    return data


def _my_link(user, link_id, *, sponsor: bool | None = None, active: bool = True) -> CareLink:
    qs = CareLink.objects.filter(id=link_id).select_related("sponsor", "beneficiary")
    if sponsor is True:
        qs = qs.filter(sponsor=user)
    elif sponsor is False:
        qs = qs.filter(beneficiary=user)
    else:
        qs = qs.filter(Q(sponsor=user) | Q(beneficiary=user))
    link = qs.first()
    if not link or (active and link.status != "active"):
        raise not_found("Lien familial introuvable")
    return link


# ── Liens ─────────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@throttle_classes([FamilyThrottle])
def links(request):
    """GET : les proches que j'aide et ceux qui m'aident. POST : inviter un proche (code SMS à lui demander)."""
    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        phone = normalize_phone(get_str(data, "phone", required=True, max_len=30))
        if not phone:
            raise ApiError("Numéro de téléphone invalide (numéro sénégalais)")
        if phone == normalize_phone(user.phone):
            raise ApiError("Indiquez le numéro de votre proche, pas le vôtre")
        name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
        label = get_str(data, "label", max_len=60) or name
        lang = get_choice(data, "lang", {"fr", "wo", "en"}, default="fr")
        if CareLink.objects.filter(sponsor=user, created_at__gte=timezone.now() - timedelta(days=1)).count() >= 5:
            raise ApiError("Cinq invitations au plus par jour")
        with transaction.atomic():
            beneficiary = (
                User.objects.filter(phone=phone, phone_verified=True, is_active=True).first()
                or User.objects.filter(phone=phone, is_active=True).first()
            )
            if not beneficiary:
                # Compte créé pour le proche (connexion par code SMS, sans mot de passe) : il le retrouvera s'il
                # se connecte un jour avec ce numéro.
                beneficiary = User(phone=phone, full_name=name, preferred_language=lang)
                beneficiary.set_unusable_password()
                beneficiary.save()
            if beneficiary.id == user.id:
                raise ApiError("Indiquez le numéro de votre proche, pas le vôtre")
            existing = CareLink.objects.filter(sponsor=user, beneficiary=beneficiary, status__in=["pending", "active"]).first()
            if existing:
                raise ApiError("Ce proche est déjà dans votre liste")
            link = CareLink.objects.create(
                sponsor=user, beneficiary=beneficiary, label=label,
                can_book=bool(data.get("can_book")), can_see_records=bool(data.get("can_see_records")),
            )
        dev_code = logic.send_invite(link)
        audit.log(request, "family_invited", link=str(link.id))
        return Response({**link_dict(link, viewer=user), **({"dev_code": dev_code} if dev_code else {})})
    rows = (
        CareLink.objects.filter(Q(sponsor=user) | Q(beneficiary=user))
        .exclude(status__in=["revoked", "expired"])
        .select_related("sponsor", "beneficiary")
    )
    return Response([link_dict(link, viewer=user) for link in rows])


@api_view(["POST"])
@throttle_classes([FamilyThrottle])
def confirm(request, link_id):
    """Le proche aidant saisit le code que le bénéficiaire lui a donné : preuve de son accord."""
    user = require_user(request)
    link = _my_link(user, link_id, sponsor=True, active=False)
    logic.check_code(link, get_str(body(request), "code", required=True, max_len=10) or "")
    ben = link.beneficiary
    if not ben.phone_verified and not User.objects.filter(phone=ben.phone, phone_verified=True).exclude(pk=ben.pk).exists():
        # Le code reçu sur ce téléphone prouve aussi qu'il appartient bien au bénéficiaire.
        User.objects.filter(pk=ben.pk).update(phone_verified=True)
    logic.activate(link)
    audit.log(request, "family_accepted", link=str(link.id), via="code")
    return Response(link_dict(link, viewer=user))


@api_view(["POST"])
@throttle_classes([FamilyThrottle])
def resend(request, link_id):
    user = require_user(request)
    link = _my_link(user, link_id, sponsor=True, active=False)
    if link.status != "pending":
        raise ApiError("Cette invitation n'est plus en attente")
    dev_code = logic.send_invite(link)
    return Response({**link_dict(link, viewer=user), **({"dev_code": dev_code} if dev_code else {})})


@api_view(["POST"])
def accept(request, link_id):
    """Le bénéficiaire, connecté, accepte directement depuis son espace."""
    user = require_user(request)
    link = _my_link(user, link_id, sponsor=False, active=False)
    if link.status != "pending":
        raise ApiError("Cette invitation n'est plus en attente")
    logic.activate(link)
    audit.log(request, "family_accepted", link=str(link.id), via="espace")
    return Response(link_dict(link, viewer=user))


@api_view(["POST"])
def revoke(request, link_id):
    """
    L'une ou l'autre personne met fin à l'entraide. Le crédit restant reste rattaché au lien, visible du proche
    aidant, qui peut en demander le remboursement à l'équipe Fajma.
    """
    from notifications.service import notify

    user = require_user(request)
    link = _my_link(user, link_id, active=False)
    if link.status not in ("pending", "active"):
        raise ApiError("Ce lien est déjà terminé")
    link.status, link.revoked_at, link.revoked_by = "revoked", timezone.now(), user
    link.save(update_fields=["status", "revoked_at", "revoked_by", "updated_at"])
    other = link.beneficiary if user.id == link.sponsor_id else link.sponsor
    notify(other, kind="family", title="Entraide familiale arrêtée",
           body=f"{user.full_name} a mis fin à l'accès sur Fajma.", link="/famille" if other.id == link.sponsor_id else "/mon-espace")
    audit.log(request, "family_revoked", link=str(link.id))
    return Response({"ok": True})


@api_view(["POST"])
def settings_view(request, link_id):
    """
    Proche aidant : nom affiché, rappel mensuel, seuil d'alerte ; il peut retirer un droit, pas en ajouter
    (un nouveau droit demande un nouvel accord). Bénéficiaire : accorde ou retire chaque droit.
    """
    user = require_user(request)
    link = _my_link(user, link_id)
    data = body(request)
    is_sponsor = user.id == link.sponsor_id
    for right in ("can_book", "can_see_records"):
        if right in data:
            wanted = bool(data.get(right))
            if is_sponsor and wanted and not getattr(link, right):
                raise ApiError("Un nouveau droit doit être accordé par votre proche depuis son espace")
            setattr(link, right, wanted)
    if is_sponsor:
        if "label" in data:
            link.label = get_str(data, "label", required=True, min_len=2, max_len=60)
        if "monthly_reminder_amount" in data:
            link.monthly_reminder_amount = get_int(data, "monthly_reminder_amount", default=0, min_value=0, max_value=logic.TOPUP_MAX)
        if "low_balance_alert" in data:
            link.low_balance_alert = get_int(data, "low_balance_alert", default=5000, min_value=0, max_value=logic.TOPUP_MAX)
    link.save()
    audit.log(request, "family_settings", link=str(link.id), can_book=link.can_book, can_see_records=link.can_see_records)
    return Response(link_dict(link, viewer=user))


# ── Suivi du bénéficiaire (proche aidant) ─────────────────────────────


@api_view(["GET"])
def detail(request, link_id):
    """Rendez-vous, crédit santé et, si autorisé, comptes-rendus et ordonnances du bénéficiaire."""
    user = require_user(request)
    link = _my_link(user, link_id, sponsor=True)
    ben = link.beneficiary
    now = timezone.now()
    base = Appointment.objects.filter(patient=ben, relative__isnull=True).select_related("doctor__specialty").prefetch_related("payments")
    upcoming = base.filter(scheduled_at__gte=now - timedelta(hours=2), status__in=ACTIVE_STATUSES).order_by("scheduled_at")[:20]
    past = base.exclude(id__in=[a.id for a in upcoming]).order_by("-scheduled_at")[:20]
    data = {
        **link_dict(link, viewer=user),
        "upcoming": [_appt_dict(a) for a in upcoming],
        "past": [_appt_dict(a) for a in past],
        "credit": [
            {"kind": e.kind, "kind_label": e.get_kind_display(), "amount": e.amount, "description": e.description, "created_at": iso(e.created_at)}
            for e in CreditEntry.objects.filter(link=link)[:50]
        ],
    }
    if link.can_see_records:
        from medical.models import MedicalRecord, Prescription

        records = MedicalRecord.objects.filter(patient=ben, appointment__relative__isnull=True).select_related("doctor").order_by("-created_at")[:20]
        prescriptions = Prescription.objects.filter(patient=ben, relative__isnull=True).select_related("doctor").order_by("-created_at")[:20]
        data["records"] = [
            {"id": str(r.id), "created_at": iso(r.created_at), "doctor": r.doctor.full_name, "summary": r.summary or None,
             "diagnosis": r.diagnosis or None, "treatment": r.treatment or None}
            for r in records
        ]
        data["prescriptions"] = [
            {"id": str(p.id), "reference": p.reference, "created_at": iso(p.created_at), "doctor": p.doctor.full_name,
             "items": [{"name": i.get("name"), "posology": i.get("posology"), "duration": i.get("duration")} for i in (p.items or [])],
             "content": p.content or None}
            for p in prescriptions
        ]
        # Comme pour un médecin : chaque consultation du dossier par le proche est tracée et visible du patient.
        audit.log(request, "patient_file_viewed", patient=ben, via="famille", link=str(link.id))
    return Response(data)


@api_view(["POST"])
@throttle_classes([FamilyThrottle])
def pay(request, link_id):
    """{appointment_id, method: online | credit} : le proche règle une consultation du bénéficiaire."""
    from payments.paydunya import create_invoice
    from payments.models import Payment

    user = require_user(request)
    link = _my_link(user, link_id, sponsor=True)
    data = body(request)
    appt = Appointment.objects.filter(id=get_uuid(data, "appointment_id"), patient=link.beneficiary, relative__isnull=True).select_related("doctor").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if appt.status == "cancelled":
        raise ApiError("Ce rendez-vous est annulé")
    method = get_choice(data, "method", {"online", "credit"})
    if method == "credit":
        payment = logic.pay_with_credit(appt, link, by_user=user)
        return Response({"kind": "paid", "reference": payment.reference, "amount": payment.amount, "balance": logic.balance(link)})
    existing = appt.payments.order_by("-created_at").first()
    if existing and existing.status == "paid":
        raise ApiError("Ce rendez-vous est déjà payé")
    amount = appt.amount_due
    if amount <= 0:
        raise ApiError("Aucun montant à régler pour ce rendez-vous")
    payment = existing or Payment(appointment=appt, patient=appt.patient, reference=f"SUNU-{secrets.token_hex(4).upper()}")
    payment.amount, payment.currency, payment.method, payment.status = amount, appt.doctor.currency, "card", "pending"
    payment.provider, payment.payer, payment.provider_token, payment.checkout_url = "paydunya", user, None, ""
    payment.save()
    site = settings.PUBLIC_SITE_URL
    token, url = create_invoice(
        amount=amount,
        description=f"Consultation de {link.label} — {appt.doctor.full_name} — réf. {payment.reference}",
        payment_id=str(payment.id),
        return_url=f"{site}/paiement/retour?payment={payment.id}",
        cancel_url=f"{site}/paiement/retour?payment={payment.id}",
        callback_url=f"{site}/api/payments/paydunya/webhook",
    )
    payment.provider_token, payment.checkout_url = token, url
    payment.save(update_fields=["provider_token", "checkout_url", "updated_at"])
    return Response({"kind": "redirect", "url": url, "reference": payment.reference, "amount": amount, "amount_eur": logic.eur(amount)})


@api_view(["POST"])
@throttle_classes([FamilyThrottle])
def topup(request, link_id):
    """{amount} : recharge du crédit santé, payée par carte ou mobile money (PayDunya)."""
    from payments.paydunya import create_invoice

    user = require_user(request)
    link = _my_link(user, link_id, sponsor=True)
    amount = get_int(body(request), "amount", min_value=logic.TOPUP_MIN, max_value=logic.TOPUP_MAX)
    if amount is None:
        raise ApiError(f"Montant entre {logic.TOPUP_MIN} et {logic.TOPUP_MAX} F")
    t = CreditTopUp.objects.create(link=link, amount=amount, reference=f"FAM-{secrets.token_hex(4).upper()}")
    site = settings.PUBLIC_SITE_URL
    token, url = create_invoice(
        amount=amount,
        description=f"Crédit santé pour {link.label} — réf. {t.reference}",
        payment_id=f"topup:{t.id}",
        return_url=f"{site}/famille?recharge={t.id}",
        cancel_url=f"{site}/famille?recharge={t.id}",
        callback_url=f"{site}/api/payments/paydunya/webhook",
    )
    t.provider_token, t.checkout_url = token, url
    t.save(update_fields=["provider_token", "checkout_url", "updated_at"])
    return Response({"url": url, "reference": t.reference, "amount": amount, "amount_eur": logic.eur(amount)})


def sync_topup(t: CreditTopUp) -> str:
    from payments.paydunya import sync_invoice

    return sync_invoice(t, logic.credit_topup)


@api_view(["POST"])
def refresh_topup(request, topup_id):
    user = require_user(request)
    t = CreditTopUp.objects.filter(id=topup_id, link__sponsor=user).select_related("link__sponsor", "link__beneficiary").first()
    if not t:
        raise not_found("Recharge introuvable")
    return Response({"status": sync_topup(t), "amount": t.amount, "balance": logic.balance(t.link)})
