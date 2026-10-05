"""Comptes : authentification par session (cookie HttpOnly), profil, dossier, proches, back-office."""

from django.conf import settings

from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from notifications.tasks import queue_email
from django.db import IntegrityError
from datetime import timedelta

from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from appointments.models import Appointment
from clinics.models import Clinic
from directory.models import Doctor, Pharmacy, Review
from labs.models import Laboratory
from medical.models import MedicalRecord, Prescription
from notifications.models import SmsReminder
from payments.models import Payment
from sunusante.api import ApiError, ScopedThrottle, body, forbidden, get_choice, get_str, get_uuid, iso, not_found, require_user

from audit import log as audit

from . import totp
from .models import Relative, TwoFactor, User


class AuthThrottle(ScopedThrottle):
    scope = "auth"


def enforce_csrf(request) -> None:
    """
    DRF ne vérifie le CSRF que pour les utilisateurs déjà connectés. Pour la connexion,
    l'inscription et la réinitialisation, on l'impose explicitement (anti « login CSRF »).
    """
    SessionAuthentication().enforce_csrf(request)


def user_dict(user: User, session=None) -> dict:
    from .security import is_professional, needs_mfa_setup

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone or None,
        "city": user.city or None,
        "is_admin": user.is_staff,
        "is_doctor": Doctor.objects.filter(user=user).exists(),
        "is_pharmacist": user.pharmacy_memberships.exists(),
        "is_lab": user.lab_memberships.exists(),
        # Responsable ou secrétariat d'un établissement : arrive sur l'agenda de la clinique.
        "is_clinic_staff": Clinic.objects.filter(owner=user).exists() or user.clinic_roles.exists(),
        "mfa_enabled": TwoFactor.objects.filter(user=user, enabled=True).exists(),
        "phone_verified": user.phone_verified,
        "preferred_language": user.preferred_language,
        "is_professional": is_professional(user),
        # Compte professionnel sans double authentification : il doit l'activer avant d'aller plus loin.
        "mfa_setup_required": needs_mfa_setup(user, session),
        "has_password": user.has_usable_password(),
    }


# ── Authentification ─────────────────────────────────────────────────


@ensure_csrf_cookie
@api_view(["GET"])
def csrf(request):
    """Dépose le cookie CSRF que le navigateur renverra dans l'en-tête X-CSRFToken."""
    return Response({"ok": True})


@api_view(["GET"])
def me(request):
    if not request.user.is_authenticated:
        return Response({"user": None})
    return Response({"user": user_dict(request.user, request.session)})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def register(request):
    enforce_csrf(request)
    data = body(request)
    email = (get_str(data, "email", required=True, max_len=254) or "").lower()
    password = data.get("password") or ""
    full_name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
    candidate = User(email=email, full_name=full_name)
    try:
        password_validation.validate_password(password, candidate)
    except ValidationError as err:
        raise ApiError(" ".join(err.messages)) from err
    if User.objects.filter(email=email).exists():
        raise ApiError("Un compte existe déjà avec cet email")
    try:
        user = User.objects.create_user(email=email, password=password, full_name=full_name)
    except IntegrityError as err:
        raise ApiError("Un compte existe déjà avec cet email") from err
    login(request, user)
    return Response({"user": user_dict(user, request.session)})


# Verrou par compte : la limite par adresse IP ne suffit pas contre une attaque répartie sur de nombreuses
# adresses. Au-delà de 10 échecs en 15 minutes sur un même email, les essais sont refusés le temps que ça retombe.
LOGIN_MAX_FAILURES = 10
LOGIN_LOCK_MINUTES = 15


def _refuse_if_locked(email: str) -> None:
    from datetime import timedelta as _td

    from audit.models import AuditEvent

    if not email:
        return
    since = timezone.now() - _td(minutes=LOGIN_LOCK_MINUTES)
    failures = AuditEvent.objects.filter(action="login_failed", created_at__gte=since, metadata__email=email).count()
    if failures >= LOGIN_MAX_FAILURES:
        raise ApiError(f"Trop d'essais pour ce compte. Réessayez dans {LOGIN_LOCK_MINUTES} minutes ou réinitialisez le mot de passe.", 429)


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def login_view(request):
    enforce_csrf(request)
    data = body(request)
    email = (data.get("email") or "").strip().lower()[:120]
    _refuse_if_locked(email)
    user = authenticate(request, email=email, password=data.get("password") or "")
    if user is None:
        audit.log(request, "login_failed", email=email)
        raise ApiError("Email ou mot de passe incorrect", 401)
    if TwoFactor.objects.filter(user=user, enabled=True).exists():
        # Mot de passe correct : on attend le code de l'application avant d'ouvrir la session.
        request.session["mfa_user_id"] = str(user.pk)
        request.session["mfa_started_at"] = int(timezone.now().timestamp())
        return Response({"mfa_required": True})
    login(request, user)
    audit.log(request, "login", actor=user, method="password")
    return Response({"user": user_dict(user, request.session)})


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response({"ok": True})


