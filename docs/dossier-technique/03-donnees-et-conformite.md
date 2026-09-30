# 3. Données personnelles et conformité

> Cette section décrit les faits techniques utiles à l'analyse juridique. **Elle ne constitue pas un avis
> juridique.** Les points marqués ⚖️ doivent être validés par un juriste spécialisé en droit du numérique et de
> la santé au Sénégal.

## 3.1 Cadre applicable (à confirmer ⚖️)

- **Loi n° 2008-12 du 25 janvier 2008** sur la protection des données à caractère personnel et son décret
  d'application ; autorité de contrôle : **CDP**. Vérifier l'état de la réforme de cette loi au moment de la cession.
- Les données de santé sont des **données sensibles** : leur traitement relève en principe d'une
  **autorisation préalable de la CDP**.
- **Transferts hors du Sénégal** : encadrés (pays adéquat ou autorisation). Voir § 3.3.
- Exercice de la médecine, téléconsultation, ordonnance et certificat électroniques, télé-expertise : règles de
  l'Ordre national des médecins et du ministère de la Santé.
- Pharmacies : transmission d'ordonnances à une officine choisie par le patient (règles de l'Ordre des pharmaciens).
- Encaissement pour le compte des médecins et prélèvement d'une commission : qualification juridique à établir
  (mandat d'encaissement, statut au regard de la réglementation des paiements de l'UEMOA).
- Assurances : tiers payant et échange d'informations avec les organismes (IPM, mutuelles, assureurs) à
  encadrer par convention.

## 3.2 Inventaire des données

| Catégorie | Données | Personnes | Finalité |
|---|---|---|---|
| Identité et contact | Nom, email, téléphone (vérifié), ville, langue | Tous les utilisateurs | Compte, rappels |
| Proches | Nom, lien, date de naissance, téléphone | Enfants et proches | Prise de RDV, carnet de vaccination |
| Rendez-vous | Médecin, date, motif libre, réponses au questionnaire, canal | Patients | Organisation des soins |
| **Santé** | Profil (groupe sanguin, allergies, antécédents, traitements), comptes-rendus, ordonnances, certificats, arrêts de travail, documents déposés, messages, vaccins, suivi de grossesse | Patients, enfants | Suivi médical |
| **Santé** | Symptômes décrits à l'assistant IA | Visiteurs | Orientation — **non conservés** |
| **Santé** | Mesures à domicile (tension, glycémie, poids), rappels de médicaments, prescriptions et résultats d'analyses | Patients, proches | Suivi médical |
| Demandes aux pharmacies | Nom du médicament, précision, réponses (sans identité transmise à la pharmacie) | Patients | Éviter les déplacements inutiles |
| Assurance | Organisme, numéro d'adhérent, taux de prise en charge | Patients | Tiers payant, feuille de soins |
| Paiement | Montant, moyen, références de transaction et de virement | Patients, médecins | Encaissement, reversement |
| Professionnels | Fiche, tarifs, disponibilités, justificatifs (diplôme, inscription à l'Ordre, pièce d'identité) | Médecins | Annuaire, vérification |
| Patients sans compte | Nom, téléphone saisis par le secrétariat | Patients au guichet | RDV, rappels |
| Techniques | Journal d'audit (adresse IP, navigateur), journaux serveur | Tous | Sécurité, preuve des accès |

## 3.3 Sous-traitants et flux hors du Sénégal

