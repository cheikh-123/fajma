"""
Alerte « nouvelle connexion » : chaque navigateur reçoit un jeton aléatoire (cookie HttpOnly, 2 ans).
Une connexion depuis un navigateur que le compte n'a jamais utilisé prévient son titulaire (email, ou SMS
s'il n'a pas d'email) : un vol de mot de passe, de puce (SIM swap) ou de session est repéré tout de suite.
"""

import hashlib
import re
import secrets
import time

from django.conf import settings
from django.utils import timezone

COOKIE = "fajma_device"
MAX_AGE = 60 * 60 * 24 * 730


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def describe(user_agent: str) -> str:
    """Résumé lisible du navigateur (« Chrome sur Android »), sans conserver l'en-tête complet."""
    ua = user_agent or ""
    browser = next(
        (name for pattern, name in [(r"Edg/", "Edge"), (r"OPR/|Opera", "Opera"), (r"Firefox/", "Firefox"),
                                    (r"Chrome/", "Chrome"), (r"Safari/", "Safari")] if re.search(pattern, ua)),
        "Navigateur",
    )
    system = next(
        (name for pattern, name in [(r"Android", "Android"), (r"iPhone|iPad", "iPhone/iPad"), (r"Windows", "Windows"),
                                    (r"Mac OS X", "Mac"), (r"Linux", "Linux")] if re.search(pattern, ua)),
        "appareil inconnu",
    )
    return f"{browser} sur {system}"


def on_login(sender, request, user, **kwargs):
    from notifications.service import notify

    from .models import KnownDevice

    if request is None:
        return
    request = getattr(request, "_request", request)  # vue DRF : le cookie est posé sur la requête Django
    # Nouvelle session : le compteur d'inactivité repart de zéro et le statut professionnel est revérifié.
    request.session["active_at"] = int(time.time())
    request.session.pop("pro_checked_at", None)
    token = request.COOKIES.get(COOKIE, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,64}", token):
        token = secrets.token_urlsafe(32)
        request._fajma_device_cookie = token
    now = timezone.now()
    if KnownDevice.objects.filter(user=user, token_hash=_hash(token)).update(last_seen_at=now):
        return
    first = not KnownDevice.objects.filter(user=user).exists()
    label = describe(request.META.get("HTTP_USER_AGENT", ""))
    KnownDevice.objects.create(user=user, token_hash=_hash(token), label=label)
    if first or request.path.endswith("/demo-login"):
        return  # premier appareil du compte, ou accès de démonstration : rien d'inhabituel
    when = timezone.localtime(now).strftime("%d/%m/%Y à %H:%M")
    notify(
        user,
        kind="security",
        title="Nouvelle connexion à votre compte",
        body=f"{label}, le {when}. Si ce n'est pas vous, changez votre mot de passe et contactez l'équipe Fajma.",
        link="/securite",
        email=bool(user.email),
        sms=not user.email,
    )


class KnownDeviceMiddleware:
    """Pose le cookie d'appareil choisi lors de la connexion."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        token = getattr(request, "_fajma_device_cookie", None)
        if token:
            response.set_cookie(COOKIE, token, max_age=MAX_AGE, httponly=True, secure=not settings.DEBUG, samesite="Lax")
        return response
