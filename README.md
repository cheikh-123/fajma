# Fajma

Plateforme de santé pour le Sénégal : annuaire de médecins et prise de rendez-vous en ligne, téléconsultation,
dossier médical, ordonnances et certificats vérifiables, paiement mobile (Wave, Orange Money, Free Money),
assurances (IPM, mutuelles CMU, assureurs privés), carnet de vaccination et suivi de grossesse, pharmacies
partenaires, réservation par WhatsApp et USSD, espace clinique, télé-expertise entre médecins.
Interface en français, wolof et anglais.

## Architecture

| Partie | Technologie | Dossier |
|---|---|---|
| Backend (API, règles métier, sécurité) | Python 3.13, Django 6.1, Django REST Framework | `backend/` |
| Frontend (interface, PWA installable) | React 19, TanStack Router/Start (mode SPA), Tailwind CSS 4, TypeScript | `src/`, `public/` |
| Base de données | SQLite en local ; PostgreSQL 17 en production | `backend/db.sqlite3` |
| File de tâches | `django.tasks` + `django-tasks-db` (SMS, emails, notifications push) | `backend/notifications/tasks.py` |
| Déploiement | Docker Compose (PostgreSQL, API, worker, planificateur, nginx) | `deploy/` |

Le navigateur ne parle qu'à l'API Django (`/api/...`). La connexion utilise un cookie de session HttpOnly
et une protection CSRF. En développement, Vite relaie `/api` vers Django : tout est servi depuis
`http://localhost:8080`.

## Démarrage en local

Prérequis : Python 3.13+, Node.js 22+.

**1. Backend** (premier terminal)

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux : source .venv/bin/activate)
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo --accounts              # données et comptes de démonstration
python manage.py seed_demo --accounts --activity   # + 12 semaines d'activité simulée (tableau de bord)
python manage.py runserver 8000
```

**2. Frontend** (second terminal, à la racine)

```sh
npm install
npm run dev                        # http://localhost:8080
```

Comptes de démonstration (mot de passe `Fajma-Demo-2026`), créés par `seed_demo --accounts` :

| Interface | Compte |
|---|---|
| Patient | `patient@fajma.local` (ou téléphone 77 123 45 67 avec `--scenario`) |
| Médecin généraliste | `medecin@fajma.local` |
| Médecin cardiologue (télé-expertise) | `cardiologue@fajma.local` |
| Responsable de clinique | `clinique@fajma.local` |
| Secrétaire de clinique | `secretariat@fajma.local` |
| Pharmacien | `pharmacie@fajma.local` |
| Administration | `admin@fajma.local` |

`python manage.py seed_demo --scenario` ajoute un dossier complet pour tester chaque interface : RDV passé
(compte-rendu, ordonnance, paiement, avis), RDV à venir (tiers payant IPM, questionnaire), enfant et carnet
de vaccination, messages, document partagé, ordonnance envoyée à la pharmacie, demande de télé-expertise.
En local, la connexion par téléphone affiche le code SMS à l'écran.
L'administration Django est disponible sur http://localhost:8080/django-admin/.

## Fonctionnalités

| Domaine | Patients | Professionnels | Administration |
|---|---|---|---|
| Rendez-vous | Recherche (spécialité, ville, langue, assurance, disponibilité, carte), réservation pour soi ou un proche, **visite à domicile**, **série de séances**, déplacement, annulation, liste d'attente, fichier agenda (.ics) | Agenda, plages horaires multi-lieux, **plages de visites à domicile**, **séances répétées**, **remplacements entre médecins**, absences, règles de réservation, motifs et tarifs, **synchronisation avec Google Agenda / Outlook / iPhone** | Pilotage (tendances, canaux, spécialités, villes) |
| Téléconsultation | Salle d'attente, vidéo Jitsi | Démarrage de la consultation | — |
| Dossier médical | Documents, profil de santé, partage avec un médecin, journal des accès | Fiche patient, comptes-rendus, notes privées, rappels | Journal d'audit |
| Documents | Ordonnances, certificats, arrêts de travail en PDF avec QR de vérification | Rédaction et signature électronique | — |
| Questionnaire | Réponses avant la consultation | Questions par défaut ou par motif | — |
| Carnet de santé | Vaccins de l'enfant (PEV), suivi de grossesse (CPN), rappels SMS | Inscription d'un vaccin fait | — |
| Argent | Paiement mobile ou au cabinet, reçu / feuille de soins, remboursement | Solde, virements, abonnement, commission | Virements, remboursements, volumes |
| Assurances | Couvertures (IPM, CMU, privées), part patient en tiers payant | Organismes acceptés, part à facturer | Liste des organismes |
| Pharmacies | Envoi d'ordonnance, suivi de préparation | Espace pharmacie (reçue → prête → retirée) | Rattachement des pharmaciens |
| Confiance | Avis après consultation | Réponse publique, signalement | Modération, vérification des diplômes |
| Clinique | — | Agenda partagé, secrétariat, fichier patients, doublons | Validation des établissements |
| Entre médecins | — | Télé-expertise avec dossier partagé | — |
| Canaux | WhatsApp, USSD, notifications push, **messages et alertes en temps réel**, mode hors ligne, installation sur le téléphone | Module de réservation pour leur site | — |

## Tests et vérifications

```sh
cd backend && python manage.py test     # tests de l'API (règles métier et sécurité)
npx tsc --noEmit                        # typage du frontend
npm run lint                            # lint du frontend
npm run build                           # build de production
```

## Tâches planifiées

Une commande à lancer toutes les 10 minutes (cron, systemd timer, planificateur Windows) envoie :
les rappels de RDV (24 h et 2 h avant), les rappels programmés par les médecins, les rappels de vaccins
des enfants et de consultations prénatales.

```sh
python manage.py send_reminders
```

En production, SMS, emails et notifications push partent par une file de tâches (`TASK_BACKEND=database`)
traitée par `python manage.py db_worker`. En local, ils partent immédiatement, sans worker.

## Langues

Français (référence), wolof et anglais : `src/lib/i18n/{fr,wo,en}.ts`. La langue choisie dans l'application
devient aussi celle des SMS et des menus WhatsApp/USSD du patient. Ajouter une langue (pulaar, sérère…)
revient à ajouter un fichier ; le typage signale toute clé manquante. **Les textes en wolof doivent être relus
par un locuteur natif, idéalement un traducteur médical, avant la mise en production.**

## Réservation sans application : WhatsApp et USSD

Le même menu (prendre RDV, mes RDV, annuler, pharmacies de garde, langue) est proposé :

- **WhatsApp** : dans la console Twilio, régler le webhook « A message comes in » du numéro WhatsApp sur
  `https://<domaine>/api/bots/whatsapp` (POST). Chaque requête est authentifiée par la signature Twilio
  (`TWILIO_AUTH_TOKEN`). Écrire « menu » relance la conversation.
