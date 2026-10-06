"""
Fiche d'urgence : page publique ouverte par un QR code (fond d'écran, carte de portefeuille), pour les secours.

Désactivée par défaut. Le patient choisit ce qui s'affiche : alertes vitales (diabétique sous insuline,
épileptique, drépanocytaire, sous anticoagulant, enceinte…), groupe sanguin, allergies, traitements,
antécédents, appareils médicaux, personnes à prévenir (3 au plus, appel en un geste), médecin traitant,
assurance, poids, note pour les secours. Une fiche par proche aussi (enfant, parent âgé), avec son propre QR
code ; le titulaire du compte y est toujours la première personne à prévenir.

Le lien est un jeton aléatoire de 256 bits, révocable à tout moment (nouveau lien = l'ancien QR code ne
fonctionne plus). Chaque consultation est journalisée et le titulaire est prévenu (une fois par jour au plus).
"""

from __future__ import annotations

import re
import secrets
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import Relative
from audit import log as audit
from notifications.models import Notification
from notifications.service import notify
from sunusante.api import ApiError, ScopedThrottle, body, get_str, get_uuid, not_found, require_user

from .models import HealthProfile, RelativeEmergencyCard

FIELDS = HealthProfile.EMERGENCY_FIELDS
DEFAULT_FIELDS = ["critical_flags", "blood_group", "allergies", "treatments", "emergency_contact", "rescuer_notes"]
# Alertes vitales affichées en tête de la fiche (libellés traduits par la page publique).
CRITICAL_FLAGS = [
    "insuline", "diabete", "epilepsie", "drepanocytose", "anticoagulant", "cardiaque", "hypertension", "asthme",
    "dialyse", "allergie_grave", "hemophilie", "enceinte", "memoire", "handicap",
]
MAX_CONTACTS = 3


class EmergencyThrottle(ScopedThrottle):
    scope = "public_lookup"


def _age(birth: date | None) -> int | None:
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def _contacts(raw) -> list[dict]:
    from notifications.sms import normalize_phone

    if not isinstance(raw, list):
        raise ApiError("Personnes à prévenir invalides")
    out = []
    for item in raw[:MAX_CONTACTS]:
        if not isinstance(item, dict):
            continue
        name = (str(item.get("name") or "")).strip()[:80]
        phone_raw = (str(item.get("phone") or "")).strip()[:30]
        if not name and not phone_raw:
            continue
        if not name or not phone_raw:
            raise ApiError("Indiquez le nom et le téléphone de chaque personne à prévenir")
        phone = normalize_phone(phone_raw) or (phone_raw if re.fullmatch(r"\+?[\d\s.-]{8,20}", phone_raw) else None)
        if not phone:
            raise ApiError(f"Téléphone invalide pour {name}")
        out.append({"name": name, "relation": (str(item.get("relation") or "")).strip()[:40], "phone": phone})
    return out


def _flags(raw) -> list[str]:
    if not isinstance(raw, list) or any(f not in CRITICAL_FLAGS for f in raw):
        raise ApiError("Alertes vitales invalides")
    return [f for f in CRITICAL_FLAGS if f in raw]


def _apply_common(obj, data: dict) -> None:
    """Champs communs à sa propre fiche et à celle d'un proche."""
    if "fields" in data:
        fields = data.get("fields")
        if not isinstance(fields, list) or any(f not in FIELDS for f in fields):
            raise ApiError("Informations invalides")
        setattr(obj, "emergency_fields" if isinstance(obj, HealthProfile) else "fields", [f for f in FIELDS if f in fields])
    if "critical_flags" in data:
        obj.critical_flags = _flags(data.get("critical_flags"))
    if "contacts" in data:
        obj.emergency_contacts = _contacts(data.get("contacts"))
    for key in ("medical_devices", "rescuer_notes"):
        if key in data:
            setattr(obj, key, get_str(data, key, max_len=300) or "")


def settings_dict(obj, relative: Relative | None = None) -> dict:
    is_self = isinstance(obj, HealthProfile) or obj is None
    enabled = bool(obj and (obj.emergency_enabled if is_self else obj.enabled) and (obj.emergency_token if is_self else obj.token))
    data = {
        "enabled": enabled,
        "token": (obj.emergency_token if is_self else obj.token) if enabled else None,
        "fields": ((obj.emergency_fields if is_self else obj.fields) or DEFAULT_FIELDS) if obj else DEFAULT_FIELDS,
        "critical_flags": (obj.critical_flags or []) if obj else [],
        "contacts": (obj.emergency_contacts or []) if obj else [],
        "medical_devices": (obj.medical_devices or "") if obj else "",
        "rescuer_notes": (obj.rescuer_notes or "") if obj else "",
        "flag_choices": CRITICAL_FLAGS,
    }
    if is_self:
        data["alert_doctors"] = obj.alert_doctors if obj else True
    else:
        data["relative"] = {"id": str(relative.id), "full_name": relative.full_name}
        data.update({k: getattr(obj, k) or "" for k in ("blood_group", "allergies", "conditions", "treatments")} if obj else
                    {k: "" for k in ("blood_group", "allergies", "conditions", "treatments")})
    return data


