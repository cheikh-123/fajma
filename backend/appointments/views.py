"""Rendez-vous : réservation, annulation, déplacement, téléconsultation, liste d'attente, agenda du médecin."""

from datetime import UTC, timedelta

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import Relative
from directory.models import ConsultationType, Doctor
from insurance.logic import insurance_dict
from notifications import service as notifications
from notifications.models import SmsReminder
from sunusante.api import ApiError, ScopedThrottle, body, forbidden, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from .models import ACTIVE_STATUSES, Appointment, AppointmentSeries, WaitlistEntry
from .questionnaire import answers_view, can_answer, clean_answers, questions_for
from .scheduling import (
    active_replacements,
    assert_no_overlap,
    notify_waitlist,
    parse_datetime,
    replacement_at,
    slot_label,
    validate_slot,
)

MAX_UPCOMING_PER_DOCTOR = 4


def cancellation_open(appt: Appointment) -> bool:
    """Le patient peut-il encore annuler ou déplacer en ligne (délai fixé par le médecin) ?"""
    deadline = appt.doctor.cancellation_deadline_hours
    return appt.is_active and (deadline == 0 or appt.scheduled_at - timezone.now() >= timedelta(hours=deadline))


def cancel(appt: Appointment, by: str, reason: str = "", *, quiet: bool = False) -> None:
    """quiet : pas de notification individuelle (annulation groupée d'une série, résumée en un seul message)."""
    appt.status = "cancelled"
    appt.cancelled_at = timezone.now()
    appt.cancelled_by = by
    appt.cancel_reason = reason
    appt.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancel_reason"])
    # Payé en ligne : remboursement intégral du patient, quel que soit l'auteur de l'annulation.
    from payments.ledger import open_refund

    open_refund(appt, reason or f"Annulation ({by})")
    if not quiet:
        notifications.appointment_cancelled(appt)
        notify_waitlist(appt.doctor, appt.scheduled_at)


def cancel_rest_of_series(appt: Appointment, by: str, reason: str = "", *, only_open: bool = False) -> tuple[list[Appointment], int]:
    """
    Annule cette séance et les suivantes de la même série. only_open (patient) : seulement celles encore
    annulables en ligne. Renvoie les séances annulées et le nombre de séances conservées.
    """
    rest = list(
        Appointment.objects.filter(series_id=appt.series_id, status__in=ACTIVE_STATUSES, scheduled_at__gte=appt.scheduled_at)
        .select_related("doctor__user", "patient", "relative", "practitioner__user")
        .order_by("scheduled_at")
    )
    targets = [a for a in rest if cancellation_open(a)] if only_open else rest
    for a in targets:
        cancel(a, by, reason, quiet=True)
    if targets:
        notifications.series_cancelled(targets, by)
        notify_waitlist(appt.doctor, targets[0].scheduled_at)
    return targets, len(rest) - len(targets)


def involves(doctor: Doctor) -> Q:
    """Rendez-vous du médecin comme titulaire, ou qu'il assure comme remplaçant."""
    return Q(doctor=doctor) | Q(practitioner=doctor)


def practitioner_dict(a: Appointment) -> dict | None:
    if not a.practitioner_id:
        return None
    return {"id": str(a.practitioner_id), "full_name": a.practitioner.full_name}


def series_dict(a: Appointment) -> dict | None:
    if not a.series_id:
        return None
    return {"id": str(a.series_id), "index": a.series_index, "total": a.series.booked_count, "interval_days": a.series.interval_days}


def visit_dict(a: Appointment) -> dict | None:
    if a.mode != "home_visit":
        return None
    return {
        "address": a.visit_address,
        "landmark": a.visit_landmark or None,
        "latitude": a.visit_latitude,
        "longitude": a.visit_longitude,
    }


class BookingThrottle(ScopedThrottle):
    scope = "booking"


def my_doctor(user) -> Doctor:
    doctor = Doctor.objects.filter(user=user).first()
    if not doctor:
        raise not_found("Fiche médecin introuvable")
    return doctor


def patient_appointment_dict(a: Appointment) -> dict:
    d = a.doctor
    return {
        "id": str(a.id),
        "scheduled_at": iso(a.scheduled_at),
        "duration_minutes": a.duration_minutes,
        "mode": a.mode,
        "status": a.status,
        "reason": a.reason or None,
        "doctor_id": str(a.doctor_id),
        "teleconsultation_room": a.teleconsultation_room or None,
        "price": a.price,
        "doctor": {
            "id": str(d.id),
            "full_name": d.full_name,
            "city": d.city,
            "consultation_price": d.consultation_price,
            "currency": d.currency,
            "specialty": {"name": d.specialty.name} if d.specialty else None,
        },
        "payments": [
            {
                "id": str(p.id),
                "status": p.status,
                "method": p.method,
                "amount": p.amount,
                "reference": p.reference,
                "checkout_url": p.checkout_url or None,
                "created_at": iso(p.created_at),
                "refund_status": p.refund.status if hasattr(p, "refund") else None,
            }
            for p in a.payments.all()
        ],
        "relative": {"id": str(a.relative.id), "full_name": a.relative.full_name} if a.relative else None,
        "consultation_type": {"id": str(a.consultation_type.id), "name": a.consultation_type.name} if a.consultation_type else None,
        "can_cancel": cancellation_open(a),
        "insurance": insurance_dict(a),
        "amount_due": a.amount_due,
        "questionnaire": a.questionnaire or None,
        "answers": a.answers or None,
        "answered_at": iso(a.answered_at),
        "can_answer": can_answer(a),
        "cancellation_deadline_hours": d.cancellation_deadline_hours,
        "booking_instructions": d.booking_instructions or None,
        "cancelled_by": a.cancelled_by or None,
        "cancel_reason": a.cancel_reason or None,
        "has_review": hasattr(a, "review"),
        "location": {"name": a.location.name, "address": a.location.address, "city": a.location.city} if a.location else None,
        "visit": visit_dict(a),
        "practitioner": practitioner_dict(a),
        "series": series_dict(a),
    }


