# 9. Audit global du code (5 octobre 2026)

Audit critique de l'ensemble du projet (interface, serveur, base de données, configuration) sur six volets.
Chaque point a été vérifié dans le code et, quand c'est possible, par un test automatique ajouté à la suite.
Les problèmes sont classés par gravité : **Bloquant** (à corriger avant toute mise en ligne), **Important**
(risque réel en exploitation), **Mineur** (sans conséquence pour les utilisateurs). Tous les problèmes
bloquants et importants relevés ont été corrigés (version 3.2 du dossier).

## 9.1 Synthèse

| Gravité | Problème | Volet | État |
|---|---|---|---|
| Bloquant | Le serveur de production démarrait en mode développement si le réglage `DJANGO_DEBUG` était oublié (pages de débogage, accès démo sans mot de passe) | 1, 3 | Corrigé |
| Important | Force brute répartie : la limite de connexion était comptée par adresse IP seulement | 1, 4 | Corrigé |
| Important | Recherche de médecins : environ 6 requêtes SQL par médecin affiché (« N+1 ») | 4 | Corrigé |
| Important | Base de données injoignable : page d'erreur brute au lieu d'un message clair | 5 | Corrigé |
| Important | Aucun historique des rendez-vous : auteur précis d'une annulation et ancien horaire d'un déplacement perdus | 6 | Corrigé |
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

## 9.8 Vérifications après correction

- 263 tests automatisés de l'API, tous au vert (SQLite ; PostgreSQL en intégration continue).
- Typage TypeScript et analyse ESLint sans erreur.
- Points restant hors code : test d'intrusion par un prestataire externe, test de charge (voir [chapitre 5](05-risques-et-plan-action.md)).
