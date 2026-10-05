import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { getPublicPlans } from "@/api/finance";
import { ThemeToggle } from "@/lib/theme";
import { FajmaMark } from "@/components/FajmaMark";

const qo = queryOptions({ queryKey: ["public-plans"], queryFn: getPublicPlans });

export const Route = createFileRoute("/tarifs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  head: () => ({
    meta: [
      { title: "Tarifs pour les professionnels — Fajma" },
      {
        name: "description",
        content:
          "Formules Fajma pour médecins et cliniques : inscription gratuite, agenda en ligne, rappels SMS, téléconsultation et paiement Wave / Orange Money.",
      },
    ],
  }),
  errorComponent: () => (
    <p className="p-10 text-center text-sm">Impossible de charger les tarifs.</p>
  ),
  component: PricingPage,
});

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

function PricingPage() {
  const { data } = useSuspenseQuery(qo);
  const [months, setMonths] = useState(1);
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
          >
            <ArrowLeft className="size-4" /> Accueil
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
          Pour les professionnels de santé
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
          Des tarifs simples, sans engagement
        </h1>
        <p className="mt-3 max-w-2xl text-sunu-ink/60">
          L'inscription est gratuite. Vous ne payez une commission que sur les consultations réglées
          en ligne (Wave, Orange Money, Free Money, carte) ; les paiements en espèces au cabinet ne
          passent pas par Fajma. Pour le patient, Fajma est toujours gratuit.
        </p>

        <div
          role="radiogroup"
          aria-label="Durée d'abonnement"
          className="mt-8 inline-flex rounded-xl border border-sunu-line bg-sunu-card p-1"
        >
          {data.durations.map((d) => (
            <button
              key={d.months}
              role="radio"
              aria-checked={months === d.months}
              onClick={() => setMonths(d.months)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${months === d.months ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
            >
              {d.months} mois
              {d.discount_percent ? (
                <span className="ml-1 text-xs opacity-80">(−{d.discount_percent} %)</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="stagger mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {data.plans.map((p) => {
            const price = p.prices[String(months)] ?? p.monthly_price * months;
            const featured = p.id === "pro";
            return (
              <article
                key={p.id}
                className={`flex min-w-0 flex-col rounded-3xl border bg-sunu-card p-6 ${featured ? "border-sunu-green shadow-sunu-card" : "border-sunu-line"}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-sunu-dark">{p.name}</h2>
                  {featured && (
                    <span className="rounded-full bg-sunu-green-soft px-2.5 py-0.5 text-xs font-bold text-sunu-green">
                      Le plus choisi
                    </span>
                  )}
                </div>
                <p className="mt-4 text-3xl font-bold text-sunu-dark">
                  {p.monthly_price === 0 ? "Gratuit" : fcfa(price)}
                  {p.monthly_price > 0 && (
                    <span className="text-sm font-medium text-sunu-ink/50">
                      {" "}
                      / {months === 1 ? "mois" : `${months} mois`}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-sunu-ink/60">
                  Commission de <b>{p.commission_percent.toLocaleString("fr-FR")} %</b> sur les
                  paiements en ligne
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-sunu-ink/80">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-sunu-green" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/pro"
                  className={`mt-6 rounded-xl px-4 py-2.5 text-center text-sm font-bold ${featured ? "bg-sunu-green text-white hover:bg-sunu-green/90" : "border border-sunu-line text-sunu-dark hover:border-sunu-green"}`}
                >
                  {p.monthly_price === 0 ? "Créer ma fiche gratuitement" : "Commencer gratuitement"}
                </Link>
              </article>
            );
          })}
        </div>

        <section className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {[
            [
              "Comment ça marche ?",
              "Créez votre compte, remplissez votre fiche et déposez votre justificatif d'inscription à l'Ordre. Après vérification par l'équipe Fajma, votre fiche est publiée et les patients peuvent réserver.",
            ],
            [
              "Changer de formule",
              "Vous commencez en Essentiel. Passez en Pro ou Clinique depuis votre espace (onglet Finances), payé par Wave ou Orange Money. Sans renouvellement, vous revenez automatiquement à Essentiel.",
            ],
            [
              "Quand suis-je payé ?",
              "Les consultations réglées en ligne s'ajoutent à votre solde, commission déduite. Vous demandez un virement dès 5 000 F depuis votre espace.",
            ],
            [
              "Secrétariat et cliniques",
              "Le secrétariat (rendez-vous pris au téléphone ou au guichet, patients sans compte) est inclus dans toutes les formules. Chaque médecin choisit sa formule ; la formule Clinique convient aux praticiens qui encaissent beaucoup en ligne (commission 2 %).",
            ],
          ].map(([q, a]) => (
            <div key={q} className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
              <h3 className="font-bold text-sunu-dark">{q}</h3>
              <p className="mt-2 text-sm text-sunu-ink/65">{a}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
