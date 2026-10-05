"""
Rapport d'activité (administration) : chiffres mensuels réels de la plateforme, à présenter à un acquéreur ou
à un investisseur. Aucune donnée nominative : uniquement des comptages et des montants agrégés.

GET /api/admin/activity-report?months=12            → JSON (écran de l'administration)
GET /api/admin/activity-report?months=12&export=csv → tableur (séparateur « ; », UTF-8 avec BOM)
"""

from __future__ import annotations

from datetime import UTC, datetime

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from accounts.views import require_admin
from appointments.models import Appointment
from audit import log as audit
from clinics.models import Clinic
from directory.models import Doctor, Review
from labs.models import LabOrder, LaboratoryMember
from medical.models import Prescription
from payments.models import LedgerEntry, Payment, SubscriptionPayment
from pharmacy.models import PharmacyMember, PrescriptionOrder
from sunusante.api import get_int

from .exports import _csv

MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _month_starts(months: int) -> list[datetime]:
    now = timezone.now()
    year, month = now.year, now.month
    starts = []
    for _ in range(months):
        starts.append(datetime(year, month, 1, tzinfo=UTC))  # heure de Dakar = UTC
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(starts))


def _next(d: datetime) -> datetime:
    return datetime(d.year + (d.month == 12), d.month % 12 + 1, 1, tzinfo=UTC)


def patients_qs():
    """Comptes patients : ni professionnels (médecin, pharmacie, laboratoire, clinique), ni équipe Fajma."""
    from clinics.models import ClinicStaff

    pros = (
        set(PharmacyMember.objects.values_list("user_id", flat=True))
        | set(LaboratoryMember.objects.values_list("user_id", flat=True))
        | set(ClinicStaff.objects.values_list("user_id", flat=True))
        | set(Clinic.objects.values_list("owner_id", flat=True))
    )
    return User.objects.filter(is_staff=False, doctor__isnull=True).exclude(id__in=pros)


def _by_month(qs, field: str, value=None, start=None, end=None) -> dict:
    """{date du 1er du mois: valeur} en UNE requête (regroupement par mois) au lieu d'une requête par mois."""
    qs = qs.filter(**{f"{field}__gte": start, f"{field}__lt": end})
    rows = qs.annotate(m=TruncMonth(field, tzinfo=UTC)).values("m").annotate(v=value or Count("id")).values_list("m", "v")
    return {m.date(): v or 0 for m, v in rows}


