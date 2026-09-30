"""Espace médecin : fiche professionnelle, disponibilités, motifs de consultation."""

from datetime import time, timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.models import Appointment, WaitlistEntry
from appointments.scheduling import parse_datetime
from payments.models import Payment
from appointments.views import my_doctor
from sunusante.api import ApiError, body, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from .models import ConsultationType, Doctor, DoctorAvailability, DoctorLocation, Specialty, TimeOff
from .serializers import location_dict, photo_url
from .serializers import consultation_type_dict


@api_view(["GET", "POST"])
def my_doctor_profile(request):
    user = require_user(request)
    if request.method == "GET":
        d = Doctor.objects.filter(user=user).select_related("specialty").first()
        if not d:
            return Response(None)
        return Response(
            {
                "id": str(d.id),
                "full_name": d.full_name,
                "city": d.city,
                "address": d.address or None,
                "bio": d.bio or None,
                "years_experience": d.years_experience,
                "consultation_price": d.consultation_price,
                "currency": d.currency,
                "teleconsultation": d.teleconsultation,
                "languages": d.languages,
                "avatar_url": photo_url(d),
                "is_verified": d.is_verified,
                "latitude": d.latitude,
                "longitude": d.longitude,
                **settings_dict(d),
                "specialty": {"id": str(d.specialty.id), "slug": d.specialty.slug, "name": d.specialty.name} if d.specialty else None,
            }
        )

    # Création de la fiche : elle reste invisible tant qu'un administrateur ne l'a pas vérifiée.
    if Doctor.objects.filter(user=user).exists():
        raise ApiError("Vous avez déjà une fiche médecin")
    data = body(request)
    specialty = Specialty.objects.filter(id=get_uuid(data, "specialty_id")).first()
    if not specialty:
        raise ApiError("Spécialité inconnue")
    doctor = Doctor.objects.create(
        user=user,
        full_name=get_str(data, "full_name", required=True, min_len=2, max_len=120),
        specialty=specialty,
        city=get_str(data, "city", required=True, min_len=2, max_len=80),
        address=get_str(data, "address", max_len=200) or "",
        bio=get_str(data, "bio", max_len=1000) or "",
        years_experience=get_int(data, "years_experience", default=0, min_value=0, max_value=70),
        consultation_price=get_int(data, "consultation_price", default=15000, min_value=0, max_value=10_000_000),
        teleconsultation=bool(data.get("teleconsultation")),
        languages=["Français"],
        is_verified=False,
    )
    locate_doctor(doctor)
    return Response({"id": str(doctor.id)})


def locate_doctor(doctor: Doctor, *, force: bool = False) -> None:
    """Position du cabinet (recherche par quartier, « autour de moi », carte) déduite de l'adresse et de la ville."""
    from . import localities

    if doctor.latitude is not None and not force:
        return
    loc = localities.locate_address(doctor.address, doctor.city)
    if loc:
        Doctor.objects.filter(pk=doctor.pk).update(latitude=loc.latitude, longitude=loc.longitude)
        doctor.latitude, doctor.longitude = loc.latitude, loc.longitude


LANGUAGES = ["Français", "Wolof", "Pulaar", "Serere", "Diola", "Mandinka", "Soninké", "Anglais", "Arabe", "Portugais", "Espagnol"]


