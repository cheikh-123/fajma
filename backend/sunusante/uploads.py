"""
Fichiers déposés (documents médicaux, justificatifs des médecins) : décodage, contrôle du type réel,
analyse antivirus, chiffrement sur le disque et service sécurisé.

Le type annoncé par le navigateur n'est jamais cru : il est déduit des premiers octets du fichier.
Seuls PDF, JPEG, PNG et WebP sont acceptés — un fichier HTML ou SVG déguisé est refusé, ce qui
empêche d'exécuter du code dans la page de l'application lorsqu'un document est ouvert.

Chaque fichier est chiffré (Fernet : AES-128 + HMAC-SHA256) avec FILE_ENCRYPTION_KEYS avant d'être écrit :
un disque, un volume ou une sauvegarde volés ne livrent aucun document lisible sans la clé, conservée
hors des sauvegardes. Les fichiers écrits avant le chiffrement restent lisibles (commande encrypt_files).
"""

import base64
import binascii
import logging
import re
import socket
import struct
import time
from functools import cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.http import HttpResponse

from .api import ApiError, forbidden, get_str

logger = logging.getLogger(__name__)

SIGNATURES = [
    (b"%PDF-", "application/pdf", ".pdf"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
]
# En-tête des fichiers chiffrés : distingue un fichier chiffré d'un ancien fichier en clair.
ENCRYPTED_MAGIC = b"FAJMA-ENC1\n"


def sniff(content: bytes) -> tuple[str, str] | None:
    for magic, mime, ext in SIGNATURES:
        if content.startswith(magic):
            return mime, ext
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def decode_upload(data: dict) -> tuple[bytes, str, str]:
    """Renvoie (contenu, type MIME réel, nom de fichier sûr)."""
    file_name = get_str(data, "file_name", required=True, max_len=200)
    try:
        content = base64.b64decode(data.get("content_base64") or "", validate=True)
    except (binascii.Error, ValueError) as err:
        raise ApiError("Fichier illisible") from err
    if not content:
        raise ApiError("Fichier vide")
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise ApiError("Fichier trop volumineux (max 6 Mo)")
    kind = sniff(content)
    if not kind:
        raise ApiError("Format non accepté : envoyez un PDF ou une photo (JPEG, PNG, WebP)")
    mime, ext = kind
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(file_name).stem)[-60:] or "document"
    return content, mime, f"{stem}{ext}"


# ── Antivirus (ClamAV) ───────────────────────────────────────────────


def _clamd_scan(content: bytes) -> str | None:
    """Envoie le fichier à clamd (protocole INSTREAM) ; renvoie le nom du virus trouvé, sinon None."""
    host, _, port = settings.CLAMAV_ADDRESS.rpartition(":")
    with socket.create_connection((host, int(port)), timeout=settings.CLAMAV_TIMEOUT) as sock:
        sock.sendall(b"zINSTREAM\0")
        for i in range(0, len(content), 64 * 1024):
            chunk = content[i : i + 64 * 1024]
            sock.sendall(struct.pack(">I", len(chunk)) + chunk)
        sock.sendall(struct.pack(">I", 0))
        reply = b""
        while not reply.endswith(b"\0"):
            part = sock.recv(4096)
            if not part:
                break
            reply += part
    answer = reply.rstrip(b"\0").decode(errors="replace")
    if answer.endswith("OK"):
        return None
    if answer.endswith("FOUND"):
        return answer.removeprefix("stream:").removesuffix("FOUND").strip() or "inconnu"
    raise OSError(f"réponse clamd inattendue : {answer[:120]}")


def scan(content: bytes) -> None:
    """Refuse un fichier infecté. Antivirus configuré mais injoignable : refus (on ne stocke rien d'inspecté à moitié)."""
    if not settings.CLAMAV_ADDRESS:
        return
    try:
        virus = _clamd_scan(content)
    except (OSError, ValueError) as err:
        logger.error("antivirus injoignable : %s", err)
        raise ApiError("Analyse antivirus momentanément indisponible : réessayez dans quelques minutes.", 503) from err
    if virus:
        logger.warning("fichier refusé, virus détecté : %s", virus)
        raise ApiError("Fichier refusé : l'analyse antivirus a détecté une menace.")


# ── Chiffrement sur le disque ────────────────────────────────────────


@cache
def _cipher() -> MultiFernet:
    # La première clé chiffre ; les suivantes (anciennes clés) servent seulement à relire : rotation sans coupure.
    return MultiFernet([Fernet(key) for key in settings.FILE_ENCRYPTION_KEYS])


def encrypt(content: bytes) -> bytes:
    return ENCRYPTED_MAGIC + _cipher().encrypt(content)


def decrypt(raw: bytes) -> bytes:
    if not raw.startswith(ENCRYPTED_MAGIC):
        return raw  # fichier déposé avant le chiffrement
    try:
        return _cipher().decrypt(raw[len(ENCRYPTED_MAGIC) :])
    except InvalidToken as err:
        raise OSError("fichier chiffré illisible (clé absente ou fichier altéré)") from err


SEALED_PREFIX = "fernet:"


def seal_text(text: str) -> str:
    """Petit secret stocké en base (ex. secret de double authentification), chiffré avec la clé des fichiers :
    une copie volée de la base ou d'une sauvegarde ne suffit pas à le lire."""
    return SEALED_PREFIX + _cipher().encrypt(text.encode()).decode()


def unseal_text(value: str) -> str:
    if not value.startswith(SEALED_PREFIX):
        return value  # valeur enregistrée avant le chiffrement
    try:
        return _cipher().decrypt(value[len(SEALED_PREFIX) :].encode()).decode()
    except InvalidToken as err:
        raise ValueError("secret chiffré illisible (clé FILE_ENCRYPTION_KEYS absente ou différente)") from err


def storage_path(relative: str) -> Path:
    root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
    path = (root / relative).resolve()
    if root not in path.parents:
        raise forbidden()
    return path


def store(folder: str, safe_name: str, content: bytes) -> str:
    scan(content)
    relative = f"{folder}/{int(time.time() * 1000)}-{safe_name}"
    path = storage_path(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encrypt(content))
    return relative


def read(relative: str) -> bytes:
    """Contenu en clair d'un fichier stocké (OSError s'il est absent ou illisible)."""
    return decrypt(storage_path(relative).read_bytes())


def serve(relative: str, mime: str) -> HttpResponse:
    path = storage_path(relative)
    try:
        content = read(relative)
    except OSError as err:
        logger.warning("fichier illisible %s : %s", relative, err)
        from django.http import Http404

        raise Http404 from err
    response = HttpResponse(content, content_type=mime or "application/octet-stream")
    response["Content-Disposition"] = f'inline; filename="{path.name}"'
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    # Même si un fichier piégé passait le contrôle, il serait ouvert sans script ni accès à la session.
    response["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return response