| Prestataire | Rôle | Données transmises | Localisation |
|---|---|---|---|
| Hébergeur (au choix) | Serveur, base, fichiers | **Toutes** | **Au choix — hébergement au Sénégal possible** |
| Twilio / Meta (WhatsApp) | SMS, WhatsApp, robot WhatsApp | Numéro, nom, médecin, date ; messages du robot | États-Unis |
| Agrégateur USSD | Menu USSD | Numéro, saisies du menu | Selon contrat (opérateurs sénégalais) |
| PayDunya | Paiement | Montant, référence | Sénégal |
| Service push des navigateurs (Google, Apple, Mozilla) | Notifications | Titre et court texte de la notification (chiffrés de bout en bout) | Hors Sénégal |
| Jitsi `meet.jit.si` (tant qu'il n'est pas auto-hébergé) | Vidéo | **Flux audio/vidéo de la consultation** | Hors Sénégal, sans contrat |
| Fournisseur IA (Google Gemini par défaut) | Assistant d'orientation | Symptômes saisis | Hors Sénégal |
| OpenStreetMap | Fonds de carte | Adresse IP du visiteur | Hors Sénégal |
| Google Fonts | Polices | Adresse IP du visiteur | Hors Sénégal |
| Sentry (facultatif) | Suivi des erreurs | Traces techniques (sans données personnelles : option désactivée) | Selon compte |

⚖️ Pour les données de santé, la voie la plus simple est l'hébergement au Sénégal (base et fichiers) et une
instance Jitsi locale ; les autres transferts portent sur des données limitées (SMS, notifications) et doivent
être couverts par les contrats et autorisations.

## 3.4 Droits des personnes

| Droit | Mise en œuvre |
|---|---|
| Information | Projets de CGU et de politique de confidentialité intégrés au site (à valider ⚖️) ; mention à chaque partage de dossier (pharmacie, confrère) |
| Accès | Dossier complet consultable ; **journal des accès** montrant quel professionnel a consulté quoi |
| Rectification | Profil, profil de santé, proches, assurances, carnet modifiables |
| Portabilité | Export complet des données en JSON depuis le dossier |
| Effacement | Suppression du compte en libre-service (anonymisation des données qui doivent être conservées) |
| Maîtrise du partage | Partage des documents document par document et médecin par médecin ; envoi d'ordonnance à une pharmacie choisie ; information préalable du patient pour la télé-expertise |
| Langue | Interface, SMS et menus en français, wolof ou anglais |

## 3.5 Conservation

Purge automatique chaque nuit (`purge_data`, durées réglables par variables d'environnement) :

| Donnée | Durée par défaut | Traitement |
|---|---|---|
| Sessions expirées | À expiration | Suppression |
| Codes SMS de connexion | 1 jour | Suppression |
| Conversations WhatsApp / USSD | 30 jours | Suppression |
| SMS envoyés (numéro et texte) | 1 an | Suppression |
| Notifications de l'application | 1 an | Suppression |
| Occupations importées des agendas personnels | 7 jours après la date | Suppression |
| Identité des patients sans compte (saisis au guichet) | 5 ans après le RDV | Anonymisation (le RDV reste pour les statistiques) |
| Journal d'audit | 5 ans ⚖️ | Suppression |
| **Données médicales** (dossiers, comptes-rendus, ordonnances, certificats, documents, carnets) | **Aucune purge automatique** | Durée légale à fixer ⚖️ |
| Données de paiement et journal comptable | Aucune purge automatique | Obligations comptables à fixer ⚖️ |

Un compte supprimé par son titulaire est anonymisé immédiatement (documents déposés effacés, identité remplacée).

## 3.6 Points d'attention dans l'application

- **Allégations commerciales** : les chiffres de la page d'accueil (médecins, villes, praticiens par spécialité,
  note moyenne) sont calculés à partir de la base ; la note moyenne n'est affichée qu'à partir de 20 avis.
- **Calendriers médicaux** : le calendrier vaccinal (PEV) et le rythme des consultations prénatales (8 contacts
  OMS) sont des références à faire valider ; l'application précise qu'elle complète le carnet papier.
- **Certificats et arrêts de travail** : un arrêt ne peut pas débuter plus de 2 jours avant la consultation ;
  la vérification publique ne révèle que les initiales du patient.
- **Chiffrement** : transport (HTTPS) garanti ; **fichiers (documents médicaux, résultats, pièces jointes,
  justificatifs, signatures) chiffrés par l'application** avant écriture sur le disque, donc aussi dans les
  sauvegardes ; sauvegardes elles-mêmes chiffrées (AES-256). La base de données reste à chiffrer au niveau
  de l'hébergement (disque chiffré) — **à vérifier** sur l'infrastructure retenue.