@api_view(["POST"])
def edit_my_doctor_profile(request):
    """
    Modification de la fiche publique. Le nom et la spécialité ne changent plus une fois la fiche vérifiée
    (ils ont été contrôlés sur les justificatifs) : le médecin passe alors par l'équipe Fajma.
    Un nouveau tarif ne change pas le prix des rendez-vous déjà pris.
    """
    from audit import log as audit

    doctor = my_doctor(require_user(request))
    data = body(request)
    before = {"full_name": doctor.full_name, "specialty_id": str(doctor.specialty_id), "consultation_price": doctor.consultation_price}
    place_before = (doctor.address, doctor.city)
    if "full_name" in data:
        name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
        if doctor.is_verified and name != doctor.full_name:
            raise ApiError("Votre fiche est vérifiée : pour changer de nom, contactez l'équipe Fajma avec un justificatif.")
        doctor.full_name = name
    if data.get("specialty_id"):
        specialty = Specialty.objects.filter(id=get_uuid(data, "specialty_id")).first()
        if not specialty:
            raise ApiError("Spécialité inconnue")
        if doctor.is_verified and specialty.id != doctor.specialty_id:
            raise ApiError("Votre fiche est vérifiée : pour changer de spécialité, contactez l'équipe Fajma avec votre diplôme.")
        doctor.specialty = specialty
    if "bio" in data:
        doctor.bio = get_str(data, "bio", max_len=1000) or ""
    if "years_experience" in data:
        doctor.years_experience = get_int(data, "years_experience", min_value=0, max_value=70)
    if "consultation_price" in data:
        doctor.consultation_price = get_int(data, "consultation_price", min_value=0, max_value=10_000_000)
    if "teleconsultation" in data:
        doctor.teleconsultation = bool(data.get("teleconsultation"))
    if "languages" in data:
        langs = data.get("languages")
        if not isinstance(langs, list) or not langs or any(lang not in LANGUAGES for lang in langs):
            raise ApiError("Choisissez au moins une langue dans la liste")
        doctor.languages = list(dict.fromkeys(langs))
    if "city" in data:
        doctor.city = get_str(data, "city", required=True, min_len=2, max_len=80)
    if "address" in data:
        doctor.address = get_str(data, "address", max_len=200) or ""
    if "latitude" in data or "longitude" in data:
        lat, lng = _coord(data, "latitude", -90, 90), _coord(data, "longitude", -180, 180)
        if (lat is None) != (lng is None):
            raise ApiError("Coordonnées incomplètes")
        doctor.latitude, doctor.longitude = lat, lng
    doctor.save()
    if "latitude" not in data and (doctor.address, doctor.city) != place_before:
        locate_doctor(doctor, force=True)  # adresse changée : nouvelle position
    after = {"full_name": doctor.full_name, "specialty_id": str(doctor.specialty_id), "consultation_price": doctor.consultation_price}
    audit.log(request, "doctor_profile_updated", changed=[k for k in before if before[k] != after[k]])
    return my_doctor_profile_payload(doctor)


def my_doctor_profile_payload(doctor: Doctor) -> Response:
    doctor.refresh_from_db()
    return Response({"ok": True, "avatar_url": photo_url(doctor)})


MAX_PHOTO_BYTES = 2_000_000


@api_view(["POST"])
def my_doctor_photo(request):
    """{content_base64} : photo de profil (JPEG, PNG ou WebP, 2 Mo au plus) ; vide = retrait."""
    import base64
    import binascii

    from sunusante.uploads import sniff, store

    doctor = my_doctor(require_user(request))
    raw = body(request).get("content_base64") or ""
    if not raw:
        doctor.photo_path = ""
    else:
        try:
            content = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError) as err:
            raise ApiError("Image illisible") from err
        kind = sniff(content)
        if not kind or not kind[0].startswith("image/"):
            raise ApiError("Envoyez une photo (JPEG, PNG ou WebP)")
        if len(content) > MAX_PHOTO_BYTES:
            raise ApiError("Photo trop lourde (2 Mo au plus)")
        doctor.photo_path = store(f"photos/{doctor.id}", f"photo{kind[1]}", content)
    doctor.save(update_fields=["photo_path", "updated_at"])
    return Response({"avatar_url": photo_url(doctor)})


# ── Disponibilités ───────────────────────────────────────────────────


def _parse_time(value) -> time:
    try:
        h, m = str(value).split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError) as err:
        raise ApiError("Heure invalide") from err


@api_view(["GET", "POST"])
def my_availability(request):
    user = require_user(request)
    if request.method == "GET":
        doctor = Doctor.objects.filter(user=user).first()
        if not doctor:
            return Response([])
        return Response(
            [
                {
                    "id": str(a.id),
                    "weekday": a.weekday,
                    "start_time": a.start_time.strftime("%H:%M:%S"),
                    "end_time": a.end_time.strftime("%H:%M:%S"),
                    "slot_minutes": a.slot_minutes,
                    "location_id": str(a.location_id) if a.location_id else None,
                    "kind": a.kind,
                }
                for a in doctor.availability.all()
            ]
        )
    doctor = my_doctor(user)
    data = body(request)
    # Plusieurs jours d'un coup (« du lundi au vendredi, 9 h – 13 h ») ou un seul (ancien format).
    raw_days = data.get("weekdays") if isinstance(data.get("weekdays"), list) else [data.get("weekday")]
    weekdays = sorted({_weekday(d) for d in raw_days})
    if not weekdays:
        raise ApiError("Choisissez au moins un jour")
    fields = _availability_fields(doctor, data)
    for weekday in weekdays:
        _check_overlap(doctor, weekday, fields["start_time"], fields["end_time"])
    with transaction.atomic():
        for weekday in weekdays:
            DoctorAvailability.objects.create(doctor=doctor, weekday=weekday, **fields)
    return Response({"ok": True, "created": len(weekdays)})


DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]


def _weekday(value) -> int:
    try:
        day = int(value)
    except (TypeError, ValueError) as err:
        raise ApiError("Jour invalide") from err
    if not 0 <= day <= 6:
        raise ApiError("Jour invalide")
    return day


def _availability_fields(doctor, data: dict) -> dict:
    start, end = _parse_time(data.get("start_time")), _parse_time(data.get("end_time"))
    if end <= start:
        raise ApiError("L'heure de fin doit être après l'heure de début")
    slot = get_int(data, "slot_minutes", default=30, min_value=10, max_value=240)
    if (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute) < slot:
        raise ApiError("La plage est plus courte qu'un créneau")
    kind = get_choice(data, "kind", {"office", "home_visit"}, default="office")
    location = None
    if data.get("location_id") and kind == "office":
        location = DoctorLocation.objects.filter(id=get_uuid(data, "location_id"), doctor=doctor).first()
        if not location:
            raise ApiError("Lieu inconnu")
    return {"start_time": start, "end_time": end, "slot_minutes": slot, "kind": kind, "location": location}


def _check_overlap(doctor, weekday: int, start, end, exclude=None) -> None:
    """Un médecin ne peut pas être à deux endroits : deux plages du même jour ne se chevauchent pas."""
    clash = (
        DoctorAvailability.objects.filter(doctor=doctor, weekday=weekday, start_time__lt=end, end_time__gt=start)
        .exclude(id=exclude)
        .first()
    )
    if clash:
        raise ApiError(
            f"Chevauche la plage du {DAY_NAMES[weekday]} {clash.start_time:%H:%M} – {clash.end_time:%H:%M} : "
            "modifiez-la ou choisissez d'autres horaires."
        )


@api_view(["POST"])
def update_availability(request, availability_id):
    doctor = my_doctor(require_user(request))
    plage = DoctorAvailability.objects.filter(id=availability_id, doctor=doctor).first()
    if not plage:
        raise not_found("Plage introuvable")
    data = body(request)
    weekday = _weekday(data["weekday"]) if "weekday" in data else plage.weekday
    fields = _availability_fields(doctor, data)
    _check_overlap(doctor, weekday, fields["start_time"], fields["end_time"], exclude=plage.id)
    for key, value in fields.items():
        setattr(plage, key, value)
    plage.weekday = weekday
    plage.save()
    return Response({"ok": True})


@api_view(["POST"])
def delete_availability(request, availability_id):
    doctor = my_doctor(require_user(request))
    deleted, _ = DoctorAvailability.objects.filter(id=availability_id, doctor=doctor).delete()
    if not deleted:
        raise not_found("Plage introuvable")
    return Response({"ok": True})


# ── Motifs de consultation ───────────────────────────────────────────


@api_view(["GET", "POST"])
def my_consultation_types(request):
    doctor = my_doctor(require_user(request))
    if request.method == "GET":
        return Response([consultation_type_dict(t) for t in doctor.consultation_types.all()])
    data = body(request)
    ConsultationType.objects.create(
        doctor=doctor,
        name=get_str(data, "name", required=True, min_len=2, max_len=120),
        duration_minutes=get_int(data, "duration_minutes", min_value=5, max_value=240),
        price=get_int(data, "price", min_value=0, max_value=10_000_000),
        mode=get_choice(data, "mode", {"in_person", "teleconsultation", "both", "home_visit"}, default="both"),
        series_max=get_int(data, "series_max", default=0, min_value=0, max_value=20),
    )
    return Response({"ok": True})


@api_view(["POST"])
def update_consultation_type(request, type_id):
    """{is_active?, series_max?} : activer/désactiver le motif, autoriser la réservation en série."""
    doctor = my_doctor(require_user(request))
    ctype = ConsultationType.objects.filter(id=type_id, doctor=doctor).first()
    if not ctype:
        raise not_found("Motif introuvable")
    data = body(request)
    if "is_active" in data:
        ctype.is_active = bool(data.get("is_active"))
    if "series_max" in data:
        ctype.series_max = get_int(data, "series_max", min_value=0, max_value=20)
    ctype.save()
    return Response({"ok": True})


