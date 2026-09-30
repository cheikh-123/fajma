"""Espace clinique : établissement, équipe médicale, secrétariat, agenda partagé, RDV au guichet."""

from datetime import timedelta

from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from appointments.models import Appointment
from appointments.desk import desk_book, move_appointment
from appointments.scheduling import parse_datetime
from appointments.views import cancel, cancel_rest_of_series, parse_repeat, repeat_appointment
from notifications import service as notifications
from directory.models import Doctor
from sunusante.api import ApiError, body, forbidden, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from .models import Clinic, ClinicMember, ClinicStaff


def clinic_access(user, clinic_id) -> tuple[Clinic, bool]:
    """Renvoie la clinique si l'utilisateur en est responsable ou membre du secrétariat."""
    clinic = Clinic.objects.filter(id=clinic_id).first()
    if not clinic:
        raise not_found("Clinique introuvable")
    is_owner = clinic.owner_id == user.id
    if not is_owner and not ClinicStaff.objects.filter(clinic=clinic, user=user).exists():
        raise forbidden("Accès refusé à cette clinique")
    return clinic, is_owner


def clinic_dict(clinic: Clinic, access: str) -> dict:
    members = clinic.members.select_related("doctor__specialty")
    data = {
        "id": str(clinic.id),
        "name": clinic.name,
        "city": clinic.city,
        "address": clinic.address or None,
        "phone": clinic.phone or None,
        "description": clinic.description or None,
        "is_verified": clinic.is_verified,
        "access": access,
        "members": [
            {
                "id": str(m.id),
                "title": m.title,
                "doctor": {
                    "id": str(m.doctor.id),
                    "full_name": m.doctor.full_name,
                    "city": m.doctor.city,
                    "specialty": {"name": m.doctor.specialty.name} if m.doctor.specialty else None,
                },
            }
            for m in members
        ],
        "staff": [],
    }
    if access == "owner":
        data["staff"] = [
            {"id": str(s.id), "user_id": str(s.user_id), "role": s.role, "full_name": s.user.full_name or s.user.email, "phone": s.user.phone or None}
            for s in clinic.staff.select_related("user")
        ]
    return data


@api_view(["GET", "POST"])
def my_clinic(request):
    user = require_user(request)
    if request.method == "GET":
        owned = Clinic.objects.filter(owner=user).first()
        if owned:
            return Response(clinic_dict(owned, "owner"))
        membership = ClinicStaff.objects.filter(user=user).select_related("clinic").first()
        if not membership:
            return Response(None)
        return Response(clinic_dict(membership.clinic, membership.role))
    if Clinic.objects.filter(owner=user).exists():
        raise ApiError("Vous gérez déjà un établissement")
    data = body(request)
    clinic = Clinic.objects.create(
        owner=user,
        name=get_str(data, "name", required=True, min_len=2, max_len=160),
        city=get_str(data, "city", required=True, min_len=2, max_len=80),
        address=get_str(data, "address", max_len=240) or "",
        phone=get_str(data, "phone", max_len=30) or "",
        description=get_str(data, "description", max_len=1500) or "",
    )
    return Response({"id": str(clinic.id)})


@api_view(["POST"])
def update_clinic(request, clinic_id):
    """Informations de l'établissement (responsable uniquement)."""
    user = require_user(request)
    clinic, is_owner = clinic_access(user, clinic_id)
    if not is_owner:
        raise forbidden("Seul le responsable peut modifier l'établissement")
    data = body(request)
    if "name" in data:
        clinic.name = get_str(data, "name", required=True, min_len=2, max_len=160)
    if "city" in data:
        clinic.city = get_str(data, "city", required=True, min_len=2, max_len=80)
    for field, max_len in (("address", 240), ("phone", 30), ("description", 1500)):
        if field in data:
            setattr(clinic, field, get_str(data, field, max_len=max_len) or "")
    clinic.save()
    return Response(clinic_dict(clinic, "owner"))


