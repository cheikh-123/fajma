"""
Droits des rôles de l'équipe : un contrôle unique sur toutes les adresses /api/admin/… (aucune vue oubliée).
Chaque adresse appartient à une rubrique ; chaque rôle ouvre certaines rubriques ; le super-administrateur
ouvre tout. Un compte staff sans rôle enregistré est super-administrateur (comportement d'avant).
"""

from __future__ import annotations

from django.http import JsonResponse

# Préfixe d'adresse (après /api/admin/) → rubrique. Le plus long préfixe l'emporte.
SECTION_BY_PREFIX = {
    "overview": "pilotage", "todo": "pilotage", "analytics": "pilotage", "activity-report": "pilotage", "search": "pilotage", "me": "pilotage",
    "credentials": "validation", "verification": "validation", "doctors": "validation", "pharmacies": "validation",
    "pharmacy-members": "validation", "laboratories": "validation", "community-agents": "validation", "clinics": "validation",
    "finance": "finance", "payouts": "finance", "refunds": "finance",
    "support": "support", "users": "support", "reviews": "support", "sms": "support",
    "epidemio": "sante", "declarations": "sante",
    "partners": "communication", "campaigns": "communication", "announcements": "communication",
    "settings": "systeme", "act-letters": "systeme", "staff": "systeme", "audit": "systeme",
}
ROLE_SECTIONS = {
    "superadmin": {"pilotage", "validation", "finance", "support", "sante", "communication", "systeme"},
    "validation": {"pilotage", "validation", "support"},
    "support": {"pilotage", "support"},
    "finance": {"pilotage", "finance"},
    "sante": {"pilotage", "sante"},
    "communication": {"pilotage", "communication"},
}


def role_of(user) -> str | None:
    if not getattr(user, "is_authenticated", False) or not user.is_staff:
        return None
    role = getattr(getattr(user, "staff_role", None), "role", None)
    return role or "superadmin"


def sections_of(user) -> list[str]:
    role = role_of(user)
    return sorted(ROLE_SECTIONS.get(role, set())) if role else []


def section_for(path: str) -> str:
    rest = path.removeprefix("/api/admin/")
    first = rest.split("/", 1)[0]
    return SECTION_BY_PREFIX.get(first, "systeme")  # adresse inconnue : réservée au super-administrateur


def allowed(user, path: str) -> bool:
    """Vrai si l'adresse est ouverte au rôle (toute adresse hors /api/admin/ : la vue fait son propre contrôle)."""
    if not path.startswith("/api/admin/"):
        return True
    role = role_of(user)
    return bool(role) and section_for(path) in ROLE_SECTIONS.get(role, set())


class AdminRoleMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/admin/"):
            user = getattr(request, "user", None)
            if role_of(user) and not allowed(user, request.path):
                return JsonResponse({"error": "Votre rôle ne donne pas accès à cette partie de l'administration"}, status=403)
        return self.get_response(request)
