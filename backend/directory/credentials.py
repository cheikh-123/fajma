"""
Justificatifs des médecins. Une fiche n'est publiée dans l'annuaire qu'après validation par
l'administration d'une preuve d'inscription à l'Ordre des médecins.
"""

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, get_choice, get_str, iso, not_found, require_user
from sunusante.uploads import decode_upload, serve, storage_path, store

from .models import DoctorCredential

MAX_CREDENTIALS = 20


def credential_dict(c: DoctorCredential) -> dict:
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
        "file_url": f"/api/pro/credentials/{c.id}/file",
    }


def has_accepted_registration(doctor) -> bool:
    return doctor.credentials.filter(kind="ordre", status="accepted").exists()


@api_view(["GET", "POST"])
def my_credentials(request):
    doctor = my_doctor(require_user(request))
    if request.method == "POST":
        if doctor.credentials.count() >= MAX_CREDENTIALS:
            raise ApiError("Nombre maximal de justificatifs atteint")
        data = body(request)
        kind = get_choice(data, "kind", {k for k, _ in DoctorCredential.KINDS})
        content, mime, safe_name = decode_upload(data)
        DoctorCredential.objects.create(
            doctor=doctor,
            kind=kind,
            title=get_str(data, "title", max_len=160) or "",
            file_path=store(f"credentials/{doctor.id}", safe_name, content),
            mime_type=mime,
            size_bytes=len(content),
        )
    return Response(
        {
            "is_verified": doctor.is_verified,
            "credentials": [credential_dict(c) for c in doctor.credentials.all()],
        }
    )


@api_view(["POST"])
def delete_credential(request, credential_id):
    doctor = my_doctor(require_user(request))
    cred = DoctorCredential.objects.filter(id=credential_id, doctor=doctor).first()
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
    """Fichier visible par le médecin concerné et par l'administration uniquement."""
    user = require_user(request)
    cred = DoctorCredential.objects.filter(id=credential_id).select_related("doctor").first()
    if not cred or not (user.is_staff or cred.doctor.user_id == user.id):
        raise not_found("Justificatif introuvable")
    if user.is_staff:
        audit.log(request, "admin_verification", kind="credential_viewed", id=str(cred.id), doctor=str(cred.doctor_id))
    return serve(cred.file_path, cred.mime_type)


@api_view(["GET"])
def admin_credentials(request):
    require_admin(request)
    creds = DoctorCredential.objects.select_related("doctor").order_by("status", "created_at")[:300]
    return Response([{**credential_dict(c), "doctor_id": str(c.doctor_id), "doctor_name": c.doctor.full_name} for c in creds])


@api_view(["POST"])
def admin_review_credential(request, credential_id):
    require_admin(request)
    data = body(request)
    decision = get_choice(data, "decision", {"accepted", "rejected"})
    note = get_str(data, "note", max_len=300) or ""
    if decision == "rejected" and not note:
        raise ApiError("Indiquez au médecin pourquoi le justificatif est refusé")
    cred = DoctorCredential.objects.filter(id=credential_id).select_related("doctor__user").first()
    if not cred:
        raise not_found("Justificatif introuvable")
    cred.status, cred.review_note, cred.reviewed_at = decision, note, timezone.now()
    cred.save(update_fields=["status", "review_note", "reviewed_at", "updated_at"])
    audit.log(request, "admin_verification", kind="credential", id=str(cred.id), decision=decision)
    from notifications.service import notify

    notify(
        cred.doctor.user,
        kind="credential",
        title=f"Justificatif {'validé' if decision == 'accepted' else 'refusé'} : {cred.get_kind_display()}",
        body=note,
        link="/pro",
        email=True,
    )
    return Response(credential_dict(cred))
