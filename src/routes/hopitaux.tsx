/**
 * Ticket virtuel : le patient choisit l'hôpital et le service, voit l'attente en direct et prend son numéro
 * depuis chez lui. Sans internet : menu « Ticket hôpital » par USSD ou WhatsApp.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Clock,
  Hospital,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Search,
  Smartphone,
  Ticket,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/api/auth";
import { etaLabel, listFacilities, takeTicket, type Facility } from "@/api/queues";
import { FajmaMark } from "@/components/FajmaMark";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/hopitaux")({
  head: () => ({
    meta: [
      { title: "Ticket virtuel à l'hôpital — Fajma" },
      {
        name: "description",
        content:
          "Prenez votre numéro à l'hôpital ou au centre de santé depuis chez vous, suivez l'attente en direct et partez au bon moment. Aussi par USSD et WhatsApp.",
      },
      { property: "og:title", content: "Ticket virtuel à l'hôpital — Fajma" },
    ],
  }),
  component: HospitalsPage,
});

const TRAVEL = [
  { value: 0, label: "Je suis déjà sur place" },
  { value: 15, label: "À 15 min" },
  { value: 30, label: "À 30 min" },
  { value: 45, label: "À 45 min" },
  { value: 60, label: "À 1 h" },
  { value: 90, label: "À 1 h 30 ou plus" },
];

function HospitalsPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["queue-facilities"],
    queryFn: () => listFacilities(),
    refetchInterval: 30_000,
  });
  const cities = Array.from(new Set((data ?? []).map((f) => f.city))).sort();
  const needle = q.trim().toLowerCase();
  const list = (data ?? []).filter(
    (f) =>
      (!city || f.city === city) &&
      (!needle ||
        `${f.name} ${f.district ?? ""} ${f.city} ${f.services.map((s) => s.name).join(" ")}`
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/mon-espace"
            className="whitespace-nowrap rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
          >
            Mon espace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green">
          <Ticket className="size-4" /> Ticket virtuel
        </p>
        <h1 className="mt-2 text-3xl font-bold text-sunu-dark md:text-4xl">
          Fini la file d'attente dès 5 h du matin
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-sunu-ink/65">
          Prenez votre numéro depuis chez vous, suivez votre place en direct et recevez un SMS quand
          il faut partir. Votre tour arrive, vous aussi.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-full bg-sunu-card px-3 py-1.5 text-sunu-ink/70 ring-1 ring-sunu-line">
            <Smartphone className="size-3.5 text-sunu-green" /> Sans internet : composez le code
            USSD Fajma, choix 5 « Ticket hôpital »
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-sunu-card px-3 py-1.5 text-sunu-ink/70 ring-1 ring-sunu-line">
            <Navigation className="size-3.5 text-sunu-green" /> SMS « Partez maintenant » selon
            votre temps de trajet
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-4 md:flex-row md:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-sunu-surface px-3 py-2.5">
            <Search className="size-4 text-sunu-ink/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hôpital, service (pédiatrie, maternité…), quartier"
              aria-label="Rechercher un établissement"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Ville"
            className="rounded-xl border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm"
          >
            <option value="">Toutes les villes</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <Loader2 className="mx-auto mt-10 size-6 animate-spin text-sunu-ink/40" />
        ) : list.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/55">
            Aucun établissement ne propose encore le ticket virtuel ici. Votre hôpital l'attend ?
            Parlez-en à l'accueil, et écrivez-nous depuis la page{" "}
            <Link to="/aide" className="font-semibold text-sunu-green">
              Aide et contact
            </Link>
            .
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {list.map((f) => (
              <FacilityCard key={f.id} facility={f} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FacilityCard({ facility }: { facility: Facility }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [travel, setTravel] = useState(30);
  const take = useMutation({
    mutationFn: (serviceId: string) => takeTicket(serviceId, travel || undefined),
    onSuccess: (t) => navigate({ to: "/ticket/$code", params: { code: t.code } }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <section
      aria-label={facility.name}
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
          <Hospital className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-sunu-dark">{facility.name}</h2>
          <p className="flex items-center gap-1 text-xs text-sunu-ink/60">
            <MapPin className="size-3.5" />
            {facility.kind_label} · {facility.address ? `${facility.address}, ` : ""}
            {facility.city}
          </p>
          {facility.phone && (
            <a
              href={`tel:${facility.phone}`}
              className="mt-0.5 flex items-center gap-1 text-xs text-sunu-green"
            >
              <Phone className="size-3.5" /> {facility.phone}
            </a>
          )}
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-xs text-sunu-ink/65">
        <Navigation className="size-3.5 text-sunu-green" /> Je suis
        <select
          value={travel}
          onChange={(e) => setTravel(Number(e.target.value))}
          aria-label="Temps de trajet jusqu'à l'établissement"
          className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1 text-xs"
        >
          {TRAVEL.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label.replace(/^À /, "à ")}
            </option>
          ))}
        </select>
        de l'établissement
      </label>
      <ul className="mt-3 divide-y divide-sunu-line">
        {facility.services.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-sunu-dark">{s.name}</p>
              {s.open ? (
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-sunu-ink/60">
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> {s.waiting} en attente
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" /> environ {etaLabel(s.eta_minutes)}
                  </span>
                  {s.now_serving && <span>Appel en cours : {s.now_serving}</span>}
                </p>
              ) : (
                <p className="text-xs text-amber-700">{s.closed_reason}</p>
              )}
            </div>
            <button
              disabled={!s.open || take.isPending}
              onClick={() =>
                me
                  ? take.mutate(s.id)
                  : navigate({ to: "/auth", search: { redirect: "/hopitaux" } })
              }
              className="flex items-center gap-1.5 rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {take.isPending && take.variables === s.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ticket className="size-4" />
              )}
              Prendre un ticket
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
