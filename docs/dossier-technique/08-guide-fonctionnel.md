# 8. Guide fonctionnel de A à Z

Ce chapitre décrit, rôle par rôle, tout ce que permet Fajma, dans l'ordre où chaque utilisateur le rencontre,
puis les automatismes (messages, rappels, tâches) et les règles de fonctionnement. Il complète la vue technique
du [chapitre 1](01-architecture.md) et les règles de sécurité du [chapitre 2](02-securite.md).

## 8.1 Les acteurs et leurs espaces

| Acteur | Espace | Connexion | Ce qu'il voit |
|---|---|---|---|
| Visiteur | Pages publiques | Aucune | Recherche, fiches des médecins, cliniques, pharmacies, tarifs, aide, vérification d'ordonnance |
| Patient | « Mon espace », « Mon dossier », messagerie | Code SMS (par défaut) ou email + mot de passe | Ses rendez-vous, son dossier et celui de ses proches |
| Médecin | Espace médecin (7 onglets) | Email + mot de passe + **double authentification obligatoire** | Son agenda, ses patients (avec RDV confirmé ou terminé), ses finances |
| Secrétariat | Agenda de la clinique ou du cabinet | Idem (2FA obligatoire) | Agendas, prise de RDV, fichier patients — **jamais** les dossiers médicaux |
| Responsable de clinique | Espace clinique | Idem | Établissement, équipe, agenda commun |
| Pharmacien | Espace pharmacie | Idem | Ordonnances qu'on lui adresse, demandes de disponibilité, horaires et garde |
| Laboratoire | Espace laboratoire | Idem | Analyses qu'on lui adresse ; dépôt des résultats |
| Administration Fajma | Administration | Idem | Validation, support, modération, finances, journal d'audit, pilotage |
| Secours | Fiche d'urgence (QR code) | Aucune | Seulement les informations que le patient a choisi de rendre visibles |

Après connexion, chacun arrive directement dans son espace. Un professionnel sans double authentification est
d'abord conduit à l'activer ; il est déconnecté après 30 minutes sans activité.

## 8.2 Patient

**Créer son compte et se connecter**

1. Saisir son numéro de téléphone, recevoir un code à 6 chiffres par SMS (3 codes au plus par 10 minutes),
   le saisir : le compte est créé. L'email et le mot de passe restent possibles.
2. Compléter son profil (nom, téléphone, **email**, ville, langue : français, wolof ou anglais) et ajouter ses
   proches (enfants, parents) pour prendre rendez-vous et tenir leur carnet à leur nom. Proches et assurances se
   corrigent à tout moment (crayon). L'email s'ajoute ou se change dans « Mes coordonnées » : un lien est envoyé
   à la nouvelle adresse, qui n'est enregistrée qu'à son ouverture.
3. Chaque connexion depuis un appareil jamais utilisé déclenche une alerte (email, ou SMS sans email).

**Trouver un médecin et réserver**

1. Rechercher par spécialité, nom, ville ou quartier (ou « autour de moi »), avec des filtres : disponible
   aujourd'hui ou cette semaine, vidéo, visite à domicile, langue, assurance acceptée, prix ; en liste ou sur
   une carte. Les spécialités et les pages des cliniques permettent aussi d'y accéder.
2. Ouvrir la fiche : présentation, tarifs par motif, lieux (avec itinéraire), assurances acceptées et tiers
   payant, avis, prochains créneaux.
3. Choisir le mode (cabinet, vidéo, domicile si proposé), le motif, le lieu, un créneau, le proche concerné,
   son assurance ; écrire un motif libre.
4. **Questions du médecin** : si le médecin en a rédigé, elles s'affichent sous le motif. Y répondre est
   **facultatif** ; on peut aussi répondre plus tard depuis son espace.
5. Pour certains motifs (kinésithérapie, pansements…), réserver une **série de séances** en une fois.
6. Confirmer. Le rendez-vous est confirmé tout de suite ou après validation du médecin, selon son choix.
7. Aucun créneau ? S'inscrire sur la **liste d'attente** : un SMS prévient dès qu'un créneau se libère.

**Avant et pendant le rendez-vous**

