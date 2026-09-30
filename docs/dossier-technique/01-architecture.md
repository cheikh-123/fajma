# 1. Architecture

## 1.1 Vue d'ensemble

```
 Navigateur / appli installée (PWA)      WhatsApp (Twilio)        Téléphone simple (USSD)
            │  HTTPS                              │ webhook signé             │ agrégateur (secret partagé)
            ▼                                     ▼                           ▼
 ┌──────────────────────── nginx (conteneur « web ») ─────────────────────────────────────┐
 │ fichiers du site (build React), CSP stricte, en-têtes de sécurité, relais /api          │
 │ pages HTML simples pour les robots (référencement, aperçus de liens)                   │
 └───────────────────────────────┬────────────────────────────────────────────────────────┘
                                 ▼
 ┌──── API Django (« backend », gunicorn)  +  flux temps réel (« events », ASGI) ────┐
 │ authentification, contrôle d'accès, règles métier, journal d'audit            │
 └───────┬────────────────────────────┬──────────────────────────┬──────────────┘
         ▼                            ▼                          ▼
   PostgreSQL 17              fichiers privés            file de tâches (table)
   (volume pgdata)            (volume private_media)     ▲
                                                         │
          « worker » : SMS, WhatsApp, emails, push ──────┘
          « scheduler » : rappels et supervision toutes les 10 minutes, purge nocturne
          « backup » : sauvegarde quotidienne chiffrée, test de restauration mensuel
```

Services externes : PayDunya (paiement), Twilio (SMS, WhatsApp), service push des navigateurs, Jitsi
(vidéo), fournisseur d'IA (assistant d'orientation), agrégateur USSD, fournisseur SMTP (emails).

## 1.2 Organisation du code

