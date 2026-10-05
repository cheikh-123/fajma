"""
API du ticket virtuel.

Public : établissements et attente en direct, suivi d'un ticket par son code (lien du SMS), écran de salle
d'attente (numéros appelés seulement, aucune donnée personnelle).
Patient connecté : prendre un ticket, ses tickets du jour.
Accueil (agents rattachés) : appeler le suivant, rappeler, reçu, absent, priorité, ticket au guichet ;
le responsable règle les services (horaires, capacité, pause) et voit le bilan du jour.
Administration : établissements et rattachement du personnel.
"""

from __future__ import annotations

from datetime import time

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import User
from accounts.views import require_admin
from audit import log as audit
from notifications.sms import normalize_phone
from sunusante.api import ApiError, ScopedThrottle, body, forbidden, get_choice, get_int, get_str, get_uuid, not_found, require_user

from . import logic
from .models import Facility, FacilityAgent, QueueService, QueueTicket


class QueueThrottle(ScopedThrottle):
    scope = "queue"


# ── Représentations ───────────────────────────────────────────────────


def _now_serving(service: QueueService, day, limit: int = 4) -> list[dict]:
    rows = (
        QueueTicket.objects.filter(service=service, day=day, called_at__isnull=False)
        .exclude(status="cancelled")
        .order_by("-called_at")[:limit]
    )
    return [{"label": f"{service.prefix}{t.number}", "desk": t.desk or None} for t in rows]


def service_dict(service: QueueService, *, waiting: int | None = None) -> dict:
    day = timezone.localdate()
    if waiting is None:
        waiting = QueueTicket.objects.filter(service=service, day=day, status="waiting").count()
    pace = logic.pace_minutes(service, day)
    reason = logic.closed_reason(service)
    return {
        "id": str(service.id),
        "name": service.name,
        "prefix": service.prefix,
        "opens_at": service.opens_at.strftime("%H:%M"),
        "closes_at": service.closes_at.strftime("%H:%M"),
        "open_days": service.open_days,
        "daily_capacity": service.daily_capacity,
        "avg_minutes": service.avg_minutes,
        "notice_ahead": service.notice_ahead,
        "is_paused": service.is_paused,
        "pause_message": service.pause_message or None,
        "open": reason is None,
        "closed_reason": reason,
        "waiting": waiting,
        # Attente estimée pour un ticket pris maintenant.
        "eta_minutes": round(waiting * pace + pace / 2),
        "pace_minutes": round(pace, 1),
        "now_serving": _now_serving(service, day, 1)[0]["label"] if _now_serving(service, day, 1) else None,
    }


def facility_dict(f: Facility, *, with_services: bool = True) -> dict:
    data = {
        "id": str(f.id),
        "name": f.name,
        "kind": f.kind,
        "kind_label": f.get_kind_display(),
        "city": f.city,
        "district": f.district or None,
        "address": f.address or None,
        "phone": f.phone or None,
        "latitude": f.latitude,
        "longitude": f.longitude,
        "is_active": f.is_active,
    }
    if with_services:
        day = timezone.localdate()
        counts = dict(
            QueueTicket.objects.filter(service__facility=f, day=day, status="waiting")
            .values_list("service_id")
            .annotate(n=Count("id"))
        )
        data["services"] = [service_dict(s, waiting=counts.get(s.id, 0)) for s in f.services.all()]
    return data


# ── Public ────────────────────────────────────────────────────────────


@api_view(["GET"])
def facilities(request):
    qs = Facility.objects.filter(is_active=True, services__isnull=False).distinct().prefetch_related("services")
    if city := (request.query_params.get("city") or "").strip():
        qs = qs.filter(city__iexact=city)
    if q := (request.query_params.get("q") or "").strip():
        qs = qs.filter(Q(name__icontains=q) | Q(district__icontains=q) | Q(city__icontains=q))
    return Response([facility_dict(f) for f in qs[:100]])


@api_view(["GET"])
def facility_detail(request, facility_id):
    f = Facility.objects.filter(id=facility_id, is_active=True).prefetch_related("services").first()
    if not f:
        raise not_found("Établissement introuvable")
    return Response(facility_dict(f))


