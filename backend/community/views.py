"""API des relais communautaires : personnes suivies, alertes du jour, transfert du dossier, habilitation."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import date, timedelta

from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.models import Relative, User
from accounts.views import require_admin
from appointments.models import ACTIVE_STATUSES, Appointment
from audit import log as audit
from notifications.sms import normalize_phone
from sunusante.api import ApiError, ScopedThrottle, body, forbidden, get_choice, get_str, get_uuid, iso, not_found, require_user

from .models import CommunityAgent, CommunityFollow

TRANSFER_TTL = timedelta(hours=24)


class CommunityThrottle(ScopedThrottle):
    scope = "family"


def require_agent(user) -> CommunityAgent:
    agent = CommunityAgent.objects.filter(user=user, is_active=True).first()
    if not agent:
        raise forbidden("Espace réservé aux relais communautaires habilités par Fajma")
    return agent


def _birth(raw) -> date | None:
    if not raw:
        return None
    try:
        value = date.fromisoformat(str(raw)[:10])
    except ValueError as err:
        raise ApiError("Date de naissance invalide") from err
    if not date(1900, 1, 1) <= value <= timezone.localdate():
        raise ApiError("Date de naissance invalide")
    return value


# ── Alertes ───────────────────────────────────────────────────────────


def alerts_for(r: Relative) -> list[dict]:
    """Ce qui demande une visite ou un appel du relais : tension ou sucre élevés, vaccins en retard, RDV proche."""
    from care.models import Measurement
    from carnet.models import VaccineDose
    from carnet.views import vaccination_status

    out: list[dict] = []
    since = timezone.now() - timedelta(days=30)
    bp = Measurement.objects.filter(relative=r, kind="blood_pressure", measured_at__gte=since).order_by("-measured_at").first()
    if bp and bp.systolic and bp.diastolic:
        if bp.systolic >= 180 or bp.diastolic >= 110:
            out.append({"level": "urgent", "text": f"Tension très élevée ({bp.systolic}/{bp.diastolic}) : orienter vers un médecin aujourd'hui"})
        elif bp.systolic >= 140 or bp.diastolic >= 90:
            out.append({"level": "warning", "text": f"Tension élevée ({bp.systolic}/{bp.diastolic}) : à recontrôler, prévoir une consultation"})
    gl = Measurement.objects.filter(relative=r, kind="glucose", measured_at__gte=since).order_by("-measured_at").first()
    if gl and gl.value is not None:
        if gl.value >= 3 or gl.value < 0.6:
            out.append({"level": "urgent", "text": f"Glycémie anormale ({gl.value} g/L) : orienter vers un médecin aujourd'hui"})
        elif gl.value >= 2 or (gl.context == "fasting" and gl.value >= 1.26):
            out.append({"level": "warning", "text": f"Glycémie élevée ({gl.value} g/L) : prévoir une consultation"})
    if r.birth_date and r.birth_date >= timezone.localdate() - timedelta(days=6 * 365):
        doses = {d.vaccine_code: d for d in VaccineDose.objects.filter(relative=r)}
        late = [v["name"] for v in vaccination_status(r.birth_date, doses) if v["status"] == "late"]
        due = [v["name"] for v in vaccination_status(r.birth_date, doses) if v["status"] == "due"]
        if late:
            out.append({"level": "warning", "text": f"Vaccins en retard : {', '.join(late[:4])}"})
        elif due:
            out.append({"level": "info", "text": f"Vaccins à faire bientôt : {', '.join(due[:4])}"})
    nxt = (
        Appointment.objects.filter(relative=r, status__in=ACTIVE_STATUSES, scheduled_at__gte=timezone.now())
        .select_related("doctor").order_by("scheduled_at").first()
    )
    if nxt and nxt.scheduled_at <= timezone.now() + timedelta(days=2):
        out.append({"level": "info", "text": f"RDV {timezone.localtime(nxt.scheduled_at):%d/%m à %H:%M} avec {nxt.doctor.full_name} : prévenir et accompagner si besoin"})
    return out


def follow_dict(f: CommunityFollow) -> dict:
    r = f.relative
    nxt = None
    if r:
        a = (Appointment.objects.filter(relative=r, status__in=ACTIVE_STATUSES, scheduled_at__gte=timezone.now())
             .select_related("doctor").order_by("scheduled_at").first())
        nxt = {"at": iso(a.scheduled_at), "doctor": a.doctor.full_name} if a else None
    return {
        "id": str(f.id),
        "relative_id": str(r.id) if r else None,
        "full_name": r.full_name if r else f.full_name,
        "birth_date": r.birth_date.isoformat() if r and r.birth_date else None,
        "sex": (r.sex or None) if r else None,
        "phone": (r.phone or None) if r else None,
        "village": f.village or None,
        "notes": f.notes or None,
        "consent_label": f.get_consent_display(),
        "consent_at": iso(f.consent_at),
        "status": f.status,
        "status_label": f.get_status_display(),
        "next_appointment": nxt,
        "alerts": alerts_for(r) if r and f.status == "active" else [],
    }


# ── Relais ────────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@throttle_classes([CommunityThrottle])
def people(request):
    user = require_user(request)
    agent = require_agent(user)
    if request.method == "POST":
        data = body(request)
        if agent.follows.filter(status="active").count() >= agent.max_people:
            raise ApiError(f"Vous suivez déjà {agent.max_people} personnes : demandez à l'équipe Fajma d'augmenter la limite")
        consent = get_choice(data, "consent", {k for k, _ in CommunityFollow.CONSENTS})
        if not consent:
            raise ApiError("L'accord de la personne (ou de son tuteur) est obligatoire")
        name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
        raw_phone = get_str(data, "phone", max_len=30)
        with transaction.atomic():
            rel = Relative.objects.create(
                owner=user, full_name=name, relationship="autre", birth_date=_birth(data.get("birth_date")),
                sex=get_choice(data, "sex", {"", "F", "M"}, default="") or "",
                phone=(normalize_phone(raw_phone) or raw_phone or "") if raw_phone else "",
            )
            f = CommunityFollow.objects.create(
                agent=agent, relative=rel, full_name=name, village=get_str(data, "village", max_len=120) or "",
                consent=consent, consent_witness=get_str(data, "consent_witness", max_len=120) or "",
                consent_at=timezone.now(), notes=get_str(data, "notes", max_len=500) or "",
            )
        audit.log(request, "community_follow", follow=str(f.id), consent=consent)
        return Response(follow_dict(f))
    rows = [follow_dict(f) for f in agent.follows.select_related("relative").exclude(status="ended")]
    rank = {"urgent": 0, "warning": 1, "info": 2}
    rows.sort(key=lambda p: (min([rank[a["level"]] for a in p["alerts"]] or [3]), p["full_name"]))
    return Response({
        "agent": {"organization": agent.organization, "area": agent.area, "max_people": agent.max_people},
        "people": rows,
        "counts": {
            "people": sum(p["status"] == "active" for p in rows),
            "urgent": sum(any(a["level"] == "urgent" for a in p["alerts"]) for p in rows),
            "warning": sum(any(a["level"] == "warning" for a in p["alerts"]) for p in rows),
        },
    })


def _my_follow(user, follow_id) -> tuple[CommunityAgent, CommunityFollow]:
    agent = require_agent(user)
    f = CommunityFollow.objects.filter(id=follow_id, agent=agent).select_related("relative").first()
    if not f:
        raise not_found("Personne introuvable")
    return agent, f


@api_view(["POST"])
def update_person(request, follow_id):
    """{village?, notes?, phone?, full_name?, birth_date?, sex?} ou {end: true} (arrêt du suivi, dossier conservé)."""
    _, f = _my_follow(require_user(request), follow_id)
    data = body(request)
    if f.status != "active":
        raise ApiError("Ce suivi est terminé")
    if data.get("end"):
        f.status, f.ended_at = "ended", timezone.now()
        f.save(update_fields=["status", "ended_at", "updated_at"])
        return Response(follow_dict(f))
    r = f.relative
    if "full_name" in data:
        r.full_name = f.full_name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
    if "birth_date" in data:
        r.birth_date = _birth(data.get("birth_date"))
    if "sex" in data:
        r.sex = get_choice(data, "sex", {"", "F", "M"}, default="") or ""
    if "phone" in data:
        raw = get_str(data, "phone", max_len=30) or ""
        r.phone = normalize_phone(raw) or raw
    r.save()
    for key, size in (("village", 120), ("notes", 500)):
        if key in data:
            setattr(f, key, get_str(data, key, max_len=size) or "")
    f.save()
    return Response(follow_dict(f))


# ── Transfert du dossier à la personne ────────────────────────────────


def _hash(follow_id, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"community:{follow_id}:{code}".encode(), hashlib.sha256).hexdigest()


@api_view(["POST"])
@throttle_classes([CommunityThrottle])
def start_transfer(request, follow_id):
    """{phone} : la personne a maintenant son téléphone ; un code lui est envoyé pour accepter son dossier."""
    from notifications.tasks import queue_sms

    _, f = _my_follow(require_user(request), follow_id)
    if f.status != "active":
        raise ApiError("Ce suivi est terminé")
    phone = normalize_phone(get_str(body(request), "phone", required=True, max_len=30))
    if not phone:
        raise ApiError("Numéro de téléphone invalide")
    code = f"{secrets.randbelow(1_000_000):06d}"
    f.transfer_phone, f.transfer_code_hash = phone, _hash(f.id, code)
    f.transfer_expires_at, f.transfer_attempts = timezone.now() + TRANSFER_TTL, 0
    f.save(update_fields=["transfer_phone", "transfer_code_hash", "transfer_expires_at", "transfer_attempts", "updated_at"])
    queue_sms(phone, f"Fajma — Votre relais santé va vous confier votre dossier médical. Si vous êtes d'accord, "
                     f"donnez-lui ce code : {code}. Vous pourrez ensuite vous connecter avec ce numéro.", essential=True)
    dev = {"dev_code": code} if settings.DEBUG and not settings.TWILIO.get("ACCOUNT_SID") else {}
    return Response({"ok": True, **dev})


def transfer_records(relative: Relative, new_owner) -> int:
    """
    Déplace tout ce qui est rattaché à ce proche vers le compte de la personne : chaque table qui a un champ
    « relative » passe au nouveau titulaire (patient / owner / user) sans proche. Les comptes-rendus suivent
    leurs rendez-vous. Toute nouvelle table liée aux proches est donc couverte automatiquement.
    """
    from medical.models import MedicalRecord

    moved = 0
    appt_ids = list(Appointment.objects.filter(relative=relative).values_list("id", flat=True))
    for model in apps.get_models():
        if model is CommunityFollow:
            continue
        rel_field = next((f for f in model._meta.get_fields() if f.name == "relative" and getattr(f, "related_model", None) is Relative), None)
        if not rel_field:
            continue
        owner_field = next((n for n in ("patient", "owner", "user") if any(f.name == n for f in model._meta.get_fields())), None)
        qs = model.objects.filter(relative=relative)
        if owner_field:
            moved += qs.update(**{owner_field: new_owner, "relative": None})
        else:
            qs.delete()  # ex. rappels de vaccins propres au proche : recréés pour la personne si besoin
    MedicalRecord.objects.filter(appointment_id__in=appt_ids).update(patient=new_owner)
    return moved


@api_view(["POST"])
@throttle_classes([CommunityThrottle])
def confirm_transfer(request, follow_id):
    _, f = _my_follow(require_user(request), follow_id)
    code = get_str(body(request), "code", required=True, max_len=10) or ""
    if f.status != "active" or not f.transfer_expires_at or f.transfer_expires_at < timezone.now():
        raise ApiError("Code expiré : renvoyez un code")
    if f.transfer_attempts >= 5:
        raise ApiError("Trop d'essais : renvoyez un code")
    f.transfer_attempts += 1
    f.save(update_fields=["transfer_attempts", "updated_at"])
    if not hmac.compare_digest(f.transfer_code_hash, _hash(f.id, code.strip())):
        raise ApiError("Code incorrect")
    rel = f.relative
    with transaction.atomic():
        owner = User.objects.filter(phone=f.transfer_phone, phone_verified=True, is_active=True).first()
        if not owner:
            owner = User.objects.filter(phone=f.transfer_phone, is_active=True).first() or User(phone=f.transfer_phone)
            owner.full_name = owner.full_name or rel.full_name
            owner.birth_date = owner.birth_date or rel.birth_date
            owner.sex = owner.sex or rel.sex
            owner.phone_verified = True
            if not owner.pk:
                owner.set_unusable_password()
            owner.save()
        moved = transfer_records(rel, owner)
        f.status, f.transferred_to, f.transfer_code_hash = "transferred", owner, ""
        f.relative = None
        f.save(update_fields=["status", "transferred_to", "transfer_code_hash", "relative", "updated_at"])
        rel.delete()
    from notifications.service import notify

    notify(owner, kind="community", title="Votre dossier Fajma est à vous",
           body="Connectez-vous avec votre numéro (code par SMS) pour voir vos rendez-vous et votre carnet.", link="/mon-espace", sms=True)
    audit.log(request, "community_transfer", follow=str(f.id), moved=moved)
    return Response(follow_dict(f))


# ── Administration ────────────────────────────────────────────────────


@api_view(["GET", "POST"])
def admin_agents(request):
    """GET : relais habilités. POST {email, organization, area, max_people?} : habiliter un compte existant."""
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        email = (get_str(data, "email", required=True, max_len=254) or "").lower()
        target = User.objects.filter(email__iexact=email, is_active=True).first()
        if not target:
            raise not_found("Aucun compte avec cet email (la personne doit d'abord créer son compte)")
        CommunityAgent.objects.update_or_create(
            user=target,
            defaults={"organization": get_str(data, "organization", required=True, min_len=2, max_len=160),
                      "area": get_str(data, "area", required=True, min_len=2, max_len=160), "is_active": True},
        )
        from notifications.service import notify

        notify(target, kind="community", title="Espace relais communautaire activé",
               body="Vous pouvez suivre sur Fajma les personnes de votre quartier, avec leur accord.", link="/relais", email=True)
        audit.log(request, "admin_verification", kind="community_agent", user=str(target.id))
    rows = CommunityAgent.objects.select_related("user").order_by("organization")
    return Response([
        {"id": str(a.id), "full_name": a.user.full_name, "email": a.user.email, "organization": a.organization, "area": a.area,
         "is_active": a.is_active, "people": a.follows.filter(status="active").count(), "max_people": a.max_people}
        for a in rows
    ])


@api_view(["POST"])
def admin_agent(request, agent_id):
    require_admin(request)
    a = CommunityAgent.objects.filter(id=agent_id).first()
    if not a:
        raise not_found("Relais introuvable")
    data = body(request)
    if "is_active" in data:
        a.is_active = bool(data.get("is_active"))
    if "max_people" in data:
        from sunusante.api import get_int

        a.max_people = get_int(data, "max_people", default=a.max_people, min_value=1, max_value=2000)
    a.save()
    return Response({"ok": True})
