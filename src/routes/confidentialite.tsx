import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — Fajma" },
      {
        name: "description",
        content: "Comment Fajma protège vos données personnelles et vos données de santé.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité" updated="29 septembre 2026">
      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          [Raison sociale, forme, adresse, RCCM, NINEA — à compléter], éditeur de Fajma, Dakar,
          Sénégal. Contact :
          <a href="mailto:dpo@fajma.sn" className="font-semibold text-sunu-green">
            {" "}
            dpo@fajma.sn
          </a>
          . Le traitement est conduit conformément à la loi n° 2008-12 du 25 janvier 2008 sur la
          protection des données à caractère personnel et fait l'objet des formalités auprès de la
          Commission de Protection des Données Personnelles (CDP) [numéro d'autorisation à
          compléter].
        </p>
      </section>
      <section>
        <h2>2. Données collectées</h2>
        <ul>
          <li>
            <b>Identité et contact</b> : nom, numéro de téléphone, email (facultatif), ville.
          </li>
          <li>
            <b>Proches</b> : nom, lien, date de naissance des personnes pour qui vous prenez
            rendez-vous.
          </li>
          <li>
            <b>Rendez-vous</b> : praticien, date, motif que vous choisissez d'indiquer.
          </li>
          <li>
            <b>Données de santé</b> : profil de santé (allergies, antécédents, traitements,
            vaccins), comptes-rendus, ordonnances, documents déposés, messages avec vos médecins.
          </li>
          <li>
            <b>Paiement</b> : montant, moyen et référence de la transaction (aucune donnée de carte
            ni code secret).
          </li>
          <li>
            <b>Sécurité</b> : journaux de connexion et d'accès aux dossiers, adresse IP.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>
            Gestion des rendez-vous, rappels et téléconsultations : exécution du service que vous
            demandez.
          </li>
          <li>
            Partage de vos données de santé avec vos médecins : votre consentement, exprimé lors de
            la réservation et du partage de chaque document.
          </li>
          <li>
            Sécurité, prévention de la fraude, journal d'audit : obligation légale et intérêt
            légitime.
          </li>
          <li>Facturation et comptabilité : obligations légales.</li>
        </ul>
      </section>
      <section>
        <h2>4. Qui accède à vos données</h2>
        <ul>
          <li>
            Les professionnels de santé avec lesquels vous avez un rendez-vous confirmé ; les
            documents, seulement si vous les leur partagez.
          </li>
          <li>
            Le secrétariat de la clinique concernée, pour la gestion des rendez-vous (sans accès au
            dossier médical).
          </li>
          <li>
            Nos sous-traitants techniques, liés par contrat : hébergeur [à compléter — hébergement
            au Sénégal visé], Twilio (SMS et WhatsApp), PayDunya (paiement), fournisseur de
            visioconférence [à compléter], fournisseur d'IA pour l'assistant d'orientation
            (uniquement les symptômes saisis, sans identité).
          </li>
        </ul>
        <p>Vous pouvez à tout moment voir qui a consulté votre dossier dans « Mon dossier ».</p>
      </section>
      <section>
        <h2>5. Transferts hors du Sénégal</h2>
        <p>
          Certains sous-traitants sont établis hors du Sénégal (envoi de SMS, IA). Ces transferts
          sont limités au strict nécessaire et encadrés conformément à la loi et aux autorisations
          de la CDP. [Liste et garanties à compléter.]
        </p>
      </section>
      <section>
        <h2>6. Durées de conservation</h2>
        <ul>
          <li>Compte : jusqu'à sa suppression, puis anonymisation.</li>
          <li>
            Dossier médical et comptes-rendus : durée légale de conservation applicable au dossier
            médical [à préciser].
          </li>
          <li>Journaux d'audit et de connexion : [à préciser, par ex. 1 an].</li>
          <li>Données de paiement : durée légale comptable.</li>
        </ul>
      </section>
      <section>
        <h2>7. Sécurité</h2>
        <p>
          Connexion chiffrée (HTTPS), sessions protégées, codes SMS et double authentification,
          contrôle d'accès strict aux dossiers, documents stockés hors de tout espace public et
          servis après vérification des droits, journal d'audit non modifiable.
        </p>
      </section>
      <section>
        <h2>8. Vos droits</h2>
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression. Depuis
          « Mon dossier », vous pouvez télécharger toutes vos données et supprimer votre compte.
          Pour toute demande :{" "}
          <a href="mailto:dpo@fajma.sn" className="font-semibold text-sunu-green">
            dpo@fajma.sn
          </a>
          . Vous pouvez également saisir la CDP.
        </p>
      </section>
    </LegalLayout>
  );
}
