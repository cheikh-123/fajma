"""
Calcul des créneaux, validation d'une réservation et alertes liste d'attente.

Le Sénégal est à UTC+0 toute l'année (pas d'heure d'été) : les plages horaires des médecins
sont interprétées directement en UTC.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from directory.models import Doctor, DoctorAvailability, ExternalBusy, Replacement, TimeOff
from sunusante.api import ApiError

from .models import ACTIVE_STATUSES, Appointment, WaitlistEntry

logger = logging.getLogger(__name__)

DAY_LABELS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"]
MIN_LEAD = timedelta(hours=1)  # délai minimal absolu, quel que soit le réglage du médecin
MAX_HORIZON_DAYS = 180


def js_weekday(dt: datetime) -> int:
    """0 = dimanche … 6 = samedi, comme Date.getUTCDay() côté navigateur."""
    return (dt.weekday() + 1) % 7


def slot_label(dt: datetime) -> str:
    return f"{DAY_LABELS[js_weekday(dt)]} {dt.day}/{dt.month} · {dt.hour:02d}h{dt.minute:02d}"


def minutes(t: time) -> int:
    return t.hour * 60 + t.minute


@dataclass
class Busy:
    id: str
    start: datetime
    end: datetime


def window_kind(mode: str) -> str:
    """Les visites à domicile ont leurs propres plages ; cabinet et vidéo partagent les plages ordinaires."""
    return "home_visit" if mode == "home_visit" else "office"


def _schedule(doctor_id, mode: str = "in_person") -> tuple[list[DoctorAvailability], list[Busy]]:
    """
    Plages d'ouverture du type demandé + périodes occupées (tous les rendez-vous actifs, quel que soit
    leur type : le médecin ne peut pas être à la fois au cabinet et chez un patient, et ses absences).
    """
    now = timezone.now()
    windows = list(DoctorAvailability.objects.filter(doctor_id=doctor_id, kind=window_kind(mode)))
    busy = [
        Busy(str(a.id), a.scheduled_at, a.ends_at)
        for a in Appointment.objects.filter(doctor_id=doctor_id, status__in=ACTIVE_STATUSES, ends_at__gte=now).only(
            "id", "scheduled_at", "ends_at"
        )
    ]
    busy += [Busy(f"off-{t.id}", t.starts_at, t.ends_at) for t in TimeOff.objects.filter(doctor_id=doctor_id, ends_at__gte=now)]
    # Occupations importées de l'agenda personnel du médecin (Google Agenda, Outlook…).
    busy += [Busy(f"ext-{b.id}", b.starts_at, b.ends_at) for b in ExternalBusy.objects.filter(doctor_id=doctor_id, ends_at__gte=now)]
    return windows, busy


def _limits(doctor_id) -> tuple[timedelta, int]:
    """Délai minimal de prévenance et horizon de réservation choisis par le médecin."""
    doctor = Doctor.objects.filter(id=doctor_id).only("min_notice_hours", "booking_horizon_days").first()
    if not doctor:
        return MIN_LEAD, 60
    return max(MIN_LEAD, timedelta(hours=doctor.min_notice_hours)), min(doctor.booking_horizon_days, MAX_HORIZON_DAYS)


def _overlaps(busy: list[Busy], start: datetime, end: datetime, ignore_id: str | None = None) -> bool:
    return any(b.id != ignore_id and b.start < end and start < b.end for b in busy)


def active_replacements(doctor_id) -> list[Replacement]:
    return list(
        Replacement.objects.filter(doctor_id=doctor_id, status="accepted", ends_at__gt=timezone.now()).select_related("replacement")
    )


def replacement_at(doctor_id, when: datetime, replacements: list[Replacement] | None = None) -> Doctor | None:
    """Médecin remplaçant qui assure les consultations du titulaire à cet horaire, s'il y en a un."""
    for r in replacements if replacements is not None else active_replacements(doctor_id):
        if r.starts_at <= when < r.ends_at:
            return r.replacement
    return None


def compute_slots(
    doctor_id, days: int, duration_minutes: int | None = None, ignore_id: str | None = None, mode: str = "in_person"
) -> dict:
    windows, busy = _schedule(doctor_id, mode)
    replacements = active_replacements(doctor_id)
    lead, horizon_days = _limits(doctor_id)
    now = timezone.now()
    today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    found: dict[str, dict] = {}
    for d in range(min(days, horizon_days)):
        day = today + timedelta(days=d)
        for w in (w for w in windows if w.weekday == js_weekday(day)):
            duration = timedelta(minutes=duration_minutes or w.slot_minutes)
            step = timedelta(minutes=w.slot_minutes)
            t = day + timedelta(minutes=minutes(w.start_time))
            end = day + timedelta(minutes=minutes(w.end_time))
            while t + duration <= end:
                if t > now + lead and not _overlaps(busy, t, t + duration, ignore_id):
                    iso = t.isoformat().replace("+00:00", "Z")
                    substitute = replacement_at(doctor_id, t, replacements)
                    found[iso] = {
                        "iso": iso,
                        "label": slot_label(t),
                        "location_id": str(w.location_id) if w.location_id else None,
                        "replacement": substitute.full_name if substitute else None,
                    }
                t += step
    slots = sorted(found.values(), key=lambda s: s["iso"])
    return {"slots": slots[:80], "hasAvailability": bool(windows)}


