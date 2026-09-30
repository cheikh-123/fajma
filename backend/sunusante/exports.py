"""
Exports CSV (tableur) : rendez-vous, revenus, bordereau de tiers payant, agenda de clinique.
Séparateur « ; » et encodage UTF-8 avec BOM : ouverture directe dans Excel en français.
Chaque export contenant des données personnelles est inscrit au journal d'audit.
"""

import csv
import io
from datetime import UTC, date, datetime, timedelta

from django.db.models import Q
from django.http import HttpResponse
from rest_framework.decorators import api_view

from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, require_user

STATUS = {"pending": "En attente", "confirmed": "Confirmé", "cancelled": "Annulé", "completed": "Terminé", "no_show": "Absent"}
MODE = {"in_person": "Cabinet", "teleconsultation": "Vidéo", "home_visit": "Domicile"}
MAX_DAYS = 366


def _period(params) -> tuple[datetime, datetime]:
    """Du jour « from » inclus au jour « to » inclus (heure de Dakar = UTC) ; par défaut, le mois en cours."""
    today = date.today()
    try:
        start = date.fromisoformat(params.get("from") or today.replace(day=1).isoformat())
        end = date.fromisoformat(params.get("to") or today.isoformat())
    except ValueError as err:
        raise ApiError("Dates invalides (AAAA-MM-JJ)") from err
    if end < start or (end - start).days > MAX_DAYS:
        raise ApiError("Période invalide (un an au plus)")
    return datetime(start.year, start.month, start.day, tzinfo=UTC), datetime(end.year, end.month, end.day, tzinfo=UTC) + timedelta(days=1)


def _csv(filename: str, header: list[str], rows) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(header)
    writer.writerows(rows)
    response = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Cache-Control"] = "private, no-store"
    return response


def _who(a: Appointment) -> tuple[str, str]:
    if a.relative:
        return a.relative.full_name, (a.patient.phone if a.patient else "") or ""
    if a.patient:
        return a.patient.full_name or "Patient", a.patient.phone or ""
    return a.external_patient_name or "Patient", a.external_patient_phone or ""


def appointment_rows(qs):
    for a in qs:
        name, phone = _who(a)
        paid = any(p.status == "paid" for p in a.payments.all())
        yield [
            a.scheduled_at.strftime("%d/%m/%Y"),
            a.scheduled_at.strftime("%H:%M"),
            a.duration_minutes,
            name,
            phone,
            a.consultation_type.name if a.consultation_type else "",
            a.reason,
            MODE.get(a.mode, a.mode),
            STATUS.get(a.status, a.status),
            a.price if a.price is not None else "",
            "oui" if paid else "non",
            a.insurer.name if a.insurer else "",
            a.patient_share if a.tiers_payant and a.patient_share is not None else "",
            (a.price - a.patient_share) if a.tiers_payant and a.price is not None and a.patient_share is not None else "",
            a.practitioner.full_name if a.practitioner else "",
            a.doctor.full_name,
        ]


APPOINTMENT_HEADER = [
    "Date", "Heure", "Durée (min)", "Patient", "Téléphone", "Motif (type)", "Motif (patient)", "Mode", "Statut",
    "Prix (F CFA)", "Payé en ligne ou au cabinet", "Assurance", "Part patient (tiers payant)", "Part assurance",
    "Assuré par (remplaçant)", "Médecin titulaire",
]


def _appointments(qs):
    return qs.select_related("patient", "relative", "consultation_type", "insurer", "practitioner", "doctor").prefetch_related("payments").order_by("scheduled_at")


@api_view(["GET"])
def pro_appointments_csv(request):
    doctor = my_doctor(require_user(request))
    start, end = _period(request.query_params)
    qs = _appointments(Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), scheduled_at__gte=start, scheduled_at__lt=end))
    audit.log(request, "data_export", export="rendez-vous", start=start.date().isoformat(), end=end.date().isoformat())
    return _csv(f"fajma-rendez-vous-{start:%Y%m%d}-{end - timedelta(days=1):%Y%m%d}.csv", APPOINTMENT_HEADER, appointment_rows(qs))


@api_view(["GET"])
def pro_insurance_csv(request):
    """Bordereau de tiers payant : consultations terminées à facturer aux organismes (IPM, mutuelles, assureurs)."""
    doctor = my_doctor(require_user(request))
    start, end = _period(request.query_params)
    qs = (
        Appointment.objects.filter(doctor=doctor, tiers_payant=True, status="completed", scheduled_at__gte=start, scheduled_at__lt=end)
        .select_related("patient", "relative", "insurer", "consultation_type")
        .order_by("insurer__name", "scheduled_at")
    )
    rows = []
    for a in qs:
        name, _ = _who(a)
        share = a.patient_share or 0
        rows.append([
            a.insurer.name if a.insurer else "", a.scheduled_at.strftime("%d/%m/%Y"), name, a.insurance_member_number,
            a.consultation_type.name if a.consultation_type else "Consultation", a.price or 0, a.coverage_percent or 0,
            share, (a.price or 0) - share,
        ])
    audit.log(request, "data_export", export="tiers payant", start=start.date().isoformat(), end=end.date().isoformat())
    return _csv(
        f"fajma-tiers-payant-{start:%Y%m%d}-{end - timedelta(days=1):%Y%m%d}.csv",
        ["Organisme", "Date", "Patient", "N° d'adhérent", "Acte", "Prix (F CFA)", "Taux (%)", "Réglé par le patient", "À facturer à l'organisme"],
        rows,
    )


@api_view(["GET"])
def pro_finance_csv(request):
    """Journal des revenus : encaissements, commissions, virements, remboursements."""
    from payments.models import LedgerEntry

    doctor = my_doctor(require_user(request))
    start, end = _period(request.query_params)
    entries = LedgerEntry.objects.filter(doctor=doctor, created_at__gte=start, created_at__lt=end).order_by("created_at")
    rows = [
        [e.created_at.strftime("%d/%m/%Y %H:%M"), e.get_kind_display(), e.description, e.gross if e.gross is not None else "",
         e.commission if e.commission is not None else "", e.amount]
        for e in entries
    ]
    audit.log(request, "data_export", export="revenus", start=start.date().isoformat(), end=end.date().isoformat())
    return _csv(
        f"fajma-revenus-{start:%Y%m%d}-{end - timedelta(days=1):%Y%m%d}.csv",
        ["Date", "Type", "Libellé", "Montant brut (F CFA)", "Commission Fajma", "Net sur votre solde"],
        rows,
    )


@api_view(["GET"])
def clinic_appointments_csv(request, clinic_id):
    from clinics.views import clinic_access

    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)  # responsable ou secrétariat de l'établissement
    start, end = _period(request.query_params)
    qs = _appointments(Appointment.objects.filter(doctor__clinic_memberships__clinic=clinic, scheduled_at__gte=start, scheduled_at__lt=end))
    audit.log(request, "data_export", export="agenda clinique", clinic=str(clinic.id), start=start.date().isoformat())
    return _csv(f"fajma-{clinic.name[:30]}-{start:%Y%m%d}.csv".replace(" ", "-"), APPOINTMENT_HEADER, appointment_rows(qs))
