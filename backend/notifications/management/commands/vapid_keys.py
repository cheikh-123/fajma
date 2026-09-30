"""Génère une paire de clés VAPID pour les notifications push : python manage.py vapid_keys"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = "Génère les clés VAPID (à placer dans le fichier .env, une seule fois)"

    def handle(self, *args, **options):
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(32, "big")
        public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.stdout.write(f"WEBPUSH_VAPID_PUBLIC_KEY={b64url(public)}")
        self.stdout.write(f"WEBPUSH_VAPID_PRIVATE_KEY={b64url(private)}")
