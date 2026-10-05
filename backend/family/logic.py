"""
Règles de l'entraide familiale : invitation et accord par code SMS, crédit santé (solde, dépense, remboursement),
paiement d'une consultation par un proche, nouvelles envoyées au proche, rappels de recharge.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from sunusante.api import ApiError

from .models import CareLink, CreditEntry

INVITE_TTL = timedelta(hours=24)
INVITE_MAX_ATTEMPTS = 5
INVITE_MAX_SENDS = 3
XOF_PER_EUR = 655.957  # parité fixe du franc CFA : la conversion affichée est exacte
TOPUP_MIN, TOPUP_MAX = 2_000, 1_000_000


def eur(amount_xof: int) -> float:
    return round(amount_xof / XOF_PER_EUR, 2)


def code_hash(link_id, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"care:{link_id}:{code}".encode(), hashlib.sha256).hexdigest()


# ── Invitation ────────────────────────────────────────────────────────


def _rights_text(link: CareLink, lang: str) -> str:
    if lang == "wo":
        parts = ["fey sa paj"]
        if link.can_book:
            parts.append("jël say ndaje")
        if link.can_see_records:
            parts.append("gis say ordonaas ak li doktoor bi bind")
        return ", ".join(parts)
    if lang == "en":
        parts = ["pay for your care"]
        if link.can_book:
            parts.append("book your appointments")
        if link.can_see_records:
            parts.append("see your prescriptions and medical reports")
        return ", ".join(parts)
    parts = ["payer vos soins"]
    if link.can_book:
        parts.append("prendre vos rendez-vous")
    if link.can_see_records:
        parts.append("voir vos ordonnances et comptes-rendus")
    return ", ".join(parts)


def invite_message(link: CareLink, code: str) -> str:
    lang = link.beneficiary.preferred_language if link.beneficiary.preferred_language in ("fr", "wo", "en") else "fr"
    sponsor = link.sponsor.full_name or "Un proche"
    rights = _rights_text(link, lang)
    if lang == "wo":
        return (f"Fajma — {sponsor} bëgg na {rights} ci Fajma. Soo ko nangoo, joxal ko kood bii: {code}. "
                "Soo nanguwul, bul ko tontu.")
    if lang == "en":
        return f"Fajma — {sponsor} would like to {rights} on Fajma. If you agree, give them this code: {code}. Otherwise ignore this message."
    return f"Fajma — {sponsor} souhaite {rights} sur Fajma. Si vous êtes d'accord, donnez-lui ce code : {code}. Sinon, ignorez ce message."


def send_invite(link: CareLink) -> str | None:
    """Nouveau code (24 h) envoyé au bénéficiaire. Renvoie le code en développement sans SMS réel (tests)."""
    from notifications.sms import normalize_phone
    from notifications.tasks import queue_sms

    if link.invites_sent >= INVITE_MAX_SENDS:
        raise ApiError("Trois codes ont déjà été envoyés. Vérifiez le numéro, ou contactez l'équipe Fajma.")
    phone = normalize_phone(link.beneficiary.phone)
    if not phone:
        raise ApiError("Numéro de téléphone du proche invalide")
    code = f"{secrets.randbelow(1_000_000):06d}"
    link.invite_code_hash = code_hash(link.id, code)
    link.invite_expires_at = timezone.now() + INVITE_TTL
    link.invite_attempts = 0
    link.invites_sent += 1
    link.save(update_fields=["invite_code_hash", "invite_expires_at", "invite_attempts", "invites_sent", "updated_at"])
    queue_sms(phone, invite_message(link, code), essential=True)
    return code if settings.DEBUG and not settings.TWILIO.get("ACCOUNT_SID") else None


def check_code(link: CareLink, code: str) -> None:
    if link.status != "pending":
        raise ApiError("Cette invitation n'est plus en attente")
    if not link.invite_expires_at or link.invite_expires_at < timezone.now():
        raise ApiError("Code expiré : demandez un nouveau code")
    if link.invite_attempts >= INVITE_MAX_ATTEMPTS:
        raise ApiError("Trop d'essais : demandez un nouveau code")
    link.invite_attempts += 1
    link.save(update_fields=["invite_attempts", "updated_at"])
    if not hmac.compare_digest(link.invite_code_hash, code_hash(link.id, code.strip())):
        raise ApiError("Code incorrect")


def activate(link: CareLink) -> None:
    link.status, link.accepted_at, link.invite_code_hash = "active", timezone.now(), ""
    link.save(update_fields=["status", "accepted_at", "invite_code_hash", "updated_at"])
    from notifications.service import notify

    rights = _rights_text(link, "fr")
    notify(link.beneficiary, kind="family", title=f"{link.sponsor.full_name} vous aide sur Fajma",
           body=f"Accès accordé : {rights}. Vous pouvez le retirer à tout moment dans votre espace.", link="/mon-espace", sms=True)
    notify(link.sponsor, kind="family", title=f"{link.label} a accepté votre aide",
           body=f"Vous pouvez maintenant {rights}.", link="/famille", email=True)


# ── Crédit santé ──────────────────────────────────────────────────────


def balance(link: CareLink) -> int:
    return CreditEntry.objects.filter(link=link).aggregate(s=Sum("amount"))["s"] or 0


def credit_topup(topup) -> None:
    """Recharge payée (appelé une fois par PayDunya) : crédit du lien, prévenir les deux personnes."""
    from notifications.service import notify

    CreditEntry.objects.get_or_create(
        topup=topup, defaults={"link": topup.link, "kind": "topup", "amount": topup.amount, "description": f"Recharge réf. {topup.reference}"}
    )
    link = topup.link
    CareLink.objects.filter(pk=link.pk).update(low_balance_alerted_at=None)
    notify(link.beneficiary, kind="family", title=f"{link.sponsor.full_name} vous offre {topup.amount:,} F de crédit santé".replace(",", " "),
           body="Utilisable pour régler vos consultations sur Fajma.", link="/mon-espace", sms=True)
    notify(link.sponsor, kind="family", title=f"Crédit santé de {link.label} rechargé",
           body=f"{topup.amount:,} F — nouveau solde : {balance(link):,} F.".replace(",", " "), link="/famille", email=True)


def pay_with_credit(appt, link: CareLink, *, by_user):
    """Règle la consultation avec le crédit santé du lien (solde suffisant, sous verrou)."""
    from payments.ledger import record_earning
    from payments.models import Payment

    amount = appt.amount_due
    if amount <= 0:
        raise ApiError("Aucun montant à régler pour ce rendez-vous")
    with transaction.atomic():
        CareLink.objects.select_for_update().get(pk=link.pk)
        existing = appt.payments.select_for_update().order_by("-created_at").first()
        if existing and existing.status == "paid":
            raise ApiError("Ce rendez-vous est déjà payé")
        if balance(link) < amount:
            raise ApiError(f"Crédit santé insuffisant ({balance(link):,} F pour {amount:,} F)".replace(",", " "))
        payment = existing or Payment(appointment=appt, patient=appt.patient, reference=f"SUNU-{secrets.token_hex(4).upper()}")
        payment.amount, payment.currency = amount, appt.doctor.currency
        payment.method, payment.provider, payment.provider_token, payment.checkout_url = "credit", "credit", None, ""
        payment.status, payment.paid_at, payment.payer = "paid", timezone.now(), link.sponsor
        payment.save()
        CreditEntry.objects.create(link=link, kind="spend", amount=-amount, payment=payment,
                                   description=f"{appt.doctor.full_name} — {timezone.localtime(appt.scheduled_at):%d/%m/%Y}")
        record_earning(payment)
    _after_spend(link, appt, amount, by_user)
    return payment


def _after_spend(link: CareLink, appt, amount: int, by_user) -> None:
    from notifications.service import notify

    left = balance(link)
    who = "Votre proche" if by_user.id == link.sponsor_id else link.label
    notify(link.sponsor, kind="family", title=f"Consultation de {link.label} payée",
           body=f"{who} : {appt.doctor.full_name}, {amount:,} F avec le crédit santé. Solde : {left:,} F.".replace(",", " "),
           link="/famille", email=True)
    if by_user.id == link.sponsor_id:
        notify(link.beneficiary, kind="family", title=f"{link.sponsor.full_name} a payé votre consultation",
               body=f"{appt.doctor.full_name} : rien à régler au cabinet.", link="/mon-espace", sms=True)
    if left < link.low_balance_alert and not link.low_balance_alerted_at:
        notify(link.sponsor, kind="family", title=f"Crédit santé de {link.label} bientôt épuisé",
               body=f"Il reste {left:,} F. Rechargez en un clic depuis votre espace Famille.".replace(",", " "), link="/famille", email=True)
        CareLink.objects.filter(pk=link.pk).update(low_balance_alerted_at=timezone.now())


def refund_to_credit(payment, reason: str = "") -> bool:
    """Consultation payée avec le crédit puis annulée : le montant revient aussitôt sur le crédit."""
    entry = CreditEntry.objects.filter(payment=payment, kind="spend").select_related("link").first()
    if not entry or CreditEntry.objects.filter(payment=payment, kind="refund").exists():
        return False
    CreditEntry.objects.create(link=entry.link, kind="refund", amount=-entry.amount, payment=payment,
                               description=f"Remboursement — {reason}"[:200])
    return True


def credit_link_for(user, amount: int) -> CareLink | None:
    """Lien d'entraide actif du bénéficiaire avec assez de crédit (le plus fourni d'abord)."""
    best = None
    for link in CareLink.objects.filter(beneficiary=user, status="active").select_related("sponsor"):
        b = balance(link)
        if b >= amount and (best is None or b > best[0]):
            best = (b, link)
    return best[1] if best else None


# ── Nouvelles pour le proche ──────────────────────────────────────────


def notify_family(appt, title: str, body: str) -> None:
    """Rendez-vous du bénéficiaire lui-même (pas d'un de ses proches) : le proche aidant est tenu informé."""
    if appt.relative_id or not appt.patient_id:
        return
    from notifications.service import notify

    for link in CareLink.objects.filter(beneficiary_id=appt.patient_id, status="active").select_related("sponsor"):
        notify(link.sponsor, kind="family", title=title.format(label=link.label), body=body, link="/famille", email=True)


def send_family_reminders(now=None) -> int:
    """Rappel mensuel de recharge choisi par le proche (une fois tous les 30 jours)."""
    from notifications.service import notify

    now = now or timezone.now()
    sent = 0
    for link in CareLink.objects.filter(status="active", monthly_reminder_amount__gt=0).select_related("sponsor"):
        if link.monthly_reminded_at and now - link.monthly_reminded_at < timedelta(days=30):
            continue
        notify(link.sponsor, kind="family", title=f"Crédit santé de {link.label} : rappel mensuel",
               body=f"Solde actuel : {balance(link):,} F. Recharge prévue : {link.monthly_reminder_amount:,} F.".replace(",", " "),
               link="/famille", email=True)
        CareLink.objects.filter(pk=link.pk).update(monthly_reminded_at=now)
        sent += 1
    return sent
