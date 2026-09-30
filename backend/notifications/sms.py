"""Envoi de SMS et WhatsApp via l'API Twilio, en français, en wolof ou en anglais."""

from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings

logger = logging.getLogger(__name__)

TWILIO_API = "https://api.twilio.com/2010-04-01"
DAKAR = ZoneInfo("Africa/Dakar")
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
EN_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def format_when(dt: datetime, lang: str = "fr") -> str:
    d = dt.astimezone(DAKAR)
    if lang == "en":  # noms anglais explicites : ne dépend pas de la langue du serveur
        return f"{EN_WEEKDAYS[d.weekday()]} {d.day} {EN_MONTHS[d.month - 1]} at {d.hour:02d}:{d.minute:02d}"
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} à {d.hour:02d}:{d.minute:02d}"


def build_reminder_message(*, kind: str, patient_name: str | None, doctor_name: str, scheduled_at: datetime, mode: str, city: str | None, lang: str = "fr") -> str:
    when = format_when(scheduled_at, lang)
    hello = f"{patient_name}, " if patient_name else ""
    if lang == "en":
        if mode == "home_visit":
            place = "at your home (the doctor comes to you)"
        else:
            place = "by video (link in your Fajma space)" if mode == "teleconsultation" else f"at the practice{f' in {city}' if city else ''}"
        lead = "tomorrow" if kind == "reminder_24h" else "in 2 hours"
        return f"Fajma — {hello}reminder: {lead} you have an appointment with {doctor_name}, {when}, {place}. To cancel: your Fajma space."
    if lang == "wo":
        place = (
            "ci wideyo (lëkkalekaay bi mi ngi ci sa espace Fajma)"
            if mode == "teleconsultation"
            else "ci sa kër (doktoor bi dina ñëw)"
            if mode == "home_visit"
            else f"ci kabine bi{f' ca {city}' if city else ''}"
        )
        lead = "ëllëg" if kind == "reminder_24h" else "ci ñaari waxtu"
        return f"Fajma — {hello}fàttali: {lead} dangay am ndaje ak {doctor_name}, {when}, {place}. Ngir far ko: sa espace Fajma."
    place = (
        "en téléconsultation (lien dans votre espace Fajma)"
        if mode == "teleconsultation"
        else "à votre domicile (le médecin se déplace)"
        if mode == "home_visit"
        else f"au cabinet{f' à {city}' if city else ''}"
    )
    lead = "Rappel : demain" if kind == "reminder_24h" else "Rappel : dans 2h"
    return f"Fajma — {hello}{lead} vous avez rendez-vous avec {doctor_name} le {when}, {place}. Pour annuler : votre espace Fajma."


def build_waitlist_message(doctor_name: str, freed_at: datetime, url: str, lang: str = "fr") -> str:
    when = format_when(freed_at, lang)
    if lang == "en":
        return f"Fajma — A slot just opened with {doctor_name} ({when}). Book now: {url}"
    if lang == "wo":
        return f"Fajma — Benn waxtu dafa ubbiku ci {doctor_name} ({when}). Jëlal sa ndaje léegi: {url}"
    return f"Fajma — Un créneau vient de se libérer chez {doctor_name} ({when}). Réservez vite : {url}"


def normalize_phone(raw: str | None) -> str | None:
    """Numéro sénégalais au format international E.164, ou None s'il est inutilisable."""
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("+"):
        return digits if len(digits) >= 11 else None
    local = digits.lstrip("0")
    if local.startswith("221"):
        return f"+{local}"
    if len(local) == 9:
        return f"+221{local}"
    return None


@dataclass
class SendResult:
    ok: bool
    sid: str = ""
    channel: str = "sms"
    error: str = ""
    permanent: bool = False


def _send_via(channel: str, to: str, body: str, status_callback: str | None) -> SendResult:
    cfg = settings.TWILIO
    sender = cfg["WHATSAPP_FROM"] if channel == "whatsapp" else cfg["SMS_FROM"]
    if not cfg["ACCOUNT_SID"] or not cfg["AUTH_TOKEN"]:
        return SendResult(False, error="Twilio non configuré (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)", permanent=True)
    if not sender:
        name = "TWILIO_WHATSAPP_FROM" if channel == "whatsapp" else "TWILIO_SMS_FROM"
        return SendResult(False, error=f"Numéro expéditeur manquant ({name})", permanent=True)
    prefix = "whatsapp:" if channel == "whatsapp" else ""
    params = {"To": f"{prefix}{to}", "From": f"{prefix}{sender}", "Body": body}
    if status_callback:
        params["StatusCallback"] = status_callback
    auth = base64.b64encode(f"{cfg['ACCOUNT_SID']}:{cfg['AUTH_TOKEN']}".encode()).decode()
    req = urllib.request.Request(
        f"{TWILIO_API}/Accounts/{urllib.parse.quote(cfg['ACCOUNT_SID'])}/Messages.json",
        data=urllib.parse.urlencode(params).encode(),
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            payload = json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        text = err.read().decode(errors="replace")[:500]
        logger.error("Twilio %s échec [%s]: %s", channel, err.code, text)
        # 4xx = requête ou numéro invalide : inutile de réessayer, sauf 429 (quota).
        return SendResult(False, error=f"[{err.code}] {text}", permanent=400 <= err.code < 500 and err.code != 429)
    except (urllib.error.URLError, TimeoutError) as err:
        return SendResult(False, error=f"Réseau : {err}")
    sid = payload.get("sid")
    if not sid:
        return SendResult(False, error="Réponse Twilio sans identifiant")
    return SendResult(True, sid=sid, channel=channel)


def send_message(*, to: str, body: str, channel: str = "sms", status_callback: str | None = None) -> SendResult:
    """Envoie sur le canal demandé ; si WhatsApp échoue, repli automatique sur le SMS."""
    if channel == "whatsapp":
        result = _send_via("whatsapp", to, body, status_callback)
        if result.ok:
            return result
        logger.warning("WhatsApp indisponible, repli SMS : %s", result.error)
    return _send_via("sms", to, body, status_callback)
