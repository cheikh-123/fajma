"""
Clés d'accès (passkeys, WebAuthn) : enregistrement, connexion, et surtout ce qui doit être refusé.

Les tests fabriquent un vrai authentificateur logiciel (paire de clés ES256, signature du défi) plutôt que de
bouchonner la bibliothèque : c'est le seul moyen de vérifier que la signature est réellement contrôlée, et que
le domaine attendu entre bien dans le calcul — c'est précisément ce qui rend l'hameçonnage inopérant.
"""

import hashlib
import json
import os
import struct

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from django.test import override_settings

from accounts.models import Passkey, TwoFactor
from accounts.passkeys import b64, unb64

from .test_security import ApiTestCase

RP_ID = "localhost"
ORIGIN = "http://localhost:8088"
PASSKEY_SETTINGS = {"PASSKEY_RP_ID": RP_ID, "PASSKEY_ORIGINS": [ORIGIN]}


class SoftAuthenticator:
    """Authentificateur logiciel : ce que ferait un téléphone ou une clé USB, en quelques lignes."""

    def __init__(self, rp_id: str = RP_ID):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.rp_id_hash = hashlib.sha256(rp_id.encode()).digest()
        self.sign_count = 0

    # ── Format COSE de la clé publique (ES256) ───────────────────────
    def _cose_key(self) -> bytes:
        numbers = self.key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,  # type de clé : courbe elliptique
                3: -7,  # algorithme : ES256
                -1: 1,  # courbe : P-256
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _auth_data(self, *, attested: bool) -> bytes:
        # drapeaux : présence (0x01) + vérification de l'utilisateur (0x04) + données d'attestation (0x40)
        flags = 0x01 | 0x04 | (0x40 if attested else 0)
        self.sign_count += 1
        data = self.rp_id_hash + bytes([flags]) + struct.pack(">I", self.sign_count)
        if attested:
            key = self._cose_key()
            data += b"\x00" * 16 + struct.pack(">H", len(self.credential_id)) + self.credential_id + key
        return data

    def _client_data(self, kind: str, challenge: str, origin: str) -> bytes:
        return json.dumps(
            {"type": kind, "challenge": challenge, "origin": origin, "crossOrigin": False}
        ).encode()

    def register(self, challenge: str, origin: str = ORIGIN) -> dict:
        client_data = self._client_data("webauthn.create", challenge, origin)
        auth_data = self._auth_data(attested=True)
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64(self.credential_id),
            "rawId": b64(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64(client_data),
                "attestationObject": b64(attestation),
            },
            "clientExtensionResults": {},
        }

    def authenticate(self, challenge: str, origin: str = ORIGIN, *, tamper: bool = False) -> dict:
        client_data = self._client_data("webauthn.get", challenge, origin)
        auth_data = self._auth_data(attested=False)
        signed = auth_data + hashlib.sha256(client_data).digest()
        signature = self.key.sign(signed, ec.ECDSA(hashes.SHA256()))
        if tamper:
            signature = signature[:-1] + bytes([signature[-1] ^ 0xFF])
        return {
            "id": b64(self.credential_id),
            "rawId": b64(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64(client_data),
                "authenticatorData": b64(auth_data),
                "signature": b64(signature),
                "userHandle": None,
            },
            "clientExtensionResults": {},
        }


