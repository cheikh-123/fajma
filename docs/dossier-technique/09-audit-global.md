# 9. Audit global du code (5 octobre 2026)

Audit critique de l'ensemble du projet (interface, serveur, base de données, configuration) en quinze volets.
Chaque point a été vérifié dans le code et, quand c'est possible, par un test automatique ajouté à la suite.
Les problèmes sont classés par gravité : **Bloquant** (à corriger avant toute mise en ligne), **Important**
(risque réel en exploitation), **Mineur** (sans conséquence pour les utilisateurs). Tous les problèmes
bloquants et importants relevés ont été corrigés (volets 1 à 6 : version 3.2 du dossier ; volets 7 à 15 : version 3.4).

## 9.1 Synthèse

| Gravité | Problème | Volet | État |
|---|---|---|---|
| Bloquant | Le serveur de production démarrait en mode développement si le réglage `DJANGO_DEBUG` était oublié (pages de débogage, accès démo sans mot de passe) | 1, 3 | Corrigé |
| Important | Force brute répartie : la limite de connexion était comptée par adresse IP seulement | 1, 4 | Corrigé |
| Important | Recherche de médecins : environ 6 requêtes SQL par médecin affiché (« N+1 ») | 4 | Corrigé |
| Important | Base de données injoignable : page d'erreur brute au lieu d'un message clair | 5 | Corrigé |
| Important | Aucun historique des rendez-vous : auteur précis d'une annulation et ancien horaire d'un déplacement perdus | 6 | Corrigé |
| Important | Reçus de paiement sans numérotation continue (obligation légale) | 9 | Corrigé |
| Important | Réponse « STOP » aux SMS non prise en compte | 10 | Corrigé |
| Important | Rappel SMS pouvant partir deux fois si deux exécutions du planificateur se chevauchent | 10 | Corrigé |
| Important | Aucune purge des comptes inactifs | 11 | Corrigé (désactivée tant que la durée légale n'est pas fixée) |
| Important | Contrastes de couleurs insuffisants (WCAG AA), listes sans libellé, débordement de l'accueil sur tablette | 13 | Corrigé |
| Important | Flux temps réel : connexions à la base gardées ouvertes (risque d'épuisement) | 15 | Corrigé |
| Mineur | Pas de bouton pour déconnecter ses autres appareils (seule l'administration pouvait le faire) | 7 | Corrigé |
| Mineur | Un médecin pouvait réserver chez lui-même | 8 | Corrigé |
| Mineur | Réservation renvoyée après une coupure réseau : message d'erreur trompeur | 15 | Corrigé |
| Mineur | `/api/health` sans détail des composants | 14 | Corrigé |
| Mineur | Mot de passe des comptes de démonstration écrit dans le script de démonstration | 3 | Accepté (démonstration seulement) |

## 9.2 Volet 1 — Sécurité et permissions

| Question | Constat | Preuve / correctif |
|---|---|---|
| Un utilisateur peut-il lire ou modifier les données d'un autre en changeant un identifiant (IDOR/BOLA) ? | Non. Chaque route filtre sur l'utilisateur connecté (patient, médecin, clinique) ; identifiants UUID non devinables | Test `tests/test_idor_sweep.py` : un autre patient, un autre médecin et un visiteur tentent une quarantaine de routes (RDV, documents, ordonnances, paiements, proches, mesures, analyses, renouvellements, assurances) : toutes refusées (401/403/404), aucune donnée modifiée |
| Les réponses publiques laissent-elles fuir des données ? | Non. Les fiches publiques (médecins, cliniques, pharmacies) n'exposent que des champs choisis ; jamais d'email ou de téléphone de patient | Revue des fonctions de sérialisation |
| Injection SQL / XSS ? | Aucune requête SQL écrite à la main (ORM Django partout) ; React échappe les contenus, aucun `dangerouslySetInnerHTML` sur une donnée utilisateur ; CSP stricte | Revue du code |
| Secrets et `.env` ? | `.env` exclu de Git ; clés lues dans les variables d'environnement ; clé secrète obligatoire en production | `.gitignore`, `settings.py` |
| Mode développement en production | **Bloquant** : `DJANGO_DEBUG` valait « vrai » par défaut | Corrigé : le mode développement n'est actif sans réglage que pour les commandes `manage.py` sur un poste ; gunicorn démarre toujours en mode sécurisé ; `docker-compose.yml` impose `DJANGO_DEBUG: "false"` |
| Force brute sur les mots de passe | **Important** : limite par IP contournable avec de nombreuses adresses | Corrigé : verrou par compte, 10 échecs en 15 minutes → connexion refusée 15 minutes (test dans `tests/test_security.py`) |

## 9.3 Volet 2 — Concurrence et fiabilité des créneaux

| Question | Constat | Preuve / correctif |
|---|---|---|
| Deux patients qui réservent le même créneau à la même seconde ? | Impossible. Vérification dans une transaction, puis **contrainte d'exclusion PostgreSQL** (aucun chevauchement de deux RDV actifs d'un même médecin) ; le second reçoit une erreur 409 « Ce créneau vient d'être réservé » | Tests existants de double réservation ; nouveau test `tests/test_overlap_constraint.py` qui contourne l'application et vérifie le refus par la base (exécuté sous PostgreSQL en intégration continue) |
| Fuseaux horaires et heure d'été | Dates stockées en UTC (`USE_TZ = True`, colonnes `timestamp with time zone`) ; le Sénégal est à UTC+0 sans heure d'été ; l'interface affiche toujours l'heure de Dakar, quel que soit le réglage du téléphone | `settings.py`, `src/lib/datetime.ts` |

## 9.4 Volet 3 — Portabilité, propreté du code et installation

| Question | Constat |
|---|---|
| Chemins écrits en dur ? | Aucun : chemins calculés depuis le dossier du projet ou lus dans l'environnement |
| Installation standard ? | `pip install -r requirements.txt`, `migrate`, `seed_demo`, `runserver` ; `npm install`, `npm run dev` ; ou `docker compose up` ; `Lancer-Fajma.bat` sous Windows |
| `console.log` / `print` oubliés, code mort ? | Aucun ; journaux via `logging` ; ESLint et TypeScript strict dans l'intégration continue |
| Données de test en dur ? | Mineur : mot de passe des comptes de démonstration dans `seed_demo` (commande réservée à la démonstration, accès démo impossible en production) |

## 9.5 Volet 4 — Performance, requêtes et coûts

| Question | Constat | Preuve / correctif |
|---|---|---|
| Requêtes en cascade (N+1) ? | **Important** sur la recherche de médecins (91 requêtes pour 14 médecins) | Corrigé : prochaine disponibilité de tous les médecins en 4 requêtes (`next_available_many`), aussi sur les pages des cliniques. Test `tests/test_query_counts.py` : le nombre de requêtes de la recherche, des RDV du patient et de l'agenda du médecin ne grandit pas avec le nombre de lignes |
| Index SQL ? | Index sur (médecin, date, statut) des RDV, sur les dates de début et de fin, sur le journal d'audit et le nouvel historique | Migrations |
| Limites d'envoi (SMS, email, connexion) ? | Connexion 10/min par adresse + verrou par compte ; codes SMS 10/h par adresse et 3 par numéro toutes les 10 minutes ; réservations 20/h ; formulaire d'aide 5/h | `DEFAULT_THROTTLE_RATES`, `accounts/views.py` |
| Simulation en développement ? | Sans compte Twilio, aucun SMS n'est envoyé (aucun coût) et le code s'affiche en développement ; emails affichés dans la console par défaut | `notifications/sms.py`, `EMAIL_BACKEND` |

## 9.6 Volet 5 — Robustesse et gestion des erreurs

| Question | Constat | Preuve / correctif |
|---|---|---|
| Base de données en panne ? | **Important** : page d'erreur brute | Corrigé : réponse 503 « Service momentanément indisponible. Réessayez dans quelques minutes. », détail dans les journaux (test dans `tests/test_query_counts.py`) |
| Service externe en panne (paiement, SMS, IA) ? | Délais d'attente sur chaque appel, erreurs capturées, message clair (502/503) ; SMS remis en file et réessayés | `payments/paydunya.py`, `notifications/sms.py`, `medical/ai_notes.py` |
| Message à l'écran ? | « Serveur injoignable. Vérifiez votre connexion. » sans réseau ; message du serveur sinon ; jamais d'erreur technique | `src/api/client.ts` |
| Validation des formulaires ? | Contrôles dans l'interface **et** sur le serveur (types, longueurs, choix autorisés, dates, téléphone, fichiers) ; le serveur ne fait jamais confiance à l'interface | `sunusante/api.py` (`get_str`, `get_int`, `get_choice`, `get_uuid`) |

## 9.7 Volet 6 — Oublis métier et cycle de vie d'un rendez-vous

| Question | Constat |
|---|---|
| Réserver pour un proche ? | Oui : enfants et parents enregistrés dans « Mes proches », choisis au moment de la réservation |
| Congés et absences du médecin ? | Oui : ils bloquent les créneaux en ligne, comme les occupations importées de son agenda personnel |
| Annulation tardive ? | Délai fixé par chaque médecin ; passé ce délai, l'annulation en ligne est fermée et le patient appelle le cabinet ; remboursement intégral d'un RDV payé ; le créneau libéré redevient réservable et la liste d'attente est prévenue |
| Traçabilité (qui a créé, modifié, annulé) ? | **Important**, corrigé : table `appointments_appointmentevent`, remplie automatiquement à chaque modification, quelle que soit son origine (patient, médecin, secrétariat, clinique, WhatsApp, USSD, tâches automatiques). Elle enregistre l'action, l'auteur, l'ancien et le nouvel horaire ou statut et le motif. Bouton « Historique » sur chaque RDV pour le patient, le médecin et le secrétariat. Test `tests/test_appointment_history.py` |

## 9.8 Volet 7 — Sessions et authentification avancée

| Question | Constat | Preuve / correctif |
|---|---|---|
| JWT ou sessions ? Où est le jeton ? | **Sessions Django côté serveur**, pas de JWT. Le navigateur ne garde qu'un identifiant de session dans un cookie `HttpOnly` (illisible par JavaScript, donc hors de portée d'une faille XSS), `Secure` (HTTPS seulement) et `SameSite=Lax`, avec jeton CSRF. Rien n'est stocké dans `localStorage` | `settings.py` |
| Révoquer tous les accès d'un compte ? | Oui, immédiatement : la session est en base, la supprimer coupe l'accès. Suspension par l'administration = toutes les sessions fermées ; changement ou réinitialisation du mot de passe = autres appareils déconnectés. **Ajouté** : bouton « Déconnecter mes autres appareils » (page Sécurité, tous les comptes) | `accounts/security.py` (`end_sessions`), `POST /api/auth/sessions/logout-others`, test `tests/test_audit_part2.py` |
| Mots de passe et double authentification ? | Mots de passe : 10 caractères minimum, refus des mots de passe courants, entièrement numériques ou proches de l'identité ; stockage haché (PBKDF2). **Double authentification (TOTP) obligatoire** pour médecins, pharmaciens, laboratoires, cliniques, secrétariat et administration ; déconnexion après 30 min d'inactivité ; alerte de connexion depuis un nouvel appareil | `accounts/security.py`, `AUTH_PASSWORD_VALIDATORS` |

## 9.9 Volet 8 — Vérification d'identité et annuaire

| Question | Constat |
|---|---|
| N'importe qui peut-il se déclarer médecin ? | Non. Une fiche médecin créée reste **invisible et non réservable** tant que l'administration ne l'a pas vérifiée (justificatif d'inscription à l'Ordre des médecins du Sénégal, n° d'Ordre) ; même règle pour pharmacies, laboratoires et cliniques. Nom et spécialité figés après vérification ; suspension = fiche retirée. (RPPS et Adeli sont des identifiants français ; l'équivalent sénégalais est le n° d'inscription à l'Ordre.) |
| Un médecin peut-il être patient d'un confrère ? | Oui : un seul compte, le rôle « médecin » s'ajoute au rôle « patient » sans conflit (rendez-vous et dossier patient d'un côté, agenda de l'autre). **Ajouté** : un médecin ne peut pas prendre rendez-vous avec lui-même (il bloque un horaire dans son agenda). Tests `tests/test_audit_part2.py` |

## 9.10 Volet 9 — Paiement, facturation et remboursements

| Question | Constat | Correctif |
|---|---|---|
| Empreinte bancaire et frais de non-présentation ? | Non applicable : au Sénégal le paiement se fait surtout par mobile money (Wave, Orange Money, Free Money via PayDunya) ou en espèces, sans pré-autorisation possible. Alternative en place : **prépaiement obligatoire** des téléconsultations au choix du médecin, et suivi des absences (statut « absent ») | Décision commerciale si besoin : prépaiement de certains motifs |
| Numérotation légale des reçus ? | **Important**, corrigé : les reçus portaient une référence aléatoire. Chaque encaissement (consultation ou abonnement) reçoit maintenant un **numéro continu, sans trou ni doublon**, par année (`FJ-2026-000001`), attribué au passage à « payé » sous verrou de base de données ; les paiements déjà encaissés ont été numérotés dans l'ordre chronologique ; numéro imprimé sur le reçu PDF | `payments/models.py` (`ReceiptCounter`), test `tests/test_audit_part2.py` |
| Remboursement automatique si le médecin annule ? | Oui pour la décision : toute annulation d'un RDV payé en ligne (patient, médecin, secrétariat) crée automatiquement le remboursement intégral. Le versement lui-même est fait par l'administration (PayDunya ne propose pas encore de remboursement automatique par API) | `payments/ledger.py` (`open_refund`) |

## 9.11 Volet 10 — Communications, rappels et anti-spam

| Question | Constat | Correctif |
|---|---|---|
| Statuts d'échec Twilio ? | Webhook `twilio-status` authentifié : le statut du SMS est mis à jour en base (livré, échec et code) en une requête, sans bloquer le serveur ; les envois partent d'une file de tâches | `notifications/views.py` |
| Réponse « STOP » ? | **Important**, corrigé : rien n'était prévu. Désormais STOP / ARRÊT par SMS (nouveau webhook `twilio-inbound`) ou sur WhatsApp désinscrit le numéro ; un numéro que Twilio signale désinscrit (code 21610) l'est aussi ; plus aucun SMS automatique ensuite (rappels, alertes), seuls les codes de connexion demandés par la personne partent encore ; START réactive | `notifications/optout.py`, table `notifications_smsoptout`, tests |
| Rappels envoyés plusieurs fois si le script plante ? | **Important**, corrigé : un rappel est désormais « réservé » (statut « en cours d'envoi ») avant l'appel à Twilio ; deux exécutions simultanées ne peuvent pas envoyer le même rappel, et un envoi interrompu n'est jamais renvoyé (mieux vaut un rappel manquant qu'un doublon). Un seul rappel par RDV et par type (contrainte en base) | `send_reminders.py`, tests |

## 9.12 Volet 11 — Confidentialité et RGPD santé

| Question | Constat | Correctif |
|---|---|---|
| Contenu des SMS sur l'écran verrouillé ? | Neutre : « rendez-vous avec Dr X, date, au cabinet / en vidéo ». Jamais la spécialité, le motif ou un résultat ; « résultats déposés dans votre dossier » sans contenu | `notifications/sms.py` |
| Export des données en un clic ? | Oui : export complet en JSON (compte, proches, rendez-vous, paiements, comptes-rendus…) et dossier médical en PDF, depuis « Mon dossier » | `GET /api/auth/export`, `GET /api/patient/medical-record` |
| Purge des comptes inactifs ? | **Important**, corrigé : seules les données techniques étaient purgées. Ajout d'une purge des comptes patients sans connexion ni rendez-vous depuis N jours : **préavis par email**, puis anonymisation 30 jours plus tard si la personne ne s'est pas reconnectée (comptes-rendus conservés chez le médecin). **Désactivée par défaut** (`RETENTION_INACTIVE_ACCOUNT_DAYS=0`) tant que la durée n'est pas fixée avec un juriste et la CDP ⚖️ | `accounts/erasure.py`, `purge_data`, tests |

## 9.13 Volet 12 — Fichiers joints

| Question | Constat |
|---|---|
| Stockage chiffré, accès temporaire ? | Chaque fichier est **chiffré sur le disque** (Fernet, clé hors du serveur de fichiers), stocké hors du dossier public et servi uniquement par une route qui vérifie à chaque téléchargement la session et le droit d'accès (patient, médecin à qui le document est partagé) et journalise la consultation : il n'existe aucun lien public, donc rien à signer ni à faire expirer |
| Exécutables, taille ? | Type réel lu dans le contenu du fichier (pas l'extension) : seuls PDF, JPEG, PNG et WebP sont acceptés (un `.exe` ou un `.sh` renommé est refusé) ; 6 Mo maximum ; analyse antivirus ClamAV avant stockage |

## 9.14 Volet 13 — Accessibilité et écrans

Contrôle automatique **axe-core (WCAG 2.1 A et AA)** sur 9 pages clés (accueil, recherche, connexion, espace
patient, dossier, espace médecin et agenda, clinique, administration), en thème clair et en thème sombre, et
contrôle de mise en page sur portable 13" (1280 × 800), tablette (1024 × 768) et tablette portrait (768 × 1024).

| Constat | Correctif |
|---|---|
| **Important** : contrastes insuffisants (texte blanc sur le vert en mode sombre 3,8:1 ; textes gris secondaires 3 à 4,2:1 ; petits libellés verts sur fond vert pâle 4,2:1) | Vert du mode sombre éclairci et texte foncé sur les boutons colorés (7:1) ; opacité minimale des textes secondaires ; nuances de texte légèrement plus foncées du vert et du turquoise (les boutons gardent le vert du drapeau). Résultat : **0 violation** sur les 9 pages, dans les deux thèmes |
| 5 listes déroulantes de l'espace clinique sans nom pour les lecteurs d'écran | Libellés ajoutés |
| Accueil en tablette portrait : barre de navigation plus large que l'écran (198 px) | Menu complet à partir de 1024 px ; aucun débordement sur les 8 pages × 3 tailles |
| Agenda | Utilisable au clavier et au toucher ; boutons d'action nommés ; couleurs des motifs validées pour les daltoniens, avec texte (jamais la couleur seule) |

## 9.15 Volet 14 — Journaux et supervision

| Question | Constat | Correctif |
|---|---|---|
| Traçabilité des actions sensibles ? | Journal d'audit inaltérable : horodatage, identifiant de l'utilisateur, adresse IP, navigateur, pour chaque consultation de fiche patient, document, ordonnance, export, connexion (et échec), action d'administration ; historique de chaque rendez-vous (création, déplacement, annulation et auteur). Les journaux techniques ne contiennent ni nom ni contenu médical (identifiants seulement, numéros de téléphone masqués) | `audit/`, `appointments/history.py` |
| Route `/api/health` ? | Existait (base de données seulement). **Ajouté** : détail de chaque composant (base, antivirus, rappels en retard, échecs SMS, sauvegarde, disque, SMS et paiement configurés) pour l'équipe Fajma connectée ou la supervision externe munie du jeton `HEALTH_TOKEN` ; le public ne voit que `{"status": "ok"}` | `sunusante/views.py`, test |

## 9.16 Volet 15 — Ingénierie et architecture

| Question | Constat | Correctif |
|---|---|---|
| Validation stricte des entrées ? | Chaque route lit ses champs avec des fonctions de validation typées (`get_str`, `get_int`, `get_uuid`, `get_choice` : longueurs, bornes, listes de valeurs autorisées) plutôt qu'un schéma Pydantic ; le serveur ne fait jamais confiance au navigateur (prix, durées, droits recalculés). JSON corrompu ou type invalide : réponse 400 propre, jamais d'erreur 500 | Test « JSON corrompu » ajouté |
| Idempotence ? | Paiement : un même RDV réutilise le même paiement (jamais deux encaissements) ; webhooks Twilio, WhatsApp, USSD et PayDunya rejoués sans effet ; double réservation impossible (contrainte en base). **Ajouté** : une réservation renvoyée après une coupure réseau (réponse perdue) retrouve le RDV déjà créé au lieu d'afficher une erreur | `appointments/views.py`, test |
| Transactions ? | Opérations sur plusieurs tables (réservation, séries, paiement et journal comptable, suppression de compte, purge) dans des transactions atomiques, annulées en entier en cas d'échec ; SMS et emails envoyés seulement après validation de la transaction | `transaction.atomic`, `on_commit` |
| Connexions à la base ? | Connexions réutilisées 60 s avec contrôle de validité. **Corrigé** : le flux temps réel gardait une connexion ouverte par fil d'exécution (risque d'épuisement avec beaucoup de navigateurs connectés) ; il rend désormais la connexion après chaque lecture. PostgreSQL réglé à 200 connexions (API 3 × 8 fils, flux, tâches : large marge) | `notifications/stream.py`, `docker-compose.yml` |
| Tâches lentes ? | SMS, emails et notifications passent par une file de tâches traitée par un service à part (`worker`) ; les PDF (ordonnances, reçus, dossier, rapports) sont fabriqués dans le navigateur, sans charge pour le serveur ; le flux temps réel tourne sur un serveur asynchrone séparé | `TASK_BACKEND`, service `events` |
| En-têtes de sécurité et CORS ? | nginx : CSP stricte (empreintes des scripts, sans `unsafe-inline` pour les scripts), HSTS 1 an, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` ; Django ajoute redirection HTTPS et cookies sécurisés. Aucun CORS ouvert : l'API ne répond qu'au site lui-même (même origine) | `deploy/security-headers.conf` |

## 9.17 Recette de l'interface (version de production)

La version compilée pour la production, servie comme en ligne, a été parcourue page par page : 19 pages publiques
(dont page inconnue, lien de vérification invalide, fiche d'urgence invalide) et toutes les pages des 7 rôles
(patient, médecin et ses 7 onglets, secrétariat, clinique, pharmacie, laboratoire, administration), sur téléphone
(375 px) et sur ordinateur (1366 px), soit 78 affichages. Relevés : erreurs JavaScript et console, appels à l'API
en échec, débordement horizontal, page vide, texte non traduit, poids du JavaScript chargé.

| Constat | Gravité | Correctif |
|---|---|---|
| Page blanche au rechargement répété d'une page de l'espace connecté (7 fois sur 16) : le flux temps réel, ouvert dès le démarrage, occupait des connexions dont le navigateur avait besoin pour charger un morceau de l'application (limite de 6 connexions par site en HTTP/1.1) | **Important** | Flux ouvert 2,5 s après l'affichage et fermé explicitement au départ de la page : 0 page blanche sur 30 rechargements ; alerte de nouveau message toujours reçue en temps réel. Recommandation : HTTP/2 sur le point d'entrée HTTPS |
| Page « introuvable » (404) : erreur React #418 au premier chargement | Mineur | Page 404 rendue comme une page ordinaire (route attrape-tout), titre et `noindex` |
| Retour de paiement ouvert sans référence : erreur technique dans la console | Mineur | Message « Paiement introuvable » avec lien vers l'espace |
| Débordements sur téléphone (recherche de médecins, agenda du médecin, aperçu des créneaux) | Mineur | Mises en page corrigées |
| Poids : la bibliothèque PDF et celle des graphiques étaient chargées à l'ouverture des pages, même sans téléchargement | Important (réseau 3G) | Chargées seulement au clic ou à l'affichage d'une courbe : dossier patient 483 → 309 Ko, espace médecin 413 → 238 Ko (JavaScript compressé) ; accueil 172 Ko |

Autres contrôles : compilation de production sans erreur, aucune faille connue dans les bibliothèques
(`npm audit`), typage TypeScript sans erreur, traductions complètes (246 textes en français, wolof et anglais pour
les pages publiques ; espaces professionnels en français). Résultat final : **0 problème sur les 78 affichages**.

## 9.18 Vérifications après correction

- 276 tests automatisés de l'API, tous au vert (SQLite ; PostgreSQL en intégration continue).
- Typage TypeScript et analyse ESLint sans erreur ; 0 violation d'accessibilité WCAG AA sur les 9 pages contrôlées ;
  recette de l'interface de production : 0 problème sur 78 affichages (§ 9.17).
- Points restant hors code : test d'intrusion par un prestataire externe, test de charge, durées légales de
  conservation (comptes inactifs, données médicales) à fixer ⚖️ (voir [chapitre 5](05-risques-et-plan-action.md)).
