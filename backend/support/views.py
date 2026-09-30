"""Page « Aide et contact » : envoi d'une demande (public, limité) et suivi par l'administration."""

import re

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.views import enforce_csrf, require_admin
from audit import log as audit
from notifications.service import notify
from notifications.tasks import queue_email
from sunusante.api import ApiError, ScopedThrottle, body, get_choice, get_str, iso, not_found

from .models import SupportRequest

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE = re.compile(r"^\+?[\d\s.-]{8,20}$")


class SupportThrottle(ScopedThrottle):
    scope = "support"


def support_dict(r: SupportRequest) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "contact": r.contact,
        "topic": r.topic,
        "topic_label": r.get_topic_display(),
        "message": r.message,
        "status": r.status,
        "admin_note": r.admin_note or None,
        "created_at": iso(r.created_at),
        "closed_at": iso(r.closed_at) if r.closed_at else None,
        "has_account": r.user_id is not None,
    }


@api_view(["POST"])
@throttle_classes([SupportThrottle])
def create_request(request):
    enforce_csrf(request)
    data = body(request)
    if data.get("website"):  # champ invisible : rempli uniquement par les robots
        return Response({"ok": True})
    user = request.user if request.user.is_authenticated else None
    name = get_str(data, "name", max_len=120) or (user.full_name if user else "")
    contact = (get_str(data, "contact", max_len=254) or "").strip() or (user.email or user.phone if user else "")
    if len(name) < 2:
        raise ApiError("Indiquez votre nom")
    if not (EMAIL.match(contact) or PHONE.match(contact)):
        raise ApiError("Indiquez un email ou un numéro de téléphone valide pour que nous puissions vous répondre")
    req = SupportRequest.objects.create(
        user=user,
        name=name,
        contact=contact,
        topic=get_choice(data, "topic", {k for k, _ in SupportRequest.TOPICS}),
        message=get_str(data, "message", required=True, min_len=10, max_len=3000),
    )
    subject = f"Fajma — demande d'aide : {req.get_topic_display()}"
    text = f"{req.name} ({req.contact}) :\n\n{req.message}\n\nÀ traiter dans l'administration, rubrique Support."
    for email in settings.ALERT_EMAILS:
        queue_email(email, subject, text)
    if user:
        notify(user, kind="support", title="Demande d'aide reçue", body="L'équipe Fajma vous répond par email ou par téléphone, les jours ouvrés.", link="/aide")
    return Response({"ok": True, "id": str(req.id)})


@api_view(["GET"])
def admin_list(request):
    require_admin(request)
    status = request.query_params.get("status", "open")
    qs = SupportRequest.objects.all() if status == "all" else SupportRequest.objects.filter(status=status)
    return Response([support_dict(r) for r in qs[:100]])


@api_view(["POST"])
def admin_close(request, request_id):
    admin = require_admin(request)
    req = SupportRequest.objects.filter(id=request_id).first()
    if not req:
        raise not_found("Demande introuvable")
    data = body(request)
    reopen = bool(data.get("reopen"))
    req.status = "open" if reopen else "closed"
    req.closed_at = None if reopen else timezone.now()
    req.admin_note = get_str(data, "note", max_len=500) or req.admin_note
    req.save(update_fields=["status", "closed_at", "admin_note", "updated_at"])
    audit.log(request, "admin_support_closed" if not reopen else "admin_support_reopened", actor=admin, target=req)
    return Response(support_dict(req))
