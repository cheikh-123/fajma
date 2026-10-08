"""
Clés d'accès (passkeys, norme WebAuthn / FIDO2) : empreinte, visage, code de l'appareil ou clé USB, à la place
du code à six chiffres.

Pourquoi : le code à six chiffres se recopie sur un faux site. Une clé d'accès, non — le navigateur ne la
présente qu'au domaine qui l'a créée, et la signature contient ce domaine. Un site d'hameçonnage ne peut donc
rien en faire, même si la personne tombe dans le piège. C'est la seule méthode qui ferme cette attaque.

La clé privée ne quitte jamais l'appareil : nous ne stockons que la clé publique. Une base volée ne permet de
se connecter nulle part.

Réglages (`PASSKEY_RP_ID`, `PASSKEY_ORIGINS`) : le domaine du site. En développement, « localhost ».
"""

from __future__ import annotations

import base64

from django.conf import settings
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

RP_NAME = "Fajma"


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64(value: str) -> bytes:
    return base64url_to_bytes(value)


def _rp_id() -> str:
    return settings.PASSKEY_RP_ID


def _origins() -> list[str]:
    return settings.PASSKEY_ORIGINS


def registration_options(user, existing_ids: list[bytes]) -> tuple[dict, bytes]:
    """Options à transmettre au navigateur pour créer une clé, et le défi à garder en session."""
    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name=RP_NAME,
        user_id=str(user.pk).encode(),
        user_name=user.email or str(user.pk),
        user_display_name=user.full_name or user.email or "Fajma",
        # Clé résidente : la personne peut se connecter sans taper son email.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        # Les clés déjà enregistrées sont exclues : pas de doublon sur le même appareil.
        exclude_credentials=[PublicKeyCredentialDescriptor(id=i) for i in existing_ids],
    )
    import json

    return json.loads(options_to_json(options)), options.challenge


def verify_registration(credential: dict, challenge: bytes):
    """Vérifie la réponse du navigateur. Lève ValueError si elle ne tient pas."""
    try:
        return verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origins(),
            require_user_verification=True,
        )
    except (InvalidRegistrationResponse, ValueError, KeyError) as err:
        raise ValueError(str(err)) from err


def authentication_options(credential_ids: list[bytes]) -> tuple[dict, bytes]:
    """Options de connexion. Sans identifiant connu, le navigateur propose les clés qu'il détient."""
    options = generate_authentication_options(
        rp_id=_rp_id(),
        allow_credentials=[PublicKeyCredentialDescriptor(id=i) for i in credential_ids],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    import json

    return json.loads(options_to_json(options)), options.challenge


def verify_authentication(credential: dict, challenge: bytes, public_key: bytes, sign_count: int):
    """Vérifie la signature. Lève ValueError si elle ne tient pas."""
    try:
        return verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origins(),
            credential_public_key=public_key,
            credential_current_sign_count=sign_count,
            require_user_verification=True,
        )
    except (InvalidAuthenticationResponse, ValueError, KeyError) as err:
        raise ValueError(str(err)) from err
