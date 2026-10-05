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
          « clamav » : analyse antivirus de chaque fichier déposé avant stockage
```

Services externes : PayDunya (paiement), Twilio (SMS, WhatsApp), service push des navigateurs, Jitsi
(vidéo), fournisseur d'IA (assistant d'orientation ; assistant de prise de notes, désactivé par défaut en
production), agrégateur USSD, fournisseur SMTP (emails). Les fichiers sont chiffrés par l'application avant
d'être écrits sur le disque (clé conservée hors des sauvegardes).

## 1.2 Organisation du code

| Dossier | Rôle |
|---|---|
| `backend/sunusante/` | Configuration, routes de l'API, outils communs (validation des entrées ; fichiers déposés : contrôle du type, antivirus, chiffrement), tableau de pilotage, rapport d'activité, exports tableur |
| `backend/accounts/` | Comptes, connexion (mot de passe, code SMS, double authentification), déconnexion après inactivité, alerte « nouvel appareil », profil, proches, export et suppression des données, outils d'administration |
| `backend/directory/` | Annuaire, fiches médecin, emploi du temps (plages, absences), guide de démarrage, avis et modération, justificatifs de tous les professionnels (liste des pièces exigées : `requirements.py`), remplacements, référencement |
| `backend/appointments/` | Rendez-vous, calcul des créneaux, questionnaire avant consultation, liste d'attente, téléconsultation, historique automatique de chaque rendez-vous (`history.py`) |
| `backend/payments/` | Paiements PayDunya, journal comptable des médecins, virements, remboursements, abonnements |
| `backend/insurance/` | Organismes (IPM, CMU, assureurs), couvertures des patients, tiers payant |
| `backend/medical/` | Comptes-rendus, ordonnances (en-tête, signature), certificats et arrêts de travail, documents, profil de santé, rappels, renouvellements d'ordonnance, fiche d'urgence (QR code), assistant de prise de notes, export du dossier en PDF |
| `backend/carnet/` | Carnet de vaccination (calendrier PEV), suivi de grossesse (CPN), rappels |
| `backend/pharmacy/` | Pharmacies partenaires, ordonnances transmises et leur préparation |
| `backend/clinics/` | Cliniques, secrétariat, agenda partagé, fichier patients et doublons |
| `backend/expertise/` | Télé-expertise et messagerie entre médecins |
| `backend/messaging/` | Messagerie patient ↔ médecin |
| `backend/bots/` | Menu WhatsApp et USSD (moteur commun, textes en trois langues) |
| `backend/notifications/` | SMS/WhatsApp, emails, notifications push, tâches en arrière-plan, rappels planifiés |
| `backend/care/` | Suivi à domicile (mesures, repères indicatifs, alertes aux médecins) et rappels de prise de médicaments |
| `backend/labs/` | Laboratoires d'analyses : prescription, choix du laboratoire, prélèvement, dépôt des résultats |
| `backend/support/` | Demandes d'aide envoyées depuis la page « Aide et contact », suivies par l'administration |
| `backend/audit/` | Journal d'audit inaltérable ; commandes d'exploitation `monitor` (supervision), `purge_data` (conservation), `encrypt_files` (chiffrement et rotation de clé) |
| `backend/tests/` | Tests automatisés de l'API |
| `src/` | Interface React : `api/` (appels à l'API), `routes/` (pages), `components/`, `lib/` (traductions, dates, PDF) |
| `public/` | Manifeste PWA, service worker (hors ligne, notifications), icônes |
| `deploy/` | Docker Compose, images, nginx, politique CSP, variables de production, sauvegarde et test de restauration |
| `tools/` | `inventaire_licences.py` : inventaire des licences des composants (chapitre 7) |
| `docs/dossier-technique/` | Ce dossier (Markdown), son PDF et l'annexe des licences |
| `Lancer-Fajma.bat` | Lancement local en un double-clic (serveur et interface), pour une démonstration sous Windows |

## 1.3 Fonctionnalités

| Domaine | Détail |
|---|---|
| Recherche | Spécialité, ville, nom (sans accents), langue parlée, assurance acceptée, prix, disponibilité (aujourd'hui, semaine), téléconsultation, tri, carte (OpenStreetMap) |
| Réservation | Créneaux calculés par le serveur (plages, absences, délai minimal, horizon, durée du motif), multi-lieux, pour soi ou un proche, confirmation automatique ou par le médecin, anti-chevauchement garanti en base (contrainte d'exclusion PostgreSQL) |
| Visites à domicile | Plages horaires dédiées (trajet compris), supplément de déplacement, zone desservie, adresse + repère + position GPS facultative, itinéraire pour le médecin |
| Séries de séances | Motif réservable en série (kiné, pansements : 2 à 20 séances, tous les 1/2/3/7/14 jours), aperçu des dates libres, un seul message récapitulatif, annulation de la suite de la série ; le médecin ou le secrétariat peut ajouter des séances à tout rendez-vous |
| Remplacements | Le titulaire propose une période à un confrère vérifié, qui accepte ; l'agenda reste ouvert, le remplaçant reçoit les patients, accède au dossier pendant la période et signe à son nom (mention « remplaçant du Dr X ») ; paiements versés au titulaire |
| Questionnaire | Chaque médecin rédige ses questions (oui/non, choix, texte libre), par défaut ou propres à un motif ; le patient les voit dans le panneau de réservation de la fiche et y répond s'il le souhaite — **jamais obligatoire** —, ou plus tard depuis son espace ; réponses dans l'agenda du médecin |
| Après réservation | Déplacement, annulation (délai fixé par le médecin), fichier agenda `.ics`, rappels 24 h et 2 h, liste d'attente avec alerte |
| Téléconsultation | Salle d'attente, prépaiement optionnel, salle vidéo au nom aléatoire ouverte par le médecin |
| Dossier patient | Profil de santé, documents (PDF, images), partage explicite avec un médecin, comptes-rendus, ordonnances, certificats, journal des accès (« qui a consulté mon dossier »), **dossier complet téléchargeable en PDF**, export des données (JSON) et suppression du compte |
| Renouvellement d'ordonnance | Le patient demande le renouvellement d'une ordonnance de moins d'un an (message facultatif) ; rappel SMS 7 jours avant la fin des traitements longs ; le médecin prescripteur renouvelle (nouvelle ordonnance signée, mêmes médicaments) ou refuse avec un motif |
| Fiche d'urgence | Activée par le patient, qui choisit les informations visibles (groupe sanguin, allergies, traitements, antécédents, personne à prévenir) ; QR code à mettre en fond d'écran ; page publique pour les secours avec appel du SAMU ; lien révocable ; consultations journalisées et signalées au patient |
| Documents médicaux | Ordonnances, certificats, arrêts de travail, courriers : PDF signé électroniquement avec QR de vérification publique (sans contenu médical ni identité complète) |
| Carnet de santé | Calendrier vaccinal PEV de chaque enfant (statuts à faire / en retard / fait, dose vérifiée par le médecin), suivi de grossesse (terme, 8 consultations prénatales), déclaration de naissance qui crée le carnet du bébé, rappels SMS |
| Argent | Paiement mobile ou au cabinet ; commission selon l'abonnement du médecin ; solde et demandes de virement ; remboursement automatique en cas d'annulation d'un RDV payé ; reçu servant de feuille de soins |
| Assurances | Couvertures du patient (numéro, taux, validité, pour un proche) ; organismes acceptés par le médecin, avec ou sans tiers payant ; part patient calculée et figée à la réservation |
| Pharmacies | Envoi d'une ordonnance à une pharmacie partenaire, préparation (reçue → en préparation → prête / indisponible → retirée), montant, notification du patient |
| Clinique | Équipe médicale, secrétariat, agenda partagé, RDV au guichet (même sans compte), fichier patients, détection et fusion des doublons, rattachement au compte du patient ; le responsable modifie les informations de l'établissement et retire un médecin qui part |
| Suivi à domicile | Le patient note tension, glycémie (g/L, à jeun ou après repas) et poids, pour lui ou un proche ; courbe, repères indicatifs (tension ≥ 180/110 : conseil d'appeler le 1515 ; hypoglycémie < 0,7 g/L) ; les médecins qui le suivent voient la courbe dans la fiche patient et **sont alertés** d'une valeur dangereuse ou élevée 3 fois en 7 jours (3 médecins au plus, une alerte par 24 h, désactivable par le patient) |
| Rappels de médicaments | Heures de prise (1 à 6 par jour), durée du traitement, pour soi ou un proche, à partir d'une ordonnance ou en saisie libre ; notification gratuite, SMS/WhatsApp en option ; envoi par le planificateur, sans doublon |
| Laboratoires | Le médecin prescrit des analyses pendant la consultation ; le patient choisit un laboratoire partenaire ; le laboratoire enregistre le prélèvement et dépose les résultats (PDF), qui rejoignent le dossier du patient et sont partagés avec le prescripteur ; patient et médecin prévenus |
| Disponibilité des médicaments | « Avez-vous ce médicament ? » : le patient interroge jusqu'à 5 pharmacies partenaires (5 demandes par jour), qui répondent sous 24 h (disponible, prix, indisponible) sans connaître son identité |
| Annuaire | Pages publiques des cliniques et centres de santé vérifiés, avec leurs médecins et prochains créneaux (les cabinets individuels n'y figurent pas) ; « Mes médecins » : médecins consultés et reprise de RDV en un clic |
| Agenda tenu par le cabinet | Le médecin (ou son secrétariat) saisit un RDV pris au téléphone ou au cabinet, pour un patient connu ou sans compte, et **déplace** un RDV (patient prévenu par SMS) ; hors plages en ligne autorisé, jamais sur un autre RDV ni pendant une absence |
| Exports | Tableur (CSV pour Excel) : rendez-vous, **bordereau de tiers payant** par organisme, revenus ; agenda de la clinique ; chaque export est journalisé |
| Messagerie | Patient ↔ médecin, y compris le remplaçant qui l'a reçu ; texte et **pièces jointes** (photo ou PDF, type réel contrôlé, 6 Mo), accessibles aux seuls participants du fil |
| Espace médecin | Organisé en onglets : Rendez-vous, Emploi du temps, Profil et cabinet, Ordonnances, Secrétariat et remplacements, Finances, Sécurité. Fiche publique modifiable (présentation, tarif, langues, téléconsultation, adresse) et photo ; nom et spécialité figés après vérification ; « Mon secrétariat » : un médecin seul donne l'accès à son agenda à sa secrétaire par simple email ; **guide « Bien démarrer »** en 7 étapes |
| Emploi du temps | Semaine type visuelle ; plage ajoutée à plusieurs jours d'un coup ; clic sur une plage pour la modifier ou la supprimer ; chevauchements refusés ; plages « visites à domicile » ; absences ; aperçu des créneaux réellement proposés aux patients |
| Agenda en glisser-déposer | Vue semaine : un rendez-vous se déplace (autre jour, autre heure) ou change de durée à la souris ou au doigt, par pas de 5 minutes, après confirmation ; contrôle du serveur et patient prévenu ; couleur par motif (palette validée pour les daltoniens), « à confirmer » en pointillés |
| Rédaction médicale | En-tête d'ordonnance (n° d'Ordre, cabinet, signature tracée, cachet) obligatoire avant toute ordonnance ; aperçu d'une ordonnance spécimen ; **assistant de prise de notes** : dictée vocale et brouillon de compte-rendu (IA si autorisée, sinon mise en forme locale), toujours relu par le médecin |
| Espace pharmacie | Horaires, jours d'ouverture, coordonnées et **garde** (avec date de fin, retrait automatique de la liste des pharmacies de garde) gérés par le pharmacien |
| Administration | Bandeau « À traiter » ; validation des médecins et établissements, justificatifs, modération, finances (virements, remboursements), rattachement des pharmaciens et laboratoires, recherche de comptes, suspension/réactivation, réinitialisation de la double authentification, ajout et correction des pharmacies, **demandes d'aide (support)**, rappels SMS, journal d'audit, **rapport d'activité mensuel** (tableur, PDF) |
| Aide et contact | Page publique : numéros d'urgence, 20 questions fréquentes par profil avec recherche, formulaire de contact (limité contre les abus) ; lien « Aide » dans chaque espace |
| Spécialités | **Catalogue de 36 spécialités** (médecine générale, pédiatrie, gynécologie-obstétrique, sage-femme, cardiologie, ORL, psychiatrie, kinésithérapie, chirurgie dentaire, radiologie, maladies infectieuses et tropicales…), défini dans `backend/directory/specialties.py` et installé par migration sur toute base (avant, il n'existait que dans les données de démonstration : une base neuve n'avait aucune spécialité) ; toutes affichées sur l'accueil avec le nombre de praticiens ; l'assistant d'orientation choisit parmi ce catalogue |
| Pages publiques | Accueil (médecins réellement disponibles, sans données inventées ; **carte interactive** OpenStreetMap : zoom et déplacement, médecins, pharmacies et pharmacies de garde à leur adresse, « Autour de moi » avec distances et médecin le plus proche, fiche de chaque lieu avec prise de rendez-vous, **itinéraire Google Maps ou Waze** (trajet calculé par l'application GPS du téléphone) et appel ; carte dessinée du Sénégal, Natural Earth, si la carte ne peut pas se charger), recherche, fiche médecin (itinéraire, assurances, avis, questionnaire), spécialités, cliniques, pharmacies (ouverte/fermée, garde), **tarifs des professionnels**, vérification d'ordonnance, aide, mentions légales, CGU, confidentialité |
| Médecins entre eux | Télé-expertise avec dossier et documents partagés (patient informé), messagerie |
| Confiance | Avis après consultation, réponse du médecin, signalement, modération ; publication d'un médecin conditionnée à la validation de son inscription à l'Ordre |
| Canaux | WhatsApp, USSD, notifications push, messages et alertes en temps réel (Server-Sent Events), application installable, mode hors ligne, module de réservation intégrable au site du médecin |
| Agenda du médecin | Abonnement privé à ses RDV depuis Google Agenda / Outlook / iPhone (initiales seulement) ; import de ses occupations personnelles (adresse iCal secrète), qui bloquent les créneaux |
| Pilotage | Activité hebdomadaire, taux d'absence, part de téléconsultation, canaux, spécialités et villes, volumes financiers ; rapport mensuel pour un acquéreur ou un investisseur (patients, consultations, chiffre d'affaires, fidélité), sans donnée nominative |
| Interface | Mode clair et sombre, français / wolof / anglais, animations sobres (fondu entre les pages, désactivées si l'appareil le demande), affichage adapté au téléphone, logo Fajma sur tous les documents. **En-tête des documents PDF** (allégé à la demande du fondateur) : fond blanc, logo Fajma vert et sa phrase « Votre santé, simplement », médecin à gauche et cabinet à droite (ou patient, ou titre du reçu), fine bande tricolore avec l'étoile sous ces informations (assortie au bas de page), titre en capitales espacées ; **bas de page** (choisi parmi 6 propositions) : fine bande tricolore avec l'étoile, mention centrée, « fajma.sn · Page x/y » en vert ; communs aux ordonnances, certificats, courriers, reçus et dossier médical (`drawBrandBand`, `drawFooter`, `src/lib/pdf-common.ts`). **Logo** (choisi par le fondateur parmi 8 propositions) : une bulle de consultation verte, l'échange entre le patient et son médecin, qui porte le « f » de Fajma dessiné en croix médicale, cœur doré au centre (vert et or du drapeau) ; une seule définition (`src/lib/fajma-mark.ts`) reprise par le site, les PDF, l'icône d'onglet (`favicon.svg`, `favicon.ico`) et les icônes de l'application installée (dont l'icône adaptative Android) |
| Référencement | Plan du site, pages HTML pour les robots, données structurées schema.org |

## 1.4 Modèle de données (principales tables)

| Table | Contenu |
|---|---|
| `accounts_user`, `accounts_relative` | Comptes (email et/ou téléphone vérifié, langue, date du préavis de compte inactif), proches |
| `accounts_twofactor`, `accounts_otpcode`, `accounts_knowndevice` | Double authentification, codes SMS (empreintes uniquement), navigateurs déjà utilisés (jeton haché) |
| `directory_doctor`, `…_doctorlocation`, `…_doctoravailability`, `…_timeoff`, `…_consultationtype` | Fiches (photo, visites à domicile), lieux, plages (cabinet ou domicile), absences, motifs, tarifs, séries, questionnaires |
| `directory_replacement` | Remplacements entre médecins (période, statut) |
| `directory_pharmacy` | Officines (horaires, jours d'ouverture, garde et fin de garde) |
| `directory_review`, `directory_credential` | Avis (modération, réponse) ; justificatifs des médecins, cliniques, pharmacies et laboratoires (un seul titulaire par pièce, contrainte en base ; type, statut, date de fin de validité, contrôleur, date du rappel d'échéance) |
| `appointments_appointment`, `…_appointmentseries`, `…_waitlistentry` | Rendez-vous (canal, assurance figée, questionnaire, adresse de visite, médecin remplaçant, rang dans une série), séries de séances, liste d'attente |
| `appointments_appointmentevent` | Historique des rendez-vous : action (pris, confirmé, déplacé, annulé, terminé, absent, arrivé), auteur, ancien et nouvel horaire ou statut, motif ; écrit automatiquement à chaque modification, quelle que soit son origine |
| `payments_payment`, `…_refund`, `…_payout`, `…_ledgerentry`, `…_subscription`, `…_subscriptionpayment` | Paiements (avec numéro de reçu légal), remboursements, virements, journal comptable, abonnements |
| `payments_receiptcounter` | Compteur annuel des reçus : numérotation continue, sans trou ni doublon |
| `insurance_insurer`, `…_patientcoverage`, `…_doctorinsurer` | Organismes, couvertures, organismes acceptés |
| `medical_*` | Comptes-rendus, ordonnances, documents, partages, profils de santé (dont réglages de la fiche d'urgence et des alertes), notes privées, rappels, documents rédigés, demandes de renouvellement |
| `carnet_*` | Doses de vaccin, rappels envoyés, grossesses, consultations prénatales |
| `pharmacy_*` | Pharmaciens rattachés, ordonnances transmises |
| `clinics_*`, `expertise_*`, `messaging_*` | Cliniques et personnel, télé-expertise, messages |
| `notifications_*` | Notifications, rappels SMS, abonnements push, numéros désinscrits des SMS (`smsoptout` : STOP) |
| `bots_botsession` | Conversations WhatsApp/USSD en cours |
| `care_measurement`, `care_medicationreminder` | Mesures à domicile, rappels de médicaments |
| `labs_laboratory`, `…_laboratorymember`, `…_laborder` | Laboratoires, personnel rattaché, prescriptions d'analyses et résultats |
| `pharmacy_medicinequery`, `…_medicineanswer` | Demandes de disponibilité d'un médicament et réponses des pharmacies |
| `support_supportrequest` | Demandes d'aide (nom, contact, sujet, message, statut, note interne) |
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
| IA (compatible OpenAI) | Assistant d'orientation ; assistant de prise de notes | Clé serveur ; limite de débit ; aucun stockage des symptômes ; notes envoyées sans identité du patient, seulement si `AI_NOTES_ENABLED` | Orientation : « non configuré » ; notes : mise en forme locale sans IA |
| ClamAV (service `clamav`) | Antivirus des fichiers déposés | Analyse avant stockage ; fichier refusé s'il est infecté ou si l'antivirus est injoignable | Pas d'analyse (développement) |
| SMTP | Emails | Identifiants serveur | Emails affichés dans la console (développement) |

## 1.6 Dépendances principales

Backend (`backend/requirements.txt`) : Django 6.1, djangorestframework, django-tasks-db, psycopg 3,
gunicorn, whitenoise, cryptography (chiffrement des fichiers), sentry-sdk, python-dotenv, pywebpush,
icalendar. Frontend livré aux navigateurs : React 19, TanStack Router/Start/Query, Leaflet, Recharts, pdf-lib,
qrcode, lucide-react, sonner, zod (49 composants au total) ; construction : Vite, TypeScript, Tailwind CSS 4.
Inventaire complet et licences : [chapitre 7](07-licences.md).
