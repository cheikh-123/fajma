"""Analyses : médecin (prescription), patient (choix du laboratoire), laboratoire (prélèvement, résultats), administration."""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from accounts.views import require_admin
from appointments.models import Appointment
from appointments.views import my_doctor
from audit import log as audit
from medical.models import DocumentShare, MedicalDocument
from notifications.service import notify
from sunusante.api import ApiError, body, forbidden, get_str, get_uuid, iso, not_found, require_user
from sunusante.uploads import decode_upload, store

from .models import LabOrder, Laboratory, LaboratoryMember


def lab_dict(lab: Laboratory) -> dict:
    return {
        "id": str(lab.id),
        "name": lab.name,
        "city": lab.city,
        "district": lab.district or None,
        "address": lab.address,
        "phone": lab.phone or None,
        "opening_hours": lab.opening_hours or None,
        "latitude": lab.latitude,
        "longitude": lab.longitude,
    }


def order_dict(o: LabOrder, *, for_lab: bool = False) -> dict:
    subject = o.relative or o.patient
    data = {
        "id": str(o.id),
        "reference": o.reference,
        "tests": o.tests,
        "instructions": o.instructions or None,
        "urgent": o.urgent,
        "status": o.status,
        "status_label": o.get_status_display(),
        "created_at": iso(o.created_at),
        "sent_at": iso(o.sent_at),
        "received_at": iso(o.received_at),
        "completed_at": iso(o.completed_at),
        "result_note": o.result_note or None,
        "doctor": {"id": str(o.doctor_id), "full_name": o.doctor.full_name},
        "laboratory": lab_dict(o.laboratory) if o.laboratory else None,
        "for_relative": o.relative.full_name if o.relative else None,
        "results": [
            {"id": str(d.id), "title": d.title, "mime_type": d.mime_type, "url": f"/api/documents/{d.id}/download"}
            for d in o.results.all()
        ],
    }
    if for_lab:
        data["patient"] = {
            "full_name": subject.full_name,
            "birth_date": subject.birth_date.isoformat() if getattr(subject, "birth_date", None) else None,
            "sex": getattr(subject, "sex", "") or None,
            "phone": o.patient.phone or None,
        }
    return data


def _orders():
    return LabOrder.objects.select_related("doctor", "patient", "relative", "laboratory").prefetch_related("results")


# ── Médecin ──────────────────────────────────────────────────────────


@api_view(["POST"])
def prescribe(request, appointment_id):
    """{tests, instructions?, urgent?} : prescription d'analyses lors d'une consultation."""
    doctor = my_doctor(require_user(request))
    appt = (
        Appointment.objects.filter(Q(doctor=doctor) | Q(practitioner=doctor), id=appointment_id, status__in=("confirmed", "completed"))
        .exclude(patient=None)
        .select_related("patient", "relative")
        .first()
    )
    if not appt:
        raise not_found("Rendez-vous introuvable (confirmé ou terminé, avec un patient inscrit)")
    data = body(request)
    order = LabOrder.objects.create(
        appointment=appt,
        doctor=doctor,
        patient=appt.patient,
        relative=appt.relative,
        tests=get_str(data, "tests", required=True, min_len=3, max_len=2000),
        instructions=get_str(data, "instructions", max_len=300) or "",
        urgent=bool(data.get("urgent")),
    )
    audit.log(request, "record_written", patient=appt.patient, target=order, kind="analyses")
    notify(appt.patient, kind="lab_order", title="Analyses prescrites",
           body=f"{doctor.full_name} vous a prescrit des analyses. Choisissez votre laboratoire dans votre dossier.",
           link="/dossier#analyses", sms=True)
    return Response(order_dict(order))


def orders_for_doctor(doctor, patient) -> list[dict]:
    return [order_dict(o) for o in _orders().filter(doctor=doctor, patient=patient)[:50]]


# ── Patient ──────────────────────────────────────────────────────────


@api_view(["GET"])
def my_lab_orders(request):
    user = require_user(request)
    return Response([order_dict(o) for o in _orders().filter(patient=user)[:100]])


@api_view(["GET"])
def laboratories(request):
    """Laboratoires partenaires (au moins un compte rattaché), filtrables par ville."""
    require_user(request)
    qs = Laboratory.objects.filter(members__isnull=False, is_verified=True).distinct()
    if city := (request.query_params.get("city") or "").strip():
        qs = qs.filter(city__icontains=city)
    return Response([lab_dict(lab) for lab in qs[:200]])


