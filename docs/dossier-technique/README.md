# Dossier technique et sécurité — Fajma

**Version du dossier :** 3.8 — 5 octobre 2026
**Périmètre :** code source du dépôt `sante-connect-main` (backend Django, frontend React, déploiement), services tiers.
**Public visé :** acquéreurs, investisseurs, auditeurs techniques et juridiques, équipe technique reprenant le projet.

Cette version remplace entièrement la version 1.x, qui décrivait le prototype initial (Supabase, Lovable Cloud).
Le produit a depuis été reconstruit : backend Django, base PostgreSQL maîtrisée, aucune dépendance à Lovable
ni à Supabase.

---

## 1. Fiche d'identité

| Élément | Valeur |
|---|---|
| Produit | Plateforme de santé pour le Sénégal : prise de rendez-vous, téléconsultation, dossier médical, paiement, assurances, pharmacies |
| Utilisateurs | Patients (et leurs proches), médecins, cliniques (responsables, secrétariat), pharmaciens, laboratoires d'analyses, administrateurs |
| Canaux | Site web et application installable (PWA, publiable sur le Play Store), WhatsApp, USSD (tout téléphone, sans internet) |
| Langues | Français, wolof (à faire relire par un locuteur natif), anglais ; SMS et menus dans la langue du patient |
| Backend | Python 3.13, Django 6.1, Django REST Framework ; file de tâches `django.tasks` |
| Frontend | React 19, TanStack Router/Start (mode SPA), Tailwind CSS 4, TypeScript |
| Base de données | PostgreSQL 17 en production (SQLite en développement) |
| Hébergement | Docker Compose sur un serveur au choix — **un hébergement au Sénégal est possible sans modification** |
| Paiement | PayDunya (Wave, Orange Money, Free Money, cartes) ou règlement au cabinet |
| Messages | Twilio : SMS et WhatsApp ; notifications push du navigateur (Web Push, gratuites) |
| Téléconsultation | Jitsi Meet (serveur public au démarrage, auto-hébergeable) |
| Assistant IA | Fournisseur configurable via une API compatible OpenAI (Google Gemini par défaut) |
| Qualité | 282 tests automatisés de l'API ; parcours de bout en bout dans un navigateur réel pour chaque rôle ; intégration continue GitHub Actions |
| Taille du code | ≈ 14 900 lignes Python (hors tests et migrations), ≈ 3 900 lignes de tests, ≈ 32 600 lignes TypeScript/React |

## 2. Contenu du dossier

| # | Document | Contenu |
|---|---|---|
| 1 | [Architecture](01-architecture.md) | Composants, organisation du code, fonctionnalités, modèle de données, intégrations |
| 2 | [Sécurité](02-securite.md) | Authentification, contrôle d'accès, protections, secrets, journal d'audit, tests |
| 3 | [Données personnelles et conformité](03-donnees-et-conformite.md) | Inventaire des données, sous-traitants, droits des personnes, obligations au Sénégal |
| 4 | [Exploitation et déploiement](04-exploitation.md) | Installation, mise en production, tâches planifiées, sauvegardes, supervision |
| 5 | [Risques et plan d'action](05-risques-et-plan-action.md) | Points ouverts, gravité, actions avant commercialisation |
| 6 | [Informations pour une cession](06-cession.md) | Propriété, licences des composants, dépendances aux prestataires, coûts, reprise par une autre équipe |
| 7 | [Inventaire des licences](07-licences.md) | Licence de chaque composant libre (serveur, application, outils), analyse et obligations ; annexe CSV |
| 8 | [Guide fonctionnel de A à Z](08-guide-fonctionnel.md) | Ce que fait chaque utilisateur, étape par étape (patient, médecin, secrétariat, pharmacie, laboratoire, administration, secours), automatismes, règles de fonctionnement, glossaire |
| 9 | [Audit global du code](09-audit-global.md) | Réponses point par point aux quinze volets de l'audit (sécurité, créneaux, portabilité, performance, robustesse, métier, sessions, identité des médecins, paiement, SMS, confidentialité, fichiers, accessibilité, supervision, architecture), problèmes classés par gravité et correctifs |

## 3. Synthèse pour la direction

**Ce qui est en place**

- **Couverture fonctionnelle de niveau Doctolib, adaptée au Sénégal** : réservation (site, WhatsApp, USSD),
  téléconsultation, dossier médical, ordonnances et certificats vérifiables par QR code, paiement mobile avec
  commission et reversement aux médecins, abonnements des médecins, assurances (IPM, mutuelles CMU, assureurs)
  avec tiers payant, carnet de vaccination et suivi de grossesse, ordonnances transmises aux pharmacies,
  secrétariat de clinique ou de cabinet, télé-expertise entre médecins, visites à domicile, séries de
  séances (kinésithérapie, soins), remplacements entre médecins, tableau de pilotage.
- **Chaque acteur gère lui-même ses informations** : fiche et photo du médecin, horaires et garde de la
  pharmacie, informations de la clinique ; l'administration dispose des outils de support (recherche de
  compte, suspension, réinitialisation de la double authentification, ajout de pharmacies).
