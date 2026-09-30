import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, MapPin, Phone, Clock, Navigation, Search, Moon } from "lucide-react";
import { listPharmacies } from "@/api/directory";
import { MedicineAvailability } from "@/components/pharmacy/MedicineAvailability";

const pharmaciesQO = queryOptions({
  queryKey: ["pharmacies"],
  queryFn: () => listPharmacies({ data: {} }),
});

export const Route = createFileRoute("/pharmacies")({
  loader: ({ context }) => context.queryClient.ensureQueryData(pharmaciesQO),
  head: () => ({
    meta: [
      { title: "Pharmacies de garde au Sénégal — Fajma" },
      {
        name: "description",
        content:
          "Trouvez la pharmacie la plus proche à Dakar, Thiès, Saint-Louis ou Ziguinchor, avec horaires, téléphone et pharmacies de garde 24h/24.",
      },
      { property: "og:title", content: "Pharmacies de garde — Fajma" },
      {
        property: "og:description",
        content: "Pharmacies géolocalisées au Sénégal : horaires, contact et itinéraire.",
      },
    ],
  }),
  component: PharmaciesPage,
});

function PharmaciesPage() {
  const { data: all } = useSuspenseQuery(pharmaciesQO);
  const [city, setCity] = useState("");
  const [onDuty, setOnDuty] = useState(false);
  const [q, setQ] = useState("");

  const cities = Array.from(new Set(all.map((p) => p.city))).sort();
  const list = all.filter(
    (p) =>
      (!city || p.city === city) &&
      (!onDuty || p.is_on_duty) &&
      (!q || `${p.name} ${p.district ?? ""} ${p.address}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <nav className="flex items-center gap-5 text-sm font-medium text-sunu-ink/70">
            <Link to="/medecins" className="hidden hover:text-sunu-green sm:inline">
              Médecins
            </Link>
            <Link to="/assistant" className="hidden hover:text-sunu-green sm:inline">
              Assistant IA
            </Link>
            <Link
              to="/auth"
              className="whitespace-nowrap rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white hover:bg-sunu-green/90"
            >
              Se connecter
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold text-sunu-dark md:text-4xl">
          Pharmacies près de chez vous
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-sunu-ink/60">
          {all.length} pharmacies partenaires géolocalisées. Filtrez par ville ou affichez
          uniquement les pharmacies de garde.
        </p>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-4 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-sunu-surface px-3 py-2.5">
            <Search className="size-4 text-sunu-ink/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={80}
              placeholder="Nom, quartier, adresse…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-xl bg-sunu-surface px-3 py-2.5 text-sm outline-none"
          >
            <option value="">Toutes les villes</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => setOnDuty((v) => !v)}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              onDuty ? "bg-sunu-green text-white" : "bg-sunu-surface text-sunu-ink/70"
            }`}
          >
            <Moon className="size-4" /> De garde
          </button>
        </div>

        {list.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/60">
            Aucune pharmacie ne correspond à votre recherche.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {list.map((p) => (
              <article key={p.id} className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-sunu-dark">{p.name}</h2>
                    <p className="mt-0.5 text-sm text-sunu-ink/60">
                      {p.district ? `${p.district} · ` : ""}
                      {p.city}
                    </p>
                  </div>
                  {p.is_on_duty && (
                    <span className="shrink-0 rounded-full bg-sunu-teal/15 px-2.5 py-1 text-right text-[11px] font-bold text-sunu-teal">
                      De garde
                      {p.on_duty_until && (
                        <span className="block font-normal">
                          jusqu'au{" "}
                          {new Date(p.on_duty_until).toLocaleString("fr-FR", {
                            timeZone: "Africa/Dakar",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-sunu-ink/70">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-sunu-green" /> {p.address}
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-sm text-sunu-ink/70">
                  <Clock className="size-4 text-sunu-green" />
                  {openNow(p) ? (
                    <span className="font-semibold text-sunu-green">Ouverte</span>
                  ) : (
                    <span className="font-semibold text-sunu-ink/50">Fermée</span>
                  )}
                  <span>
                    ·{" "}
                    {p.opens_at.startsWith("00:00") && p.closes_at.startsWith("23:59")
                      ? "24 h/24"
                      : `${p.opens_at.slice(0, 5)} – ${p.closes_at.slice(0, 5)}`}
                  </span>
                  {p.open_days && p.open_days.length < 7 && (
                    <span className="text-xs text-sunu-ink/50">
                      · fermé{" "}
                      {["dim", "lun", "mar", "mer", "jeu", "ven", "sam"]
                        .filter((_, i) => !p.open_days?.includes(i))
                        .join(", ")}
                    </span>
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.phone && (
                    <a
                      href={`tel:${p.phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
                    >
                      <Phone className="size-3.5" /> {p.phone}
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white hover:bg-sunu-green/90"
                  >
                    <Navigation className="size-3.5" /> Itinéraire
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
        <MedicineAvailability />
      </main>
    </div>
  );
}

/** Ouverte en ce moment (heure de Dakar = UTC) : de garde, ou jour d'ouverture et dans les horaires. */
function openNow(p: {
  opens_at: string;
  closes_at: string;
  open_days?: number[] | null;
  is_on_duty?: boolean;
}) {
  if (p.is_on_duty) return true;
  const now = new Date();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const open = toMin(p.opens_at);
  const close = toMin(p.closes_at);
  const days = p.open_days ?? [1, 2, 3, 4, 5, 6];
  if (close > open) return days.includes(now.getUTCDay()) && minutes >= open && minutes < close;
  // Horaires de nuit (ex. 20:00 – 08:00) : ouverte après l'ouverture ou avant la fermeture.
  const yesterday = (now.getUTCDay() + 6) % 7;
  return (
    (days.includes(now.getUTCDay()) && minutes >= open) ||
    (days.includes(yesterday) && minutes < close)
  );
}
