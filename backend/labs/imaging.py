"""
Imagerie médicale : radiographie, échographie, scanner, IRM, mammographie…

Même circuit que les analyses (prescription → envoi au centre choisi par le patient → examen fait →
résultats dans le dossier) : un centre d'imagerie est un « plateau technique » comme un laboratoire, ce qui
évite de tenir deux réseaux séparés. Un centre déclare les examens qu'il réalise ; le patient ne voit que
ceux qui savent faire l'examen prescrit.
"""

from __future__ import annotations

from typing import NamedTuple


class Modality(NamedTuple):
    code: str
    label: str
    short: str
    prep: str = ""  # préparation habituelle, proposée au médecin
    contrast: bool = False  # un produit de contraste est fréquemment utilisé
    examples: tuple[str, ...] = ()


MODALITIES: list[Modality] = [
    Modality("radio", "Radiographie", "Radio", "Aucune préparation particulière.",
             examples=("Thorax (face)", "Thorax (face et profil)", "Abdomen sans préparation",
                       "Rachis lombaire", "Bassin", "Genou", "Épaule", "Poignet", "Cheville", "Crâne")),
    Modality("echo", "Échographie", "Écho", "À jeun 6 h pour l'abdomen ; vessie pleine pour le pelvis.",
             examples=("Abdominale", "Pelvienne", "Obstétricale (datation)", "Obstétricale (morphologique)",
                       "Rénale et vésicale", "Thyroïdienne", "Mammaire", "Parties molles", "Cardiaque (échocardiographie)")),
    Modality("doppler", "Échographie-doppler", "Doppler", "Aucune préparation particulière.",
             examples=("Doppler veineux des membres inférieurs", "Doppler artériel des membres inférieurs",
                       "Doppler des troncs supra-aortiques", "Doppler rénal")),
    Modality("scanner", "Scanner (tomodensitométrie)", "Scanner",
             "À jeun 4 h si injection. Apporter la créatinine récente.", contrast=True,
             examples=("Cérébral", "Thoracique", "Abdomino-pelvien", "Rachis", "Sinus", "Angioscanner pulmonaire")),
    Modality("irm", "IRM", "IRM",
             "Retirer tout objet métallique. Signaler pacemaker, prothèse ou éclat métallique.", contrast=True,
             examples=("Cérébrale", "Rachis lombaire", "Rachis cervical", "Genou", "Épaule", "Abdominale", "Pelvienne")),
    Modality("mammo", "Mammographie", "Mammo", "De préférence en première partie de cycle.",
             examples=("Mammographie de dépistage", "Mammographie diagnostique", "Mammographie et échographie")),
    Modality("panoramique", "Panoramique dentaire", "Panoramique", "Aucune préparation particulière.",
             examples=("Panoramique dentaire",)),
    Modality("osteo", "Ostéodensitométrie", "Densitométrie", "Aucune préparation particulière.",
             examples=("Rachis et hanche",)),
]

BY_CODE: dict[str, Modality] = {m.code: m for m in MODALITIES}
CODES = set(BY_CODE)


def catalog() -> list[dict]:
    return [
        {"code": m.code, "label": m.label, "short": m.short, "prep": m.prep,
         "contrast": m.contrast, "examples": list(m.examples)}
        for m in MODALITIES
    ]


def label(code: str) -> str:
    m = BY_CODE.get(code)
    return m.label if m else code
