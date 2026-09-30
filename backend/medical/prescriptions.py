"""
Ordonnance électronique : saisie structurée (un médicament par ligne) et mentions obligatoires.

Mentions portées sur l'ordonnance : identité du médecin (nom, spécialité, n° d'inscription à l'Ordre),
lieu d'exercice et téléphone, identité du patient (nom, âge, sexe, poids si utile), date et lieu,
médicaments (nom, dosage, posologie, durée, quantité, mention « non substituable »), renouvellements,
durée de validité, signature et cachet du médecin, référence et QR code de vérification.
"""

from datetime import date, timedelta

from django.conf import settings

from sunusante.api import ApiError, get_int, get_str, iso

from .issuer import issuer_public, issuer_snapshot, missing_mentions, require_started
from .models import Prescription

MAX_ITEMS = 15
VALIDITY_MONTHS = {1, 3, 6, 12}
DEFAULT_VALIDITY_MONTHS = 3
MAX_RENEWALS = 11


def _item(raw) -> dict:
    if not isinstance(raw, dict):
        raise ApiError("Médicament invalide")
    item = {
        "name": get_str(raw, "name", required=True, min_len=2, max_len=120),
        "dosage": get_str(raw, "dosage", max_len=60) or "",
        "posology": get_str(raw, "posology", max_len=200) or "",
        "duration": get_str(raw, "duration", max_len=60) or "",
        "quantity": get_str(raw, "quantity", max_len=60) or "",
        "non_substitutable": bool(raw.get("non_substitutable")),
    }
    if not item["posology"]:
        raise ApiError(f"Indiquez la posologie de « {item['name']} »")
    return item


def items_text(items: list[dict]) -> str:
    """Version texte (pharmacies, anciens écrans, recherche)."""
    lines = []
    for i, it in enumerate(items, 1):
        head = " ".join(filter(None, [it["name"], it["dosage"]]))
        detail = " — ".join(
            filter(None, [it["posology"], f"pendant {it['duration']}" if it["duration"] else "", f"quantité : {it['quantity']}" if it["quantity"] else ""])
        )
        lines.append(f"{i}. {head}" + (" (non substituable)" if it["non_substitutable"] else ""))
        if detail:
            lines.append(f"   {detail}")
    return "\n".join(lines)


def _birth_date(data: dict, fallback) -> date | None:
    raw = data.get("patient_birth_date")
    if not raw:
        return fallback
    try:
        value = date.fromisoformat(str(raw))
    except ValueError as err:
        raise ApiError("Date de naissance invalide") from err
    if not date(1900, 1, 1) <= value <= date.today():
        raise ApiError("Date de naissance invalide")
    return value


def _weight(data: dict) -> float | None:
    raw = data.get("patient_weight_kg")
    if raw in (None, ""):
        return None
    try:
        value = round(float(str(raw).replace(",", ".")), 1)
    except ValueError as err:
        raise ApiError("Poids invalide") from err
    if not 0.3 <= value <= 400:
        raise ApiError("Poids invalide")
    return value


def create_prescription(appt, doctor, data: dict) -> Prescription | None:
    """Crée l'ordonnance d'une consultation si le médecin en a rédigé une (sinon None)."""
    raw_items = data.get("items") or []
    free_text = get_str(data, "prescription", max_len=4000)  # ancienne saisie libre, encore acceptée
    if not raw_items and not free_text:
        return None
    if not isinstance(raw_items, list) or len(raw_items) > MAX_ITEMS:
        raise ApiError(f"Au plus {MAX_ITEMS} médicaments par ordonnance")
    require_started(appt)
    missing = missing_mentions(doctor)
    if missing:
        raise ApiError(
            "Avant de délivrer une ordonnance, complétez dans « Ordonnances : en-tête et signature » : " + ", ".join(missing) + "."
        )
    items = [_item(raw) for raw in raw_items]
    months = get_int(data, "validity_months", default=DEFAULT_VALIDITY_MONTHS)
    if months not in VALIDITY_MONTHS:
        raise ApiError("Durée de validité invalide")
    subject = appt.relative or appt.patient
    birth = _birth_date(data, subject.birth_date)
    sex = data.get("patient_sex") or subject.sex
    if sex not in {"", "F", "M"}:
        raise ApiError("Sexe invalide")
    today = date.today()
    return Prescription.objects.create(
        appointment=appt,
        patient_id=appt.patient_id,
        relative=appt.relative,
        doctor=doctor,
        items=items,
        content=items_text(items) if items else free_text,
        renewals=get_int(data, "renewals", default=0, min_value=0, max_value=MAX_RENEWALS),
        instructions=get_str(data, "instructions", max_len=2000) or "",
        valid_until=today + timedelta(days=round(months * 30.44)),
        patient_info={
            "name": subject.full_name,
            "birth_date": birth.isoformat() if birth else None,
            "sex": sex or None,
            "weight_kg": _weight(data),
        },
        issuer=issuer_snapshot(doctor, appt),
    )


def prescription_dict(p: Prescription) -> dict:
    info = p.patient_info or {}
    subject = p.relative or p.patient
    return {
        "id": str(p.id),
        "reference": p.reference,
        "content": p.content,
        "items": p.items or [],
        "renewals": p.renewals,
        "instructions": p.instructions or None,
        "valid_until": p.valid_until.isoformat() if p.valid_until else None,
        "created_at": iso(p.created_at),
        "patient_id": str(p.patient_id),
        "issuer": issuer_public(p.issuer, p.doctor),
        # Compatibilité : écrans qui lisent encore doctor.*
        "doctor": {
            "full_name": p.doctor.full_name,
            "city": p.doctor.city,
            "address": p.doctor.address or None,
            "specialty": {"name": p.doctor.specialty.name} if p.doctor.specialty else None,
        },
        "patient": {
            "full_name": info.get("name") or subject.full_name,
            "birth_date": info.get("birth_date") or (subject.birth_date.isoformat() if subject.birth_date else None),
            "sex": info.get("sex") or subject.sex or None,
            "weight_kg": info.get("weight_kg"),
            "city": p.patient.city or None,
            "phone": p.patient.phone or None,
            "account_holder": p.patient.full_name if p.relative_id else None,
        },
        "verify_url": f"{settings.PUBLIC_SITE_URL}/verifier/{p.reference}",
    }