@api_view(["POST"])
def remove_member(request, clinic_id, member_id):
    """Retire un médecin de l'équipe : le responsable, ou le médecin lui-même qui quitte l'établissement."""
    user = require_user(request)
    clinic = Clinic.objects.filter(id=clinic_id).first()
    member = ClinicMember.objects.filter(id=member_id, clinic=clinic).select_related("doctor__user").first()
    if not clinic or not member:
        raise not_found("Médecin introuvable dans cet établissement")
    leaving = member.doctor.user_id == user.id
    if clinic.owner_id != user.id and not leaving:
        raise forbidden("Seul le responsable peut modifier l'équipe")
    member.delete()
    if not leaving:
        notifications.notify(member.doctor.user, kind="clinic", title="Retiré d'un établissement",
                             body=f"{clinic.name} vous a retiré de son équipe : son secrétariat n'a plus accès à votre agenda.", link="/pro")
    return Response({"ok": True})


# ── Secrétariat d'un médecin qui exerce seul ─────────────────────────


def _own_practice(user, doctor, create: bool = False) -> Clinic | None:
    """Cabinet du médecin (créé en coulisses) : même outil que les cliniques, sans le mot « clinique »."""
    clinic = Clinic.objects.filter(owner=user).first()
    if clinic is None and create:
        clinic = Clinic.objects.create(
            owner=user,
            name=doctor.practice_name or f"Cabinet {doctor.full_name}",
            city=doctor.city,
            address=doctor.address,
            phone=doctor.practice_phone,
            is_verified=doctor.is_verified,
            kind="practice",
        )
    if clinic is not None:
        ClinicMember.objects.get_or_create(clinic=clinic, doctor=doctor, defaults={"title": "Médecin"})
    return clinic


@api_view(["GET", "POST"])
def doctor_secretariat(request):
    """
    GET : mes secrétaires. POST {email} : donne à cette personne (compte Fajma existant) l'accès à mon agenda :
    prise de RDV au guichet ou au téléphone, confirmation, annulation, fichier patients.
    """
    from appointments.views import my_doctor

    user = require_user(request)
    doctor = my_doctor(user)
    if request.method == "POST":
        email = (get_str(body(request), "email", required=True, max_len=254) or "").lower()
        target = User.objects.filter(email=email, is_active=True).first()
        if not target:
            raise ApiError("Aucun compte Fajma avec cet email. La personne doit d'abord créer son compte (gratuit).")
        if target.id == user.id:
            raise ApiError("Indiquez l'email de votre secrétaire, pas le vôtre")
        clinic = _own_practice(user, doctor, create=True)
        if ClinicStaff.objects.filter(clinic=clinic, user=target).exists():
            raise ApiError("Cette personne fait déjà partie de votre secrétariat")
        ClinicStaff.objects.create(clinic=clinic, user=target, role="secretary")
        notifications.notify(target, kind="clinic", title="Accès secrétariat",
                             body=f"{doctor.full_name} vous a donné accès à son agenda.", link="/clinique", email=True)
    clinic = _own_practice(user, doctor)
    others = ClinicMember.objects.filter(doctor=doctor).exclude(clinic__owner=user).select_related("clinic")
    return Response(
        {
            "practice": {"id": str(clinic.id), "name": clinic.name} if clinic else None,
            "secretaries": [
                {"id": str(s.id), "full_name": s.user.full_name or s.user.email, "email": s.user.email, "phone": s.user.phone or None}
                for s in (clinic.staff.select_related("user") if clinic else [])
            ],
            # Établissements dont le médecin fait partie (il peut les quitter).
            "other_clinics": [{"clinic_id": str(m.clinic_id), "member_id": str(m.id), "name": m.clinic.name} for m in others],
        }
    )


# ── Pages publiques des établissements ───────────────────────────────


def public_clinic_dict(clinic: Clinic, *, with_doctors: bool = False) -> dict:
    from appointments.scheduling import next_available
    from directory.serializers import doctor_dict

    doctors = [m.doctor for m in clinic.members.select_related("doctor__specialty") if m.doctor.is_verified]
    data = {
        "id": str(clinic.id),
        "name": clinic.name,
        "city": clinic.city,
        "address": clinic.address or None,
        "phone": clinic.phone or None,
        "description": clinic.description or None,
        "doctors_count": len(doctors),
        "specialties": sorted({d.specialty.name for d in doctors if d.specialty}),
    }
    if with_doctors:
        data["doctors"] = [{**doctor_dict(d), "next_slot": next_available(d.id)} for d in doctors]
    return data


