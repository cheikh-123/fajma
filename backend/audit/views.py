"""Consultation du journal d'audit : le patient voit qui a accédé à son dossier ; l'administration voit tout."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from sunusante.api import iso, require_user

from .models import AuditEvent

PATIENT_VISIBLE = ("patient_file_viewed", "document_viewed", "prescription_viewed", "record_written")


def _actor_label(e: AuditEvent) -> str:
    if not e.actor:
        return "Compte supprimé"
    doctor = getattr(e.actor, "doctor", None)
    return doctor.full_name if doctor else (e.actor.full_name or e.actor.email or "Utilisateur")


@api_view(["GET"])
def my_access_log(request):
    """Qui a consulté mon dossier (hors moi-même) ?"""
    user = require_user(request)
    events = (
        AuditEvent.objects.filter(patient=user, action__in=PATIENT_VISIBLE)
        .exclude(actor=user)
        .select_related("actor__doctor")[:100]
    )
    return Response(
        [{"id": str(e.id), "action": e.get_action_display(), "who": _actor_label(e), "at": iso(e.created_at)} for e in events]
    )
