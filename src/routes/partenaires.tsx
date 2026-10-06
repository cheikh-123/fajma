/** Page publique « Nos partenaires » : assurances, opérateurs, institutions et ONG qui soutiennent Fajma. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Handshake } from "lucide-react";
import { api } from "@/api/client";
import { FajmaMark } from "@/components/FajmaMark";
import { ThemeToggle } from "@/lib/theme";

type Partner = {
  id: string;
  name: string;
  kind_label: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
};

export const Route = createFileRoute("/partenaires")({
  head: () => ({
    meta: [
      { title: "Nos partenaires — Fajma" },
      {
        name: "description",
        content: "Les assurances, opérateurs, institutions et organisations partenaires de Fajma.",
      },
    ],
  }),
  component: PartnersPage,
});

function PartnersPage() {
  const { data } = useQuery({
    queryKey: ["partners"],
    queryFn: () => api.get<Partner[]>("/partners"),
  });
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green">
          <Handshake className="size-4" /> Partenaires
        </p>
        <h1 className="mt-2 text-3xl font-bold text-sunu-dark">Ils construisent Fajma avec nous</h1>
        <p className="mt-2 max-w-2xl text-sm text-sunu-ink/65">
          Assurances et mutuelles, opérateurs, pharmacies et laboratoires, institutions et
          organisations de santé. Nos partenaires ne choisissent jamais l'ordre des médecins
          affichés et n'ont aucun accès à vos données de santé.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((p) => (
            <article key={p.id} className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
              <div className="flex items-center gap-3">
                {p.logo_url ? (
                  <img
                    src={p.logo_url}
                    alt={p.name}
                    className="size-14 rounded-xl object-contain"
                  />
                ) : (
                  <span className="grid size-14 place-items-center rounded-xl bg-sunu-green-soft text-lg font-bold text-sunu-green">
                    {p.name.slice(0, 1)}
                  </span>
                )}
                <div>
                  <h2 className="font-bold text-sunu-dark">{p.name}</h2>
                  <p className="text-xs text-sunu-ink/55">{p.kind_label}</p>
                </div>
              </div>
              {p.description && <p className="mt-3 text-sm text-sunu-ink/70">{p.description}</p>}
              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sunu-green"
                >
                  <ExternalLink className="size-3.5" /> Site web
                </a>
              )}
            </article>
          ))}
          {data && data.length === 0 && (
            <p className="text-sm text-sunu-ink/55">
              Les premiers partenariats sont en préparation.
            </p>
          )}
        </div>
        <p className="mt-10 text-sm text-sunu-ink/65">
          Devenir partenaire ou lancer une campagne de prévention :{" "}
          <Link to="/aide" className="font-semibold text-sunu-green">
            écrivez-nous
          </Link>
          . Les campagnes respectent notre{" "}
          <Link to="/cgu" hash="publicite" className="font-semibold text-sunu-green">
            charte publicitaire
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
