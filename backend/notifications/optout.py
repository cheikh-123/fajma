"""
Désinscription des SMS (« STOP ») : le refus des messages automatiques est respecté.

- Réponse STOP / ARRET par SMS (webhook Twilio entrant) ou sur WhatsApp : numéro désinscrit, confirmation.
- Twilio refuse d'envoyer à un numéro désinscrit chez lui (erreur 21610) : le numéro est noté désinscrit.
- START réactive les messages.
Les codes de connexion demandés par la personne elle-même restent envoyés (message « essentiel »).
"""

from __future__ import annotations

import unicodedata

from .models import SmsOptOut

STOP_WORDS = {"stop", "arret", "stopall", "unsubscribe", "desabonner", "desinscrire", "cancel", "end", "quit"}
START_WORDS = {"start", "unstop", "reprendre"}
CARRIER_UNSUBSCRIBED = "21610"  # code Twilio : destinataire désinscrit

STOP_REPLY = "Fajma : vous ne recevrez plus de SMS automatiques (rappels, alertes). Répondez START pour les réactiver."
START_REPLY = "Fajma : les rappels par SMS sont réactivés. Répondez STOP pour les arrêter."


def _word(text: str) -> str:
    t = unicodedata.normalize("NFKD", (text or "").strip().lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def is_stop(text: str) -> bool:
    return _word(text) in STOP_WORDS


def is_start(text: str) -> bool:
    return _word(text) in START_WORDS


def opt_out(phone: str, source: str) -> None:
    if phone:
        SmsOptOut.objects.get_or_create(phone=phone, defaults={"source": source})


def opt_in(phone: str) -> bool:
    return SmsOptOut.objects.filter(phone=phone).delete()[0] > 0


def is_opted_out(phone: str) -> bool:
    return bool(phone) and SmsOptOut.objects.filter(phone=phone).exists()
