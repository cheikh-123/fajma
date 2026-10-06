/**
 * Guide d'utilisation affiché dans l'application (page /guide), un chapitre par espace. Rédigé pour les
 * utilisateurs : phrases courtes, étapes numérotées, astuces. À tenir à jour à chaque évolution.
 */

export type GuideSection = {
  id: string;
  title: string;
  intro?: string;
  steps?: string[];
  points?: string[];
  tip?: string;
};

export type GuideRole = {
  id: GuideRoleId;
  label: string;
  title: string;
  intro: string;
  sections: GuideSection[];
};

export type GuideRoleId =
  "patient" | "famille" | "medecin" | "clinique" | "pharmacie" | "laboratoire" | "relais" | "admin";

export const GUIDE: GuideRole[] = [
  {
    id: "patient",
    label: "Patient",
    title: "Guide du patient",
    intro:
      "Fajma vous permet de trouver un médecin, prendre rendez-vous, consulter en vidéo et garder tout votre dossier médical au même endroit, pour vous et vos proches.",
    sections: [
      {
        id: "compte",
        title: "Créer son compte et se connecter",
        steps: [
          "Cliquez sur « Connexion », puis saisissez votre numéro de téléphone.",
          "Vous recevez un code à 6 chiffres par SMS : saisissez-le. Votre compte est créé, sans mot de passe à retenir.",
          "Complétez « Mes coordonnées » dans « Mon dossier » : nom, ville, langue des messages (français, wolof ou anglais), date de naissance et sexe (utiles sur vos ordonnances).",
          "Ajoutez si vous le souhaitez une adresse email : un lien de confirmation vous est envoyé, l'adresse n'est enregistrée qu'après l'avoir ouvert.",
        ],
        tip: "Si vous vous connectez depuis un nouveau téléphone ou ordinateur, vous recevez une alerte. Téléphone perdu ? Page « Sécurité » : « Déconnecter mes autres appareils ».",
      },
      {
        id: "trouver",
        title: "Trouver un médecin",
        steps: [
          "« Trouver un médecin » : tapez une spécialité, un nom, une ville ou un quartier, ou utilisez « Autour de moi ».",
          "Affinez avec les filtres : disponible aujourd'hui ou cette semaine, vidéo, visite à domicile, langue, assurance acceptée, prix.",
          "Basculez entre la liste et la carte. Sur la carte, chaque médecin et chaque pharmacie s'affiche à son adresse, avec l'itinéraire.",
          "Ouvrez la fiche du médecin : présentation, tarifs par motif, lieux, assurances acceptées (tiers payant), avis des patients et prochains créneaux.",
        ],
      },
      {
        id: "reserver",
        title: "Prendre rendez-vous",
        steps: [
          "Sur la fiche, choisissez le mode : au cabinet, en vidéo ou à domicile (si le médecin le propose).",
          "Choisissez le motif, puis « Pour qui » : vous-même ou un proche (enfant, parent).",
          "Sélectionnez votre assurance si vous en avez une : vous ne payez alors que votre part.",
          "Cliquez sur un créneau, ajoutez un motif si vous le souhaitez, répondez aux questions du médecin (facultatif) puis « Confirmer ».",
          "Le rendez-vous est confirmé tout de suite ou après validation du médecin : vous êtes prévenu par SMS.",
        ],
        points: [
          "Kinésithérapie, pansements… : réservez une série de séances en une seule fois.",
          "Aucun créneau libre ? Inscrivez-vous sur la liste d'attente : un SMS vous prévient dès qu'une place se libère.",
        ],
      },
      {
        id: "avant",
        title: "Avant et pendant le rendez-vous",
        points: [
          "Rappels automatiques par SMS la veille et 2 heures avant.",
          "Déplacer ou annuler : depuis « Mon espace », jusqu'au délai fixé par le médecin. Un rendez-vous payé en ligne puis annulé est remboursé en entier.",
          "Payer en ligne (Wave, Orange Money, Free Money, crédit santé offert par un proche) ou au cabinet. Le reçu sert de feuille de soins pour votre assurance.",
          "Téléconsultation : à l'heure du rendez-vous, cliquez sur « Rejoindre ». Rien à installer.",
        ],
      },
      {
        id: "avis-ecrit",
        title: "Demander un avis médical écrit (sans rendez-vous)",
        intro: "Pratique quand la vidéo passe mal ou pour une question simple.",
        steps: [
          "Sur la fiche d'un médecin qui le propose, cliquez sur « Demander un avis écrit ».",
          "Décrivez ce que vous ressentez, depuis quand, votre température, vos médicaments, et ajoutez jusqu'à 4 photos.",
          "Payez en ligne : la demande part chez le médecin, qui répond par écrit dans le délai annoncé (24 ou 48 h).",
          "La réponse arrive dans « Mon espace », carte « Avis écrits », avec une ordonnance si besoin.",
        ],
        tip: "Sans réponse dans le délai, vous êtes remboursé automatiquement. En cas d'urgence, appelez le SAMU (1515) : l'avis écrit n'est pas fait pour les urgences.",
      },
      {
        id: "apres",
        title: "Après la consultation",
        points: [
          "Le compte-rendu et l'ordonnance arrivent dans « Mon dossier » (notification et SMS).",
          "Ordonnance : document signé avec un QR code de vérification. Envoyez-la à une pharmacie partenaire en un clic et suivez sa préparation (reçue, en préparation, prête).",
          "Analyses : choisissez un laboratoire partenaire ; les résultats arrivent dans votre dossier.",
          "Certificats et arrêts de travail : dans votre dossier, en PDF vérifiable.",
          "Donnez votre avis sur le médecin une fois la consultation terminée.",
        ],
      },
      {
        id: "quotidien",
        title: "Suivre sa santé au quotidien",
        points: [
          "Renouvellement d'ordonnance : sous chaque ordonnance de moins d'un an, « Demander le renouvellement ».",
          "Rappels de médicaments : choisissez les heures de prise et la durée.",
          "Tension, glycémie, poids : notez vos mesures, suivez la courbe. Une valeur dangereuse prévient vos médecins.",
          "Carnet de santé : vaccins de chaque enfant (à faire, en retard, faits) et suivi de grossesse.",
          "Disponibilité d'un médicament : demandez à jusqu'à 5 pharmacies, qui répondent sans connaître votre identité.",
          "Messagerie : écrivez à vos médecins, avec photos ou documents.",
        ],
      },
      {
        id: "dossier",
        title: "Mon dossier médical",
        points: [
          "Profil de santé : groupe sanguin, allergies, antécédents, traitements, personne à prévenir.",
          "Documents : déposez vos résultats et ordonnances (PDF, photos) et choisissez avec quels médecins les partager.",
          "« Qui a consulté mon dossier » : chaque accès d'un professionnel est listé.",
          "Fiche d'urgence : cochez vos alertes vitales (diabétique sous insuline, épileptique, drépanocytaire, enceinte…), ajoutez jusqu'à 3 personnes à prévenir, vos appareils médicaux et une note pour les secours, puis choisissez ce qui est visible.",
          "Une fiche aussi pour chaque proche (enfant, parent âgé) : vous êtes toujours la première personne prévenue.",
          "Option « Résumé de mes médecins » : les secours voient les conclusions de vos 3 dernières consultations et vos ordonnances en cours (jamais les notes privées ni les diagnostics sensibles). Fajma vous propose aussi d'ajouter les médicaments de vos ordonnances à « Traitements en cours », signale ce qui manque et vous rappelle tous les 6 mois de vérifier votre fiche.",
          "Mettez le QR code en fond d'écran ou imprimez la carte de portefeuille. Les secours voient la fiche en français, wolof ou anglais, appellent le SAMU ou vos proches et peuvent leur envoyer leur position. Vous êtes prévenu par SMS à chaque consultation.",
          "Téléchargez tout votre dossier en PDF pour le remettre à un médecin.",
        ],
      },
      {
        id: "proches",
        title: "Mes proches et mes assurances",
        points: [
          "« Mes proches » (dans « Mon espace ») : ajoutez vos enfants ou vos parents, puis prenez rendez-vous et tenez leur carnet à leur nom. Le crayon permet de corriger.",
          "Assurances (dans « Mon dossier ») : ajoutez votre IPM, mutuelle ou assurance avec votre numéro d'adhérent ; le tiers payant s'applique chez les médecins qui l'acceptent.",
        ],
      },
      {
        id: "sans-smartphone",
        title: "Sans smartphone ni internet",
        points: [
          "Par USSD (tout téléphone) : composez le code Fajma et suivez le menu (1 rendez-vous, 2 mes rendez-vous, 3 annuler, 4 pharmacies).",
          "Par WhatsApp : écrivez simplement votre demande, en français, wolof ou anglais (« je cherche un pédiatre à Thiès », « sama doom dafa am yaram »).",
          "Un relais de santé de votre quartier peut aussi vous suivre sur Fajma avec votre accord.",
        ],
      },
    ],
  },
  {
    id: "famille",
    label: "Famille",
    title: "Guide de l'entraide familiale",
    intro:
      "Vous vivez loin, au Sénégal ou à l'étranger ? Aidez un parent : payez ses consultations, offrez-lui un crédit santé, prenez ses rendez-vous et recevez des nouvelles, toujours avec son accord.",
    sections: [
      {
        id: "inviter",
        title: "Ajouter un proche",
        steps: [
          "Menu de votre espace : « Aider un proche au Sénégal », puis « Ajouter un proche ».",
          "Indiquez son nom, comment vous l'appelez (« Maman »), son numéro au Sénégal et la langue du SMS.",
          "Choisissez ce que vous demandez : payer ses consultations (toujours), prendre ses rendez-vous, voir ses ordonnances et comptes-rendus.",
          "Votre proche reçoit un code à 6 chiffres par SMS. Appelez-le : il vous donne le code, vous le saisissez. C'est son accord.",
        ],
        tip: "Aucun smartphone n'est nécessaire de son côté. Il peut retirer l'accès à tout moment depuis son espace.",
      },
      {
        id: "credit",
        title: "Recharger le crédit santé",
        steps: [
          "Sur la carte de votre proche, choisissez un montant (10 000, 25 000, 50 000, 100 000 F ou autre). L'équivalent en euros est affiché.",
          "Payez par carte bancaire ou mobile money. Votre proche est prévenu par SMS.",
          "Le crédit sert à payer ses consultations, par vous ou par lui-même.",
        ],
        points: [
          "Alerte quand le crédit passe sous le seuil que vous choisissez ; rappel mensuel de recharge si vous le souhaitez.",
          "Consultation annulée : le montant revient automatiquement sur le crédit.",
        ],
      },
      {
        id: "suivre",
        title: "Prendre ses rendez-vous et suivre sa santé",
        points: [
          "« Prendre un rendez-vous pour Maman » : cherchez un médecin, la réservation se fait à son nom ; il reçoit les rappels.",
          "« Rendez-vous, paiements, comptes-rendus » : ses rendez-vous à venir et passés, avec « Payer » (crédit ou carte).",
          "Si votre proche l'a accepté : ses comptes-rendus et ordonnances. Chaque consultation de son dossier est enregistrée et visible par lui.",
          "Vous êtes prévenu à chaque rendez-vous pris, confirmé ou annulé.",
        ],
      },
    ],
  },
  {
    id: "medecin",
    label: "Médecin",
    title: "Guide du médecin",
    intro:
      "Votre agenda en ligne, vos consultations, ordonnances et paiements, au même endroit. Les patients vous trouvent et réservent 24 h/24.",
    sections: [
      {
        id: "demarrer",
        title: "Bien démarrer",
        steps: [
          "Créez votre compte puis votre fiche (nom, spécialité, ville, tarif). La double authentification est demandée à la première connexion : elle protège les données de vos patients.",
          "Suivez le guide « Bien démarrer sur Fajma » en haut de votre espace : chaque étape ouvre le bon onglet.",
          "Déposez vos justificatifs (onglet « Profil et cabinet ») : inscription à l'Ordre des médecins et pièce d'identité.",
          "Complétez l'en-tête des ordonnances (onglet « Ordonnances ») : n° d'Ordre, cabinet, signature, cachet.",
          "L'équipe Fajma vérifie vos pièces et publie votre fiche : vous êtes prévenu par SMS et email.",
        ],
      },
      {
        id: "planning",
        title: "Emploi du temps",
        points: [
          "Semaine type : ajoutez une plage (ex. 8 h – 13 h) à plusieurs jours d'un coup, avec la durée des créneaux et le lieu.",
          "Absences : congés, formation ; les créneaux disparaissent pour les patients.",
          "Règles : confirmation automatique ou manuelle, nouveaux patients acceptés ou non, délai minimal, délai d'annulation, consignes.",
          "Motifs et tarifs : un prix et une durée par motif, séries de séances possibles.",
          "Synchronisation avec Google Agenda, Outlook ou iPhone.",
        ],
      },
      {
        id: "journee",
        title: "La journée de consultation",
        points: [
          "Onglet « Rendez-vous » : liste ou semaine. En semaine, glissez un rendez-vous pour le déplacer ; le patient est prévenu.",
          "Confirmez, marquez « arrivé », « terminé » ou « absent », annulez avec un motif.",
          "« Nouveau RDV » : un rendez-vous pris au téléphone, même pour un patient sans compte.",
          "Ouvrez la consultation : fiche du patient, réponses au questionnaire, notes privées, documents partagés.",
        ],
      },
      {
        id: "compte-rendu",
        title: "Compte-rendu, ordonnance et diagnostic",
        steps: [
          "Dans la consultation, rédigez le résumé, la conclusion et le traitement. L'assistant de prise de notes peut ranger vos notes dictées : relisez toujours avant d'enregistrer.",
          "Choisissez le diagnostic principal dans la liste (recherche par nom ou code CIM-10), précisez suspect, probable ou confirmé et le résultat du test rapide.",
          "Ajoutez les médicaments de l'ordonnance : elle est signée, avec QR code, et le patient peut l'envoyer à sa pharmacie.",
          "Enregistrez : le patient reçoit compte-rendu et ordonnance dans son dossier.",
        ],
        tip: "Maladie à déclaration immédiate (choléra, rougeole, méningite, dengue…) : un message rouge vous invite à déclarer le cas au district sanitaire. Une fois fait, cliquez « J'ai déclaré ce cas » dans « Déclarations à faire ».",
      },
      {
        id: "avis-ecrits",
        title: "Avis écrits (consultation sans rendez-vous)",
        steps: [
          "Onglet « Avis écrits » : cochez « Proposer l'avis écrit », fixez le prix et le délai de réponse (24 ou 48 h).",
          "Les demandes payées arrivent avec leur échéance : symptômes, mesures, photos.",
          "Répondez par écrit, choisissez la conclusion (conseils, ordonnance, consultation en personne, urgence) et ajoutez des médicaments si besoin.",
        ],
        tip: "Sans réponse avant l'échéance, le patient est remboursé automatiquement.",
      },
      {
        id: "autres",
        title: "Autres outils",
        points: [
          "Renouvellements : renouvelez ou refusez avec un motif.",
          "Analyses : prescrivez, le patient choisit son laboratoire, les résultats vous reviennent.",
          "Certificats et arrêts de travail, vaccins inscrits au carnet de l'enfant.",
          "Secrétariat et remplacements : donnez l'accès à votre secrétaire, proposez un remplacement à un confrère.",
          "Finances : solde, virement dès 5 000 F, exports (rendez-vous, tiers payant, revenus).",
          "Télé-expertise et messagerie avec vos confrères et vos patients.",
        ],
      },
    ],
  },
  {
    id: "clinique",
    label: "Clinique et secrétariat",
    title: "Guide de la clinique et du secrétariat",
    intro:
      "Le responsable gère l'établissement et son équipe ; le secrétariat gère l'agenda de tous les médecins. Le secrétariat n'a jamais accès aux dossiers médicaux.",
    sections: [
      {
        id: "responsable",
        title: "Responsable de l'établissement",
        steps: [
          "Créez l'établissement puis complétez ses informations (« Modifier les informations de l'établissement »).",
          "Déposez les justificatifs : autorisation du ministère de la Santé, NINEA et RCCM, pièce d'identité du responsable, désignation du médecin responsable.",
          "Onglet « Équipe » : ajoutez les médecins, changez leur titre (crayon), ajoutez le secrétariat par l'email de leur compte et choisissez le rôle (secrétaire ou gestionnaire).",
          "L'équipe Fajma vérifie les pièces et publie la clinique dans l'annuaire.",
        ],
      },
      {
        id: "secretariat",
        title: "Secrétariat : l'agenda au quotidien",
        points: [
          "Onglet « Agenda » : la semaine de tous les médecins ; filtrez par médecin.",
          "Prendre un rendez-vous au guichet ou au téléphone, même pour un patient sans compte (son téléphone sert aux rappels).",
          "Les créneaux libres sont proposés automatiquement.",
          "Confirmer, déplacer, annuler, marquer « venu », programmer des séances.",
          "Onglet « Patients » : fichier des patients, détection et fusion des doublons.",
          "Exporter l'agenda en tableur.",
        ],
      },
    ],
  },
  {
    id: "pharmacie",
    label: "Pharmacie",
    title: "Guide de la pharmacie",
    intro: "Recevez les ordonnances des patients, préparez-les et prévenez-les quand c'est prêt.",
    sections: [
      {
        id: "ordonnances",
        title: "Traiter les ordonnances",
        steps: [
          "Les ordonnances envoyées par les patients arrivent dans « Reçues ».",
          "Cliquez « Préparer » : indiquez le prix ; en cas de rupture, signalez-la (le patient est prévenu).",
          "Quand c'est prêt, passez-la en « Prête » : le patient reçoit un SMS.",
          "À la remise, marquez « Retirée ». Le nombre de délivrances autorisées est contrôlé.",
        ],
      },
      {
        id: "disponibilite",
        title: "Demandes de disponibilité",
        points: [
          "Les patients demandent si un médicament est disponible : répondez « disponible » (avec le prix) ou « indisponible ».",
          "Vous ne voyez jamais l'identité du patient.",
        ],
      },
      {
        id: "officine",
        title: "Votre officine",
        points: [
          "Horaires, jours d'ouverture, téléphone et garde (avec date de fin), affichés aux patients.",
          "Justificatifs : autorisation d'exploitation et inscription du pharmacien titulaire à l'Ordre. Tant qu'ils ne sont pas validés, l'officine ne reçoit pas d'ordonnances en ligne.",
        ],
      },
    ],
  },
  {
    id: "laboratoire",
    label: "Laboratoire",
    title: "Guide du laboratoire",
    intro:
      "Recevez les demandes d'analyses et déposez les résultats directement dans le dossier du patient.",
    sections: [
      {
        id: "demandes",
        title: "Demandes d'analyses",
        steps: [
          "Colonne « Patients attendus » : les demandes que les patients vous ont adressées.",
          "À l'arrivée du patient, cliquez « Prélèvement effectué ».",
          "Déposez les résultats (PDF ou photo) avec un commentaire : ils rejoignent le dossier du patient, qui est prévenu, ainsi que le médecin prescripteur.",
        ],
        tip: "Recherchez une demande par sa référence (LAB-…) ou le nom du patient.",
      },
      {
        id: "fiche",
        title: "Fiche du laboratoire et justificatifs",
        points: [
          "Quartier, adresse, téléphone et horaires sont modifiables dans votre espace ; le nom et la ville sont corrigés par l'équipe Fajma.",
          "Justificatifs : agrément du laboratoire et inscription du biologiste responsable. Tant qu'ils ne sont pas validés, le laboratoire n'est pas proposé aux patients.",
        ],
      },
    ],
  },
  {
    id: "relais",
    label: "Relais communautaire",
    title: "Guide du relais communautaire",
    intro:
      "Badiénou gokh, relais de quartier ou agent de santé : suivez sur Fajma les personnes qui n'ont ni smartphone ni internet, avec leur accord.",
    sections: [
      {
        id: "ajouter",
        title: "Ajouter une personne",
        steps: [
          "Espace « Relais » : « Ajouter une personne ».",
          "Nom, date de naissance, sexe, quartier ou village, téléphone d'un proche et un repère pour trouver la maison (pas de données médicales).",
          "Indiquez son accord : oral devant témoin, formulaire signé, ou accord du tuteur. Sans accord, l'ajout est impossible.",
        ],
      },
      {
        id: "suivre",
        title: "Suivre et agir",
        points: [
          "Prendre un rendez-vous : cherchez un médecin, puis choisissez la personne dans « Pour qui ». Vous recevez les rappels.",
          "Noter une tension, une glycémie, un poids ou un vaccin depuis « Mon dossier », en choisissant la personne.",
          "Alertes du jour, les plus urgentes en tête : tension ou sucre dangereux (orienter aujourd'hui), valeurs élevées (consultation à prévoir), vaccins de l'enfant en retard, rendez-vous dans les 2 jours.",
        ],
      },
      {
        id: "transfert",
        title: "Quand la personne a son propre téléphone",
        steps: [
          "Sur sa carte : « Lui transférer son dossier », puis saisissez son numéro.",
          "Elle reçoit un code par SMS et vous le donne : c'est son accord.",
          "Tout son dossier passe sur son propre compte ; elle se connecte avec son numéro.",
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    title: "Guide de l'administration Fajma",
    intro:
      "Le bandeau « À traiter » en haut de page résume le travail du jour ; chaque compteur mène à sa section.",
    sections: [
      {
        id: "valider",
        title: "Valider les professionnels",
        steps: [
          "Section « Justificatifs » : ouvrez chaque pièce, vérifiez-la à la source (Ordre, ministère, registre du commerce) et sa date de validité, puis validez ou refusez avec un motif.",
          "Section « Validations » : publiez un médecin, une clinique, une pharmacie ou un laboratoire. La publication est refusée tant qu'une pièce obligatoire manque ou a expiré.",
          "Crayon sur un médecin vérifié : corriger son nom ou sa spécialité, avec un motif (journalisé, le médecin est prévenu).",
        ],
      },
      {
        id: "comptes",
        title: "Comptes, support et sécurité",
        points: [
          "Comptes : rechercher, suspendre ou réactiver, réinitialiser la double authentification (motif obligatoire).",
          "Support : demandes reçues par « Aide et contact » ; répondez par email ou téléphone, puis marquez « traitée ».",
          "Journal d'audit : chaque action sensible y est enregistrée.",
        ],
      },
      {
        id: "reseau",
        title: "Pharmacies, laboratoires, relais",
        points: [
          "Ajoutez et corrigez les pharmacies et laboratoires ; rattachez leur personnel par l'email de leur compte.",
          "Relais communautaires : habilitez un compte (structure, zone) ; suspendez si besoin.",
        ],
      },
      {
        id: "finances",
        title: "Finances",
        points: [
          "Virements aux médecins et remboursements aux patients : exécutez-les puis saisissez la référence.",
          "Rapport d'activité mensuel en tableur ou PDF (sans données nominatives).",
        ],
      },
      {
        id: "veille",
        title: "Veille épidémiologique",
        points: [
          "Cas par maladie, région et semaine ; signaux de hausse inhabituelle ; tout cas de maladie à déclaration immédiate est signalé.",
          "Liste des cas à déclaration immédiate, déclarés ou non au district, avec le médecin à contacter.",
          "Rapport hebdomadaire SIMR à transmettre aux autorités (après accord de la CDP et convention).",
        ],
      },
      {
        id: "campagnes",
        title: "Partenaires et campagnes",
        steps: [
          "Ajoutez le partenaire (nom, type, logo, affichage sur « Nos partenaires »).",
          "Créez la campagne : titre, texte, bouton, lien, couleur, visuel, emplacements, villes, dates. Elle est enregistrée en brouillon.",
          "Vérifiez la charte (pas de médicament sur ordonnance, pas de promesse de guérison) puis « Valider » : elle est diffusée.",
          "Suivez affichages et clics ; téléchargez le rapport pour l'annonceur.",
        ],
      },
    ],
  },
];
