"""
Inventaire des licences des composants libres utilisés par Fajma (audit de cession, « due diligence »).

Sources, sans accès réseau :
- serveur (Python) : paquets de backend/requirements.txt et toutes leurs dépendances, lus dans
  l'environnement installé (backend/.venv) ;
- application web (JavaScript) : package-lock.json ; les composants réellement envoyés aux navigateurs sont
  repérés dans les cartes de sources de la compilation (dist/client/assets/*.map), les autres ne servent qu'à
  construire l'application.

Produit docs/dossier-technique/07-licences.md et docs/dossier-technique/annexes/licences.csv.
Lancement (depuis la racine du dépôt) :
    npx vite build --sourcemap                                      (repère les composants livrés)
    backend/.venv/Scripts/python tools/inventaire_licences.py      (Windows ; Linux/macOS : backend/.venv/bin/python)
Les cartes de sources (*.map) sont ensuite supprimées de dist/ : elles ne doivent pas être déployées.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import date
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_MD = ROOT / "docs" / "dossier-technique" / "07-licences.md"
OUT_CSV = ROOT / "docs" / "dossier-technique" / "annexes" / "licences.csv"

PERMISSIVE = {
    "MIT", "ISC", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "APACHE-2.0", "0BSD", "UNLICENSE", "CC0-1.0", "PYTHON-2.0",
    "PSF-2.0", "BLUEOAK-1.0.0", "ZLIB", "CC-BY-4.0", "MIT-CMU", "HPND", "BSD", "APACHE", "PSF",
}
WEAK = ("LGPL", "MPL", "EPL", "CDDL")
STRONG = ("AGPL", "GPL", "SSPL", "EUPL")

# Libellés « Classifier » de PyPI → identifiant SPDX.
CLASSIFIERS = {
    "MIT License": "MIT",
    "BSD License": "BSD",
    "Apache Software License": "Apache-2.0",
    "ISC License (ISCL)": "ISC",
    "Python Software Foundation License": "PSF-2.0",
    "Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0",
    "GNU Library or Lesser General Public License (LGPL)": "LGPL",
    "The Unlicense (Unlicense)": "Unlicense",
    "Historical Permission Notice and Disclaimer (HPND)": "HPND",
}


def category(license_expr: str) -> str:
    """permissive | faible (copyleft limité au composant) | fort (copyleft) | inconnue."""
    if not license_expr or license_expr.upper() in {"UNKNOWN", "NONE"}:
        return "inconnue"
    parts = [p for p in re.split(r"\s+(?:AND|OR)\s+|[()/,]", license_expr.upper()) if p.strip()]
    # Double licence « A OR B » : le choix le plus favorable s'applique.
    if " OR " in license_expr.upper() and any(p.strip() in PERMISSIVE for p in parts):
        return "permissive"
    if any(p.strip().startswith(STRONG) and not p.strip().startswith(("LGPL",)) for p in parts):
        return "fort"
    if any(p.strip().startswith(WEAK) for p in parts):
        return "faible"
    if all(p.strip() in PERMISSIVE or p.strip().startswith(("BSD", "APACHE", "MIT")) for p in parts):
        return "permissive"
    return "inconnue"


# ── Python ───────────────────────────────────────────────────────────


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def python_packages() -> list[dict]:
    reqs = (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8").splitlines()
    todo = [_norm(re.split(r"[=<>!~\[; ]", r, maxsplit=1)[0]) for r in reqs if r.strip() and not r.startswith("#")]
    seen: dict[str, dict] = {}
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        try:
            dist = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            continue  # dépendance conditionnelle (ancienne version de Python, autre système) : non utilisée
        meta = dist.metadata
        lic = (meta.get("License-Expression") or "").strip()
        if not lic:
            classifiers = [c.split(" :: ")[-1] for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
            lic = " OR ".join(CLASSIFIERS.get(c, c) for c in classifiers) if classifiers else ""
        if not lic:
            raw = (meta.get("License") or "").strip().splitlines()
            lic = raw[0][:60] if raw else "UNKNOWN"
        url = meta.get("Home-page") or next(
            (u.split(",", 1)[1].strip() for u in meta.get_all("Project-URL") or [] if "," in u), ""
        )
        seen[name] = {"name": meta["Name"], "version": dist.version, "license": lic, "url": url}
        for req in dist.requires or []:
            if "extra ==" in req:
                continue  # dépendances optionnelles non installées par Fajma
            todo.append(_norm(re.split(r"[=<>!~\[; (]", req, maxsplit=1)[0]))
    return sorted(seen.values(), key=lambda p: p["name"].lower())


# ── JavaScript ───────────────────────────────────────────────────────


def bundled_names() -> set[str] | None:
    """Paquets dont du code est dans les fichiers envoyés aux navigateurs (None : compilation absente)."""
    maps = list((ROOT / "dist" / "client" / "assets").glob("*.map"))
    if not maps:
        return None
    names: set[str] = set()
    for m in maps:
        for src in json.loads(m.read_text(encoding="utf-8")).get("sources", []):
            if "node_modules/" in src:
                rest = src.rsplit("node_modules/", 1)[1].split("/")
                names.add("/".join(rest[:2]) if rest[0].startswith("@") else rest[0])
    return names


def js_packages() -> tuple[list[dict], list[dict]]:
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    bundled = bundled_names()
    if bundled is None:
        raise SystemExit("Lancez d'abord « npx vite build --sourcemap » pour repérer les composants livrés.")
    shipped, tooling = [], []
    for path, info in lock["packages"].items():
        if not path:
            continue
        name = info.get("name") or path.split("node_modules/")[-1]
        entry = {
            "name": name,
            "version": info.get("version", "?"),
            "license": info.get("license") or "UNKNOWN",
            "url": f"https://www.npmjs.com/package/{name}",
        }
        # Seule la version hissée à la racine de node_modules est celle compilée dans l'application.
        top_level = path == f"node_modules/{name}"
        (shipped if name in bundled and top_level else tooling).append(entry)
    key = lambda p: (p["name"].lower(), p["version"])  # noqa: E731
    dedupe = lambda items: sorted({(p["name"], p["version"]): p for p in items}.values(), key=key)  # noqa: E731
    return dedupe(shipped), dedupe(tooling)


# ── Rapport ──────────────────────────────────────────────────────────


def family(name: str) -> str:
    """Nom sans variante de système (lightningcss-linux-x64-gnu → lightningcss)."""
    return re.split(r"-(?:android|darwin|freebsd|linux|win32|wasm)", name, maxsplit=1)[0]


def summary(items: list[dict]) -> Counter:
    return Counter(category(p["license"]) for p in items)


def table(items: list[dict]) -> str:
    rows = ["| Composant | Version | Licence | Catégorie |", "|---|---|---|---|"]
    rows += [f"| {p['name']} | {p['version']} | {p['license']} | {category(p['license'])} |" for p in items]
    return "\n".join(rows)


def main() -> None:
    py = python_packages()
    js, tools = js_packages()
    flagged = [
        (origin, p)
        for origin, items in (("Serveur (Python)", py), ("Application web (livrée)", js), ("Outil de construction", tools))
        for p in items
        if category(p["license"]) != "permissive"
    ]
    names = lambda cat, origin=None: ", ".join(  # noqa: E731
        sorted({family(p["name"]) for o, p in flagged if category(p["license"]) == cat and (origin is None or o == origin)})
    ) or "aucun"
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Origine", "Composant", "Version", "Licence", "Catégorie", "Source"])
        for origin, items in (("Serveur (Python)", py), ("Application web (livrée)", js), ("Outil de construction", tools)):
            for p in items:
                w.writerow([origin, p["name"], p["version"], p["license"], category(p["license"]), p["url"]])

    def line(label: str, items: list[dict]) -> str:
        c = summary(items)
        return f"| {label} | {len(items)} | {c['permissive']} | {c['faible']} | {c['fort']} | {c['inconnue']} |"

    # Outils de construction : variantes par système et par version regroupées (ex. lightningcss-linux-x64-gnu).
    rows, groups = [], {}
    for origin, p in flagged:
        if origin == "Outil de construction":
            groups.setdefault((family(p["name"]), p["license"]), set()).add(p["name"])
        else:
            rows.append(f"| {origin} | {p['name']} {p['version']} | {p['license']} | {category(p['license'])} |")
    for (base, lic), variants in sorted(groups.items()):
        extra = f" (et {len(variants) - 1} variantes par système)" if len(variants) > 1 else ""
        rows.append(f"| Outil de construction | {base}{extra} | {lic} | {category(lic)} |")
    flagged_rows = "\n".join(rows) or "| — | Aucun | — | — |"

    md = f"""# 7. Inventaire des licences

