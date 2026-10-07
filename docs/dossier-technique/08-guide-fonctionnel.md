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
- **Fiche d'urgence** (pour soi et pour chaque proche : enfant, parent âgé) : à activer ; **alertes vitales**
  affichées en gros en tête (diabétique sous insuline, diabétique, épileptique, drépanocytaire, sous
  anticoagulant, maladie du cœur, hypertension, asthme, dialyse, allergie grave, hémophile, enceinte, troubles
  de la mémoire, handicap) ; jusqu'à **3 personnes à prévenir** (nom, lien, téléphone) — pour un proche, le
  titulaire du compte est toujours prévenu en premier ; appareils médicaux ; note pour les secours ; le patient
  choisit ce qui est visible (aussi médecin traitant avec son téléphone, assurance, poids). Page des secours
  en **français, wolof ou anglais**, avec SAMU 1515, pompiers 18, police 17, et pour chaque proche « Appeler »,
  « WhatsApp » et « Envoyer la position » (lien de carte par SMS). QR code en image de fond d'écran ou **carte de
  portefeuille** à imprimer (format carte bancaire, recto-verso). Chaque consultation est journalisée et le
  titulaire est prévenu par SMS (une fois par jour). Un nouveau lien rend l'ancien QR code inutilisable.
  Option **« Résumé de mes médecins »** (décochée par défaut) : conclusions des 3 dernières consultations
  (12 mois) et ordonnances en cours ; jamais les notes privées des médecins ni les diagnostics sensibles (codes
  VIH, IST, santé mentale, ou mots correspondants). Fajma propose d'ajouter les médicaments des ordonnances en
  cours à « Traitements en cours » (un clic, rien d'automatique), signale les informations cochées mais vides,
  rappelle par SMS tous les 6 mois de vérifier la fiche, et indique aux secours une fiche vieille de plus d'un
  an. Le QR code n'expire pas (un accident n'a pas de date ; carte et fond d'écran restent valables) : il reste
  révocable à tout moment et chaque consultation est signalée par SMS.
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
- Absences (congés, formation), règles de réservation (confirmation automatique — **activée par défaut** —, nouveaux patients, délai
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

## 8.6 bis Sécurité de la prescription, imagerie, actes et export international

**Contrôle de l'ordonnance (médecin).** Pendant la rédaction, chaque médicament est confronté au dossier du
patient : allergie déclarée (au médicament ou à sa famille, avec les allergies croisées pénicillines –
céphalosporines), interaction avec un traitement en cours (lu dans le profil de santé **et** dans les
ordonnances encore valables) ou avec un autre médicament de la même ordonnance, contre-indication liée à
l'état du patient (grossesse — reconstituée depuis le carnet de santé —, allaitement, asthme, maladie rénale,
insuffisance cardiaque, hypertension, diabète, épilepsie, drépanocytose, **déficit en G6PD**, ulcère, maladie
du foie, trouble de la coagulation, glaucome), limite d'âge (aspirine avant 16 ans, cyclines avant 8 ans,
codéine et tramadol avant 12 ans…) et prudence après 75 ans. Trois niveaux : alerte majeure, précaution,
information. Une alerte majeure **arrête l'enregistrement** tant que le médecin n'a pas écrit pourquoi il
maintient sa prescription ; la justification est conservée et journalisée. Catalogue : environ 100 médicaments
de la liste nationale (dénominations communes et noms commerciaux courants), reconnus même écrits avec une
faute d'accent ou sous leur nom de marque.

**Imagerie médicale.** Même circuit que les analyses : le médecin prescrit (type d'examen, examens courants
proposés, préparation remplie automatiquement, produit de contraste), le patient choisit son centre — seuls
ceux qui réalisent l'examen demandé lui sont proposés —, le centre dépose les résultats dans le dossier.
Alertes propres à l'imagerie : **grossesse et rayons X**, **appareil implanté et IRM** (pacemaker, valve,
éclat métallique), **produit de contraste** chez un patient sous metformine, insuffisant rénal ou allergique
à l'iode. Un établissement déclare lui-même ce qu'il fait : analyses, imagerie, ou les deux.

