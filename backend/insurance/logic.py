"""Calcul de la part patient selon la couverture choisie à la réservation."""

from __future__ import annotations

from django.utils import timezone

from sunusante.api import ApiError

from .models import DoctorInsurer, PatientCoverage


def coverage_for_booking(user, relative, doctor, coverage_id) -> tuple[PatientCoverage, DoctorInsurer] | None:
    """Vérifie que la couverture appartient bien au patient (ou au proche) et que le médecin accepte l'organisme."""
    if not coverage_id:
        return None
    cov = PatientCoverage.objects.filter(id=coverage_id, user=user).select_related("insurer").first()
    if not cov:
        raise ApiError("Couverture introuvable")
    if (cov.relative_id or None) != (relative.id if relative else None):
        raise ApiError("Cette couverture ne concerne pas la personne qui consulte")
    if cov.valid_until and cov.valid_until < timezone.localdate():
        raise ApiError("Cette couverture a expiré : mettez-la à jour dans votre dossier")
    accepted = DoctorInsurer.objects.filter(doctor=doctor, insurer=cov.insurer, insurer__is_active=True).first()
    if not accepted:
        raise ApiError(f"Ce médecin n'accepte pas {cov.insurer.name}")
    return cov, accepted


def patient_share(price: int, coverage_percent: int) -> int:
    """Part restant à la charge du patient (arrondie au franc, en faveur du patient)."""
    return price - (price * coverage_percent) // 100


def appointment_fields(found, price: int) -> dict:
    if not found:
        return {}
    cov, accepted = found
    return {
        "insurer": cov.insurer,
        "insurance_member_number": cov.member_number,
        "coverage_percent": cov.coverage_percent,
        "tiers_payant": accepted.tiers_payant,
        "patient_share": patient_share(price, cov.coverage_percent) if accepted.tiers_payant else None,
    }


def insurance_dict(appt) -> dict | None:
    if not appt.insurer_id:
        return None
    price = appt.price or 0
    return {
        "insurer": appt.insurer.name,
        "member_number": appt.insurance_member_number,
        "coverage_percent": appt.coverage_percent,
        "tiers_payant": appt.tiers_payant,
        "patient_share": appt.patient_share,
        "insurer_share": price - appt.patient_share if appt.patient_share is not None else None,
    }
