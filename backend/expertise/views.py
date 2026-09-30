"""
Télé-expertise : un médecin sollicite l'avis d'un confrère, avec ou sans dossier patient.
Seuls le requérant et l'expert voient l'échange. Un accès de l'expert au dossier est tracé dans le
journal visible par le patient.
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from appointments.views import my_doctor
from audit import log as audit
from directory.models import Doctor
from medical.models import HealthProfile, MedicalDocument
from medical.views import doctor_can_see_patient, health_profile_dict
from notifications.service import notify
from sunusante.api import ApiError, body, get_str, get_uuid, iso, not_found, require_user

from .models import ExpertiseMessage, ExpertiseRequest

MAX_DOCUMENTS = 10


def _doctor_brief(d: Doctor) -> dict:
    return {"id": str(d.id), "full_name": d.full_name, "specialty": d.specialty.name if d.specialty else None, "city": d.city}


def summary_dict(r: ExpertiseRequest, me: Doctor) -> dict:
    last = r.messages.order_by("-created_at").first()
    return {
        "id": str(r.id),
        "subject": r.subject,
        "status": r.status,
        "status_label": r.get_status_display(),
        "role": "requester" if r.requester_id == me.id else "expert",
        "requester": _doctor_brief(r.requester),
        "expert": _doctor_brief(r.expert),
        "patient_name": r.patient.full_name if r.patient else None,
        "updated_at": iso(r.updated_at),
        "last_message": (last.body[:140] if last else None),
        "awaiting_me": bool(last and last.author_id != me.id and r.status != "closed"),
    }


def _my_requests(doctor: Doctor):
    return ExpertiseRequest.objects.filter(Q(requester=doctor) | Q(expert=doctor)).select_related(
        "requester__specialty", "expert__specialty", "patient"
    )


@api_view(["GET", "POST"])
def requests(request):
    user = require_user(request)
    me = my_doctor(user)
    if request.method == "GET":
        return Response([summary_dict(r, me) for r in _my_requests(me)[:100]])

    data = body(request)
    expert = Doctor.objects.filter(id=get_uuid(data, "expert_id"), is_verified=True).exclude(id=me.id).first()
    if not expert:
        raise not_found("Confrère introuvable")
    subject = get_str(data, "subject", required=True, min_len=3, max_len=160)
    question = get_str(data, "question", required=True, min_len=10, max_len=5000)
    patient = None
    documents = []
    if patient_id := get_uuid(data, "patient_id", required=False):
        if not doctor_can_see_patient(user, patient_id):
            raise not_found("Patient introuvable parmi vos patients")
        if data.get("patient_informed") is not True:
            raise ApiError("Le patient doit être informé de cette demande d'avis avant l'envoi de son dossier")
        from accounts.models import User

        patient = User.objects.get(id=patient_id)
        doc_ids = data.get("document_ids") or []
        if not isinstance(doc_ids, list) or len(doc_ids) > MAX_DOCUMENTS:
            raise ApiError("Liste de documents invalide")
        # Uniquement des documents que le patient a partagés avec le médecin requérant.
        documents = list(MedicalDocument.objects.filter(id__in=doc_ids, patient=patient, shares__doctor=me).distinct())
        if len(documents) != len(set(doc_ids)):
            raise ApiError("Certains documents ne vous ont pas été partagés par le patient")
    with transaction.atomic():
        req = ExpertiseRequest.objects.create(
            requester=me, expert=expert, patient=patient, subject=subject, patient_informed_at=timezone.now() if patient else None
        )
        req.documents.set(documents)
        ExpertiseMessage.objects.create(request=req, author=me, body=question)
    notify(expert.user, kind="expertise", title=f"Demande d'avis de {me.full_name}", body=subject, link=f"/expertise?demande={req.id}", email=True)
    return Response(summary_dict(req, me))


def _get(request, request_id) -> tuple[ExpertiseRequest, Doctor]:
    me = my_doctor(require_user(request))
    req = _my_requests(me).filter(id=request_id).first()
    if not req:
        raise not_found("Demande introuvable")
    return req, me


@api_view(["GET"])
def detail(request, request_id):
    req, me = _get(request, request_id)
    data = summary_dict(req, me)
    data["messages"] = [
        {"id": str(m.id), "author": m.author.full_name, "mine": m.author_id == me.id, "body": m.body, "created_at": iso(m.created_at)}
        for m in req.messages.select_related("author")
    ]
    if req.patient:
        if req.expert_id == me.id:
            audit.log(request, "patient_file_viewed", patient=req.patient, target=req, via="expertise", requester=req.requester.full_name)
        data["patient"] = {
            "full_name": req.patient.full_name,
            "health_profile": health_profile_dict(HealthProfile.objects.filter(user=req.patient).first()),
        }
        data["documents"] = [
            {"id": str(d.id), "title": d.title, "category": d.category, "url": f"/api/documents/{d.id}/download"} for d in req.documents.all()
        ]
    return Response(data)


@api_view(["POST"])
def reply(request, request_id):
    req, me = _get(request, request_id)
    if req.status == "closed":
        raise ApiError("Cet échange est clôturé")
    ExpertiseMessage.objects.create(request=req, author=me, body=get_str(body(request), "body", required=True, min_len=2, max_len=5000))
    if me.id == req.expert_id:
        req.status = "answered"
    req.save(update_fields=["status", "updated_at"])
    other = req.requester if me.id == req.expert_id else req.expert
    notify(other.user, kind="expertise", title=f"Nouveau message de {me.full_name}", body=req.subject, link=f"/expertise?demande={req.id}")
    return Response({"ok": True})


@api_view(["POST"])
def close(request, request_id):
    req, _ = _get(request, request_id)
    req.status = "closed"
    req.save(update_fields=["status", "updated_at"])
    return Response({"ok": True})


@api_view(["GET"])
def experts(request):
    """Confrères vérifiés à qui adresser une demande (recherche par nom, spécialité ou ville)."""
    me = my_doctor(require_user(request))
    qs = Doctor.objects.filter(is_verified=True).exclude(id=me.id).select_related("specialty")
    if q := (request.query_params.get("q") or "").strip():
        qs = qs.filter(Q(full_name__icontains=q) | Q(specialty__name__icontains=q) | Q(city__icontains=q))
    return Response([_doctor_brief(d) for d in qs.order_by("specialty__name", "full_name")[:50]])


@api_view(["GET"])
def my_patients(request):
    """Patients suivis (RDV confirmé ou terminé) et documents qu'ils m'ont partagés, pour joindre un dossier."""
    user = require_user(request)
    me = my_doctor(user)
    from accounts.models import User

    patients = User.objects.filter(appointments__doctor=me, appointments__status__in=("confirmed", "completed")).distinct().order_by("full_name")
    return Response(
        [
            {
                "id": str(p.id),
                "full_name": p.full_name,
                "documents": [
                    {"id": str(d.id), "title": d.title} for d in MedicalDocument.objects.filter(patient=p, shares__doctor=me).distinct()
                ],
            }
            for p in patients[:300]
        ]
    )
