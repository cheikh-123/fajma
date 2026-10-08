# 5. Risques ouverts et plan d'action

Gravité : 🔴 bloquant pour la commercialisation · 🟠 à traiter avant la montée en charge · 🟡 amélioration.
⚖️ : volet juridique ou réglementaire.

## 5.1 Registre des risques

| Réf. | Gravité | Risque | Action recommandée |
|---|---|---|---|
| R-01 | 🔴 ⚖️ | Pas encore d'autorisation CDP pour le traitement de données de santé | Constituer et déposer le dossier (ce dossier technique en fournit la matière) |
| R-02 | 🔴 ⚖️ | Transferts hors du Sénégal (§ 3.3) non encore encadrés | Hébergement au Sénégal ; contrats et autorisations pour les flux restants |
| R-03 | 🔴 | Téléconsultation sur le serveur public `meet.jit.si` | Instance Jitsi auto-hébergée (paramètre `JITSI_DOMAIN`) ou service contractualisé |
| R-04 | 🔴 ⚖️ | CGU, politique de confidentialité et contrats (médecins, cliniques, pharmacies, organismes d'assurance) à l'état de projet | Rédaction et validation juridique ; conventions de tiers payant |
| R-05 | 🔴 ⚖️ | Encaissement pour le compte des médecins et commission : qualification juridique | Avis juridique ; convention avec PayDunya |
| R-06 | 🔴 | Aucun test d'intrusion externe | Test d'intrusion sur l'environnement de recette avant ouverture |
| R-07 | 🟠 | Virements aux médecins et remboursements exécutés manuellement par l'administration (le suivi est automatisé, pas le transfert) | API de décaissement (PayDunya Disburse, Wave Business) après validation juridique |
| R-08 | 🟠 | Calendrier vaccinal PEV et rythme des consultations prénatales non validés par une autorité sanitaire | Validation par la Direction de la Prévention ; mise à jour de `backend/carnet/schedules.py` |
| R-09 | 🟠 | Textes wolof non relus par un locuteur natif | Relecture par un traducteur médical (`src/lib/i18n/wo.ts`, `backend/bots/texts.py`, SMS) |
| R-11 | 🟠 | WhatsApp : Meta exige des modèles approuvés pour un premier message | Faire approuver les modèles ; repli SMS automatique en attendant |
| R-12 | 🟠 ⚖️ | Durées de conservation des données médicales non fixées | Fait : purge nocturne des données techniques (`purge_data`). Reste : fixer avec un juriste les durées médicales et celles du journal (5 ans par défaut) |
| R-13 | ✅ | ~~Double authentification facultative pour les professionnels~~ | Traité le 30/09/2026 : obligatoire pour médecins, cliniques, secrétariats, pharmaciens et administrateurs (`MFA_REQUIRED_FOR_PROS`) ; la console `/django-admin/` passe par la même connexion |
| R-14 | 🟠 | Surveillance externe à abonner | Fait : supervision interne avec alertes email (`monitor`, dont alerte si aucun test de restauration réussi depuis 35 jours), test de restauration mensuel automatique ; sauvegarde et restauration exécutées et vérifiées sur PostgreSQL réel (copie identique, § 4.5) ; `/api/health` détaillé avec `HEALTH_TOKEN`. Reste : créer le moniteur externe sur `/api/health`, renseigner `ALERT_EMAILS` et `HEALTH_TOKEN`, refaire le test sur le serveur cible |
| R-15 | 🟡 | Temps réel par interrogation de la base toutes les 2 s (suffisant jusqu'à quelques milliers de connectés) | Passer à PostgreSQL LISTEN/NOTIFY ou Redis au-delà |
| R-16 | 🟡 | Calcul des prochains créneaux à chaque recherche | Mise en cache au-delà de quelques centaines de médecins |
| R-17 | 🟡 | Autres langues nationales (pulaar, sérère, diola…) | Ajouter un fichier de traduction par langue, avec des traducteurs natifs |
| R-18 | 🟡 | Données restées sur l'ancienne plateforme du prototype | Décider de leur reprise (script d'import) ou de leur suppression, puis fermer les anciens comptes |
| R-19 | 🟠 ⚖️ | Assistant IA de prise de notes : texte de consultation envoyé à un fournisseur d'IA hors Sénégal | Autorisation CDP et contrat avec le fournisseur (ou IA hébergée au Sénégal) avant d'activer en production ; sinon `AI_NOTES_ENABLED=false` (mise en forme locale sans IA) |

## 5.2 Plan d'action proposé

**Avant tout lancement commercial** : R-01 à R-06 ; hébergement de production au Sénégal, HTTPS, sauvegardes
chiffrées testées ; contrats Twilio, agrégateur USSD et PayDunya en production.

**Dans les 3 mois suivant le lancement** : R-07, R-08, R-09, R-11, R-12, R-14.

**Amélioration continue** : R-15 à R-18.

## 5.3 Risques traités depuis la version 1 du dossier

Contrôle d'accès appliqué par le serveur et testé ; journal d'audit visible par le patient ; accès des médecins
aux documents limité au partage explicite ; double authentification ; connexion par code SMS ; limites de débit ;
en-têtes de sécurité et CSP stricte ; cookies HttpOnly ; mots de passe de 10 caractères ; export et suppression
du compte ; reversement aux médecins, commission et remboursements ; tests automatisés et intégration continue ;
déploiement reproductible ; contrôle du type réel des fichiers déposés ; chiffres de la page d'accueil issus de
la base (plus d'allégations écrites en dur) ; code et données indépendants de toute plateforme propriétaire.

Depuis la version 2.0 : double authentification obligatoire pour tous les professionnels et administrateurs
(R-13) ; suppression de la connexion par mot de passe seul de la console technique ; suspension de comptes ;
purge nocturne des données techniques (R-12, partie technique) ; supervision avec alertes et test de
restauration mensuel automatique (R-14, partie technique).

Version 2.4 : chiffrement des fichiers sur le disque par l'application ; antivirus sur tous les fichiers
déposés ; déconnexion des professionnels après 30 minutes d'inactivité ; alerte de connexion depuis un nouvel
appareil (y compris contre le vol de puce) ; contrôle automatique des failles connues des bibliothèques serveur.
