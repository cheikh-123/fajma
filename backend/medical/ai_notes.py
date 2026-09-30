"""
Assistant de prise de notes : à partir des notes (dictées ou tapées) du médecin, propose un brouillon de
compte-rendu structuré (résumé, conclusion, traitement), que le médecin relit et corrige avant d'enregistrer.

Données transmises : le texte des notes seulement (jamais le nom, le téléphone ni l'identifiant du
patient), et uniquement si le médecin le demande. Sans fournisseur d'IA configuré, une mise en forme
locale simple (sans IA) range les phrases dans les rubriques : rien ne quitte alors le serveur.
L'IA reçoit la consigne de ne rien inventer (ni diagnostic, ni médicament, ni dose absents des notes).
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings
from django.db.models import Q
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, ScopedThrottle, body, get_str, not_found, require_user

logger = logging.getLogger(__name__)

PROMPT = """Tu es un assistant de documentation médicale pour un médecin au Sénégal.
Le médecin te donne ses notes de consultation, souvent dictées (style oral, fautes de transcription possibles).
Rédige un brouillon de compte-rendu en français, style médical concis, en JSON strict :
{"summary": "...", "diagnosis": "...", "treatment": "..."}
- summary : motif, symptômes, antécédents utiles, examen clinique et mesures (tension, température…).
- diagnosis : conclusion ou hypothèse diagnostique formulée par le médecin.
- treatment : traitement, conseils, examens demandés, suivi prévu.
Règles impératives : n'invente rien. N'ajoute aucun diagnostic, médicament, dose ou examen qui ne figure pas
dans les notes. Si une rubrique n'est pas couverte par les notes, laisse une chaîne vide. Corrige seulement
l'orthographe et les termes médicaux mal transcrits. Réponds uniquement avec le JSON."""

# Indices qui orientent une phrase vers une rubrique (mise en forme locale, sans IA).
DIAGNOSIS_WORDS = ("diagnostic", "conclusion", "probable", "suspicion", "évoque", "en faveur", "compatible", "hypothèse", "syndrome")
TREATMENT_WORDS = (
    "traitement", "prescri", "comprimé", "gélule", "sirop", "sachet", "ampoule", "pommade", "collyre", "posologie",
    "conseil", "régime", "repos", "contrôle", "revoir", "revenir", "à revoir", "prochain rendez-vous", "bilan",
    "analyse", "radio", "échographie", "augmenter", "diminuer", "arrêter", "poursuivre", "fois par jour",
    "matin et soir", "au coucher", "si fièvre", "si douleur", "paracétamol", "ibuprofène", "amoxicilline",
)
# Dose (500 mg, 1 g, 5 ml…), durée de traitement (pendant 7 jours) ou suffixe courant de médicament.
TREATMENT_PATTERN = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:mg|g|ml|µg|mcg|ui)\b|\bpendant\s+\d+\s+(?:jours?|semaines?|mois)\b"
    r"|\w+(?:cilline|mycine|floxacine|azole|prazole|pril|sartan|dipine|olol|statine|formine)\b",
    re.IGNORECASE,
)
LABEL = re.compile(r"^(?:conclusion|diagnostic|traitement|conduite à tenir|cat|plan)\s*:\s*", re.IGNORECASE)


class AiNotesThrottle(ScopedThrottle):
    scope = "ai_notes"


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text.strip())
    return [p.strip(" -•") for p in parts if len(p.strip(" -•")) > 1]


def local_draft(notes: str) -> dict:
    """Range chaque phrase dans une rubrique d'après ses mots-clés (aucune reformulation, aucun ajout)."""
    out = {"summary": [], "diagnosis": [], "treatment": []}
    for s in _sentences(notes):
        low = s.lower()
        if any(w in low for w in DIAGNOSIS_WORDS):
            key = "diagnosis"
        elif any(w in low for w in TREATMENT_WORDS) or TREATMENT_PATTERN.search(s):
            key = "treatment"
        else:
            key = "summary"
        s = LABEL.sub("", s)
        if not s:
            continue
        sentence = s[0].upper() + s[1:]
        out[key].append(sentence if sentence.endswith((".", "!", "?")) else f"{sentence}.")
    return {k: " ".join(v) for k, v in out.items()}


def _parse(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    data = json.loads(text[text.find("{") : text.rfind("}") + 1])
    return {k: str(data.get(k) or "").strip()[:3000] for k in ("summary", "diagnosis", "treatment")}


def ai_draft(notes: str) -> dict:
    cfg = settings.AI
    req = urllib.request.Request(
        cfg["API_URL"],
        data=json.dumps(
            {
                "model": cfg["MODEL"],
                "temperature": 0.1,
                "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": notes}],
            }
        ).encode(),
        headers={"Authorization": f"Bearer {cfg['API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            payload = json.loads(res.read())
        return _parse((payload.get("choices") or [{}])[0].get("message", {}).get("content", ""))
    except urllib.error.HTTPError as err:
        logger.error("[IA notes] %s : %s", err.code, err.read()[:300])
        raise ApiError("L'assistant IA n'a pas pu répondre : réessayez ou rédigez le compte-rendu vous-même.", 502) from err
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as err:
        logger.error("[IA notes] réponse inutilisable : %s", err)
        raise ApiError("L'assistant IA n'a pas pu répondre : réessayez ou rédigez le compte-rendu vous-même.", 502) from err


@api_view(["POST"])
@throttle_classes([AiNotesThrottle])
def draft_record(request, appointment_id):
    user = require_user(request)
    doctor = my_doctor(user)
    appt = Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id).first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    notes = get_str(body(request), "notes", required=True, min_len=20, max_len=8000)
    cfg = settings.AI
    use_ai = bool(cfg["API_KEY"] and cfg["MODEL"] and settings.AI_NOTES_ENABLED)
    draft = ai_draft(notes) if use_ai else local_draft(notes)
    audit.log(request, "ai_draft", patient=appt.patient, target=appt, source="ia" if use_ai else "local")
    return Response({**draft, "source": "ia" if use_ai else "local"})