@api_view(["GET", "POST"])
def my_emergency_settings(request):
    """
    Sa fiche, ou celle d'un proche (?relative=<id> / {relative_id}). POST {enabled?, fields?, regenerate?,
    critical_flags?, contacts?, medical_devices?, rescuer_notes?, alert_doctors?} ; pour un proche, aussi
    {blood_group?, allergies?, conditions?, treatments?} (il n'a pas de profil de santé propre).
    """
    user = require_user(request)
    data = body(request) if request.method == "POST" else {}
    rel_id = data.get("relative_id") or request.query_params.get("relative")
    if rel_id:
        relative = Relative.objects.filter(id=get_uuid({"r": rel_id}, "r"), owner=user).first()
        if not relative:
            raise not_found("Proche introuvable")
        card = RelativeEmergencyCard.objects.filter(relative=relative).first()
        if request.method == "POST":
            card = card or RelativeEmergencyCard(relative=relative)
            _apply_common(card, data)
            if "blood_group" in data:
                bg = data.get("blood_group") or ""
                if bg and bg not in dict(HealthProfile.BLOOD_GROUPS):
                    raise ApiError("Groupe sanguin invalide")
                card.blood_group = bg
            for key in ("allergies", "conditions", "treatments"):
                if key in data:
                    setattr(card, key, get_str(data, key, max_len=2000) or "")
            if "enabled" in data:
                card.enabled = bool(data.get("enabled"))
                if card.enabled and not card.fields:
                    card.fields = DEFAULT_FIELDS
            if card.enabled and (not card.token or data.get("regenerate")):
                card.token = secrets.token_urlsafe(32)
            card.save()
            audit.log(request, "emergency_card_updated", patient=user, relative=str(relative.id), enabled=card.enabled)
        return Response(settings_dict(card, relative))
    hp = HealthProfile.objects.filter(user=user).first()
    if request.method == "POST":
        hp = hp or HealthProfile(user=user)
        _apply_common(hp, data)
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


# ── Page publique ─────────────────────────────────────────────────────


def _doctor(user, relative) -> dict | None:
    """Médecin traitant : celui de la dernière consultation terminée."""
    from appointments.models import Appointment

    a = (
        Appointment.objects.filter(patient=user, relative=relative, status="completed")
        .select_related("doctor__specialty").order_by("-scheduled_at").first()
    )
    if not a:
        return None
    d = a.doctor
    return {"name": d.full_name, "specialty": d.specialty.name if d.specialty_id else None, "phone": d.practice_phone or None,
            "city": d.city}


def _insurance(user, relative) -> dict | None:
    from insurance.models import PatientCoverage

    c = PatientCoverage.objects.filter(user=user, relative=relative).select_related("insurer").order_by("-created_at").first()
    return {"insurer": c.insurer.name, "member_number": c.member_number} if c else None


def _weight(user, relative) -> float | None:
    from care.models import Measurement

    m = Measurement.objects.filter(patient=user, relative=relative, kind="weight").order_by("-measured_at").first()
    return m.value if m else None


@api_view(["GET"])
@throttle_classes([EmergencyThrottle])
def public_card(request, token):
    """Fiche d'urgence (sans connexion) : uniquement les informations choisies par le titulaire."""
    if len(token) < 32:
        raise not_found("Fiche d'urgence introuvable ou désactivée")
    hp = HealthProfile.objects.filter(emergency_token=token, emergency_enabled=True).select_related("user").first()
    rcard = None if hp else RelativeEmergencyCard.objects.filter(token=token, enabled=True).select_related("relative__owner").first()
    if hp:
        owner, relative, src = hp.user, None, hp
        person = {"full_name": owner.full_name, "age": _age(owner.birth_date), "sex": owner.sex or None}
        shown = set(hp.emergency_fields or DEFAULT_FIELDS)
        contacts = list(hp.emergency_contacts or [])
        if not contacts and hp.emergency_contact:
            contacts = [{"name": hp.emergency_contact, "relation": "", "phone": None}]  # ancienne saisie libre
    elif rcard:
        relative, owner, src = rcard.relative, rcard.relative.owner, rcard
        person = {"full_name": relative.full_name, "age": _age(relative.birth_date), "sex": relative.sex or None}
        shown = set(rcard.fields or DEFAULT_FIELDS)
        from notifications.sms import normalize_phone

        # Le titulaire du compte (parent, enfant adulte…) est toujours la première personne à prévenir.
        contacts = [{"name": owner.full_name, "relation": "Responsable (compte Fajma)", "phone": normalize_phone(owner.phone) or None}]
        contacts += list(rcard.emergency_contacts or [])
    else:
        raise not_found("Fiche d'urgence introuvable ou désactivée")
    if not owner.is_active:
        raise not_found("Fiche d'urgence introuvable ou désactivée")
    card = {**person, "updated_at": src.updated_at.isoformat(), "for_relative": relative is not None}
    for field in ("blood_group", "allergies", "treatments", "conditions", "medical_devices", "rescuer_notes", "critical_flags"):
        if field in shown:
            card[field] = getattr(src, field) or (None if field != "critical_flags" else [])
    if "emergency_contact" in shown:
        card["contacts"] = contacts[: MAX_CONTACTS + 1]
    if "doctor" in shown:
        card["doctor"] = _doctor(owner, relative)
    if "insurance" in shown:
        card["insurance"] = _insurance(owner, relative)
    if "weight" in shown:
        card["weight"] = _weight(owner, relative)
    audit.log(request, "emergency_card_viewed", patient=owner, relative=str(relative.id) if relative else None)
    # Le titulaire est prévenu (une fois par jour) : une consultation inattendue doit l'alerter.
    if not Notification.objects.filter(
        user=owner, kind="emergency_card_viewed", created_at__gte=timezone.now() - timedelta(days=1)
    ).exists():
        title = f"Fiche d'urgence de {relative.full_name} consultée" if relative else "Votre fiche d'urgence a été consultée"
        notify(owner, kind="emergency_card_viewed", title=title,
               body="Si ce n'était pas lors d'une urgence, créez un nouveau lien depuis votre dossier.", link="/dossier", sms=True)
    return Response(card)
