"""
En-tête du médecin sur les ordonnances et certificats : identité professionnelle, lieu d'exercice,
signature et cachet. Figé à l'émission du document (issuer_snapshot) puis servi avec les images en
data URL (issuer_public), uniquement aux personnes autorisées à voir le document.
"""

import base64
import logging
from datetime import timedelta

from django.utils import timezone

from sunusante.api import ApiError
from sunusante.uploads import read

logger = logging.getLogger(__name__)

# Types acceptés pour la signature et le cachet : ceux que le générateur PDF sait intégrer.
IMAGE_TYPES = {"image/png", "image/jpeg"}
MAX_IMAGE_BYTES = 1_000_000


# Un document peut être rédigé juste avant l'heure (patient en avance), jamais pour une consultation future.
EARLY_MARGIN = timedelta(minutes=30)


def require_started(appointment) -> None:
    """« Certifie avoir examiné ce jour » : interdit avant la consultation."""
    if appointment.scheduled_at > timezone.now() + EARLY_MARGIN:
        raise ApiError("Cette consultation n'a pas encore eu lieu : le document pourra être rédigé le jour du rendez-vous.")


def missing_mentions(doctor) -> list[str]:
    """Mentions obligatoires absentes, qui empêchent de délivrer une ordonnance."""
    missing = []
    if not doctor.order_number:
        missing.append("numéro d'inscription à l'Ordre des médecins")
    if not doctor.signature_path:
        missing.append("signature")
    return missing


def issuer_snapshot(doctor, appointment=None) -> dict:
    """
    Mentions du médecin au moment de l'émission. Lieu : celui du rendez-vous s'il en a un. Un remplaçant
    signe à son nom (et son n° d'Ordre) avec la mention « remplaçant du Dr X », au cabinet du titulaire.
    """
    location = getattr(appointment, "location", None)
    titular = getattr(appointment, "doctor", None)
    replacing = titular if titular is not None and titular.id != doctor.id else None
    place = replacing or doctor
    clinic = None
    if not place.practice_name and not location:
        member = place.clinic_memberships.select_related("clinic").first()
        clinic = member.clinic if member else None
    place_name = location.name if location else place.practice_name or (clinic.name if clinic else "")
    return {
        "full_name": doctor.full_name,
        "specialty": doctor.specialty.name if doctor.specialty else "",
        "title": doctor.professional_title,
        "order_number": doctor.order_number,
        "replacing": replacing.full_name if replacing else "",
        "practice_name": place_name,
        "address": location.address if location else place.address or (clinic.address if clinic else ""),
        "city": location.city if location else place.city,
        "phone": (location.phone if location else "") or place.practice_phone or (clinic.phone if clinic else ""),
        # Les anciens fichiers ne sont jamais supprimés : un document garde la signature de son émission.
        "signature_path": doctor.signature_path,
        "stamp_path": doctor.stamp_path,
    }


def _data_url(relative: str) -> str | None:
    if not relative:
        return None
    try:
        content = read(relative)
    except OSError:
        logger.warning("Image de signature introuvable : %s", relative)
        return None
    mime = "image/png" if content.startswith(b"\x89PNG") else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(content).decode()}"


def issuer_public(snapshot: dict, doctor=None) -> dict:
    """En-tête pour l'affichage et le PDF. Anciens documents sans en-tête figé : fiche actuelle du médecin."""
    data = snapshot or (issuer_snapshot(doctor) if doctor else {})
    return {
        "full_name": data.get("full_name", ""),
        "specialty": data.get("specialty") or None,
        "title": data.get("title") or None,
        "order_number": data.get("order_number") or None,
        "replacing": data.get("replacing") or None,
        "practice_name": data.get("practice_name") or None,
        "address": data.get("address") or None,
        "city": data.get("city") or None,
        "phone": data.get("phone") or None,
        "signature": _data_url(data.get("signature_path", "")),
        "stamp": _data_url(data.get("stamp_path", "")),
    }
