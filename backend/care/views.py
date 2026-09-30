"""Mesures à domicile et rappels de médicaments (patient), lecture des mesures par les médecins qui le suivent."""

from datetime import UTC, date, datetime, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import Relative
from sunusante.api import ApiError, body, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from .logic import assess
from .models import Measurement, MedicationReminder

MAX_MEASUREMENTS_PER_DAY = 50


def measurement_dict(m: Measurement) -> dict:
    level, advice = assess(m.kind, m.systolic, m.diastolic, m.value, m.context)
    return {
        "id": str(m.id),
        "kind": m.kind,
        "systolic": m.systolic,
        "diastolic": m.diastolic,
        "pulse": m.pulse,
        "value": m.value,
        "context": m.context or None,
        "measured_at": iso(m.measured_at),
        "note": m.note or None,
        "relative": {"id": str(m.relative_id), "full_name": m.relative.full_name} if m.relative_id else None,
        "level": level,
        "advice": advice,
    }


def _relative(user, data) -> Relative | None:
    relative_id = get_uuid(data, "relative_id", required=False)
    if not relative_id:
        return None
    relative = Relative.objects.filter(id=relative_id, owner=user).first()
    if not relative:
        raise ApiError("Proche introuvable")
    return relative


def _float(data, key, lo, hi, label):
    raw = data.get(key)
    try:
        value = round(float(str(raw).replace(",", ".")), 2)
    except (TypeError, ValueError) as err:
        raise ApiError(f"{label} invalide") from err
    if not lo <= value <= hi:
        raise ApiError(f"{label} invalide (entre {lo} et {hi})")
    return value


@api_view(["GET", "POST"])
def my_measurements(request):
    """GET ?kind&relative_id&days=90 : mes mesures. POST : nouvelle mesure (avec un repère si elle est inhabituelle)."""
    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        kind = get_choice(data, "kind", {k for k, _ in Measurement.KINDS})
        if Measurement.objects.filter(patient=user, created_at__gte=timezone.now() - timedelta(days=1)).count() >= MAX_MEASUREMENTS_PER_DAY:
            raise ApiError("Trop de mesures aujourd'hui")
        m = Measurement(patient=user, relative=_relative(user, data), kind=kind, note=get_str(data, "note", max_len=200) or "")
        if kind == "blood_pressure":
            m.systolic = get_int(data, "systolic", min_value=50, max_value=300)
            m.diastolic = get_int(data, "diastolic", min_value=30, max_value=200)
            if m.systolic is None or m.diastolic is None or m.diastolic >= m.systolic:
                raise ApiError("Indiquez les deux chiffres de la tension (ex. 13/8 → 130 et 80)")
            m.pulse = get_int(data, "pulse", min_value=30, max_value=250)
        elif kind == "glucose":
            m.value = _float(data, "value", 0.2, 6.0, "Glycémie (en g/L)")
            m.context = get_choice(data, "context", {"fasting", "after_meal", "random"}, default="random")
        else:
            m.value = _float(data, "value", 0.5, 400, "Poids (en kg)")
        m.measured_at = timezone.now()
        if data.get("measured_at"):
            from appointments.scheduling import parse_datetime

            m.measured_at = parse_datetime(data.get("measured_at"))
            if m.measured_at > timezone.now() + timedelta(minutes=5) or m.measured_at < timezone.now() - timedelta(days=365):
                raise ApiError("Date de mesure invalide")
        m.save()
        # Valeur dangereuse ou élevée à répétition : les médecins qui suivent le patient sont prévenus.
        from .alerts import check_measurement

        check_measurement(m)
        return Response(measurement_dict(m))
    qs = Measurement.objects.filter(patient=user).select_related("relative")
    if kind := request.query_params.get("kind"):
        qs = qs.filter(kind=kind)
    relative_id = request.query_params.get("relative_id") or None
    qs = qs.filter(relative_id=relative_id) if relative_id else qs.filter(relative__isnull=True)
    days = get_int(request.query_params, "days", default=90, min_value=1, max_value=730)
    qs = qs.filter(measured_at__gte=timezone.now() - timedelta(days=days))
    return Response([measurement_dict(m) for m in qs[:500]])


@api_view(["POST"])
def delete_measurement(request, measurement_id):
    user = require_user(request)
    deleted, _ = Measurement.objects.filter(id=measurement_id, patient=user).delete()
    if not deleted:
        raise not_found("Mesure introuvable")
    return Response({"ok": True})


