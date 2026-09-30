"""
Carnet de santé familial : vaccination des enfants (calendrier PEV) et suivi de grossesse (CPN).
Chaque parent ne voit que son propre carnet et celui de ses proches ; un médecin peut inscrire
une dose faite lors d'un rendez-vous (dose « vérifiée »).
"""

from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import Relative
from appointments.models import Appointment
from appointments.views import my_doctor
from sunusante.api import ApiError, body, get_choice, get_int, get_str, get_uuid, not_found, require_user

from .models import Pregnancy, PrenatalVisit, VaccineDose
from .schedules import CPN_WEEKS, PEV, PEV_BY_CODE, PREGNANCY_DAYS

DUE_SOON_DAYS = 14
# Délai de rattrapage avant d'afficher « en retard » (évite d'alarmer pour quelques jours d'écart).
LATE_AFTER_DAYS = 28


def _parse_date(raw, field: str, *, allow_future: bool = False) -> date:
    try:
        value = date.fromisoformat(str(raw))
    except (TypeError, ValueError) as err:
        raise ApiError(f"Date invalide ({field})") from err
    if not allow_future and value > timezone.localdate():
        raise ApiError(f"La date ({field}) ne peut pas être dans le futur")
    return value


def vaccination_status(birth: date | None, doses: dict[str, VaccineDose]) -> list[dict]:
    today = timezone.localdate()
    items = []
    for d in PEV:
        given = doses.get(d.code)
        due = birth + timedelta(days=d.age_days) if birth else None
        if given:
            status = "done"
        elif not due:
            status = "unknown"
        elif due < today - timedelta(days=LATE_AFTER_DAYS):
            status = "late"
        elif due <= today + timedelta(days=DUE_SOON_DAYS):
            status = "due"
        else:
            status = "upcoming"
        items.append(
            {
                "code": d.code,
                "name": d.name,
                "age_label": d.age_label,
                "due_date": due.isoformat() if due else None,
                "status": status,
                "given_on": given.given_on.isoformat() if given else None,
                "verified": bool(given and given.recorded_by_doctor_id),
                "dose_id": str(given.id) if given else None,
            }
        )
    return items


def pregnancy_dict(p: Pregnancy) -> dict:
    today = timezone.localdate()
    done = {v.contact: v for v in p.visits.all()}
    days = (today - p.last_period).days
    visits = []
    for i, week in enumerate(CPN_WEEKS, 1):
        v = done.get(i)
        target = p.last_period + timedelta(weeks=week)
        visits.append(
            {
                "contact": i,
                "week": week,
                "target_date": target.isoformat(),
                "done_on": v.done_on.isoformat() if v and v.done_on else None,
                "status": "done" if v and v.done_on else ("late" if target < today - timedelta(days=7) else "todo"),
            }
        )
    return {
        "id": str(p.id),
        "status": p.status,
        "last_period": p.last_period.isoformat(),
        "due_date": (p.last_period + timedelta(days=PREGNANCY_DAYS)).isoformat(),
        "weeks": days // 7,
        "days": days % 7,
        "ended_on": p.ended_on.isoformat() if p.ended_on else None,
        "visits": visits,
    }


@api_view(["GET"])
def my_carnet(request):
    user = require_user(request)
    doses = list(VaccineDose.objects.filter(owner=user))
    people = [{"id": None, "full_name": user.full_name, "relationship": "moi", "birth_date": None}]
    people += [
        {"id": str(r.id), "full_name": r.full_name, "relationship": r.relationship, "birth_date": r.birth_date.isoformat() if r.birth_date else None}
        for r in Relative.objects.filter(owner=user)
    ]
    for person in people:
        rid = person["id"]
        mine = {d.vaccine_code: d for d in doses if (str(d.relative_id) if d.relative_id else None) == rid}
        birth = date.fromisoformat(person["birth_date"]) if person["birth_date"] else None
        person["vaccinations"] = vaccination_status(birth, mine)
    pregnancies = Pregnancy.objects.filter(owner=user).prefetch_related("visits")
    return Response({"people": people, "pregnancies": [pregnancy_dict(p) for p in pregnancies]})


def _relative_or_none(user, data) -> Relative | None:
    relative_id = get_uuid(data, "relative_id", required=False)
    if not relative_id:
        return None
    relative = Relative.objects.filter(id=relative_id, owner=user).first()
    if not relative:
        raise not_found("Proche introuvable")
    return relative


