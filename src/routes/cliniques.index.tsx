import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Building2, Heart, MapPin, Stethoscope } from "lucide-react";
import { listPublicClinics } from "@/api/directory";
import { LanguageSwitcher } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/cliniques/")({
  head: () => ({
    meta: [
      { title: "Cliniques et centres de santé — Fajma" },
      {
        name: "description",
        content:
          "Cliniques et centres de santé vérifiés au Sénégal : médecins, spécialités, prise de rendez-vous en ligne.",
      },
    ],
  }),
  component: ClinicsPage,
});

function ClinicsPage() {
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["public-clinics", city.trim(), q.trim()],
    queryFn: () => listPublicClinics({ city: city.trim() || undefined, q: q.trim() || undefined }),
  });
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/medecins"
              className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <ArrowLeft className="size-4" /> Médecins
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sunu-dark">
          <Building2 className="size-6 text-sunu-green" /> Cliniques et centres de santé
        </h1>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom de l'établissement"
            aria-label="Nom de l'établissement"
            className="rounded-xl border border-sunu-line bg-sunu-card px-4 py-2.5 text-sm"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ville (Dakar, Thiès…)"
            aria-label="Ville"
            className="rounded-xl border border-sunu-line bg-sunu-card px-4 py-2.5 text-sm"
          />
        </div>
        {isLoading ? null : (data ?? []).length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/60">
            Aucun établissement ne correspond à votre recherche.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {(data ?? []).map((c) => (
              <Link
                key={c.id}
                to="/cliniques/$id"
                params={{ id: c.id }}
                className="rounded-2xl border border-sunu-line bg-sunu-card p-5 transition hover:border-sunu-green"
              >
                <h2 className="font-bold text-sunu-dark">{c.name}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-sunu-ink/60">
                  <MapPin className="size-4 text-sunu-green" /> {c.address ? `${c.address}, ` : ""}
                  {c.city}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-sunu-ink/70">
                  <Stethoscope className="size-4 text-sunu-teal" /> {c.doctors_count} médecin
                  {c.doctors_count > 1 ? "s" : ""}
                  {c.specialties.length ? ` · ${c.specialties.slice(0, 4).join(", ")}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
