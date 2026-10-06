"""
Envoi d'une annonce groupée en arrière-plan : des milliers de destinataires ne tiennent pas dans une requête
web (expiration, envoi à moitié fait, aucune trace). L'annonce est d'abord enregistrée, puis cette tâche
l'envoie par paquets ; elle peut être relancée sans tout refaire (les destinataires déjà prévenus sont sautés).
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.tasks import task

from notifications.models import Notification, PushSubscription
from notifications.push import send_push_task
from notifications.sms import normalize_phone
from notifications.tasks import queue_email, queue_sms

from .audience import MAX_RECIPIENTS, resolve
from .models import Announcement

logger = logging.getLogger(__name__)
BATCH = 500


@task
def send_announcement_task(announcement_id: str) -> int:
    a = Announcement.objects.filter(id=announcement_id).first()
    if a is None:
        return 0
    users = list(resolve(a.audience, a.city)[:MAX_RECIPIENTS])
    # Relance après une panne : on ne prévient pas deux fois les mêmes personnes.
    already = set(
        Notification.objects.filter(kind="announcement", title=a.title, created_at__gte=a.created_at).values_list("user_id", flat=True)
    )
    users = [u for u in users if u.id not in already]
    pushable = set(PushSubscription.objects.filter(user__in=users).values_list("user_id", flat=True))
    sent = len(already)
    for start in range(0, len(users), BATCH):
        batch = users[start : start + BATCH]
        try:
            with transaction.atomic():
                Notification.objects.bulk_create(
                    [Notification(user=u, kind="announcement", title=a.title, body=a.body, link=a.link) for u in batch]
                )
                for u in batch:
                    if u.id in pushable:
                        transaction.on_commit(lambda uid=u.id: send_push_task.enqueue(str(uid), a.title, a.body, a.link))
                    if a.sms and (phone := normalize_phone(u.phone)):
                        queue_sms(phone, f"Fajma — {a.title}. {a.body}".strip(), u.notification_channel)
                    if a.email and u.email:
                        queue_email(u.email, f"Fajma — {a.title}", a.body or a.title)
            sent += len(batch)
        except Exception:  # noqa: BLE001
            logger.exception("annonce %s : paquet non envoyé", a.id)
    Announcement.objects.filter(id=a.id).update(recipients=sent)
    return sent
