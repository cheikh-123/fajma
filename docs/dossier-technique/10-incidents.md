# 10. Que faire en cas d'incident

Ce chapitre est écrit pour être lu **le jour de l'incident**, par quelqu'un qui n'est pas ingénieur. Chaque
situation donne les gestes dans l'ordre, et dit lesquels sont urgents. Aucune commande n'est à inventer : tout
ce qui est écrit ici existe dans l'application ou dans `deploy/`.

> **Règle générale** : on coupe d'abord l'accès, on comprend ensuite. Un compte suspendu à tort se réactive en
> dix secondes ; des données volées ne se récupèrent jamais.

---

## 10.1 À préparer **avant** le premier incident

Sans ces quatre choses, le reste de ce chapitre ne sert à rien.

| À faire | Pourquoi |
|---|---|
| Renseigner `ALERT_EMAILS` **et** `ALERT_PHONES` | Sans numéro de téléphone, une attaque de nuit n'est découverte que le matin |
| Mettre en place une surveillance **externe** (UptimeRobot, Better Stack, gratuits) qui appelle `https://www.fajma.sn/api/health` chaque minute | Si le serveur entier tombe, la supervision interne ne peut plus prévenir personne |
| Conserver la clé `FILE_ENCRYPTION_KEYS` **hors du serveur et hors des sauvegardes** (coffre, papier dans un endroit sûr) | Sans elle, les documents et les sauvegardes sont illisibles — y compris par vous |
| Noter qui appelle qui : votre prestataire technique, l'hébergeur, le délégué à la protection des données | Chercher un numéro pendant l'incident coûte des heures |

---

## 10.2 « Un compte de médecin est compromis »

Signes : le médecin signale des rendez-vous qu'il n'a pas pris, une alerte « connexion depuis un nouvel
appareil » qu'il ne reconnaît pas, ou des consultations de dossiers qu'il n'a pas faites.

**Dans les cinq minutes**

1. Administration → **Utilisateurs** → chercher le médecin → **Suspendre**, avec le motif.
   La suspension ferme immédiatement toutes ses sessions sur tous les appareils et retire sa fiche de
   l'annuaire. Personne ne peut plus se connecter à ce compte.
2. Administration → **Système** → **Journal des actions** → filtrer sur ce compte, sur les dernières 48 heures. Noter tout ce qui a été
   consulté : dossiers patients, ordonnances, documents. Exporter la liste.

**Dans l'heure**

3. Appeler le médecin par téléphone (jamais par email : la boîte peut être compromise aussi) et vérifier son
   identité avant de faire quoi que ce soit d'autre.
4. Administration → **Utilisateurs** → **Réinitialiser la double authentification** (motif obligatoire, journalisé).
   Cela retire à la fois le code à six chiffres **et** les clés d'accès, donc l'appareil volé ne sert plus à rien.
5. Demander au médecin de changer son mot de passe depuis un appareil sûr, puis **Réactiver** le compte.
6. Lui faire enregistrer une **clé d'accès** sur son nouvel appareil (Sécurité → Clés d'accès). C'est ce qui
   empêchera que cela recommence.

**Dans les 72 heures, si des dossiers de patients ont été consultés**

7. Le journal dit exactement quels patients. La notification des personnes concernées et la déclaration à la
   CDP sont une **obligation légale** ⚖️ : voir le chapitre [3](03-donnees-et-conformite.md). Ne pas attendre
   d'être certain de l'ampleur pour prendre conseil.

---

## 10.3 « J'ai reçu une alerte : mots de passe essayés en masse »

C'est la supervision (`manage.py monitor`) qui l'envoie, par email et par SMS.

1. **Ne rien couper.** L'application se défend déjà seule : au-delà de 10 essais ratés en 15 minutes sur un
   même compte, les tentatives sont refusées pendant 15 minutes, même si elles viennent d'adresses différentes.
   Une attaque qui échoue n'est pas une urgence.
2. Administration → **Système** → **Journal des actions** → échecs de connexion. Regarder **une seule chose** : y a-t-il une *réussite*
   après la série d'échecs ? Si oui, ce compte est compromis → section 10.2.
3. Si l'attaque dure plus d'une heure, demander à l'hébergeur ou au service en frontal (Cloudflare) de filtrer
   les adresses concernées. L'application ne peut pas le faire à sa place.