def build_report(months: int) -> dict:
    starts = _month_starts(months)
    period_start, period_end = starts[0], _next(starts[-1])
    span = {"start": period_start, "end": period_end}
    # Chaque indicateur : une requête pour toute la période, regroupée par mois (≈ 15 requêtes au total).
    held = Appointment.objects.all()
    per_month = {
        "new_patients": _by_month(patients_qs(), "date_joined", **span),
        "active_patients": _by_month(
            held.exclude(status="cancelled").exclude(patient=None), "scheduled_at", Count("patient", distinct=True), **span
        ),
        "new_doctors": _by_month(Doctor.objects.filter(is_verified=True), "created_at", **span),
        "appointments_booked": _by_month(Appointment.objects.all(), "created_at", **span),
        "appointments_completed": _by_month(held, "scheduled_at", Count("id", filter=Q(status="completed")), **span),
        "teleconsultations": _by_month(
            held, "scheduled_at", Count("id", filter=Q(status="completed", mode="teleconsultation")), **span
        ),
        "no_shows": _by_month(held, "scheduled_at", Count("id", filter=Q(status="no_show")), **span),
        "prescriptions": _by_month(Prescription.objects.all(), "created_at", **span),
        "pharmacy_orders": _by_month(PrescriptionOrder.objects.all(), "created_at", **span),
        "lab_orders": _by_month(LabOrder.objects.all(), "created_at", **span),
        "online_volume": _by_month(Payment.objects.filter(status="paid", provider="paydunya"), "paid_at", Sum("amount"), **span),
        "commission": _by_month(LedgerEntry.objects.filter(kind="earning"), "created_at", Sum("commission"), **span),
        "subscriptions": _by_month(SubscriptionPayment.objects.filter(status="paid"), "paid_at", Sum("amount"), **span),
    }
    rows = []
    for start in starts:
        key = start.date()
        row = {"month": key.isoformat(), "label": f"{MONTHS_FR[start.month - 1]} {start.year}"}
        row.update({name: values.get(key, 0) for name, values in per_month.items()})
        row["revenue"] = row["commission"] + row["subscriptions"]
        rows.append(row)

    # Fidélité : parmi les patients ayant eu au moins une consultation, part de ceux qui en ont eu plusieurs.
    completed_by_patient = (
        Appointment.objects.filter(status="completed").exclude(patient=None).values("patient").annotate(n=Count("id"))
    )
    seen = completed_by_patient.count()
    returning = completed_by_patient.filter(n__gte=2).count()
    period = Appointment.objects.filter(scheduled_at__gte=period_start, scheduled_at__lt=period_end)
    done, absent = period.filter(status="completed").count(), period.filter(status="no_show").count()
    reviews = Review.objects.filter(status="published").aggregate(n=Count("id"), avg=Avg("rating"))

    def growth(key: str) -> float | None:
        if len(rows) < 3:
            return None
        last, before = rows[-2][key], rows[-3][key]  # deux derniers mois complets
        return round(100 * (last - before) / before, 1) if before else None

    return {
        "generated_at": timezone.now().isoformat(),
        "period": {"from": period_start.date().isoformat(), "to": period_end.date().isoformat(), "months": months},
        "totals": {
            "patients": patients_qs().count(),
            "doctors_verified": Doctor.objects.filter(is_verified=True).count(),
            "cities": Doctor.objects.filter(is_verified=True).values("city").distinct().count(),
            "clinics": Clinic.objects.filter(kind="clinic").count(),
            "partner_pharmacies": PharmacyMember.objects.values("pharmacy").distinct().count(),
            "partner_labs": LaboratoryMember.objects.values("laboratory").distinct().count(),
            "appointments_completed": sum(r["appointments_completed"] for r in rows),
            "revenue": sum(r["revenue"] for r in rows),
            "online_volume": sum(r["online_volume"] for r in rows),
            "returning_patients_rate": round(100 * returning / seen, 1) if seen else None,
            "no_show_rate": round(100 * absent / (done + absent), 1) if done + absent else None,
            "reviews": reviews["n"],
            "average_rating": round(float(reviews["avg"]), 2) if reviews["avg"] else None,
            "growth_appointments": growth("appointments_completed"),
            "growth_patients": growth("active_patients"),
        },
        "channels": list(period.values("channel").annotate(n=Count("id")).order_by("-n")),
        "months": rows,
    }


CSV_COLUMNS = [
    ("label", "Mois"),
    ("new_patients", "Nouveaux patients"),
    ("active_patients", "Patients actifs"),
    ("new_doctors", "Nouveaux médecins publiés"),
    ("appointments_booked", "RDV réservés"),
    ("appointments_completed", "Consultations réalisées"),
    ("teleconsultations", "dont téléconsultations"),
    ("no_shows", "Absences"),
    ("prescriptions", "Ordonnances"),
    ("pharmacy_orders", "Commandes en pharmacie"),
    ("lab_orders", "Analyses prescrites"),
    ("online_volume", "Paiements en ligne (F CFA)"),
    ("commission", "Commissions (F CFA)"),
    ("subscriptions", "Abonnements (F CFA)"),
    ("revenue", "Chiffre d'affaires Fajma (F CFA)"),
]


@api_view(["GET"])
def admin_activity_report(request):
    admin = require_admin(request)
    months = get_int(request.query_params, "months", default=12, min_value=3, max_value=36)
    report = build_report(months)
    if request.query_params.get("export") == "csv":
        audit.log(request, "data_export", actor=admin, export="rapport d'activité", months=months)
        rows = [[r[k] for k, _ in CSV_COLUMNS] for r in report["months"]]
        return _csv(f"fajma-rapport-activite-{report['period']['to']}.csv", [label for _, label in CSV_COLUMNS], rows)
    return Response(report)