@api_view(["POST"])
def send_to_lab(request, order_id):
    """{laboratory_id} : le patient choisit son laboratoire (modifiable tant que le prélèvement n'est pas fait)."""
    user = require_user(request)
    order = _orders().filter(id=order_id, patient=user).first()
    if not order:
        raise not_found("Prescription introuvable")
    if order.status not in ("prescribed", "sent"):
        raise ApiError("Le prélèvement a déjà été effectué : le laboratoire ne peut plus être changé")
    lab = (
        Laboratory.objects.filter(id=get_uuid(body(request), "laboratory_id"), members__isnull=False, is_verified=True)
        .distinct()
        .first()
    )
    if not lab:
        raise not_found("Laboratoire introuvable")
    order.laboratory, order.status, order.sent_at = lab, "sent", timezone.now()
    order.save(update_fields=["laboratory", "status", "sent_at", "updated_at"])
    for m in lab.members.select_related("user"):
        notify(m.user, kind="lab_order", title="Nouvelle demande d'analyses", body=f"Réf. {order.reference}", link="/laboratoire")
    return Response(order_dict(order))


# ── Laboratoire ──────────────────────────────────────────────────────


def _my_lab_ids(user) -> list:
    return list(LaboratoryMember.objects.filter(user=user).values_list("laboratory_id", flat=True))


@api_view(["GET"])
def lab_dashboard(request):
    user = require_user(request)
    ids = _my_lab_ids(user)
    if not ids:
        raise forbidden("Compte non rattaché à un laboratoire")
    orders = list(_orders().filter(laboratory_id__in=ids).exclude(status="cancelled")[:300])
    for o in orders:
        if o.status == "sent":
            audit.log(request, "prescription_viewed", patient=o.patient, target=o, via="laboratoire")
    return Response(
        {
            "laboratories": [lab_dict(lab) for lab in Laboratory.objects.filter(id__in=ids)],
            "orders": [order_dict(o, for_lab=True) for o in orders],
        }
    )


def _lab_order(user, order_id) -> LabOrder:
    order = _orders().filter(id=order_id, laboratory_id__in=_my_lab_ids(user)).first()
    if not order:
        raise not_found("Demande introuvable")
    return order


@api_view(["POST"])
def lab_receive(request, order_id):
    """Prélèvement effectué au laboratoire."""
    user = require_user(request)
    order = _lab_order(user, order_id)
    if order.status != "sent":
        raise ApiError("Cette demande n'attend pas de prélèvement")
    order.status, order.received_at = "received", timezone.now()
    order.save(update_fields=["status", "received_at", "updated_at"])
    return Response(order_dict(order, for_lab=True))


@api_view(["POST"])
def lab_result(request, order_id):
    """
    {file_name, content_base64, note?, final?} : dépôt d'un résultat (PDF ou photo). Le document rejoint le dossier du
    patient et est partagé avec le médecin prescripteur ; final=true clôt la demande et prévient patient et médecin.
    """
    user = require_user(request)
    order = _lab_order(user, order_id)
    if order.status not in ("sent", "received", "completed"):
        raise ApiError("Cette demande est annulée")
    data = body(request)
    content, mime, safe_name = decode_upload(data)
    with transaction.atomic():
        doc = MedicalDocument.objects.create(
            patient=order.patient,
            uploaded_by=user,
            appointment=order.appointment,
            title=f"Résultats d'analyses {order.reference} — {order.laboratory.name}"[:160],
            category="analyse",
            file_path=store(str(order.patient_id), safe_name, content),
            mime_type=mime,
            size_bytes=len(content),
        )
        order.results.add(doc)
        DocumentShare.objects.get_or_create(document=doc, doctor=order.doctor)
        if note := get_str(data, "note", max_len=2000):
            order.result_note = note
        final = data.get("final", True)
        if final and order.status != "completed":
            order.status, order.completed_at = "completed", timezone.now()
            order.received_at = order.received_at or order.completed_at
        order.save()
    audit.log(request, "record_written", patient=order.patient, target=order, kind="résultats d'analyses")
    if final:
        notify(order.patient, kind="lab_result", title="Résultats d'analyses disponibles",
               body=f"{order.laboratory.name} a déposé vos résultats dans votre dossier.", link="/dossier#analyses", sms=True, email=True)
        notify(order.doctor.user, kind="lab_result", title="Résultats d'analyses reçus",
               body=f"{(order.relative or order.patient).full_name} — réf. {order.reference}", link=f"/patients/{order.patient_id}")
    return Response(order_dict(order, for_lab=True))


# ── Fiche du laboratoire ─────────────────────────────────────────────


def _apply_lab_fields(lab: Laboratory, data: dict, *, admin: bool) -> None:
    """Téléphone, horaires, adresse, quartier (et pour l'administration : nom et ville). Position recalculée."""
    from directory import localities

    place_before = (lab.city, lab.district, lab.address)
    if admin and "name" in data:
        lab.name = get_str(data, "name", required=True, min_len=2, max_len=160)
    if admin and "city" in data:
        lab.city = get_str(data, "city", required=True, min_len=2, max_len=80)
    if "district" in data:
        lab.district = get_str(data, "district", max_len=80) or ""
    if "address" in data:
        lab.address = get_str(data, "address", required=True, min_len=3, max_len=200)
    if "phone" in data:
        lab.phone = get_str(data, "phone", max_len=30) or ""
    if "opening_hours" in data:
        lab.opening_hours = get_str(data, "opening_hours", max_len=160) or ""
    if (lab.city, lab.district, lab.address) != place_before:
        found = (localities.find(lab.district) if lab.district else None) or localities.find(lab.city)
        if found:
            lab.latitude, lab.longitude = found.latitude, found.longitude
    lab.save()


