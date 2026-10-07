"""
Justificatifs des professionnels et des établissements (médecins, cliniques, pharmacies, laboratoires).

Un titulaire n'est publié (fiche médecin dans l'annuaire, clinique visible, pharmacie ou laboratoire qui reçoit des
ordonnances en ligne) qu'après validation par l'administration de toutes ses pièces obligatoires, en cours de
validité. Pièces exigées : directory/requirements.py. Fichiers chiffrés, analysés par l'antivirus, visibles par le
titulaire et l'administration seulement ; chaque ouverture par l'administration est journalisée.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, forbidden, get_choice, get_str, iso, not_found, require_user
from sunusante.uploads import decode_upload, serve, storage_path, store

from . import requirements as R
from .models import Credential

MAX_CREDENTIALS = 30
OWNER_TYPES = ("doctor", "clinic", "pharmacy", "laboratory")


# ── Titulaires ────────────────────────────────────────────────────────


def _owner_model(owner_type: str):
    from clinics.models import Clinic
    from labs.models import Laboratory

    from .models import Doctor, Pharmacy

    return {"doctor": Doctor, "clinic": Clinic, "pharmacy": Pharmacy, "laboratory": Laboratory}[owner_type]


def owner_name(owner_type: str, owner) -> str:
    return owner.full_name if owner_type == "doctor" else owner.name


def owner_users(owner_type: str, owner) -> list:
    """Comptes à prévenir pour ce titulaire (médecin, responsable de clinique, membres de la pharmacie / du labo)."""
    if owner_type == "doctor":
        return [owner.user] if owner.user_id else []
    if owner_type == "clinic":
        return [owner.owner]
    return [m.user for m in owner.members.select_related("user")]


def can_manage(user, owner_type: str, owner) -> bool:
    """Peut déposer et consulter les justificatifs de ce titulaire."""
    if owner_type == "doctor":
        return owner.user_id == user.id
    if owner_type == "clinic":
        return owner.owner_id == user.id
    return owner.members.filter(user=user).exists()


def credentials_of(owner_type: str, owner):
    return Credential.objects.filter(**{owner_type: owner})


def is_valid(c: Credential, today: date | None = None) -> bool:
    return c.status == "accepted" and (c.expires_at is None or c.expires_at >= (today or timezone.localdate()))


def missing_required(owner_type: str, owner) -> list[str]:
    """Pièces obligatoires sans justificatif validé et en cours de validité (codes de pièce)."""
    today = timezone.localdate()
    valid = {c.kind for c in credentials_of(owner_type, owner) if is_valid(c, today)}
    return [k for k in R.required_for(owner_type, owner) if k not in valid]


def has_accepted_registration(doctor) -> bool:
    """Compatibilité : inscription à l'Ordre validée."""
    return "ordre" not in missing_required("doctor", doctor)


# ── Représentation ───────────────────────────────────────────────────


def credential_dict(c: Credential) -> dict:
    today = timezone.localdate()
    expired = c.expires_at is not None and c.expires_at < today
    return {
        "id": str(c.id),
        "kind": c.kind,
        "kind_label": c.get_kind_display(),
        "title": c.title or None,
        "mime_type": c.mime_type,
        "size_bytes": c.size_bytes,
        "status": c.status,
        "review_note": c.review_note or None,
        "created_at": iso(c.created_at),
        "reviewed_at": iso(c.reviewed_at),
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "expired": expired,
        "expires_soon": not expired
        and c.expires_at is not None
        and c.expires_at <= today + timedelta(days=R.EXPIRY_NOTICE_DAYS),
        "file_url": f"/api/credentials/{c.id}/file",
    }


def status_payload(owner_type: str, owner) -> dict:
    missing = missing_required(owner_type, owner)
    return {
        "owner_type": owner_type,
        "owner_name": owner_name(owner_type, owner),
        "is_verified": owner.is_verified,
        "requirements": R.requirements(owner_type, owner),
        "missing": [{"kind": k, "label": R.KIND_LABELS[k]} for k in missing],
        "credentials": [credential_dict(c) for c in credentials_of(owner_type, owner)],
    }