@api_view(["POST"])
def delete_consultation_type(request, type_id):
    doctor = my_doctor(require_user(request))
    deleted, _ = ConsultationType.objects.filter(id=type_id, doctor=doctor).delete()
    if not deleted:
        raise not_found("Motif introuvable")
    return Response({"ok": True})


@api_view(["GET"])
def my_waitlist_count(request):
    doctor = my_doctor(require_user(request))
    return Response(WaitlistEntry.objects.filter(doctor=doctor, status="active").count())


# ── Règles de réservation ────────────────────────────────────────────


def settings_dict(d: Doctor) -> dict:
    return {
        "auto_confirm": d.auto_confirm,
        "min_notice_hours": d.min_notice_hours,
        "booking_horizon_days": d.booking_horizon_days,
        "accepts_new_patients": d.accepts_new_patients,
        "cancellation_deadline_hours": d.cancellation_deadline_hours,
        "booking_instructions": d.booking_instructions,
        "teleconsultation_prepayment": d.teleconsultation_prepayment,
        "home_visits": d.home_visits,
        "home_visit_fee": d.home_visit_fee,
        "home_visit_area": d.home_visit_area,
    }


@api_view(["GET", "POST"])
def my_settings(request):
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        doctor.auto_confirm = bool(data.get("auto_confirm", doctor.auto_confirm))
        doctor.accepts_new_patients = bool(data.get("accepts_new_patients", doctor.accepts_new_patients))
        doctor.teleconsultation_prepayment = bool(data.get("teleconsultation_prepayment", doctor.teleconsultation_prepayment))
        doctor.min_notice_hours = get_int(data, "min_notice_hours", default=doctor.min_notice_hours, min_value=0, max_value=168)
        doctor.booking_horizon_days = get_int(data, "booking_horizon_days", default=doctor.booking_horizon_days, min_value=1, max_value=180)
        doctor.cancellation_deadline_hours = get_int(
            data, "cancellation_deadline_hours", default=doctor.cancellation_deadline_hours, min_value=0, max_value=168
        )
        if "booking_instructions" in data:
            doctor.booking_instructions = get_str(data, "booking_instructions", max_len=1000) or ""
        doctor.home_visits = bool(data.get("home_visits", doctor.home_visits))
        doctor.home_visit_fee = get_int(data, "home_visit_fee", default=doctor.home_visit_fee, min_value=0, max_value=1_000_000)
        if "home_visit_area" in data:
            doctor.home_visit_area = get_str(data, "home_visit_area", max_len=300) or ""
        doctor.save()
    return Response(settings_dict(doctor))


# ── Absences (congés, formation…) ────────────────────────────────────


@api_view(["GET", "POST"])
def my_time_off(request):
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        starts, ends = parse_datetime(data.get("starts_at")), parse_datetime(data.get("ends_at"))
        if ends <= starts:
            raise ApiError("La fin de l'absence doit être après son début")
        if ends - starts > timedelta(days=120):
            raise ApiError("Absence trop longue (4 mois maximum)")
        TimeOff.objects.create(doctor=doctor, starts_at=starts, ends_at=ends, reason=get_str(data, "reason", max_len=120) or "")
        conflicts = Appointment.objects.filter(
            doctor=doctor, status__in=("pending", "confirmed"), scheduled_at__lt=ends, ends_at__gt=starts
        ).count()
        return Response({"ok": True, "conflicting_appointments": conflicts})
    return Response(
        [
            {"id": str(t.id), "starts_at": iso(t.starts_at), "ends_at": iso(t.ends_at), "reason": t.reason or None}
            for t in doctor.time_off.filter(ends_at__gte=timezone.now())
        ]
    )


@api_view(["POST"])
def delete_time_off(request, time_off_id):
    doctor = my_doctor(require_user(request))
    deleted, _ = TimeOff.objects.filter(id=time_off_id, doctor=doctor).delete()
    if not deleted:
        raise not_found("Absence introuvable")
    return Response({"ok": True})


# ── Statistiques ─────────────────────────────────────────────────────


