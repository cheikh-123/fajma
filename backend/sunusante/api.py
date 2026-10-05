"""Outils communs de l'API : erreurs, authentification, limites de débit, validation."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, IntegrityError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import exception_handler as drf_exception_handler


class ApiError(exceptions.APIException):
    """Erreur métier renvoyée au navigateur sous la forme {"error": "..."}."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Requête invalide"

    def __init__(self, message: str, code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.status_code = code


logger = logging.getLogger(__name__)


def not_found(message: str) -> ApiError:
    return ApiError(message, status.HTTP_404_NOT_FOUND)


def forbidden(message: str = "Accès refusé") -> ApiError:
    return ApiError(message, status.HTTP_403_FORBIDDEN)


def exception_handler(exc: Exception, context: dict) -> Response | None:
    if isinstance(exc, DjangoValidationError):
        return Response({"error": " ".join(exc.messages)}, status=400)
    if isinstance(exc, Http404):
        return Response({"error": "Introuvable"}, status=404)
    if isinstance(exc, IntegrityError):
        if "appointment_no_overlap" in str(exc):
            return Response({"error": "Ce créneau vient d'être réservé. Choisissez-en un autre."}, status=409)
        return Response({"error": "Cette opération entre en conflit avec des données existantes."}, status=409)
    if isinstance(exc, DatabaseError):
        # Base de données arrêtée ou injoignable : réponse JSON lisible (503) plutôt qu'une page d'erreur,
        # l'interface affiche alors « service momentanément indisponible ». Le détail reste dans les journaux.
        logger.exception("base de données indisponible")
        return Response({"error": "Service momentanément indisponible. Réessayez dans quelques minutes."}, status=503)
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, exceptions.NotAuthenticated):
        response.data = {"error": "Connexion requise"}
    elif isinstance(exc, exceptions.Throttled):
        response.data = {"error": "Trop de requêtes, réessayez dans un instant."}
    elif isinstance(response.data, dict) and "detail" in response.data:
        response.data = {"error": str(response.data["detail"])}
    elif isinstance(response.data, (dict, list)):
        response.data = {"error": "Données invalides", "fields": response.data}
    return response


class ScopedThrottle(ScopedRateThrottle):
    """Limite de débit par vue (attribut throttle_scope), par utilisateur ou par adresse IP."""


def require_user(request):
    if not request.user or not request.user.is_authenticated:
        raise exceptions.NotAuthenticated()
    return request.user


# ── Validation légère des entrées ───────────────────────────────────


def body(request) -> dict[str, Any]:
    data = request.data if isinstance(request.data, dict) else {}
    return data


def get_str(data: dict, key: str, *, required: bool = False, min_len: int = 0, max_len: int = 1000) -> str | None:
    value = data.get(key)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            raise ApiError(f"Champ obligatoire : {key}")
        return None
    if not isinstance(value, str):
        raise ApiError(f"Champ invalide : {key}")
    value = value.strip()
    if len(value) < min_len or len(value) > max_len:
        raise ApiError(f"Longueur invalide pour {key}")
    return value


def get_uuid(data: dict, key: str, *, required: bool = True) -> uuid.UUID | None:
    value = data.get(key)
    if value in (None, ""):
        if required:
            raise ApiError(f"Champ obligatoire : {key}")
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError as err:
        raise ApiError(f"Identifiant invalide : {key}") from err


def get_int(data: dict, key: str, *, default: int | None = None, min_value: int | None = None, max_value: int | None = None) -> int | None:
    value = data.get(key, default)
    if value is None:
        return None
    try:
        value = int(value)
    except (TypeError, ValueError) as err:
        raise ApiError(f"Nombre invalide : {key}") from err
    if (min_value is not None and value < min_value) or (max_value is not None and value > max_value):
        raise ApiError(f"Valeur hors limites : {key}")
    return value


def get_choice(data: dict, key: str, choices: set[str], *, default: str | None = None) -> str | None:
    value = data.get(key, default)
    if value is None:
        return None
    if value not in choices:
        raise ApiError(f"Valeur invalide : {key}")
    return value


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None