4. Si des comptes professionnels n'ont pas encore de clé d'accès, c'est le moment de le leur demander : elle
   rend ce type d'attaque sans objet.

---

## 10.4 « Le site ne répond plus »

1. Ouvrir `https://www.fajma.sn/api/health?token=…` (le jeton est dans `HEALTH_TOKEN`). La réponse dit quel
   composant est en cause : base, antivirus, SMS, sauvegarde, disque.
2. **Base injoignable** → redémarrer PostgreSQL chez l'hébergeur. Les données ne sont pas perdues : elles sont
   sur le disque, et la sauvegarde de la nuit existe.
3. **Disque plein** → c'est la cause la plus fréquente. Vérifier le dossier des sauvegardes : il grossit sans
   limite si personne ne retire les anciennes.
4. **Rien ne répond du tout** → le serveur lui-même est à terre : c'est l'hébergeur qu'il faut appeler, pas un
   développeur.
5. Pendant la panne, les rendez-vous déjà pris ne sont pas perdus et les SMS de rappel repartiront d'eux-mêmes
   une fois le service rétabli (la file reprend sans doublon).

---

## 10.5 « Il faut restaurer les données »

Suppression accidentelle, données incohérentes, serveur perdu.

1. **Ne pas écrire dans la base** en attendant : chaque minute d'activité complique la restauration.
2. `deploy/restore.sh` restaure une sauvegarde en une commande. Le test mensuel de restauration prouve qu'elle
   est relisible ; s'il n'a pas tourné depuis plus de 35 jours, la supervision l'a déjà signalé.
3. Les sauvegardes sont chiffrées : la clé `FILE_ENCRYPTION_KEYS` est indispensable. C'est le moment où l'on
   découvre si elle a bien été conservée ailleurs.
4. Détail des commandes : chapitre [4.5 bis](04-exploitation.md).

---

## 10.6 « Une clé secrète a fuité »

Une clé envoyée par email, affichée dans une capture d'écran, laissée à un ancien prestataire.

| Clé | Conséquence de la fuite | Geste |
|---|---|---|
| `DJANGO_SECRET_KEY` | Sessions falsifiables | La changer, puis redémarrer : tout le monde est déconnecté, c'est normal |
| `FILE_ENCRYPTION_KEYS` | Documents et secrets de 2FA lisibles par le voleur | `python manage.py encrypt_files --rotate` : rotation **sans coupure**, l'ancienne clé reste acceptée le temps de la bascule |
| `PAYDUNYA_*` | Paiements détournés | Les révoquer chez PayDunya **en premier**, avant tout le reste |
| `TWILIO_*` | SMS envoyés à vos frais | Les révoquer chez Twilio, vérifier la facture |

Dans tous les cas, noter dans le journal interne **qui** a eu accès, **quand**, et **ce qui a été changé**.

---

## 10.7 Ce qui n'est pas un incident

Pour éviter les réveils inutiles :

- **Un patient ne reçoit pas son SMS** → le numéro a peut-être répondu STOP, ou le crédit Twilio est épuisé.
  Administration → **Support** → rappels SMS, avec relance.
- **Un médecin ne peut pas se connecter** → neuf fois sur dix, c'est l'heure de son téléphone qui a dérivé et
  le code à six chiffres qui ne tombe plus juste. La clé d'accès n'a pas ce problème.
- **Une alerte « sauvegarde vieille de 30 h »** → le planificateur n'a pas tourné une nuit. À regarder le matin,
  pas à 3 heures.

---

## 10.8 Rythme à tenir

| Quand | Quoi |
|---|---|
| Chaque semaine | Valider les propositions de mise à jour des bibliothèques (ouvertes automatiquement, déjà testées par l'intégration continue) |
| Chaque mois | Vérifier que le test de restauration est passé ; parcourir le journal des actions d'administration |
| Chaque année | Test d'intrusion externe par un prestataire indépendant, et correction de ce qu'il trouve |

Ce rythme est ce qui remplace un ingénieur sécurité à plein temps. Il ne le remplace pas entièrement : voir
[§ 2.9, « Ce qui n'est pas couvert, et pourquoi »](02-securite.md).
