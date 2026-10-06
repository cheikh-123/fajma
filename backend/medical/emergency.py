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
STALE_DAYS = 365  # fiche non mise à jour depuis un an : signalé aux secours
REMIND_DAYS = 180  # rappel « votre fiche est-elle à jour ? »
# Jamais dans le résumé médical montré aux secours, même si le patient l'a activé.
SENSITIVE_CODES = {"vih", "ist", "sante_mentale"}
SENSITIVE_WORDS = ("vih", "hiv", "sida", "seropositi", "séropositi", "syphilis", "gonococ", "chlamyd", "ist ", "psychi",
                   "depress", "dépress", "schizo", "bipolaire", "suicid", "avortement", "ivg")


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


def _apply_health(obj, data: dict) -> None:
    """Groupe sanguin, allergies, antécédents, traitements (profil de santé, ou fiche du proche)."""
    if "blood_group" in data:
        bg = data.get("blood_group") or ""
        if bg and bg not in dict(HealthProfile.BLOOD_GROUPS):
            raise ApiError("Groupe sanguin invalide")
        obj.blood_group = bg
    for key in ("allergies", "conditions", "treatments"):
        if key in data:
            setattr(obj, key, get_str(data, key, max_len=2000) or "")


def _is_sensitive(code: str, *texts: str) -> bool:
    if code in SENSITIVE_CODES:
        return True
    joined = " ".join(t or "" for t in texts).lower() + " "
    return any(w in joined for w in SENSITIVE_WORDS)


def _active_prescriptions(user, relative):
    from .models import MedicalRecord, Prescription

    today = timezone.localdate()
    sensitive_appts = {
        r.appointment_id for r in MedicalRecord.objects.filter(patient=user, appointment__relative=relative)
        if _is_sensitive(r.condition_code, r.diagnosis, r.treatment)
    }
    rows = Prescription.objects.filter(patient=user, relative=relative).select_related("doctor").order_by("-created_at")[:20]
    out = []
    for p in rows:
        recent = p.created_at.date() >= today - timedelta(days=90)
        if not ((p.valid_until and p.valid_until >= today) or (not p.valid_until and recent)):
            continue
        if p.appointment_id in sensitive_appts or _is_sensitive("", p.content, " ".join(i.get("name", "") for i in p.items or [])):
            continue
        out.append(p)
    return out[:3]


def _item_text(i: dict) -> str:
    return " — ".join(x for x in (i.get("name"), i.get("posology")) if x)


def suggested_treatments(user, relative, current: str) -> list[str]:
    """Médicaments des ordonnances en cours absents de « Traitements en cours » (à valider par le patient)."""
    have = (current or "").lower()
    seen, out = set(), []
    for p in _active_prescriptions(user, relative):
        # Anciennes ordonnances en texte libre : une ligne par médicament.
        items = p.items or [{"name": line.strip(" -•*	")} for line in (p.content or "").splitlines() if line.strip(" -•*	")][:8]
        for i in items:
            name = (i.get("name") or "").strip()
            if name and name.lower() not in have and name.lower() not in seen:
                seen.add(name.lower())
                out.append(_item_text(i))
    return out[:10]


def medical_summary(user, relative) -> dict:
    """
    Résumé pour les secours, si le patient l'a choisi : conclusions des 3 dernières consultations (12 mois) et
    ordonnances en cours. Jamais les notes privées des médecins ni les diagnostics sensibles (VIH, IST, santé
    mentale…).
    """
    from .conditions import BY_CODE
    from .models import MedicalRecord

    since = timezone.now() - timedelta(days=365)
    records = []
    for r in (MedicalRecord.objects.filter(patient=user, appointment__relative=relative, created_at__gte=since)
              .select_related("doctor__specialty").order_by("-created_at")[:10]):
        if _is_sensitive(r.condition_code, r.diagnosis, r.treatment):
            continue
        conclusion = r.diagnosis or (BY_CODE[r.condition_code].label if r.condition_code in BY_CODE else "")
        if not conclusion and not r.treatment:
            continue
        records.append({"date": r.created_at.date().isoformat(), "doctor": r.doctor.full_name,
                        "specialty": r.doctor.specialty.name if r.doctor.specialty_id else None,
                        "conclusion": conclusion[:240] or None, "treatment": (r.treatment or "")[:240] or None})
        if len(records) == 3:
            break
    prescriptions = [
        {"date": p.created_at.date().isoformat(), "doctor": p.doctor.full_name,
         "items": [_item_text(i) for i in (p.items or [])][:8] or ([p.content[:200]] if p.content else [])}
        for p in _active_prescriptions(user, relative)
    ]
    return {"records": records, "prescriptions": prescriptions}


