import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { listSpecialties } from "@/api/directory";
import { SpecialtyIcon } from "@/components/SpecialtyIcon";
import { FajmaMark } from "@/components/FajmaMark";

const qo = queryOptions({ queryKey: ["specialties"], queryFn: () => listSpecialties() });

export const Route = createFileRoute("/specialites/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  head: () => ({
    meta: [
      { title: "Spécialités médicales au Sénégal — Fajma" },
      {
        name: "description",
        content:
          "Parcourez toutes les spécialités médicales disponibles sur Fajma et prenez rendez-vous avec un praticien vérifié à Dakar, Thiès ou Saint-Louis.",
      },
      { property: "og:title", content: "Spécialités médicales — Fajma" },
      {
        property: "og:description",
        content:
          "Cardiologie, pédiatrie, gynécologie et plus : trouvez le bon spécialiste près de chez vous.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <p className="p-10 text-center text-sm">Impossible de charger les spécialités.</p>
  ),
  notFoundComponent: () => <p className="p-10 text-center text-sm">Page introuvable.</p>,
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const { data } = useSuspenseQuery(qo);
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/medecins"
            className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
          >
            <ArrowLeft className="size-4" /> Tous les médecins
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold text-sunu-dark">Spécialités médicales</h1>
        <p className="mt-2 max-w-2xl text-sm text-sunu-ink/60">
          Choisissez une spécialité pour découvrir les praticiens vérifiés et réserver en ligne.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <Link
              key={s.id}
              to="/specialites/$slug"
              params={{ slug: s.slug }}
              className="group rounded-2xl border border-sunu-line bg-sunu-card p-5 transition-shadow hover:shadow-sunu-card"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
                <SpecialtyIcon name={s.icon} />
              </span>
              <h2 className="mt-3 font-bold text-sunu-dark">{s.name}</h2>
              {s.description && (
                <p className="mt-1 line-clamp-2 text-sm text-sunu-ink/60">{s.description}</p>
              )}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sunu-green">
                Voir les médecins{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