- Rappels automatiques 24 h et 2 h avant ; ajout à son agenda (fichier `.ics`).
- Déplacer ou annuler en ligne jusqu'au délai fixé par le médecin ; un rendez-vous payé en ligne puis annulé
  est remboursé intégralement.
- Payer en ligne (Wave, Orange Money, Free Money, carte) ou au cabinet ; reçu téléchargeable, qui sert de
  feuille de soins.
- Téléconsultation : bouton « Rejoindre » à l'heure du rendez-vous, sans application à installer.

**Après la consultation**

- Le compte-rendu et l'ordonnance arrivent dans « Mon dossier », avec notification et SMS.
- **Ordonnance** : PDF signé avec QR code de vérification ; envoi à une pharmacie partenaire en un clic, suivi
  de sa préparation (reçue, en préparation, prête, retirée).
- **Analyses** : choisir un laboratoire partenaire ; les résultats arrivent dans le dossier.
- **Certificats et arrêts de travail** : dans le dossier, en PDF vérifiable.
- **Avis** sur le médecin (une fois la consultation terminée).

**Suivre sa santé au quotidien**

- **Renouvellement d'ordonnance** : sous chaque ordonnance de moins d'un an, « Demander le renouvellement »
  avec un message facultatif. Pour les traitements longs, un SMS rappelle 7 jours avant la fin de validité. Le
  médecin renouvelle (nouvelle ordonnance) ou refuse en expliquant pourquoi.
- **Rappels de médicaments** : heures de prise (1 à 6 par jour), durée, à partir d'une ordonnance ou en saisie
  libre.
- **Suivi à domicile** : tension, glycémie, poids, avec courbe et repères. Une valeur dangereuse, ou élevée
  3 fois en une semaine, prévient les médecins qui suivent le patient (désactivable).
- **Carnet de santé** : vaccins de chaque enfant selon le calendrier PEV (à faire, en retard, fait) ; suivi de
  grossesse (terme, consultations prénatales) ; rappels par SMS.
- **Disponibilité d'un médicament** : interroger jusqu'à 5 pharmacies partenaires, qui répondent sans connaître
  l'identité du patient.
- **Mes médecins** : les médecins déjà consultés, pour reprendre rendez-vous en un clic.
- **Messagerie** avec ses médecins, avec photos ou PDF.

**Son dossier médical**

- Profil de santé (groupe sanguin, allergies, antécédents, traitements, vaccinations, personne à prévenir).
- Documents déposés (PDF, photos), partagés seulement avec les médecins que le patient choisit.
- « Qui a consulté mon dossier » : chaque accès d'un professionnel est listé.
- **Télécharger mon dossier (PDF)** : tout le dossier en un document, à remettre à un médecin.
- **Fiche d'urgence** : à activer ; le patient choisit les informations visibles et télécharge l'image avec le
  QR code pour son fond d'écran. Un nouveau lien rend l'ancien QR code inutilisable.
- Télécharger toutes ses données (JSON) ou supprimer son compte.

**Sans smartphone** : prendre rendez-vous par **WhatsApp** ou par le menu **USSD** (tout téléphone, sans
internet).

## 8.3 Médecin

**Démarrer**

1. Créer son compte, puis sa fiche dans l'espace médecin (nom, spécialité, ville, tarif). La double
   authentification est activée à la première connexion.
