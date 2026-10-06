# 2. Sécurité

## 2.1 Principes

1. **Le serveur décide** : chaque requête est authentifiée et chaque accès à une donnée est vérifié par
   l'API Django, quel que soit ce qu'affiche l'interface.
2. **Le navigateur n'est jamais cru sur parole** : prix, durées, statuts, parts d'assurance, rôles, statuts de
   paiement et types de fichiers sont déterminés ou contrôlés par le serveur.
3. **Moindre accès aux données de santé** : un professionnel ne voit que ce qui lui est nécessaire, pour une
   durée et un périmètre définis (§ 2.4), et chaque consultation est tracée.
4. **Traçabilité inaltérable** : journal d'audit et journal comptable ne peuvent être ni modifiés ni supprimés
   par l'application.
5. **Validation systématique des entrées** : types, longueurs, formats, UUID, listes de valeurs autorisées.

## 2.2 Authentification

| Élément | Implémentation |
|---|---|
| Méthodes | Téléphone + code SMS à 6 chiffres (méthode par défaut) ; email + mot de passe |
| Mots de passe | 10 caractères minimum, validateurs Django (mots courants, similarité), hachage PBKDF2-SHA256 |
| Codes SMS | Stockés sous forme d'empreinte, 10 minutes de validité, 5 essais, 3 envois par 10 minutes et par numéro |
| Double authentification | TOTP (applications d'authentification), codes de secours à usage unique (empreintes), anti-rejeu du même code. **Obligatoire** pour tout compte professionnel (médecin, pharmacien, clinique, secrétariat, administrateur) : tant qu'elle n'est pas activée, l'API refuse tout sauf les routes de compte (`accounts/security.py`). La connexion par mot de passe seul de `/django-admin/` est supprimée. L'administration peut la réinitialiser (téléphone perdu), action journalisée |
| Comptes | Changement de mot de passe (déconnexion des autres appareils, email d'alerte) ; suspension d'un compte par l'administration (sessions coupées, fiche médecin retirée de l'annuaire), journalisée avec son motif |
| Session | Cookie HttpOnly, `Secure` en production, `SameSite=Lax`, 14 jours ; protection CSRF (jeton en en-tête). **Comptes professionnels : fermée après 30 minutes sans activité de l'utilisateur** (`PRO_IDLE_MINUTES`, `IdleTimeoutMiddleware`) ; les rafraîchissements automatiques de l'écran ne comptent pas (l'application transmet le temps écoulé depuis le dernier clic ou la dernière frappe) ; retour à la connexion puis à la page en cours |
| Nouvel appareil | Chaque navigateur reçoit un jeton aléatoire (cookie HttpOnly, conservé haché en base, oublié après 2 ans sans usage). Une connexion depuis un navigateur jamais utilisé par le compte déclenche une alerte au titulaire (email, ou SMS s'il n'a pas d'email) : vol de mot de passe, de session ou de puce téléphonique (« SIM swap ») repéré immédiatement |
| Réinitialisation | Lien signé à usage unique envoyé par email ; réponse identique que le compte existe ou non |
| Canaux sans application | WhatsApp : signature Twilio vérifiée ; USSD : secret partagé avec l'agrégateur. Le numéro, garanti par l'opérateur, identifie le patient ; seuls les comptes au numéro vérifié sont utilisés |

## 2.3 Rôles

| Rôle | Attribution |
|---|---|
| Patient | Inscription |
| Médecin | Fiche créée dans l'espace pro ; **publiée seulement après validation par l'administration d'une preuve d'inscription à l'Ordre** |
| Responsable / secrétariat de clinique | Création d'un établissement / ajout par le responsable |
| Secrétaire d'un médecin seul | Ajoutée par le médecin (« Mon secrétariat ») ; cabinet créé en coulisses, mêmes droits qu'un secrétariat de clinique |
| Médecin remplaçant | Proposé par le titulaire, accepté par le remplaçant (médecin vérifié) ; droits limités à la période et aux patients concernés |
| Pharmacien | Rattachement à une officine par l'administration, après vérification |
| Laboratoire d'analyses | Rattachement à un laboratoire par l'administration, après vérification ; ne voit que les prescriptions que les patients lui ont envoyées |
| Administrateur | Attribution manuelle (compte `is_staff`) ; peut suspendre un compte (sessions coupées) |

Tous les rôles autres que « patient » exigent la double authentification (§ 2.2).

## 2.4 Matrice des droits (données sensibles)

| Donnée | Patient | Médecin | Clinique | Pharmacien | Confrère (télé-expertise) |
|---|---|---|---|---|---|
| Profil de santé | Lecture / écriture | Si RDV confirmé ou terminé avec lui | — | — | Si joint à une demande, patient informé |
| Documents déposés | Tous les siens | Seulement ceux que le patient lui a partagés, et s'il le suit | — | — | Seulement ceux joints à la demande |
| Comptes-rendus, notes privées | Comptes-rendus | Les siens | — | — | — |
| Ordonnance | Les siennes | Celles qu'il a rédigées | — | Uniquement celle transmise à son officine, tant qu'elle est en cours | — |
| Carnet de vaccination | Le sien et celui de ses enfants | Inscription d'une dose lors d'un RDV confirmé | — | — | — |
| RDV | Les siens | Son agenda | Agenda de ses médecins | — | — |
| Entraide familiale | — | Le bénéficiaire voit qui l'aide et retire chaque droit à tout moment | Le proche aidant : rendez-vous et paiements ; comptes-rendus et ordonnances seulement si le bénéficiaire l'a accepté (chaque consultation journalisée, visible du patient) | — | — |
| Ticket d'hôpital | — | Les siens (et toute personne qui a le lien du SMS : code de 10 caractères non devinable) | — | Accueil de l'établissement : nom et 4 derniers chiffres du téléphone seulement ; écran de salle : numéros seuls | Établissements et personnel |
| Adresse email du compte | — | La sienne (changement confirmé par un lien envoyé à la nouvelle adresse, mot de passe demandé, ancienne adresse prévenue, journalisé) | — | — | — |
| Justificatifs (médecin, clinique, pharmacie, laboratoire) | — | Les siens | — | Le responsable de la clinique, les membres de la pharmacie ou du laboratoire, pour leur établissement | — (administration seulement ; chaque ouverture de fichier journalisée) |
| Fiche d'urgence (QR code) | Activation et choix des informations | — | — | — | Toute personne qui scanne le QR code : nom, âge et seulement les informations choisies ; consultation journalisée, patient prévenu |
| Demande de renouvellement | Les siennes | Celles adressées à lui (médecin prescripteur) | — | — | — |
| Dossier médical complet (export PDF) | Le sien et celui de ses proches, à la demande (journalisé) | — | — | — | — |
| Réponses au questionnaire | Les siennes (facultatives) | Celles des RDV de son agenda | — | — | — |

**Médecin remplaçant** : pendant la période du remplacement (de la veille jusqu'à 30 jours après la fin), il
voit les RDV qu'il assure, les comptes-rendus et ordonnances du titulaire pour les patients qu'il reçoit, et
les documents que ces patients ont partagés avec le titulaire ; jamais les notes privées du titulaire. Il signe
ses documents à son nom et à son numéro d'Ordre, avec la mention « remplaçant du Dr X ». Le titulaire voit ce
que son remplaçant a rédigé pour ses patients.

**Laboratoire** : nom, âge, sexe et téléphone du patient, analyses demandées et médecin prescripteur, pour les seules
prescriptions que le patient lui a adressées ; dépose les résultats (type réel contrôlé) mais ne lit pas le reste du
dossier ; consultation journalisée. **Pharmacie (disponibilité d'un médicament)** : nom du médicament seulement,
jamais l'identité du patient. **Mesures à domicile** : mêmes règles que le profil de santé (médecin avec RDV
confirmé ou terminé).
**Alertes de mesures** : une mesure dangereuse (ou élevée 3 fois en 7 jours) est signalée aux médecins qui ont déjà accès aux mesures (RDV confirmé ou terminé depuis moins d'un an), 3 au plus, une fois par 24 h ; le patient peut les désactiver.

**Secrétariat** (clinique ou cabinet) : agenda, prise de RDV, fichier patients (noms, téléphones) ; aucun accès
aux dossiers médicaux, comptes-rendus, ordonnances ni documents.

Chaque règle ci-dessus est couverte par au moins un test automatisé qui tente l'accès interdit.

## 2.5 Protections techniques

| Menace | Protection |
|---|---|
| Double réservation | Verrou transactionnel et **contrainte d'exclusion PostgreSQL** sur les plages horaires |
| Manipulation des prix ou des parts d'assurance | Calcul serveur ; valeurs figées sur le RDV à la réservation |
| Faux paiement | Statut relu auprès de PayDunya ; montant contrôlé ; écritures comptables idempotentes |
| Double virement, double remboursement | Verrous en base ; une seule demande de virement en cours ; une seule écriture par paiement |
| Fichier piégé (HTML/SVG déguisé) | Type réel déterminé par le contenu (PDF, JPEG, PNG, WebP uniquement), 6 Mo maximum, stockage hors du dossier public, service avec `Content-Security-Policy: sandbox` et `nosniff` |
| Virus dans un fichier déposé | Analyse antivirus **ClamAV** (service `clamav`, signatures mises à jour automatiquement) de chaque fichier avant stockage : documents, résultats d'analyses, pièces jointes, justificatifs, photos, signatures. Fichier infecté refusé ; antivirus injoignable = dépôt refusé (jamais de fichier non inspecté) et alerte de supervision |
| Vol du disque, d'un volume ou d'une sauvegarde | **Chiffrement de chaque fichier sur le disque** (Fernet : AES-128-CBC + HMAC-SHA256, `sunusante/uploads.py`) avec une clé (`FILE_ENCRYPTION_KEYS`) conservée hors du serveur de fichiers et hors des sauvegardes ; fichier altéré refusé ; rotation de clé sans coupure (`encrypt_files --rotate`) |
| Poste de cabinet ou de clinique laissé ouvert | Déconnexion automatique des comptes professionnels après 30 minutes sans activité |
| Formulaire de contact détourné (spam, saturation) | Limite de 5 demandes par heure et par adresse, champ piège anti-robots, contrôle du format du contact ; message d'avertissement contre la saisie d'informations médicales détaillées |
| Données de santé envoyées à l'IA / « hallucinations » | Assistant de notes : seul le texte des notes part (jamais l'identité du patient), uniquement sur demande du médecin, journalisé ; consigne de ne rien inventer (ni diagnostic, ni médicament, ni dose) ; brouillon toujours relu et validé par le médecin avant enregistrement ; désactivable (`AI_NOTES_ENABLED`) |
| Déplacement de RDV par glisser-déposer | Même contrôle serveur qu'un déplacement classique (créneau libre, pas dans le passé), confirmation avant envoi, patient prévenu |
| Fiche d'urgence consultée par un tiers | Désactivée par défaut ; lien à jeton aléatoire de 256 bits, révocable (« nouveau lien ») ; informations choisies par le patient ; page non indexée, sans référent ; limite de débit ; chaque consultation journalisée et signalée au patient (une fois par jour) |
| Renouvellement d'ordonnance abusif | Uniquement par le médecin prescripteur, ordonnance de moins d'un an, une demande en cours à la fois ; refus motivé obligatoire ; nouvelle ordonnance avec en-tête et signature à jour (mentions obligatoires vérifiées), journalisée |
| Faille connue dans une bibliothèque | Contrôle automatique à chaque modification : `npm audit` (interface) et `pip-audit` (serveur) dans l'intégration continue |
| Script injecté (XSS) | React échappe les contenus ; CSP stricte sans `unsafe-inline` pour les scripts (empreintes calculées au build) ; cookie de session inaccessible au JavaScript |
| Clic détourné (clickjacking) | `frame-ancestors 'none'` et `X-Frame-Options: DENY`, sauf le module de réservation intégrable, qui ne contient ni connexion ni paiement |
| Abus et force brute | Limites de débit : connexion 10/min, codes SMS 10/h, réservations 20/h, assistant IA 15/min, recherches publiques 30/min ; **verrou par compte** : après 10 mots de passe faux en 15 minutes sur un même email (même depuis des adresses différentes), connexion refusée pendant 15 minutes ; codes SMS limités à 3 par numéro et par 10 minutes |
| Serveur de production lancé en mode développement | Sans réglage, le mode développement (pages de débogage, accès démo) n'est actif que pour les commandes `manage.py` sur un poste ; le serveur de production (gunicorn) démarre toujours en mode sécurisé et docker-compose impose `DJANGO_DEBUG=false` |
| Copie de la base ou d'une sauvegarde volée | Fichiers chiffrés, **secrets de double authentification chiffrés** (même clé `FILE_ENCRYPTION_KEYS`, conservée hors de la base et des sauvegardes) : la base seule ne permet ni de lire les documents ni de générer les codes des professionnels ; mots de passe et codes de secours hachés |
| Suppression accidentelle (console technique, intervention manuelle) | Rendez-vous, comptes-rendus, ordonnances, certificats, analyses, messages, notes et paiements **protégés** : la suppression d'un compte ou d'une fiche médecin qui en possède est refusée par l'application (les comptes sont anonymisés, jamais effacés) |
| Contestation d'un rendez-vous (« je n'ai jamais annulé ») | Historique inaltérable de chaque rendez-vous : auteur, date, ancien et nouvel horaire, motif d'annulation |
| Messages répétés par Twilio ou l'opérateur USSD | Réponse mémorisée par identifiant de message / saisie : aucune double réservation |
| Sondage d'annuaire | La recherche de doublons en clinique ne révèle jamais l'existence d'un compte pour une personne inconnue de la clinique |
| Faux documents médicaux | Référence aléatoire vérifiable publiquement ; la vérification n'affiche ni contenu médical ni identité complète |
| Interception | HTTPS obligatoire (HSTS un an) ; redirection HTTP → HTTPS |
| Requête forgée vers le réseau interne (SSRF) via l'import d'agenda | HTTPS seulement ; résolution DNS vérifiée (adresses privées, locales, réservées refusées), à chaque redirection ; taille et durée limitées |
| Fuite de l'agenda exporté | Lien à jeton aléatoire (256 bits), révocable ; initiales et motif seulement, sans téléphone ni motif libre |
| Données hors ligne sur un téléphone partagé | Données personnelles effacées du cache à la déconnexion ; aucune écriture hors ligne |
| Vol du mot de passe d'un professionnel | Double authentification obligatoire ; la console technique `/django-admin/` n'a plus de connexion par mot de passe seul |
| Compte compromis ou professionnel radié | Suspension immédiate par l'administration : sessions supprimées sur tous les appareils, fiche retirée de l'annuaire, republication soumise à une nouvelle validation |
| Usurpation d'identité d'un médecin vérifié | Nom et spécialité non modifiables en ligne après vérification |
| Pièce jointe piégée dans la messagerie | Même contrôle que les documents médicaux (type réel, 6 Mo, service en bac à sable) ; lecture réservée au patient et au médecin du fil, lecture par le médecin journalisée |
| Fuite par export tableur | Exports limités aux données du médecin ou de l'établissement, période d'un an au plus, journalisés (qui, quoi, quelle période) |
| Photo de profil piégée | Type réel contrôlé (JPEG, PNG, WebP), 2 Mo maximum, servie avec la même politique « bac à sable » que les documents |

## 2.6 Journal d'audit

Inscrits dans une table inaltérable : connexions et échecs, activation/désactivation de la 2FA, changements de
mot de passe, consultation d'une fiche patient, d'un document, d'une ordonnance (y compris par une pharmacie, un
confrère ou un remplaçant), rédaction de comptes-rendus et certificats, modification d'une fiche médecin ou d'une
officine, exports et suppressions de compte, actions d'administration (validations, virements, remboursements,
modération, consultation des justificatifs, recherches de comptes, suspensions, réinitialisations de 2FA, avec
leur motif). Le patient voit dans son dossier qui a consulté ses données ; l'administration voit l'ensemble.
Conservation du journal : 5 ans par défaut (réglable, à valider ⚖️).

## 2.7 Secrets et configuration

Aucun secret dans le code source. Les clés (Django, base, PayDunya, Twilio, USSD, VAPID, IA, SMTP, Sentry) sont
lues dans des variables d'environnement (`deploy/.env`, non versionné). En production, Django refuse de démarrer
sans clé secrète ni clé de chiffrement des fichiers (`FILE_ENCRYPTION_KEYS`, à garder aussi dans un coffre hors
du serveur : sans elle, documents et sauvegardes sont illisibles), active les cookies sécurisés, HSTS et la redirection HTTPS ; `manage.py check --deploy` est
exécuté par l'intégration continue.

## 2.8 Tests de sécurité réalisés

- **329 tests automatisés de l'API**, dont les tentatives d'accès interdites de la matrice § 2.4 (y compris
  pour un remplaçant, une secrétaire, un médecin sans lien avec le patient), les manipulations de prix et de
  parts, les fichiers piégés, les doubles réservations, les webhooks non signés, les secrets USSD invalides, la
  réutilisation de session USSD par un autre numéro, les doubles notifications de paiement, le blocage des
  professionnels sans double authentification, la suspension de compte (sessions coupées), le chiffrement des fichiers sur le disque (et le refus d'un
  fichier altéré), le refus d'un fichier infecté ou non analysable, la déconnexion après inactivité (sans
  prolongation par les rafraîchissements automatiques) et l'alerte de connexion depuis un nouvel appareil.
