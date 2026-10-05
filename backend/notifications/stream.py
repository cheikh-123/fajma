"""
Temps réel : flux d'événements (Server-Sent Events) de l'utilisateur connecté — nouveaux messages et
nouvelles notifications arrivent dans le navigateur sans attendre une actualisation.

Le navigateur garde une connexion `EventSource` ouverte ; le serveur vérifie la base toutes les
EVENTS_POLL_SECONDS et envoie ce qui est nouveau. La connexion est fermée au bout de EVENTS_STREAM_SECONDS
et le navigateur la rouvre seul (champ `retry`). Production : serveur ASGI (uvicorn), où une connexion
ouverte ne mobilise pas de processus ; développement : serveur Django classique.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import timedelta

from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.handlers.asgi import ASGIRequest
from django.db.models import Q
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone

from messaging.models import Message

from .models import Notification

HEARTBEAT_SECONDS = 15
OVERLAP = timedelta(seconds=5)  # marge : un message validé juste après la lecture précédente n'est pas perdu


class _Cursor:
    """Ce qui a déjà été envoyé sur cette connexion."""

    def __init__(self, user):
        self.user = user
        self.since = timezone.now()
        self.sent: set = set()
        self.first = True

    def fetch(self) -> list[str]:
        # Première lecture : rien d'antérieur à la connexion (déjà affiché par la page elle-même).
        after = self.since if self.first else self.since - OVERLAP
        self.first = False
        chunks = []
        messages = (
            Message.objects.filter(Q(patient=self.user) | Q(doctor__user=self.user), created_at__gt=after)
            .exclude(sender=self.user)
            .select_related("doctor", "sender")
            .order_by("created_at")[:50]
        )
        for m in messages:
            if m.id in self.sent:
                continue
            self.sent.add(m.id)
            payload = {
                "id": str(m.id),
                "doctor_id": str(m.doctor_id),
                "patient_id": str(m.patient_id),
                "from": m.sender.full_name,
                "preview": m.body[:120],
            }
            chunks.append(f"event: message\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n")
        for n in Notification.objects.filter(user=self.user, created_at__gt=after).order_by("created_at")[:50]:
            if n.id in self.sent:
                continue
            self.sent.add(n.id)
            payload = {"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body, "link": n.link}
            chunks.append(f"event: notification\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n")
        self.since = timezone.now()
        return chunks


def _fetch_and_release(cursor: _Cursor):
    """Lecture puis fermeture de la connexion du fil d'exécution : pas de connexion PostgreSQL retenue entre deux lectures."""
    from django.db import connection

    def run() -> list[str]:
        try:
            return cursor.fetch()
        finally:
            connection.close()

    return run


def _sync_stream(cursor: _Cursor):
    deadline = time.monotonic() + settings.EVENTS_STREAM_SECONDS
    last_beat = time.monotonic()
    yield "retry: 3000\n\n"
    while time.monotonic() < deadline:
        yield from cursor.fetch()
        if time.monotonic() - last_beat >= HEARTBEAT_SECONDS:
            last_beat = time.monotonic()
            yield ": ping\n\n"  # garde la connexion ouverte à travers les proxys
        time.sleep(settings.EVENTS_POLL_SECONDS)


async def _async_stream(cursor: _Cursor):
    deadline = time.monotonic() + settings.EVENTS_STREAM_SECONDS
    last_beat = time.monotonic()
    fetch = sync_to_async(_fetch_and_release(cursor), thread_sensitive=False)
    yield "retry: 3000\n\n"
    while time.monotonic() < deadline:
        for chunk in await fetch():
            yield chunk
        if time.monotonic() - last_beat >= HEARTBEAT_SECONDS:
            last_beat = time.monotonic()
            yield ": ping\n\n"
        await asyncio.sleep(settings.EVENTS_POLL_SECONDS)


def event_stream(request):
    if not request.user.is_authenticated:
        return HttpResponse(status=401)
    cursor = _Cursor(request.user)
    stream = _async_stream(cursor) if isinstance(request, ASGIRequest) else _sync_stream(cursor)
    response = StreamingHttpResponse(stream, content_type="text/event-stream; charset=utf-8")
    response["Cache-Control"] = "no-cache, no-transform"
    response["X-Accel-Buffering"] = "no"  # nginx : envoyer chaque événement immédiatement
    return response