@api_view(["GET"])
def public_clinics(request):
    """Cliniques et centres de santé vérifiés (les cabinets individuels ont la fiche de leur médecin)."""
    qs = Clinic.objects.filter(is_verified=True, kind="clinic").prefetch_related("members__doctor__specialty")
    if city := (request.query_params.get("city") or "").strip():
        qs = qs.filter(city__icontains=city)
    if q := (request.query_params.get("q") or "").strip():
        qs = qs.filter(name__icontains=q)
    return Response([c for c in (public_clinic_dict(c) for c in qs[:100]) if c["doctors_count"]])


@api_view(["GET"])
def public_clinic(request, clinic_id):
    clinic = Clinic.objects.filter(id=clinic_id, is_verified=True, kind="clinic").first()
    if not clinic:
        raise not_found("Établissement introuvable")
    return Response(public_clinic_dict(clinic, with_doctors=True))


@api_view(["GET"])
def candidates(request):
    require_user(request)
    return Response(
        [
            {"id": str(d.id), "full_name": d.full_name, "city": d.city, "specialty": {"name": d.specialty.name} if d.specialty else None}
            for d in Doctor.objects.filter(is_verified=True).select_related("specialty").order_by("full_name")[:200]
        ]
    )


@api_view(["POST"])
def add_member(request, clinic_id):
    user = require_user(request)
    clinic, is_owner = clinic_access(user, clinic_id)
    if not is_owner:
        raise forbidden("Seul le responsable peut modifier l'équipe")
    data = body(request)
    doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id"), is_verified=True).first()
    if not doctor:
        raise not_found("Médecin introuvable")
    if ClinicMember.objects.filter(clinic=clinic, doctor=doctor).exists():
        raise ApiError("Ce médecin fait déjà partie de l'équipe")
    ClinicMember.objects.create(clinic=clinic, doctor=doctor, title=get_str(data, "title", max_len=100) or "Médecin")
    return Response({"ok": True})


@api_view(["POST"])
def add_staff(request, clinic_id):
    user = require_user(request)
    clinic, is_owner = clinic_access(user, clinic_id)
    if not is_owner:
        raise forbidden("Seul le responsable de la clinique peut ajouter du personnel")
    data = body(request)
    email = (get_str(data, "email", required=True, max_len=254) or "").lower()
    target = User.objects.filter(email=email).first()
    if not target:
        raise ApiError("Aucun compte Fajma avec cet email. La personne doit d'abord créer son compte.")
    if target.id == user.id:
        raise ApiError("Vous êtes déjà responsable de cette clinique")
    # Vérification préalable : une erreur d'unicité rattrapée laisserait la transaction de la requête inutilisable.
    if ClinicStaff.objects.filter(clinic=clinic, user=target).exists():
        raise ApiError("Cette personne fait déjà partie de l'équipe")
    ClinicStaff.objects.create(clinic=clinic, user=target, role=get_choice(data, "role", {"secretary", "manager"}, default="secretary"))
    notifications.notify(target, kind="clinic", title="Accès à l'établissement",
                         body=f"{clinic.name} vous a ajouté à son équipe.", link="/clinique", email=True)
    return Response({"ok": True})


@api_view(["POST"])
def remove_staff(request, staff_id):
    user = require_user(request)
    staff = ClinicStaff.objects.filter(id=staff_id, clinic__owner=user).select_related("user", "clinic").first()
    if not staff:
        raise not_found("Membre introuvable")
    staff.delete()
    notifications.notify(staff.user, kind="clinic", title="Accès retiré",
                         body=f"Vous n'avez plus accès à l'agenda de {staff.clinic.name}.", link="/mon-espace")
    return Response({"ok": True})