def parse_datetime(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as err:
        raise ApiError("Horaire invalide") from err
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def validate_slot(
    doctor_id, scheduled_at: datetime, duration_minutes: int | None = None, ignore_id: str | None = None, mode: str = "in_person"
) -> DoctorAvailability:
    """
    Vérifie que l'horaire correspond à un créneau ouvert et libre ; renvoie la durée par défaut
    de ce créneau. À appeler dans une transaction pour que la vérification et la création soient atomiques.
    """
    now = timezone.now()
    lead, horizon_days = _limits(doctor_id)
    if scheduled_at <= now + lead:
        raise ApiError("Ce créneau est trop proche ou déjà passé")
    if scheduled_at > now + timedelta(days=horizon_days):
        raise ApiError("Ce créneau est trop éloigné")
    windows, busy = _schedule(doctor_id, mode)
    if not windows:
        if mode == "home_visit":
            raise ApiError("Ce médecin n'a pas encore ouvert de plages pour les visites à domicile")
        raise ApiError("Ce médecin n'a pas encore ouvert son agenda en ligne")
    minute_of_day = scheduled_at.hour * 60 + scheduled_at.minute
    match = None
    for w in windows:
        start = minutes(w.start_time)
        duration = duration_minutes or w.slot_minutes
        if (
            w.weekday == js_weekday(scheduled_at)
            and start <= minute_of_day
            and minute_of_day + duration <= minutes(w.end_time)
            and (minute_of_day - start) % w.slot_minutes == 0
        ):
            match = w
            break
    if match is None or scheduled_at.second or scheduled_at.microsecond:
        raise ApiError("Cet horaire ne fait pas partie des créneaux du médecin")
    duration = timedelta(minutes=duration_minutes or match.slot_minutes)
    if _overlaps(busy, scheduled_at, scheduled_at + duration, ignore_id):
        raise ApiError("Ce créneau vient d'être réservé. Choisissez-en un autre.", 409)
    return match


def next_available(doctor_id) -> dict | None:
    """Premier créneau libre (pour l'annuaire : « Prochaine disponibilité »)."""
    slots = compute_slots(doctor_id, 30)["slots"]
    return slots[0] if slots else None


def assert_no_overlap(doctor_id, start: datetime, duration_minutes: int, ignore_id: str | None = None) -> None:
    """Dernier rempart contre les doubles réservations (y compris pour le secrétariat)."""
    end = start + timedelta(minutes=duration_minutes)
    qs = Appointment.objects.filter(doctor_id=doctor_id, status__in=ACTIVE_STATUSES, scheduled_at__lt=end, ends_at__gt=start)
    if ignore_id:
        qs = qs.exclude(id=ignore_id)
    if qs.exists():
        raise ApiError("Ce créneau vient d'être réservé. Choisissez-en un autre.", 409)


def site_url() -> str:
    return settings.PUBLIC_SITE_URL


def notify_waitlist(doctor: Doctor, freed_at: datetime) -> None:
    """Prévient les 5 premiers inscrits qu'un créneau s'est libéré. N'échoue jamais."""
    from notifications.service import notify
    from notifications.sms import build_waitlist_message, normalize_phone
    from notifications.tasks import queue_sms

    try:
        if freed_at <= timezone.now() + MIN_LEAD:
            return
        entries = WaitlistEntry.objects.filter(doctor=doctor, status="active").select_related("patient")[:5]
        url = f"{site_url()}/medecins/{doctor.id}"
        for entry in entries:
            notify(entry.patient, kind="waitlist_slot", title="Un créneau s'est libéré", body=doctor.full_name, link=f"/medecins/{doctor.id}")
            phone = normalize_phone(entry.patient.phone)
            if not phone:
                continue
            queue_sms(phone, build_waitlist_message(doctor.full_name, freed_at, url, entry.patient.preferred_language), entry.patient.notification_channel)
            entry.notified_at = timezone.now()
            entry.save(update_fields=["notified_at", "updated_at"])
    except Exception:  # noqa: BLE001 — une alerte ne doit jamais bloquer une annulation
        logger.exception("waitlist: échec de notification")
