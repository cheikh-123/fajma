# 7. Inventaire des licences

Inventaire généré le 01/10/2026 par `tools/inventaire_licences.py` à partir des fichiers de
dépendances du dépôt (`backend/requirements.txt` et environnement installé, `package-lock.json`). Il couvre
les dépendances directes **et indirectes**. Liste complète, avec la source de chaque composant :
`annexes/licences.csv` (ouvrable dans un tableur). À régénérer avant toute cession pour refléter la version
livrée.

## 7.1 Synthèse

| Origine | Composants | Permissive | Copyleft faible | Copyleft fort | À vérifier |
|---|---|---|---|---|---|
| Serveur (Python) | 42 | 35 | 7 | 0 | 0 |
| Application web — envoyée aux navigateurs | 49 | 49 | 0 | 0 | 0 |
| Outils de construction et de développement — non livrés | 439 | 415 | 24 | 0 | 0 |

- **Permissive** (MIT, BSD, ISC, Apache 2.0, PSF…) : usage commercial libre, y compris dans un logiciel
  vendu ; seule obligation, conserver les mentions de copyright et de licence.
- **Copyleft faible** (MPL 2.0, LGPL) : le composant peut être utilisé dans un logiciel propriétaire ; seules
  les modifications apportées **au composant lui-même** devraient être publiées. Fajma n'en modifie aucun.
- **Copyleft fort** (GPL, AGPL) : imposerait de publier le code de Fajma. **Aucun composant de ce type.**
- **À vérifier** : licence non déclarée dans les métadonnées ; à contrôler à la main.

## 7.2 Composants à signaler

| Origine | Composant | Licence | Catégorie |
|---|---|---|---|
| Serveur (Python) | certifi 2026.7.22 | MPL-2.0 | faible |
| Serveur (Python) | psycopg 3.3.6 | LGPL-3.0-only | faible |
| Serveur (Python) | psycopg-binary 3.3.6 | LGPL-3.0-only | faible |
| Serveur (Python) | py-vapid 1.9.4 | MPL-2.0 | faible |
| Serveur (Python) | pywebpush 2.5.0 | MPL-2.0 | faible |
| Serveur (Python) | recurring-ical-events 3.8.2 | LGPL-3.0-or-later | faible |
| Serveur (Python) | x-wr-timezone 2.0.1 | GNU Lesser General Public License v3 or later (LGPLv3+) | faible |
| Outil de construction | lightningcss (et 11 variantes par système) | MPL-2.0 | faible |

**Analyse.**

