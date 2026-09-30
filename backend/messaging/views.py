"""Messagerie patient ↔ médecin. Un fil n'existe qu'entre personnes ayant eu un rendez-vous ensemble."""

from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from appointments.models import Appointment
from directory.models import Doctor
from sunusante.api import ApiError, body, get_str, get_uuid, iso, not_found, require_user
from sunusante.uploads import decode_upload, serve, store

from notifications import service as notifications

from .models import Message


def _can_access(user, doctor: Doctor, patient_id) -> bool:
    """Le fil existe entre un patient et un médecin qui l'a reçu (comme titulaire ou comme remplaçant)."""
    return (doctor.user_id == user.id or patient_id == user.id) and Appointment.objects.filter(
        Q(doctor=doctor) | Q(practitioner=doctor), patient_id=patient_id
    ).exists()


@api_view(["GET"])
def list_threads(request):
    user = require_user(request)
    threads: dict[tuple[str, str], dict] = {}

    for a in Appointment.objects.filter(patient=user).select_related("doctor__specialty", "practitioner__specialty"):
        for doc in filter(None, (a.doctor, a.practitioner)):
            key = (str(doc.id), str(user.id))
            threads.setdefault(
                key,
                {
                    "doctor_id": key[0],
                    "patient_id": key[1],
                    "title": doc.full_name,
                    "subtitle": (doc.specialty.name if doc.specialty else "") + (" · remplaçant" if doc is a.practitioner else ""),
                    "last_body": None,
                    "last_at": None,
                    "unread": 0,
                },
            )
    my_doc = Doctor.objects.filter(user=user).first()
    if my_doc:
        patients = User.objects.filter(Q(appointments__doctor=my_doc) | Q(appointments__practitioner=my_doc)).distinct()
        for p in patients:
            threads[(str(my_doc.id), str(p.id))] = {
                "doctor_id": str(my_doc.id),
                "patient_id": str(p.id),
                "title": p.full_name or "Patient",
                "subtitle": f"Patient · {p.city}" if p.city else "Patient",
                "last_body": None,
                "last_at": None,
                "unread": 0,
            }

    msgs = Message.objects.filter(patient=user) | (Message.objects.filter(doctor=my_doc) if my_doc else Message.objects.none())
    for m in msgs.order_by("-created_at")[:500]:
        t = threads.get((str(m.doctor_id), str(m.patient_id)))
        if not t:
            continue
        if not t["last_at"]:
            t["last_at"], t["last_body"] = iso(m.created_at), m.body or f"📎 {m.attachment_name}"
        if m.sender_id != user.id and not m.read_at:
            t["unread"] += 1

    return Response(sorted(threads.values(), key=lambda t: (t["last_at"] or "", t["title"]), reverse=True))


@api_view(["GET"])
def get_thread(request):
    user = require_user(request)
    doctor = Doctor.objects.filter(id=get_uuid(request.query_params, "doctor_id")).first()
    patient_id = get_uuid(request.query_params, "patient_id")
    if not doctor or not _can_access(user, doctor, patient_id):
        raise not_found("Conversation introuvable")
    messages = Message.objects.filter(doctor=doctor, patient_id=patient_id)
    messages.exclude(sender=user).filter(read_at__isnull=True).update(read_at=timezone.now())
    is_doctor = doctor.user_id == user.id
    counterpart = doctor.full_name
    if is_doctor:
        counterpart = User.objects.filter(id=patient_id).values_list("full_name", flat=True).first() or "Patient"
    return Response(
        {
            "me": str(user.id),
            "counterpart": counterpart,
            "messages": [
                {
                    "id": str(m.id),
                    "sender_id": str(m.sender_id),
                    "body": m.body,
                    "created_at": iso(m.created_at),
                    "read_at": iso(m.read_at),
                    "attachment": (
                        {"name": m.attachment_name, "mime": m.attachment_mime, "size": m.attachment_size,
                         "url": f"/api/messages/{m.id}/attachment"}
                        if m.attachment_path
                        else None
                    ),
                }
                for m in messages.order_by("created_at")[:300]
            ],
        }
    )


@api_view(["POST"])
def send_message(request):
    user = require_user(request)
    data = body(request)
    doctor = Doctor.objects.filter(id=get_uuid(data, "doctor_id")).first()
    patient_id = get_uuid(data, "patient_id")
    if not doctor or not _can_access(user, doctor, patient_id):
        raise ApiError("Vous pourrez écrire à ce médecin après avoir pris rendez-vous avec lui.", 403)
    text = get_str(data, "body", max_len=4000) or ""
    attachment = {}
    if data.get("content_base64"):
        # Même contrôle que les documents médicaux : type réel (PDF, JPEG, PNG, WebP), 6 Mo au plus.
        content, mime, safe_name = decode_upload(data)
        attachment = {
            "attachment_path": store(f"messages/{patient_id}", safe_name, content),
            "attachment_name": (get_str(data, "file_name", max_len=200) or safe_name)[-200:],
            "attachment_mime": mime,
            "attachment_size": len(content),
        }
    if not text and not attachment:
        raise ApiError("Écrivez un message ou joignez un fichier")
    Message.objects.create(doctor=doctor, patient_id=patient_id, sender=user, body=text, **attachment)
    if doctor.user_id == user.id:
        recipient = User.objects.filter(id=patient_id).first()
        link = f"/messages?doctor={doctor.id}"
    else:
        recipient = doctor.user
        link = f"/messages?doctor={doctor.id}&patient={patient_id}"
    notifications.new_message(recipient, user.full_name or "Fajma", link)
    return Response({"ok": True})


@api_view(["GET"])
def message_attachment(request, message_id):
    """Pièce jointe d'un message : uniquement pour le patient et le médecin du fil."""
    from audit import log as audit

    user = require_user(request)
    m = Message.objects.filter(id=message_id).exclude(attachment_path="").select_related("doctor", "patient").first()
    if not m or not _can_access(user, m.doctor, m.patient_id):
        raise not_found("Fichier introuvable")
    if user.id != m.patient_id:
        audit.log(request, "document_viewed", patient=m.patient, target=m, via="message")
    return serve(m.attachment_path, m.attachment_mime)
