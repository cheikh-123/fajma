"""
Double authentification obligatoire pour les comptes qui accèdent à des données d'autres personnes :
médecins, pharmaciens, cliniques (responsable et secrétariat) et administrateurs.

Tant que la double authentification n'est pas activée, l'API ne répond qu'aux routes de compte
(/api/auth/…, dont l'activation elle-même) : tout le reste renvoie 403 {mfa_setup_required: true}.
La console technique /django-admin/ n'a plus de connexion propre (mot de passe seul) : elle réutilise
la session Fajma, ouverte avec la double authentification.
"""

import time
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import logout
from django.http import JsonResponse
from django.shortcuts import redirect

MFA_SETUP_MESSAGE = (
    "Activez la double authentification pour continuer : elle est obligatoire pour les comptes "
    "professionnels, qui accèdent à des données de santé."
)

# Routes toujours accessibles : connexion, déconnexion, profil minimal, activation de la double authentification.
ALLOWED_PREFIXES = ("/api/auth/", "/api/health", "/api/client-errors", "/api/notifications/push/key", "/api/support")


def is_professional(user) -> bool:
    """Compte qui voit des données d'autres personnes (et doit donc être mieux protégé)."""
    from clinics.models import Clinic, ClinicStaff
    from directory.models import Doctor
    from labs.models import LaboratoryMember
    from pharmacy.models import PharmacyMember

    return bool(
        user.is_staff
        or Doctor.objects.filter(user=user).exists()
        or PharmacyMember.objects.filter(user=user).exists()
        or LaboratoryMember.objects.filter(user=user).exists()
        or Clinic.objects.filter(owner=user).exists()
        or ClinicStaff.objects.filter(user=user).exists()
        or user.queue_roles.exists()
    )


def mfa_enabled(user) -> bool:
    from .models import TwoFactor

    return TwoFactor.objects.filter(user=user, enabled=True).exists()


def needs_mfa_setup(user, session=None) -> bool:
    if not settings.MFA_REQUIRED_FOR_PROS or not user.is_authenticated:
        return False
    # Comptes de démonstration (développement uniquement) : parcours de test sans téléphone.
    if session is not None and session.get("demo"):
        return False
    return is_professional(user) and not mfa_enabled(user)


class MfaRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path.startswith("/api/") and not path.startswith(ALLOWED_PREFIXES):
            if needs_mfa_setup(request.user, request.session):
                return JsonResponse({"error": MFA_SETUP_MESSAGE, "mfa_setup_required": True}, status=403)
        elif path.startswith("/django-admin/") and needs_mfa_setup(request.user, request.session):
            return redirect("/securite")
        return self.get_response(request)


IDLE_MESSAGE = "Session fermée après {minutes} minutes sans activité. Reconnectez-vous."


class IdleTimeoutMiddleware:
    """
    Comptes professionnels : session fermée après PRO_IDLE_MINUTES sans activité de l'utilisateur
    (poste de cabinet ou de clinique laissé ouvert). Les rafraîchissements automatiques de l'écran ne
    comptent pas : l'application envoie dans X-Fajma-Idle le temps écoulé depuis le dernier clic ou la
    dernière frappe, et l'activité retenue est « maintenant − ce délai ».
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/") and settings.PRO_IDLE_MINUTES > 0 and request.user.is_authenticated:
            expired = self._check(request)
            if expired:
                return expired
        return self.get_response(request)

    def _check(self, request):
        session = request.session
        if session.get("demo"):
            return None
        now = int(time.time())
        # Statut professionnel mémorisé dans la session, revérifié toutes les 5 minutes (compte devenu pro).
        if not session.get("pro") and now - session.get("pro_checked_at", 0) > 300:
            session["pro"], session["pro_checked_at"] = is_professional(request.user), now
        if not session.get("pro"):
            return None
        last = session.get("active_at", now)
        if now - last > settings.PRO_IDLE_MINUTES * 60:
            logout(request)
            return JsonResponse(
                {"error": IDLE_MESSAGE.format(minutes=settings.PRO_IDLE_MINUTES), "session_expired": True}, status=401
            )
        # Sans l'en-tête (flux temps réel, lien de téléchargement) : la requête ne prolonge pas la session.
        raw = request.META.get("HTTP_X_FAJMA_IDLE")
        if "active_at" not in session:
            session["active_at"] = now
        elif raw is not None:
            try:
                active = now - min(max(int(raw), 0), 86400)
            except ValueError:
                active = last
            if active - last >= 30:
                session["active_at"] = active
        return None


def admin_login(request, extra_context=None):
    """Remplace la page de connexion de /django-admin/ : connexion Fajma (avec double authentification)."""
    target = request.GET.get("next") or "/django-admin/"
    if not target.startswith("/django-admin/"):
        target = "/django-admin/"
    if request.user.is_authenticated and request.user.is_staff:
        return redirect(target)
    return redirect(f"/auth?redirect={quote(target)}")


def end_sessions(user, keep: str | None = None) -> int:
    """
    Ferme immédiatement toutes les sessions ouvertes du compte (téléphone perdu, compte piraté, suspension),
    sauf éventuellement la session `keep` (celle de l'appareil qui fait la demande). Renvoie le nombre fermé.
    """
    from django.contrib.sessions.models import Session
    from django.utils import timezone

    closed = 0
    for s in Session.objects.filter(expire_date__gt=timezone.now()).exclude(session_key=keep or ""):
        if s.get_decoded().get("_auth_user_id") == str(user.pk):
            s.delete()
            closed += 1
    return closed
