/**
 * Grand bandeau sponsorisé en haut de l'accueil : visuel de la campagne, couleur de la campagne (rose pour
 * Octobre rose…), animations (entrée, lent zoom du visuel, reflet, bulles), carrousel automatique s'il y a
 * plusieurs campagnes. Toujours marqué « Sponsorisé ». Animations coupées si l'appareil le demande.
 * N'affiche rien sans campagne validée.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, HeartPulse } from "lucide-react";
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

// Dégradés de chaque couleur de campagne (du plus vif au plus profond).
const THEMES: Record<string, { from: string; to: string; glow: string }> = {
  vert: { from: "#00a14f", to: "#04512c", glow: "#7ee2a8" },
  rose: { from: "#ec4899", to: "#9d174d", glow: "#fbcfe8" },
  bleu: { from: "#2563eb", to: "#1e3a8a", glow: "#bfdbfe" },
  orange: { from: "#f97316", to: "#9a3412", glow: "#fed7aa" },
  violet: { from: "#8b5cf6", to: "#4c1d95", glow: "#ddd6fe" },
  rouge: { from: "#e31b23", to: "#7f1d1d", glow: "#fecaca" },
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
  const go = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length);
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
      className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        key={c.id}
        className="fajma-campaign relative isolate overflow-hidden rounded-3xl text-white shadow-xl"
        style={{ background: `linear-gradient(120deg, ${theme.from}, ${theme.to})` }}
      >
        {/* Bulles décoratives et reflet qui balaie le bandeau */}
        <span
          aria-hidden
          className="fajma-float absolute -left-10 -top-10 size-40 rounded-full opacity-25"
          style={{ background: theme.glow }}
        />
        <span
          aria-hidden
          className="fajma-float-slow absolute bottom-[-3rem] left-1/3 size-28 rounded-full opacity-20"
          style={{ background: theme.glow }}
        />
        <span aria-hidden className="fajma-shine pointer-events-none absolute inset-0" />

        <div className="relative grid items-center gap-4 md:grid-cols-[1.15fr_1fr]">
          <div
            className={`fajma-campaign-text z-10 p-6 sm:p-8 md:p-10 ${items.length > 1 ? "sm:pl-16 md:pl-16" : ""}`}
          >
            <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest backdrop-blur">
              Sponsorisé · {c.partner.name}
            </p>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl md:text-4xl">
              {c.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">{c.body}</p>
            <button
              onClick={open}
              className="fajma-cta mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold shadow-lg transition hover:scale-105"
              style={{ color: theme.to }}
            >
              {c.cta_label} <ArrowRight className="size-4" />
            </button>
          </div>
          <div className="relative h-44 overflow-hidden sm:h-56 md:h-full md:min-h-[18rem]">
            {c.image_url ? (
              <img
                src={c.image_url}
                alt=""
                className="fajma-kenburns absolute inset-0 size-full object-cover md:[mask-image:linear-gradient(to_right,transparent,black_30%)]"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <HeartPulse className="fajma-float size-28 text-white/80" />
              </div>
            )}
          </div>
        </div>

        {items.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Campagne précédente"
              className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/20 p-2 backdrop-blur hover:bg-black/30 sm:block"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Campagne suivante"
              className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/20 p-2 backdrop-blur hover:bg-black/30 sm:block"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {items.map((x, i) => (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Campagne ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/50"}`}
                />
              ))}
            </div>
            {!paused && (
              <span
                aria-hidden
                key={`p-${index}`}
                className="fajma-progress absolute bottom-0 left-0 h-1 bg-white/70"
                style={{ animationDuration: `${ROTATE_MS}ms` }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