@api_view(["GET", "POST"])
def my_laboratories(request):
    """Membres du laboratoire : GET leurs laboratoires ; POST {laboratory_id, phone, opening_hours, address…}."""
    user = require_user(request)
    ids = _my_lab_ids(user)
    if not ids:
        raise forbidden("Compte non rattaché à un laboratoire")
    if request.method == "POST":
        data = body(request)
        lab = Laboratory.objects.filter(id=get_uuid(data, "laboratory_id"), id__in=ids).first()
        if not lab:
            raise not_found("Laboratoire introuvable")
        _apply_lab_fields(lab, data, admin=False)
        audit.log(request, "lab_updated", laboratory=str(lab.id))
    return Response([lab_dict(lab) for lab in Laboratory.objects.filter(id__in=ids)])


@api_view(["POST"])
def admin_update_laboratory(request, laboratory_id):
    """Administration : correction de la fiche (nom, ville, quartier, adresse, téléphone, horaires)."""
    require_admin(request)
    lab = Laboratory.objects.filter(id=laboratory_id).first()
    if not lab:
        raise not_found("Laboratoire introuvable")
    _apply_lab_fields(lab, body(request), admin=True)
    audit.log(request, "admin_lab_updated", laboratory=str(lab.id))
    return Response(lab_dict(lab))


# ── Administration ───────────────────────────────────────────────────


@api_view(["GET", "POST"])
def admin_laboratories(request):
    """GET : laboratoires et comptes rattachés. POST {name, city, address, …} : ajout d'un laboratoire."""
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        from directory import localities

        lab = Laboratory(
            name=get_str(data, "name", required=True, min_len=2, max_len=160),
            city=get_str(data, "city", required=True, min_len=2, max_len=80),
            district=get_str(data, "district", max_len=80) or "",
            address=get_str(data, "address", required=True, min_len=3, max_len=200),
            phone=get_str(data, "phone", max_len=30) or "",
            opening_hours=get_str(data, "opening_hours", max_len=160) or "",
        )
        found = localities.find(lab.district) if lab.district else None
        found = found or localities.find(lab.city)
        if found:
            lab.latitude, lab.longitude = found.latitude, found.longitude
        lab.save()
        audit.log(request, "admin_lab_created", laboratory=str(lab.id))
    return Response(
        [
            {
                **lab_dict(lab),
                "members": [{"id": str(m.id), "full_name": m.user.full_name, "email": m.user.email} for m in lab.members.select_related("user")],
            }
            for lab in Laboratory.objects.prefetch_related("members")[:300]
        ]
    )


@api_view(["POST"])
def admin_lab_member(request, laboratory_id):
    """{email} : rattache un compte existant ; {remove_member_id} : retire un rattachement."""
    require_admin(request)
    lab = Laboratory.objects.filter(id=laboratory_id).first()
    if not lab:
        raise not_found("Laboratoire introuvable")
    data = body(request)
    if member_id := get_uuid(data, "remove_member_id", required=False):
        LaboratoryMember.objects.filter(id=member_id, laboratory=lab).delete()
    else:
        email = (get_str(data, "email", required=True, max_len=254) or "").lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            raise not_found("Aucun compte avec cet email (la personne doit d'abord créer son compte)")
        _, created = LaboratoryMember.objects.get_or_create(laboratory=lab, user=user)
        audit.log(request, "admin_verification", kind="lab_member", laboratory=str(lab.id), user=str(user.id))
        if created:
            notify(user, kind="verification", title="Compte laboratoire activé",
                   body=f"Votre compte est rattaché à {lab.name}. Vous recevez maintenant les demandes d'analyses des patients.",
                   link="/laboratoire", email=True)
    return Response({"ok": True})


@api_view(["POST"])
def cancel_order(request, order_id):
    """Le médecin prescripteur annule une prescription pas encore réalisée."""
    doctor = my_doctor(require_user(request))
    order = _orders().filter(id=order_id, doctor=doctor).first()
    if not order:
        raise not_found("Prescription introuvable")
    if order.status not in ("prescribed", "sent"):
        raise ApiError("Le prélèvement a déjà été effectué")
    order.status = "cancelled"
    order.save(update_fields=["status", "updated_at"])
    notify(order.patient, kind="lab_order", title="Analyses annulées", body=f"{doctor.full_name} a annulé la prescription {order.reference}.", link="/dossier#analyses")
    return Response(order_dict(order))
