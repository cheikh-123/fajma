"""Points d'entrée techniques : santé du service (supervision) et erreurs remontées par le navigateur."""

import logging

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from .api import ScopedThrottle, body

logger = logging.getLogger("fajma.client")


def health(request):
    """
    Utilisé par la supervision et le répartiteur de charge : 200 si la base répond.
    Détail de chaque composant (base, antivirus, rappels, sauvegarde, disque, services tiers configurés) pour
    l'équipe Fajma connectée ou avec ?token=HEALTH_TOKEN (supervision externe) ; jamais pour le public.
    """
    import hmac

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:  # noqa: BLE001
        logger.exception("health : base de données injoignable")
        return JsonResponse({"status": "error"}, status=503)
    token = request.GET.get("token", "")
    user = getattr(request, "user", None)
    detailed = (user is not None and user.is_authenticated and user.is_staff) or (
        settings.HEALTH_TOKEN and token and hmac.compare_digest(token, settings.HEALTH_TOKEN)
    )
    if not detailed:
        return JsonResponse({"status": "ok"})
    from audit.management.commands.monitor import run_checks

    checks = {name: problem or "ok" for name, problem in run_checks().items()}
    checks["SMS (Twilio)"] = "configuré" if settings.TWILIO["ACCOUNT_SID"] else "non configuré"
    checks["paiement (PayDunya)"] = f"configuré ({settings.PAYDUNYA['MODE']})" if settings.PAYDUNYA["MASTER_KEY"] else "non configuré"
    degraded = any(v not in {"ok"} and not v.startswith(("configuré", "non configuré")) for v in checks.values())
    return JsonResponse({"status": "degraded" if degraded else "ok", "checks": checks})


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
