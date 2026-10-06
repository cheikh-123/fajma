"""
Nomenclature des actes professionnels : le langage commun entre le médecin, le patient et l'organisme
qui rembourse (IPM, mutuelle, CMU, assurance privée).

Système des **lettres-clés** utilisé au Sénégal (héritage de la NGAP) : chaque acte vaut une lettre
multipliée par un coefficient. Le tarif de base est donc :

    tarif = valeur de la lettre-clé (F CFA) × coefficient

La valeur de chaque lettre est fixée par convention et change avec le temps : elle est enregistrée en base
(modèle `ActLetter`) et modifiable par l'administration, sans toucher au code. La liste des actes, elle, est
versionnée ici comme les catalogues de maladies et de médicaments.

Un acte ne remplace pas le prix libre du médecin : il donne la **base de remboursement** opposable à
l'organisme. Le patient voit donc ce qu'il paie et ce qui lui sera rendu.

Liste à faire valider par les organismes (IPM, CMU) avant la mise en service.
"""

from __future__ import annotations

from decimal import Decimal
from typing import NamedTuple

# Lettres-clés et leur valeur par défaut en F CFA (modifiables dans l'administration).
LETTERS: dict[str, tuple[str, int]] = {
    "C": ("Consultation de médecine générale", 1000),
    "CS": ("Consultation de médecin spécialiste", 1500),
    "CNPSY": ("Consultation de neuropsychiatrie", 1800),
    "V": ("Visite à domicile (généraliste)", 1200),
    "VS": ("Visite à domicile (spécialiste)", 1800),
    "K": ("Acte de spécialité ou de petite chirurgie", 400),
    "KC": ("Acte de chirurgie", 500),
    "B": ("Analyse de biologie médicale", 150),
    "Z": ("Acte d'imagerie médicale", 450),
    "SF": ("Acte de sage-femme", 300),
    "AMI": ("Acte médico-infirmier", 250),
    "D": ("Acte dentaire", 400),
}


class Act(NamedTuple):
    code: str
    label: str
    letter: str
    coefficient: Decimal
    group: str
    note: str = ""


def _a(code, label, letter, coef, group, note="") -> Act:
    return Act(code, label, letter, Decimal(str(coef)), group, note)