- **USSD** (tout téléphone, sans internet) : chez l'agrégateur (Africa's Talking, Orange…), déclarer
  l'URL de rappel `https://<domaine>/api/bots/ussd` et l'en-tête `X-Ussd-Secret: <USSD_SECRET>`.
  Réponses au format standard `CON …` / `END …`, écrans de 182 caractères au plus, « 9 » = suite, « 00 » = menu.

Un numéro inconnu peut réserver : le compte est créé avec ce numéro (déjà vérifié par l'opérateur ou WhatsApp).

## Téléphone : application installable, hors ligne, notifications

- **Application installable (PWA)** : Fajma s'installe depuis le navigateur (bouton « Installer » sur Android,
  « Partager → Sur l'écran d'accueil » sur iPhone).
- **Réseau lent / hors ligne** : le service worker (`public/sw.js`) garde l'application et les dernières données
  personnelles (RDV, carnet, documents, assurances) ; un bandeau signale la consultation hors ligne. Ces données
  sont effacées à la déconnexion. Réservations et paiements exigent le réseau.
- **Notifications push** : générer les clés une fois (`python manage.py vapid_keys`) et les placer dans
  `WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY`. Chaque notification de l'application est aussi envoyée
  aux téléphones abonnés (gratuit) ; le SMS reste réservé aux messages importants.
- **Play Store** : l'application Android est générée à partir du site (Trusted Web Activity) avec
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) et le fichier `twa-manifest.json` :
  `npx @bubblewrap/cli build`, puis reporter l'empreinte SHA-256 de la clé de signature dans
  `public/.well-known/assetlinks.json`. Il n'y a pas de code Android à maintenir ; chaque mise à jour du site
  met l'application à jour.

## Agenda du médecin synchronisé

Depuis son espace, le médecin :

1. **s'abonne à ses RDV Fajma** dans Google Agenda, Outlook ou l'iPhone grâce à un lien privé
   (`/api/calendar/<jeton>.ics`, initiales des patients uniquement, lien révocable). Google Agenda relit les
   abonnements toutes les quelques heures, Outlook environ toutes les 3 h ;
2. **bloque sur Fajma ses occupations personnelles** en collant l'« adresse secrète iCal » de son agenda :
   elle est relue toutes les 10 minutes (`python manage.py sync_calendars`, lancé par le planificateur),
   seuls les horaires sont gardés, les événements « disponible » sont ignorés, les événements répétés sont gérés.
   Les adresses internes sont refusées (protection SSRF).

## Temps réel

Les nouveaux messages et notifications arrivent sans recharger la page, par un flux d'événements
(`/api/events`, Server-Sent Events). En production, ce flux est servi par un service ASGI dédié (`events`,
uvicorn) pour que des milliers de connexions ouvertes ne bloquent pas l'API ; nginx le transmet sans mise
en mémoire tampon. En développement, `runserver` suffit.

## Module de réservation pour le site d'un médecin