@api_view(["GET"])
def display(request, facility_id):
    """Écran de la salle d'attente : derniers numéros appelés et guichets, nombre de personnes en attente."""
    f = Facility.objects.filter(id=facility_id).prefetch_related("services").first()
    if not f:
        raise not_found("Établissement introuvable")
    day = timezone.localdate()
    return Response(
        {
            "facility": {"id": str(f.id), "name": f.name},
            "services": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "called": _now_serving(s, day),
                    "waiting": QueueTicket.objects.filter(service=s, day=day, status="waiting").count(),
                }
                for s in f.services.all()
            ],
            "at": timezone.now().isoformat(),
        }
    )


@api_view(["GET"])
def ticket_by_code(request, code):
    t = QueueTicket.objects.filter(code=code.upper()).select_related("service__facility").first()
    if not t:
        raise not_found("Ticket introuvable")
    return Response(logic.ticket_dict(t))


@api_view(["POST"])
@throttle_classes([QueueThrottle])
def cancel_by_code(request, code):
    """Le code (lien du SMS) suffit pour libérer sa place : il n'est connu que du patient."""
    t = QueueTicket.objects.filter(code=code.upper()).select_related("service__facility").first()
    if not t:
        raise not_found("Ticket introuvable")
    if t.status == "waiting":
        logic.finish(t, "cancelled")
        logic.notify_progress(t.service)
    return Response(logic.ticket_dict(t))


# ── Patient connecté ──────────────────────────────────────────────────


@api_view(["POST"])
@throttle_classes([QueueThrottle])
def take(request, service_id):
    user = require_user(request)
    service = QueueService.objects.filter(id=service_id, facility__is_active=True).select_related("facility").first()
    if not service:
        raise not_found("Service introuvable")
    data = body(request)
    phone = normalize_phone(user.phone) if user.phone else ""
    ticket, _ = logic.take_ticket(
        service,
        user=user,
        phone=phone or "",
        name=user.full_name,
        channel="web",
        lang=user.preferred_language,
        travel_minutes=get_int(data, "travel_minutes", min_value=0, max_value=600),
    )
    return Response(logic.ticket_dict(ticket))


@api_view(["GET"])
def my_tickets(request):
    user = require_user(request)
    tickets = QueueTicket.objects.filter(user=user, day=timezone.localdate()).select_related("service__facility").order_by("-created_at")
    return Response([logic.ticket_dict(t) for t in tickets])


# ── Accueil ───────────────────────────────────────────────────────────


def _agent_role(user, facility_id) -> str | None:
    if user.is_staff:
        return "manager"
    row = FacilityAgent.objects.filter(user=user, facility_id=facility_id).first()
    return row.role if row else None


def _service_for_agent(user, service_id, *, manager: bool = False) -> QueueService:
    service = QueueService.objects.filter(id=service_id).select_related("facility").first()
    role = _agent_role(user, service.facility_id) if service else None
    if not service or not role:
        raise not_found("Service introuvable")
    if manager and role != "manager":
        raise forbidden("Réservé au responsable de l'établissement")
    return service


def _ticket_for_agent(user, ticket_id) -> QueueTicket:
    t = QueueTicket.objects.filter(id=ticket_id).select_related("service__facility").first()
    if not t or not _agent_role(user, t.service.facility_id):
        raise not_found("Ticket introuvable")
    return t


@api_view(["GET"])
def desk(request):
    """Tableau de l'accueil : files du jour de chaque établissement de l'agent."""
    user = require_user(request)
    roles = {r.facility_id: r.role for r in FacilityAgent.objects.filter(user=user)}
    if not roles:
        raise forbidden("Compte non rattaché à un établissement")
    day = timezone.localdate()
    out = []
    for f in Facility.objects.filter(id__in=roles).prefetch_related("services"):
        services = []
        for s in f.services.all():
            queue = list(logic.waiting_queue(s, day).select_related("service__facility"))
            pace = logic.pace_minutes(s, day)
            called = QueueTicket.objects.filter(service=s, day=day, status="called").select_related("service__facility").order_by("-called_at")
            item = {
                **service_dict(s, waiting=len(queue)),
                "queue": [logic.ticket_dict(t, ahead=i, eta=round(i * pace + pace / 2), for_agent=True) for i, t in enumerate(queue[:200])],
                "called": [logic.ticket_dict(t, ahead=0, eta=0, for_agent=True) for t in called[:30]],
            }
            if roles[f.id] == "manager":
                item["stats"] = logic.day_stats(s, day)
            services.append(item)
        out.append({**facility_dict(f, with_services=False), "role": roles[f.id], "services": services})
    return Response(out)


