"""
Double authentification TOTP (RFC 6238), compatible Google Authenticator, Authy, Microsoft Authenticator.
Implémentation sans dépendance : HMAC-SHA1, pas de 30 s, codes à 6 chiffres.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse

STEP = 30
DIGITS = 6


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_code(secret: str, at: float | None = None) -> str:
    return _code(secret, int((at or time.time()) // STEP))


def verify(secret: str, code: str, last_used_step: int = 0, window: int = 1) -> int | None:
    """Renvoie le pas de temps validé (à mémoriser pour empêcher la réutilisation), ou None."""
    code = (code or "").replace(" ", "")
    if not code.isdigit() or len(code) != DIGITS:
        return None
    now_step = int(time.time() // STEP)
    for step in range(now_step - window, now_step + window + 1):
        if step > last_used_step and hmac.compare_digest(_code(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, email: str) -> str:
    label = urllib.parse.quote(f"Fajma:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer=Fajma&digits={DIGITS}&period={STEP}"


def new_recovery_codes(n: int = 8) -> tuple[list[str], list[str]]:
    """Codes de secours en clair (affichés une seule fois) et leurs empreintes (stockées)."""
    plain = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(n)]
    return plain, [hash_recovery(c) for c in plain]


def hash_recovery(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()