2. Le guide **« Bien démarrer sur Fajma »** affiche 7 étapes, avec un bouton qui ouvre le bon onglet :
   compléter sa fiche publique (photo, présentation, adresse) ; déposer ses justificatifs (Ordre, pièce d'identité) ; définir son
   emploi du temps ; vérifier ses motifs et tarifs ; compléter l'en-tête des ordonnances ; sécuriser son compte ;
   attendre la validation. Il disparaît quand tout est fait.
3. L'équipe Fajma vérifie les justificatifs et publie la fiche ; le médecin est prévenu par SMS et email
   (pièces exigées : § 8.12).

**Onglet « Emploi du temps »**

- Semaine type : ajouter une plage (par exemple 8 h – 13 h) à plusieurs jours d'un coup, choisir la durée des
  créneaux, le lieu, ou en faire une plage de visites à domicile. Un clic sur une plage la modifie ou la
  supprime ; deux plages qui se chevauchent sont refusées.
- Aperçu de ce que voient les patients sur les 7 prochains jours.
- Absences (congés, formation), règles de réservation (confirmation automatique, nouveaux patients, délai
  minimal, horizon, délai d'annulation, consignes, visites à domicile), motifs et tarifs (dont séries),
  lieux de consultation, synchronisation avec Google Agenda / Outlook / iPhone.

**Onglet « Rendez-vous » (la journée)**

- Agenda en liste ou en semaine. **En semaine, glisser un rendez-vous** pour le déplacer ou tirer son bord pour
  changer sa durée ; une confirmation est demandée et le patient est prévenu.
- Confirmer, marquer « arrivé », « terminé » ou « absent », annuler avec un motif, déplacer, ajouter des séances.
- « Nouveau RDV » : rendez-vous pris au téléphone, y compris pour un patient sans compte.
- Ouvrir la consultation : fiche patient (profil, mesures, documents partagés, historique, réponses au
  questionnaire, notes privées), compte-rendu, ordonnance structurée, analyses, certificat ou arrêt de travail,
  vaccin inscrit au carnet, « réglé au cabinet ».
- **Assistant de prise de notes** : dicter ou taper ses notes, puis « Rédiger le compte-rendu » range le texte
  dans Résumé / Conclusion / Traitement. Le médecin relit toujours avant d'enregistrer.
- **Demandes de renouvellement** : renouveler ou refuser avec un motif.
- **Alertes** : une mesure dangereuse d'un patient suivi arrive dans les notifications.

**Les autres onglets**

- **Profil et cabinet** : fiche publique et photo, justificatifs, assurances acceptées (tiers payant),
  **questionnaire patient** (questions par défaut ou par motif, jamais obligatoires pour le patient), avis
  (réponse, signalement), module de réservation à intégrer à son propre site.
- **Ordonnances** : en-tête (n° d'Ordre, cabinet, signature tracée, cachet) et **aperçu d'une ordonnance
  spécimen** ; aucune ordonnance ni certificat n'est possible tant que l'en-tête est incomplet.
- **Secrétariat et remplacements** : donner l'accès à sa secrétaire ; proposer un remplacement à un confrère,
  qui reçoit les patients et signe à son nom pendant la période.
- **Finances** : solde, demande de virement dès 5 000 F, historique, formule (Essentiel gratuite, Pro, Clinique),
  exports tableur (rendez-vous, bordereau de tiers payant, revenus).
- **Sécurité** : notifications sur le téléphone, double authentification, mot de passe.
- **Télé-expertise** et **messagerie** avec les confrères et les patients.

## 8.4 Secrétariat et clinique

- **Responsable** : crée l'établissement, invite les médecins et la secrétaire, modifie les informations,
  retire un médecin qui part, change le titre affiché d'un médecin (« Chef de service »…) ou le rôle d'un membre
  du secrétariat (secrétaire / gestionnaire), dépose les justificatifs de l'établissement (§ 8.12). La clinique est publiée
  après vérification par Fajma.
- **Secrétaire** : agenda de tous les médecins par semaine, prise de RDV au guichet ou au téléphone (même pour
  un patient sans compte, avec son téléphone pour les rappels), créneaux libres proposés, déplacement,
  annulation, « venu », séances, fichier patients avec détection et fusion des doublons, export de l'agenda.
  Aucun accès aux dossiers médicaux.

## 8.5 Pharmacie

- Ordonnances reçues en trois colonnes (reçues, en préparation, prêtes) : préparer, indiquer le prix,
  signaler une rupture, marquer « retirée » (le nombre de délivrances autorisées est contrôlé). Le patient est
  prévenu par SMS quand son ordonnance est prête ou indisponible.
- Répondre aux demandes de disponibilité d'un médicament.
- Gérer ses horaires, jours d'ouverture et la **garde** (avec date de fin).
- **Justificatifs de l'officine** (§ 8.12) : tant qu'ils ne sont pas validés, la pharmacie ne reçoit ni
  ordonnances ni demandes de disponibilité.

## 8.6 Laboratoire

- Demandes d'analyses reçues : patients attendus, « prélèvement effectué », dépôt des résultats (PDF ou image,
  avec commentaire). Les résultats rejoignent le dossier du patient ; patient et médecin prescripteur sont
  prévenus. Recherche par référence ou par nom.
- **Fiche du laboratoire** : quartier, adresse, téléphone et horaires affichés aux patients (le nom et la ville
  sont corrigés par l'équipe Fajma).
- **Justificatifs du laboratoire** (§ 8.12) : tant qu'ils ne sont pas validés, le laboratoire n'est pas
  proposé aux patients.

## 8.7 Administration Fajma

- Bandeau **« À traiter »** : médecins et établissements à valider, justificatifs à vérifier, justificatifs
  expirés ou qui expirent dans les 30 jours, avis signalés, virements et
  remboursements, demandes d'aide, SMS en échec.
- **Correction d'une fiche médecin vérifiée** (nom, spécialité) sur justificatif : crayon dans « Validation des
  médecins », motif obligatoire, journalisé, médecin prévenu. **Laboratoires** : fiche corrigible (crayon).
- **Justificatifs** : une seule liste (filtre médecins, cliniques, pharmacies, laboratoires), ouvrir la pièce,
  la vérifier à la source, valider ou refuser avec un motif envoyé au professionnel.
- Validation des médecins, cliniques, pharmacies et laboratoires : refusée tant qu'une pièce obligatoire
  manque, est en attente, refusée ou expirée (le message indique laquelle).
- **Comptes** : recherche, suspension (sessions coupées) ou réactivation, réinitialisation de la double
  authentification, avec motif journalisé.
- **Support** : demandes reçues par la page « Aide et contact », réponse par email ou téléphone, puis
  « traitée » avec une note interne.
- Pharmacies (ajout, correction), laboratoires, rattachement des pharmaciens et biologistes.
- Finances : virements aux médecins et remboursements (exécutés manuellement, référence saisie).
- Modération des avis, suivi des SMS, journal d'audit, pilotage hebdomadaire.
- **Rapport d'activité** mensuel : patients, médecins, partenaires, consultations, ordonnances, paiements,
  chiffre d'affaires, fidélité ; tableur ou PDF ; aucune donnée nominative.

## 8.8 Visiteurs et secours

- **Aide et contact** : numéros d'urgence (SAMU 1515, sapeurs-pompiers 18), questions fréquentes avec recherche,
  formulaire de contact ; une personne connectée y retrouve ses demandes et leur état (en cours, traitée).
- **Tarifs** des professionnels, **vérification d'une ordonnance** par sa référence ou son QR code (sans contenu
  médical).
- **Fiche d'urgence** (QR code) : identité, âge et informations choisies par le patient, bouton « Appeler le
  SAMU », appel de la personne à prévenir ; page lisible en toutes conditions.

## 8.9 Automatismes

| Événement | Moment | Destinataire | Canal |
|---|---|---|---|
| Demande ou confirmation de RDV | À la réservation / à la confirmation | Patient ; médecin (nouveau RDV) | Notification, SMS (confirmation), email |
| Rappel de RDV | 24 h et 2 h avant | Patient | SMS ou WhatsApp |
| RDV déplacé ou annulé | Immédiat | Patient ou médecin | Notification, SMS |
| Créneau libéré | Immédiat | 5 premiers inscrits sur la liste d'attente | SMS |
| Nouvelle ordonnance, compte-rendu | À l'enregistrement | Patient | Notification, SMS (ordonnance) |
| Ordonnance prête en pharmacie | À la préparation | Patient | Notification, SMS |
| Résultats d'analyses | Au dépôt | Patient et médecin | Notification |
| Prise de médicament | Aux heures choisies | Patient | Notification (SMS en option) |
| Ordonnance d'un traitement long bientôt expirée | 7 jours avant | Patient | Notification, SMS |
| Demande de renouvellement / réponse | Immédiat | Médecin / patient | Notification, email / SMS |
| Vaccin d'un enfant, consultation prénatale | À l'échéance | Parent, future mère | SMS |
| Mesure dangereuse ou répétée | Immédiat (1 par 24 h) | Médecins qui suivent le patient | Notification, email si dangereuse |
| Connexion depuis un nouvel appareil | Immédiat | Titulaire du compte | Email ou SMS |
| Fiche d'urgence consultée | Immédiat (1 par jour) | Patient | Notification |
| Fiche publiée, compte rattaché | À la validation | Médecin, pharmacien, biologiste | SMS, email |
| Demande d'aide | Immédiat | Équipe Fajma | Email (`ALERT_EMAILS`) |
| Synchronisation des agendas, supervision | Toutes les 10 minutes | — / équipe technique | Alerte email en cas de problème |
| Purge des données techniques | Chaque nuit | — | — |
| Sauvegarde chiffrée / test de restauration | Chaque jour / le 1er du mois | — | Alerte en cas d'échec |

## 8.10 Règles de fonctionnement

| Règle | Détail |
|---|---|
| Créneaux | Calculés par le serveur : plages − absences − RDV existants − délai minimal ; jamais deux RDV sur le même horaire (contrainte en base) |
| Rendez-vous à venir | 4 au plus par patient et par médecin (hors séances d'une série) |
| Nouveaux patients | Un médecin peut les refuser ; ses patients connus restent acceptés |
| Annulation | En ligne jusqu'au délai fixé par le médecin (passé ce délai, le patient doit appeler le cabinet) ; remboursement intégral d'un RDV payé en ligne ; le créneau libéré est aussitôt réservable et les inscrits de la liste d'attente sont prévenus |
| Historique d'un RDV | Chaque prise, confirmation, déplacement (ancien → nouvel horaire), annulation (avec motif), arrivée et fin de consultation est enregistrée avec son auteur ; bouton « Historique » sur chaque RDV pour le patient, le médecin et le secrétariat (le patient voit le rôle des membres du cabinet, pas leur nom) |
| Absences du médecin | Congés et absences bloquent les créneaux en ligne ; les agendas personnels importés aussi |
| RDV pour un proche | Le patient réserve pour un enfant ou un parent enregistré dans « Mes proches » |
| Questionnaire | Jamais obligatoire ; questions figées sur le RDV à la réservation ; réponses visibles du seul médecin |
| Ordonnance et certificat | Impossibles sans en-tête complet (n° d'Ordre, signature) ; en-tête figé à l'émission ; vérifiables par QR code |
| Renouvellement | Ordonnance de moins d'un an, une demande en cours à la fois, décision du seul prescripteur, refus motivé |
| Accès d'un médecin au dossier | RDV confirmé ou terminé avec le patient ; documents seulement s'ils sont partagés ; chaque accès journalisé |
| Fiche d'urgence | Désactivée par défaut ; informations choisies par le patient ; lien révocable |
| Alertes de mesures | 3 médecins au plus, une alerte par médecin, patient et type de mesure toutes les 24 h |
| Sécurité des comptes | Bouton « Déconnecter mes autres appareils » (page Sécurité) en cas de téléphone perdu ; 10 mots de passe faux en 15 min : compte verrouillé 15 min ; code SMS : 3 envois par 10 minutes ; double authentification et déconnexion après 30 min d'inactivité pour les professionnels |
| Argent | Commission selon la formule (Essentiel 8 %, Pro 3 %, Clinique 2 %) ; virement dès 5 000 F ; paiements vérifiés auprès de PayDunya |
| Avis | Seulement après une consultation terminée ; modération par Fajma |
| SMS « STOP » | Répondre STOP (SMS ou WhatsApp) arrête tous les SMS automatiques ; START les réactive ; les codes de connexion demandés restent envoyés |
| Reçus | Numéro légal continu par année (FJ-2026-000001…), attribué à l'encaissement et imprimé sur le reçu |
| Exports | Réservés à leur titulaire (médecin, clinique, patient, administration) et journalisés |

## 8.11 Glossaire

| Terme | Signification |
|---|---|
| 2FA / double authentification | Code à 6 chiffres d'une application (Google Authenticator…), demandé en plus du mot de passe |
| CDP | Commission de protection des données personnelles du Sénégal |
| CPN | Consultation prénatale |
| IPM | Institution de prévoyance maladie (assurance santé d'entreprise) |
| PEV | Programme élargi de vaccination |
| PWA | Application web installable sur le téléphone, utilisable en partie hors ligne |
| QR code | Code à scanner (vérification d'ordonnance, fiche d'urgence) |
| Tiers payant | Le patient ne paie que sa part ; le médecin facture le reste à l'organisme |
| USSD | Menu par code (`#…#`) utilisable sur tout téléphone, sans internet |

## 8.12 Pièces justificatives exigées

Aucun professionnel n'est publié (fiche médecin réservable, clinique dans l'annuaire, pharmacie qui reçoit des
ordonnances, laboratoire proposé aux patients) sans **toutes ses pièces obligatoires validées par l'équipe Fajma
et en cours de validité**.

| Professionnel | Pièces obligatoires | Pièces facultatives |
|---|---|---|
| Médecin (y compris indépendant) | Inscription à l'Ordre des médecins ; pièce d'identité* | Diplôme de médecine ou de spécialité ; autre |
| Clinique, centre de santé | Autorisation d'ouverture et d'exploitation du ministère de la Santé* ; NINEA et RCCM ; pièce d'identité du responsable* ; désignation du médecin responsable (directeur médical) | Autre |
| Pharmacie | Autorisation d'exploitation de l'officine* ; inscription du pharmacien titulaire à l'Ordre des pharmaciens | NINEA ; autre |
| Laboratoire | Agrément du laboratoire d'analyses médicales* ; inscription du biologiste responsable à son Ordre | NINEA ; autre |

\* Pièce à durée limitée : sa date de fin de validité est demandée au dépôt (une pièce déjà expirée est
refusée). Rappel au professionnel (notification, email) 30 jours avant l'échéance puis après l'échéance ;
une pièce expirée ne compte plus et apparaît dans « À traiter ». Une fiche déjà publiée n'est pas retirée
automatiquement : l'administration voit ce qui manque et décide.

- Dépôt : PDF ou image, chiffré, analysé par l'antivirus ; visible du seul titulaire et de l'administration.
  Une pièce validée ne peut plus être supprimée par le professionnel.
- Le cabinet d'un médecin seul ne demande pas de pièces d'établissement : ce sont celles du médecin qui comptent.
- Pharmacies et laboratoires déjà partenaires avant cette règle restent en ligne ; leurs pièces sont à
  demander.
- La liste est à faire valider par un juriste et les Ordres professionnels ; elle se modifie en un seul endroit
  (`backend/directory/requirements.py`), écrans et contrôles suivent automatiquement.

## 8.13 Audit « saisir et corriger » (5 octobre 2026)

Contrôle de chaque information enregistrée (75 tables) : peut-elle être saisie et corrigée par la bonne
personne, dans son espace ? Chaque adresse de l'API est reliée à un écran. Manques trouvés et corrigés :

| Interface | Manque | Correction |
|---|---|---|
| Patient | Impossible de saisir ou changer son email | « Mes coordonnées » : email confirmé par lien (§ 2.4) ; aussi dans « Sécurité du compte » des professionnels |
| Patient | Un proche mal saisi devait être supprimé puis recréé ; téléphone du proche non saisissable | Crayon « Modifier », champ téléphone |
| Patient | Assurance non modifiable (n° d'adhérent, taux, date de fin) | Crayon « Modifier » |
| Patient, professionnels | Aucun suivi des demandes d'aide envoyées | « Mes demandes » sur la page Aide et contact |
| Médecin | Lieu de consultation non modifiable | Crayon « Modifier » (position GPS conservée) |
| Laboratoire | Horaires, téléphone, adresse non modifiables par le laboratoire | Fiche du laboratoire dans son espace |
| Clinique | Rôle du secrétariat et titre des médecins non modifiables | Liste « Rôle » et crayon « Titre » |
| Administration | Fiche d'un laboratoire non corrigible ; nom ou spécialité d'un médecin vérifié non corrigible alors que le médecin est renvoyé vers l'équipe | Crayons de correction (motif obligatoire pour le médecin) |

Restent volontairement non modifiables : ordonnances, certificats et comptes-rendus émis (documents médicaux et
légaux : on en émet un nouveau), reçus, journal d'audit, organisme et bénéficiaire d'une assurance (on la
supprime et on la recrée), avis publiés.