**Actes et feuille de soins.** Le médecin code les actes réalisés selon la nomenclature des lettres-clés
(C, CS, K, B, Z, SF, AMI, D…) : le tarif de base est la valeur de la lettre multipliée par le coefficient.
Son prix reste libre ; les actes donnent la **base opposable** à l'organisme. Le patient télécharge une
**feuille de soins** (même en-tête et même bas de page que l'ordonnance) indiquant les actes cotés, la base
de remboursement, la somme payée, un éventuel dépassement non remboursable, la part de l'organisme et son
reste à charge. Les valeurs des lettres-clés se modifient dans « Administration > Système » ; un acte déjà
facturé garde son montant.

**Export au format international.** Dans son dossier, le patient télécharge « Format international (FHIR) » :
son dossier complet en HL7 FHIR R4, avec les codes reconnus partout (CIM-10 pour les diagnostics, LOINC pour
les mesures). Il peut le remettre à un hôpital ou à une autre application sans ressaisie.

## 8.6 ter Dossier du patient : quatre rubriques

Le dossier était une page unique de plus de 10 000 pixels : quatorze sections à la file, sans menu.
Il est rangé en quatre rubriques — **Mes soins** (comptes-rendus, ordonnances, analyses et imagerie,
certificats et courriers), **Mon suivi** (rappels de médicaments, mesures à domicile, carnet de santé),
**Mes informations** (profil de santé, fiche d'urgence, documents, assurances) et **Mon compte**
(sécurité, journal des accès, mes données). La page la plus longue fait désormais 2 600 pixels. Les liens
déjà envoyés aux patients (`/dossier#analyses`, `#medicaments`, `#carnet`) ouvrent la bonne rubrique et
font défiler jusqu'à la section.

## 8.7 Administration Fajma

- **Menu par rubriques** (à gauche ; en haut sur téléphone), avec le nombre de choses en attente : tableau de
  bord, à valider, utilisateurs, réseau de soins, finances, santé publique, communication, support, système,
  ma sécurité. Chaque membre de l'équipe ne voit que les rubriques de son **rôle** (validations, support,
  finances, santé publique, communication, super-administrateur), donné dans « Système > Équipe et rôles ».
- **Recherche globale** (en haut) : nom, téléphone, email, n° de l'Ordre, référence d'ordonnance, numéro de
  reçu ; un médecin ouvre sa **fiche 360°** (coordonnées, justificatifs et pièces manquantes, activité sur
  90 jours, avis, solde et virements, établissements ; valider, corriger, suspendre), sans contenu médical.
- **À valider** : uniquement ce qui attend, justificatifs à côté. **Réseau de soins** : un onglet par acteur
  (médecins filtrables, établissements, pharmacies, laboratoires, relais) ; plus de doublons.
- **Annonces** à un groupe (ville facultative) : notification, SMS et email au choix, nombre de
  destinataires affiché avant l'envoi, historique ; SMS limité à 5 000 destinataires et 300 caractères.
- **Réglages** sans technicien : message en haut du site, email et téléphone de contact, horaires, code
  USSD, numéro de déclaration des maladies, minimum de virement aux médecins ; valeurs vérifiées, journalisées.
- **Journal d'audit** : filtres (action, personne, patient, dates), 100 par page, export tableur.
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
| Itinéraire | Sur un rendez-vous au cabinet, « Voir l'itinéraire » affiche une carte (OpenStreetMap) avec le lieu de consultation, la position du patient s'il l'autorise, le **trajet routier tracé**, la distance et le temps de route. Boutons Google Maps et Waze pour la navigation guidée. Le calcul du trajet utilise OSRM (logiciel libre) : serveur public par défaut, `VITE_ROUTING_URL` pour le sien. Service indisponible ou hors ligne : trajet direct en pointillés et distance à vol d'oiseau, l'écran reste utile |
| Confirmation | **Un créneau libre réservé en ligne est confirmé immédiatement** : le serveur a déjà vérifié qu'il est libre, faire attendre le patient n'apporte rien. Un médecin qui préfère examiner chaque demande décoche « Confirmer automatiquement » dans ses règles de réservation ; le patient le voit sur sa fiche avant de réserver |
| Annulation | **Toujours possible par le patient** tant que le rendez-vous n'a pas eu lieu. Passé le délai fixé par le médecin, elle est acceptée mais marquée **« annulation tardive »** : le cabinet est prévenu aussitôt par SMS et le créneau redevient réservable. Empêcher une annulation tardive ne fait pas venir le patient, elle produit une absence que le médecin découvre sur place. Déplacer en ligne, en revanche, reste fermé hors délai. Remboursement intégral d'un RDV payé en ligne ; les inscrits de la liste d'attente sont prévenus |
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

## 8.15 Entraide familiale (« Je paie la santé de mes parents »)

Pour la diaspora et les familles : un proche aide un parent au Sénégal, avec son accord.

**Proche aidant** (espace « Famille », `/famille`)
1. « Ajouter un proche » : nom, comment il l'appelle (« Maman »), numéro au Sénégal, langue du SMS et droits
   demandés : payer ses consultations (toujours), prendre ses rendez-vous, voir ses ordonnances et comptes-rendus.
2. Le parent reçoit un SMS qui annonce exactement ces droits et un code à 6 chiffres (valable 24 h). En le
   donnant au téléphone, il donne son accord ; aucun smartphone n'est nécessaire. Son compte Fajma est créé si
   besoin (connexion par code SMS) et son numéro est vérifié du même coup.
3. Crédit santé : recharge de 10 000, 25 000, 50 000, 100 000 F ou d'un autre montant, par carte bancaire ou mobile
   money (PayDunya), montant affiché aussi en euros (parité fixe 1 € = 655,957 F). Reçu numéroté.
4. Paiement d'une consultation du parent avec le crédit (immédiat) ou directement par carte ; le parent est
   prévenu qu'il n'a rien à régler au cabinet ; le reçu porte le nom du proche qui a payé.
5. « Prendre un rendez-vous pour Maman » : recherche normale, la fiche du médecin réserve au nom du parent
   (rappels SMS au parent, qui est prévenu).
6. Nouvelles : rendez-vous pris, confirmé, annulé ; consultation payée ; alerte quand le crédit passe sous un
   seuil choisi ; rappel mensuel de recharge facultatif. Comptes-rendus et ordonnances si le droit est accordé.

**Parent (bénéficiaire)** : carte « Entraide familiale » de son espace : qui l'aide, crédit offert, accepter ou
refuser une invitation, cocher / décocher chaque droit, retirer tout l'accès. Il peut aussi payer lui-même ses
consultations avec le crédit offert (choix « Crédit santé » au paiement).

**Règles**
- Le proche ne peut que retirer un droit ; un droit nouveau est accordé par le parent depuis son espace.
- 5 invitations par jour, 3 codes par invitation, 5 essais par code.
- Annulation d'une consultation payée avec le crédit : le montant revient aussitôt sur le crédit (remboursement
  enregistré, part du médecin retirée).
