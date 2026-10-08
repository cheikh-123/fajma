/**
 * Bande sponsorisée de l'accueil, placée sous la promesse de Fajma : une ligne compacte (vignette, titre,
 * phrase, bouton) aux couleurs de la campagne. Elle reste dans le premier écran sans passer devant le titre
 * du site. Carrousel automatique s'il y a plusieurs campagnes. Toujours marquée « Sponsorisé ».
 * Animations coupées si l'appareil le demande. N'affiche rien sans campagne validée.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, HeartPulse } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

type Campaign = {
  id: string;
  title: string;
  body: string;
  cta_label: string;
  theme: string;
  image_url: string | null;
  partner: { name: string; logo_url: string | null };
};

// Couleurs de chaque campagne : la teinte vive (bouton, liseré) et la teinte profonde (fond du dégradé).
const THEMES: Record<string, { from: string; to: string }> = {
  vert: { from: "#00a14f", to: "#04512c" },
  rose: { from: "#ec4899", to: "#9d174d" },
  bleu: { from: "#2563eb", to: "#1e3a8a" },
  orange: { from: "#f97316", to: "#9a3412" },
  violet: { from: "#8b5cf6", to: "#4c1d95" },
  rouge: { from: "#e31b23", to: "#7f1d1d" },
};
const ROTATE_MS = 7000;

export function CampaignHero() {
  const { lang } = useI18n();
  const { data } = useQuery({
    queryKey: ["campaign-hero", lang],
    queryFn: () => api.get<Campaign[]>("/campaigns", { placement: "home", all: 1, lang }),
    staleTime: 10 * 60_000,
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const items = data ?? [];
  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [index, items.length, paused]);
  if (!items.length) return null;
  const c = items[index % items.length];
  const theme = THEMES[c.theme] ?? THEMES.vert;
  const open = async () => {
    try {
      const { url } = await api.post<{ url: string }>(`/campaigns/${c.id}/click`, {
        placement: "home",
      });
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* lien indisponible */
    }
  };

  return (
    <section
      aria-label="Campagne sponsorisée"
      aria-roledescription="carrousel"
      className="mx-auto max-w-7xl px-4 pt-2 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        key={c.id}
        className="fajma-campaign relative isolate flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-2xl p-3 text-white sm:p-4"
        style={{
          background: `linear-gradient(100deg, ${theme.from}2e, ${theme.to}14)`,
          border: `1px solid ${theme.from}66`,
        }}
      >
        {/* Vignette : le visuel de l'annonceur, ou le symbole de la campagne. */}
        {c.image_url ? (
          <img
            src={c.image_url}
            alt=""
            className="size-12 shrink-0 rounded-xl object-cover sm:size-14"
          />
        ) : (
          <HeartPulse
            aria-hidden
            className="size-10 shrink-0 sm:size-12"
            style={{ color: theme.from }}
          />
        )}

        <div className="fajma-campaign-text min-w-0 flex-1">
          <p
            className="block w-fit max-w-full truncate rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
            style={{ background: `${theme.from}3d`, color: "#fff" }}
          >
            Sponsorisé · {c.partner.name}
          </p>
          {/* Volontairement pas un titre de page : le premier titre de l'accueil doit rester
              celui de Fajma, pas celui d'un annonceur. */}
          <p className="mt-1.5 text-base font-extrabold leading-tight sm:text-lg">{c.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-white/65 sm:text-sm">{c.body}</p>
        </div>

        <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
          <button
            onClick={open}
            className="fajma-cta inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:scale-105"
            style={{ background: theme.from }}
          >
            {c.cta_label} <ArrowRight className="size-4" />
          </button>
          {items.length > 1 && (
            <div className="flex gap-1.5">
              {items.map((x, i) => (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Campagne ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
                />
              ))}
            </div>
          )}
        </div>

        {items.length > 1 && !paused && (
          <span
            aria-hidden
            key={`p-${index}`}
            className="fajma-progress absolute bottom-0 left-0 h-0.5"
            style={{ background: `${theme.from}b3`, animationDuration: `${ROTATE_MS}ms` }}
          />
        )}
      </div>
    </section>
  );
}