# Comptes de démonstration (créés par « python manage.py seed_demo »).
DEMO_ACCOUNTS = {
    "patient": "patient@fajma.local",
    "medecin": "medecin@fajma.local",
    "pharmacie": "pharmacie@fajma.local",
    "clinique": "clinique@fajma.local",
    "secretariat": "secretariat@fajma.local",
    "laboratoire": "laboratoire@fajma.local",
    "admin": "admin@fajma.local",
}


@api_view(["GET", "POST"])
def demo_login(request):
    """Accès démo sans identification, en développement uniquement (settings.DEMO_LOGIN)."""
    if request.method == "GET":
        return Response({"enabled": settings.DEMO_LOGIN})
    if not settings.DEMO_LOGIN:
        raise not_found("Accès démo désactivé")
    enforce_csrf(request)
    email = DEMO_ACCOUNTS[get_choice(body(request), "account", set(DEMO_ACCOUNTS), default="patient")]
    user = User.objects.filter(email=email, is_active=True).first()
    if not user:
        raise ApiError("Comptes démo absents : lancez « python manage.py seed_demo » dans le dossier backend.")
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session["demo"] = True  # parcours de démonstration : double authentification non exigée
    audit.log(request, "login", actor=user, method="demo")
    return Response({"user": user_dict(user, request.session)})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def password_reset(request):
    """Envoie un lien de réinitialisation. Répond toujours OK pour ne pas révéler les comptes existants."""
    enforce_csrf(request)
    email = (get_str(body(request), "email", required=True, max_len=254) or "").lower()
    user = User.objects.filter(email=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.PUBLIC_SITE_URL}/auth?uid={uid}&token={token}"
        queue_email(
            user.email,
            "Fajma — réinitialisation du mot de passe",
            f"Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n{link}\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
        )
    return Response({"ok": True})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def password_reset_confirm(request):
    enforce_csrf(request)
    data = body(request)
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(data.get("uid") or "")))
    except (User.DoesNotExist, ValueError, TypeError, ValidationError) as err:
        raise ApiError("Lien invalide ou expiré") from err
    if not default_token_generator.check_token(user, data.get("token") or ""):
        raise ApiError("Lien invalide ou expiré")
    password = data.get("password") or ""
    try:
        password_validation.validate_password(password, user)
    except ValidationError as err:
        raise ApiError(" ".join(err.messages)) from err
    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"ok": True})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def password_change(request):
    """
    {current_password, new_password}. Compte ouvert par SMS sans mot de passe : current_password inutile
    (il en définit un). La session en cours reste ouverte ; les autres appareils sont déconnectés.
    """
    from django.contrib.auth import update_session_auth_hash

    user = require_user(request)
    data = body(request)
    if user.has_usable_password() and not user.check_password(data.get("current_password") or ""):
        audit.log(request, "password_change_failed")
        raise ApiError("Mot de passe actuel incorrect", 403)
    new = data.get("new_password") or ""
    if user.has_usable_password() and user.check_password(new):
        raise ApiError("Choisissez un mot de passe différent de l'actuel")
    try:
        password_validation.validate_password(new, user)
    except ValidationError as err:
        raise ApiError(" ".join(err.messages)) from err
    user.set_password(new)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)
    audit.log(request, "password_changed")
    if user.email:
        queue_email(
            user.email,
            "Fajma — mot de passe modifié",
            "Bonjour,\n\nLe mot de passe de votre compte Fajma vient d'être modifié. Si ce n'est pas vous, "
            "utilisez immédiatement « Mot de passe oublié » et prévenez l'équipe Fajma.",
        )
    return Response({"ok": True})


# ── Profil et dossier du patient ─────────────────────────────────────


def profile_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "phone": user.phone or None,
        "city": user.city or None,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
        "sex": user.sex or None,
        "avatar_url": user.avatar_url or None,
        "notification_channel": user.notification_channel,
        "preferred_language": user.preferred_language,
    }


@api_view(["GET"])
def my_doctors(request):
    """Médecins déjà consultés (ou à venir) : reprendre rendez-vous en un clic."""
    from appointments.scheduling import next_available

    user = require_user(request)
    now = timezone.now()
    seen: dict = {}
    for a in Appointment.objects.filter(patient=user).exclude(status="cancelled").select_related("doctor__specialty").order_by("-scheduled_at"):
        d = a.doctor
        entry = seen.setdefault(
            d.id,
            {"id": str(d.id), "full_name": d.full_name, "city": d.city, "specialty": d.specialty.name if d.specialty else None,
             "avatar_url": None, "is_verified": d.is_verified, "last_visit": None, "next_appointment": None, "visits": 0},
        )
        if a.scheduled_at > now and a.status in ("pending", "confirmed"):
            entry["next_appointment"] = iso(a.scheduled_at)
        elif a.status == "completed":
            entry["visits"] += 1
            entry["last_visit"] = entry["last_visit"] or iso(a.scheduled_at)
    from directory.serializers import photo_url

    doctors = {d.id: d for d in Doctor.objects.filter(id__in=seen.keys())}
    out = []
    for doctor_id, entry in seen.items():
        entry["avatar_url"] = photo_url(doctors[doctor_id])
        entry["next_slot"] = next_available(doctor_id) if entry["is_verified"] and not entry["next_appointment"] else None
        out.append(entry)
    return Response(out[:30])