# ── Patient ──────────────────────────────────────────────────────────


SENEGAL_BOUNDS = ((12.0, 17.0), (-18.0, -11.0))


def clean_visit(data: dict) -> dict:
    """Adresse d'une visite à domicile : obligatoire, avec un repère et une position GPS facultatifs."""
    address = (get_str(data, "visit_address", max_len=300) or "").strip()
    if len(address) < 5:
        raise ApiError("Indiquez l'adresse de la visite (quartier, rue, numéro de maison)")
    lat, lng = data.get("visit_latitude"), data.get("visit_longitude")
    if lat in (None, "") or lng in (None, ""):
        lat = lng = None
    else:
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError) as err:
            raise ApiError("Position invalide") from err
        (lat_min, lat_max), (lng_min, lng_max) = SENEGAL_BOUNDS
        if not (lat_min <= lat <= lat_max and lng_min <= lng <= lng_max):
            raise ApiError("Cette position n'est pas au Sénégal")
    return {
        "visit_address": address,
        "visit_landmark": get_str(data, "visit_landmark", max_len=200) or "",
        "visit_latitude": lat,
        "visit_longitude": lng,
    }


def check_mode(doctor: Doctor, mode: str, ctype: ConsultationType | None) -> None:
    if mode == "teleconsultation" and not doctor.teleconsultation:
        raise ApiError("Ce médecin ne propose pas la téléconsultation")
    if mode == "home_visit" and not doctor.home_visits:
        raise ApiError("Ce médecin ne se déplace pas à domicile")
    if ctype and not ctype.allows(mode):
        raise ApiError("Ce motif n'est pas proposé dans ce mode")


def booking_price(doctor: Doctor, ctype: ConsultationType | None, mode: str) -> int:
    """Tarif du motif (ou de la fiche), plus le supplément de déplacement pour une visite à domicile."""
    price = ctype.price if ctype else doctor.consultation_price
    return price + (doctor.home_visit_fee if mode == "home_visit" else 0)


def parse_series(value, ctype: ConsultationType | None) -> tuple[int, int]:
    """{count, interval_days} : nombre de séances et écart (en jours) entre deux séances."""
    if not isinstance(value, dict):
        raise ApiError("Série de séances invalide")
    if not ctype or ctype.series_max < 2:
        raise ApiError("Ce motif ne se réserve pas en série")
    count = get_int(value, "count", min_value=2, max_value=ctype.series_max)
    interval = get_int(value, "interval_days", min_value=1, max_value=14)
    if count is None or interval not in AppointmentSeries.INTERVALS:
        raise ApiError("Rythme des séances invalide")
    return count, interval


def series_dates(first, count: int, interval_days: int) -> list:
    return [first + timedelta(days=interval_days * k) for k in range(count)]


def _booking_context(data: dict, doctor: Doctor, user) -> dict:
    """Mode, motif, proche et adresse d'une réservation patient, vérifiés."""
    mode = get_choice(data, "mode", {"in_person", "teleconsultation", "home_visit"}, default="in_person")
    # Le prix et la durée ne viennent jamais du navigateur : ils sont déduits du motif ou de la fiche.
    ctype = None
    type_id = get_uuid(data, "consultation_type_id", required=False)
    if type_id:
        ctype = ConsultationType.objects.filter(id=type_id, doctor=doctor, is_active=True).first()
        if not ctype:
            raise ApiError("Motif de consultation indisponible")
    check_mode(doctor, mode, ctype)
    relative = None
    relative_id = get_uuid(data, "relative_id", required=False) if user else None
    if relative_id:
        relative = Relative.objects.filter(id=relative_id, owner=user).first()
        if not relative:
            raise ApiError("Proche introuvable")
    return {"mode": mode, "ctype": ctype, "relative": relative, "visit": clean_visit(data) if mode == "home_visit" and user else {}}


