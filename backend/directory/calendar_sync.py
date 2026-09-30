"""
Synchronisation avec l'agenda personnel du médecin (Google Agenda, Outlook, iPhone), sans compte développeur :

- Export : chaque médecin dispose d'un lien d'abonnement privé (`/api/calendar/<jeton>.ics`) que son agenda
  relit régulièrement. Les RDV n'y figurent qu'avec les initiales du patient et le motif (pas de téléphone,
  pas de motif libre) : l'agenda personnel est hébergé par un tiers.
- Import : le médecin colle l'« adresse secrète au format iCal » de son agenda. Fajma la relit toutes les
  10 minutes ; chaque événement « occupé » bloque les créneaux correspondants. Seuls les horaires sont gardés.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import urllib.error
import urllib.request
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import urlparse

from django.db import transaction
from django.db.models import Q
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.models import ACTIVE_STATUSES, Appointment
from appointments.views import my_doctor
from sunusante.api import ApiError, body, get_str, iso, require_user

from .models import CalendarLink, Doctor, ExternalBusy, new_feed_token

logger = logging.getLogger(__name__)

MAX_ICS_BYTES = 2 * 1024 * 1024
MAX_EVENTS = 2000
IMPORT_HORIZON_DAYS = 180
FETCH_TIMEOUT = 15


# ── Import ───────────────────────────────────────────────────────────


def _check_public_host(url: str) -> None:
    """Refuse les adresses internes (protection SSRF) : seul un agenda accessible sur internet est accepté."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ApiError("Adresse invalide : elle doit commencer par https://")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as err:
        raise ApiError("Adresse d'agenda introuvable") from err
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ApiError("Adresse d'agenda non autorisée")


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_public_host(newurl)  # chaque redirection est revérifiée
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def normalize_url(raw: str) -> str:
    url = raw.strip()
    if url.startswith("webcal://"):  # format proposé par Apple et Outlook
        url = "https://" + url[len("webcal://") :]
    return url


def fetch_ics(url: str) -> bytes:
    _check_public_host(url)
    opener = urllib.request.build_opener(_SafeRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "Fajma-Calendar-Sync/1.0", "Accept": "text/calendar"})
    try:
        with opener.open(req, timeout=FETCH_TIMEOUT) as res:
            data = res.read(MAX_ICS_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        raise ApiError("Agenda injoignable : vérifiez l'adresse") from err
    if len(data) > MAX_ICS_BYTES:
        raise ApiError("Agenda trop volumineux")
    return data


def _as_utc(value, *, end: bool = False) -> datetime:
    """Date d'un événement → instant UTC. Journée entière et heure sans fuseau : heure de Dakar (= UTC)."""
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=UTC)
    raise ValueError("date inconnue")


