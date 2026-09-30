"""Points d'entrée techniques : santé du service (supervision) et erreurs remontées par le navigateur."""

import logging

from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from .api import ScopedThrottle, body

logger = logging.getLogger("fajma.client")


def health(request):
    """Utilisé par la supervision et le répartiteur de charge : 200 si la base répond."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "ok"})
    except Exception:  # noqa: BLE001
        logger.exception("health : base de données injoignable")
        return JsonResponse({"status": "error"}, status=503)


class ClientErrorThrottle(ScopedThrottle):
    scope = "client_errors"


@api_view(["POST"])
@throttle_classes([ClientErrorThrottle])
def client_error(request):
    """Erreur d'affichage survenue chez un utilisateur. Aucune donnée personnelle n'est transmise."""
    data = body(request)
    message = str(data.get("message", ""))[:500]
    route = str(data.get("route", ""))[:200]
    logger.warning("Erreur navigateur sur %s : %s", route, message)
    try:
        import sentry_sdk

        sentry_sdk.capture_message(f"[navigateur] {message}", level="error", tags={"route": route})
    except Exception:  # noqa: BLE001
        pass
    return Response({"ok": True})
