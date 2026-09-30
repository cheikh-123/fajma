"""
Notifications « push » du navigateur (Web Push, clés VAPID) : l'alerte arrive sur le téléphone même
quand le site est fermé. Gratuit, contrairement au SMS — le SMS reste le canal de secours.

Configuration : WEBPUSH_VAPID_PUBLIC_KEY / WEBPUSH_VAPID_PRIVATE_KEY (générées par
`python manage.py vapid_keys`) et WEBPUSH_CONTACT (mailto:…). Sans clés, la fonction est désactivée.
"""

from __future__ import annotations

import base64
import json
import logging

from django.conf import settings
from django.db import transaction
from django.tasks import task
from rest_framework.decorators import api_view
from rest_framework.response import Response

from sunusante.api import ApiError, body, get_str, require_user

from .models import PushSubscription

logger = logging.getLogger(__name__)


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def enabled() -> bool:
    return bool(settings.WEBPUSH["PUBLIC_KEY"] and settings.WEBPUSH["PRIVATE_KEY"])


@task
def send_push_task(user_id: str, title: str, body: str, link: str) -> int:
    from py_vapid import Vapid01
    from pywebpush import WebPushException, webpush

    vapid = Vapid01.from_raw(_b64url_decode(settings.WEBPUSH["PRIVATE_KEY"]))
    # Charge utile limitée à ~4 Ko : UTF-8 direct (les accents ne sont pas échappés), texte tronqué.
    payload = json.dumps({"title": title[:120], "body": (body or "")[:400], "url": link or "/"}, ensure_ascii=False)
    sent = 0
    for sub in PushSubscription.objects.filter(user_id=user_id):
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload,
                vapid_private_key=vapid,
                vapid_claims={"sub": settings.WEBPUSH["CONTACT"]},
                ttl=24 * 3600,
                timeout=10,
            )
            sent += 1
        except WebPushException as err:
            status = getattr(err.response, "status_code", None)
            if status in (404, 410):  # abonnement expiré ou révoqué par l'utilisateur
                sub.delete()
            else:
                logger.warning("push non envoyé (%s) : %s", status, err)
    return sent


def queue_push(user, title: str, body: str, link: str) -> None:
    if not enabled() or not PushSubscription.objects.filter(user=user).exists():
        return
    transaction.on_commit(lambda: send_push_task.enqueue(str(user.id), title, body, link))


@api_view(["GET"])
def push_key(request):
    return Response({"public_key": settings.WEBPUSH["PUBLIC_KEY"] if enabled() else None})


@api_view(["POST"])
def push_subscribe(request):
    user = require_user(request)
    if not enabled():
        raise ApiError("Notifications push non configurées", 503)
    data = body(request)
    endpoint = get_str(data, "endpoint", required=True, max_len=500)
    if not endpoint.startswith("https://"):
        raise ApiError("Abonnement invalide")
    keys = data.get("keys") if isinstance(data.get("keys"), dict) else {}
    p256dh = get_str(keys, "p256dh", required=True, max_len=200)
    auth = get_str(keys, "auth", required=True, max_len=100)
    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={"user": user, "p256dh": p256dh, "auth": auth, "user_agent": request.META.get("HTTP_USER_AGENT", "")[:200]},
    )
    return Response({"ok": True, "devices": PushSubscription.objects.filter(user=user).count()})


@api_view(["POST"])
def push_unsubscribe(request):
    user = require_user(request)
    endpoint = get_str(body(request), "endpoint", required=True, max_len=500)
    PushSubscription.objects.filter(user=user, endpoint=endpoint).delete()
    return Response({"ok": True})