@api_view(["POST"])
@throttle_classes([BookingThrottle])
def create_appointment(request):
    user = require_user(request)
    data = body(request)
    doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id"), is_verified=True).first()
    if not doctor:
        raise not_found("Médecin introuvable")
    if doctor.user_id == user.id:
        raise ApiError("Vous ne pouvez pas prendre rendez-vous avec vous-même. Utilisez votre agenda pour bloquer un horaire.")
    sponsor = None
    if link_id := get_uuid(data, "care_link_id", required=False):
        # Entraide familiale : le proche autorisé réserve au nom du bénéficiaire (qui reçoit les rappels).
        from family.models import CareLink

        link = CareLink.objects.filter(id=link_id, sponsor=user, status="active", can_book=True).select_related("beneficiary").first()
        if not link:
            raise ApiError("Vous n'êtes pas autorisé à prendre rendez-vous pour ce proche")
        if data.get("series") or data.get("relative_id"):
            raise ApiError("Pour un proche aidé, réservez une consultation à la fois")
        sponsor, user = user, link.beneficiary
        if doctor.user_id == user.id:
            raise ApiError("Ce médecin est votre proche lui-même")
    options = {
        "reason": get_str(data, "reason", max_len=500) or "",
        "coverage_id": get_uuid(data, "coverage_id", required=False),
        **_booking_context(data, doctor, user),
    }
    scheduled_at = parse_datetime(data.get("scheduled_at"))
    if data.get("series"):
        count, interval = parse_series(data["series"], options["ctype"])
        series, booked, skipped = book_series(user, doctor, scheduled_at, count, interval, **options)
        _save_answers(booked[0], data.get("answers"))
        return Response(
            {
                "id": str(booked[0].id),
                "status": booked[0].status,
                "series": {"id": str(series.id), "booked": len(booked), "skipped": skipped},
            }
        )
    # Idempotence : la même demande renvoyée après une coupure réseau (réponse perdue) retrouve le rendez-vous
    # déjà créé au lieu d'échouer sur « créneau déjà réservé » ou d'en créer un second.
    same = Appointment.objects.filter(
        patient=user, doctor=doctor, scheduled_at=scheduled_at, status__in=ACTIVE_STATUSES,
        created_at__gte=timezone.now() - timedelta(minutes=10),
    ).first()
    if same:
        return Response({"id": str(same.id), "status": same.status, "already_booked": True})
    appt = book_for_patient(user, doctor, scheduled_at, **options)
    _save_answers(appt, data.get("answers"))
    if sponsor:
        Appointment.objects.filter(pk=appt.pk).update(booked_by=sponsor)
        notifications.notify(user, kind="family", title=f"{sponsor.full_name} a pris un rendez-vous pour vous",
                             body=f"{doctor.full_name}, {notifications.format_when(appt.scheduled_at)}.", link="/mon-espace", sms=True)
    return Response({"id": str(appt.id), "status": appt.status})


def _save_answers(appt, raw) -> None:
    """Réponses facultatives au questionnaire, données dès la réservation (fiche du médecin)."""
    if not raw or not appt.questionnaire:
        return
    answers = clean_answers(appt.questionnaire, raw)
    if answers:
        appt.answers, appt.answered_at = answers, timezone.now()
        appt.save(update_fields=["answers", "answered_at", "updated_at"])


@api_view(["POST"])
def preview_series(request):
    """Dates d'une série de séances et disponibilité de chacune, avant de réserver (rien n'est bloqué)."""
    data = body(request)
    doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id"), is_verified=True).first()
    if not doctor:
        raise not_found("Médecin introuvable")
    ctx = _booking_context(data, doctor, None)
    count, interval = parse_series(data.get("series"), ctx["ctype"])
    first = parse_datetime(data.get("scheduled_at"))
    replacements = active_replacements(doctor.id)
    sessions = []
    for when in series_dates(first, count, interval):
        try:
            validate_slot(doctor.id, when, ctx["ctype"].duration_minutes, mode=ctx["mode"])
            problem = None
        except ApiError as err:
            problem = str(err.detail)
        substitute = replacement_at(doctor.id, when, replacements)
        sessions.append(
            {
                "iso": iso(when),
                "label": slot_label(when),
                "available": problem is None,
                "problem": problem,
                "replacement": substitute.full_name if substitute else None,
            }
        )
    return Response({"sessions": sessions})


def _check_new_patient(user, doctor: Doctor) -> None:
    if not doctor.accepts_new_patients and not Appointment.objects.filter(
        patient=user, doctor=doctor, status__in=("confirmed", "completed")
    ).exists():
        raise ApiError("Ce médecin n'accepte pas de nouveaux patients pour le moment")


def _check_upcoming(user, doctor: Doctor) -> None:
    """Anti-accaparement : 4 rendez-vous à venir au plus par médecin (les séances d'une série à part)."""
    upcoming = Appointment.objects.filter(
        patient=user, doctor=doctor, status__in=ACTIVE_STATUSES, scheduled_at__gt=timezone.now(), series__isnull=True
    ).count()
    if upcoming >= MAX_UPCOMING_PER_DOCTOR:
        raise ApiError("Vous avez déjà plusieurs rendez-vous à venir avec ce médecin")


def _new_appointment(user, doctor: Doctor, scheduled_at, window, *, mode, ctype, relative, reason, price, coverage, channel, visit, **extra):
    from insurance.logic import appointment_fields

    first_of_series = extra.get("series_index") in (None, 1)
    return Appointment.objects.create(
        patient=user,
        doctor=doctor,
        scheduled_at=scheduled_at,
        duration_minutes=ctype.duration_minutes if ctype else window.slot_minutes,
        mode=mode,
        reason=reason,
        status="confirmed" if doctor.auto_confirm else "pending",
        consultation_type=ctype,
        relative=relative,
        location_id=None if mode == "home_visit" else window.location_id,
        price=price,
        # Série : le questionnaire n'est posé qu'avant la première séance.
        questionnaire=questions_for(doctor, ctype) if first_of_series else [],
        channel=channel,
        practitioner=replacement_at(doctor.id, scheduled_at),
        **visit,
        **appointment_fields(coverage, price),
        **extra,
    )


