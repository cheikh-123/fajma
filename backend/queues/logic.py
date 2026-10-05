"""
Règles de la file : ouverture, numérotation, ordre de passage, attente estimée et messages au patient.

- Ordre : tickets prioritaires d'abord (femme enceinte, personne âgée, urgence…, fixés par l'accueil), puis par
  numéro. Personne ne double un prioritaire déjà appelé : la priorité ne joue que sur l'ordre des tickets en attente.
- Attente estimée : rythme réel des derniers appels du jour (tous guichets confondus), sinon la durée moyenne
  déclarée par le service. Elle se met à jour à chaque appel.
- Messages (3 au plus par ticket) : « c'est bientôt » quand il reste peu de monde devant, « partez maintenant »
  quand l'attente restante rejoint le temps de trajet indiqué, puis « c'est votre tour » avec le guichet.
"""

from __future__ import annotations

from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.db.models import Case, IntegerField, Max, Value, When
from django.utils import timezone

from sunusante.api import ApiError

from .models import QueueService, QueueTicket

ACTIVE = ("waiting", "called")
RECENT_CALLS = 10
LEAVE_MARGIN_MIN = 10  # « partez maintenant » : trajet + 10 minutes de marge

MESSAGES = {
    "fr": {
        "taken": "Fajma — Ticket {label} ({service}, {facility}). {ahead} personne(s) devant vous, environ {eta}. Suivi : {url}",
        "soon": "Fajma — Ticket {label} : plus que {ahead} personne(s) devant vous à {facility}. Présentez-vous à l'accueil.",
        "leave": "Fajma — Ticket {label} : partez maintenant pour {facility}, votre tour arrive dans environ {eta}.",
        "called": "Fajma — C'est votre tour ! Ticket {label}, présentez-vous {desk} ({facility}).",
        "recall": "Fajma — Dernier appel pour le ticket {label} {desk} ({facility}).",
        "desk": "au {desk}",
        "desk_none": "à l'accueil",
        "minutes": "{n} min",
        "hours": "{h} h {m:02d}",
        "now": "quelques minutes",
    },
    "wo": {
        "taken": "Fajma — Tike {label} ({service}, {facility}). {ahead} nit ñoo la jiitu, lu tollu ci {eta}. Topp ko: {url}",
        "soon": "Fajma — Tike {label}: {ahead} nit rekk ñoo la jiitu ca {facility}. Ñëwal ca akkey bi.",
        "leave": "Fajma — Tike {label}: demal léegi {facility}, sa waxtu dina agsi ci lu tollu ci {eta}.",
        "called": "Fajma — Sa waxtu agsi na! Tike {label}, ñëwal {desk} ({facility}).",
        "recall": "Fajma — Woote bu mujj ngir tike {label} {desk} ({facility}).",
        "desk": "ca {desk}",
        "desk_none": "ca akkey bi",
        "minutes": "{n} simili",
        "hours": "{h} waxtu {m:02d}",
        "now": "ay simili",
    },
    "en": {
        "taken": "Fajma — Ticket {label} ({service}, {facility}). {ahead} person(s) ahead of you, about {eta}. Track: {url}",
        "soon": "Fajma — Ticket {label}: only {ahead} person(s) ahead of you at {facility}. Please come to the front desk.",
        "leave": "Fajma — Ticket {label}: leave now for {facility}, your turn comes in about {eta}.",
        "called": "Fajma — It's your turn! Ticket {label}, please go {desk} ({facility}).",
        "recall": "Fajma — Last call for ticket {label} {desk} ({facility}).",
        "desk": "to {desk}",
        "desk_none": "to the front desk",
        "minutes": "{n} min",
        "hours": "{h} h {m:02d}",
        "now": "a few minutes",
    },
}


def _t(lang: str, key: str, **kw) -> str:
    return MESSAGES.get(lang, MESSAGES["fr"])[key].format(**kw)


