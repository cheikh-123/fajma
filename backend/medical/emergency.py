"""
Fiche d'urgence : page publique ouverte par un QR code (fond d'écran, portefeuille), pour les secours.

Désactivée par défaut. Le patient choisit ce qui s'affiche (groupe sanguin, allergies, traitements,
antécédents, personne à prévenir) ; son nom et son âge permettent de l'identifier. Le lien est un jeton
aléatoire de 256 bits, révocable à tout moment (nouveau lien = l'ancien QR code ne fonctionne plus).
Chaque consultation est journalisée, et le patient est prévenu (une fois par jour au plus).
"""

from __future__ import annotations

import secrets
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from audit import log as audit
from notifications.models import Notification
from notifications.service import notify
from sunusante.api import ApiError, ScopedThrottle, body, not_found, require_user

from .models import HealthProfile

FIELDS = HealthProfile.EMERGENCY_FIELDS
DEFAULT_FIELDS = ["blood_group", "allergies", "treatments", "emergency_contact"]


class EmergencyThrottle(ScopedThrottle):
    scope = "public_lookup"


def _age(birth: date | None) -> int | None:
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def settings_dict(hp: HealthProfile | None) -> dict:
    return {
        "enabled": bool(hp and hp.emergency_enabled and hp.emergency_token),
        "token": hp.emergency_token if hp and hp.emergency_enabled else None,
        "fields": (hp.emergency_fields or DEFAULT_FIELDS) if hp else DEFAULT_FIELDS,
        "alert_doctors": hp.alert_doctors if hp else True,
    }


@api_view(["GET", "POST"])
def my_emergency_settings(request):
    """POST {enabled?, fields?, regenerate?, alert_doctors?} : réglages de la fiche d'urgence et des alertes."""
    user = require_user(request)
    hp = HealthProfile.objects.filter(user=user).first()
    if request.method == "POST":
        data = body(request)
        hp = hp or HealthProfile(user=user)
        if "fields" in data:
            fields = data.get("fields")
            if not isinstance(fields, list) or any(f not in FIELDS for f in fields):
                raise ApiError("Informations invalides")
            hp.emergency_fields = [f for f in FIELDS if f in fields]
        if "alert_doctors" in data:
            hp.alert_doctors = bool(data.get("alert_doctors"))
        if "enabled" in data:
            hp.emergency_enabled = bool(data.get("enabled"))
            if hp.emergency_enabled and not hp.emergency_fields:
                hp.emergency_fields = DEFAULT_FIELDS
        if hp.emergency_enabled and (not hp.emergency_token or data.get("regenerate")):
            hp.emergency_token = secrets.token_urlsafe(32)
        hp.save()
        audit.log(request, "emergency_card_updated", patient=user, enabled=hp.emergency_enabled)
    return Response(settings_dict(hp))


@api_view(["GET"])
@throttle_classes([EmergencyThrottle])
def public_card(request, token):
    """Fiche d'urgence (sans connexion) : uniquement les informations choisies par le patient."""
    hp = HealthProfile.objects.filter(emergency_token=token, emergency_enabled=True).select_related("user").first()
    if not hp or len(token) < 32 or not hp.user.is_active:
        raise not_found("Fiche d'urgence introuvable ou désactivée")
    user = hp.user
    shown = set(hp.emergency_fields or DEFAULT_FIELDS)
    card = {
        "full_name": user.full_name,
        "age": _age(user.birth_date),
        "sex": user.sex or None,
        "updated_at": hp.updated_at.isoformat(),
    }
    for field in FIELDS:
        if field in shown:
            card[field] = getattr(hp, field) or None
    audit.log(request, "emergency_card_viewed", patient=user)
    # Le patient est prévenu (une fois par jour) : une consultation inattendue doit l'alerter.
    if not Notification.objects.filter(
        user=user, kind="emergency_card_viewed", created_at__gte=timezone.now() - timedelta(days=1)
    ).exists():
        notify(user, kind="emergency_card_viewed", title="Votre fiche d'urgence a été consultée",
               body="Si ce n'était pas lors d'une urgence, créez un nouveau lien depuis votre dossier.", link="/dossier")
    return Response(card)