# ── Dépôt par le titulaire ───────────────────────────────────────────


def _upload(request, owner_type: str, owner) -> None:
    if credentials_of(owner_type, owner).count() >= MAX_CREDENTIALS:
        raise ApiError("Nombre maximal de justificatifs atteint : supprimez d'abord une pièce refusée")
    data = body(request)
    kind = get_choice(data, "kind", set(R.allowed_kinds(owner_type, owner)))
    expires_at = None
    if data.get("expires_at"):
        try:
            expires_at = date.fromisoformat(str(data["expires_at"])[:10])
        except ValueError as err:
            raise ApiError("Date de fin de validité invalide") from err
        if expires_at < timezone.localdate():
            raise ApiError("Cette pièce n'est plus valide : déposez un document en cours de validité")
    content, mime, safe_name = decode_upload(data)
    Credential.objects.create(
        **{owner_type: owner},
        kind=kind,
        title=get_str(data, "title", max_len=160) or "",
        file_path=store(f"credentials/{owner_type}/{owner.id}", safe_name, content),
        mime_type=mime,
        size_bytes=len(content),
        expires_at=expires_at if kind in R.WITH_EXPIRY else None,
    )


@api_view(["GET", "POST"])
def my_credentials(request):
    """Médecin : ses justificatifs (route historique /api/pro/credentials)."""
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        _upload(request, "doctor", doctor)
    return Response(status_payload("doctor", doctor))


@api_view(["GET", "POST"])
def owner_credentials(request, owner_type, owner_id):
    """Clinique (responsable), pharmacie ou laboratoire (membres) : justificatifs de l'établissement."""
    user = require_user(request)
    if owner_type not in OWNER_TYPES:
        raise not_found("Introuvable")
    owner = _owner_model(owner_type).objects.filter(id=owner_id).first()
    if not owner or not (can_manage(user, owner_type, owner) or user.is_staff):
        raise not_found("Introuvable")
    if request.method == "POST":
        if not can_manage(user, owner_type, owner):
            raise forbidden()
        _upload(request, owner_type, owner)
    return Response(status_payload(owner_type, owner))


def _own_credential(user, credential_id) -> Credential | None:
    c = Credential.objects.filter(id=credential_id).select_related("doctor", "clinic", "pharmacy", "laboratory").first()
    if c and can_manage(user, c.owner_type, c.owner):
        return c
    return None


@api_view(["POST"])
def delete_credential(request, credential_id):
    cred = _own_credential(require_user(request), credential_id)
    if not cred:
        raise not_found("Justificatif introuvable")
    if cred.status == "accepted":
        raise ApiError("Un justificatif validé ne peut pas être supprimé")
    try:
        storage_path(cred.file_path).unlink(missing_ok=True)
    except OSError:
        pass
    cred.delete()
    return Response({"ok": True})


@api_view(["GET"])
def credential_file(request, credential_id):
    """Fichier visible par le titulaire et par l'administration uniquement."""
    user = require_user(request)
    cred = Credential.objects.filter(id=credential_id).select_related("doctor", "clinic", "pharmacy", "laboratory").first()
    if not cred or not (user.is_staff or can_manage(user, cred.owner_type, cred.owner)):
        raise not_found("Justificatif introuvable")
    if user.is_staff:
        audit.log(request, "admin_verification", kind="credential_viewed", id=str(cred.id), owner=cred.owner_type)
    return serve(cred.file_path, cred.mime_type)


# ── Administration ───────────────────────────────────────────────────


@api_view(["GET"])
def admin_credentials(request):
    require_admin(request)
    creds = Credential.objects.select_related("doctor", "clinic", "pharmacy", "laboratory").order_by("status", "created_at")[:400]
    return Response(
        [
            {
                **credential_dict(c),
                "owner_type": c.owner_type,
                "owner_type_label": R.OWNER_LABELS[c.owner_type],
                "owner_id": str(c.owner.id),
                "owner_name": owner_name(c.owner_type, c.owner),
                # compatibilité avec l'ancien écran
                "doctor_id": str(c.doctor_id) if c.doctor_id else None,
                "doctor_name": c.doctor.full_name if c.doctor_id else None,
            }
            for c in creds
        ]
    )