@api_view(["GET"])
def my_health_data(request):
    user = require_user(request)
    records = MedicalRecord.objects.filter(patient=user).select_related("doctor__specialty")
    prescriptions = Prescription.objects.filter(patient=user).select_related("doctor", "relative")
    reviews = Review.objects.filter(patient=user)
    return Response(
        {
            "profile": profile_dict(user),
            "records": [
                {
                    "id": str(r.id),
                    "appointment_id": str(r.appointment_id),
                    "summary": r.summary,
                    "diagnosis": r.diagnosis or None,
                    "treatment": r.treatment or None,
                    "created_at": iso(r.created_at),
                    "doctor": {
                        "full_name": r.doctor.full_name,
                        "specialty": {"name": r.doctor.specialty.name} if r.doctor.specialty else None,
                    },
                }
                for r in records
            ],
            "prescriptions": [
                {
                    "id": str(p.id),
                    "appointment_id": str(p.appointment_id),
                    "reference": p.reference,
                    "content": p.content,
                    "instructions": p.instructions or None,
                    "valid_until": p.valid_until.isoformat() if p.valid_until else None,
                    "created_at": iso(p.created_at),
                    "doctor": {"id": str(p.doctor_id), "full_name": p.doctor.full_name},
                    # Ordonnance d'un proche (enfant…) : son nom, pour ne pas la confondre avec les siennes.
                    "for_relative": p.relative.full_name if p.relative else None,
                }
                for p in prescriptions
            ],
            "reviews": [
                {"id": str(r.id), "appointment_id": str(r.appointment_id), "doctor_id": str(r.doctor_id), "rating": r.rating, "comment": r.comment or None}
                for r in reviews
            ],
        }
    )


@api_view(["POST"])
def update_profile(request):
    user = require_user(request)
    data = body(request)
    from notifications.sms import normalize_phone

    user.full_name = get_str(data, "full_name", required=True, min_len=2, max_len=120)
    fields = ["full_name", "notification_channel", "preferred_language"]
    if "phone" in data:
        # Le numéro n'est modifié que s'il est envoyé. Un numéro vérifié qui change doit être revérifié par SMS
        # (sinon on pourrait s'attribuer le numéro d'un autre), et un compte ouvert par SMS garde son numéro.
        raw = get_str(data, "phone", max_len=30) or ""
        new = normalize_phone(raw) or raw
        old = normalize_phone(user.phone) or user.phone
        if new != old:
            if not new and not user.email:
                raise ApiError("Ce numéro est votre identifiant de connexion : il ne peut pas être supprimé.")
            user.phone, user.phone_verified = new, False
            fields += ["phone", "phone_verified"]
    if "city" in data:
        user.city = get_str(data, "city", max_len=80) or ""
        fields.append("city")
    channel = get_choice(data, "notification_channel", {"sms", "whatsapp"})
    language = get_choice(data, "preferred_language", {"fr", "wo", "en"})
    if channel:
        user.notification_channel = channel
    if language:
        user.preferred_language = language
    # Âge et sexe (mentions de l'ordonnance) : modifiés seulement s'ils sont envoyés.
    if "birth_date" in data:
        user.birth_date = _birth_date(data)
        fields.append("birth_date")
    if "sex" in data:
        user.sex = get_choice(data, "sex", {"", "F", "M"}, default="") or ""
        fields.append("sex")
    user.save(update_fields=fields)
    return Response({"ok": True})


@api_view(["POST"])
def set_language(request):
    """Langue choisie dans l'application : elle devient aussi celle des SMS et rappels."""
    user = require_user(request)
    user.preferred_language = get_choice(body(request), "lang", {"fr", "wo", "en"})
    user.save(update_fields=["preferred_language"])
    return Response({"ok": True})


# ── Proches ──────────────────────────────────────────────────────────


def _birth_date(data: dict):
    raw = get_str(data, "birth_date", max_len=10)
    if not raw:
        return None
    try:
        value = timezone.datetime.fromisoformat(raw).date()
    except ValueError as err:
        raise ApiError("Date de naissance invalide") from err
    if not timezone.datetime(1900, 1, 1).date() <= value <= timezone.localdate():
        raise ApiError("Date de naissance invalide")
    return value


def relative_dict(r: Relative) -> dict:
    return {
        "id": str(r.id),
        "full_name": r.full_name,
        "relationship": r.relationship,
        "birth_date": r.birth_date.isoformat() if r.birth_date else None,
        "sex": r.sex or None,
        "phone": r.phone or None,
    }