def measurements_for_doctor(patient) -> list[dict]:
    """Mesures des 6 derniers mois, pour la fiche patient d'un médecin qui le suit."""
    since = timezone.now() - timedelta(days=183)
    qs = Measurement.objects.filter(patient=patient, measured_at__gte=since).select_related("relative")[:300]
    return [measurement_dict(m) for m in qs]


# ── Rappels de médicaments ───────────────────────────────────────────


def _times(value) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= 6:
        raise ApiError("Choisissez de 1 à 6 heures de prise")
    out = []
    for t in value:
        try:
            h, m = str(t).split(":")[:2]
            h, m = int(h), int(m)
        except (ValueError, TypeError) as err:
            raise ApiError("Heure invalide (HH:MM)") from err
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ApiError("Heure invalide (HH:MM)")
        out.append(f"{h:02d}:{m:02d}")
    return sorted(set(out))


def reminder_dict(r: MedicationReminder) -> dict:
    return {
        "id": str(r.id),
        "medicine": r.medicine,
        "dosage": r.dosage or None,
        "times": r.times,
        "start_date": r.start_date.isoformat(),
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "sms": r.sms,
        "active": r.active,
        "relative": {"id": str(r.relative_id), "full_name": r.relative.full_name} if r.relative_id else None,
        "prescription_id": str(r.prescription_id) if r.prescription_id else None,
    }


@api_view(["GET", "POST"])
def my_medication_reminders(request):
    """POST {medicine, dosage?, times[], start_date?, end_date?|days?, sms?, relative_id?, prescription_id?}."""
    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        if MedicationReminder.objects.filter(patient=user, active=True).count() >= 30:
            raise ApiError("Trop de rappels actifs (30 au plus)")
        prescription = None
        if pid := get_uuid(data, "prescription_id", required=False):
            from medical.models import Prescription

            prescription = Prescription.objects.filter(id=pid, patient=user).first()
            if not prescription:
                raise not_found("Ordonnance introuvable")
        today = timezone.localdate()
        start = _date(data.get("start_date")) or today
        end = _date(data.get("end_date"))
        if not end and (days := get_int(data, "days", min_value=1, max_value=365)):
            end = start + timedelta(days=days - 1)
        if end and end < start:
            raise ApiError("La fin du traitement doit être après son début")
        r = MedicationReminder.objects.create(
            patient=user,
            relative=_relative(user, data),
            prescription=prescription,
            medicine=get_str(data, "medicine", required=True, min_len=2, max_len=160),
            dosage=get_str(data, "dosage", max_len=160) or "",
            times=_times(data.get("times")),
            start_date=start,
            end_date=end,
            sms=bool(data.get("sms")),
        )
        return Response(reminder_dict(r))
    qs = MedicationReminder.objects.filter(patient=user).select_related("relative")
    return Response([reminder_dict(r) for r in qs[:100]])


def _date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise ApiError("Date invalide") from err


@api_view(["POST"])
def update_medication_reminder(request, reminder_id):
    """{active} : suspendre ou reprendre ; {delete: true} : supprimer."""
    user = require_user(request)
    r = MedicationReminder.objects.filter(id=reminder_id, patient=user).first()
    if not r:
        raise not_found("Rappel introuvable")
    data = body(request)
    if data.get("delete"):
        r.delete()
        return Response({"ok": True})
    r.active = bool(data.get("active"))
    r.save(update_fields=["active", "updated_at"])
    return Response(reminder_dict(r))


def send_medication_reminders(now=None) -> int:
    """Appelé toutes les 10 minutes par le planificateur : envoie les prises dues depuis moins de 30 minutes."""
    from notifications.service import notify

    now = now or timezone.now()
    today = now.date()
    sent = 0
    qs = MedicationReminder.objects.filter(active=True, start_date__lte=today, patient__is_active=True).select_related("patient", "relative")
    for r in qs:
        if r.end_date and r.end_date < today:
            r.active = False
            r.save(update_fields=["active", "updated_at"])
            continue
        for t in r.times:
            h, m = map(int, t.split(":"))
            due = datetime(today.year, today.month, today.day, h, m, tzinfo=UTC)  # heure de Dakar = UTC
            key = f"{today.isoformat()} {t}"
            if not (due <= now < due + timedelta(minutes=30)) or key in r.sent_keys:
                continue
            who = f" pour {r.relative.full_name}" if r.relative_id else ""
            notify(r.patient, kind="medication", title=f"Médicament à prendre{who}",
                   body=f"{r.medicine}{f' — {r.dosage}' if r.dosage else ''} ({t}).", link="/dossier#medicaments", sms=r.sms)
            r.sent_keys = (r.sent_keys + [key])[-30:]
            r.save(update_fields=["sent_keys", "updated_at"])
            sent += 1
    return sent
