"""
Localités du Sénégal (régions, départements, communes, quartiers de Dakar) avec leurs coordonnées
approximatives (centre de la localité, précision de l'ordre du kilomètre) et leurs variantes d'écriture.
Sert aux suggestions de saisie et à la recherche de médecins par proximité : « Pikine » trouve aussi les
médecins des quartiers voisins, classés par distance.
Liste principale : (nom, région, latitude, longitude, variantes), complétée par toutes les autres localités
du pays (fichier data/localites_senegal.tsv, source GeoNames).
"""

from __future__ import annotations

import math
import unicodedata
from pathlib import Path
from typing import NamedTuple

LOCALITIES: list[tuple[str, str, float, float, tuple[str, ...]]] = [
    # Dakar
    ("Dakar", "Dakar", 14.6928, -17.4467, ()),
    ("Dakar Plateau", "Dakar", 14.6670, -17.4330, ("Plateau",)),
    ("Médina", "Dakar", 14.6830, -17.4470, ("Medina",)),
    ("Fann", "Dakar", 14.6900, -17.4650, ("Fann Résidence",)),
    ("Point E", "Dakar", 14.6940, -17.4580, ()),
    ("Mermoz", "Dakar", 14.7070, -17.4720, ()),
    ("Sacré-Cœur", "Dakar", 14.7180, -17.4650, ("Sacre Coeur",)),
    ("Ouakam", "Dakar", 14.7250, -17.4900, ()),
    ("Ngor", "Dakar", 14.7480, -17.5130, ()),
    ("Almadies", "Dakar", 14.7420, -17.5200, ("Les Almadies",)),
    ("Yoff", "Dakar", 14.7570, -17.4750, ()),
    ("Grand Yoff", "Dakar", 14.7350, -17.4500, ()),
    ("Parcelles Assainies", "Dakar", 14.7630, -17.4380, ("Parcelles", "PA")),
    ("Cambérène", "Dakar", 14.7700, -17.4400, ("Camberene",)),
    ("HLM", "Dakar", 14.7070, -17.4450, ()),
    ("Grand Dakar", "Dakar", 14.7050, -17.4520, ()),
    ("Liberté", "Dakar", 14.7200, -17.4600, ("Liberte",)),
    ("Hann", "Dakar", 14.7170, -17.4200, ("Hann Bel-Air", "Bel-Air")),
    ("Pikine", "Dakar", 14.7550, -17.3900, ()),
    ("Guédiawaye", "Dakar", 14.7760, -17.3950, ("Guediawaye",)),
    ("Thiaroye", "Dakar", 14.7470, -17.3700, ("Thiaroye sur Mer",)),
    ("Keur Massar", "Dakar", 14.7830, -17.3170, ()),
    ("Malika", "Dakar", 14.7970, -17.3370, ()),
    ("Yeumbeul", "Dakar", 14.7750, -17.3500, ()),
    ("Mbao", "Dakar", 14.7350, -17.3220, ()),
    ("Rufisque", "Dakar", 14.7160, -17.2730, ("Tengeth",)),
    ("Bargny", "Dakar", 14.6980, -17.2280, ()),
    ("Diamniadio", "Dakar", 14.7130, -17.1830, ()),
    ("Sébikotane", "Dakar", 14.7470, -17.1360, ("Sebikotane",)),
    ("Sangalkam", "Dakar", 14.7820, -17.2280, ()),
    ("Bambilor", "Dakar", 14.8000, -17.2300, ()),
    # Quartiers absents de GeoNames
    ("Sicap Liberté", "Dakar", 14.7185, -17.4590, ("Sicap Liberte",)),
    ("Liberté 1", "Dakar", 14.7120, -17.4600, ("Liberte 1", "Sicap Liberté 1")),
    ("Liberté 2", "Dakar", 14.7155, -17.4555, ("Liberte 2", "Sicap Liberté 2")),
    ("Liberté 3", "Dakar", 14.7160, -17.4640, ("Liberte 3", "Sicap Liberté 3")),
    ("Liberté 4", "Dakar", 14.7190, -17.4570, ("Liberte 4", "Sicap Liberté 4")),
    ("Liberté 5", "Dakar", 14.7230, -17.4620, ("Liberte 5", "Sicap Liberté 5")),
    ("Liberté 6", "Dakar", 14.7275, -17.4610, ("Liberte 6", "Sicap Liberté 6", "Liberté 6 Extension", "Liberte 6 Extension")),
    ("Sicap Baobabs", "Dakar", 14.7090, -17.4660, ("Baobabs",)),
    ("Sicap Amitié", "Dakar", 14.7130, -17.4550, ("Sicap Amitie", "Amitié", "Amitie")),
    ("Sicap Karack", "Dakar", 14.7110, -17.4620, ("Karack",)),
    ("Sicap Mbao", "Dakar", 14.7420, -17.3300, ()),
    ("Dieuppeul", "Dakar", 14.7160, -17.4540, ("Dieupeul", "Derklé Dieuppeul")),
    ("Fass", "Dakar", 14.6850, -17.4500, ("Fass Delorme", "Fass Paillote")),
    ("Colobane", "Dakar", 14.6880, -17.4450, ()),
    ("Rebeuss", "Dakar", 14.6640, -17.4370, ("Rebeus",)),
    ("Gorée", "Dakar", 14.6670, -17.3980, ("Goree", "Île de Gorée", "Ile de Goree")),
    ("Biscuiterie", "Dakar", 14.7150, -17.4400, ()),
    ("Cité Mixta", "Dakar", 14.7210, -17.4550, ("Mixta", "Cite Mixta")),
    ("Cité Keur Gorgui", "Dakar", 14.7120, -17.4750, ("Keur Gorgui",)),
    ("Zone de Captage", "Dakar", 14.7300, -17.4480, ("Captage",)),
    ("Scat Urbam", "Dakar", 14.7400, -17.4450, ()),
    ("Hann Maristes", "Dakar", 14.7300, -17.4300, ("Maristes",)),
    ("Yarakh", "Dakar", 14.7200, -17.4050, ("Hann Yarakh",)),
    ("Nord Foire", "Dakar", 14.7430, -17.4650, ("Foire",)),
    ("Ouest Foire", "Dakar", 14.7450, -17.4730, ()),
    ("Cité Soprim", "Dakar", 14.7430, -17.4600, ("Soprim",)),
    ("Mamelles", "Dakar", 14.7280, -17.5000, ("Les Mamelles",)),
    ("Wakhinane Nimzatt", "Dakar", 14.7780, -17.4100, ("Nimzatt", "Wakhinane")),
    ("Ndiarème Limamoulaye", "Dakar", 14.7700, -17.4020, ("Ndiareme Limamoulaye", "Limamoulaye")),
    ("Médina Gounass", "Dakar", 14.7560, -17.3920, ("Medina Gounass",)),
    ("Djeddah Thiaroye Kao", "Dakar", 14.7600, -17.3750, ("Djidah Thiaroye Kao", "Thiaroye Kao")),
    ("Thiaroye Gare", "Dakar", 14.7520, -17.3800, ()),
    ("Diamaguène Sicap Mbao", "Dakar", 14.7500, -17.3450, ("Diamaguène", "Diamaguene")),
    ("Tivaouane Diacksao", "Dakar", 14.7580, -17.3500, ("Diacksao",)),
    ("Keur Mbaye Fall", "Dakar", 14.7400, -17.3350, ()),
    ("Zac Mbao", "Dakar", 14.7380, -17.3180, ("ZAC Mbao",)),
    ("Tivaouane Peulh", "Dakar", 14.7880, -17.2800, ("Tivaouane Peul",)),
    ("Niague", "Dakar", 14.8000, -17.2600, ()),
    ("Kounoune", "Dakar", 14.7560, -17.2400, ()),
    ("Ndiakhirate", "Dakar", 14.7600, -17.1700, ()),
    ("Yène", "Dakar", 14.5930, -17.1700, ("Yene", "Yenne")),
    # Thiès
    ("Thiès", "Thiès", 14.7910, -16.9260, ("Thies", "Kees")),
    ("Mbour", "Thiès", 14.4180, -16.9640, ()),
    ("Saly", "Thiès", 14.4440, -17.0130, ("Saly Portudal",)),
    ("Somone", "Thiès", 14.4870, -17.0800, ()),
    ("Nguékhokh", "Thiès", 14.5200, -17.0100, ("Nguekhokh",)),
    ("Popenguine", "Thiès", 14.5500, -17.1100, ()),
    ("Joal-Fadiouth", "Thiès", 14.1660, -16.8330, ("Joal",)),
    ("Tivaouane", "Thiès", 14.9500, -16.8170, ()),
    ("Khombole", "Thiès", 14.7660, -16.7000, ()),
    ("Pout", "Thiès", 14.7690, -17.0600, ()),
    ("Mékhé", "Thiès", 15.1100, -16.6300, ("Mekhe",)),
    ("Kayar", "Thiès", 14.9180, -17.1210, ("Cayar",)),
    ("Ngaparou", "Thiès", 14.4600, -17.0550, ()),
    # Diourbel
    ("Diourbel", "Diourbel", 14.6550, -16.2310, ()),
    ("Touba", "Diourbel", 14.8660, -15.8830, ("Touba Mosquée",)),
    ("Mbacké", "Diourbel", 14.7960, -15.9080, ("Mbacke",)),
    ("Bambey", "Diourbel", 14.7000, -16.4500, ()),
    # Saint-Louis
    ("Saint-Louis", "Saint-Louis", 16.0260, -16.4890, ("Saint Louis", "St-Louis", "St Louis", "Ndar")),
    ("Richard-Toll", "Saint-Louis", 16.4620, -15.7000, ("Richard Toll",)),
    ("Dagana", "Saint-Louis", 16.5160, -15.5040, ()),
    ("Podor", "Saint-Louis", 16.6520, -14.9590, ()),
    ("Ross-Béthio", "Saint-Louis", 16.2700, -16.1400, ("Ross Bethio",)),
    # Louga
    ("Louga", "Louga", 15.6180, -16.2240, ()),
    ("Linguère", "Louga", 15.3930, -15.1170, ("Linguere",)),
    ("Kébémer", "Louga", 15.3710, -16.4480, ("Kebemer",)),
    ("Dahra", "Louga", 15.3460, -15.4790, ("Dahra Djolof",)),
    ("Darou Mousty", "Louga", 15.0450, -16.0500, ("Darou Mousti",)),
    # Kaolack
    ("Kaolack", "Kaolack", 14.1520, -16.0730, ()),
    ("Nioro du Rip", "Kaolack", 13.7500, -15.8000, ("Nioro",)),
    ("Guinguinéo", "Kaolack", 14.2670, -15.9500, ("Guinguineo",)),
    ("Ndoffane", "Kaolack", 14.0000, -15.9500, ()),
    # Kaffrine
    ("Kaffrine", "Kaffrine", 14.1060, -15.5500, ()),
    ("Koungheul", "Kaffrine", 13.9800, -14.8000, ()),
    ("Birkelane", "Kaffrine", 14.1300, -15.7400, ()),
    ("Malem-Hodar", "Kaffrine", 14.0900, -15.3000, ("Malem Hodar",)),
    # Fatick
    ("Fatick", "Fatick", 14.3390, -16.4110, ()),
    ("Foundiougne", "Fatick", 14.1330, -16.4670, ()),
    ("Gossas", "Fatick", 14.4920, -16.0660, ()),
    ("Sokone", "Fatick", 13.8830, -16.3670, ()),
    ("Diofior", "Fatick", 14.1830, -16.6670, ()),
    # Ziguinchor
    ("Ziguinchor", "Ziguinchor", 12.5830, -16.2720, ()),
    ("Bignona", "Ziguinchor", 12.8100, -16.2260, ()),
    ("Oussouye", "Ziguinchor", 12.4850, -16.5470, ()),
    ("Cap Skirring", "Ziguinchor", 12.3930, -16.7460, ("Cap-Skirring",)),
    # Sédhiou
    ("Sédhiou", "Sédhiou", 12.7080, -15.5570, ("Sedhiou",)),
    ("Goudomp", "Sédhiou", 12.5780, -15.8730, ()),
    ("Bounkiling", "Sédhiou", 12.9900, -15.7000, ()),
    # Kolda
    ("Kolda", "Kolda", 12.8940, -14.9500, ()),
    ("Vélingara", "Kolda", 13.1500, -14.1100, ("Velingara",)),
    ("Médina Yoro Foulah", "Kolda", 13.2900, -14.7200, ("Medina Yoro Foulah",)),
    # Tambacounda
    ("Tambacounda", "Tambacounda", 13.7700, -13.6680, ("Tamba",)),
    ("Bakel", "Tambacounda", 14.9040, -12.4630, ()),
    ("Goudiry", "Tambacounda", 14.1830, -12.7170, ()),
    ("Koumpentoum", "Tambacounda", 13.9830, -14.5500, ()),
    # Kédougou
    ("Kédougou", "Kédougou", 12.5560, -12.1760, ("Kedougou",)),
    ("Saraya", "Kédougou", 12.8340, -11.7530, ()),
    ("Salémata", "Kédougou", 12.6330, -12.8170, ("Salemata",)),
    # Matam
    ("Matam", "Matam", 15.6560, -13.2550, ()),
    ("Ourossogui", "Matam", 15.6060, -13.3220, ()),
    ("Kanel", "Matam", 15.4920, -13.1760, ()),
    ("Ranérou", "Matam", 15.3000, -13.9670, ("Ranerou",)),
]


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance à vol d'oiseau (formule de haversine)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# Rayon de recherche autour d'une localité : les quartiers de Dakar sont proches, la campagne plus étendue.
DEFAULT_RADIUS_KM = 20