@api_view(["GET", "POST"])
def relatives(request):
    user = require_user(request)
    if request.method == "GET":
        return Response([relative_dict(r) for r in user.relatives.all()])
    data = body(request)
    rel = Relative.objects.create(
        owner=user,
        full_name=get_str(data, "full_name", required=True, min_len=2, max_len=120),
        relationship=get_choice(data, "relationship", {"enfant", "conjoint", "parent", "autre"}, default="enfant"),
        birth_date=_birth_date(data),
        sex=get_choice(data, "sex", {"", "F", "M"}, default="") or "",
        phone=get_str(data, "phone", max_len=30) or "",
    )
    return Response({"id": str(rel.id)})


@api_view(["POST"])
def delete_relative(request, relative_id):
    user = require_user(request)
    deleted, _ = Relative.objects.filter(id=relative_id, owner=user).delete()
    if not deleted:
        raise not_found("Proche introuvable")
    return Response({"ok": True})


# ── Back-office (administrateurs) ────────────────────────────────────


def require_admin(request) -> User:
    user = require_user(request)
    if not user.is_staff:
        raise forbidden("Accès administrateur requis")
    return user


@api_view(["GET"])
def admin_overview(request):
    require_admin(request)
    return Response(
        {
            "doctors": [
                {"id": str(d.id), "full_name": d.full_name, "city": d.city, "is_verified": d.is_verified, "created_at": iso(d.created_at)}
                for d in Doctor.objects.order_by("-created_at")
            ],
            "appointments": [
                {"id": str(a.id), "status": a.status, "mode": a.mode, "scheduled_at": iso(a.scheduled_at)}
                for a in Appointment.objects.order_by("-scheduled_at")[:100]
            ],
            "clinics": [
                {"id": str(c.id), "name": c.name, "city": c.city, "is_verified": c.is_verified, "created_at": iso(c.created_at)}
                for c in Clinic.objects.filter(kind="clinic").order_by("-created_at")
            ],
            # Pharmacies et laboratoires partenaires (avec au moins un compte rattaché) : à valider avant de recevoir
            # des ordonnances ou des demandes d'analyses en ligne.
            "pharmacies": [
                {"id": str(p.id), "name": p.name, "city": p.city, "is_verified": p.is_verified, "created_at": iso(p.created_at)}
                for p in Pharmacy.objects.filter(members__isnull=False).distinct().order_by("-created_at")
            ],
            "laboratories": [
                {"id": str(lab.id), "name": lab.name, "city": lab.city, "is_verified": lab.is_verified, "created_at": iso(lab.created_at)}
                for lab in Laboratory.objects.filter(members__isnull=False).distinct().order_by("-created_at")
            ],
            "payments": [
                {"id": str(p.id), "amount": p.amount, "status": p.status, "currency": p.currency, "created_at": iso(p.created_at)}
                for p in Payment.objects.order_by("-created_at")[:100]
            ],
        }
    )


@api_view(["GET"])
def admin_todo(request):
    """Compteurs de la file de travail de l'administration (bandeau « À traiter »)."""
    from directory.models import Credential
    from payments.models import Payout, Refund
    from support.models import SupportRequest

    require_admin(request)
    return Response(
        {
            "doctors_to_verify": Doctor.objects.filter(is_verified=False, user__is_active=True).count(),
            "credentials_pending": Credential.objects.filter(status="pending").count(),
            # Pièces validées arrivées à échéance (à faire renouveler) ou qui expirent dans les 30 jours.
            "credentials_expiring": Credential.objects.filter(
                status="accepted", expires_at__lte=timezone.localdate() + timedelta(days=30)
            ).count(),
            "clinics_to_verify": Clinic.objects.filter(is_verified=False, kind="clinic").count()
            + Pharmacy.objects.filter(is_verified=False, members__isnull=False).distinct().count()
            + Laboratory.objects.filter(is_verified=False, members__isnull=False).distinct().count(),
            "reviews_reported": Review.objects.filter(status="reported").count(),
            "payouts_requested": Payout.objects.filter(status="requested").count(),
            "refunds_pending": Refund.objects.filter(status="pending").count(),
            "support_open": SupportRequest.objects.filter(status="open").count(),
            "sms_failed": SmsReminder.objects.filter(status="failed", scheduled_for__gte=timezone.now() - timedelta(days=7)).count(),
        }
    )


