"""
Messages libres sur WhatsApp (écrits ou vocaux) en français, wolof ou anglais : on devine ce que la personne
veut (rendez-vous, ticket d'hôpital, mes rendez-vous, annuler, pharmacie), la spécialité et la ville, puis le
menu reprend directement à la bonne étape. Pas d'IA nécessaire : mots-clés relus par des locuteurs.

Messages vocaux : transcription par un service compatible OpenAI, au choix de l'hébergeur (aucun fournisseur
imposé) :
- SPEECH_MODE=transcriptions : POST multipart sur SPEECH_API_URL (…/audio/transcriptions : Whisper, serveur
  faster-whisper auto-hébergé, modèle wolof sur un point d'accès Hugging Face compatible…) ;
- SPEECH_MODE=chat : modèle de chat qui écoute l'audio (Gemini par sa passerelle OpenAI…) ; par défaut, la
  configuration de l'assistant (AI_*) est réutilisée.
Le son n'est jamais stocké : transcrit puis oublié.
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
    ("queue", ["ticket", "tike", "file d attente", "faire la queue", "hopital", "opitaal", "lopitaan", "dispensaire", "centre de sante", "queue"]),
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


# ── Transcription ─────────────────────────────────────────────────────


def _speech_config() -> dict:
    cfg = dict(getattr(settings, "SPEECH", {}) or {})
    if not cfg.get("API_URL"):
        ai = settings.AI
        cfg = {"MODE": "chat", "API_URL": ai["API_URL"], "API_KEY": ai["API_KEY"], "MODEL": ai["MODEL"] or "gemini-2.5-flash"}
    return cfg


def fetch_twilio_media(url: str) -> tuple[bytes, str] | None:
    """Télécharge le média d'un message WhatsApp (authentification Twilio), 5 Mo au plus."""
    cfg = settings.TWILIO
    if not url.startswith("https://") or not cfg["ACCOUNT_SID"]:
        return None
    auth = base64.b64encode(f"{cfg['ACCOUNT_SID']}:{cfg['AUTH_TOKEN']}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = res.read(MAX_AUDIO_BYTES + 1)
            if len(data) > MAX_AUDIO_BYTES:
                return None
            return data, res.headers.get("Content-Type", "audio/ogg")
    except (urllib.error.URLError, TimeoutError) as err:
        logger.warning("média WhatsApp illisible : %s", err)
        return None


def transcribe(audio: bytes, mime: str = "audio/ogg") -> str | None:
    cfg = _speech_config()
    if not cfg.get("API_KEY") and not cfg.get("API_URL", "").startswith("http://"):
        return None  # aucun service configuré (un serveur local en http:// peut se passer de clé)
    fmt = (mime.split("/")[-1].split(";")[0] or "ogg").replace("mpeg", "mp3")
    headers = {"Authorization": f"Bearer {cfg.get('API_KEY', '')}"}
    try:
        if cfg.get("MODE") == "transcriptions":
            boundary = uuid.uuid4().hex
            parts = [
                f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n{cfg.get("MODEL") or "whisper-1"}\r\n'.encode(),
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="vocal.{fmt}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
                audio,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
            req = urllib.request.Request(cfg["API_URL"], data=b"".join(parts), method="POST",
                                         headers={**headers, "Content-Type": f"multipart/form-data; boundary={boundary}"})
            with urllib.request.urlopen(req, timeout=40) as res:
                return (json.loads(res.read() or b"{}").get("text") or "").strip()[:500] or None
        payload = {
            "model": cfg.get("MODEL"),
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcris fidèlement ce message vocal d'un patient au Sénégal (wolof, français ou "
                                             "anglais). Réponds uniquement par la transcription, dans la langue parlée."},
                    {"type": "input_audio", "input_audio": {"data": base64.b64encode(audio).decode(), "format": fmt}},
                ],
            }],
        }
        req = urllib.request.Request(cfg["API_URL"], data=json.dumps(payload).encode(), method="POST",
                                     headers={**headers, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=40) as res:
            body = json.loads(res.read() or b"{}")
        return (body["choices"][0]["message"]["content"] or "").strip()[:500] or None
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError) as err:
        logger.warning("transcription impossible : %s", err)
        return None