def book_for_patient(
    user,
    doctor: Doctor,
    scheduled_at,
    *,
    mode="in_person",
    ctype=None,
    relative=None,
    reason="",
    coverage_id=None,
    channel="web",
    visit=None,
) -> Appointment:
    """
    Réservation par le patient lui-même (site, WhatsApp, USSD) : mêmes règles partout.
    Prix et durée viennent du motif ou de la fiche, jamais de la demande.
    """
    _check_new_patient(user, doctor)
    from insurance.logic import coverage_for_booking

    coverage = coverage_for_booking(user, relative, doctor, coverage_id)
    price = booking_price(doctor, ctype, mode)
    with transaction.atomic():
        _check_upcoming(user, doctor)
        window = validate_slot(doctor.id, scheduled_at, ctype.duration_minutes if ctype else None, mode=mode)
        appt = _new_appointment(
            user, doctor, scheduled_at, window, mode=mode, ctype=ctype, relative=relative, reason=reason,
            price=price, coverage=coverage, channel=channel, visit=visit or {},
        )
    # Le patient a obtenu un rendez-vous : il sort de la liste d'attente de ce médecin.
    WaitlistEntry.objects.filter(patient=user, doctor=doctor).update(status="closed")
    notifications.appointment_booked(appt)
    return appt


def book_series(
    user, doctor: Doctor, first, count: int, interval_days: int, *, mode, ctype, relative, reason, coverage_id, visit
) -> tuple[AppointmentSeries, list[Appointment], list[str]]:
    """
    Réserve une série de séances. La première (choisie par le patient) doit être libre ; les suivantes
    indisponibles (jour fermé, créneau pris, absence) sont sautées et signalées, à réserver à part.
    """
    _check_new_patient(user, doctor)
    if Appointment.objects.filter(
        patient=user, doctor=doctor, series__isnull=False, status__in=ACTIVE_STATUSES, scheduled_at__gt=timezone.now()
    ).exists():
        raise ApiError(
            "Vous avez déjà une série de séances en cours avec ce praticien. "
            "Elle doit être terminée ou annulée avant d'en réserver une autre."
        )
    from insurance.logic import coverage_for_booking

    coverage = coverage_for_booking(user, relative, doctor, coverage_id)
    price = booking_price(doctor, ctype, mode)
    booked: list[Appointment] = []
    skipped: list[str] = []
    with transaction.atomic():
        _check_upcoming(user, doctor)
        series = AppointmentSeries.objects.create(
            doctor=doctor, patient=user, interval_days=interval_days, requested_count=count, created_by=user
        )
        for k, when in enumerate(series_dates(first, count, interval_days)):
            try:
                window = validate_slot(doctor.id, when, ctype.duration_minutes, mode=mode)
            except ApiError:
                if k == 0:
                    raise
                skipped.append(slot_label(when))
                continue
            booked.append(
                _new_appointment(
                    user, doctor, when, window, mode=mode, ctype=ctype, relative=relative, reason=reason, price=price,
                    coverage=coverage, channel="web", visit=visit, series=series, series_index=len(booked) + 1,
                )
            )
        series.booked_count = len(booked)
        series.save(update_fields=["booked_count", "updated_at"])
    WaitlistEntry.objects.filter(patient=user, doctor=doctor).update(status="closed")
    notifications.series_booked(series, booked, skipped)
    return series, booked, skipped


@api_view(["GET"])
def my_appointments(request):
    user = require_user(request)
    appts = (
        Appointment.objects.filter(patient=user)
        .exclude(mode="async")
        .select_related("doctor__specialty", "relative", "consultation_type", "review", "location", "practitioner", "series")
        .prefetch_related("payments", "payments__refund")
        .order_by("-scheduled_at")
    )
    return Response([patient_appointment_dict(a) for a in appts])


@api_view(["POST"])
def answer_questionnaire(request, appointment_id):
    user = require_user(request)
    appt = Appointment.objects.filter(id=appointment_id, patient=user).first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if not can_answer(appt):
        raise ApiError("Ce questionnaire n'est plus modifiable")
    appt.answers = clean_answers(appt.questionnaire, body(request).get("answers"))
    appt.answered_at = timezone.now()
    appt.save(update_fields=["answers", "answered_at", "updated_at"])
    return Response({"ok": True})


