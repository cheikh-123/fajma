"""
Avis patients : réponse publique du médecin, signalement, modération par l'administration.
Règle : le médecin ne peut ni modifier ni supprimer un avis ; il peut répondre ou le signaler.
"""

import re

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.views import my_doctor
from audit import log as audit
from sunusante.api import ApiError, body, get_choice, get_str, iso, not_found, require_user

from .models import Review, refresh_doctor_rating

# Coordonnées dans un avis public : numéro de téléphone ou email (vie privée, démarchage).
CONTACT_PATTERN = re.compile(r"(\+?\d[\d .-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)")


def auto_moderation_reason(comment: str) -> str:
    if CONTACT_PATTERN.search(comment or ""):
        return "Coordonnées personnelles dans l'avis (vérification automatique)"
    return ""


def public_review_dict(r: Review) -> dict:
    return {
        "id": str(r.id),
        "rating": r.rating,
        "comment": r.comment or None,
        "created_at": iso(r.created_at),
        "doctor_reply": r.doctor_reply or None,
        "replied_at": iso(r.replied_at),
    }


def pro_review_dict(r: Review) -> dict:
    return {**public_review_dict(r), "status": r.status, "report_reason": r.report_reason or None}


@api_view(["GET"])
def pro_reviews(request):
    doctor = my_doctor(require_user(request))
    return Response([pro_review_dict(r) for r in Review.objects.filter(doctor=doctor)[:200]])


def _my_review(request, review_id) -> Review:
    doctor = my_doctor(require_user(request))
    review = Review.objects.filter(id=review_id, doctor=doctor).first()
    if not review:
        raise not_found("Avis introuvable")
    return review


@api_view(["POST"])
def pro_reply(request, review_id):
    review = _my_review(request, review_id)
    reply = get_str(body(request), "reply", max_len=1000) or ""
    if reply and len(reply) < 5:
        raise ApiError("Réponse trop courte")
    review.doctor_reply = reply
    review.replied_at = timezone.now() if reply else None
    review.save(update_fields=["doctor_reply", "replied_at", "updated_at"])
    return Response(pro_review_dict(review))


@api_view(["POST"])
def pro_report(request, review_id):
    review = _my_review(request, review_id)
    if review.status != "published":
        raise ApiError("Cet avis est déjà signalé ou masqué")
    review.status = "reported"
    review.report_reason = get_str(body(request), "reason", required=True, min_len=5, max_len=300)
    review.reported_at = timezone.now()
    review.save(update_fields=["status", "report_reason", "reported_at", "updated_at"])
    return Response(pro_review_dict(review))


@api_view(["GET"])
def admin_reviews(request):
    require_admin(request)
    # À traiter : avis signalés par un médecin (encore visibles) et avis retenus automatiquement (masqués).
    pending = Q(status="reported") | Q(status="hidden", moderated_at__isnull=True)
    reviews = Review.objects.filter(pending).select_related("doctor", "patient").order_by("reported_at")
    return Response(
        [
            {**pro_review_dict(r), "doctor_name": r.doctor.full_name, "patient_name": r.patient.full_name, "reported_at": iso(r.reported_at)}
            for r in reviews
        ]
    )


@api_view(["POST"])
def admin_moderate(request, review_id):
    require_admin(request)
    decision = get_choice(body(request), "decision", {"publish", "hide"})
    with transaction.atomic():
        review = Review.objects.select_for_update().filter(id=review_id).first()
        if not review:
            raise not_found("Avis introuvable")
        review.status = "published" if decision == "publish" else "hidden"
        review.moderated_at = timezone.now()
        review.save(update_fields=["status", "moderated_at", "updated_at"])
    refresh_doctor_rating(review.doctor)
    audit.log(request, "admin_verification", kind="review", id=str(review.id), decision=decision)
    return Response({"ok": True})
