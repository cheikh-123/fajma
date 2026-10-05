/**
 * Carte du Sénégal de l'accueil : vrais contours, villes à leurs coordonnées, médecins publiés regroupés par
 * zone (données réelles du serveur). Chaque ville ouvre la recherche de médecins de cette ville.
 */
import { Link } from "@tanstack/react-router";
import { MAP_CITIES, SENEGAL_MAP } from "@/lib/senegal-map";

type Place = [number, number, number];

const { width: W, height: H, bounds: B } = SENEGAL_MAP;
const project = (lat: number, lng: number) => ({
  x: B.pad + (lng - B.lon0) * B.k * B.scale,
  y: B.pad + (B.lat1 - lat) * B.scale,
});

/** Médecins à moins de ~25 km d'une ville (distance mesurée sur le dessin : 1° ≈ 111 km). */
function doctorsNear(city: { x: number; y: number }, places: Place[]) {
  const radius = (25 / 111) * B.scale;
  return places.reduce((sum, [lat, lng, n]) => {
    const p = project(lat, lng);
    return Math.hypot(p.x - city.x, p.y - city.y) <= radius ? sum + n : sum;
  }, 0);
}

export function SenegalMap({ places = [] }: { places?: Place[] }) {
  const total = places.reduce((s, [, , n]) => s + n, 0);
  return (
    <figure className="relative m-0 w-full" aria-label="Carte du Sénégal : médecins et villes">
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden="true">
          <path
            d={SENEGAL_MAP.senegal}
            fill="var(--sunu-green-soft)"
            stroke="var(--sunu-green)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d={SENEGAL_MAP.gambia}
            fill="var(--sunu-surface)"
            stroke="var(--sunu-line)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {places.map(([lat, lng, n]) => {
            const p = project(lat, lng);
            return (
              <circle
                key={`${lat},${lng}`}
                cx={p.x}
                cy={p.y}
                r={4 + Math.sqrt(n) * 2.6}
                fill="var(--sunu-green)"
                fillOpacity="0.28"
                stroke="var(--sunu-green)"
                strokeWidth="1.2"
              />
            );
          })}
        </svg>
        {/* Gambie : nom discret, pour situer la carte */}
        <span
          className="pointer-events-none absolute -translate-x-1/2 text-[10px] font-semibold uppercase tracking-widest text-sunu-ink/45"
          style={{ left: `${(230 / W) * 100}%`, top: `${(318 / H) * 100}%` }}
        >
          Gambie
        </span>
        {MAP_CITIES.map((c) => {
          const n = doctorsNear(c, places);
          const label = n > 0 ? `${c.name} · ${n}` : c.name;
          // Sur téléphone, les étiquettes « à gauche » passent sous le point (sinon elles sortent de l'écran).
          const below = "top-full mt-1 left-1/2 -translate-x-1/2";
          const side =
            c.side === "left"
              ? `${below} sm:top-1/2 sm:mt-0 sm:left-auto sm:right-full sm:mr-1.5 sm:translate-x-0 sm:-translate-y-1/2`
              : c.side === "right"
                ? "left-full ml-1.5 top-1/2 -translate-y-1/2"
                : below;
          const visible = c.major || n > 0 ? "" : "hidden sm:block";
          return (
            <Link
              key={c.name}
              to="/medecins"
              search={{ city: c.name }}
              aria-label={`Médecins à ${c.name}${n ? ` (${n})` : ""}`}
              className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunu-green"
              style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%` }}
            >
              <span
                className={`block rounded-full border-2 border-sunu-card ${n > 0 ? "size-3 bg-sunu-green" : "size-2 bg-sunu-ink/45"} transition group-hover:scale-125`}
              />
              <span
                className={`absolute ${side} ${visible} whitespace-nowrap rounded px-1 text-[11px] leading-4 sm:text-xs ${n > 0 ? "bg-sunu-card/85 font-bold text-sunu-dark" : "font-semibold text-sunu-ink/60"} group-hover:text-sunu-green`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sunu-ink/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full border border-sunu-green bg-sunu-green/30" />
          {total > 0
            ? `${total} médecin${total > 1 ? "s" : ""} publiés, placés à leur cabinet`
            : "Les cabinets apparaîtront ici"}
        </span>
        <span>Touchez une ville pour voir ses médecins</span>
      </figcaption>
    </figure>
  );
}
