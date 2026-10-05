"""
Traçabilité des rendez-vous : chaque création, confirmation, déplacement, annulation ou fin de consultation
est enregistrée dans AppointmentEvent avec son auteur (patient, médecin, secrétariat…), automatiquement.

Les signaux du modèle captent toutes les modifications, d'où qu'elles viennent (patient, agenda du médecin,
secrétariat, clinique, WhatsApp, USSD, tâches planifiées). L'auteur est l'utilisateur de la requête en cours,
mémorisé par CurrentRequestMiddleware ; sans requête (tâche automatique), l'auteur est « Fajma (automatique) ».
"""

from __future__ import annotations

import logging
from contextvars import ContextVar

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Appointment, AppointmentEvent

logger = logging.getLogger(__name__)

_request: ContextVar = ContextVar("fajma_request", default=None)
TRACKED = {"status", "scheduled_at", "duration_minutes", "arrived_at"}


class CurrentRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _request.set(request)
        try:
            return self.get_response(request)
        finally:
            _request.reset(token)


def current_actor():
    request = _request.get()
    user = getattr(request, "user", None) if request is not None else None
    return user if user is not None and user.is_authenticated else None


@receiver(pre_save, sender=Appointment)
def _remember_previous(sender, instance: Appointment, update_fields=None, raw=False, **kwargs):
    instance._history_previous = None
    if raw or instance._state.adding or (update_fields is not None and not TRACKED & set(update_fields)):
        return
    instance._history_previous = (
        Appointment.objects.filter(pk=instance.pk).values("status", "scheduled_at", "duration_minutes", "arrived_at").first()
    )


@receiver(post_save, sender=Appointment)
def _record_change(sender, instance: Appointment, created: bool, raw=False, **kwargs):
    # raw : chargement de données (transfert, restauration de fixtures) — l'historique d'origine est chargé
    # tel quel, rien n'est inventé.
    if raw:
        return
    try:
        actor = current_actor()
        if created:
            note = "Pris par le secrétariat ou le médecin" if instance.booked_by_id and instance.booked_by_id != instance.patient_id else ""
            AppointmentEvent.objects.create(
                appointment=instance, actor=actor, action="created", to_status=instance.status, to_at=instance.scheduled_at, note=note
            )
            return
        before = getattr(instance, "_history_previous", None)
        if not before:
            return
        moved = before["scheduled_at"] != instance.scheduled_at or before["duration_minutes"] != instance.duration_minutes
        if moved:
            AppointmentEvent.objects.create(
                appointment=instance, actor=actor, action="rescheduled", from_at=before["scheduled_at"], to_at=instance.scheduled_at
            )
        if before["status"] != instance.status:
            action = instance.status if instance.status in {"confirmed", "cancelled", "completed", "no_show"} else "status"
            note = instance.cancel_reason if instance.status == "cancelled" else ""
            AppointmentEvent.objects.create(
                appointment=instance, actor=actor, action=action, from_status=before["status"], to_status=instance.status, note=note[:300]
            )
        if not before["arrived_at"] and instance.arrived_at:
            AppointmentEvent.objects.create(appointment=instance, actor=actor, action="arrived")
    except Exception:  # noqa: BLE001 — l'historique ne doit jamais empêcher la prise ou la modification d'un RDV
        logger.exception("historique du rendez-vous %s : échec", instance.pk)


def actor_role(event: AppointmentEvent) -> str:
    """Qualité de l'auteur, vue depuis le rendez-vous : patient, médecin, remplaçant, secrétariat, administration."""
    appt, user = event.appointment, event.actor
    if user is None:
        return "Compte supprimé" if event.actor_id else "Fajma (automatique)"
    if user.pk == appt.patient_id:
        return "Patient"
    if user.pk == appt.doctor.user_id:
        return "Médecin"
    if appt.practitioner_id and user.pk == appt.practitioner.user_id:
        return "Médecin remplaçant"
    if user.is_staff:
        return "Administration Fajma"
    return "Secrétariat"


def history(appt: Appointment, *, for_patient: bool = False) -> list[dict]:
    """Historique lisible. Côté patient, le nom des membres du cabinet n'est pas montré (seulement leur rôle)."""
    labels = dict(AppointmentEvent.ACTIONS)
    out = []
    for e in appt.events.select_related("actor"):
        role = actor_role(e)
        name = e.actor.full_name if e.actor and not (for_patient and role == "Secrétariat") else None
        out.append(
            {
                "at": e.created_at.isoformat(),
                "action": e.action,
                "label": labels.get(e.action, e.action),
                "by_role": role,
                "by_name": name,
                "from_at": e.from_at.isoformat() if e.from_at else None,
                "to_at": e.to_at.isoformat() if e.to_at else None,
                "note": e.note or None,
            }
        )
    return out
