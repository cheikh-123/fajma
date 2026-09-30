"""
Tâches en arrière-plan : les envois (SMS, WhatsApp, email) ne ralentissent jamais une requête.
Production : `python manage.py db_worker` traite la file. Local : exécution immédiate.
"""

import logging

from django.core.mail import send_mail
from django.db import transaction
from django.tasks import task

from .sms import send_message

logger = logging.getLogger(__name__)


@task
def send_sms_task(to: str, body: str, channel: str = "sms") -> dict:
    result = send_message(to=to, body=body, channel=channel)
    if not result.ok:
        logger.warning("SMS non envoyé à %s : %s", to[-4:].rjust(len(to), "*"), result.error)
    return {"ok": result.ok, "sid": result.sid, "channel": result.channel, "error": result.error}


@task
def send_email_task(to: str, subject: str, body: str) -> bool:
    send_mail(subject, body, None, [to], fail_silently=False)
    return True


def queue_sms(to: str, body: str, channel: str = "sms") -> None:
    """Met l'envoi en file une fois la transaction validée (jamais de SMS pour une action annulée)."""
    transaction.on_commit(lambda: send_sms_task.enqueue(to, body, channel))


def queue_email(to: str, subject: str, body: str) -> None:
    transaction.on_commit(lambda: send_email_task.enqueue(to, subject, body))
