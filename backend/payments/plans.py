"""Formules d'abonnement des médecins. La formule fixe la commission prélevée sur les paiements en ligne."""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

PLANS: dict[str, dict] = {
    "essentiel": {
        "name": "Essentiel",
        "monthly_price": 0,
        "commission_percent": Decimal("8"),
        "features": ["Agenda en ligne et prise de RDV 24h/24", "Rappels SMS aux patients", "Téléconsultation", "Paiement mobile (commission 8 %)"],
    },
    "pro": {
        "name": "Pro",
        "monthly_price": 15000,
        "commission_percent": Decimal("3"),
        "features": ["Tout Essentiel", "Commission réduite à 3 %", "Rentable dès 20 consultations payées en ligne par mois"],
    },
    "clinique": {
        "name": "Clinique",
        "monthly_price": 40000,
        "commission_percent": Decimal("2"),
        "features": ["Tout Pro", "Commission réduite à 2 %", "Rentable dès 45 consultations payées en ligne par mois", "Support prioritaire"],
    },
}
DURATIONS = {1: 0, 3: 5, 12: 15}  # mois → remise en %
PERIOD_DAYS_PER_MONTH = 30


def price_for(plan: str, months: int) -> int:
    base = PLANS[plan]["monthly_price"] * months
    return base - base * DURATIONS[months] // 100


def effective_plan(doctor) -> str:
    sub = getattr(doctor, "subscription", None)
    if sub and sub.plan in PLANS and sub.plan != "essentiel" and sub.current_period_end and sub.current_period_end > timezone.now():
        return sub.plan
    return "essentiel"


def commission_for(gross: int, percent: Decimal) -> int:
    """Commission arrondie au franc le plus proche (le FCFA n'a pas de centimes)."""
    return int((Decimal(gross) * percent / 100).quantize(Decimal("1")))


def plans_payload() -> list[dict]:
    return [
        {
            "id": key,
            "name": p["name"],
            "monthly_price": p["monthly_price"],
            "commission_percent": float(p["commission_percent"]),
            "features": p["features"],
            "prices": {str(m): price_for(key, m) for m in DURATIONS},
        }
        for key, p in PLANS.items()
    ]


@api_view(["GET"])
def public_plans(request):
    """Formules pour les professionnels, affichées sur la page publique « Tarifs »."""
    return Response(
        {"plans": plans_payload(), "durations": [{"months": m, "discount_percent": d} for m, d in DURATIONS.items()]}
    )
