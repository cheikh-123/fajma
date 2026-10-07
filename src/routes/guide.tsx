/**
 * Guide d'utilisation : un chapitre par espace (patient, famille, médecin, clinique, pharmacie, laboratoire,
 * relais, administration), sommaire, recherche, impression. Le lien « Aide » de chaque espace ouvre son chapitre.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { useMemo, useState } from "react";
import { z } from "zod";
import { BookOpen, Lightbulb, LifeBuoy, Printer, Search } from "lucide-react";
import { FajmaMark } from "@/components/FajmaMark";
import { GUIDE, type GuideRoleId, type GuideSection } from "@/lib/guide-content";
import { ThemeToggle } from "@/lib/theme";

const ROLE_IDS = GUIDE.map((r) => r.id) as [GuideRoleId, ...GuideRoleId[]];

export const Route = createFileRoute("/guide")({
  validateSearch: (s) => z.object({ role: z.enum(ROLE_IDS).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Guide d'utilisation — Fajma" },
      {
        name: "description",
        content:
          "Comment utiliser Fajma pas à pas : patients, familles, médecins, cliniques, pharmacies, laboratoires et relais communautaires.",
      },
    ],
  }),
  component: GuidePage,
});

function matches(s: GuideSection, needle: string) {
  return [s.title, s.intro, s.tip, ...(s.steps ?? []), ...(s.points ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function GuidePage() {
  const { role = "patient" } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const current = GUIDE.find((r) => r.id === role) ?? GUIDE[0];
  // Recherche : dans tous les chapitres à la fois.
  const results = useMemo(
    () =>
      needle.length >= 2
        ? GUIDE.flatMap((r) =>
            r.sections.filter((s) => matches(s, needle)).map((s) => ({ role: r, s })),
          )
        : [],
    [needle],
  );

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BackButton to="/" />
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto" />
          <Link
            to="/aide"
            aria-label="Contacter l'équipe Fajma"
            className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
          >
            <LifeBuoy className="size-4" />{" "}
            <span className="hidden sm:inline">Contacter l'équipe</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green print:hidden">
          <BookOpen className="size-4" /> Guide d'utilisation
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 print:hidden">
          <h1 className="text-3xl font-bold text-sunu-dark">Comment utiliser Fajma</h1>
          <label className="flex w-full items-center gap-2 rounded-xl border border-sunu-line bg-sunu-card px-3 py-2 sm:w-80">
            <Search className="size-4 text-sunu-ink/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher : ordonnance, annuler, crédit…"
              aria-label="Chercher dans le guide"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <nav aria-label="Espaces" className="mt-5 flex gap-1.5 overflow-x-auto pb-1 print:hidden">
          {GUIDE.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setQ("");
                navigate({ to: "/guide", search: { role: r.id } });
              }}
              aria-current={r.id === current.id ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${r.id === current.id ? "bg-sunu-green text-white" : "bg-sunu-card text-sunu-ink/65 ring-1 ring-sunu-line hover:text-sunu-green"}`}
            >
              {r.label}
            </button>
          ))}
        </nav>

        {needle.length >= 2 ? (
          <section aria-label="Résultats de recherche" className="mt-8 space-y-4">
            <p className="text-sm text-sunu-ink/60">
              {results.length} résultat{results.length > 1 ? "s" : ""} pour « {q.trim()} »
            </p>
            {results.map(({ role: r, s }) => (
              <div key={`${r.id}-${s.id}`}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-sunu-green">
                  {r.label}
                </p>
                <SectionCard s={s} />
              </div>
            ))}
          </section>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[230px_1fr]">
            <aside className="self-start lg:sticky lg:top-6 print:hidden">
              <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
                Sommaire
              </p>
              <ol className="mt-2 space-y-1 text-sm">
                {current.sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block rounded-lg px-2 py-1.5 text-sunu-ink/70 hover:bg-sunu-card hover:text-sunu-green"
                    >
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => window.print()}
                className="mt-4 flex items-center gap-1.5 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-xs font-semibold text-sunu-ink/70"
              >
                <Printer className="size-4" /> Imprimer ce guide
              </button>
            </aside>
            <article>
              <h2 className="text-2xl font-bold text-sunu-dark">{current.title}</h2>
              <p className="mt-2 max-w-3xl text-sunu-ink/70">{current.intro}</p>
              <div className="mt-6 space-y-5">
                {current.sections.map((s, i) => (
                  <SectionCard key={s.id} s={s} index={i + 1} />
                ))}
              </div>
              <p className="mt-8 rounded-2xl bg-sunu-green-soft p-4 text-sm text-sunu-dark print:hidden">
                Vous ne trouvez pas la réponse ?{" "}
                <Link to="/aide" className="font-semibold text-sunu-green">
                  Écrivez à l'équipe Fajma
                </Link>{" "}
                : nous répondons par email ou par téléphone, les jours ouvrés.
              </p>
            </article>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionCard({ s, index }: { s: GuideSection; index?: number }) {
  return (
    <section
      id={s.id}
      className="scroll-mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-5 print:break-inside-avoid"
    >
      <h3 className="flex items-center gap-2.5 text-lg font-bold text-sunu-dark">
        {index != null && (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunu-green text-sm text-white">
            {index}
          </span>
        )}
        {s.title}
      </h3>
      {s.intro && <p className="mt-2 text-sm text-sunu-ink/65">{s.intro}</p>}
      {s.steps && (
        <ol className="mt-3 space-y-2">
          {s.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-sunu-ink/80">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sunu-green-soft text-[11px] font-bold text-sunu-green">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {s.points && (
        <ul className="mt-3 space-y-1.5">
          {s.points.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-sunu-ink/80">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sunu-green" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      {s.tip && (
        <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Lightbulb className="mt-0.5 size-4 shrink-0" /> {s.tip}
        </p>
      )}
    </section>
  );
}
