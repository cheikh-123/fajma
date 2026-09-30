"""Notifications de l'application (cloche) et retours de livraison Twilio."""

import hmac

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view
from rest_framework.response import Response

from sunusante.api import iso, require_user

from .models import Notification, SmsReminder

STATUS_MAP = {
    "queued": "sent",
    "sending": "sent",
    "sent": "sent",
    "delivered": "delivered",
    "undelivered": "failed",
    "failed": "failed",
}


@api_view(["GET"])
def my_notifications(request):
    user = require_user(request)
    items = Notification.objects.filter(user=user)[:50]
    return Response(
        {
            "unread": Notification.objects.filter(user=user, read_at__isnull=True).count(),
            "items": [
                {
                    "id": str(n.id),
                    "kind": n.kind,
                    "title": n.title,
                    "body": n.body or None,
                    "link": n.link or None,
                    "read": n.read_at is not None,
                    "created_at": iso(n.created_at),
                }
                for n in items
            ],
        }
    )


@api_view(["POST"])
def mark_notifications_read(request):
    user = require_user(request)
    Notification.objects.filter(user=user, read_at__isnull=True).update(read_at=timezone.now())
    return Response({"ok": True})


@csrf_exempt
@require_POST
def twilio_status(request):
    """Retour de livraison Twilio, authentifié par un jeton secret dans l'URL."""
    expected = settings.TWILIO["STATUS_TOKEN"]
    token = request.GET.get("token", "")
    if not expected or not hmac.compare_digest(token, expected):
        return HttpResponse("Unauthorized", status=401)
    sid = request.POST.get("MessageSid", "")
    status = request.POST.get("MessageStatus", "")
    if not sid or not status:
        return HttpResponse("Bad request", status=400)
    mapped = STATUS_MAP.get(status)
    if mapped:
        error_code = request.POST.get("ErrorCode")
        SmsReminder.objects.filter(provider_sid=sid).update(
            status=mapped,
            last_error=f"Livraison échouée ({status}{f' code {error_code}' if error_code else ''})" if mapped == "failed" else "",
        )
    return HttpResponse("ok")