@api_view(["POST"])
def admin_set_verification(request):
    require_admin(request)
    data = body(request)
    kind = get_choice(data, "kind", {"doctor", "clinic", "pharmacy", "laboratory"})
    model = {"doctor": Doctor, "clinic": Clinic, "pharmacy": Pharmacy, "laboratory": Laboratory}[kind]
    target_id = get_uuid(data, "id")
    target = model.objects.filter(id=target_id).first()
    if not target:
        raise not_found("Introuvable")
    if data.get("verified"):
        # Publication seulement avec toutes les pièces obligatoires validées et en cours de validité.
        from directory.credentials import verification_blocker

        blocker = verification_blocker(kind, target)
        if blocker:
            raise ApiError(blocker)
    verified = bool(data.get("verified"))
    was = target.is_verified
    model.objects.filter(id=target_id).update(is_verified=verified)
    audit.log(request, "admin_verification", kind=kind, id=str(target_id), verified=verified)
    if verified and not was:
        from notifications.service import notify

        if kind == "doctor" and target.user:
            notify(target.user, kind="verification", title="Votre fiche est en ligne",
                   body="Votre inscription est vérifiée : les patients peuvent désormais vous trouver et prendre rendez-vous.",
                   link="/pro", sms=True, email=True)
        elif kind == "clinic":
            notify(target.owner, kind="verification", title="Établissement vérifié",
                   body=f"{target.name} est vérifié et apparaît dans l'annuaire des établissements.", link="/clinique", email=True)
        else:
            link = "/pharmacie" if kind == "pharmacy" else "/laboratoire"
            what = "les ordonnances" if kind == "pharmacy" else "les demandes d'analyses"
            for m in target.members.select_related("user"):
                notify(m.user, kind="verification", title=f"{target.name} est vérifié",
                       body=f"Vos justificatifs sont validés : vous recevez désormais {what} en ligne.", link=link, email=True)
    return Response({"ok": True})


@api_view(["GET"])
def admin_sms_reminders(request):
    require_admin(request)
    return Response(
        [
            {
                "id": str(s.id),
                "kind": s.kind,
                "status": s.status,
                "attempts": s.attempts,
                "recipient_phone": s.recipient_phone,
                "last_error": s.last_error or None,
                "scheduled_for": iso(s.scheduled_for),
                "sent_at": iso(s.sent_at),
                "message": s.message,
            }
            for s in SmsReminder.objects.all()[:100]
        ]
    )


@api_view(["POST"])
def admin_retry_sms(request):
    require_admin(request)
    updated = SmsReminder.objects.filter(id=get_uuid(body(request), "id")).update(
        status="pending", attempts=0, last_error="", scheduled_for=timezone.now()
    )
    if not updated:
        raise not_found("Rappel introuvable")
    return Response({"ok": True})


def admin_user_dicts(users: list[User]) -> list[dict]:
    """Fiches de la recherche de comptes : rôles, double authentification, fiche médecin et RDV à venir chargés
    en une requête par information pour TOUS les comptes affichés (pas une série de requêtes par compte)."""
    from django.db.models import Count

    from clinics.models import ClinicStaff
    from labs.models import LaboratoryMember
    from pharmacy.models import PharmacyMember

    ids = [u.id for u in users]
    doctors = {d.user_id: d for d in Doctor.objects.filter(user_id__in=ids)}
    pharmacists = set(PharmacyMember.objects.filter(user_id__in=ids).values_list("user_id", flat=True))
    labs = set(LaboratoryMember.objects.filter(user_id__in=ids).values_list("user_id", flat=True))
    owners = set(Clinic.objects.filter(owner_id__in=ids).values_list("owner_id", flat=True))
    staff = set(ClinicStaff.objects.filter(user_id__in=ids).values_list("user_id", flat=True))
    mfa = set(TwoFactor.objects.filter(user_id__in=ids, enabled=True).values_list("user_id", flat=True))
    upcoming = dict(
        Appointment.objects.filter(patient_id__in=ids, status__in=("pending", "confirmed"), scheduled_at__gte=timezone.now())
        .values("patient_id")
        .annotate(n=Count("id"))
        .values_list("patient_id", "n")
    )
    out = []
    for u in users:
        doctor = doctors.get(u.id)
        roles = [
            role
            for role, ok in (
                ("admin", u.is_staff),
                ("doctor", doctor is not None),
                ("pharmacist", u.id in pharmacists),
                ("lab", u.id in labs),
                ("clinic_owner", u.id in owners),
                ("clinic_staff", u.id in staff),
            )
            if ok
        ]
        out.append(
            {
                "id": str(u.id),
                "full_name": u.full_name or None,
                "email": u.email or None,
                "phone": u.phone or None,
                "city": u.city or None,
                "roles": roles or ["patient"],
                "is_active": u.is_active,
                "mfa_enabled": u.id in mfa,
                "date_joined": iso(u.date_joined),
                "last_login": iso(u.last_login),
                "doctor": {"id": str(doctor.id), "full_name": doctor.full_name, "is_verified": doctor.is_verified} if doctor else None,
                "upcoming_appointments": upcoming.get(u.id, 0),
            }
        )
    return out


def admin_user_dict(u: User) -> dict:
    return admin_user_dicts([u])[0]


DELETED_SUFFIX = "@invalid.fajma"  # comptes supprimés par leur titulaire (anonymisés)