# Toutes les autres localités du pays (≈ 11 800 villes, villages et quartiers), régénérées par
# « python manage.py import_localities ». Les localités ci-dessus restent prioritaires.
DATA_FILE = Path(__file__).parent / "data" / "localites_senegal.tsv"


def norm(value: str) -> str:
    """Minuscules, sans accents ni ponctuation : « Guédiawaye » = « guediawaye », « Keur Ali (Thiès) » = « keur ali thies »."""
    text = "".join(c for c in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(c) != "Mn")
    for sep in "-'’(),.":
        text = text.replace(sep, " ")
    return " ".join(text.split())


class Locality(NamedTuple):
    """Même ordre que les tuples de LOCALITIES : loc[0] est le nom, loc[2] et loc[3] les coordonnées."""

    name: str
    region: str
    latitude: float
    longitude: float
    aliases: tuple[str, ...] = ()
    population: int = 0
    priority: int = 1  # 0 : liste ci-dessus (villes et quartiers principaux)
    label: str = ""  # nom unique affiché, avec la région quand le nom existe ailleurs


def _load() -> list[Locality]:
    curated = [Locality(*loc, priority=0) for loc in LOCALITIES]
    known = {}
    for loc in curated:
        for alias in (loc.name, *loc.aliases):
            known.setdefault(norm(alias), []).append(loc)
    extra: dict[tuple[str, str], Locality] = {}
    try:
        lines = DATA_FILE.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        lines = []
    for line in lines:
        if not line or line.startswith("#"):
            continue
        name, region, lat, lng, pop = line.split("\t")
        loc = Locality(name, region, float(lat), float(lng), population=int(pop))
        key = norm(name)
        # Déjà dans la liste principale (même nom, à moins de 25 km) : on garde celle-ci.
        if any(distance_km(c.latitude, c.longitude, loc.latitude, loc.longitude) < 25 for c in known.get(key, [])):
            continue
        # Homonymes dans la même région (hameaux d'un même village) : un seul, le plus peuplé.
        if (key, region) not in extra or extra[key, region].population < loc.population:
            extra[key, region] = loc
    result = curated + list(extra.values())
    groups: dict[str, list[Locality]] = {}
    for loc in result:
        for alias in {norm(a) for a in (loc.name, *loc.aliases)}:
            groups.setdefault(alias, []).append(loc)
    # Nom porté par plusieurs localités : la région est ajoutée (« Colobane (Fatick) »), sauf pour la localité
    # principale ou nettement la plus peuplée, qui garde le nom simple (« Ndioum »).
    plain = set()
    for homonyms in groups.values():
        first, *others = sorted(homonyms, key=_rank)
        if not others or first.priority == 0 or first.population > others[0].population:
            plain.add(id(first))
    return [loc._replace(label=loc.name if id(loc) in plain else f"{loc.name} ({loc.region})") for loc in result]


