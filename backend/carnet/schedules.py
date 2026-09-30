"""
Calendriers de référence.

⚠️ À faire valider par un professionnel de santé (Direction de la Prévention / PEV) avant la mise en service :
le calendrier vaccinal évolue (introduction de nouveaux vaccins). Il est centralisé ici pour être mis à jour facilement.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Dose:
    code: str
    name: str
    age_days: int
    age_label: str


# Programme élargi de vaccination (PEV) — calendrier de routine de l'enfant.
PEV: list[Dose] = [
    Dose("bcg", "BCG (tuberculose)", 0, "Naissance"),
    Dose("vpo0", "Polio oral — dose 0", 0, "Naissance"),
    Dose("hepb0", "Hépatite B — naissance", 0, "Naissance"),
    Dose("penta1", "Pentavalent 1 (diphtérie, tétanos, coqueluche, hépatite B, Hib)", 42, "6 semaines"),
    Dose("vpo1", "Polio oral — dose 1", 42, "6 semaines"),
    Dose("pcv1", "Pneumocoque 1", 42, "6 semaines"),
    Dose("rota1", "Rotavirus 1", 42, "6 semaines"),
    Dose("penta2", "Pentavalent 2", 70, "10 semaines"),
    Dose("vpo2", "Polio oral — dose 2", 70, "10 semaines"),
    Dose("pcv2", "Pneumocoque 2", 70, "10 semaines"),
    Dose("rota2", "Rotavirus 2", 70, "10 semaines"),
    Dose("penta3", "Pentavalent 3", 98, "14 semaines"),
    Dose("vpo3", "Polio oral — dose 3", 98, "14 semaines"),
    Dose("pcv3", "Pneumocoque 3", 98, "14 semaines"),
    Dose("vpi1", "Polio injectable (VPI)", 98, "14 semaines"),
    Dose("rr1", "Rougeole-Rubéole 1", 274, "9 mois"),
    Dose("vaa", "Fièvre jaune (VAA)", 274, "9 mois"),
    Dose("mena", "Méningite A", 274, "9 mois"),
    Dose("rr2", "Rougeole-Rubéole 2", 457, "15 mois"),
]
PEV_BY_CODE = {d.code: d for d in PEV}

# Consultations prénatales : 8 contacts recommandés par l'OMS (2016), en semaines d'aménorrhée.
CPN_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40]
PREGNANCY_DAYS = 280  # terme théorique : 40 semaines après le premier jour des dernières règles