@api_view(["POST"])
def cancel_appointment(request, appointment_id):
    """scope = "series" : annule aussi les séances suivantes de la série (celles encore annulables en ligne)."""
    user = require_user(request)
    data = body(request)
    appt = (
        Appointment.objects.filter(id=appointment_id, patient=user, status__in=ACTIVE_STATUSES)
        .select_related("doctor__user", "relative", "patient", "practitioner__user")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable ou déjà annulé")
    if not cancellation_open(appt):
        raise ApiError(
            f"Ce rendez-vous ne peut plus être annulé en ligne (moins de {appt.doctor.cancellation_deadline_hours} h avant). "
            "Contactez directement le cabinet."
        )
    reason = get_str(data, "reason", max_len=300) or ""
    if get_choice(data, "scope", {"one", "series"}, default="one") == "series" and appt.series_id:
        cancelled, kept = cancel_rest_of_series(appt, "patient", reason, only_open=True)
        return Response({"ok": True, "cancelled": len(cancelled), "kept": kept})
    cancel(appt, "patient", reason)
    return Response({"ok": True, "cancelled": 1, "kept": 0})


@api_view(["POST"])
def reschedule_appointment(request, appointment_id):
    """Déplace un rendez-vous vers un autre créneau du même médecin ; il repasse « en attente »."""
    user = require_user(request)
    new_time = parse_datetime(body(request).get("scheduled_at"))
    with transaction.atomic():
        appt = Appointment.objects.filter(id=appointment_id, patient=user).select_related("doctor__user", "patient", "relative").first()
        if not appt:
            raise not_found("Rendez-vous introuvable")
        if not appt.is_active:
            raise ApiError("Ce rendez-vous ne peut plus être déplacé")
        if not cancellation_open(appt):
            raise ApiError("Ce rendez-vous ne peut plus être déplacé en ligne. Contactez directement le cabinet.")
        window = validate_slot(appt.doctor_id, new_time, appt.duration_minutes, ignore_id=str(appt.id), mode=appt.mode)
        old_time = appt.scheduled_at
        appt.scheduled_at = new_time
        appt.status = "pending"
        appt.location_id = None if appt.mode == "home_visit" else window.location_id
        # Le nouvel horaire peut tomber pendant (ou hors de) un remplacement.
        appt.practitioner = replacement_at(appt.doctor_id, new_time)
        appt.save(update_fields=["scheduled_at", "status", "location", "practitioner"])
        # Les rappels planifiés ou envoyés concernaient l'ancien horaire.
        SmsReminder.objects.filter(appointment=appt).delete()
    notify_waitlist(appt.doctor, old_time)
    notifications.appointment_rescheduled(appt)
    return Response({"ok": True})


VIDEO_OPENS_BEFORE = timedelta(minutes=15)
VIDEO_CLOSES_AFTER = timedelta(hours=1)


def _teleconsultation(user, appointment_id) -> tuple[Appointment, bool]:
    appt = (
        Appointment.objects.filter(id=appointment_id).select_related("doctor__user", "patient", "relative", "practitioner__user").first()
    )
    if not appt or appt.mode != "teleconsultation":
        raise not_found("Téléconsultation introuvable")
    # Titulaire ou remplaçant qui assure la consultation.
    is_doctor = appt.doctor.user_id == user.id or bool(appt.practitioner and appt.practitioner.user_id == user.id)
    if appt.patient_id != user.id and not is_doctor:
        raise forbidden()
    if appt.status != "confirmed":
        raise ApiError("Cette téléconsultation n'est pas confirmée" if appt.status == "pending" else "Cette téléconsultation n'est plus disponible")
    return appt, is_doctor


@api_view(["GET"])
def teleconsultation_access(request, appointment_id):
    """
    Salle d'attente virtuelle : le patient signale qu'il est prêt, le médecin ouvre la consultation.
    Le lien de la salle vidéo n'est donné qu'aux bonnes personnes, au bon moment.
    """
    user = require_user(request)
    appt, is_doctor = _teleconsultation(user, appointment_id)
    now = timezone.now()
    opens_at = appt.scheduled_at - VIDEO_OPENS_BEFORE
    open_now = opens_at <= now <= appt.ends_at + VIDEO_CLOSES_AFTER
    paid = appt.payments.filter(status="paid").exists()
    payment_required = appt.doctor.teleconsultation_prepayment and not paid
    started = appt.video_started_at is not None
    can_see_room = open_now and (is_doctor or (started and not payment_required))
    return Response(
        {
            "id": str(appt.id),
            "scheduled_at": iso(appt.scheduled_at),
            "duration_minutes": appt.duration_minutes,
            "doctor_name": appt.practitioner.full_name if appt.practitioner else appt.doctor.full_name,
            "replacing": appt.doctor.full_name if appt.practitioner else None,
            "patient_name": (appt.relative.full_name if appt.relative else None) or (appt.patient.full_name if appt.patient else "Patient"),
            "is_doctor": is_doctor,
            "opens_at": iso(opens_at),
            "open_now": open_now,
            "patient_ready": appt.arrived_at is not None,
            "started": started,
            "payment_required": payment_required,
            "room": appt.teleconsultation_room if can_see_room else None,
        }
    )


@api_view(["POST"])
def teleconsultation_ready(request, appointment_id):
    """Le patient entre en salle d'attente : le médecin est prévenu."""
    user = require_user(request)
    appt, is_doctor = _teleconsultation(user, appointment_id)
    if is_doctor:
        raise ApiError("Réservé au patient")
    if not appt.arrived_at:
        appt.arrived_at = timezone.now()
        appt.save(update_fields=["arrived_at"])
        notifications.notify((appt.practitioner or appt.doctor).user, kind="video_waiting", title="Patient en salle d'attente vidéo",
                             body=f"{appt.patient.full_name if appt.patient else 'Votre patient'} vous attend.", link=f"/teleconsultation/{appt.id}")
    return Response({"ok": True})


@api_view(["POST"])
def teleconsultation_start(request, appointment_id):
    """Le médecin ouvre la consultation : le patient accède à la vidéo."""
    user = require_user(request)
    appt, is_doctor = _teleconsultation(user, appointment_id)
    if not is_doctor:
        raise forbidden()
    if not appt.video_started_at:
        appt.video_started_at = timezone.now()
        appt.save(update_fields=["video_started_at"])
        notifications.notify(appt.patient, kind="video_started", title="Votre médecin vous attend en vidéo",
                             body=(appt.practitioner or appt.doctor).full_name, link=f"/teleconsultation/{appt.id}", sms=True)
    return Response({"ok": True})


# ── Liste d'attente ──────────────────────────────────────────────────


@api_view(["GET"])
def my_waitlist(request):
    user = require_user(request)
    entries = WaitlistEntry.objects.filter(patient=user, status="active").select_related("doctor__specialty").order_by("-created_at")
    return Response(
        [
            {
                "id": str(e.id),
                "doctor_id": str(e.doctor_id),
                "created_at": iso(e.created_at),
                "notified_at": iso(e.notified_at),
                "doctor": {
                    "full_name": e.doctor.full_name,
                    "city": e.doctor.city,
                    "specialty": {"name": e.doctor.specialty.name} if e.doctor.specialty else None,
                },
            }
            for e in entries
        ]
    )


@api_view(["GET"])
def waitlist_entry(request, doctor_id):
    user = require_user(request)
    e = WaitlistEntry.objects.filter(patient=user, doctor_id=doctor_id, status="active").first()
    if not e:
        return Response(None)
    return Response({"id": str(e.id), "status": e.status, "created_at": iso(e.created_at), "notified_at": iso(e.notified_at)})


@api_view(["POST"])
def join_waitlist(request, doctor_id):
    user = require_user(request)
    if not user.phone:
        raise ApiError("Ajoutez votre numéro de téléphone dans « Mon dossier » pour être prévenu.")
    doctor = Doctor.objects.filter(id=doctor_id, is_verified=True).first()
    if not doctor:
        raise not_found("Médecin introuvable")
    WaitlistEntry.objects.update_or_create(patient=user, doctor=doctor, defaults={"status": "active", "notified_at": None})
    return Response({"ok": True})


@api_view(["POST"])
def leave_waitlist(request, doctor_id):
    user = require_user(request)
    WaitlistEntry.objects.filter(patient=user, doctor_id=doctor_id).update(status="closed")
    return Response({"ok": True})


# ── Agenda du médecin ────────────────────────────────────────────────


def doctor_appointment_dict(a: Appointment) -> dict:
    if a.patient:
        patient = {
            "full_name": a.patient.full_name,
            "phone": a.patient.phone or None,
            "city": a.patient.city or None,
            # Pré-remplissage de l'ordonnance (âge, sexe)
            "birth_date": a.patient.birth_date.isoformat() if a.patient.birth_date else None,
            "sex": a.patient.sex or None,
        }
    else:
        patient = {"full_name": a.external_patient_name or "Patient", "phone": a.external_patient_phone or None, "city": None}
    return {
        "id": str(a.id),
        "doctor_id": str(a.doctor_id),
        "scheduled_at": iso(a.scheduled_at),
        "mode": a.mode,
        "status": a.status,
        "reason": a.reason or None,
        "duration_minutes": a.duration_minutes,
        "patient_id": str(a.patient_id) if a.patient_id else None,
        "teleconsultation_room": a.teleconsultation_room or None,
        "external_patient_name": a.external_patient_name or None,
        "external_patient_phone": a.external_patient_phone or None,
        "relative": (
            {
                "full_name": a.relative.full_name,
                "relationship": a.relative.relationship,
                "birth_date": a.relative.birth_date.isoformat() if a.relative.birth_date else None,
                "sex": a.relative.sex or None,
            }
            if a.relative
            else None
        ),
        "consultation_type": {"name": a.consultation_type.name} if a.consultation_type else None,
        "patient": patient,
        "arrived_at": iso(a.arrived_at),
        "cancelled_by": a.cancelled_by or None,
        "cancel_reason": a.cancel_reason or None,
        "paid": any(p.status == "paid" for p in a.payments.all()),
        "location_id": str(a.location_id) if a.location_id else None,
        "insurance": insurance_dict(a),
        "questionnaire": answers_view(a),
        "answered_at": iso(a.answered_at),
        "visit": visit_dict(a),
        "practitioner": practitioner_dict(a),
        "doctor_name": a.doctor.full_name,
        "series": series_dict(a),
    }


@api_view(["GET"])
def doctor_appointments(request):
    """
    Agenda du médecin : ses rendez-vous, et ceux qu'il assure comme remplaçant d'un confrère.
    Tous les RDV à venir + l'historique récent (?past_days=, 90 jours par défaut, 730 au plus) : la réponse
    ne grossit pas avec les années d'activité. L'historique complet d'un patient est sur sa fiche.
    """
    user = require_user(request)
    doctor = Doctor.objects.filter(user=user).first()
    if not doctor:
        return Response([])
    past_days = get_int(request.query_params, "past_days", default=90, min_value=1, max_value=730)
    since = timezone.now() - timedelta(days=past_days)
    appts = (
        Appointment.objects.filter(involves(doctor), scheduled_at__gte=since)
        .exclude(mode="async")
        .select_related("patient", "relative", "consultation_type", "doctor", "practitioner", "series")
        .prefetch_related("payments")
    )
    return Response([doctor_appointment_dict(a) for a in appts])


@api_view(["POST"])
def doctor_update_status(request, appointment_id):
    user = require_user(request)
    doctor = my_doctor(user)
    data = body(request)
    status = get_choice(data, "status", {"pending", "confirmed", "cancelled", "completed", "no_show"})
    appt = (
        Appointment.objects.filter(involves(doctor), id=appointment_id)
        .select_related("patient", "relative", "doctor__user", "practitioner__user")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if status == "cancelled":
        if not appt.is_active:
            raise ApiError("Ce rendez-vous n'est plus actif")
        reason = get_str(data, "reason", max_len=300) or ""
        if get_choice(data, "scope", {"one", "series"}, default="one") == "series" and appt.series_id:
            cancelled, _ = cancel_rest_of_series(appt, "doctor", reason)
            return Response({"ok": True, "cancelled": len(cancelled)})
        cancel(appt, "doctor", reason)
        return Response({"ok": True, "cancelled": 1})
    if status in {"completed", "no_show"} and appt.scheduled_at > timezone.now():
        raise ApiError("Ce rendez-vous n'a pas encore eu lieu")
    previous = appt.status
    if status in ACTIVE_STATUSES and not appt.is_active:
        # Réactiver un rendez-vous annulé : le créneau doit toujours être libre.
        with transaction.atomic():
            assert_no_overlap(appt.doctor_id, appt.scheduled_at, appt.duration_minutes, ignore_id=str(appt.id))
            appt.status = status
            appt.save(update_fields=["status"])
    else:
        appt.status = status
        appt.save(update_fields=["status"])
    if status == "confirmed" and previous != "confirmed":
        notifications.appointment_confirmed(appt)
    return Response({"ok": True})


@api_view(["POST"])
def doctor_mark_arrived(request, appointment_id):
    """Salle d'attente : le patient est arrivé au cabinet (ou annulation de ce marquage)."""
    doctor = my_doctor(require_user(request))
    appt = Appointment.objects.filter(involves(doctor), id=appointment_id, status__in=ACTIVE_STATUSES).first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    appt.arrived_at = None if body(request).get("arrived") is False else timezone.now()
    appt.save(update_fields=["arrived_at"])
    return Response({"ok": True, "arrived_at": iso(appt.arrived_at)})


# ── Agenda tenu par le médecin : RDV saisi, déplacé, patients connus ──


@api_view(["POST"])
def pro_new_appointment(request):
    """RDV pris par le médecin lui-même (téléphone, patient au cabinet), pour un patient connu ou sans compte."""
    from .desk import desk_book

    user = require_user(request)
    doctor = my_doctor(user)
    data = body(request)
    patient = None
    if patient_id := get_uuid(data, "patient_id", required=False):
        from accounts.models import User

        if not Appointment.objects.filter(involves(doctor), patient_id=patient_id).exists():
            raise not_found("Patient introuvable parmi vos patients")
        patient = User.objects.get(id=patient_id)
    appt = desk_book(doctor, user, data, patient)
    return Response({"id": str(appt.id)})


@api_view(["POST"])
def pro_move_appointment(request, appointment_id):
    """{scheduled_at, duration_minutes?} : le cabinet déplace le RDV (le patient est prévenu)."""
    from .desk import move_appointment

    doctor = my_doctor(require_user(request))
    appt = (
        Appointment.objects.filter(involves(doctor), id=appointment_id)
        .select_related("doctor__user", "patient", "relative", "practitioner__user")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    move_appointment(appt, body(request))
    return Response({"ok": True, "scheduled_at": iso(appt.scheduled_at)})


@api_view(["GET"])
def pro_known_patients(request):
    from .desk import known_patients

    doctor = my_doctor(require_user(request))
    return Response(known_patients(doctor, request.query_params.get("q", "")))


# ── Séances répétées (médecin, secrétariat) ──────────────────────────

MAX_REPEAT = 19


def slot_is_free(doctor_id, start, duration_minutes: int) -> bool:
    """Ni rendez-vous actif ni absence sur cette période (au cabinet, les plages d'ouverture ne s'imposent pas)."""
    from directory.models import TimeOff

    end = start + timedelta(minutes=duration_minutes)
    return not (
        Appointment.objects.filter(doctor_id=doctor_id, status__in=ACTIVE_STATUSES, scheduled_at__lt=end, ends_at__gt=start).exists()
        or TimeOff.objects.filter(doctor_id=doctor_id, starts_at__lt=end, ends_at__gt=start).exists()
    )


COPIED_FIELDS = (
    "doctor_id", "patient_id", "relative_id", "external_patient_name", "external_patient_phone", "mode", "reason",
    "consultation_type_id", "duration_minutes", "price", "location_id", "insurer_id", "insurance_member_number",
    "coverage_percent", "tiers_payant", "patient_share", "visit_address", "visit_landmark", "visit_latitude", "visit_longitude",
)


def repeat_appointment(appt: Appointment, count: int, interval_days: int, by_user, channel: str) -> tuple[list[Appointment], list[str]]:
    """
    Programme `count` séances identiques après la dernière séance de la série (ou après ce rendez-vous),
    toutes confirmées. Les horaires déjà pris ou pendant une absence sont sautés et renvoyés.
    """
    if appt.status not in ("pending", "confirmed", "completed"):
        raise ApiError("Ce rendez-vous est annulé : reprenez-en un nouveau")
    if interval_days not in AppointmentSeries.INTERVALS:
        raise ApiError("Rythme des séances invalide")
    created: list[Appointment] = []
    skipped: list[str] = []
    with transaction.atomic():
        series = appt.series
        if series is None:
            series = AppointmentSeries.objects.create(
                doctor=appt.doctor, patient=appt.patient, interval_days=interval_days, requested_count=1, booked_count=1, created_by=by_user
            )
            appt.series, appt.series_index = series, 1
            appt.save(update_fields=["series", "series_index"])
        last = series.appointments.exclude(status="cancelled").order_by("-scheduled_at").first() or appt
        index = max((i for i in series.appointments.values_list("series_index", flat=True) if i), default=1)
        for when in series_dates(last.scheduled_at, count + 1, interval_days)[1:]:
            if not slot_is_free(appt.doctor_id, when, appt.duration_minutes):
                skipped.append(slot_label(when))
                continue
            index += 1
            created.append(
                Appointment.objects.create(
                    **{f: getattr(appt, f) for f in COPIED_FIELDS},
                    scheduled_at=when,
                    status="confirmed",
                    booked_by=by_user,
                    channel=channel,
                    practitioner=replacement_at(appt.doctor_id, when),
                    series=series,
                    series_index=index,
                )
            )
        series.requested_count += count
        series.booked_count += len(created)
        series.interval_days = interval_days
        series.save(update_fields=["requested_count", "booked_count", "interval_days", "updated_at"])
    if created:
        notifications.series_extended(appt, created)
    return created, skipped


def parse_repeat(data: dict) -> tuple[int, int]:
    count = get_int(data, "count", min_value=1, max_value=MAX_REPEAT)
    interval = get_int(data, "interval_days", default=7, min_value=1, max_value=14)
    if count is None:
        raise ApiError("Indiquez le nombre de séances à ajouter")
    return count, interval


@api_view(["POST"])
def doctor_repeat_appointment(request, appointment_id):
    """{count, interval_days} : ajoute des séances à intervalle régulier (ex. 9 séances de plus, chaque semaine)."""
    user = require_user(request)
    doctor = my_doctor(user)
    appt = Appointment.objects.filter(involves(doctor), id=appointment_id).select_related("doctor", "patient", "series").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    count, interval = parse_repeat(body(request))
    created, skipped = repeat_appointment(appt, count, interval, user, appt.channel)
    return Response({"ok": True, "created": len(created), "skipped": skipped})


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@api_view(["GET"])
def appointment_ics(request, appointment_id):
    """Fichier .ics pour ajouter le rendez-vous à son agenda (téléphone, Google, Outlook)."""
    user = require_user(request)
    appt = Appointment.objects.filter(id=appointment_id, patient=user).select_related("doctor", "practitioner", "location").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")

    def fmt(dt):
        return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")

    if appt.mode == "teleconsultation":
        place = "Téléconsultation (lien dans votre espace Fajma)"
    elif appt.mode == "home_visit":
        place = f"À domicile — {appt.visit_address}"
    elif appt.location:
        place = ", ".join(x for x in (appt.location.name, appt.location.address, appt.location.city) if x)
    else:
        place = ", ".join(x for x in (appt.doctor.address, appt.doctor.city) if x)
    if appt.practitioner:
        seen_by = f"{appt.practitioner.full_name} (remplaçant de {appt.doctor.full_name})"
    else:
        seen_by = appt.doctor.full_name
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Fajma//RDV//FR",
        "BEGIN:VEVENT",
        f"UID:{appt.id}@fajma",
        f"DTSTAMP:{fmt(timezone.now())}",
        f"DTSTART:{fmt(appt.scheduled_at)}",
        f"DTEND:{fmt(appt.ends_at)}",
        f"SUMMARY:{_ics_escape('Rendez-vous — ' + seen_by)}",
        f"LOCATION:{_ics_escape(place)}",
        f"DESCRIPTION:{_ics_escape(appt.doctor.booking_instructions or 'Rendez-vous pris sur Fajma.')}",
        "BEGIN:VALARM",
        "TRIGGER:-PT2H",
        "ACTION:DISPLAY",
        "DESCRIPTION:Rappel de rendez-vous",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    response = HttpResponse("\r\n".join(lines) + "\r\n", content_type="text/calendar; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="rdv-fajma-{appt.scheduled_at:%Y%m%d}.ics"'
    return response


@api_view(["GET"])
def appointment_history(request, appointment_id):
    """Historique du rendez-vous (qui l'a pris, déplacé, annulé…) pour le patient concerné."""
    from .history import history

    user = require_user(request)
    appt = Appointment.objects.filter(id=appointment_id, patient=user).select_related("doctor", "practitioner").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    return Response(history(appt, for_patient=True))


@api_view(["GET"])
def doctor_appointment_history(request, appointment_id):
    """Historique complet d'un rendez-vous de l'agenda du médecin (titulaire ou remplaçant)."""
    from .history import history

    doctor = my_doctor(require_user(request))
    appt = Appointment.objects.filter(involves(doctor), id=appointment_id).select_related("doctor", "practitioner").first()
    if not appt:
        raise not_found("Rendez-vous introuvable")
    return Response(history(appt))