@override_settings(**PASSKEY_SETTINGS)
class PasskeyRegistrationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.p1)

    def start(self):
        res = self.client.post("/api/auth/passkeys", {"action": "start"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["challenge"]

    def test_enregistrement_puis_liste(self):
        challenge = self.start()
        device = SoftAuthenticator()
        res = self.client.post(
            "/api/auth/passkeys",
            {"action": "confirm", "credential": device.register(challenge), "label": "iPhone de Fatou"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["passkey"]["label"], "iPhone de Fatou")
        key = Passkey.objects.get(user=self.p1)
        self.assertEqual(bytes(key.credential_id), device.credential_id)
        # La clé privée n'est jamais transmise : seule la clé publique est en base.
        self.assertNotIn(device.key.private_numbers().private_value.to_bytes(32, "big"), bytes(key.public_key))
        self.assertEqual(self.client.get("/api/auth/passkeys").data["passkeys"][0]["label"], "iPhone de Fatou")

    def test_cle_creee_pour_un_autre_site_refusee(self):
        """Le cœur de la protection : une clé signée pour un faux domaine ne passe pas."""
        challenge = self.start()
        res = self.client.post(
            "/api/auth/passkeys",
            {"action": "confirm", "credential": SoftAuthenticator().register(challenge, origin="https://fajma-login.test")},
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertFalse(Passkey.objects.exists())

    def test_defi_d_une_autre_demande_refuse(self):
        self.start()
        res = self.client.post(
            "/api/auth/passkeys",
            {"action": "confirm", "credential": SoftAuthenticator().register(b64(os.urandom(32)))},
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertFalse(Passkey.objects.exists())

    def test_un_defi_ne_sert_qu_une_fois(self):
        challenge = self.start()
        device = SoftAuthenticator()
        self.assertEqual(
            self.client.post(
                "/api/auth/passkeys", {"action": "confirm", "credential": device.register(challenge)}, format="json"
            ).status_code,
            200,
        )
        res = self.client.post(
            "/api/auth/passkeys",
            {"action": "confirm", "credential": SoftAuthenticator().register(challenge)},
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(Passkey.objects.count(), 1)

    def test_visiteur_non_connecte_refuse(self):
        self.assertIn(self.client_for().get("/api/auth/passkeys").status_code, (401, 403))
        self.assertIn(
            self.client_for().post("/api/auth/passkeys", {"action": "start"}, format="json").status_code, (401, 403)
        )


@override_settings(**PASSKEY_SETTINGS)
class PasskeyLoginTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.device = SoftAuthenticator()
        client = self.client_for(self.p1)
        challenge = client.post("/api/auth/passkeys", {"action": "start"}, format="json").data["challenge"]
        client.post(
            "/api/auth/passkeys", {"action": "confirm", "credential": self.device.register(challenge)}, format="json"
        )
        # La deuxième étape ne s'ouvre que si le compte en a une : on active aussi le code à six chiffres.
        TwoFactor.objects.create(user=self.p1, secret="x", enabled=True)
        self.p1.set_password("Mot-de-passe-solide-2026")
        self.p1.save()

    def remove(self, client, key_id):
        return client.post("/api/auth/passkeys", {"action": "remove", "id": key_id}, format="json")

    def first_step(self, client):
        res = client.post(
            "/api/auth/login", {"email": self.p1.email, "password": "Mot-de-passe-solide-2026"}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        return res

    def test_connexion_par_cle_d_acces(self):
        client = self.client_for()
        res = self.first_step(client)
        self.assertTrue(res.data["mfa_required"])
        self.assertTrue(res.data["passkey_available"])  # l'interface sait proposer le bon bouton
        challenge = client.post("/api/auth/login/passkey", {"action": "start"}, format="json").data["challenge"]
        res = client.post(
            "/api/auth/login/passkey",
            {"action": "verify", "credential": self.device.authenticate(challenge)},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["user"]["email"], self.p1.email)
        self.assertIsNotNone(Passkey.objects.get(user=self.p1).last_used_at)

    def test_signature_falsifiee_refusee(self):
        client = self.client_for()
        self.first_step(client)
        challenge = client.post("/api/auth/login/passkey", {"action": "start"}, format="json").data["challenge"]
        res = client.post(
            "/api/auth/login/passkey",
            {"action": "verify", "credential": self.device.authenticate(challenge, tamper=True)},
            format="json",
        )
        self.assertEqual(res.status_code, 401, res.data)
        self.assertIsNone(client.get("/api/auth/me").data["user"])  # aucune session ouverte

    def test_signature_pour_un_faux_site_refusee(self):
        """Un site d'hameçonnage relaie la demande : la signature porte son domaine, donc elle ne vaut rien."""
        client = self.client_for()
        self.first_step(client)
        challenge = client.post("/api/auth/login/passkey", {"action": "start"}, format="json").data["challenge"]
        res = client.post(
            "/api/auth/login/passkey",
            {"action": "verify", "credential": self.device.authenticate(challenge, origin="https://fajma-login.test")},
            format="json",
        )
        self.assertEqual(res.status_code, 401, res.data)

    def test_cle_d_un_autre_compte_refusee(self):
        client = self.client_for()
        self.first_step(client)
        challenge = client.post("/api/auth/login/passkey", {"action": "start"}, format="json").data["challenge"]
        res = client.post(
            "/api/auth/login/passkey",
            {"action": "verify", "credential": SoftAuthenticator().authenticate(challenge)},
            format="json",
        )
        self.assertEqual(res.status_code, 401, res.data)

    def test_sans_mot_de_passe_valide_aucune_cle_ne_sert(self):
        """La clé est une deuxième étape : sans la première, elle n'ouvre rien."""
        client = self.client_for()
        res = client.post("/api/auth/login/passkey", {"action": "start"}, format="json")
        self.assertEqual(res.status_code, 401, res.data)

    def test_retrait_d_une_cle(self):
        client = self.client_for(self.p1)
        key_id = client.get("/api/auth/passkeys").data["passkeys"][0]["id"]
        self.assertEqual(self.remove(client, key_id).status_code, 200)
        self.assertFalse(Passkey.objects.exists())

    def test_un_autre_compte_ne_peut_pas_retirer_ma_cle(self):
        key_id = str(Passkey.objects.get(user=self.p1).id)
        self.assertEqual(self.remove(self.client_for(self.p2), key_id).status_code, 404)
        self.assertTrue(Passkey.objects.exists())

    def test_un_professionnel_ne_peut_pas_retirer_sa_derniere_seconde_etape(self):
        client = self.client_for(self.doc_user)
        challenge = client.post("/api/auth/passkeys", {"action": "start"}, format="json").data["challenge"]
        client.post(
            "/api/auth/passkeys", {"action": "confirm", "credential": SoftAuthenticator().register(challenge)}, format="json"
        )
        key_id = client.get("/api/auth/passkeys").data["passkeys"][0]["id"]
        res = self.remove(client, key_id)
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn("seule seconde étape", res.data["error"])
        # Avec le code à six chiffres activé, le retrait redevient possible.
        TwoFactor.objects.create(user=self.doc_user, secret="x", enabled=True)
        self.assertEqual(self.remove(client, key_id).status_code, 200)


@override_settings(**PASSKEY_SETTINGS)
class PasskeyRecoveryTests(ApiTestCase):
    """Téléphone perdu : l'administration doit pouvoir rendre le compte à son titulaire. Si la
    réinitialisation ne retirait que le code à six chiffres, une clé restée sur l'appareil perdu laisserait
    la personne définitivement bloquée."""

    def test_la_reinitialisation_retire_aussi_les_cles_d_acces(self):
        client = self.client_for(self.doc_user)
        challenge = client.post("/api/auth/passkeys", {"action": "start"}, format="json").data["challenge"]
        client.post(
            "/api/auth/passkeys",
            {"action": "confirm", "credential": SoftAuthenticator().register(challenge)},
            format="json",
        )
        TwoFactor.objects.create(user=self.doc_user, secret="x", enabled=True)

        admin = self.make_user("admin-cles@test.sn", "Admin", is_staff=True, is_superuser=True)
        res = self.client_for(admin).post(
            f"/api/admin/users/{self.doc_user.id}",
            {"action": "reset_mfa", "reason": "Téléphone perdu, identité vérifiée au cabinet"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(Passkey.objects.filter(user=self.doc_user).exists())
        self.assertFalse(TwoFactor.objects.filter(user=self.doc_user).exists())

    def test_un_motif_est_obligatoire(self):
        admin = self.make_user("admin-motif@test.sn", "Admin", is_staff=True, is_superuser=True)
        res = self.client_for(admin).post(
            f"/api/admin/users/{self.doc_user.id}", {"action": "reset_mfa", "reason": "x"}, format="json"
        )
        self.assertEqual(res.status_code, 400, res.data)
