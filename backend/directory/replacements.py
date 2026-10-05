"""
Remplacements entre médecins : le titulaire propose une période à un confrère vérifié, qui accepte ou refuse.
Pendant un remplacement accepté, l'agenda du titulaire reste ouvert : chaque rendez-vous de la période est
assuré par le remplaçant (Appointment.practitioner), qui consulte, rédige et signe à son propre nom.
"""

from datetime import UTC, date, datetime, time, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.models import ACTIVE_STATUSES, Appointment
from appointments.views import my_doctor
from notifications import service as notifications
from sunusante.api import ApiError, body, forbidden, get_str, get_uuid, iso, not_found, require_user

from .models import Doctor, Replacement

MAX_DAYS = 365


def _parse_day(value, label: str) -> date:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError) as err:
        raise ApiError(f"Date de {label} invalide") from err


def _period(data: dict) -> tuple[datetime, datetime]:
    """Du premier jour 00:00 au lendemain du dernier jour 00:00 (heure du Sénégal = UTC)."""
    first, last = _parse_day(data.get("starts_on"), "début"), _parse_day(data.get("ends_on"), "fin")
    if last < first:
        raise ApiError("La fin du remplacement doit être après son début")
    if first < timezone.localdate():
        raise ApiError("Le remplacement ne peut pas commencer dans le passé")
    if (last - first).days + 1 > MAX_DAYS:
        raise ApiError("Remplacement trop long (un an au plus)")
    return datetime.combine(first, time(0), tzinfo=UTC), datetime.combine(last + timedelta(days=1), time(0), tzinfo=UTC)


def replacement_dict(r: Replacement) -> dict:
    return {
        "id": str(r.id),
        "status": r.status,
        "starts_at": iso(r.starts_at),
        "ends_at": iso(r.ends_at),
        # Dernier jour inclus, pour l'affichage.
        "starts_on": r.starts_at.date().isoformat(),
        "ends_on": (r.ends_at - timedelta(days=1)).date().isoformat(),
        "note": r.note or None,
        "responded_at": iso(r.responded_at),
        "doctor": _doctor_brief(r.doctor),
        "replacement": _doctor_brief(r.replacement),
        "appointments": Appointment.objects.filter(
            doctor=r.doctor, status__in=ACTIVE_STATUSES, scheduled_at__gte=r.starts_at, scheduled_at__lt=r.ends_at
        ).count(),
        "ongoing": r.status == "accepted" and r.starts_at <= timezone.now() < r.ends_at,
    }


def _doctor_brief(d: Doctor) -> dict:
    return {
        "id": str(d.id),
        "full_name": d.full_name,
        "city": d.city,
        "specialty": d.specialty.name if d.specialty else None,
        "order_number": d.order_number or None,
    }


def _period_appointments(r: Replacement):
    return Appointment.objects.filter(
        doctor=r.doctor, status__in=ACTIVE_STATUSES, scheduled_at__gte=r.starts_at, scheduled_at__lt=r.ends_at
    ).select_related("patient", "relative", "doctor", "practitioner")


def public_replacements(doctor: Doctor) -> list[dict]:
    """Remplacements acceptés, en cours ou à venir, affichés sur la fiche publique du titulaire."""
    return [
        {
            "starts_on": r.starts_at.date().isoformat(),
            "ends_on": (r.ends_at - timedelta(days=1)).date().isoformat(),
            "replacement": {
                "id": str(r.replacement.id),
                "full_name": r.replacement.full_name,
                "specialty": r.replacement.specialty.name if r.replacement.specialty else None,
            },
        }
        for r in Replacement.objects.filter(doctor=doctor, status="accepted", ends_at__gt=timezone.now()).select_related(
            "replacement__specialty"
        )
    ]