def parse_busy(data: bytes, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    import icalendar
    import recurring_ical_events

    try:
        cal = icalendar.Calendar.from_ical(data)
        events = recurring_ical_events.of(cal).between(start, end)
    except Exception as err:  # noqa: BLE001 — fichier fourni par un tiers : tout format invalide est refusé proprement
        raise ApiError("Ce lien ne renvoie pas un agenda au format iCal") from err
    busy = []
    for ev in events:
        if str(ev.get("TRANSP", "")).upper() == "TRANSPARENT" or str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue  # « disponible » ou annulé : ne bloque rien
        dtstart = ev.get("DTSTART")
        if dtstart is None:
            continue
        s = _as_utc(dtstart.dt)
        if ev.get("DTEND") is not None:
            e = _as_utc(ev.get("DTEND").dt, end=True)
        elif ev.get("DURATION") is not None:
            e = s + ev.get("DURATION").dt
        elif not isinstance(dtstart.dt, datetime):
            e = s + timedelta(days=1)
        else:
            continue
        if e > s:
            busy.append((s, e))
        if len(busy) >= MAX_EVENTS:
            break
    return busy


def import_calendar(link: CalendarLink) -> int:
    now = timezone.now()
    try:
        busy = parse_busy(fetch_ics(link.import_url), now - timedelta(days=1), now + timedelta(days=IMPORT_HORIZON_DAYS))
    except ApiError as err:
        link.last_import_error = str(err.detail)[:300]
        link.save(update_fields=["last_import_error", "updated_at"])
        raise
    with transaction.atomic():
        ExternalBusy.objects.filter(doctor_id=link.doctor_id).delete()
        ExternalBusy.objects.bulk_create([ExternalBusy(doctor_id=link.doctor_id, starts_at=s, ends_at=e) for s, e in busy])
        link.last_import_at, link.last_import_error, link.imported_count = now, "", len(busy)
        link.save(update_fields=["last_import_at", "last_import_error", "imported_count", "updated_at"])
    return len(busy)


# ── Export ───────────────────────────────────────────────────────────


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _initials(name: str) -> str:
    return " ".join(f"{p[0]}." for p in name.split()[:3] if p) or "Patient"


@require_GET
def calendar_feed(request, token):
    link = CalendarLink.objects.filter(feed_token=token).select_related("doctor").first()
    if not link:
        raise Http404
    doctor: Doctor = link.doctor
    now = timezone.now()
    appts = (
        # Ses rendez-vous, et ceux qu'il assure comme remplaçant ; pas ceux confiés à son remplaçant.
        Appointment.objects.filter(
            (Q(doctor=doctor) & (Q(practitioner=None) | Q(practitioner=doctor))) | Q(practitioner=doctor),
            status__in=ACTIVE_STATUSES,
            scheduled_at__gte=now - timedelta(days=30),
            scheduled_at__lte=now + timedelta(days=180),
        )
        .select_related("patient", "relative", "consultation_type", "location", "doctor")
        .order_by("scheduled_at")
    )

    def fmt(dt):
        return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fajma//Agenda médecin//FR", "X-WR-CALNAME:Fajma — rendez-vous", "X-WR-TIMEZONE:Africa/Dakar"]
    for a in appts:
        who = a.relative.full_name if a.relative else (a.patient.full_name if a.patient else a.external_patient_name)
        what = a.consultation_type.name if a.consultation_type else ("Téléconsultation" if a.mode == "teleconsultation" else "Consultation")
        state = "" if a.status == "confirmed" else " (à confirmer)"
        if a.mode == "teleconsultation":
            place = "Téléconsultation"
        elif a.mode == "home_visit":
            place = "Visite à domicile (adresse dans votre espace Fajma)"
        else:  # un remplaçant consulte au cabinet du titulaire
            place = a.location.name if a.location else (a.doctor.address or a.doctor.city)
        if a.practitioner_id == doctor.id and a.doctor_id != doctor.id:
            what += f" (remplacement {a.doctor.full_name})"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{a.id}@fajma",
            f"DTSTAMP:{fmt(a.updated_at)}",
            f"DTSTART:{fmt(a.scheduled_at)}",
            f"DTEND:{fmt(a.ends_at)}",
            f"SUMMARY:{_ics_escape(f'{what} — {_initials(who)}{state}')}",
            f"LOCATION:{_ics_escape(place)}",
            "DESCRIPTION:Détails dans votre espace Fajma.",
            "STATUS:" + ("CONFIRMED" if a.status == "confirmed" else "TENTATIVE"),
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    response = HttpResponse("\r\n".join(lines) + "\r\n", content_type="text/calendar; charset=utf-8")
    response["Cache-Control"] = "private, max-age=300"
    return response


# ── Espace médecin ───────────────────────────────────────────────────


def link_dict(request, link: CalendarLink) -> dict:
    return {
        "feed_url": request.build_absolute_uri(f"/api/calendar/{link.feed_token}.ics"),
        "import_url": link.import_url or None,
        "last_import_at": iso(link.last_import_at),
        "last_import_error": link.last_import_error or None,
        "imported_count": link.imported_count,
    }


@api_view(["GET", "POST"])
def pro_calendar(request):
    """GET : liens de synchronisation. POST {import_url} : enregistre (ou retire) l'agenda à importer et le lit aussitôt."""
    doctor = my_doctor(require_user(request))
    link, _ = CalendarLink.objects.get_or_create(doctor=doctor)
    if request.method == "POST":
        raw = get_str(body(request), "import_url", max_len=1000) or ""
        if not raw:
            link.import_url, link.last_import_error, link.imported_count = "", "", 0
            link.save(update_fields=["import_url", "last_import_error", "imported_count", "updated_at"])
            ExternalBusy.objects.filter(doctor=doctor).delete()
        else:
            link.import_url = normalize_url(raw)
            link.save(update_fields=["import_url", "updated_at"])
            import_calendar(link)
    return Response(link_dict(request, link))


@api_view(["POST"])
def pro_calendar_sync(request):
    doctor = my_doctor(require_user(request))
    link = CalendarLink.objects.filter(doctor=doctor).exclude(import_url="").first()
    if not link:
        raise ApiError("Aucun agenda à importer")
    import_calendar(link)
    return Response(link_dict(request, link))


@api_view(["POST"])
def pro_calendar_reset(request):
    """Nouveau lien d'abonnement (l'ancien cesse de fonctionner, par exemple s'il a été partagé par erreur)."""
    doctor = my_doctor(require_user(request))
    link, _ = CalendarLink.objects.get_or_create(doctor=doctor)
    link.feed_token = new_feed_token()
    link.save(update_fields=["feed_token", "updated_at"])
    return Response(link_dict(request, link))