@api_view(["POST"])
def call_next(request, service_id):
    user = require_user(request)
    service = _service_for_agent(user, service_id)
    ticket = logic.call_next(service, agent=user, desk=get_str(body(request), "desk", max_len=30) or "")
    if not ticket:
        raise ApiError("Personne n'attend dans ce service")
    return Response(logic.ticket_dict(ticket, ahead=0, eta=0, for_agent=True))


@api_view(["POST"])
def ticket_action(request, ticket_id):
    """{action: done | no_show | recall | requeue | priority, priority?}"""
    user = require_user(request)
    t = _ticket_for_agent(user, ticket_id)
    data = body(request)
    action = get_choice(data, "action", {"done", "no_show", "recall", "requeue", "priority"})
    if action in ("done", "no_show"):
        if t.status != "called":
            raise ApiError("Ce ticket n'a pas été appelé")
        logic.finish(t, action)
    elif action == "recall":
        if t.status != "called":
            raise ApiError("Ce ticket n'a pas été appelé")
        logic.recall(t)
    elif action == "requeue":
        # Patient arrivé après son appel : il reprend sa place en tête de file.
        if t.status not in ("called", "no_show"):
            raise ApiError("Ce ticket est déjà en attente ou terminé")
        # Son ancien numéro le replace naturellement en tête de file.
        t.status, t.finished_at = "waiting", None
        t.save(update_fields=["status", "finished_at", "updated_at"])
    else:
        if t.status != "waiting":
            raise ApiError("La priorité ne s'applique qu'à un ticket en attente")
        t.priority = get_choice(data, "priority", {k for k, _ in QueueTicket.PRIORITIES}, default="") or ""
        t.save(update_fields=["priority", "updated_at"])
        logic.notify_progress(t.service)
    return Response(logic.ticket_dict(t, for_agent=True))


@api_view(["POST"])
def walk_in(request, service_id):
    """Ticket remis au guichet (personne sans téléphone ou venue sur place) : numéro à noter ou imprimer."""
    user = require_user(request)
    service = _service_for_agent(user, service_id)
    data = body(request)
    raw_phone = get_str(data, "phone", max_len=30)
    phone = normalize_phone(raw_phone) if raw_phone else ""
    if raw_phone and not phone:
        raise ApiError("Numéro de téléphone invalide")
    ticket, _ = logic.take_ticket(
        service,
        phone=phone or "",
        name=get_str(data, "name", max_len=120) or "",
        channel="desk",
        lang=get_choice(data, "lang", {"fr", "wo", "en"}, default="fr"),
        priority=get_choice(data, "priority", {k for k, _ in QueueTicket.PRIORITIES}, default="") or "",
        enforce_hours=False,
    )
    return Response(logic.ticket_dict(ticket, for_agent=True))


def _parse_time(raw, label: str) -> time:
    try:
        h, m = str(raw).split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError) as err:
        raise ApiError(f"Heure invalide : {label}") from err


def _apply_service(service: QueueService, data: dict) -> None:
    if "name" in data:
        service.name = get_str(data, "name", required=True, min_len=2, max_len=120)
    if "prefix" in data:
        prefix = (get_str(data, "prefix", required=True, min_len=1, max_len=2) or "A").upper()
        if not prefix.isalpha():
            raise ApiError("La lettre du service doit être une lettre (A, P, M…)")
        service.prefix = prefix
    if "opens_at" in data:
        service.opens_at = _parse_time(data["opens_at"], "ouverture")
    if "closes_at" in data:
        service.closes_at = _parse_time(data["closes_at"], "fermeture")
    if service.opens_at and service.closes_at and service.opens_at >= service.closes_at:
        raise ApiError("L'heure d'ouverture doit précéder l'heure de fermeture")
    if "open_days" in data:
        days = data.get("open_days")
        if not isinstance(days, list) or not days or any(d not in range(1, 8) for d in days):
            raise ApiError("Choisissez au moins un jour d'ouverture")
        service.open_days = sorted(set(days))
    if "daily_capacity" in data:
        service.daily_capacity = get_int(data, "daily_capacity", min_value=1, max_value=5000)
    if "avg_minutes" in data:
        service.avg_minutes = get_int(data, "avg_minutes", default=10, min_value=1, max_value=120)
    if "notice_ahead" in data:
        service.notice_ahead = get_int(data, "notice_ahead", default=3, min_value=1, max_value=30)
    if "is_paused" in data:
        service.is_paused = bool(data.get("is_paused"))
        service.pause_message = get_str(data, "pause_message", max_len=200) or ""
    service.save()