- Crédit restant après l'arrêt de l'entraide : remboursé au proche sur demande à l'équipe Fajma.
- Chaque consultation du dossier par le proche est inscrite au journal d'audit, visible du patient.

## 8.16 WhatsApp : demandes en phrases libres

- Au lieu de taper des numéros, la personne écrit ce qu'elle veut, en wolof, français ou anglais :
  « Sama doom dafa am yaram » (mon enfant a de la fièvre), « je veux un pédiatre à Thiès », « quand est mon
  rendez-vous », « pharmacie de garde ».
- Fajma reconnaît la demande (rendez-vous, mes rendez-vous, annulation, pharmacies), la spécialité (y compris
  par les mots du quotidien : enfant, dents, yeux, cœur, grossesse…) et la ville, puis le menu reprend
  directement à la bonne étape. La réponse est en wolof si la personne a écrit en wolof. Sans IA : mots-clés,
  à faire relire par un locuteur.

## 8.17 Avis médical écrit (consultation asynchrone)

Pour les zones où la vidéo passe mal, ou pour une question qui ne justifie pas un déplacement.

**Médecin** : onglet « Avis écrits » de l'espace médecin — activer l'offre, prix, délai de réponse (24 ou 48 h),
consignes aux patients. Les demandes payées arrivent avec leur échéance (SMS au médecin) : motif, symptômes,
depuis quand, température, tension, poids, traitements en cours, photos. Il répond par écrit et conclut :
conseils, ordonnance (médicaments ajoutés directement, en-tête et signature habituels), consultation en
personne conseillée, ou urgence (le patient est invité à appeler le SAMU, 1515).