@api_view(["GET"])
def my_stats(request):
    """Activité des 30 derniers jours et des 7 prochains jours."""
    doctor = my_doctor(require_user(request))
    now = timezone.now()
    past = Appointment.objects.filter(doctor=doctor, scheduled_at__gte=now - timedelta(days=30), scheduled_at__lt=now)
    counts = past.aggregate(
        total=Count("id"),
        completed=Count("id", filter=Q(status="completed")),
        no_show=Count("id", filter=Q(status="no_show")),
        cancelled=Count("id", filter=Q(status="cancelled")),
    )
    attended = counts["completed"] + counts["no_show"]
    revenue = (
        Payment.objects.filter(appointment__doctor=doctor, status="paid", paid_at__gte=now - timedelta(days=30)).aggregate(s=Sum("amount"))["s"]
        or 0
    )
    patients = past.exclude(patient=None).values("patient").distinct().count()
    first_visits = (
        past.exclude(patient=None)
        .filter(status="completed")
        .exclude(patient__in=Appointment.objects.filter(doctor=doctor, scheduled_at__lt=now - timedelta(days=30), status="completed").values("patient"))
        .values("patient")
        .distinct()
        .count()
    )
    upcoming = Appointment.objects.filter(doctor=doctor, status__in=("pending", "confirmed"), scheduled_at__gte=now, scheduled_at__lt=now + timedelta(days=7))
    return Response(
        {
            "last_30_days": {
                **counts,
                "no_show_rate": round(100 * counts["no_show"] / attended) if attended else 0,
                "revenue_paid": revenue,
                "patients": patients,
                "new_patients": first_visits,
            },
            "next_7_days": {
                "total": upcoming.count(),
                "pending": upcoming.filter(status="pending").count(),
                "teleconsultations": upcoming.filter(mode="teleconsultation").count(),
            },
        }
    )


# ── Lieux de consultation ────────────────────────────────────────────


def _coord(data, key, lo, hi):
    value = data.get(key)
    if value in (None, ""):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError) as err:
        raise ApiError("Coordonnées invalides") from err
    if not lo <= value <= hi:
        raise ApiError("Coordonnées invalides")
    return value


@api_view(["GET", "POST"])
def my_locations(request):
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        DoctorLocation.objects.create(
            doctor=doctor,
            name=get_str(data, "name", required=True, min_len=2, max_len=120),
            address=get_str(data, "address", required=True, min_len=2, max_len=200),
            city=get_str(data, "city", required=True, min_len=2, max_len=80),
            phone=get_str(data, "phone", max_len=30) or "",
            latitude=_coord(data, "latitude", -90, 90),
            longitude=_coord(data, "longitude", -180, 180),
        )
    return Response([location_dict(loc) for loc in doctor.locations.all()])


@api_view(["POST"])
def delete_location(request, location_id):
    doctor = my_doctor(require_user(request))
    deleted, _ = DoctorLocation.objects.filter(id=location_id, doctor=doctor).delete()
    if not deleted:
        raise not_found("Lieu introuvable")
    return Response({"ok": True})


@api_view(["GET", "POST"])
def my_questionnaires(request):
    """
    GET : questionnaire par défaut et questionnaires propres à chaque motif.
    POST {consultation_type_id?: uuid, questions: [...]} : remplace le questionnaire visé.
    """
    from appointments.questionnaire import clean_questions

    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        questions = clean_questions(data.get("questions"))
        type_id = get_uuid(data, "consultation_type_id", required=False)
        if type_id:
            updated = ConsultationType.objects.filter(id=type_id, doctor=doctor).update(questionnaire=questions)
            if not updated:
                raise not_found("Motif introuvable")
        else:
            doctor.questionnaire = questions
            doctor.save(update_fields=["questionnaire", "updated_at"])
    return Response(
        {
            "default": doctor.questionnaire or [],
            "types": [
                {"id": str(t.id), "name": t.name, "questions": t.questionnaire or []}
                for t in doctor.consultation_types.filter(is_active=True)
            ],
        }
    )


# ── En-tête des ordonnances : identité professionnelle, signature, cachet ──


def prescription_header_dict(d: Doctor) -> dict:
    from medical.issuer import issuer_public, missing_mentions

    images = issuer_public({"signature_path": d.signature_path, "stamp_path": d.stamp_path})
    return {
        "order_number": d.order_number,
        "professional_title": d.professional_title,
        "practice_name": d.practice_name,
        "practice_phone": d.practice_phone,
        "address": d.address,
        "city": d.city,
        "signature": images["signature"],
        "stamp": images["stamp"],
        "missing": missing_mentions(d),
    }


