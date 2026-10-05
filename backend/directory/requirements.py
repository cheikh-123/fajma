"""
Pièces justificatives exigées avant la publication d'un professionnel ou d'un établissement sur Fajma.

Liste à faire valider par un juriste et les Ordres professionnels du Sénégal : c'est le seul endroit à modifier.
- REQUIRED : pièces obligatoires (sans elles, l'administration ne peut pas publier).
- OPTIONAL : pièces que l'on peut déposer en plus.
- WITH_EXPIRY : pièces qui ont une date de fin de validité (demandée au dépôt, rappel avant échéance).
"""

KIND_LABELS = {
    # Médecins
    "ordre": "Inscription à l'Ordre des médecins",
    "identite": "Pièce d'identité",
    "diplome": "Diplôme de médecine ou de spécialité",
    # Cliniques et centres de santé
    "autorisation_clinique": "Autorisation d'ouverture et d'exploitation (ministère de la Santé)",
    "ninea": "NINEA et registre du commerce (RCCM)",
    "identite_responsable": "Pièce d'identité du responsable de l'établissement",
    "medecin_responsable": "Désignation du médecin responsable (directeur médical)",
    # Pharmacies
    "autorisation_pharmacie": "Autorisation d'exploitation de l'officine",
    "ordre_pharmacien": "Inscription du pharmacien titulaire à l'Ordre des pharmaciens",
    # Laboratoires
    "agrement_laboratoire": "Agrément du laboratoire d'analyses médicales",
    "ordre_biologiste": "Inscription du biologiste responsable à son Ordre",
    # Tous
    "autre": "Autre justificatif",
}

REQUIRED = {
    "doctor": ["ordre", "identite"],
    "clinic": ["autorisation_clinique", "ninea", "identite_responsable", "medecin_responsable"],
    "pharmacy": ["autorisation_pharmacie", "ordre_pharmacien"],
    "laboratory": ["agrement_laboratoire", "ordre_biologiste"],
}

OPTIONAL = {
    "doctor": ["diplome", "autre"],
    "clinic": ["autre"],
    "pharmacy": ["ninea", "autre"],
    "laboratory": ["ninea", "autre"],
}

WITH_EXPIRY = {"identite", "identite_responsable", "autorisation_clinique", "autorisation_pharmacie", "agrement_laboratoire"}

OWNER_LABELS = {"doctor": "Médecin", "clinic": "Clinique", "pharmacy": "Pharmacie", "laboratory": "Laboratoire"}

# Rappel envoyé quand une pièce validée arrive à échéance dans ce nombre de jours.
EXPIRY_NOTICE_DAYS = 30


def allowed_kinds(owner_type: str) -> list[str]:
    return REQUIRED[owner_type] + OPTIONAL[owner_type]


def requirements(owner_type: str) -> list[dict]:
    return [
        {"kind": k, "label": KIND_LABELS[k], "required": k in REQUIRED[owner_type], "expires": k in WITH_EXPIRY}
        for k in allowed_kinds(owner_type)
    ]