@api_view(["GET"])
def agenda(request, clinic_id):
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    start = parse_datetime(request.query_params.get("from"))
    days = get_int(request.query_params, "days", default=7, min_value=1, max_value=31)
    appts = (
        Appointment.objects.filter(
            doctor__clinic_memberships__clinic=clinic, scheduled_at__gte=start, scheduled_at__lt=start + timedelta(days=days)
        )
        .select_related("doctor", "patient", "relative", "consultation_type", "practitioner", "series")
        .order_by("scheduled_at")
    )
    return Response(
        [
            {
                "id": str(a.id),
                "doctor_id": str(a.doctor_id),
                "patient_id": str(a.patient_id) if a.patient_id else None,
                "scheduled_at": iso(a.scheduled_at),
                "duration_minutes": a.duration_minutes,
                "mode": a.mode,
                "status": a.status,
                "reason": a.reason or None,
                "doctor": {"full_name": a.doctor.full_name},
                "consultation_type": {"name": a.consultation_type.name} if a.consultation_type else None,
                "patient_name": (a.relative.full_name if a.relative else None)
                or (a.patient.full_name if a.patient else None)
                or a.external_patient_name
                or "Patient",
                "patient_phone": (a.patient.phone if a.patient else None) or a.external_patient_phone or None,
                "walk_in": a.patient_id is None,
                "practitioner": {"full_name": a.practitioner.full_name} if a.practitioner else None,
                "visit": {"address": a.visit_address, "landmark": a.visit_landmark or None} if a.mode == "home_visit" else None,
                "series": {"index": a.series_index, "total": a.series.booked_count} if a.series else None,
            }
            for a in appts
        ]
    )


@api_view(["POST"])
def book(request, clinic_id):
    """RDV pris au guichet ou au téléphone, y compris pour un patient sans compte."""
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    data = body(request)
    doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id"), clinic_memberships__clinic=clinic).first()
    if not doctor:
        raise ApiError("Ce médecin n'exerce pas dans votre clinique")
    # Patient déjà inscrit et connu de la clinique (choisi dans le fichier) : le RDV apparaît dans son espace.
    patient = None
    if patient_id := get_uuid(data, "patient_id", required=False):
        from .patients import clinic_patient

        patient = clinic_patient(clinic, patient_id)
    appt = desk_book(doctor, user, data, patient)
    return Response({"id": str(appt.id)})


@api_view(["POST"])
def move(request, clinic_id, appointment_id):
    """{scheduled_at, duration_minutes?} : le secrétariat déplace un RDV (le patient est prévenu)."""
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    appt = (
        Appointment.objects.filter(id=appointment_id, doctor__clinic_memberships__clinic=clinic)
        .select_related("doctor__user", "patient", "relative", "practitioner__user")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    move_appointment(appt, body(request))
    return Response({"ok": True})


@api_view(["POST"])
def update_appointment(request, clinic_id, appointment_id):
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    data = body(request)
    status = get_choice(data, "status", {"confirmed", "cancelled", "completed", "no_show"})
    appt = (
        Appointment.objects.filter(id=appointment_id, doctor__clinic_memberships__clinic=clinic)
        .select_related("doctor__user", "patient", "relative")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    if status == "cancelled":
        if not appt.is_active:
            raise ApiError("Ce rendez-vous n'est plus actif")
        reason = get_str(data, "reason", max_len=300) or ""
        if get_choice(data, "scope", {"one", "series"}, default="one") == "series" and appt.series_id:
            cancelled, _ = cancel_rest_of_series(appt, "clinic", reason)
            return Response({"ok": True, "cancelled": len(cancelled)})
        cancel(appt, "clinic", reason)
        return Response({"ok": True, "cancelled": 1})
    previous = appt.status
    appt.status = status
    appt.save(update_fields=["status"])
    if status == "confirmed" and previous != "confirmed":
        notifications.appointment_confirmed(appt)
    return Response({"ok": True})


@api_view(["POST"])
def repeat(request, clinic_id, appointment_id):
    """Séances répétées prises au guichet : {count, interval_days}."""
    user = require_user(request)
    clinic, _ = clinic_access(user, clinic_id)
    appt = (
        Appointment.objects.filter(id=appointment_id, doctor__clinic_memberships__clinic=clinic)
        .select_related("doctor", "patient", "series")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    count, interval = parse_repeat(body(request))
    created, skipped = repeat_appointment(appt, count, interval, user, "clinic")
    return Response({"ok": True, "created": len(created), "skipped": skipped})
