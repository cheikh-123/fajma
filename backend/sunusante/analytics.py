"""Tableau de bord de pilotage (administration) : activité hebdomadaire, répartition, indicateurs clés."""

from datetime import timedelta

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.models import Appointment
from clinics.models import Clinic
from directory.models import Doctor
from payments.models import LedgerEntry, Payment, Subscription
from pharmacy.models import PharmacyMember
from sunusante.api import get_int
from sunusante.activity_report import patients_qs


def _weekly(qs, date_field: str, **aggregates) -> dict[str, dict]:
    rows = qs.annotate(week=TruncWeek(date_field)).values("week").annotate(**aggregates)
    return {r["week"].date().isoformat(): r for r in rows}


@api_view(["GET"])
def admin_analytics(request):
    require_admin(request)
    weeks = get_int(request.query_params, "weeks", default=12, min_value=4, max_value=52)
    now = timezone.now()
    start = (now - timedelta(weeks=weeks - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    start -= timedelta(days=start.weekday())  # lundi

    booked = _weekly(Appointment.objects.filter(created_at__gte=start), "created_at", n=Count("id"))
    held = _weekly(
        Appointment.objects.filter(scheduled_at__gte=start, scheduled_at__lte=now),
        "scheduled_at",
        completed=Count("id", filter=Q(status="completed")),
        no_show=Count("id", filter=Q(status="no_show")),
        cancelled=Count("id", filter=Q(status="cancelled")),
        tele=Count("id", filter=Q(mode="teleconsultation", status="completed")),
    )
    patients = _weekly(patients_qs().filter(date_joined__gte=start), "date_joined", n=Count("id"))
    paid = _weekly(Payment.objects.filter(status="paid", provider="paydunya", paid_at__gte=start), "paid_at", volume=Sum("amount"))
    commission = _weekly(LedgerEntry.objects.filter(kind="earning", created_at__gte=start), "created_at", c=Sum("commission"))

    series = []
    for i in range(weeks):
        key = (start + timedelta(weeks=i)).date().isoformat()
        h = held.get(key, {})
        series.append(
            {
                "week": key,
                "booked": booked.get(key, {}).get("n", 0),
                "completed": h.get("completed", 0),
                "no_show": h.get("no_show", 0),
                "cancelled": h.get("cancelled", 0),
                "teleconsultations": h.get("tele", 0),
                "new_patients": patients.get(key, {}).get("n", 0),
                "online_volume": paid.get(key, {}).get("volume") or 0,
                "commission": commission.get(key, {}).get("c") or 0,
            }
        )

    last90 = Appointment.objects.filter(created_at__gte=now - timedelta(days=90))
    completed = sum(s["completed"] for s in series)
    no_show = sum(s["no_show"] for s in series)
    return Response(
        {
            "series": series,
            "kpis": {
                "patients": patients_qs().count(),  # sans les comptes professionnels
                "doctors_verified": Doctor.objects.filter(is_verified=True).count(),
                "doctors_pending": Doctor.objects.filter(is_verified=False).count(),
                "clinics": Clinic.objects.count(),
                "partner_pharmacies": PharmacyMember.objects.values("pharmacy").distinct().count(),
                "paying_subscriptions": Subscription.objects.filter(current_period_end__gt=now).exclude(plan="essentiel").count(),
                "no_show_rate": round(100 * no_show / (completed + no_show), 1) if completed + no_show else 0,
                "teleconsultation_share": round(100 * sum(s["teleconsultations"] for s in series) / completed, 1) if completed else 0,
            },
            "by_channel": list(last90.values("channel").annotate(n=Count("id")).order_by("-n")),
            "by_specialty": list(
                last90.exclude(doctor__specialty=None).values(name=F("doctor__specialty__name")).annotate(n=Count("id")).order_by("-n")[:8]
            ),
            "by_city": list(last90.values(name=F("doctor__city")).annotate(n=Count("id")).order_by("-n")[:8]),
        }
    )

