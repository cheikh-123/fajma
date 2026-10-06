/**
 * Encart sponsorisé (campagne validée par Fajma) : toujours marqué « Sponsorisé », jamais mêlé aux résultats,
 * ciblé seulement par ville et langue. N'affiche rien s'il n'y a pas de campagne.
 */
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

type Campaign = {
  id: string;
  title: string;
  body: string;
  cta_label: string;
  placement: string;
  partner: { name: string; logo_url: string | null };
} | null;

export function CampaignSlot({
  placement,
  city,
  className = "",
}: {
  placement: "home" | "search" | "patient";
  city?: string | null;
  className?: string;
}) {
  const { lang } = useI18n();
  const { data } = useQuery({
    queryKey: ["campaign", placement, city ?? "", lang],
    queryFn: () => api.get<Campaign>("/campaigns", { placement, city: city || undefined, lang }),
    staleTime: 10 * 60_000,
  });
  if (!data) return null;
  const open = async () => {
    try {
      const { url } = await api.post<{ url: string }>(`/campaigns/${data.id}/click`, { placement });
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* lien indisponible */
    }
  };
  return (
    <aside
      aria-label="Contenu sponsorisé"
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-sunu-line bg-sunu-card p-4 ${className}`}
    >
      {data.partner.logo_url ? (
        <img
          src={data.partner.logo_url}
          alt={data.partner.name}
          className="size-12 shrink-0 rounded-xl object-contain"
        />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
          <Megaphone className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sunu-ink/45">
          Sponsorisé · {data.partner.name}
        </p>
        <p className="font-semibold text-sunu-dark">{data.title}</p>
        <p className="text-xs text-sunu-ink/65">{data.body}</p>
      </div>
      <button
        onClick={open}
        className="w-full shrink-0 rounded-full border border-sunu-green px-3 py-1.5 text-xs font-semibold text-sunu-green hover:bg-sunu-green-soft sm:w-auto"
      >
        {data.cta_label}
      </button>
    </aside>
  );
}