**Patient** : sur la fiche du médecin, « Demander un avis écrit » ; description, mesures facultatives, jusqu'à
4 photos ; paiement en ligne (mobile money, ou crédit santé offert par un proche — pas d'espèces). Suivi et
réponse dans la carte « Avis écrits » de son espace ; ordonnance dans son dossier, envoyable en pharmacie.

**Règles**
- Chaque demande est un rendez-vous sans durée : paiement, reçu, reversement au médecin, compte-rendu et
  ordonnance fonctionnent comme une consultation, sans bloquer de créneau ; elle n'apparaît pas dans l'agenda.
- Le délai démarre au paiement ; sans réponse à l'échéance, la demande est annulée et le patient remboursé
  (aussitôt sur le crédit santé s'il l'avait utilisé), puis prévenu.
- Photos visibles du seul médecin concerné, et seulement une fois la demande payée.
- Deux demandes en cours au plus par patient et par médecin ; annulation possible avant la réponse.

## 8.18 Relais communautaires

Pour faire entrer dans Fajma les personnes sans smartphone ni internet (personnes âgées, mères et jeunes
enfants, malades chroniques), avec les relais de santé qui les connaissent déjà.

- **Habilitation** : l'administration habilite un compte (structure : poste de santé, ONG, district ; zone
  couverte ; 300 personnes au plus par défaut). Le relais arrive sur son espace « Relais » (`/relais`).
- **Ajouter une personne** : nom, date de naissance, sexe, quartier ou village, téléphone d'un proche, repère
  (accès à la maison, sans donnée médicale) et **accord obligatoire** : oral devant témoin, formulaire signé,
  ou accord du tuteur ; chaque ajout est journalisé.
- **Suivre** : chaque personne est un « proche » du compte du relais ; il prend ses rendez-vous (choix « Pour
  qui »), reçoit les rappels, note tension, glycémie, poids et vaccins avec les outils habituels.