@api_view(["POST"])
def admin_review_credential(request, credential_id):
    admin = require_admin(request)
    data = body(request)
    decision = get_choice(data, "decision", {"accepted", "rejected"})
    note = get_str(data, "note", max_len=300) or ""
    if decision == "rejected" and not note:
        raise ApiError("Indiquez au professionnel pourquoi le justificatif est refusé")
    cred = Credential.objects.filter(id=credential_id).select_related("doctor__user", "clinic__owner", "pharmacy", "laboratory").first()
    if not cred:
        raise not_found("Justificatif introuvable")
    cred.status, cred.review_note, cred.reviewed_at, cred.reviewed_by = decision, note, timezone.now(), admin
    cred.save(update_fields=["status", "review_note", "reviewed_at", "reviewed_by", "updated_at"])
    audit.log(request, "admin_verification", kind="credential", id=str(cred.id), decision=decision, owner=cred.owner_type)
    from notifications.service import notify

    link = {"doctor": "/pro", "clinic": "/clinique", "pharmacy": "/pharmacie", "laboratory": "/laboratoire"}[cred.owner_type]
    for user in owner_users(cred.owner_type, cred.owner):
        notify(
            user,
            kind="credential",
            title=f"Justificatif {'validé' if decision == 'accepted' else 'refusé'} : {cred.get_kind_display()}",
            body=note,
            link=link,
            email=True,
        )
    return Response(credential_dict(cred))


def verification_blocker(owner_type: str, owner) -> str | None:
    """Message d'erreur si le titulaire ne peut pas encore être publié, sinon None."""
    missing = missing_required(owner_type, owner)
    if not missing:
        return None
    labels = ", ".join(R.KIND_LABELS[k].lower() for k in missing)
    return f"Pièces obligatoires manquantes, refusées, en attente ou expirées : {labels}. Validez-les d'abord dans « Justificatifs »."


# ── Échéances ────────────────────────────────────────────────────────


def send_expiry_reminders(now=None) -> int:
    """
    Pièces validées qui expirent : un rappel au titulaire 30 jours avant, puis un autre le jour où elles expirent.
    Lancé par le planificateur (send_reminders). Renvoie le nombre de rappels envoyés.
    """
    from notifications.service import notify

    now = now or timezone.now()
    today = timezone.localdate()
    soon = today + timedelta(days=R.EXPIRY_NOTICE_DAYS)
    sent = 0
    qs = Credential.objects.filter(status="accepted", expires_at__isnull=False, expires_at__lte=soon).select_related(
        "doctor__user", "clinic__owner", "pharmacy", "laboratory"
    )
    for c in qs:
        expired = c.expires_at < today
        last = timezone.localdate(c.expiry_reminded_at) if c.expiry_reminded_at else None
        # Premier rappel (bientôt) une fois ; rappel « expiré » une fois après l'échéance.
        if last is None or (expired and last < c.expires_at):
            title = (
                f"Justificatif expiré : {c.get_kind_display()}"
                if expired
                else f"Justificatif à renouveler avant le {c.expires_at.strftime('%d/%m/%Y')} : {c.get_kind_display()}"
            )
            body = "Déposez la nouvelle version dans votre espace pour rester publié sur Fajma."
            link = {"doctor": "/pro", "clinic": "/clinique", "pharmacy": "/pharmacie", "laboratory": "/laboratoire"}[c.owner_type]
            for user in owner_users(c.owner_type, c.owner):
                notify(user, kind="credential", title=title, body=body, link=link, email=True)
            Credential.objects.filter(pk=c.pk).update(expiry_reminded_at=now)
            sent += 1
    return sent
