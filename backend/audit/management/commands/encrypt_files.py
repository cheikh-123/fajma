"""
Chiffre les fichiers déposés avant l'activation du chiffrement, et rechiffre avec la nouvelle clé après
une rotation (--rotate). Sans risque à relancer : un fichier déjà chiffré avec la clé courante est ignoré.
"""

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from sunusante.uploads import ENCRYPTED_MAGIC, _cipher, decrypt, encrypt


class Command(BaseCommand):
    help = "Chiffre les fichiers encore en clair dans PRIVATE_MEDIA_ROOT (--rotate : rechiffre avec la clé courante)"

    def add_arguments(self, parser):
        parser.add_argument("--rotate", action="store_true", help="Rechiffre aussi les fichiers déjà chiffrés")
        parser.add_argument("--dry-run", action="store_true", help="Compte sans modifier")

    def handle(self, *args, rotate=False, dry_run=False, **options):
        root = Path(settings.PRIVATE_MEDIA_ROOT)
        done = skipped = failed = 0
        for path in sorted(p for p in root.rglob("*") if p.is_file() and not p.name.startswith(".")):
            raw = path.read_bytes()
            if raw.startswith(ENCRYPTED_MAGIC) and not rotate:
                skipped += 1
                continue
            try:
                if raw.startswith(ENCRYPTED_MAGIC):
                    new = ENCRYPTED_MAGIC + _cipher().rotate(raw[len(ENCRYPTED_MAGIC) :])
                else:
                    new = encrypt(decrypt(raw))
            except OSError as err:
                failed += 1
                self.stderr.write(f"{path.relative_to(root)} : {err}")
                continue
            except Exception as err:  # noqa: BLE001 — jeton illisible avec toutes les clés
                failed += 1
                self.stderr.write(f"{path.relative_to(root)} : illisible ({type(err).__name__})")
                continue
            if not dry_run:
                tmp = path.with_name(path.name + ".tmp")
                tmp.write_bytes(new)
                tmp.replace(path)
            done += 1
        verb = "à chiffrer" if dry_run else "chiffré(s)"
        self.stdout.write(f"{done} fichier(s) {verb}, {skipped} déjà chiffré(s), {failed} en erreur")