- **Le contrôle d'accès est appliqué par le serveur** pour chaque requête, et vérifié par des tests
  automatisés (tentatives d'accès aux données d'un autre patient, d'un autre médecin, d'une autre pharmacie…).
- **Traçabilité** : chaque consultation d'un dossier par un professionnel est inscrite dans un journal
  inaltérable, visible par le patient concerné.
- **Argent tracé** : journal comptable non modifiable par médecin ; paiements vérifiés directement auprès
  de PayDunya ; remboursement automatique en cas d'annulation.
- **Sécurité des comptes** : double authentification (TOTP) **obligatoire pour tous les professionnels et
  administrateurs**, connexion par code SMS pour les patients, sessions HttpOnly, limites de débit, en-têtes de
  sécurité et politique CSP stricte.
- **Exploitation** : sauvegardes quotidiennes chiffrées avec test de restauration mensuel automatique,
  supervision avec alertes email, purge nocturne des données techniques selon des durées de conservation.
- **Souveraineté** : l'ensemble de la plateforme (base, fichiers, API) peut être hébergé au Sénégal ; les
  seuls flux sortants sont ceux des prestataires listés (SMS, IA, vidéo si non auto-hébergée).

**Ce qui doit être fait avant une commercialisation** (détail : [plan d'action](05-risques-et-plan-action.md))

1. **Réglementaire** : autorisation de la CDP pour le traitement de données de santé ; encadrement des
   transferts hors du Sénégal ; validation par un juriste des CGU et de la politique de confidentialité
   (projets fournis) ; qualification juridique de l'encaissement pour le compte des médecins.
2. **Téléconsultation** : héberger Jitsi (ou un service contractualisé) au lieu du serveur public.
3. **Validation médicale** : calendrier vaccinal (PEV) et consultations prénatales à faire valider par la
   Direction de la Prévention ; textes wolof à faire relire.
4. **Test d'intrusion** par un prestataire indépendant, puis exploitation sur l'infrastructure cible
   (HTTPS, première restauration de sauvegarde, abonnement à un moniteur de disponibilité externe).
5. **Contrats opérateurs** : Twilio (numéros, modèles WhatsApp approuvés), agrégateur USSD, PayDunya en
   production ; les virements aux médecins et remboursements sont aujourd'hui exécutés manuellement par
   l'administration, qui en saisit la référence.

## 4. Méthode

Dossier établi par lecture intégrale du code source, exécution de la suite de tests de l'API (282 tests) et
de parcours de bout en bout dans un navigateur réel (Chrome et Edge, ordinateur et mobile) : patient, médecin,
médecin remplaçant, clinique, secrétariat, pharmacien, administrateur, activation obligatoire de la double
authentification, mode hors ligne sur le build de production.

**Limites** : les intégrations externes (PayDunya, Twilio, agrégateur USSD, service push des navigateurs,
Jitsi) ont été testées avec des réponses simulées, faute d'accès réseau et de comptes de production dans
l'environnement d'audit. Le déploiement Docker n'a pas pu être exécuté (composition validée par
`docker compose config`) ; en revanche la base PostgreSQL réelle, la sauvegarde, la restauration et les scripts
`backup.sh` / `restore-test.sh` ont été exécutés et vérifiés pour de vrai hors Docker (§ 4.5).
Ces points sont signalés **« À vérifier »**.

## 5. Historique des versions

| Version | Date | Changements |
|---|---|---|
| 1.x | 2026 | Prototype initial (Supabase, Lovable Cloud) |
| 2.0 | 29/09/2026 | Reconstruction complète (Django, PostgreSQL), dossier réécrit |
| 2.1 | 30/09/2026 | Visites à domicile, séries de séances, remplacements ; double authentification obligatoire pour les professionnels ; outils d'administration ; fiches modifiables par chaque acteur ; supervision, test de restauration, purge des données ; chapitre 6 (cession) |
| 2.2 | 30/09/2026 | Agenda tenu par le cabinet (saisie et déplacement de RDV), pièces jointes dans la messagerie, exports tableur (dont bordereau de tiers payant) ; suivi à domicile (tension, glycémie, poids), rappels de médicaments, laboratoires d'analyses, disponibilité des médicaments en pharmacie, pages publiques des cliniques, « Mes médecins », messagerie avec le remplaçant |
| 2.3 | 30/09/2026 | Mise en service simulée avec de vrais comptes pour chaque rôle. Corrections : la mise à jour du profil ne peut plus effacer ni « garder vérifié » un numéro changé (sécurité) ; géolocalisation automatique des cabinets (recherche par quartier) ; file « À traiter » et menu de l'administration ; notifications de validation, de rattachement, de nouvelle ordonnance et de compte-rendu ; alerte « en-tête d'ordonnance incomplet » ; compte-rendu et ordonnance possibles après « Terminé » ; affichage mobile de l'espace patient et du dossier |
| 2.4 | 30/09/2026 | Renforcements avant mise en service : fichiers chiffrés sur le disque, antivirus (ClamAV), déconnexion des professionnels après 30 min d'inactivité, alerte de connexion depuis un nouvel appareil, contrôle des failles des bibliothèques serveur (pip-audit) |
| 2.5 | 30/09/2026 | Revue de toutes les pages. Espace médecin en onglets et vrai écran « Emploi du temps » (semaine visuelle, plages sur plusieurs jours, modification, chevauchements refusés, aperçu patient) ; aperçu d'ordonnance (spécimen) ; signature exigeant un vrai tracé ; logo Fajma sur les documents ; page publique « Tarifs » ; accueil sans données inventées (vrais médecins disponibles, allégations non vérifiables retirées) ; déconnexion dans les espaces pharmacie, laboratoire, clinique et administration ; corrections d'affichage mobile |
| 2.6 | 30/09/2026 | Connexion vérifiée pour chaque rôle (dont redirection de la clinique et du secrétariat vers leur agenda, redirection sans erreur au premier chargement) ; page publique « Aide et contact » (questions fréquentes, numéros d'urgence, formulaire) et suivi des demandes dans l'administration ; guide de démarrage du médecin en 7 étapes ; lanceur local `Lancer-Fajma.bat` |
| 2.7 | 30/09/2026 | Agenda du médecin en glisser-déposer (déplacement et durée à la souris ou au doigt, couleur par motif validée daltonisme) ; assistant de prise de notes (dictée vocale, brouillon de compte-rendu par IA ou mise en forme locale, à relire) ; nouveau risque R-19 (transfert des notes au fournisseur d'IA) |
| 2.8 | 01/10/2026 | Renouvellement d'ordonnance à la demande du patient (rappel avant échéance des traitements longs, décision du médecin) ; fiche d'urgence publique par QR code (informations choisies, lien révocable, consultations journalisées) ; alertes aux médecins sur les mesures à domicile dangereuses ou répétées ; animations modernisées ; logo Fajma en tête des ordonnances |
| 2.9 | 05/10/2026 | Chapitre 7 « Inventaire des licences » (outil `tools/inventaire_licences.py`, annexe CSV : aucun composant sous copyleft fort, composants livrés aux navigateurs tous sous licence permissive) ; rapport d'activité mensuel dans l'administration (tableur, impression PDF, sans donnée nominative) ; comptage des patients corrigé (comptes professionnels exclus) |
| 3.0 | 05/10/2026 | Questionnaire du médecin visible dès la réservation sur sa fiche, réponses toujours facultatives (plus de question obligatoire) ; dossier médical complet téléchargeable en PDF par le patient (export journalisé) |
| 3.1 | 05/10/2026 | Dossier complété de A à Z : chapitre 1 mis à jour avec toutes les fonctionnalités (emploi du temps, agenda en glisser-déposer, questionnaire, renouvellements, fiche d'urgence, alertes, assistant de notes, aide et support, tarifs, rapport d'activité, dossier en PDF), tables et intégrations (antivirus) ; nouveau chapitre 8 « Guide fonctionnel de A à Z » (parcours de chaque rôle, automatismes, règles, glossaire) ; chiffres du code actualisés |
| 3.2 | 05/10/2026 | Audit global (sécurité, concurrence, portabilité, performance, robustesse, métier) et correctifs : mode développement impossible par oubli en production (`DJANGO_DEBUG`) ; verrou par compte contre la force brute répartie (10 échecs en 15 min) ; recherche de médecins sans requêtes en cascade (4 requêtes quel que soit le nombre de médecins) ; base de données injoignable = réponse 503 lisible ; **historique de chaque rendez-vous** (qui l'a pris, confirmé, déplacé, annulé, quand), visible du patient, du médecin et du secrétariat ; balayage automatique des accès croisés (IDOR) et test de la contrainte anti-double réservation sous PostgreSQL |
| 3.3 | 05/10/2026 | Nouveau chapitre 9 « Audit global du code » : les six volets de l'audit détaillés question par question, problèmes classés (bloquant, important, mineur), correctifs et tests associés |
| 3.4 | 05/10/2026 | Audit, volets 7 à 15 (chapitre 9) et correctifs : numérotation légale continue des reçus ; désinscription SMS (STOP / START) ; rappels jamais envoyés deux fois ; purge des comptes inactifs avec préavis (désactivée tant que la durée légale n'est pas fixée) ; bouton « Déconnecter mes autres appareils » ; réservation idempotente et refus de réserver chez soi-même ; `/api/health` détaillé pour la supervision ; flux temps réel économe en connexions, PostgreSQL à 200 connexions ; accessibilité WCAG AA (contrastes, libellés, tablette) vérifiée avec axe-core |
| 3.5 | 05/10/2026 | Recette complète de l'interface de production (§ 9.17, 78 affichages, 7 rôles, téléphone et ordinateur) et correctifs : page blanche au rechargement répété (flux temps réel différé et fermé au départ de la page), page 404 sans erreur, retour de paiement sans référence, débordements sur téléphone, bibliothèques PDF et graphiques chargées à la demande (dossier patient 483 → 309 Ko, espace médecin 413 → 238 Ko) |
| 3.6 | 05/10/2026 | Base de données vérifiée sur un vrai PostgreSQL 17 (§ 4.5, § 9.18) : correction des tests PostgreSQL de l'intégration continue (en échec depuis l'origine, à tort déclarés au vert) et de deux erreurs PostgreSQL de production ; dossiers médicaux et paiements protégés contre la suppression en cascade ; secret de double authentification chiffré ; index, pagination de l'annuaire, agenda borné, requêtes regroupées ; test de volume (200 000 RDV) ; sauvegarde, restauration, transfert SQLite → PostgreSQL et déménagement vérifiés ; sauvegardes toutes les 6 h conseillées |
| 3.7 | 05/10/2026 | Nouveau logo lié au nom : le « f » de Fajma dessine une croix médicale (vert et or du drapeau), sur le site, les PDF, l'icône d'onglet et les icônes de l'application |
| 3.8 | 05/10/2026 | Logo définitif choisi parmi 8 propositions : bulle de consultation portant le « f » en croix médicale (site, PDF, icône d'onglet, icônes de l'application dont l'icône adaptative Android) |
