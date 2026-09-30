"""
Organismes de prise en charge courants au Sénégal (liste de référence, modifiable dans l'administration).
Les taux sont indicatifs : le patient saisit celui de son contrat.
"""

import uuid

INSURERS = [
    ("cmu-mutuelle", "Mutuelle de santé communautaire (CMU)", "mutuelle", 80),
    ("ipm", "IPM — Institution de prévoyance maladie (entreprise)", "ipm", 80),
    ("imputation-budgetaire", "Imputation budgétaire (agents de l'État)", "public", 80),
    ("plan-sesame", "Plan Sésame (60 ans et plus)", "public", 100),
    ("axa-senegal", "AXA Assurances Sénégal", "assurance", 80),
    ("allianz-senegal", "Allianz Sénégal", "assurance", 80),
    ("sunu-assurances", "SUNU Assurances", "assurance", 80),
    ("askia-assurances", "ASKIA Assurances", "assurance", 80),
    ("sanlam-senegal", "Sanlam Assurances Sénégal", "assurance", 80),
    ("nsia-senegal", "NSIA Assurances Sénégal", "assurance", 80),
    ("amsa-assurances", "AMSA Assurances", "assurance", 80),
]


def ensure_insurers(insurer_model) -> None:
    """Crée les organismes manquants (sans toucher à ceux modifiés dans l'administration)."""
    for slug, name, kind, percent in INSURERS:
        insurer_model.objects.get_or_create(
            slug=slug, defaults={"id": uuid.uuid4(), "name": name, "kind": kind, "default_coverage_percent": percent}
        )