Inventaire généré le {date.today():%d/%m/%Y} par `tools/inventaire_licences.py` à partir des fichiers de
dépendances du dépôt (`backend/requirements.txt` et environnement installé, `package-lock.json`). Il couvre
les dépendances directes **et indirectes**. Liste complète, avec la source de chaque composant :
`annexes/licences.csv` (ouvrable dans un tableur). À régénérer avant toute cession pour refléter la version
livrée.

## 7.1 Synthèse

| Origine | Composants | Permissive | Copyleft faible | Copyleft fort | À vérifier |
|---|---|---|---|---|---|
{line("Serveur (Python)", py)}
{line("Application web — envoyée aux navigateurs", js)}
{line("Outils de construction et de développement — non livrés", tools)}

- **Permissive** (MIT, BSD, ISC, Apache 2.0, PSF…) : usage commercial libre, y compris dans un logiciel
  vendu ; seule obligation, conserver les mentions de copyright et de licence.
- **Copyleft faible** (MPL 2.0, LGPL) : le composant peut être utilisé dans un logiciel propriétaire ; seules
  les modifications apportées **au composant lui-même** devraient être publiées. Fajma n'en modifie aucun.
- **Copyleft fort** (GPL, AGPL) : imposerait de publier le code de Fajma. **Aucun composant de ce type.**
- **À vérifier** : licence non déclarée dans les métadonnées ; à contrôler à la main.