@api_view(["GET", "POST"])
def my_prescription_header(request):
    """
    GET : en-tête actuel. POST : textes ({order_number, professional_title, practice_name, practice_phone,
    address, city}) ou image ({image: "signature"|"stamp", content_base64} ; content_base64 vide = retrait).
    """
    import base64
    import binascii

    from medical.issuer import IMAGE_TYPES, MAX_IMAGE_BYTES
    from sunusante.uploads import sniff, store

    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        image = data.get("image")
        if image is not None:
            field = {"signature": "signature_path", "stamp": "stamp_path"}.get(image)
            if not field:
                raise ApiError("Image inconnue")
            raw = data.get("content_base64") or ""
            if not raw:
                setattr(doctor, field, "")  # l'ancien fichier est conservé pour les documents déjà émis
            else:
                try:
                    content = base64.b64decode(raw, validate=True)
                except (binascii.Error, ValueError) as err:
                    raise ApiError("Image illisible") from err
                kind = sniff(content)
                if not kind or kind[0] not in IMAGE_TYPES:
                    raise ApiError("Envoyez une image PNG ou JPEG")
                if len(content) > MAX_IMAGE_BYTES:
                    raise ApiError("Image trop lourde (1 Mo au plus)")
                setattr(doctor, field, store(f"signatures/{doctor.id}", f"{image}{kind[1]}", content))
            doctor.save(update_fields=[field, "updated_at"])
        else:
            doctor.order_number = get_str(data, "order_number", max_len=40) or ""
            doctor.professional_title = get_str(data, "professional_title", max_len=160) or ""
            doctor.practice_name = get_str(data, "practice_name", max_len=160) or ""
            doctor.practice_phone = get_str(data, "practice_phone", max_len=30) or ""
            doctor.address = get_str(data, "address", max_len=200) or ""
            doctor.city = get_str(data, "city", required=True, min_len=2, max_len=80)
            doctor.save()
    return Response(prescription_header_dict(doctor))


# ── Guide de démarrage ───────────────────────────────────────────────


@api_view(["GET"])
def my_onboarding(request):
    """Étapes pour être opérationnel sur Fajma, dans l'ordre, avec l'onglet de l'espace médecin où les faire."""
    from accounts.security import mfa_enabled
    from medical.issuer import missing_mentions

    from .models import DoctorCredential

    user = require_user(request)
    doctor = my_doctor(user)
    creds = DoctorCredential.objects.filter(doctor=doctor)
    missing = missing_mentions(doctor)
    steps = [
        {
            "id": "profile",
            "title": "Compléter ma fiche publique",
            "hint": "Photo, présentation et adresse du cabinet : c'est ce que les patients voient avant de réserver.",
            "tab": "profil",
            "done": bool(doctor.photo_path and doctor.bio and doctor.address),
        },
        {
            "id": "credential",
            "title": "Déposer mon inscription à l'Ordre des médecins",
            "hint": "Obligatoire pour que l'équipe Fajma publie votre fiche.",
            "tab": "profil",
            "done": creds.exists(),
        },
        {
            "id": "schedule",
            "title": "Définir mon emploi du temps",
            "hint": "Vos plages de consultation : sans elles, aucun rendez-vous en ligne.",
            "tab": "planning",
            "done": doctor.availability.exists(),
        },
        {
            "id": "types",
            "title": "Vérifier mes motifs et tarifs",
            "hint": "Consultation, suivi, téléconsultation… avec leur durée et leur prix.",
            "tab": "planning",
            "done": doctor.consultation_types.filter(is_active=True).exists(),
        },
        {
            "id": "prescription",
            "title": "Compléter l'en-tête de mes ordonnances",
            "hint": "N° d'Ordre, cabinet et signature : indispensables pour délivrer ordonnances et certificats.",
            "tab": "ordonnances",
            "done": not missing,
        },
        {
            "id": "mfa",
            "title": "Sécuriser mon compte",
            "hint": "Double authentification : obligatoire, vous accédez à des données de santé.",
            "tab": "securite",
            "done": mfa_enabled(user),
        },
        {
            "id": "published",
            "title": "Fiche validée par Fajma",
            "hint": (
                "Votre fiche est en ligne : les patients peuvent vous trouver et réserver."
                if doctor.is_verified
                else "L'équipe Fajma vérifie votre justificatif ; vous êtes prévenu par SMS et email dès la mise en ligne."
            ),
            "tab": None,
            "done": doctor.is_verified,
        },
    ]
    return Response({"steps": steps, "done": sum(s["done"] for s in steps), "total": len(steps)})