ACTS: list[Act] = [
    # Consultations
    _a("C", "Consultation de médecine générale", "C", 1, "Consultations"),
    _a("CS", "Consultation de médecin spécialiste", "CS", 1, "Consultations"),
    _a("CNPSY", "Consultation de neuropsychiatrie", "CNPSY", 1, "Consultations"),
    _a("C2", "Consultation approfondie (avis ponctuel de spécialiste)", "CS", 2, "Consultations"),
    _a("V", "Visite à domicile, médecine générale", "V", 1, "Consultations"),
    _a("VS", "Visite à domicile, spécialiste", "VS", 1, "Consultations"),
    _a("CTEL", "Téléconsultation", "C", 1, "Consultations", "Même base que la consultation en présentiel"),
    # Suivi de la mère et de l'enfant
    _a("CPN", "Consultation prénatale", "C", 1, "Mère et enfant"),
    _a("CPON", "Consultation postnatale", "C", 1, "Mère et enfant"),
    _a("ACC", "Accouchement simple", "KC", 20, "Mère et enfant"),
    _a("SF1", "Surveillance du travail par la sage-femme", "SF", 10, "Mère et enfant"),
    _a("VAC", "Séance de vaccination", "AMI", 1, "Mère et enfant"),
    _a("CNS", "Consultation de nourrisson (suivi de croissance)", "C", 1, "Mère et enfant"),
    # Gestes courants au cabinet
    _a("PANS", "Pansement simple", "AMI", 2, "Gestes au cabinet"),
    _a("PANSC", "Pansement complexe ou brûlure", "AMI", 4, "Gestes au cabinet"),
    _a("SUT", "Suture de plaie", "KC", 6, "Gestes au cabinet"),
    _a("INJ", "Injection intramusculaire ou sous-cutanée", "AMI", 1, "Gestes au cabinet"),
    _a("PERF", "Pose de perfusion et surveillance", "AMI", 3, "Gestes au cabinet"),
    _a("SOND", "Sondage vésical", "AMI", 3, "Gestes au cabinet"),
    _a("INC", "Incision d'abcès", "KC", 8, "Gestes au cabinet"),
    _a("EXT", "Extraction de corps étranger", "K", 5, "Gestes au cabinet"),
    _a("CIRC", "Circoncision", "KC", 15, "Gestes au cabinet"),
    _a("PLAT", "Immobilisation plâtrée", "K", 10, "Gestes au cabinet"),
    _a("ECG", "Électrocardiogramme", "K", 6, "Gestes au cabinet"),
    _a("FROT", "Frottis cervico-vaginal", "K", 4, "Gestes au cabinet"),
    _a("TDR", "Test de diagnostic rapide (paludisme, VIH…)", "B", 5, "Gestes au cabinet"),
    _a("GLYC", "Glycémie capillaire", "B", 3, "Gestes au cabinet"),
    # Imagerie (lettre Z)
    _a("ZRAD", "Radiographie standard (un cliché)", "Z", 10, "Imagerie"),
    _a("ZRAD2", "Radiographie, deux incidences", "Z", 15, "Imagerie"),
    _a("ZECH", "Échographie", "Z", 20, "Imagerie"),
    _a("ZECHO", "Échographie obstétricale", "Z", 20, "Imagerie"),
    _a("ZDOP", "Échographie-doppler", "Z", 30, "Imagerie"),
    _a("ZSCAN", "Scanner (par région)", "Z", 60, "Imagerie"),
    _a("ZIRM", "IRM (par région)", "Z", 100, "Imagerie"),
    _a("ZMAM", "Mammographie", "Z", 25, "Imagerie"),
    _a("ZPAN", "Panoramique dentaire", "Z", 12, "Imagerie"),
    # Biologie (lettre B)
    _a("BNFS", "Numération formule sanguine", "B", 10, "Biologie"),
    _a("BGLY", "Glycémie veineuse", "B", 5, "Biologie"),
    _a("BCREA", "Créatininémie", "B", 6, "Biologie"),
    _a("BLIP", "Bilan lipidique", "B", 15, "Biologie"),
    _a("BGE", "Goutte épaisse / frottis sanguin", "B", 8, "Biologie"),
    _a("BECBU", "Examen cytobactériologique des urines", "B", 15, "Biologie"),
    _a("BHB", "Électrophorèse de l'hémoglobine", "B", 25, "Biologie"),
    _a("BGRP", "Groupe sanguin et rhésus", "B", 10, "Biologie"),
    _a("BHCG", "Test de grossesse (β-HCG)", "B", 10, "Biologie"),
    _a("BTRANS", "Transaminases", "B", 10, "Biologie"),
    # Dentaire
    _a("DCONS", "Consultation dentaire", "D", 1, "Dentaire"),
    _a("DDET", "Détartrage", "D", 5, "Dentaire"),
    _a("DEXT", "Extraction dentaire simple", "D", 6, "Dentaire"),
    _a("DSOIN", "Soin de carie", "D", 8, "Dentaire"),
    # Autres
    _a("KINE", "Séance de kinésithérapie", "AMI", 4, "Autres"),
    _a("URG", "Majoration pour acte en urgence (nuit, dimanche, jour férié)", "C", 1, "Autres",
       "S'ajoute à l'acte principal"),
]

BY_CODE: dict[str, Act] = {a.code: a for a in ACTS}


def letter_values() -> dict[str, int]:
    """Valeur en F CFA de chaque lettre-clé : celle enregistrée, sinon la valeur par défaut."""
    from .models import ActLetter

    values = {code: default for code, (_, default) in LETTERS.items()}
    for row in ActLetter.objects.all():
        if row.code in values:
            values[row.code] = row.value
    return values


def amount(act: Act, values: dict[str, int] | None = None) -> int:
    values = values if values is not None else letter_values()
    return int(act.coefficient * values.get(act.letter, 0))


def catalog() -> list[dict]:
    """Catalogue avec les tarifs de base du moment (saisie du médecin)."""
    values = letter_values()
    return [
        {"code": a.code, "label": a.label, "letter": a.letter, "coefficient": float(a.coefficient),
         "group": a.group, "note": a.note or None, "unit_value": values.get(a.letter, 0),
         "base_amount": amount(a, values)}
        for a in ACTS
    ]


def letters_catalog() -> list[dict]:
    values = letter_values()
    return [{"code": code, "label": label, "value": values.get(code, default), "default": default}
            for code, (label, default) in LETTERS.items()]