## 7.2 Composants à signaler

| Origine | Composant | Licence | Catégorie |
|---|---|---|---|
{flagged_rows}

**Analyse.**

- **Serveur — copyleft faible** ({names("faible", "Serveur (Python)")}) : bibliothèques utilisées telles
  quelles, sans modification, et appelées par le code de Fajma (pilote PostgreSQL `psycopg`, certificats
  racines `certifi`, notifications Web Push, lecture d'agendas iCal). La LGPL et la MPL autorisent cet usage
  dans un logiciel propriétaire ; elles n'imposeraient de publier que des modifications de ces bibliothèques
  elles-mêmes, et le serveur n'est pas redistribué (service en ligne).
- **Application web livrée** : {"uniquement des licences permissives" if not [1 for o, p in flagged if o == "Application web (livrée)"] else names("faible", "Application web (livrée)")}.
- **Outils de construction — copyleft faible** ({names("faible", "Outil de construction")}) : servent à
  compiler l'application, ne sont ni livrés ni modifiés : aucune obligation.
- **Copyleft fort** : aucun composant. Rien n'oblige à publier le code source de Fajma, qui reste
  propriétaire.

⚖️ Faire confirmer par le conseil juridique de l'acquéreur, qui peut relancer l'outil sur le dépôt.

## 7.3 Obligations à respecter

1. Conserver les fichiers de licence des composants (présents dans les paquets installés) et une page
   « Mentions et licences » accessible aux utilisateurs si l'application est redistribuée (application
   Android publiée sur le Play Store, par exemple).
2. Ne pas modifier les composants sous MPL / LGPL sans publier ces modifications, ou les remplacer.
3. Régénérer cet inventaire à chaque ajout de bibliothèque (commande en tête du fichier de l'outil).

## 7.4 Serveur (Python) — liste complète

{table(py)}

## 7.5 Application web livrée — liste complète

{table(js)}

Les {len(tools)} outils de construction et de développement (Vite, TypeScript, Tailwind, ESLint, Prettier et
leurs dépendances) ne sont pas envoyés aux navigateurs ; ils figurent dans `annexes/licences.csv`.
"""
    OUT_MD.write_text(md, encoding="utf-8", newline="\n")
    print(f"{len(py)} paquets Python, {len(js)} composants web livrés, {len(tools)} outils ; {len(flagged)} à signaler")
    for origin, p in flagged:
        print(f"  {origin} : {p['name']} {p['version']} — {p['license']} ({category(p['license'])})")


if __name__ == "__main__":
    main()
