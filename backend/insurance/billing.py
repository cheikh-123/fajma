"""
Facturation des actes : enregistrement des actes réalisés pendant une consultation, calcul de la base de
remboursement, et **feuille de soins** — le document que le patient remet à son organisme (IPM, mutuelle,
CMU, assurance) pour être remboursé.

Le prix demandé par le médecin reste libre ; les actes codés donnent la base opposable à l'organisme. Le
patient voit donc ce qu'il a payé, ce qui est remboursable et ce qui reste à sa charge.
"""

from __future__ import annotations


from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, get_int, get_str, iso, not_found, require_user

from . import acts as catalog
from .models import ActLetter, PerformedAct

MAX_ACTS = 12


@transaction.atomic
def record_acts(appt: Appointment, doctor, raw) -> list[PerformedAct]:
    """
    {acts: [{code, quantity?}]} : remplace les actes de ce rendez-vous. Libellé, lettre, coefficient et
    valeur de la lettre sont figés maintenant, pour qu'une facture déjà remise ne change jamais.
    """
    if raw is None:
        return list(PerformedAct.objects.filter(appointment=appt))
    if not isinstance(raw, list) or len(raw) > MAX_ACTS:
        raise ApiError(f"Au plus {MAX_ACTS} actes par consultation")
    values = catalog.letter_values()
    rows = []
    for item in raw:
        if not isinstance(item, dict):
            raise ApiError("Acte invalide")
        act = catalog.BY_CODE.get(get_str(item, "code", required=True, max_len=16))
        if not act:
            raise ApiError("Acte inconnu dans la nomenclature")
        quantity = get_int(item, "quantity", default=1, min_value=1, max_value=20)
        unit = values.get(act.letter, 0)
        rows.append(PerformedAct(
            appointment=appt, patient=appt.patient, doctor=doctor, code=act.code, label=act.label,
            letter=act.letter, coefficient=act.coefficient, unit_value=unit,
            amount=int(act.coefficient * unit) * quantity, quantity=quantity,
        ))
    PerformedAct.objects.filter(appointment=appt).delete()
    PerformedAct.objects.bulk_create(rows)
    return rows


def act_dict(a: PerformedAct) -> dict:
    return {
        "id": str(a.id), "code": a.code, "label": a.label, "letter": a.letter,
        "coefficient": float(a.coefficient), "quantity": a.quantity,
        "unit_value": a.unit_value, "amount": a.amount,
        # Écriture conventionnelle d'un acte : « CS × 1 » ou « K 10 ».
        "notation": f"{a.letter} {a.coefficient.normalize():f}".replace(".", ",") + (f" × {a.quantity}" if a.quantity > 1 else ""),
    }


def billing_for(appt: Appointment) -> dict:
    """
    Récapitulatif à destination du patient et de son organisme : actes, base de remboursement, part
    remboursée et reste à charge. Sans acte codé, seul le prix payé est connu.
    """
    rows = list(PerformedAct.objects.filter(appointment=appt))
    base = sum(a.amount for a in rows)
    percent = appt.coverage_percent or 0
    reimbursed = (base * percent) // 100 if percent else 0
    paid = appt.price or 0
    return {
        "acts": [act_dict(a) for a in rows],
        "base_amount": base,
        "paid_amount": paid,
        "coverage_percent": percent or None,
        "insurer": appt.insurer.name if appt.insurer_id else None,
        "member_number": appt.insurance_member_number or None,
        "reimbursed_amount": reimbursed,
        # Ce qui reste réellement au patient : ce qu'il a payé moins ce que l'organisme lui rendra.
        "patient_cost": max(paid - reimbursed, 0),
        # Honoraires au-dessus de la base opposable : l'organisme ne les rembourse pas.
        "above_base": max(paid - base, 0) if base else None,
    }


# ── Médecin ──────────────────────────────────────────────────────────


@api_view(["GET"])
def acts_catalog(request):
    """Nomenclature et tarifs de base du moment (saisie du médecin)."""
    my_doctor(require_user(request))
    return Response({"acts": catalog.catalog(), "letters": catalog.letters_catalog()})


# ── Patient ──────────────────────────────────────────────────────────


@api_view(["GET"])
def care_sheet(request, appointment_id):
    """
    Feuille de soins d'une consultation : à remettre à l'organisme pour être remboursé.
    Accessible au patient concerné et au médecin qui a réalisé l'acte.
    """
    user = require_user(request)
    appt = (
        Appointment.objects.filter(id=appointment_id)
        .select_related("doctor", "patient", "relative", "insurer")
        .first()
    )
    if not appt:
        raise not_found("Consultation introuvable")
    is_patient = appt.patient_id == user.id
    is_doctor = appt.doctor.user_id == user.id or (appt.practitioner_id and appt.practitioner.user_id == user.id)
    if not (is_patient or is_doctor):
        raise not_found("Consultation introuvable")
    subject = appt.relative or appt.patient
    audit.log(request, "document_viewed", patient=appt.patient, target=appt, kind="feuille_de_soins")
    return Response({
        "appointment_id": str(appt.id),
        "date": iso(appt.scheduled_at),
        "doctor": {
            "full_name": appt.doctor.full_name,
            "order_number": appt.doctor.order_number or None,
            "specialty": appt.doctor.specialty.name if appt.doctor.specialty_id else None,
            "address": appt.doctor.address or None,
            "city": appt.doctor.city,
            "phone": appt.doctor.practice_phone or None,
        },
        "patient": {
            "full_name": subject.full_name,
            "birth_date": subject.birth_date.isoformat() if getattr(subject, "birth_date", None) else None,
            "account_holder": appt.patient.full_name if appt.relative_id else None,
        },
        **billing_for(appt),
    })


# ── Administration ───────────────────────────────────────────────────


@api_view(["GET", "POST"])
def admin_act_letters(request):
    """
    GET : valeur de chaque lettre-clé. POST {code: valeur, …} : mise à jour après une nouvelle convention
    avec les organismes. Les actes déjà facturés gardent leur montant.
    """
    admin = require_admin(request)
    if request.method == "POST":
        data = body(request)
        changed = {}
        for code, raw in data.items():
            if code not in catalog.LETTERS:
                raise ApiError(f"Lettre-clé inconnue : {code}")
            value = get_int({"v": raw}, "v", min_value=10, max_value=1000000)
            if value is None:
                raise ApiError(f"Valeur manquante pour la lettre-clé {code}")
            ActLetter.objects.update_or_create(code=code, defaults={"value": value, "updated_by": admin})
            changed[code] = value
        audit.log(request, "admin_settings", kind="lettres_cles", changed=changed)
    return Response({"letters": catalog.letters_catalog()})