@api_view(["GET"])
def admin_users(request):
    """Recherche d'un compte (nom, email, téléphone) pour le support : 50 résultats au plus."""
    from django.db.models import Q

    require_admin(request)
    q = (request.query_params.get("q") or "").strip()
    qs = User.objects.exclude(email__endswith=DELETED_SUFFIX).order_by("-date_joined")
    if q:
        digits = "".join(c for c in q if c.isdigit())
        cond = Q(full_name__icontains=q) | Q(email__icontains=q)
        if len(digits) >= 4:
            cond |= Q(phone__contains=digits[-9:])
        qs = qs.filter(cond)
    if request.query_params.get("status") == "suspended":
        qs = qs.filter(is_active=False)
    if q:
        audit.log(request, "admin_user_search", query=q[:60])
    return Response(admin_user_dicts(list(qs[:50])))


@api_view(["POST"])
def admin_user_action(request, user_id):
    """
    {action: suspend|reactivate|reset_mfa, reason}. Suspendre : plus de connexion (sessions en cours
    comprises) et, pour un médecin, retrait de l'annuaire. Réactiver ne republie pas la fiche médecin :
    elle doit être revalidée. reset_mfa : téléphone perdu sans codes de secours (identité vérifiée hors ligne).
    """
    admin = require_admin(request)
    data = body(request)
    action = get_choice(data, "action", {"suspend", "reactivate", "reset_mfa"})
    reason = get_str(data, "reason", max_len=300) or ""
    target = User.objects.filter(id=user_id).exclude(email__endswith=DELETED_SUFFIX).first()
    if not target:
        raise not_found("Compte introuvable")
    if target.pk == admin.pk:
        raise ApiError("Vous ne pouvez pas modifier votre propre compte ici")
    if target.is_superuser and not admin.is_superuser:
        raise forbidden("Seul un super-administrateur peut agir sur ce compte")
    if action in {"suspend", "reset_mfa"} and len(reason) < 5:
        raise ApiError("Indiquez le motif (il est conservé dans le journal)")
    if action == "suspend":
        if not target.is_active:
            raise ApiError("Ce compte est déjà suspendu")
        target.is_active = False
        target.save(update_fields=["is_active"])
        Doctor.objects.filter(user=target).update(is_verified=False)
        from .security import end_sessions

        end_sessions(target)  # déconnexion immédiate sur tous les appareils
    elif action == "reactivate":
        if target.is_active:
            raise ApiError("Ce compte est déjà actif")
        target.is_active = True
        target.save(update_fields=["is_active"])
    else:
        deleted, _ = TwoFactor.objects.filter(user=target).delete()
        if not deleted:
            raise ApiError("La double authentification n'est pas activée sur ce compte")
    audit.log(request, f"admin_user_{action}", target_user=str(target.pk), reason=reason)
    return Response(admin_user_dict(target))


# ── Données personnelles (droit d'accès et d'effacement) ────────────


@api_view(["GET"])
def export_my_data(request):
    """Toutes les données du compte, en JSON (droit d'accès / portabilité)."""
    from appointments.models import WaitlistEntry
    from medical.models import HealthProfile, MedicalDocument
    from messaging.models import Message

    user = require_user(request)
    hp = HealthProfile.objects.filter(user=user).first()
    data = {
        "exported_at": iso(timezone.now()),
        "account": {**profile_dict(user), "email": user.email, "created_at": iso(user.date_joined)},
        "health_profile": (
            {f: getattr(hp, f) for f in ("blood_group", "allergies", "conditions", "treatments", "vaccinations", "emergency_contact")} if hp else None
        ),
        "relatives": [relative_dict(r) for r in user.relatives.all()],
        "appointments": [
            {
                "id": str(a.id),
                "doctor": a.doctor.full_name,
                "scheduled_at": iso(a.scheduled_at),
                "status": a.status,
                "mode": a.mode,
                "reason": a.reason,
                "price": a.price,
                "relative": a.relative.full_name if a.relative else None,
            }
            for a in Appointment.objects.filter(patient=user).select_related("doctor", "relative")
        ],
        "payments": [
            {"reference": p.reference, "amount": p.amount, "currency": p.currency, "method": p.method, "status": p.status, "paid_at": iso(p.paid_at)}
            for p in Payment.objects.filter(patient=user)
        ],
        "medical_records": [
            {"doctor": r.doctor.full_name, "date": iso(r.created_at), "summary": r.summary, "diagnosis": r.diagnosis, "treatment": r.treatment}
            for r in MedicalRecord.objects.filter(patient=user).select_related("doctor")
        ],
        "prescriptions": [
            {"reference": p.reference, "doctor": p.doctor.full_name, "date": iso(p.created_at), "content": p.content, "instructions": p.instructions}
            for p in Prescription.objects.filter(patient=user).select_related("doctor")
        ],
        "documents": [{"title": d.title, "category": d.category, "date": iso(d.created_at)} for d in MedicalDocument.objects.filter(patient=user)],
        "messages": [
            {"doctor": m.doctor.full_name, "from_me": m.sender_id == user.id, "date": iso(m.created_at), "body": m.body}
            for m in Message.objects.filter(patient=user).select_related("doctor")
        ],
        "waitlist": [{"doctor": w.doctor.full_name, "status": w.status} for w in WaitlistEntry.objects.filter(patient=user).select_related("doctor")],
    }
    audit.log(request, "data_exported", patient=user)
    response = Response(data)
    response["Content-Disposition"] = 'attachment; filename="mes-donnees-fajma.json"'
    return response


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def delete_my_account(request):
    """
    Suppression du compte. Les données personnelles, proches, profil de santé et documents sont effacés ;
    les rendez-vous passés et comptes-rendus restent chez le médecin (obligation de conservation),
    rattachés à un compte anonymisé.
    """
    from .erasure import anonymize_patient

    user = require_user(request)
    if not user.check_password(body(request).get("password") or ""):
        raise ApiError("Mot de passe incorrect", 403)
    if Doctor.objects.filter(user=user).exists() or Clinic.objects.filter(owner=user).exists():
        raise ApiError("Un compte professionnel se supprime en contactant l'équipe Fajma.")
    anonymize_patient(user)
    audit.log(request, "account_deleted", patient=user)
    logout(request)
    return Response({"ok": True})


