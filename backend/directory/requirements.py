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
    # Laboratoires d'analyses
    "agrement_laboratoire": "Agrément du laboratoire d'analyses médicales",
    "ordre_biologiste": "Inscription du biologiste responsable à son Ordre",
    # Centres d'imagerie
    "autorisation_imagerie": "Autorisation d'exploitation du centre d'imagerie médicale (ministère de la Santé)",
    "ordre_radiologue": "Inscription du médecin radiologue responsable à l'Ordre des médecins",
    "radioprotection": "Autorisation de détention et d'utilisation d'appareils à rayonnements ionisants",
    # Tous
    "autre": "Autre justificatif",
}

REQUIRED = {
    "doctor": ["ordre", "identite"],
    "clinic": ["autorisation_clinique", "ninea", "identite_responsable", "medecin_responsable"],
    "pharmacy": ["autorisation_pharmacie", "ordre_pharmacien"],
    # Par défaut : laboratoire d'analyses. Un centre d'imagerie a d'autres obligations : voir
    # `required_for()`, qui tient compte de ce que l'établissement déclare faire.
    "laboratory": ["agrement_laboratoire", "ordre_biologiste"],
}

# Centres d'imagerie : autorisation d'exploitation et radiologue responsable ; la radioprotection
# n'est exigée que pour les examens utilisant les rayonnements ionisants (une échographie n'en
# produit pas). Les codes des examens viennent de labs/imaging.py.
IMAGING_REQUIRED = ["autorisation_imagerie", "ordre_radiologue"]
IONISING_MODALITIES = {"radio", "scanner", "mammo", "panoramique", "osteo"}
IONISING_REQUIRED = "radioprotection"


OPTIONAL = {
    "doctor": ["diplome", "autre"],
    "clinic": ["autre"],
    "pharmacy": ["ninea", "autre"],
    "laboratory": ["ninea", "autre"],
}

WITH_EXPIRY = {
    "identite", "identite_responsable", "autorisation_clinique", "autorisation_pharmacie",
    "agrement_laboratoire", "autorisation_imagerie", "radioprotection",
}

OWNER_LABELS = {"doctor": "Médecin", "clinic": "Clinique", "pharmacy": "Pharmacie", "laboratory": "Laboratoire ou centre d'imagerie"}

# Rappel envoyé quand une pièce validée arrive à échéance dans ce nombre de jours.
EXPIRY_NOTICE_DAYS = 30


def required_for(owner_type: str, owner=None) -> list[str]:
    """
    Pièces obligatoires pour cet établissement précis. Un plateau technique ne demande pas les mêmes
    papiers selon qu'il fait des analyses, de l'imagerie, ou les deux ; et la radioprotection n'est
    exigée que s'il utilise des rayonnements ionisants.
    """
    base = list(REQUIRED[owner_type])
    if owner_type != "laboratory" or owner is None:
        return base
    kind = getattr(owner, "kind", "analyses")
    needed = base if kind in ("analyses", "both") else []
    if kind in ("imagerie", "both"):
        needed = needed + IMAGING_REQUIRED
        if set(getattr(owner, "modalities", None) or []) & IONISING_MODALITIES:
            needed = needed + [IONISING_REQUIRED]
    return needed


def allowed_kinds(owner_type: str, owner=None) -> list[str]:
    """
    Pièces que cet établissement peut déposer : celles qui le concernent, puis les facultatives.
    Un centre d'imagerie ne se voit donc pas proposer l'agrément d'un laboratoire d'analyses.
    """
    out: list[str] = []
    for k in required_for(owner_type, owner) + OPTIONAL[owner_type]:
        if k not in out:
            out.append(k)
    return out


def requirements(owner_type: str, owner=None) -> list[dict]:
    needed = required_for(owner_type, owner)
    return [
        {"kind": k, "label": KIND_LABELS[k], "required": k in needed, "expires": k in WITH_EXPIRY}
        for k in allowed_kinds(owner_type, owner)
    ]
