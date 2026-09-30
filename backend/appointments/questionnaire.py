"""
Questionnaire avant consultation : le médecin définit ses questions (par défaut ou par motif),
le patient y répond après avoir réservé. Les questions sont figées sur le rendez-vous à la réservation.
"""

from __future__ import annotations

from django.utils import timezone

from sunusante.api import ApiError

MAX_QUESTIONS = 15
TYPES = {"text", "yesno", "choice"}


def clean_questions(raw) -> list[dict]:
    """Valide la liste envoyée par le médecin et attribue des identifiants stables (q1, q2…)."""
    if raw in (None, ""):
        return []
    if not isinstance(raw, list) or len(raw) > MAX_QUESTIONS:
        raise ApiError(f"Au plus {MAX_QUESTIONS} questions")
    questions = []
    for i, q in enumerate(raw, 1):
        if not isinstance(q, dict):
            raise ApiError("Question invalide")
        label = str(q.get("label") or "").strip()
        kind = q.get("type")
        if not 3 <= len(label) <= 200:
            raise ApiError(f"Question {i} : intitulé de 3 à 200 caractères")
        if kind not in TYPES:
            raise ApiError(f"Question {i} : type inconnu")
        item = {"id": f"q{i}", "label": label, "type": kind, "required": bool(q.get("required"))}
        if kind == "choice":
            options = [str(o).strip()[:60] for o in (q.get("options") or []) if str(o).strip()]
            if not 2 <= len(options) <= 8 or len(set(options)) != len(options):
                raise ApiError(f"Question {i} : de 2 à 8 choix différents")
            item["options"] = options
        questions.append(item)
    return questions


def questions_for(doctor, ctype) -> list[dict]:
    if ctype and ctype.questionnaire:
        return ctype.questionnaire
    return doctor.questionnaire or []


def clean_answers(questions: list[dict], raw) -> dict:
    if not isinstance(raw, dict):
        raise ApiError("Réponses invalides")
    answers = {}
    for q in questions:
        value = raw.get(q["id"])
        if value in (None, ""):
            if q["required"]:
                raise ApiError(f"Réponse obligatoire : « {q['label']} »")
            continue
        if q["type"] == "yesno":
            if not isinstance(value, bool):
                raise ApiError(f"Répondez par oui ou non : « {q['label']} »")
        elif q["type"] == "choice":
            if value not in q["options"]:
                raise ApiError(f"Choix invalide : « {q['label']} »")
        else:
            value = str(value).strip()[:1000]
        answers[q["id"]] = value
    return answers


def answers_view(appt) -> list[dict] | None:
    """Questions et réponses, lisibles par le médecin (None s'il n'y a pas de questionnaire)."""
    if not appt.questionnaire:
        return None
    return [{"label": q["label"], "type": q["type"], "answer": (appt.answers or {}).get(q["id"])} for q in appt.questionnaire]


def can_answer(appt) -> bool:
    return bool(appt.questionnaire) and appt.is_active and appt.scheduled_at > timezone.now()