# ── Double authentification ──────────────────────────────────────────

MFA_LOGIN_WINDOW_SECONDS = 300


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def login_mfa(request):
    """Deuxième étape de connexion : code à 6 chiffres ou code de secours."""
    enforce_csrf(request)
    user_id = request.session.get("mfa_user_id")
    started = request.session.get("mfa_started_at", 0)
    if not user_id or timezone.now().timestamp() - started > MFA_LOGIN_WINDOW_SECONDS:
        raise ApiError("Session expirée, reconnectez-vous", 401)
    tf = TwoFactor.objects.filter(user_id=user_id, enabled=True).select_related("user").first()
    if not tf or not tf.user.is_active:
        raise ApiError("Session expirée, reconnectez-vous", 401)
    code = (body(request).get("code") or "").strip()
    step = totp.verify(tf.totp_secret, code, tf.last_used_step)
    if step is not None:
        tf.last_used_step = step
        tf.save(update_fields=["last_used_step"])
    elif totp.hash_recovery(code) in tf.recovery_codes:
        tf.recovery_codes = [c for c in tf.recovery_codes if c != totp.hash_recovery(code)]
        tf.save(update_fields=["recovery_codes"])
    else:
        raise ApiError("Code incorrect", 401)
    request.session.pop("mfa_user_id", None)
    login(request, tf.user, backend="django.contrib.auth.backends.ModelBackend")
    audit.log(request, "login", actor=tf.user, method="mfa")
    return Response({"user": user_dict(tf.user, request.session)})


@api_view(["GET", "POST"])
def mfa_setup(request):
    """GET : état. POST {action: start} → secret + lien QR ; {action: confirm, code} → activation + codes de secours ;
    {action: disable, password} → désactivation."""
    user = require_user(request)
    tf = TwoFactor.objects.filter(user=user).first()
    if request.method == "GET":
        return Response({"enabled": bool(tf and tf.enabled), "recovery_codes_left": len(tf.recovery_codes) if tf and tf.enabled else 0})
    data = body(request)
    action = get_choice(data, "action", {"start", "confirm", "disable"})
    if action == "start":
        if tf and tf.enabled:
            raise ApiError("La double authentification est déjà activée")
        secret = totp.new_secret()
        from sunusante.uploads import seal_text

        TwoFactor.objects.update_or_create(
            user=user, defaults={"secret": seal_text(secret), "enabled": False, "recovery_codes": [], "last_used_step": 0}
        )
        return Response({"secret": secret, "otpauth_uri": totp.provisioning_uri(secret, user.email)})
    if action == "confirm":
        if not tf or tf.enabled:
            raise ApiError("Commencez par générer un code QR")
        step = totp.verify(tf.totp_secret, data.get("code") or "")
        if step is None:
            raise ApiError("Code incorrect : vérifiez l'heure de votre téléphone et réessayez")
        plain, hashed = totp.new_recovery_codes()
        tf.enabled, tf.recovery_codes, tf.last_used_step = True, hashed, step
        tf.save()
        audit.log(request, "mfa_enabled")
        return Response({"enabled": True, "recovery_codes": plain})
    if not tf or not tf.enabled:
        raise ApiError("La double authentification n'est pas activée")
    if not user.check_password(data.get("password") or ""):
        raise ApiError("Mot de passe incorrect", 403)
    tf.delete()
    audit.log(request, "mfa_disabled")
    return Response({"enabled": False})


# ── Connexion par téléphone (code SMS) ───────────────────────────────

OTP_TTL = 10 * 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_PER_WINDOW = 3


