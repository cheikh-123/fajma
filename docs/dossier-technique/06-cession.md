# 6. Informations pour une cession (due diligence)

Ce chapitre rassemble ce qu'un acquéreur ou un investisseur vérifie en priorité. Les points ⚖️ relèvent d'un
juriste ; les montants sont des ordres de grandeur à confirmer par devis.

## 6.1 Propriété et actifs cédés

| Actif | Contenu | Point à vérifier |
|---|---|---|
| Code source | Backend Django, frontend React, scripts de déploiement, tests, ce dossier | ⚖️ Chaîne de droits : contrats ou cessions de droits d'auteur de chaque contributeur (y compris code produit avec des outils d'assistance) |
| Marque et nom de domaine | « Fajma », `fajma.sn` (référencé dans la configuration) | ⚖️ Dépôt de marque (OAPI) et titulaire du domaine |
| Données | Comptes, rendez-vous, dossiers médicaux, paiements | ⚖️ Une cession de base de données de santé suppose l'accord de la CDP et l'information des personnes |
| Comptes prestataires | Hébergeur, PayDunya, Twilio, agrégateur USSD, fournisseur IA, SMTP, Google Play | Transfert des comptes ou re-création au nom de l'acquéreur ; les clés sont hors du code (§ 2.7) |
| Application Android | Configuration Trusted Web Activity (`twa-manifest.json`) | Clé de signature Play Store : à conserver et transférer (sa perte empêche toute mise à jour) |

Le code ne contient **aucun secret** et **aucune dépendance** à Lovable ou Supabase (plateformes du prototype).

## 6.2 Licences des composants libres

Synthèse de l'inventaire complet du [chapitre 7](07-licences.md) (généré par `tools/inventaire_licences.py`,
dépendances directes et indirectes, liste détaillée en annexe CSV).

| Licence | Composants | Conséquence pour une exploitation commerciale |
|---|---|---|
| MIT, BSD, ISC, Apache 2.0, PSF | Django, Django REST Framework, React, TanStack, Tailwind, Leaflet, Recharts, pdf-lib, gunicorn, cryptography, requests… (les 49 composants envoyés aux navigateurs ; 35 paquets Python sur 42) | Usage commercial libre ; conserver les mentions de licence |
| LGPL 3.0 | `psycopg` (connexion PostgreSQL), `recurring-ical-events`, `x-wr-timezone` (lecture des agendas) | Utilisables dans un produit propriétaire sans publier le code de Fajma, tant que ces bibliothèques ne sont pas modifiées ; en cas de modification, publier les modifications de la bibliothèque |
| MPL 2.0 | `certifi`, `pywebpush`, `py-vapid` | Usage libre ; les fichiers de ces bibliothèques modifiés restent sous MPL |

Aucune licence « contaminante » (GPL, AGPL) n'impose de publier le code de Fajma. Le code propre de Fajma n'est
pas publié sous licence libre. ⚖️ Régénérer l'inventaire au moment de la cession et le faire confirmer par le
conseil juridique de l'acquéreur.

**Chiffres d'activité.** L'administration produit un rapport d'activité mensuel (patients, médecins,
consultations, ordonnances, paiements, chiffre d'affaires, fidélité), téléchargeable en tableur ou imprimable
en PDF, sans aucune donnée nominative : c'est la pièce à joindre au dossier de cession avec ce document.

## 6.3 Dépendance aux prestataires

| Prestataire | Remplaçable ? | Effort de remplacement |
|---|---|---|
| Hébergeur | Oui : Docker Compose standard, aucun service propriétaire | Faible (déploiement + restauration d'une sauvegarde) |
| PayDunya | Oui : un seul module (`backend/payments/paydunya.py`) | Moyen (nouveau module + contrat) |
| Twilio (SMS, WhatsApp) | Oui : un seul module d'envoi (`backend/notifications/sms.py`) | Moyen (opérateur SMS local, fournisseur WhatsApp Business) |
| Agrégateur USSD | Oui : protocole simple, point d'entrée unique | Faible à moyen |
| Jitsi | Oui : logiciel libre, auto-hébergeable (`JITSI_DOMAIN`) | Faible |
| Fournisseur IA | Oui : toute API compatible OpenAI (variable d'environnement) | Nul |

## 6.4 Coûts d'exploitation (ordres de grandeur, à confirmer)

| Poste | Démarrage | Remarque |
|---|---|---|
| Serveur (4 vCPU, 8 Go, 100 Go SSD) | Quelques dizaines d'euros par mois hors Sénégal ; à chiffrer auprès d'un hébergeur sénégalais | Un seul serveur suffit pour le lancement (§ 4.7) |
| Stockage des sauvegardes hors site | Quelques euros par mois | Obligatoire (copie hors du serveur) |
| SMS et WhatsApp | À l'unité (tarif Twilio vers le Sénégal) | Principal coût variable : rappels 24 h et 2 h ; les notifications push sont gratuites |
| Paiement | Commission par transaction (contrat PayDunya) | Répercutée dans la commission de la plateforme |
| Jitsi auto-hébergé | Un second serveur selon le volume de téléconsultations | |
| Assistant IA | Au volume de requêtes | Désactivable |
| Test d'intrusion | Prestation ponctuelle, puis annuelle recommandée | |
| Nom de domaine, Play Store | Faible (annuel / unique) | |

## 6.5 Reprise par une autre équipe

- **Compétences** : Python/Django et React/TypeScript, technologies très répandues ; aucun cadre propriétaire.
- **Documentation** : `README.md` (installation), ce dossier (architecture, sécurité, exploitation), commentaires
  en français dans le code, décrivant les règles métier.
- **Filets de sécurité** : 320 tests automatisés de l'API, typage TypeScript strict, analyse de code (ESLint,
  Prettier), intégration continue sur chaque modification.
- **Données de démonstration** : `python manage.py seed_demo --accounts --activity` crée des comptes de test pour
  chaque rôle et 12 semaines d'activité simulée.
- **Délai de prise en main estimé** : quelques jours pour un développeur Django/React expérimenté.

## 6.6 Points ouverts à connaître avant une offre

Voir le [registre des risques](05-risques-et-plan-action.md). En résumé : autorisation CDP et cadre juridique
(CGU, encaissement pour le compte des médecins, transferts de données) non encore obtenus ; téléconsultation
sur le serveur Jitsi public ; pas encore de test d'intrusion externe ; intégrations PayDunya, Twilio et USSD
testées en simulation, sans compte de production ; virements aux médecins exécutés manuellement.