Chaque médecin copie depuis son espace un code `<iframe>` pointant sur `/widget/<id>` : ses prochains créneaux
s'affichent sur son propre site, la réservation se termine sur Fajma dans un nouvel onglet. Seule cette page peut
être affichée dans un cadre (`deploy/embed-headers.conf`).

## Référencement

`/sitemap.xml` et `/robots.txt` sont générés par Django. Les fiches médecin et les pages spécialité
sont servies aux robots (Google, aperçus WhatsApp/Facebook) sous forme de HTML simple avec balises
Open Graph et données structurées schema.org (`Physician`), les visiteurs recevant l'application.

## Déploiement

Le dossier `deploy/` contient tout le nécessaire pour un serveur Linux avec Docker :

| Service     | Rôle                                                            |
|-------------|-----------------------------------------------------------------|
| `db`        | PostgreSQL 17 (volume `pgdata`)                                 |
| `backend`   | API Django (gunicorn) ; applique les migrations au démarrage    |
| `events`    | flux temps réel `/api/events` (ASGI, uvicorn)                    |
| `worker`    | file de tâches : SMS, WhatsApp, emails, notifications push      |
| `scheduler` | rappels (RDV, médecins, vaccins, grossesse) et relecture des agendas des médecins, toutes les 10 minutes |
| `web`       | nginx : site, relais `/api`, en-têtes de sécurité et CSP stricte|

```sh
cp deploy/.env.example deploy/.env      # remplir : mot de passe PostgreSQL, clé secrète, domaine, clés
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml exec backend python manage.py createsuperuser
```

- **HTTPS** : placer le serveur derrière un répartiteur TLS (qui transmet `X-Forwarded-Proto`) ou
  ajouter un bloc `listen 443 ssl` avec des certificats Let's Encrypt dans `deploy/nginx.conf`.
- **CSP** : les empreintes des scripts intégrés à la page sont recalculées à chaque build
  (`deploy/csp-hashes.mjs`) ; aucun `unsafe-inline` pour les scripts.
- **Sauvegardes** : `pg_dump` quotidien de la base et copie du volume `private_media` (documents médicaux,
  justificatifs des médecins), chiffrées et conservées hors du serveur.
- **Téléconsultation** : le service public meet.jit.si convient pour démarrer ; pour la production,
  héberger Jitsi Meet (image officielle `docker-jitsi-meet`) sur un serveur au Sénégal, puis renseigner
  `JITSI_DOMAIN` dans `deploy/.env` (utilisé pour les salles et la CSP).
- **Intégration continue** : `.github/workflows/ci.yml` lance les tests (SQLite et PostgreSQL),
  `check --deploy`, le typage, le lint, le build et l'audit des dépendances à chaque modification.

## Organisation du code

```
backend/                      ← BACKEND (Django)
├── sunusante/                Configuration, routes de l'API, outils communs (api.py, uploads.py), pilotage
├── accounts/                 Comptes, connexion (mot de passe, SMS, 2FA), profil, proches, back-office
├── directory/                Annuaire, médecins, avis et modération, justificatifs, référencement (seo.py)
├── appointments/             Rendez-vous, créneaux (scheduling.py), questionnaire, liste d'attente
├── payments/                 Paiements PayDunya, commission et solde (ledger.py), abonnements (plans.py)
├── insurance/                Organismes, couvertures des patients, tiers payant
├── medical/                  Comptes-rendus, ordonnances, certificats (issued.py), documents
├── carnet/                   Vaccination (calendrier PEV), grossesse (CPN), rappels
├── pharmacy/                 Pharmacies partenaires, ordonnances transmises
├── clinics/                  Cliniques, secrétariat, fichier patients (patients.py)
├── expertise/                Télé-expertise entre médecins
├── messaging/                Messagerie patient ↔ médecin
├── bots/                     Menu WhatsApp et USSD (engine.py, texts.py)
├── notifications/            SMS/WhatsApp, emails, notifications push, file de tâches, rappels
├── audit/                    Journal d'audit (accès aux dossiers)
└── tests/                    Tests de l'API

src/                          ← FRONTEND (React)
├── api/                      Appels à l'API Django, un fichier par domaine + types.ts
├── routes/                   Pages (une URL = un fichier)
├── components/               Composants (pro/, admin/, clinic/, ui/)
└── lib/                      Traductions (i18n/), dates à l'heure de Dakar, PDF

public/                       PWA : manifeste, service worker, icônes, page hors ligne
deploy/                       Docker Compose, nginx, CSP, variables de production
docs/dossier-technique/       Dossier technique et sécurité
```

## Configuration

Les variables sont listées dans `backend/.env.example` (développement) et `deploy/.env.example` (production) :
Django, base de données, PayDunya, Twilio, USSD, notifications push, Jitsi, IA, emails, Sentry.
En local, aucune n'est obligatoire : sans clés, le paiement mobile, les SMS, les notifications push et
l'assistant IA sont désactivés ou affichent « non configuré ».