- **Balayage des accès croisés** (`tests/test_idor_sweep.py`) : un autre patient, un autre médecin et un visiteur
  tentent une quarantaine de routes sur les données d'autrui (RDV, documents, ordonnances, paiements, proches,
  mesures, analyses, renouvellements, assurances) : toutes refusées, rien n'est modifié.
- **Double réservation simultanée** : sous PostgreSQL, la contrainte d'exclusion refuse en base deux rendez-vous
  qui se chevauchent même si les contrôles applicatifs sont contournés (`tests/test_overlap_constraint.py`).
- **Parcours de bout en bout** dans un navigateur réel pour chaque rôle, sur ordinateur et mobile, dont le mode
  hors ligne et l'effacement des données à la déconnexion sur le build de production, et l'activation imposée de
  la double authentification.
- **Failles corrigées pendant les audits** :
  - le type de fichier annoncé par le navigateur était accepté tel quel pour les documents médicaux (page HTML
    exécutable au nom du site) : type désormais déterminé par le contenu, fichiers servis dans un bac à sable ;
  - la console technique `/django-admin/` permettait une connexion par mot de passe seul, contournant la double
    authentification : elle passe désormais par la connexion Fajma ;
  - l'ajout en double d'un membre de secrétariat provoquait une erreur serveur : contrôle préalable.

**À faire** : test d'intrusion externe, revue de la configuration de l'hébergement réel.
