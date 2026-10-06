/**
 * Accueil : bande « Nos partenaires » — logos qui défilent en continu (pause au survol), lien vers la page
 * complète. N'affiche rien tant qu'aucun partenaire n'est public.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Handshake } from "lucide-react";
import { api } from "@/api/client";

type Partner = { id: string; name: string; kind_label: string; logo_url: string | null };

function Badge({ p }: { p: Partner }) {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-sunu-line bg-sunu-card px-5 py-3">
      {p.logo_url ? (
        <img src={p.logo_url} alt="" className="size-10 rounded-lg object-contain" />
      ) : (
        <span className="grid size-10 place-items-center rounded-lg bg-sunu-green-soft font-bold text-sunu-green">
          {p.name.slice(0, 1)}
        </span>
      )}
      <span className="max-w-80">
        <span className="block truncate text-sm font-semibold text-sunu-dark">{p.name}</span>
        <span className="block text-xs text-sunu-ink/55">{p.kind_label}</span>
      </span>
    </div>
  );
}

export function PartnersStrip() {
  const { data } = useQuery({
    queryKey: ["partners"],
    queryFn: () => api.get<Partner[]>("/partners"),
    staleTime: 10 * 60_000,
  });
  if (!data?.length) return null;
  // Liste doublée : le défilement boucle sans saut.
  const loop = data.length > 2 ? [...data, ...data] : data;
  return (
    <section aria-label="Nos partenaires" className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green">
            <Handshake className="size-4" /> Nos partenaires
          </p>
          <h2 className="mt-1 text-2xl font-bold text-sunu-dark">
            Ils construisent Fajma avec nous
          </h2>
        </div>
        <Link
          to="/partenaires"
          className="flex items-center gap-1 text-sm font-semibold text-sunu-green"
        >
          Tous nos partenaires <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="fajma-marquee-mask mt-6 overflow-hidden">
        <div className={`flex w-max gap-4 ${data.length > 2 ? "fajma-marquee" : ""}`}>
          {loop.map((p, i) => (
            <Badge key={`${p.id}-${i}`} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