def eta_text(minutes: int, lang: str = "fr") -> str:
    if minutes < 5:
        return _t(lang, "now")
    if minutes < 60:
        return _t(lang, "minutes", n=(minutes // 5) * 5 or 5)
    return _t(lang, "hours", h=minutes // 60, m=(minutes % 60) // 5 * 5)


# ── Ouverture ─────────────────────────────────────────────────────────


def closed_reason(service: QueueService, now: datetime | None = None) -> str | None:
    """Pourquoi on ne peut pas prendre de ticket maintenant (None : ouvert)."""
    now = timezone.localtime(now or timezone.now())
    if not service.facility.is_active:
        return "Cet établissement ne propose pas de ticket en ligne pour le moment."
    if service.is_paused:
        return service.pause_message or "La prise de tickets est suspendue pour ce service. Réessayez plus tard."
    if service.open_days and now.isoweekday() not in service.open_days:
        return "Ce service est fermé aujourd'hui."
    if not service.opens_at <= now.time() < service.closes_at:
        return f"Tickets disponibles de {service.opens_at:%H:%M} à {service.closes_at:%H:%M}."
    if service.daily_capacity:
        taken = QueueTicket.objects.filter(service=service, day=now.date()).exclude(status="cancelled").count()
        if taken >= service.daily_capacity:
            return "Tous les tickets du jour sont pris pour ce service. Revenez demain."
    return None


# ── Ordre et attente ──────────────────────────────────────────────────


def waiting_queue(service: QueueService, day=None):
    """Tickets en attente dans l'ordre de passage."""
    day = day or timezone.localdate()
    return (
        QueueTicket.objects.filter(service=service, day=day, status="waiting")
        .annotate(prio=Case(When(priority="", then=Value(1)), default=Value(0), output_field=IntegerField()))
        .order_by("prio", "number")
    )


def pace_minutes(service: QueueService, day=None) -> float:
    """Minutes entre deux appels, mesurées sur les derniers appels du jour (tous guichets)."""
    day = day or timezone.localdate()
    calls = list(
        QueueTicket.objects.filter(service=service, day=day, called_at__isnull=False)
        .order_by("-called_at")
        .values_list("called_at", flat=True)[:RECENT_CALLS]
    )
    if len(calls) >= 3:
        span = (calls[0] - calls[-1]).total_seconds() / 60
        return min(max(span / (len(calls) - 1), 1.0), 60.0)
    return float(service.avg_minutes)


def place(ticket: QueueTicket, order: list | None = None, pace: float | None = None) -> tuple[int, int]:
    """(personnes devant, minutes d'attente estimées) pour un ticket en attente."""
    if ticket.status != "waiting":
        return 0, 0
    order = order if order is not None else [t.id for t in waiting_queue(ticket.service, ticket.day)]
    ahead = order.index(ticket.id) if ticket.id in order else 0
    pace = pace if pace is not None else pace_minutes(ticket.service, ticket.day)
    return ahead, round(ahead * pace + pace / 2)


def ticket_url(ticket: QueueTicket) -> str:
    return f"{settings.PUBLIC_SITE_URL}/ticket/{ticket.code}"


def ticket_dict(ticket: QueueTicket, *, ahead: int | None = None, eta: int | None = None, for_agent: bool = False) -> dict:
    if ahead is None:
        ahead, eta = place(ticket)
    s = ticket.service
    data = {
        "code": ticket.code,
        "label": ticket.label,
        "number": ticket.number,
        "day": ticket.day.isoformat(),
        "status": ticket.status,
        "status_label": ticket.get_status_display(),
        "priority": ticket.priority or None,
        "priority_label": ticket.get_priority_display() if ticket.priority else None,
        "ahead": ahead,
        "eta_minutes": eta,
        "travel_minutes": ticket.travel_minutes,
        "leave_now": bool(ticket.status == "waiting" and ticket.travel_minutes and eta <= ticket.travel_minutes + LEAVE_MARGIN_MIN),
        "desk": ticket.desk or None,
        "called_at": ticket.called_at.isoformat() if ticket.called_at else None,
        "created_at": ticket.created_at.isoformat(),
        "service": {"id": str(s.id), "name": s.name},
        "facility": {"id": str(s.facility_id), "name": s.facility.name, "city": s.facility.city, "address": s.facility.address or None},
    }
    if for_agent:
        data["id"] = str(ticket.id)
        data["name"] = ticket.name or None
        # Téléphone partiellement masqué à l'accueil : de quoi reconnaître la personne, pas de quoi recopier le numéro.
        data["phone_hint"] = f"•• {ticket.phone[-4:]}" if ticket.phone else None
        data["channel"] = ticket.channel
        data["recalls"] = ticket.recalls
    return data


# ── Messages ──────────────────────────────────────────────────────────


def _send(ticket: QueueTicket, text: str, title: str) -> None:
    from notifications.models import Notification
    from notifications.tasks import queue_sms

    if ticket.phone:
        queue_sms(ticket.phone, text, "whatsapp" if ticket.channel == "whatsapp" else "sms")
    if ticket.user_id:
        Notification.objects.create(user=ticket.user, kind="queue", title=title, body=text.removeprefix("Fajma — "), link=f"/ticket/{ticket.code}")


def _desk_text(ticket: QueueTicket) -> str:
    return _t(ticket.lang, "desk", desk=ticket.desk) if ticket.desk else _t(ticket.lang, "desk_none")


def notify_progress(service: QueueService) -> int:
    """Après chaque mouvement de la file : « c'est bientôt » et « partez maintenant », une seule fois chacun."""
    now = timezone.now()
    tickets = list(waiting_queue(service).select_related("service__facility"))
    pace = pace_minutes(service)
    sent = 0
    for ahead, t in enumerate(tickets):
        eta = round(ahead * pace + pace / 2)
        kw = {"label": t.label, "facility": service.facility.name, "ahead": ahead, "eta": eta_text(eta, t.lang)}
        if not t.soon_sent_at and ahead <= service.notice_ahead:
            _send(t, _t(t.lang, "soon", **kw), f"Ticket {t.label} : c'est bientôt")
            QueueTicket.objects.filter(pk=t.pk).update(soon_sent_at=now, leave_sent_at=t.leave_sent_at or now)
            sent += 1
        elif t.travel_minutes and not t.leave_sent_at and eta <= t.travel_minutes + LEAVE_MARGIN_MIN:
            _send(t, _t(t.lang, "leave", **kw), f"Ticket {t.label} : partez maintenant")
            QueueTicket.objects.filter(pk=t.pk).update(leave_sent_at=now)
            sent += 1
    return sent


# ── Actions ───────────────────────────────────────────────────────────


def take_ticket(service: QueueService, *, phone: str = "", name: str = "", user=None, channel: str = "web",
                lang: str = "fr", travel_minutes: int | None = None, priority: str = "", enforce_hours: bool = True) -> tuple[QueueTicket, bool]:
    """Nouveau ticket (ou le ticket encore actif du même numéro dans ce service aujourd'hui). Renvoie (ticket, créé)."""
    today = timezone.localdate()
    with transaction.atomic():
        service = QueueService.objects.select_for_update().select_related("facility").get(pk=service.pk)
        if phone:
            existing = QueueTicket.objects.filter(service=service, day=today, phone=phone, status__in=ACTIVE).first()
            if existing:
                return existing, False
        if user is not None:
            existing = QueueTicket.objects.filter(service=service, day=today, user=user, status__in=ACTIVE).first()
            if existing:
                return existing, False
        if enforce_hours and (reason := closed_reason(service)):
            raise ApiError(reason)
        number = (QueueTicket.objects.filter(service=service, day=today).aggregate(m=Max("number"))["m"] or 0) + 1
        ticket = QueueTicket.objects.create(
            service=service, day=today, number=number, user=user, phone=phone or "", name=name or "",
            channel=channel, lang=lang if lang in MESSAGES else "fr", travel_minutes=travel_minutes, priority=priority,
        )
    ahead, eta = place(ticket)
    if ticket.phone and channel in ("web", "desk"):
        # USSD et WhatsApp répondent déjà à l'écran : pas de SMS en double.
        _send(ticket, _t(ticket.lang, "taken", label=ticket.label, service=service.name, facility=service.facility.name,
                         ahead=ahead, eta=eta_text(eta, ticket.lang), url=ticket_url(ticket)), f"Ticket {ticket.label} pris")
    return ticket, True


def call_next(service: QueueService, *, agent, desk: str = "") -> QueueTicket | None:
    with transaction.atomic():
        QueueService.objects.select_for_update().get(pk=service.pk)
        ticket = waiting_queue(service).select_related("service__facility").first()
        if not ticket:
            return None
        ticket.status, ticket.called_at, ticket.desk, ticket.called_by = "called", timezone.now(), desk[:30], agent
        ticket.save(update_fields=["status", "called_at", "desk", "called_by", "updated_at"])
    _send(ticket, _t(ticket.lang, "called", label=ticket.label, desk=_desk_text(ticket), facility=service.facility.name),
          f"Ticket {ticket.label} : c'est votre tour")
    notify_progress(service)
    return ticket


def recall(ticket: QueueTicket) -> None:
    ticket.recalls += 1
    ticket.save(update_fields=["recalls", "updated_at"])
    _send(ticket, _t(ticket.lang, "recall", label=ticket.label, desk=_desk_text(ticket), facility=ticket.service.facility.name),
          f"Ticket {ticket.label} : dernier appel")


def finish(ticket: QueueTicket, status: str) -> None:
    ticket.status, ticket.finished_at = status, timezone.now()
    ticket.save(update_fields=["status", "finished_at", "updated_at"])


def expire_old_tickets(today=None) -> int:
    """Tickets des jours précédents restés ouverts : expirés (lancé par le planificateur)."""
    today = today or timezone.localdate()
    return QueueTicket.objects.filter(day__lt=today, status__in=ACTIVE).update(status="expired", finished_at=timezone.now())


def day_stats(service: QueueService, day=None) -> dict:
    """Bilan du jour pour le responsable : tickets, reçus, absents, attente moyenne réelle, affluence par heure."""
    day = day or timezone.localdate()
    tickets = list(QueueTicket.objects.filter(service=service, day=day))
    called = [t for t in tickets if t.called_at]
    waits = [(t.called_at - t.created_at).total_seconds() / 60 for t in called]
    by_hour: dict[int, int] = {}
    for t in tickets:
        h = timezone.localtime(t.created_at).hour
        by_hour[h] = by_hour.get(h, 0) + 1
    return {
        "taken": len(tickets),
        "waiting": sum(t.status == "waiting" for t in tickets),
        "done": sum(t.status == "done" for t in tickets),
        "no_show": sum(t.status == "no_show" for t in tickets),
        "remote": sum(t.channel != "desk" for t in tickets),
        "avg_wait_minutes": round(sum(waits) / len(waits)) if waits else None,
        "pace_minutes": round(pace_minutes(service, day), 1),
        "by_hour": [{"hour": h, "count": by_hour[h]} for h in sorted(by_hour)],
    }