- **Alertes du jour**, personnes les plus urgentes en tête : tension ≥ 180/110 ou glycémie ≥ 3 g/L ou < 0,6 g/L
  (orienter aujourd'hui), tension ≥ 140/90 ou glycémie élevée (consultation à prévoir), vaccins de l'enfant en
  retard ou à faire, rendez-vous dans les 2 jours (prévenir, accompagner).
- **Transfert du dossier** : quand la personne a son téléphone, le relais saisit son numéro ; elle reçoit un
  code par SMS et le lui donne (son accord). Tout son dossier passe sur son propre compte (rendez-vous,
  comptes-rendus, ordonnances, vaccins, mesures, assurances, analyses), qui est créé si besoin ; elle se
  connecte avec son numéro. Le transfert couvre automatiquement toute table liée aux proches.

## 8.19 Diagnostic codé, déclaration des maladies et veille épidémiologique

Pour aider l'État (Direction de la Prévention, districts sanitaires) à repérer et contenir les épidémies.

**Médecin — compte-rendu (et avis écrit)**
- En plus du texte libre, il choisit le **diagnostic principal** dans une liste avec recherche (44 maladies,
  codes CIM-10), regroupée comme la Surveillance intégrée de la maladie et la riposte (SIMR) :
  - **à déclaration immédiate** : choléra, rougeole, méningite, fièvre jaune, dengue, chikungunya, fièvres
    hémorragiques (Ebola, Marburg, Crimée-Congo, vallée du Rift), paralysie flasque aiguë (polio), tétanos
    néonatal, diphtérie, mpox, grippe d'un nouveau sous-type, rage, charbon ;
  - **surveillance hebdomadaire** : paludisme, dysenterie, diarrhée aiguë, typhoïde, pneumonie, syndrome
    grippal, COVID-19, coqueluche, varicelle, tuberculose, **hépatites A/E, B et C**, VIH, IST, bilharziose,
    lèpre, conjonctivite, malnutrition aiguë de l'enfant, morsure de serpent ;
  - **maladies chroniques** : hypertension, diabète, drépanocytose, asthme, maladie rénale, cancer, santé
    mentale, anémie ; **santé de la mère** : grossesse à risque ; « autre ».
- Il précise **suspect / probable / confirmé** et le **résultat du test** proposé (TDR palu, test rapide
  AgHBs, anti-VHC, VIH, NS1 dengue, GeneXpert…). Un test négatif écarte le cas de la veille.
- **Maladie à déclaration immédiate** : message rouge « déclarez ce cas au district sanitaire dès
  maintenant » (avec le numéro d'alerte réglé par `EPIDEMIC_HOTLINE`), l'équipe Fajma est prévenue aussitôt,
  et le cas apparaît en haut de son espace dans « Déclarations à faire » jusqu'à ce qu'il clique
  « J'ai déclaré ce cas » (à qui, référence).

**Administration — section « Veille épidémiologique »**
- Cas par maladie, **par région** et par semaine (12 semaines), à partir du diagnostic codé (mots-clés du
  motif et du diagnostic écrit en secours ; la part codée est affichée). Cases de moins de 5 : « <5 ».
- **Signaux** : un seul cas de maladie à déclaration immédiate est toujours signalé ; pour les autres,
  semaine au-dessus de la moyenne + 2 écarts-types des 8 précédentes (au moins 5 cas, 1,5 fois l'habitude).
- **Déclarations** : liste des cas à déclaration immédiate (maladie, certitude, ville, région, date, médecin
  et son téléphone pour l'enquête du district), déclarés ou non ; compteur dans « À traiter ».
- **Exports** : tableur anonymisé (cases masquées) et **rapport hebdomadaire SIMR** (dernière semaine
  complète, région × maladie, CIM-10, suspects / confirmés, comptes exacts) à transmettre aux autorités dans
  le cadre d'une convention, après accord de la CDP.
- Jamais d'identité de patient ni de texte médical dans la veille ; chaque consultation ou export est
  journalisé. La liste des maladies se modifie en un seul endroit (`backend/medical/conditions.py`), à faire
  valider par la Division de la surveillance épidémiologique.

## 8.20 Partenaires et campagnes sponsorisées

**Pour les visiteurs** : en haut de l'accueil, un grand bandeau animé aux couleurs de la campagne, avec son visuel ; s'il y a plusieurs campagnes « Accueil » actives (5 au plus, ordre tiré au hasard), elles défilent toutes les 7 secondes (points, flèches, pause au survol ; animations coupées si l'appareil le demande). Bande « Nos partenaires » sur l'accueil (logos qui défilent) et lien « Partenaires » dans le menu ; page « Nos partenaires » (`/partenaires`) — assurances, opérateurs, pharmacies et
laboratoires, institutions, ONG ; encarts marqués « Sponsorisé » sur l'accueil, la recherche de médecins
(encart séparé, au-dessus des résultats, qui ne change jamais leur ordre) et l'espace patient.

**Administration** (section « Partenaires et campagnes ») :
- ajouter un partenaire (nom, type, description, site, logo, affichage public ou non) ;
- créer une campagne (partenaire, catégorie : prévention, assurance, service de santé, produit sans
  ordonnance ; titre, texte, bouton et lien ; emplacements ; villes et langues ; dates) : enregistrée en
  brouillon, diffusée seulement après « Valider » et confirmation de la conformité à la charte ; toute
  modification la remet en brouillon ;
- suspendre une campagne ; affichages, clics et taux de clic ; rapport tableur pour l'annonceur (par jour et
  emplacement).

**Charte publicitaire** (CGU, article 11) : seulement prévention et santé publique, assurances et mutuelles,
services de santé, produits sans ordonnance autorisés ; interdits : médicament sur ordonnance, promesse de
guérison, médecin mis en avant contre paiement, contenu sponsorisé dans le dossier médical, une ordonnance ou
une téléconsultation. Les textes contenant des mots interdits (« ordonnance », « antibiotique », « miracle »,
« guérison garantie »…) sont refusés automatiquement. Ciblage par ville et langue seulement, jamais par les
données de santé ; statistiques agrégées, aucune donnée personnelle transmise. Charte à faire relire par un
juriste et l'Ordre des médecins.

## 8.21 Guide d'utilisation dans l'application

- Page **« Guide d'utilisation »** (`/guide`), un chapitre par espace : patient, famille (entraide), médecin,
  clinique et secrétariat, pharmacie, laboratoire, relais communautaire, administration.
- Chaque chapitre : introduction, sommaire, sections avec **étapes numérotées**, points clés et **astuces** ;
  recherche dans tous les chapitres à la fois (« ordonnance », « annuler », « crédit »…) ; bouton
  « Imprimer ce guide ».
- Le lien **« Aide »** de l'en-tête de chaque espace ouvre directement le chapitre de cet espace ; le guide
  renvoie vers « Aide et contact » pour écrire à l'équipe. Liens aussi depuis la page « Aide et contact » et le
  pied de page de l'accueil.
- Contenu : `src/lib/guide-content.ts`, à tenir à jour à chaque évolution d'un écran.