@api_view(["POST"])
def save_service(request, facility_id):
    """Responsable ou administration : {id?} crée ou modifie un service (horaires, capacité, pause…)."""
    user = require_user(request)
    if _agent_role(user, facility_id) != "manager":
        raise forbidden("Réservé au responsable de l'établissement")
    facility = Facility.objects.filter(id=facility_id).first()
    if not facility:
        raise not_found("Établissement introuvable")
    data = body(request)
    if service_id := get_uuid(data, "id", required=False):
        service = QueueService.objects.filter(id=service_id, facility=facility).first()
        if not service:
            raise not_found("Service introuvable")
    else:
        service = QueueService(facility=facility, opens_at=time(7, 0), closes_at=time(15, 0), open_days=[1, 2, 3, 4, 5],
                               position=facility.services.count())
        if not data.get("name"):
            raise ApiError("Indiquez le nom du service")
    _apply_service(service, data)
    audit.log(request, "queue_service_saved", facility=str(facility.id), service=str(service.id))
    return Response(service_dict(service))


@api_view(["POST"])
def pause_service(request, service_id):
    """Agent ou responsable : suspendre / reprendre la prise de tickets (salle pleine, médecin absent)."""
    user = require_user(request)
    service = _service_for_agent(user, service_id)
    data = body(request)
    service.is_paused = bool(data.get("is_paused"))
    service.pause_message = get_str(data, "pause_message", max_len=200) or ""
    service.save(update_fields=["is_paused", "pause_message", "updated_at"])
    return Response(service_dict(service))


# ── Administration ────────────────────────────────────────────────────


def _apply_facility(f: Facility, data: dict) -> None:
    from directory import localities

    place_before = (f.city, f.district, f.address)
    if "name" in data or not f.name:
        f.name = get_str(data, "name", required=True, min_len=2, max_len=160)
    if "kind" in data:
        f.kind = get_choice(data, "kind", {k for k, _ in Facility.KINDS})
    if "city" in data or not f.city:
        f.city = get_str(data, "city", required=True, min_len=2, max_len=80)
    for key, size in (("district", 80), ("address", 200), ("phone", 30)):
        if key in data:
            setattr(f, key, get_str(data, key, max_len=size) or "")
    if "is_active" in data:
        f.is_active = bool(data.get("is_active"))
    if (f.city, f.district, f.address) != place_before or f.latitude is None:
        found = localities.locate_address(f"{f.address} {f.district}".strip(), f.city) or localities.find(f.city)
        if found:
            f.latitude, f.longitude = found.latitude, found.longitude
    f.save()


@api_view(["GET", "POST"])
def admin_facilities(request):
    require_admin(request)
    if request.method == "POST":
        f = Facility()
        _apply_facility(f, body(request))
        audit.log(request, "admin_facility_saved", facility=str(f.id))
    rows = Facility.objects.prefetch_related("services", "agents__user")
    return Response(
        [
            {
                **facility_dict(f),
                "agents": [
                    {"id": str(a.id), "full_name": a.user.full_name, "email": a.user.email, "role": a.role} for a in f.agents.all()
                ],
            }
            for f in rows[:300]
        ]
    )


@api_view(["POST"])
def admin_facility(request, facility_id):
    """{…champs} modifie l'établissement ; {agent_email, role} rattache ; {remove_agent_id} retire."""
    require_admin(request)
    f = Facility.objects.filter(id=facility_id).first()
    if not f:
        raise not_found("Établissement introuvable")
    data = body(request)
    if agent_id := get_uuid(data, "remove_agent_id", required=False):
        FacilityAgent.objects.filter(id=agent_id, facility=f).delete()
    elif email := (get_str(data, "agent_email", max_len=254) or "").lower():
        target = User.objects.filter(email__iexact=email, is_active=True).first()
        if not target:
            raise not_found("Aucun compte avec cet email (la personne doit d'abord créer son compte)")
        role = get_choice(data, "role", {"agent", "manager"}, default="agent")
        FacilityAgent.objects.update_or_create(facility=f, user=target, defaults={"role": role})
        from notifications.service import notify

        notify(target, kind="queue", title="Accès à l'accueil", body=f"Vous gérez la file d'attente de {f.name}.", link="/guichet", email=True)
    else:
        _apply_facility(f, data)
    audit.log(request, "admin_facility_saved", facility=str(f.id))
    return Response({"ok": True})
