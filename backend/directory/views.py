"""Annuaire public : spécialités, médecins vérifiés, créneaux, avis, pharmacies, assistant IA."""

import json
import logging
from datetime import timedelta
import unicodedata
import urllib.error
import urllib.request

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from appointments.models import Appointment
from appointments.scheduling import compute_slots, next_available_many
from insurance.views import accepted_insurers
from sunusante.api import ApiError, ScopedThrottle, body, get_int, get_str, get_uuid, iso, not_found, require_user

from . import localities
from .models import Doctor, Pharmacy, Review, Specialty
from .replacements import public_replacements
from .serializers import consultation_type_dict, doctor_dict, location_dict, pharmacy_dict, specialty_dict

logger = logging.getLogger(__name__)


def _norm(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn").lower()


@api_view(["GET"])
def list_specialties(request):
    return Response([specialty_dict(s, full=True) for s in Specialty.objects.all()])


class PublicSearchThrottle(ScopedThrottle):
    scope = "suggest"


@api_view(["GET"])
def list_doctors(request):
    qs = Doctor.objects.filter(is_verified=True).select_related("specialty")
    city = request.query_params.get("city", "").strip()
    # Recherche géographique : localité connue du Sénégal (Pikine, Touba…) ou position GPS (« autour de moi »).
    center = None
    try:
        lat, lng = float(request.query_params["lat"]), float(request.query_params["lng"])
        if 12 <= lat <= 17 and -18 <= lng <= -11:  # emprise du Sénégal
            center = (lat, lng)
    except (KeyError, ValueError):
        pass
    locality = localities.find(city) if city and not center else None
    # Texte incomplet qui est aussi le nom d'un village (« Dak ») : on préfère les médecins de « Dakar ».
    if locality and locality.priority and qs.filter(city__icontains=city).exists():
        locality = None
    if locality:
        center = (locality[2], locality[3])
    elif city and not center:
        from django.db.models import Q

        # Quartier inconnu de la liste : on cherche aussi dans l'adresse du cabinet.
        qs = qs.filter(Q(city__icontains=city) | Q(address__icontains=city))
    if request.query_params.get("teleconsultation") in {"1", "true"}:
        qs = qs.filter(teleconsultation=True)
    if request.query_params.get("home_visit") in {"1", "true"}:
        qs = qs.filter(home_visits=True)
    specialty = request.query_params.get("specialty", "").strip()
    if specialty:
        qs = qs.filter(specialty__slug=specialty)
    language = request.query_params.get("language", "").strip()
    insurer = request.query_params.get("insurer", "").strip()
    if insurer:
        qs = qs.filter(accepted_insurers__insurer__slug=insurer).distinct()
    max_price = get_int(request.query_params, "max_price", min_value=0)
    if max_price is not None:
        qs = qs.filter(consultation_price__lte=max_price)
    doctors = list(qs)
    if language:
        doctors = [d for d in doctors if any(_norm(language) == _norm(lang) for lang in d.languages or [])]
    query = request.query_params.get("query", "").strip()
    if query:
        # Recherche sans accents sur le nom ET la spécialité : « cardiologue » trouve « Cardiologie ».
        q = _norm(query)
        stems = [w[: max(4, len(w) - 4)] for w in q.split()]

        def match(d: Doctor) -> bool:
            if q in _norm(d.full_name):
                return True
            words = _norm(d.specialty.name if d.specialty else "").split()
            return all(any(w.startswith(s) for w in words) for s in stems)

        doctors = [d for d in doctors if match(d)]

    distances: dict = {}
    if center:
        for d in doctors:
            if d.latitude is not None and d.longitude is not None:
                distances[d.id] = localities.distance_km(center[0], center[1], d.latitude, d.longitude)
        # Médecins dont la ville porte ce nom, sauf pour un homonyme lointain (« Colobane (Fatick) »).
        city_norm = localities.norm(locality.name) if locality and locality.label == locality.name else None
        nearby = [
            d
            for d in doctors
            if distances.get(d.id, 1e9) <= localities.DEFAULT_RADIUS_KM or (city_norm and localities.norm(d.city) == city_norm)
        ]
        # Personne dans le rayon (ex. Touba) : on propose les 10 médecins les plus proches plutôt qu'une liste vide.
        doctors = nearby or sorted((d for d in doctors if d.id in distances), key=lambda d: distances[d.id])[:10]

    # Prochaine disponibilité de chaque médecin (comme sur Doctolib), filtres et tri associés.
    results = []
    next_slots = next_available_many(doctors)
    for d in doctors:
        data = doctor_dict(d)
        data["next_slot"] = next_slots[d.id]
        data["accepts_new_patients"] = d.accepts_new_patients
        data["distance_km"] = round(distances[d.id], 1) if d.id in distances else None
        results.append(data)
    available = request.query_params.get("available", "")
    if available in {"today", "week"}:
        limit = timezone.localdate() + timedelta(days=0 if available == "today" else 6)
        results = [r for r in results if r["next_slot"] and r["next_slot"]["iso"][:10] <= limit.isoformat()]
    sort = request.query_params.get("sort", "")
    if sort == "availability":
        results.sort(key=lambda r: r["next_slot"]["iso"] if r["next_slot"] else "9999")
    elif sort == "price":
        results.sort(key=lambda r: r["consultation_price"])
    elif center:  # par défaut, les plus proches d'abord
        results.sort(key=lambda r: r["distance_km"] if r["distance_km"] is not None else 1e9)
    return Response(results)


@api_view(["GET"])
@throttle_classes([PublicSearchThrottle])
def list_localities(request):
    """Suggestions de villes et quartiers du Sénégal pendant la saisie."""
    return Response(localities.suggest(request.query_params.get("q", "")))


@api_view(["GET"])
def get_doctor(request, doctor_id):
    doctor = Doctor.objects.filter(id=doctor_id, is_verified=True).select_related("specialty").first()
    if not doctor:
        raise not_found("Médecin introuvable")
    data = doctor_dict(doctor, full_specialty=True)
    data["consultation_types"] = [consultation_type_dict(t) for t in doctor.consultation_types.filter(is_active=True)]
    data.update(
        accepts_new_patients=doctor.accepts_new_patients,
        cancellation_deadline_hours=doctor.cancellation_deadline_hours,
        booking_instructions=doctor.booking_instructions or None,
        auto_confirm=doctor.auto_confirm,
        teleconsultation_prepayment=doctor.teleconsultation_prepayment,
        locations=[location_dict(loc) for loc in doctor.locations.all()],
        insurers=accepted_insurers(doctor),
        replacements=public_replacements(doctor),
        # Questions du médecin (facultatives) : par défaut, et propres à certains motifs.
        questionnaire=doctor.questionnaire or [],
        questionnaires_by_type={
            str(t.id): t.questionnaire for t in doctor.consultation_types.filter(is_active=True) if t.questionnaire
        },
    )
    return Response(data)


@api_view(["GET"])
def list_doctor_reviews(request, doctor_id):
    from .reviews import public_review_dict

    reviews = Review.objects.filter(doctor_id=doctor_id).exclude(status="hidden")[:20]
    return Response([public_review_dict(r) for r in reviews])


@api_view(["GET"])
def list_doctor_slots(request, doctor_id):
    params = request.query_params
    days = get_int(params, "days", default=14, min_value=1, max_value=60)
    duration = get_int(params, "duration_minutes", min_value=5, max_value=240)
    ignore = params.get("ignore_appointment_id") or None
    mode = params.get("mode") if params.get("mode") in {"in_person", "teleconsultation", "home_visit"} else "in_person"
    return Response(compute_slots(doctor_id, days, duration, ignore, mode=mode))


@api_view(["GET"])
def list_pharmacies(request):
    from django.db.models import Q

    qs = Pharmacy.objects.all()
    city = request.query_params.get("city", "").strip()
    if city:
        qs = qs.filter(city__icontains=city)
    if request.query_params.get("onDuty") in {"1", "true"}:
        # Garde terminée (date de fin passée) : la pharmacie n'apparaît plus « de garde ».
        qs = qs.filter(Q(is_on_duty=True) & (Q(on_duty_until__isnull=True) | Q(on_duty_until__gt=timezone.now())))
    return Response([pharmacy_dict(p) for p in qs])


@api_view(["GET"])
def doctor_photo(request, doctor_id):
    """Photo publique d'un médecin vérifié (sa fiche est publique)."""
    from django.http import Http404

    from sunusante.uploads import read, serve, sniff

    doctor = Doctor.objects.filter(id=doctor_id, is_verified=True).exclude(photo_path="").first()
    if not doctor:
        raise Http404
    try:
        head = read(doctor.photo_path)[:16]
    except OSError as err:
        raise Http404 from err
    kind = sniff(head)
    response = serve(doctor.photo_path, kind[0] if kind else "image/jpeg")
    response["Cache-Control"] = "public, max-age=86400"
    return response


@api_view(["POST"])
def create_review(request):
    """Avis sur un rendez-vous terminé, un seul par rendez-vous."""
    user = require_user(request)
    data = body(request)
    appt = Appointment.objects.filter(id=get_uuid(data, "appointment_id"), patient=user).select_related("doctor").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if appt.status != "completed":
        raise ApiError("Vous pourrez laisser un avis une fois la consultation terminée")
    if Review.objects.filter(appointment=appt).exists():
        raise ApiError("Vous avez déjà donné votre avis sur ce rendez-vous")
    from .reviews import auto_moderation_reason

    comment = get_str(data, "comment", max_len=1200) or ""
    reason = auto_moderation_reason(comment)
    Review.objects.create(
        appointment=appt,
        patient=user,
        doctor=appt.doctor,
        rating=get_int(data, "rating", min_value=1, max_value=5),
        comment=comment,
        # Avis contenant des coordonnées : vérifié par l'administration avant publication.
        status="hidden" if reason else "published",
        report_reason=reason,
        reported_at=timezone.now() if reason else None,
    )
    return Response({"ok": True, "pending_moderation": bool(reason)})


# ── Assistant d'orientation (IA) ─────────────────────────────────────

ASSISTANT_PROMPT = """Tu es l'assistant santé de Fajma, une plateforme médicale sénégalaise.
Tu aides les patients à comprendre leurs symptômes et à s'orienter vers la bonne spécialité médicale.
Règles strictes :
- Tu ne poses JAMAIS de diagnostic et tu ne prescris JAMAIS de médicament.
- Tu réponds en français simple, adapté au contexte du Sénégal et de l'Afrique de l'Ouest.
- Tu poses au maximum 2 questions de clarification, puis tu conclus.
- Tu termines toujours par : la spécialité recommandée (parmi : Médecine générale, Pédiatrie, Cardiologie, Dermatologie, Gynécologie, Ophtalmologie, Orthopédie, Neurologie), le niveau d'urgence (faible / modéré / urgent) et l'invitation à prendre rendez-vous sur Fajma.
- Si les symptômes évoquent une urgence vitale (douleur thoracique, difficulté respiratoire, perte de conscience, saignement abondant), tu demandes d'appeler le SAMU (1515) ou d'aller aux urgences immédiatement.
- Réponses courtes : 120 mots maximum."""


class AssistantThrottle(ScopedThrottle):
    scope = "assistant"


@api_view(["POST"])
@throttle_classes([AssistantThrottle])
def ask_assistant(request):
    messages = body(request).get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 20:
        raise ApiError("Conversation invalide")
    clean = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in {"user", "assistant"}:
            raise ApiError("Message invalide")
        content = str(m.get("content", "")).strip()
        if not 1 <= len(content) <= 2000:
            raise ApiError("Message trop long")
        clean.append({"role": m["role"], "content": content})

    cfg = settings.AI
    if not cfg["API_KEY"] or not cfg["MODEL"]:
        raise ApiError("Assistant indisponible : configuration IA manquante.", 503)
    req = urllib.request.Request(
        cfg["API_URL"],
        data=json.dumps({"model": cfg["MODEL"], "messages": [{"role": "system", "content": ASSISTANT_PROMPT}, *clean]}).encode(),
        headers={"Authorization": f"Bearer {cfg['API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as err:
        logger.error("[IA] %s : %s", err.code, err.read()[:500])
        if err.code == 429:
            raise ApiError("Trop de requêtes, réessayez dans un instant.", 429) from err
        raise ApiError("L'assistant n'a pas pu répondre.", 502) from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise ApiError("L'assistant n'a pas pu répondre.", 502) from err
    content = (payload.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    if not content:
        raise ApiError("Réponse vide de l'assistant.", 502)
    return Response({"content": content})


@api_view(["GET"])
def public_stats(request):
    """Chiffres réels affichés sur la page d'accueil (jamais de valeurs écrites en dur)."""
    from django.db.models import Avg, Count, Sum

    doctors = Doctor.objects.filter(is_verified=True)
    rated = doctors.filter(reviews_count__gt=0)
    reviews = rated.aggregate(n=Sum("reviews_count"), avg=Avg("rating"))
    return Response(
        {
            "doctors": doctors.count(),
            "cities": doctors.values("city").distinct().count(),
            "reviews": reviews["n"] or 0,
            # Note moyenne seulement quand elle repose sur assez d'avis pour être significative.
            "rating": round(float(reviews["avg"]), 1) if (reviews["n"] or 0) >= 20 else None,
            "by_specialty": {
                row["specialty__slug"]: row["n"]
                for row in doctors.exclude(specialty=None).values("specialty__slug").annotate(n=Count("id"))
            },
        }
    )
