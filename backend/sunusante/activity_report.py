"""
Rapport d'activité (administration) : chiffres mensuels réels de la plateforme, à présenter à un acquéreur ou
à un investisseur. Aucune donnée nominative : uniquement des comptages et des montants agrégés.

GET /api/admin/activity-report?months=12            → JSON (écran de l'administration)
GET /api/admin/activity-report?months=12&export=csv → tableur (séparateur « ; », UTF-8 avec BOM)
"""

from __future__ import annotations

from datetime import UTC, datetime

from django.db.models import Avg, Count, Sum
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


def build_report(months: int) -> dict:
    starts = _month_starts(months)
    period_start, period_end = starts[0], _next(starts[-1])
    rows = []
    for start in starts:
        end = _next(start)
        in_month = {"scheduled_at__gte": start, "scheduled_at__lt": end}
        held = Appointment.objects.filter(**in_month)
        commission = LedgerEntry.objects.filter(kind="earning", created_at__gte=start, created_at__lt=end).aggregate(s=Sum("commission"))["s"] or 0
        subscriptions = SubscriptionPayment.objects.filter(status="paid", paid_at__gte=start, paid_at__lt=end).aggregate(s=Sum("amount"))["s"] or 0
        rows.append(
            {
                "month": start.date().isoformat(),
                "label": f"{MONTHS_FR[start.month - 1]} {start.year}",
                "new_patients": patients_qs().filter(date_joined__gte=start, date_joined__lt=end).count(),
                "active_patients": held.exclude(status="cancelled").exclude(patient=None).values("patient").distinct().count(),
                "new_doctors": Doctor.objects.filter(is_verified=True, created_at__gte=start, created_at__lt=end).count(),
                "appointments_booked": Appointment.objects.filter(created_at__gte=start, created_at__lt=end).count(),
                "appointments_completed": held.filter(status="completed").count(),
                "teleconsultations": held.filter(status="completed", mode="teleconsultation").count(),
                "no_shows": held.filter(status="no_show").count(),
                "prescriptions": Prescription.objects.filter(created_at__gte=start, created_at__lt=end).count(),
                "pharmacy_orders": PrescriptionOrder.objects.filter(created_at__gte=start, created_at__lt=end).count(),
                "lab_orders": LabOrder.objects.filter(created_at__gte=start, created_at__lt=end).count(),
                "online_volume": Payment.objects.filter(status="paid", provider="paydunya", paid_at__gte=start, paid_at__lt=end).aggregate(s=Sum("amount"))["s"] or 0,
                "commission": commission,
                "subscriptions": subscriptions,
                "revenue": commission + subscriptions,
            }
        )

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
