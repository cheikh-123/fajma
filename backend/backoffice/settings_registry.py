"""
Réglages modifiables par l'administration (page « Réglages »). Liste fermée : chaque réglage a un type, une
valeur par défaut (souvent la variable d'environnement d'avant) et une validation.
"""

from __future__ import annotations

import re

from django.conf import settings
from django.core.cache import cache

from sunusante.api import ApiError

CACHE_KEY = "platform-settings"

REGISTRY: dict[str, dict] = {
    "maintenance_message": {
        "label": "Message affiché en haut du site (maintenance, information importante)",
        "type": "text", "max": 200, "default": "", "public": True,
    },
    "contact_email": {"label": "Email de contact affiché", "type": "email", "default": "contact@fajma.sn", "public": True},
    "contact_phone": {"label": "Téléphone du support", "type": "phone", "default": "", "public": True},
    "support_hours": {"label": "Horaires du support", "type": "text", "max": 80, "default": "Du lundi au vendredi, 9 h – 18 h", "public": True},
    "ussd_code": {"label": "Code USSD Fajma", "type": "text", "max": 20, "default": "", "public": True},
    "epidemic_hotline": {
        "label": "Numéro pour déclarer une maladie à déclaration immédiate (district, COUS)",
        "type": "phone", "default_setting": "EPIDEMIC_HOTLINE", "default": "", "public": False,
    },
    "min_payout": {"label": "Montant minimum d'un virement aux médecins (F CFA)", "type": "int", "min": 1000, "max": 100000, "default": 5000, "public": False},
}


def _all() -> dict:
    data = cache.get(CACHE_KEY)
    if data is None:
        from .models import PlatformSetting

        data = {s.key: s.value for s in PlatformSetting.objects.filter(key__in=REGISTRY)}
        cache.set(CACHE_KEY, data, 60)
    return data


def get_setting(key: str):
    spec = REGISTRY[key]
    stored = _all()
    if key in stored and stored[key] not in (None, ""):
        return stored[key]
    if spec.get("default_setting"):
        return getattr(settings, spec["default_setting"], "") or spec["default"]
    return spec["default"]


def validate(key: str, value):
    spec = REGISTRY.get(key)
    if not spec:
        raise ApiError("Réglage inconnu")
    if value in (None, ""):
        return ""
    kind = spec["type"]
    if kind == "int":
        try:
            value = int(value)
        except (TypeError, ValueError) as err:
            raise ApiError(f"{spec['label']} : nombre attendu") from err
        if not spec["min"] <= value <= spec["max"]:
            raise ApiError(f"{spec['label']} : entre {spec['min']} et {spec['max']}")
        return value
    value = str(value).strip()
    if kind == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise ApiError("Email invalide")
    if kind == "phone" and not re.fullmatch(r"\+?[\d\s.-]{3,20}", value):
        raise ApiError("Numéro invalide")
    return value[: spec.get("max", 200)]


def clear_cache() -> None:
    cache.delete(CACHE_KEY)