class OtpThrottle(ScopedThrottle):
    scope = "otp"


def _otp_hash(phone: str, code: str) -> str:
    import hashlib
    import hmac as _hmac

    return _hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


@api_view(["POST"])
@throttle_classes([OtpThrottle])
def otp_request(request):
    """Envoie un code à 6 chiffres par SMS. Même réponse que le numéro ait un compte ou non."""
    import secrets as _secrets
    from datetime import timedelta as _td

    from notifications.sms import normalize_phone
    from notifications.tasks import queue_sms

    from .models import OtpCode

    enforce_csrf(request)
    phone = normalize_phone(get_str(body(request), "phone", required=True, max_len=30))
    if not phone:
        raise ApiError("Numéro de téléphone invalide (ex. 77 123 45 67)")
    now = timezone.now()
    recent = OtpCode.objects.filter(phone=phone, created_at__gte=now - _td(minutes=10)).count()
    if recent >= OTP_MAX_PER_WINDOW:
        raise ApiError("Trop de codes demandés. Réessayez dans quelques minutes.", 429)
    code = f"{_secrets.randbelow(10**6):06d}"
    OtpCode.objects.create(phone=phone, code_hash=_otp_hash(phone, code), expires_at=now + _td(seconds=OTP_TTL))
    queue_sms(phone, f"Fajma : votre code est {code}. Il expire dans 10 minutes. Ne le communiquez à personne.", essential=True)
    data = {"sent": True, "phone": phone}
    # En local sans Twilio, le code est renvoyé pour pouvoir tester (jamais en production).
    if settings.DEBUG and not settings.TWILIO["ACCOUNT_SID"]:
        data["dev_code"] = code
    return Response(data)


def _check_otp(phone: str, code: str) -> None:
    from .models import OtpCode

    otp = OtpCode.objects.filter(phone=phone, used_at__isnull=True, expires_at__gt=timezone.now()).first()
    if not otp:
        raise ApiError("Code expiré. Demandez-en un nouveau.", 401)
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise ApiError("Trop d'essais. Demandez un nouveau code.", 429)
    import hmac as _hmac

    if not _hmac.compare_digest(otp.code_hash, _otp_hash(phone, (code or "").strip())):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        raise ApiError("Code incorrect", 401)
    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])


def _finish_login(request, user):
    if TwoFactor.objects.filter(user=user, enabled=True).exists():
        request.session["mfa_user_id"] = str(user.pk)
        request.session["mfa_started_at"] = int(timezone.now().timestamp())
        return Response({"mfa_required": True})
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    audit.log(request, "login", actor=user, method="sms")
    return Response({"user": user_dict(user, request.session)})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def otp_verify(request):
    """
    Vérifie le code. Numéro connu → connexion. Numéro inconnu → {needs_name: true}, puis
    un second appel avec full_name crée le compte (dans les 10 minutes suivant la vérification).
    Connecté : ajoute ce numéro vérifié à son compte.
    """
    from notifications.sms import normalize_phone

    enforce_csrf(request)
    data = body(request)
    phone = normalize_phone(get_str(data, "phone", required=True, max_len=30))
    if not phone:
        raise ApiError("Numéro de téléphone invalide")

    verified_phone = request.session.get("otp_phone")
    verified_at = request.session.get("otp_phone_at", 0)
    already_verified = verified_phone == phone and timezone.now().timestamp() - verified_at < OTP_TTL
    if not already_verified:
        _check_otp(phone, data.get("code") or "")
        request.session["otp_phone"], request.session["otp_phone_at"] = phone, int(timezone.now().timestamp())

    owner = User.objects.filter(phone=phone, phone_verified=True).first()
    if request.user.is_authenticated:
        if owner and owner.pk != request.user.pk:
            raise ApiError("Ce numéro est déjà associé à un autre compte")
        request.user.phone, request.user.phone_verified = phone, True
        request.user.save(update_fields=["phone", "phone_verified"])
        request.session.pop("otp_phone", None)
        return Response({"user": user_dict(request.user, request.session)})
    if owner:
        if not owner.is_active:
            raise ApiError("Ce compte est désactivé", 403)
        request.session.pop("otp_phone", None)
        return _finish_login(request, owner)
    full_name = get_str(data, "full_name", min_len=2, max_len=120)
    if not full_name:
        return Response({"needs_name": True})
    user = User(phone=phone, phone_verified=True, full_name=full_name)
    user.set_unusable_password()
    user.save()
    request.session.pop("otp_phone", None)
    return _finish_login(request, user)


@api_view(["POST"])
def logout_other_devices(request):
    """Déconnecte immédiatement tous les autres appareils (téléphone perdu, doute sur le compte)."""
    from .security import end_sessions

    user = require_user(request)
    closed = end_sessions(user, keep=request.session.session_key)
    audit.log(request, "sessions_revoked", closed=closed)
    return Response({"ok": True, "closed": closed})
