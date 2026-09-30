"""
Régénère directory/data/localites_senegal.tsv à partir de GeoNames (toutes les villes, villages et quartiers
du Sénégal). Données GeoNames sous licence CC BY 4.0 : https://www.geonames.org/
Usage : python manage.py import_localities [--source SN.zip]
"""

import io
import urllib.request
import zipfile
from pathlib import Path

from django.core.management.base import BaseCommand

from directory.localities import DATA_FILE

URL = "https://download.geonames.org/export/dump/SN.zip"
# Codes de région GeoNames → noms officiels (avec accents).
REGIONS = {
    "01": "Dakar",
    "03": "Diourbel",
    "05": "Tambacounda",
    "07": "Thiès",
    "09": "Fatick",
    "10": "Kaolack",
    "11": "Kolda",
    "12": "Ziguinchor",
    "13": "Louga",
    "14": "Saint-Louis",
    "15": "Matam",
    "16": "Kaffrine",
    "17": "Kédougou",
    "18": "Sédhiou",
}
# Lieux habités, sauf lieux historiques ou abandonnés.
KINDS = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLF", "PPLL", "PPLS", "PPLX"}


class Command(BaseCommand):
    help = "Importe les localités du Sénégal depuis GeoNames"

    def add_arguments(self, parser):
        parser.add_argument("--source", help="Fichier SN.zip ou SN.txt déjà téléchargé")

    def handle(self, *args, source=None, **options):
        if source and source.endswith(".txt"):
            text = Path(source).read_text(encoding="utf-8")
        else:
            raw = Path(source).read_bytes() if source else urllib.request.urlopen(URL, timeout=60).read()
            text = zipfile.ZipFile(io.BytesIO(raw)).read("SN.txt").decode("utf-8")

        rows = set()
        for line in text.splitlines():
            f = line.split("\t")
            if len(f) < 15 or f[6] != "P" or f[7] not in KINDS or f[10] not in REGIONS:
                continue
            lat, lng = round(float(f[4]), 4), round(float(f[5]), 4)
            if not (12 <= lat <= 17 and -18 <= lng <= -11):
                continue
            rows.add((f[1].strip(), REGIONS[f[10]], lat, lng, int(f[14] or 0)))

        rows = sorted(rows, key=lambda r: (r[1], r[0], -r[4]))
        DATA_FILE.parent.mkdir(exist_ok=True)
        with DATA_FILE.open("w", encoding="utf-8", newline="\n") as out:
            out.write("# Localités du Sénégal — source GeoNames (CC BY 4.0), python manage.py import_localities\n")
            out.write("# nom\trégion\tlatitude\tlongitude\tpopulation\n")
            for name, region, lat, lng, pop in rows:
                out.write(f"{name}\t{region}\t{lat}\t{lng}\t{pop}\n")
        self.stdout.write(f"{len(rows)} localités écrites dans {DATA_FILE}")
