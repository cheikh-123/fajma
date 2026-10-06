import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions générales d'utilisation — Fajma" },
      {
        name: "description",
        content:
          "Conditions d'utilisation de la plateforme Fajma de prise de rendez-vous médicaux.",
      },
    ],
  }),
  component: CguPage,
});

function CguPage() {
  return (
    <LegalLayout title="Conditions générales d'utilisation" updated="29 septembre 2026">
      <section>
        <h2>1. Objet</h2>
        <p>
          Fajma est une plateforme numérique qui met en relation des patients et des professionnels
          de santé exerçant au Sénégal : recherche de praticiens, prise de rendez-vous,
          téléconsultation, messagerie, dossier et documents médicaux, paiement en ligne. Les
          présentes conditions encadrent l'utilisation de la plateforme par les patients et les
          professionnels.
        </p>
      </section>
      <section>
        <h2>2. Fajma n'est pas un service d'urgence</h2>
        <p>
          <b>En cas d'urgence, appelez immédiatement le SAMU au 1515</b> ou rendez-vous aux urgences
          les plus proches. Ni la messagerie, ni l'assistant d'orientation, ni la prise de
          rendez-vous ne permettent une prise en charge urgente.
        </p>
      </section>
      <section>
        <h2>3. Rôle de Fajma</h2>
        <p>
          Fajma est un intermédiaire technique. Les actes médicaux (diagnostic, prescription,
          téléconsultation) sont réalisés sous la seule responsabilité des professionnels de santé,
          dans le respect de leur déontologie. L'assistant d'orientation ne pose aucun diagnostic et
          ne remplace pas un avis médical.
        </p>
      </section>
      <section>
        <h2>4. Compte utilisateur</h2>
        <ul>
          <li>
            La création d'un compte est gratuite pour les patients. Elle se fait avec un numéro de
            téléphone vérifié par SMS ou une adresse email.
          </li>
          <li>
            L'utilisateur fournit des informations exactes et protège l'accès à son compte (code
            SMS, mot de passe, double authentification).
          </li>
          <li>
            Un utilisateur peut prendre rendez-vous pour ses proches (enfants, parents) avec leur
            accord ou en qualité de représentant légal.
          </li>
          <li>
            Les professionnels de santé ne sont visibles qu'après vérification de leur identité et
            de leur droit d'exercer.
          </li>
        </ul>
      </section>
      <section>
        <h2>5. Rendez-vous, annulations et absences</h2>
        <ul>
          <li>
            Selon le choix du praticien, un rendez-vous est confirmé immédiatement ou après
            validation par le cabinet.
          </li>
          <li>
            Le patient peut annuler ou déplacer en ligne jusqu'au délai fixé par chaque praticien et
            affiché avant la réservation.
          </li>
          <li>
            Les absences répétées sans annulation peuvent conduire le praticien à refuser de
            nouvelles réservations.
          </li>
        </ul>
      </section>
      <section>
        <h2>6. Paiement</h2>
        <p>
          Les tarifs sont fixés par les praticiens et affichés avant la réservation. Le paiement en
          ligne est traité par un prestataire agréé (PayDunya : Wave, Orange Money, Free Money,
          cartes). Fajma ne conserve aucune donnée de carte ni code secret. Les conditions de
          remboursement en cas d'annulation sont précisées lors du paiement.
        </p>
      </section>
      <section>
        <h2>7. Téléconsultation</h2>
        <p>
          La téléconsultation est proposée par les praticiens qui le souhaitent. Le patient
          s'installe dans un lieu calme et privé, avec une connexion suffisante. Le praticien peut à
          tout moment demander une consultation en présentiel.
        </p>
      </section>
      <section>
        <h2>8. Obligations des utilisateurs</h2>
        <p>
          Il est interdit d'utiliser la plateforme à des fins frauduleuses, de réserver des créneaux
          sans intention de s'y rendre, de publier des avis mensongers ou injurieux, ou de tenter
          d'accéder aux données d'autrui.
        </p>
      </section>
      <section>
        <h2>9. Responsabilité</h2>
        <p>
          Fajma met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du
          service, sans pouvoir garantir l'absence totale d'interruption. Fajma n'est pas
          responsable du contenu des consultations ni des décisions médicales.
        </p>
      </section>
      <section>
        <h2>10. Données personnelles</h2>
        <p>
          Le traitement des données, y compris des données de santé, est décrit dans la{" "}
          <a href="/confidentialite" className="font-semibold text-sunu-green">
            politique de confidentialité
          </a>
          .
        </p>
      </section>
      <section id="publicite">
        <h2>11. Partenaires et charte publicitaire</h2>
        <p>
          Fajma peut afficher des contenus sponsorisés, toujours signalés par la mention «
          Sponsorisé » et validés par l'équipe Fajma avant diffusion. Sont seuls acceptés : les
          campagnes de prévention et de santé publique, les offres d'assurance ou de mutuelle, les
          services de santé et les produits vendus sans ordonnance autorisés au Sénégal.
        </p>
        <p>
          Sont interdits : la publicité pour un médicament soumis à prescription, toute promesse de
          guérison, toute mise en avant d'un médecin contre paiement (l'ordre des médecins affichés
          ne dépend jamais d'un partenariat), et tout contenu sponsorisé dans le dossier médical,
          une ordonnance ou une téléconsultation.
        </p>
        <p>
          Les contenus ne sont ciblés que par ville et par langue, jamais à partir de vos données de
          santé. Les partenaires reçoivent seulement des statistiques globales (affichages, clics),
          sans aucune donnée personnelle.
        </p>
      </section>
      <section>
        <h2>12. Droit applicable</h2>
        <p>
          Les présentes conditions sont soumises au droit sénégalais. À défaut d'accord amiable, les
          tribunaux de Dakar sont compétents. Contact :{" "}
          <a href="mailto:contact@fajma.sn" className="font-semibold text-sunu-green">
            contact@fajma.sn
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