- **Serveur — copyleft faible** (certifi, psycopg, psycopg-binary, py-vapid, pywebpush, recurring-ical-events, x-wr-timezone) : bibliothèques utilisées telles
  quelles, sans modification, et appelées par le code de Fajma (pilote PostgreSQL `psycopg`, certificats
  racines `certifi`, notifications Web Push, lecture d'agendas iCal). La LGPL et la MPL autorisent cet usage
  dans un logiciel propriétaire ; elles n'imposeraient de publier que des modifications de ces bibliothèques
  elles-mêmes, et le serveur n'est pas redistribué (service en ligne).
- **Application web livrée** : uniquement des licences permissives.
- **Outils de construction — copyleft faible** (lightningcss) : servent à
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

| Composant | Version | Licence | Catégorie |
|---|---|---|---|
| aiohappyeyeballs | 2.7.1 | PSF-2.0 | permissive |
| aiohttp | 3.14.3 | Apache-2.0 AND MIT | permissive |
| aiosignal | 1.4.0 | Apache-2.0 | permissive |
| asgiref | 3.12.1 | BSD | permissive |
| attrs | 26.1.0 | MIT | permissive |
| certifi | 2026.7.22 | MPL-2.0 | faible |
| cffi | 2.1.1 | MIT-0 | permissive |
| charset-normalizer | 3.5.1 | MIT | permissive |
| click | 8.5.0 | BSD-3-Clause | permissive |
| cryptography | 50.0.1 | Apache-2.0 OR BSD-3-Clause | permissive |
| Django | 6.1.1 | BSD-3-Clause | permissive |
| django-stubs-ext | 6.1.1 | MIT | permissive |
| django-tasks-db | 0.13.0 | BSD-3-Clause | permissive |
| djangorestframework | 3.18.1 | BSD-3-Clause | permissive |
| frozenlist | 1.8.0 | Apache-2.0 | permissive |
| gunicorn | 26.2.0 | MIT | permissive |
| h11 | 0.16.0 | MIT | permissive |
| http_ece | 1.2.1 | MIT | permissive |
| icalendar | 7.3.0 | BSD-2-Clause | permissive |
| idna | 3.20 | BSD-3-Clause | permissive |
| multidict | 6.9.1 | Apache License 2.0 | permissive |
| propcache | 0.5.4 | Apache-2.0 | permissive |
| psycopg | 3.3.6 | LGPL-3.0-only | faible |
| psycopg-binary | 3.3.6 | LGPL-3.0-only | faible |
| py-vapid | 1.9.4 | MPL-2.0 | faible |
| pycparser | 3.0 | BSD-3-Clause | permissive |
| python-dateutil | 2.9.0.post0 | BSD OR Apache-2.0 | permissive |
| python-dotenv | 1.2.3 | BSD-3-Clause | permissive |
| pywebpush | 2.5.0 | MPL-2.0 | faible |
| recurring-ical-events | 3.8.2 | LGPL-3.0-or-later | faible |
| requests | 2.34.2 | Apache-2.0 | permissive |
| sentry-sdk | 2.71.0 | MIT | permissive |
| six | 1.17.0 | MIT | permissive |
| sqlparse | 0.6.0 | BSD | permissive |
| typing_extensions | 4.16.0 | PSF-2.0 | permissive |
| tzdata | 2026.4 | Apache-2.0 | permissive |
| urllib3 | 2.8.0 | MIT | permissive |
| uvicorn | 0.54.0 | BSD-3-Clause | permissive |
| uvicorn-worker | 0.4.0 | BSD-3-Clause | permissive |
| whitenoise | 6.12.0 | MIT | permissive |
| x-wr-timezone | 2.0.1 | GNU Lesser General Public License v3 or later (LGPLv3+) | faible |
| yarl | 1.25.1 | Apache-2.0 | permissive |

## 7.5 Application web livrée — liste complète

| Composant | Version | Licence | Catégorie |
|---|---|---|---|
| @pdf-lib/standard-fonts | 1.0.0 | MIT | permissive |
| @pdf-lib/upng | 1.0.1 | MIT | permissive |
| @tanstack/history | 1.162.0 | MIT | permissive |
| @tanstack/query-core | 5.101.4 | MIT | permissive |
| @tanstack/react-query | 5.101.4 | MIT | permissive |
| @tanstack/react-router | 1.170.18 | MIT | permissive |
| @tanstack/react-start | 1.168.32 | MIT | permissive |
| @tanstack/react-start-client | 1.168.16 | MIT | permissive |
| @tanstack/react-store | 0.9.3 | MIT | permissive |
| @tanstack/router-core | 1.171.15 | MIT | permissive |
| @tanstack/start-client-core | 1.170.14 | MIT | permissive |
| @tanstack/store | 0.9.3 | MIT | permissive |
| clsx | 2.1.1 | MIT | permissive |
| d3-array | 3.2.4 | ISC | permissive |
| d3-color | 3.1.0 | ISC | permissive |
| d3-format | 3.1.2 | ISC | permissive |
| d3-interpolate | 3.0.1 | ISC | permissive |
| d3-path | 3.1.0 | ISC | permissive |
| d3-scale | 4.0.2 | ISC | permissive |
| d3-shape | 3.2.0 | ISC | permissive |
| d3-time | 3.1.0 | ISC | permissive |
| d3-time-format | 4.1.0 | ISC | permissive |
| decimal.js-light | 2.5.1 | MIT | permissive |
| dijkstrajs | 1.0.3 | MIT | permissive |
| eventemitter3 | 4.0.7 | MIT | permissive |
| fast-equals | 5.4.1 | MIT | permissive |
| internmap | 2.0.3 | ISC | permissive |
| leaflet | 1.9.4 | BSD-2-Clause | permissive |
| lodash | 4.18.1 | MIT | permissive |
| lucide-react | 0.575.0 | ISC | permissive |
| pako | 1.0.11 | (MIT AND Zlib) | permissive |
| pdf-lib | 1.17.1 | MIT | permissive |
| prop-types | 15.8.1 | MIT | permissive |
| qrcode | 1.5.4 | MIT | permissive |
| react | 19.2.8 | MIT | permissive |
| react-dom | 19.2.8 | MIT | permissive |
| react-is | 18.3.1 | MIT | permissive |
| react-smooth | 4.0.4 | MIT | permissive |
| recharts | 2.15.4 | MIT | permissive |
| recharts-scale | 0.4.5 | MIT | permissive |
| scheduler | 0.27.0 | MIT | permissive |
| seroval | 1.5.6 | MIT | permissive |
| seroval-plugins | 1.5.6 | MIT | permissive |
| sonner | 2.0.7 | MIT | permissive |
| tiny-invariant | 1.3.3 | MIT | permissive |
| tslib | 2.8.1 | 0BSD | permissive |
| use-sync-external-store | 1.6.0 | MIT | permissive |
| victory-vendor | 36.9.2 | MIT AND ISC | permissive |
| zod | 3.25.76 | MIT | permissive |

Les 439 outils de construction et de développement (Vite, TypeScript, Tailwind, ESLint, Prettier et
leurs dépendances) ne sont pas envoyés aux navigateurs ; ils figurent dans `annexes/licences.csv`.
