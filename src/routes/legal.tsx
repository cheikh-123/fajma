import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Mentions légales — Fajma" },
      { name: "description", content: "Éditeur, hébergement et contact de la plateforme Fajma." },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  return (
    <LegalLayout title="Mentions légales" updated="29 septembre 2026">
      <section>
        <h2>Éditeur</h2>
        <p>
          [Raison sociale, forme juridique, capital, adresse du siège, RCCM, NINEA — à compléter],
          Dakar, Sénégal. Directeur de la publication : [à compléter]. Contact :{" "}
          <a href="mailto:contact@fajma.sn" className="font-semibold text-sunu-green">
            contact@fajma.sn
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>
          [Nom, adresse et coordonnées de l'hébergeur — hébergement des données de santé au Sénégal
          visé.]
        </p>
      </section>
      <section>
        <h2>Nature du service</h2>
        <p>
          Fajma est une plateforme de mise en relation entre patients et professionnels de santé.
          Elle n'est pas un établissement de santé et ne fournit pas d'acte médical.{" "}
          <b>En cas d'urgence, appelez le SAMU au 1515.</b>
        </p>
      </section>
      <section>
        <h2>Conditions et données personnelles</h2>
        <p>
          Voir les{" "}
          <a href="/cgu" className="font-semibold text-sunu-green">
            conditions générales d'utilisation
          </a>{" "}
          et la{" "}
          <a href="/confidentialite" className="font-semibold text-sunu-green">
            politique de confidentialité
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Sources</h2>
        <p>
          Liste des villes, villages et quartiers du Sénégal : données{" "}
          <a href="https://www.geonames.org/" className="font-semibold text-sunu-green">
            GeoNames
          </a>
          , sous licence CC BY 4.0.
        </p>
      </section>
    </LegalLayout>
  );
}
