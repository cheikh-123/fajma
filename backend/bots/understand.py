"""
Messages libres sur WhatsApp (écrits ou vocaux) en français, wolof ou anglais : on devine ce que la personne
veut (rendez-vous, ticket d'hôpital, mes rendez-vous, annuler, pharmacie), la spécialité et la ville, puis le
menu reprend directement à la bonne étape. Pas d'IA nécessaire : mots-clés relus par des locuteurs.

"""

from __future__ import annotations

import base64
import json
import logging
import re
import unicodedata
import urllib.error
import urllib.request
import uuid

from django.conf import settings

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 5_000_000


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).replace("'", " ").replace("’", " ").split())


# Intention → mots-clés (français, wolof, anglais). L'ordre compte : le plus précis d'abord.
INTENTS: list[tuple[str, list[str]]] = [
    ("cancel", ["annuler", "annule", "far ndaje", "far sama", "cancel"]),
    ("mine", ["mes rendez", "mes rdv", "samay ndaje", "my appointment", "mon rendez vous", "quand est mon"]),
    ("pharma", ["pharmacie", "farmasi", "garde", "pharmacy", "medicament", "garab"]),
    ("book", ["rendez", "rdv", "ndaje", "consult", "docteur", "doktoor", "doctor", "medecin", "appointment", "malade", "feebar", "dafa am",
              "yaram", "dafa metti", "mettit", "mal", "sick", "fever", "fievre", "jel ndaje", "book"]),
]

# Spécialité → mots-clés (y compris parties du corps et situations en wolof).
SPECIALTIES: list[tuple[str, list[str]]] = [
    ("pediatrie", ["pediatre", "pediatrie", "enfant", "bebe", "doom", "xale", "liir", "child", "baby", "kid"]),
    ("gynecologie", ["gyneco", "gynecologue", "enceinte", "grossesse", "ëmb", "emb", "jigeen ju", "pregnan", "regles"]),
    ("sage-femme", ["sage femme", "accouchement", "wasin", "midwife"]),
    ("dentiste", ["dent", "dentiste", "bëñ", "ben", "tooth", "teeth", "dentist"]),
    ("ophtalmologie", ["oeil", "yeux", "vue", "ophtalmo", "bët", "bet", "eye"]),
    ("cardiologie", ["coeur", "cardio", "tension", "xol", "heart", "blood pressure", "hypertension"]),
    ("dermatologie", ["peau", "dermato", "bouton", "skin", "rash"]),
    ("orl", ["oreille", "gorge", "nez", "orl", "nopp", "ear", "throat"]),
    ("gastro-enterologie", ["ventre", "estomac", "biir", "stomach", "diarrhee"]),
    ("endocrinologie", ["diabete", "sukar", "sucre", "diabet"]),
    ("psychiatrie", ["depression", "angoisse", "stress", "mental"]),
    ("rhumatologie", ["articulation", "dos", "genou", "joint", "back pain"]),
    ("kinesitherapie", ["kine", "reeducation", "physio"]),
    ("medecine-generale", ["generaliste", "medecine generale", "general", "fièvre", "fievre", "feebar", "palu", "paludisme", "yaram"]),
]


WOLOF = ["sama", "dafa", "doom", "ndaje", "yaram", "feebar", "opitaal", "tike", "garab", "xol", "bet", "ben", "biir", "nanga",
         "bëgg", "begg", "damay", "jël", "jel", "dama", "xale", "metti"]
ENGLISH = ["i need", "i want", "appointment", "doctor", "my ", "please", "sick", "hospital"]


def understand(text: str, cities: list[str] | None = None) -> dict:
    """{intent, specialty (slug), city, lang} — chaque clé absente si rien de sûr."""
    t = f" {norm(text)} "
    out: dict = {}
    if sum(bool(re.search(rf"\b{re.escape(norm(w))}\b", t)) for w in WOLOF) >= 1:
        out["lang"] = "wo"
    elif any(norm(w) in t for w in ENGLISH):
        out["lang"] = "en"
    for intent, words in INTENTS:
        if any(re.search(rf"\b{re.escape(norm(w))}", t) for w in words):
            out["intent"] = intent
            break
    for slug, words in SPECIALTIES:
        if any(re.search(rf"\b{re.escape(norm(w))}", t) for w in words):
            out["specialty"] = slug
            out.setdefault("intent", "book")
            break
    for city in cities or []:
        if re.search(rf"\b{re.escape(norm(city))}\b", t):
            out["city"] = city
            break
    return out

