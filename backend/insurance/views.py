"""Assurances : liste des organismes, couvertures du patient, organismes acceptés par le médecin."""

from datetime import date

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import Relative
from appointments.views import my_doctor
from sunusante.api import ApiError, body, get_int, get_str, get_uuid, not_found, require_user

from .models import DoctorInsurer, Insurer, PatientCoverage


def insurer_dict(i: Insurer) -> dict:
    return {"id": str(i.id), "slug": i.slug, "name": i.name, "kind": i.kind, "kind_label": i.get_kind_display(), "default_coverage_percent": i.default_coverage_percent}


def coverage_dict(c: PatientCoverage) -> dict:
    return {
        "id": str(c.id),
        "insurer": insurer_dict(c.insurer),
        "member_number": c.member_number,
        "coverage_percent": c.coverage_percent,
        "valid_until": c.valid_until.isoformat() if c.valid_until else None,
        "relative": {"id": str(c.relative.id), "full_name": c.relative.full_name} if c.relative else None,
    }


@api_view(["GET"])
def list_insurers(request):
    return Response([insurer_dict(i) for i in Insurer.objects.filter(is_active=True)])


@api_view(["GET", "POST"])
def my_coverages(request):
    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        insurer = Insurer.objects.filter(id=get_uuid(data, "insurer_id"), is_active=True).first()
        if not insurer:
            raise not_found("Organisme introuvable")
        relative = None
        if relative_id := get_uuid(data, "relative_id", required=False):
            relative = Relative.objects.filter(id=relative_id, owner=user).first()
            if not relative:
                raise not_found("Proche introuvable")
        valid_until = None
        if raw := get_str(data, "valid_until", max_len=10):
            try:
                valid_until = date.fromisoformat(raw)
            except ValueError as err:
                raise ApiError("Date de validité invalide") from err
        percent = get_int(data, "coverage_percent", default=insurer.default_coverage_percent, min_value=0, max_value=100)
        PatientCoverage.objects.create(
            user=user,
            relative=relative,
            insurer=insurer,
            member_number=get_str(data, "member_number", required=True, min_len=2, max_len=40),
            coverage_percent=percent,
            valid_until=valid_until,
        )
    coverages = PatientCoverage.objects.filter(user=user).select_related("insurer", "relative")
    return Response([coverage_dict(c) for c in coverages])


@api_view(["POST"])
def delete_coverage(request, coverage_id):
    user = require_user(request)
    deleted, _ = PatientCoverage.objects.filter(id=coverage_id, user=user).delete()
    if not deleted:
        raise not_found("Couverture introuvable")
    return Response({"ok": True})


@api_view(["GET", "POST"])
def pro_insurers(request):
    """GET : organismes acceptés. POST {insurers: [{insurer_id, tiers_payant}]} : remplace la liste."""
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        items = body(request).get("insurers")
        if not isinstance(items, list) or len(items) > 100:
            raise ApiError("Liste invalide")
        wanted: dict = {}
        for item in items:
            if not isinstance(item, dict):
                raise ApiError("Liste invalide")
            insurer_id = get_uuid(item, "insurer_id")
            wanted[insurer_id] = bool(item.get("tiers_payant"))
        insurers = {i.id: i for i in Insurer.objects.filter(id__in=wanted, is_active=True)}
        if len(insurers) != len(wanted):
            raise ApiError("Organisme inconnu")
        with transaction.atomic():
            DoctorInsurer.objects.filter(doctor=doctor).exclude(insurer_id__in=wanted).delete()
            for insurer_id, tiers in wanted.items():
                DoctorInsurer.objects.update_or_create(doctor=doctor, insurer=insurers[insurer_id], defaults={"tiers_payant": tiers})
    return Response(accepted_insurers(doctor))


def accepted_insurers(doctor) -> list[dict]:
    return [
        {**insurer_dict(a.insurer), "tiers_payant": a.tiers_payant}
        for a in DoctorInsurer.objects.filter(doctor=doctor, insurer__is_active=True).select_related("insurer").order_by("insurer__name")
    ]