def _rank(loc: Locality) -> tuple:
    return (loc.priority, -loc.population, len(loc.label))


_ALL = _load()
_INDEX: dict[str, Locality] = {}
for _loc in sorted(_ALL, key=_rank):
    for _alias in (_loc.label, _loc.name, *_loc.aliases):
        _INDEX.setdefault(norm(_alias), _loc)  # nom simple → la localité principale ou la plus peuplée


def find(name: str) -> Locality | None:
    """Localité correspondant exactement au texte saisi (nom, variante ou « Nom (Région) »), sinon None."""
    return _INDEX.get(norm(name or ""))


_STREET_WORDS = {"villa", "rue", "avenue", "av", "boulevard", "bd", "route", "immeuble", "imm", "lot", "cite", "n", "no", "numero", "pres", "face", "angle", "x"}


def locate_address(address: str, city: str = "") -> Locality | None:
    """
    Localité (quartier de préférence, sinon ville) déduite d'une adresse libre, ex. « Liberté 6 Extension,
    villa 45 » → Liberté 6. Un quartier d'une autre région que la ville indiquée est ignoré (homonymes).
    """
    import re

    city_loc = find(city) if city else None
    for part in re.split(r"[,;/·()]", address or ""):
        words = part.split()
        while words and (words[0].isdigit() or norm(words[0]).strip(".°") in _STREET_WORDS):
            words = words[1:]
        for n in range(len(words), 0, -1):
            candidate = " ".join(words[:n])
            if len(norm(candidate)) < 4:
                continue
            loc = find(candidate)
            if loc and (not city_loc or loc.region == city_loc.region):
                return loc
    return city_loc


def suggest(query: str, limit: int = 8) -> list[dict]:
    q = norm(query or "")
    if len(q) < 2:
        return []
    starts, contains, seen = [], [], set()
    for alias, loc in _INDEX.items():
        if loc.label in seen:
            continue
        if alias.startswith(q) or f" {q}" in f" {alias}":  # début du nom ou d'un de ses mots
            starts.append(loc)
            seen.add(loc.label)
        elif q in alias:
            contains.append(loc)
            seen.add(loc.label)
    best = sorted(starts, key=_rank) + sorted(contains, key=_rank)
    return [
        {"name": loc.label, "region": loc.region, "latitude": loc.latitude, "longitude": loc.longitude}
        for loc in best[:limit]
    ]