| Dossier | Rôle |
|---|---|
| `backend/sunusante/` | Configuration, routes de l'API, outils communs (validation des entrées, fichiers déposés), tableau de pilotage |
| `backend/accounts/` | Comptes, connexion (mot de passe, code SMS, double authentification), profil, proches, export et suppression des données |
| `backend/directory/` | Annuaire, fiches médecin, créneaux, avis et modération, justificatifs (diplômes), espace médecin, référencement |
| `backend/appointments/` | Rendez-vous, calcul des créneaux, questionnaire avant consultation, liste d'attente, téléconsultation |
| `backend/payments/` | Paiements PayDunya, journal comptable des médecins, virements, remboursements, abonnements |
| `backend/insurance/` | Organismes (IPM, CMU, assureurs), couvertures des patients, tiers payant |
| `backend/medical/` | Comptes-rendus, ordonnances, certificats et arrêts de travail, documents, profil de santé, rappels |
| `backend/carnet/` | Carnet de vaccination (calendrier PEV), suivi de grossesse (CPN), rappels |
| `backend/pharmacy/` | Pharmacies partenaires, ordonnances transmises et leur préparation |
| `backend/clinics/` | Cliniques, secrétariat, agenda partagé, fichier patients et doublons |
| `backend/expertise/` | Télé-expertise et messagerie entre médecins |
| `backend/messaging/` | Messagerie patient ↔ médecin |
| `backend/bots/` | Menu WhatsApp et USSD (moteur commun, textes en trois langues) |
| `backend/notifications/` | SMS/WhatsApp, emails, notifications push, tâches en arrière-plan, rappels planifiés |
| `backend/care/` | Suivi à domicile (mesures, repères indicatifs) et rappels de prise de médicaments |
| `backend/labs/` | Laboratoires d'analyses : prescription, choix du laboratoire, prélèvement, dépôt des résultats |
| `backend/audit/` | Journal d'audit inaltérable ; commandes d'exploitation `monitor` (supervision) et `purge_data` (conservation) |
| `backend/tests/` | Tests automatisés de l'API |
| `src/` | Interface React : `api/` (appels à l'API), `routes/` (pages), `components/`, `lib/` (traductions, dates, PDF) |
| `public/` | Manifeste PWA, service worker (hors ligne, notifications), icônes |
| `deploy/` | Docker Compose, images, nginx, politique CSP, variables de production |

## 1.3 Fonctionnalités

| Domaine | Détail |
|---|---|
| Recherche | Spécialité, ville, nom (sans accents), langue parlée, assurance acceptée, prix, disponibilité (aujourd'hui, semaine), téléconsultation, tri, carte (OpenStreetMap) |
| Réservation | Créneaux calculés par le serveur (plages, absences, délai minimal, horizon, durée du motif), multi-lieux, pour soi ou un proche, confirmation automatique ou par le médecin, anti-chevauchement garanti en base (contrainte d'exclusion PostgreSQL) |
| Visites à domicile | Plages horaires dédiées (trajet compris), supplément de déplacement, zone desservie, adresse + repère + position GPS facultative, itinéraire pour le médecin |
| Séries de séances | Motif réservable en série (kiné, pansements : 2 à 20 séances, tous les 1/2/3/7/14 jours), aperçu des dates libres, un seul message récapitulatif, annulation de la suite de la série ; le médecin ou le secrétariat peut ajouter des séances à tout rendez-vous |
| Remplacements | Le titulaire propose une période à un confrère vérifié, qui accepte ; l'agenda reste ouvert, le remplaçant reçoit les patients, accède au dossier pendant la période et signe à son nom (mention « remplaçant du Dr X ») ; paiements versés au titulaire |
| Après réservation | Déplacement, annulation (délai fixé par le médecin), fichier agenda `.ics`, rappels 24 h et 2 h, liste d'attente avec alerte, questionnaire avant consultation |
| Téléconsultation | Salle d'attente, prépaiement optionnel, salle vidéo au nom aléatoire ouverte par le médecin |
| Dossier patient | Profil de santé, documents (PDF, images), partage explicite avec un médecin, comptes-rendus, ordonnances, certificats, journal des accès, export et suppression du compte |
| Documents médicaux | Ordonnances, certificats, arrêts de travail, courriers : PDF signé électroniquement avec QR de vérification publique (sans contenu médical ni identité complète) |
| Carnet de santé | Calendrier vaccinal PEV de chaque enfant (statuts à faire / en retard / fait, dose vérifiée par le médecin), suivi de grossesse (terme, 8 consultations prénatales), déclaration de naissance qui crée le carnet du bébé, rappels SMS |
| Argent | Paiement mobile ou au cabinet ; commission selon l'abonnement du médecin ; solde et demandes de virement ; remboursement automatique en cas d'annulation d'un RDV payé ; reçu servant de feuille de soins |
| Assurances | Couvertures du patient (numéro, taux, validité, pour un proche) ; organismes acceptés par le médecin, avec ou sans tiers payant ; part patient calculée et figée à la réservation |
| Pharmacies | Envoi d'une ordonnance à une pharmacie partenaire, préparation (reçue → en préparation → prête / indisponible → retirée), montant, notification du patient |
| Clinique | Équipe médicale, secrétariat, agenda partagé, RDV au guichet (même sans compte), fichier patients, détection et fusion des doublons, rattachement au compte du patient ; le responsable modifie les informations de l'établissement et retire un médecin qui part |
| Suivi à domicile | Le patient note tension, glycémie (g/L, à jeun ou après repas) et poids, pour lui ou un proche ; courbe, repères indicatifs (tension ≥ 180/110 : conseil d'appeler le 1515 ; hypoglycémie < 0,7 g/L) ; les médecins qui le suivent voient la courbe dans la fiche patient |
| Rappels de médicaments | Heures de prise (1 à 6 par jour), durée du traitement, pour soi ou un proche, à partir d'une ordonnance ou en saisie libre ; notification gratuite, SMS/WhatsApp en option ; envoi par le planificateur, sans doublon |
| Laboratoires | Le médecin prescrit des analyses pendant la consultation ; le patient choisit un laboratoire partenaire ; le laboratoire enregistre le prélèvement et dépose les résultats (PDF), qui rejoignent le dossier du patient et sont partagés avec le prescripteur ; patient et médecin prévenus |
| Disponibilité des médicaments | « Avez-vous ce médicament ? » : le patient interroge jusqu'à 5 pharmacies partenaires (5 demandes par jour), qui répondent sous 24 h (disponible, prix, indisponible) sans connaître son identité |
| Annuaire | Pages publiques des cliniques et centres de santé vérifiés, avec leurs médecins et prochains créneaux (les cabinets individuels n'y figurent pas) ; « Mes médecins » : médecins consultés et reprise de RDV en un clic |
| Agenda tenu par le cabinet | Le médecin (ou son secrétariat) saisit un RDV pris au téléphone ou au cabinet, pour un patient connu ou sans compte, et **déplace** un RDV (patient prévenu par SMS) ; hors plages en ligne autorisé, jamais sur un autre RDV ni pendant une absence |
| Exports | Tableur (CSV pour Excel) : rendez-vous, **bordereau de tiers payant** par organisme, revenus ; agenda de la clinique ; chaque export est journalisé |
| Messagerie | Patient ↔ médecin, y compris le remplaçant qui l'a reçu ; texte et **pièces jointes** (photo ou PDF, type réel contrôlé, 6 Mo), accessibles aux seuls participants du fil |
| Espace médecin | Fiche publique modifiable (présentation, tarif, langues, téléconsultation, adresse) et photo ; nom et spécialité figés après vérification ; « Mon secrétariat » : un médecin seul donne l'accès à son agenda à sa secrétaire par simple email |
| Espace pharmacie | Horaires, jours d'ouverture, coordonnées et **garde** (avec date de fin, retrait automatique de la liste des pharmacies de garde) gérés par le pharmacien |
| Administration | Validation des médecins et établissements, justificatifs, modération, finances (virements, remboursements), rattachement des pharmaciens, **recherche de comptes, suspension/réactivation, réinitialisation de la double authentification, ajout et correction des pharmacies**, rappels SMS, journal d'audit |
| Médecins entre eux | Télé-expertise avec dossier et documents partagés (patient informé), messagerie |
| Confiance | Avis après consultation, réponse du médecin, signalement, modération ; publication d'un médecin conditionnée à la validation de son inscription à l'Ordre |
| Canaux | WhatsApp, USSD, notifications push, messages et alertes en temps réel (Server-Sent Events), application installable, mode hors ligne, module de réservation intégrable au site du médecin |
| Agenda du médecin | Abonnement privé à ses RDV depuis Google Agenda / Outlook / iPhone (initiales seulement) ; import de ses occupations personnelles (adresse iCal secrète), qui bloquent les créneaux |
| Pilotage | Activité hebdomadaire, taux d'absence, part de téléconsultation, canaux, spécialités et villes, volumes financiers |
| Référencement | Plan du site, pages HTML pour les robots, données structurées schema.org |

## 1.4 Modèle de données (principales tables)

| Table | Contenu |
|---|---|
| `accounts_user`, `accounts_relative` | Comptes (email et/ou téléphone vérifié, langue), proches |
| `accounts_twofactor`, `accounts_otpcode` | Double authentification, codes SMS (empreintes uniquement) |
| `directory_doctor`, `…_doctorlocation`, `…_doctoravailability`, `…_timeoff`, `…_consultationtype` | Fiches (photo, visites à domicile), lieux, plages (cabinet ou domicile), absences, motifs, tarifs, séries, questionnaires |
| `directory_replacement` | Remplacements entre médecins (période, statut) |
| `directory_pharmacy` | Officines (horaires, jours d'ouverture, garde et fin de garde) |
| `directory_review`, `directory_doctorcredential` | Avis (modération, réponse), justificatifs des médecins |
| `appointments_appointment`, `…_appointmentseries`, `…_waitlistentry` | Rendez-vous (canal, assurance figée, questionnaire, adresse de visite, médecin remplaçant, rang dans une série), séries de séances, liste d'attente |
| `payments_payment`, `…_refund`, `…_payout`, `…_ledgerentry`, `…_subscription`, `…_subscriptionpayment` | Paiements, remboursements, virements, journal comptable, abonnements |
| `insurance_insurer`, `…_patientcoverage`, `…_doctorinsurer` | Organismes, couvertures, organismes acceptés |
| `medical_*` | Comptes-rendus, ordonnances, documents, partages, profils de santé, notes privées, rappels, documents rédigés |
| `carnet_*` | Doses de vaccin, rappels envoyés, grossesses, consultations prénatales |
| `pharmacy_*` | Pharmaciens rattachés, ordonnances transmises |
| `clinics_*`, `expertise_*`, `messaging_*` | Cliniques et personnel, télé-expertise, messages |
| `notifications_*` | Notifications, rappels SMS, abonnements push |
| `bots_botsession` | Conversations WhatsApp/USSD en cours |
| `care_measurement`, `care_medicationreminder` | Mesures à domicile, rappels de médicaments |
| `labs_laboratory`, `…_laboratorymember`, `…_laborder` | Laboratoires, personnel rattaché, prescriptions d'analyses et résultats |
| `pharmacy_medicinequery`, `…_medicineanswer` | Demandes de disponibilité d'un médicament et réponses des pharmacies |
| `audit_auditevent` | Journal d'audit (aucune modification ni suppression possible par l'application) |

Identifiants : UUID aléatoires (aucun identifiant séquentiel devinable dans les URL). Montants : entiers en francs CFA.
Heures : stockées en UTC, affichées à l'heure de Dakar (UTC+0 toute l'année).

## 1.5 Intégrations externes

| Service | Usage | Mode de sécurisation | Comportement sans configuration |
|---|---|---|---|
| PayDunya | Paiement des consultations et abonnements | Clés serveur ; statut relu auprès de PayDunya (jamais cru depuis le navigateur ou la notification) | Paiement au cabinet uniquement |
| Twilio | SMS, WhatsApp (rappels, codes, robot) | Jeton serveur ; webhook entrant vérifié par signature ; repli WhatsApp → SMS | Envoi désactivé (journalisé) |
| Agrégateur USSD | Menu USSD | Secret partagé (en-tête), numéro fourni par l'opérateur | Point d'entrée refusé |
| Web Push | Notifications sur le téléphone | Clés VAPID ; abonnements expirés supprimés | Fonction masquée |
| Jitsi | Vidéo | Nom de salle aléatoire, lien visible seulement pour le médecin et son patient | — |
| Agenda personnel du médecin (iCal) | Import des occupations | HTTPS uniquement, adresses internes refusées (y compris après redirection), 2 Mo et 15 s maximum, horaires seuls conservés | Fonction inactive |
| IA (compatible OpenAI) | Assistant d'orientation | Clé serveur ; limite de débit ; aucun stockage des symptômes | Message « non configuré » |
| SMTP | Emails | Identifiants serveur | Emails affichés dans la console (développement) |

## 1.6 Dépendances principales

Backend (`backend/requirements.txt`) : Django 6.1, djangorestframework, django-tasks-db, psycopg 3,
gunicorn, whitenoise, sentry-sdk, python-dotenv, pywebpush. Frontend (`package.json`) : React 19,
TanStack Router/Start/Query, Tailwind CSS 4, Radix UI, Leaflet, Recharts, pdf-lib, qrcode, zod.