@api_view(["GET", "POST"])
def my_replacements(request):
    """
    GET : remplacements que j'ai proposés (titulaire) et ceux qu'on me propose (remplaçant).
    POST {replacement_doctor_id, starts_on, ends_on, note?} : proposer un remplacement à un confrère.
    """
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        data = body(request)
        if not doctor.is_verified:
            raise ApiError("Votre fiche doit être vérifiée avant de vous faire remplacer")
        substitute = Doctor.objects.filter(id=get_uuid(data, "replacement_doctor_id"), is_verified=True).exclude(user=None).first()
        if not substitute:
            raise not_found("Médecin introuvable (il doit avoir une fiche vérifiée sur Fajma)")
        if substitute.id == doctor.id:
            raise ApiError("Vous ne pouvez pas être votre propre remplaçant")
        starts_at, ends_at = _period(data)
        if Replacement.objects.filter(
            doctor=doctor, status__in=("pending", "accepted"), starts_at__lt=ends_at, ends_at__gt=starts_at
        ).exists():
            raise ApiError("Un remplacement est déjà prévu ou proposé sur cette période")
        r = Replacement.objects.create(
            doctor=doctor, replacement=substitute, starts_at=starts_at, ends_at=ends_at, note=get_str(data, "note", max_len=300) or ""
        )
        notifications.replacement_proposed(r)
        return Response(replacement_dict(r))
    recent = timezone.now() - timedelta(days=60)
    qs = Replacement.objects.filter(ends_at__gte=recent).select_related("doctor__specialty", "replacement__specialty")
    return Response(
        {
            "given": [replacement_dict(r) for r in qs.filter(doctor=doctor)],
            "received": [replacement_dict(r) for r in qs.filter(replacement=doctor)],
        }
    )


@api_view(["POST"])
def respond_replacement(request, replacement_id):
    """Le remplaçant accepte ({accept: true}) ou refuse la proposition."""
    doctor = my_doctor(require_user(request))
    accept = bool(body(request).get("accept"))
    with transaction.atomic():
        r = (
            Replacement.objects.select_for_update(of=("self",))  # verrou sur cette ligne seulement (jointures facultatives)
            .filter(id=replacement_id, replacement=doctor)
            .select_related("doctor__user", "replacement__user")
            .first()
        )
        if not r:
            raise not_found("Proposition introuvable")
        if r.status != "pending":
            raise ApiError("Cette proposition a déjà reçu une réponse")
        if r.ends_at <= timezone.now():
            raise ApiError("Cette période est terminée")
        r.status = "accepted" if accept else "declined"
        r.responded_at = timezone.now()
        r.save(update_fields=["status", "responded_at", "updated_at"])
        moved = []
        if accept:
            # Les rendez-vous déjà pris sur la période seront assurés par le remplaçant.
            moved = list(_period_appointments(r).exclude(practitioner=doctor))
            Appointment.objects.filter(id__in=[a.id for a in moved]).update(practitioner=doctor, updated_at=timezone.now())
    notifications.replacement_answered(r, len(moved))
    for a in moved:
        a.practitioner = doctor
        notifications.practitioner_changed(a)
    return Response(replacement_dict(r))


@api_view(["POST"])
def cancel_replacement(request, replacement_id):
    """Le titulaire ou le remplaçant annule un remplacement pas encore terminé."""
    user = require_user(request)
    doctor = my_doctor(user)
    with transaction.atomic():
        r = (
            Replacement.objects.select_for_update(of=("self",))  # verrou sur cette ligne seulement (jointures facultatives)
            .filter(Q(doctor=doctor) | Q(replacement=doctor), id=replacement_id)
            .select_related("doctor__user", "replacement__user")
            .first()
        )
        if not r:
            raise not_found("Remplacement introuvable")
        if r.status not in ("pending", "accepted"):
            raise ApiError("Ce remplacement n'est plus actif")
        if r.ends_at <= timezone.now():
            raise forbidden("Ce remplacement est terminé")
        was_accepted = r.status == "accepted"
        r.status = "cancelled"
        r.save(update_fields=["status", "updated_at"])
        # Rendez-vous encore à venir : ils reviennent au titulaire (les consultations passées restent au remplaçant).
        back = []
        if was_accepted:
            back = list(
                _period_appointments(r).filter(practitioner=r.replacement, scheduled_at__gte=timezone.now())
            )
            Appointment.objects.filter(id__in=[a.id for a in back]).update(practitioner=None, updated_at=timezone.now())
    notifications.replacement_cancelled(r, by_titular=r.doctor_id == doctor.id, returned=len(back))
    for a in back:
        a.practitioner = None
        notifications.practitioner_changed(a)
    return Response({"ok": True, "returned_appointments": len(back)})


def covered_titulars(doctor: Doctor) -> list:
    """
    Titulaires que ce médecin remplace en ce moment (ou a remplacés il y a moins de 30 jours) : pendant le
    remplacement, il lit leurs comptes-rendus et ordonnances pour assurer la continuité des soins.
    """
    now = timezone.now()
    return list(
        Replacement.objects.filter(
            replacement=doctor, status="accepted", starts_at__lte=now + timedelta(days=1), ends_at__gte=now - timedelta(days=30)
        ).values_list("doctor_id", flat=True)
    )
