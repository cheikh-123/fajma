"""Enregistrement des évènements d'audit. N'interrompt jamais l'action auditée en cas d'échec."""

import logging

from .models import AuditEvent

logger = logging.getLogger(__name__)


def client_ip(request) -> str | None:
    # Derrière le proxy (nginx), l'adresse réelle est la première de X-Forwarded-For.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")) or None


def log(request, action: str, *, actor=None, patient=None, target=None, **metadata) -> None:
    try:
        user = actor if actor is not None else (request.user if getattr(request, "user", None) and request.user.is_authenticated else None)
        AuditEvent.objects.create(
            actor=user,
            patient=patient,
            action=action,
            target_type=type(target).__name__ if target is not None else "",
            target_id=str(getattr(target, "pk", "")) if target is not None else "",
            ip=client_ip(request) if request is not None else None,
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request is not None else ""),
            metadata=metadata,
        )
    except Exception:  # noqa: BLE001
        logger.exception("audit : échec d'enregistrement (%s)", action)
