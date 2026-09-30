"""
Agenda tenu par le cabinet (médecin, remplaçant, secrétariat de cabinet ou de clinique) : rendez-vous pris au
téléphone ou au guichet, déplacement d'un rendez-vous. Contrairement au patient, le cabinet n'est pas limité aux
plages d'ouverture en ligne ; il ne peut en revanche ni chevaucher un autre rendez-vous ni réserver pendant une absence.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from directory.models import ConsultationType, Doctor, TimeOff
from notifications import service as notifications
from notifications.models import SmsReminder
from sunusante.api import ApiError, get_choice, get_int, get_str, get_uuid

from .models import ACTIVE_STATUSES, Appointment
from .scheduling import notify_waitlist, parse_datetime, replacement_at, slot_label


def check_free(doctor_id, start, duration_minutes: int, ignore_id=None) -> None:
    end = start + timedelta(minutes=duration_minutes)
    busy = Appointment.objects.filter(doctor_id=doctor_id, status__in=ACTIVE_STATUSES, scheduled_at__lt=end, ends_at__gt=start)
    if ignore_id:
        busy = busy.exclude(id=ignore_id)
    if busy.exists():
        raise ApiError("Ce créneau chevauche un autre rendez-vous", 409)
    if TimeOff.objects.filter(doctor_id=doctor_id, starts_at__lt=end, ends_at__gt=start).exists():
        raise ApiError("Le médecin est absent à cet horaire (absence déclarée)")


def _future(start) -> None:
    if start < timezone.now() - timedelta(minutes=5):
        raise ApiError("Cet horaire est déjà passé")
    if start > timezone.now() + timedelta(days=365):
        raise ApiError("Cet horaire est trop éloigné (un an au plus)")


def desk_book(doctor: Doctor, by_user, data: dict, patient=None) -> Appointment:
    """
    RDV saisi par le cabinet : patient inscrit (déjà connu) ou patient sans compte (nom, téléphone).
    Confirmé d'emblée. Motif facultatif : il fixe la durée par défaut et le tarif.
    """
    from .views import clean_visit

    scheduled_at = parse_datetime(data.get("scheduled_at"))
    _future(scheduled_at)
    mode = get_choice(data, "mode", {"in_person", "teleconsultation", "home_visit"}, default="in_person")
    if mode == "home_visit" and not doctor.home_visits:
        raise ApiError("Ce médecin ne fait pas de visites à domicile")
    if mode == "teleconsultation" and not doctor.teleconsultation:
        raise ApiError("Ce médecin ne propose pas la téléconsultation")
    ctype = None
    if type_id := get_uuid(data, "consultation_type_id", required=False):
        ctype = ConsultationType.objects.filter(id=type_id, doctor=doctor).first()
        if not ctype:
            raise ApiError("Motif de consultation inconnu")
    duration = get_int(data, "duration_minutes", default=ctype.duration_minutes if ctype else 30, min_value=5, max_value=240)
    price = (ctype.price if ctype else doctor.consultation_price) + (doctor.home_visit_fee if mode == "home_visit" else 0)
    visit = clean_visit(data) if mode == "home_visit" else {}
    with transaction.atomic():
        check_free(doctor.id, scheduled_at, duration)
        appt = Appointment.objects.create(
            doctor=doctor,
            patient=patient,
            external_patient_name="" if patient else get_str(data, "patient_name", required=True, min_len=2, max_len=120),
            external_patient_phone="" if patient else (get_str(data, "patient_phone", max_len=30) or ""),
            scheduled_at=scheduled_at,
            duration_minutes=duration,
            mode=mode,
            reason=get_str(data, "reason", max_len=500) or "",
            consultation_type=ctype,
            status="confirmed",
            booked_by=by_user,
            channel="clinic",
            price=price,
            practitioner=replacement_at(doctor.id, scheduled_at),
            **visit,
        )
    if patient:
        notifications.appointment_confirmed(appt)
    return appt


def move_appointment(appt: Appointment, data: dict) -> Appointment:
    """Déplacement par le cabinet (le patient a appelé) : reste confirmé, patient prévenu, ancien créneau libéré."""
    if not appt.is_active:
        raise ApiError("Ce rendez-vous n'est plus actif")
    new_time = parse_datetime(data.get("scheduled_at"))
    _future(new_time)
    duration = get_int(data, "duration_minutes", default=appt.duration_minutes, min_value=5, max_value=240)
    if new_time == appt.scheduled_at and duration == appt.duration_minutes:
        raise ApiError("Choisissez un autre horaire")
    old_time = appt.scheduled_at
    with transaction.atomic():
        Appointment.objects.select_for_update().filter(id=appt.id).first()
        check_free(appt.doctor_id, new_time, duration, ignore_id=appt.id)
        appt.scheduled_at, appt.duration_minutes = new_time, duration
        appt.practitioner = replacement_at(appt.doctor_id, new_time)
        appt.arrived_at = None
        appt.save(update_fields=["scheduled_at", "duration_minutes", "practitioner", "arrived_at"])
        # Les rappels planifiés ou envoyés concernaient l'ancien horaire.
        SmsReminder.objects.filter(appointment=appt).delete()
    notify_waitlist(appt.doctor, old_time)
    notifications.appointment_moved_by_practice(appt, old_time)
    return appt


def known_patients(doctor: Doctor, query: str, limit: int = 20) -> list[dict]:
    """Patients déjà vus ou attendus par ce médecin (comptes Fajma et patients sans compte), pour une nouvelle saisie."""
    appts = Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor)).select_related("patient").order_by("-scheduled_at")
    q = (query or "").strip().lower()
    digits = "".join(c for c in q if c.isdigit())
    seen, rows = set(), []
    for a in appts[:2000]:
        if a.patient_id:
            key, name, phone = f"u:{a.patient_id}", a.patient.full_name or "Patient", a.patient.phone or ""
        else:
            key, name, phone = f"x:{a.external_patient_phone or a.external_patient_name.lower()}", a.external_patient_name, a.external_patient_phone
        if key in seen or name == "Patient anonymisé":
            continue
        if q and q not in name.lower() and not (len(digits) >= 4 and digits in "".join(c for c in phone if c.isdigit())):
            continue
        seen.add(key)
        rows.append({"patient_id": str(a.patient_id) if a.patient_id else None, "name": name, "phone": phone or None,
                     "last_visit": slot_label(a.scheduled_at)})
        if len(rows) >= limit:
            break
    return rows