def _missing(obj, contacts: list) -> list[str]:
    """Informations choisies mais vides (le patient est invité à les compléter)."""
    is_self = isinstance(obj, HealthProfile)
    fields = set((obj.emergency_fields if is_self else obj.fields) or DEFAULT_FIELDS)
    checks = {
        "blood_group": bool(obj.blood_group), "allergies": bool(obj.allergies), "treatments": bool(obj.treatments),
        "conditions": bool(obj.conditions), "medical_devices": bool(obj.medical_devices),
        "rescuer_notes": bool(obj.rescuer_notes), "critical_flags": bool(obj.critical_flags), "emergency_contact": bool(contacts),
    }
    return [f for f, ok in checks.items() if f in fields and not ok]


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
    data.update({k: (getattr(obj, k) or "") if obj else "" for k in ("blood_group", "allergies", "conditions", "treatments")})
    if is_self:
        data["alert_doctors"] = obj.alert_doctors if obj else True
        owner = obj.user if obj else None
    else:
        data["relative"] = {"id": str(relative.id), "full_name": relative.full_name}
        owner = relative.owner
    data["missing"] = _missing(obj, data["contacts"]) if obj else []
    data["suggested_treatments"] = suggested_treatments(owner, relative, data["treatments"]) if owner else []
    data["stale"] = bool(obj and obj.updated_at < timezone.now() - timedelta(days=STALE_DAYS))
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
            _apply_health(card, data)
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
        _apply_health(hp, data)
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
    card = {**person, "updated_at": src.updated_at.isoformat(), "for_relative": relative is not None,
            "stale": src.updated_at < timezone.now() - timedelta(days=STALE_DAYS)}
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
    if "medical_summary" in shown:
        card["medical_summary"] = medical_summary(owner, relative)
    audit.log(request, "emergency_card_viewed", patient=owner, relative=str(relative.id) if relative else None)
    # Le titulaire est prévenu (une fois par jour) : une consultation inattendue doit l'alerter.
    if not Notification.objects.filter(
        user=owner, kind="emergency_card_viewed", created_at__gte=timezone.now() - timedelta(days=1)
    ).exists():
        title = f"Fiche d'urgence de {relative.full_name} consultée" if relative else "Votre fiche d'urgence a été consultée"
        notify(owner, kind="emergency_card_viewed", title=title,
               body="Si ce n'était pas lors d'une urgence, créez un nouveau lien depuis votre dossier.", link="/dossier", sms=True)
    return Response(card)


def send_emergency_reminders(now=None) -> int:
    """Fiches actives non mises à jour depuis 6 mois : « votre fiche est-elle à jour ? » (planificateur)."""
    now = now or timezone.now()
    limit = now - timedelta(days=REMIND_DAYS)
    sent = 0
    for hp in HealthProfile.objects.filter(emergency_enabled=True, updated_at__lt=limit).select_related("user"):
        if hp.emergency_reminded_at and hp.emergency_reminded_at > limit:
            continue
        notify(hp.user, kind="emergency_review", title="Votre fiche d'urgence est-elle à jour ?",
               body="Traitements, allergies, personnes à prévenir : vérifiez-la en 1 minute.", link="/dossier", sms=True)
        HealthProfile.objects.filter(pk=hp.pk).update(emergency_reminded_at=now)
        sent += 1
    for card in RelativeEmergencyCard.objects.filter(enabled=True, updated_at__lt=limit).select_related("relative__owner"):
        if card.reminded_at and card.reminded_at > limit:
            continue
        notify(card.relative.owner, kind="emergency_review", title=f"La fiche d'urgence de {card.relative.full_name} est-elle à jour ?",
               body="Traitements, allergies, personnes à prévenir : vérifiez-la en 1 minute.", link="/dossier", sms=True)
        RelativeEmergencyCard.objects.filter(pk=card.pk).update(reminded_at=now)
        sent += 1
    return sent