@api_view(["POST"])
def record_dose(request):
    user = require_user(request)
    data = body(request)
    code = get_choice(data, "vaccine_code", set(PEV_BY_CODE))
    relative = _relative_or_none(user, data)
    given_on = _parse_date(data.get("given_on"), "vaccination")
    if relative and relative.birth_date and given_on < relative.birth_date:
        raise ApiError("La date du vaccin ne peut pas précéder la naissance")
    try:
        with transaction.atomic():
            VaccineDose.objects.create(owner=user, relative=relative, vaccine_code=code, given_on=given_on, notes=get_str(data, "notes", max_len=200) or "")
    except IntegrityError as err:
        raise ApiError("Cette dose est déjà inscrite dans le carnet") from err
    return Response({"ok": True})


@api_view(["POST"])
def delete_dose(request, dose_id):
    user = require_user(request)
    dose = VaccineDose.objects.filter(id=dose_id, owner=user).first()
    if not dose:
        raise not_found("Dose introuvable")
    if dose.recorded_by_doctor_id:
        raise ApiError("Dose inscrite par un médecin : demandez-lui de la corriger")
    dose.delete()
    return Response({"ok": True})


@api_view(["POST"])
def start_pregnancy(request):
    user = require_user(request)
    last_period = _parse_date(body(request).get("last_period"), "dernières règles")
    if (timezone.localdate() - last_period).days > PREGNANCY_DAYS + 21:
        raise ApiError("Date des dernières règles trop ancienne")
    try:
        with transaction.atomic():
            p = Pregnancy.objects.create(owner=user, last_period=last_period)
    except IntegrityError as err:
        raise ApiError("Un suivi de grossesse est déjà en cours") from err
    return Response(pregnancy_dict(p))


def _my_pregnancy(user, pregnancy_id) -> Pregnancy:
    p = Pregnancy.objects.filter(id=pregnancy_id, owner=user).first()
    if not p:
        raise not_found("Suivi introuvable")
    return p


@api_view(["POST"])
def record_visit(request, pregnancy_id):
    user = require_user(request)
    p = _my_pregnancy(user, pregnancy_id)
    data = body(request)
    contact = get_int(data, "contact", min_value=1, max_value=len(CPN_WEEKS))
    done_on = _parse_date(data.get("done_on"), "consultation")
    if done_on < p.last_period:
        raise ApiError("La consultation ne peut pas précéder le début de la grossesse")
    PrenatalVisit.objects.update_or_create(pregnancy=p, contact=contact, defaults={"done_on": done_on})
    return Response(pregnancy_dict(p))


@api_view(["POST"])
def end_pregnancy(request, pregnancy_id):
    """Fin du suivi. En cas de naissance, l'enfant est ajouté aux proches : son carnet de vaccination démarre."""
    user = require_user(request)
    p = _my_pregnancy(user, pregnancy_id)
    if p.status != "active":
        raise ApiError("Ce suivi est déjà terminé")
    data = body(request)
    outcome = get_choice(data, "outcome", {"birth", "other"})
    ended_on = _parse_date(data.get("ended_on") or timezone.localdate().isoformat(), "fin")
    with transaction.atomic():
        if outcome == "birth":
            name = get_str(data, "child_name", required=True, min_len=2, max_len=120)
            p.child = Relative.objects.create(owner=user, full_name=name, relationship="enfant", birth_date=ended_on)
        p.status, p.ended_on = "ended", ended_on
        p.save()
    return Response({**pregnancy_dict(p), "child_id": str(p.child_id) if p.child_id else None})


@api_view(["POST"])
def doctor_record_dose(request, appointment_id):
    """Le médecin inscrit une dose faite pendant la consultation (pour le patient ou l'enfant concerné)."""
    doctor = my_doctor(require_user(request))
    appt = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id, status__in=("confirmed", "completed"))
        .exclude(patient=None)
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable")
    data = body(request)
    code = get_choice(data, "vaccine_code", set(PEV_BY_CODE))
    given_on = _parse_date(data.get("given_on") or timezone.localdate().isoformat(), "vaccination")
    if appt.relative and appt.relative.birth_date and given_on < appt.relative.birth_date:
        raise ApiError("La date du vaccin ne peut pas précéder la naissance")
    dose, created = VaccineDose.objects.get_or_create(
        owner=appt.patient,
        relative=appt.relative,
        vaccine_code=code,
        defaults={"given_on": given_on, "recorded_by_doctor": doctor},
    )
    if not created:
        # Une saisie familiale est confirmée (et corrigée) par le médecin.
        dose.given_on, dose.recorded_by_doctor = given_on, doctor
        dose.save(update_fields=["given_on", "recorded_by_doctor", "updated_at"])
    return Response({"ok": True, "vaccine": PEV_BY_CODE[code].name})


@api_view(["GET"])
def vaccine_catalog(request):
    return Response([{"code": d.code, "name": d.name, "age_label": d.age_label} for d in PEV])
