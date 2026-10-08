/**
 * Bandeau sponsorisé en haut de l'accueil : le visuel de la campagne occupe tout le cadre, un voile sombre
 * passe dessous pour que le titre et le bouton restent lisibles quelle que soit l'image fournie par
 * l'annonceur. Carrousel automatique s'il y a plusieurs campagnes, avec une pagination discrète en bas à
 * droite. Toujours marqué « Sponsorisé ». Animations coupées si l'appareil le demande.
 * N'affiche rien sans campagne validée.
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

// Couleurs de chaque campagne : la teinte vive, la teinte profonde, et le fond très sombre sur lequel
// le voile se fond. Le bouton blanc reprend `base` pour son texte.
const THEMES: Record<string, { from: string; to: string; base: string }> = {
  vert: { from: "#00a14f", to: "#04512c", base: "#04150c" },
  rose: { from: "#ec4899", to: "#9d174d", base: "#2a0a1a" },
  bleu: { from: "#2563eb", to: "#1e3a8a", base: "#0a1026" },
  orange: { from: "#f97316", to: "#9a3412", base: "#241004" },
  violet: { from: "#8b5cf6", to: "#4c1d95", base: "#140826" },
  rouge: { from: "#e31b23", to: "#7f1d1d", base: "#230808" },
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
      className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        key={c.id}
        className="fajma-campaign relative isolate min-h-[11rem] overflow-hidden rounded-2xl text-white shadow-xl"
        style={{ backgroundColor: theme.base }}
      >
        {/* Le visuel : l'image de l'annonceur, ou un dégradé de la couleur de la campagne. */}
        {c.image_url ? (
          <img
            src={c.image_url}
            alt=""
            className="fajma-kenburns absolute inset-0 size-full object-cover"
          />
        ) : (
          <>
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 90% at 78% 30%, ${theme.from} 0%, ${theme.to} 42%, ${theme.base} 78%)`,
              }}
            />
            <HeartPulse
              aria-hidden
              className="fajma-float absolute right-[7%] top-1/2 size-24 -translate-y-1/2 text-white/85 sm:size-32"
            />
          </>
        )}

        {/* Voile : vertical sur téléphone (texte en bas), latéral dès que l'écran s'élargit. */}
        <span
          aria-hidden
          className="absolute inset-0 sm:hidden"
          style={{
            background: `linear-gradient(to top, ${theme.base}f2 18%, ${theme.base}b8 55%, transparent 100%)`,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 hidden sm:block"
          style={{
            background: `linear-gradient(95deg, ${theme.base}e0 0%, ${theme.base}a8 42%, transparent 74%)`,
          }}
        />

        <div className="fajma-campaign-text relative flex min-h-[11rem] flex-col justify-end p-5 sm:max-w-[62%] sm:justify-center sm:p-6 md:p-7">
          <p className="block w-fit max-w-full truncate rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest backdrop-blur">
            Sponsorisé · {c.partner.name}
          </p>
          {/* Volontairement pas un titre de page : le premier titre de l'accueil doit rester
              celui de Fajma, pas celui d'un annonceur. */}
          <p className="mt-3 text-xl font-extrabold leading-tight sm:text-2xl">{c.title}</p>
          <p className="mt-2 max-w-xl text-sm text-white/85">{c.body}</p>
          <button
            onClick={open}
            className="fajma-cta mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-lg transition hover:scale-105"
            style={{ color: theme.base }}
          >
            {c.cta_label} <ArrowRight className="size-4" />
          </button>
        </div>

        {items.length > 1 && (
          <>
            <div className="absolute bottom-3 right-4 z-20 flex gap-1.5">
              {items.map((x, i) => (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Campagne ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70"}`}
                />
              ))}
            </div>
            {!paused && (
              <span
                aria-hidden
                key={`p-${index}`}
                className="fajma-progress absolute bottom-0 left-0 h-0.5 bg-white/60"
                style={{ animationDuration: `${ROTATE_MS}ms` }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
