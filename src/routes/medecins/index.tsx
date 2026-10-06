import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CampaignSlot } from "@/components/CampaignSlot";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  Search,
  MapPin,
  Star,
  Video,
  CheckCircle2,
  Filter,
  CalendarClock,
  UserX,
  List,
  Map as MapIcon,
  House,
} from "lucide-react";
import { DoctorMap } from "@/components/DoctorMap";
import { CityInput } from "@/components/CityInput";
import { listSpecialties, searchDoctors, type DoctorFilters } from "@/api/directory";
import { formatDateTime } from "@/lib/datetime";
import { listInsurers } from "@/api/insurance";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";
import { FajmaMark } from "@/components/FajmaMark";

const searchSchema = z.object({
  city: z.string().optional(),
  specialty: z.string().optional(),
  q: z.string().optional(),
  tele: z.string().optional(),
  domicile: z.string().optional(),
  lang: z.string().optional(),
  assurance: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  dispo: z.enum(["today", "week"]).optional(),
  prix: z.coerce.number().int().positive().optional(),
  tri: z.enum(["availability", "price", "rating"]).optional(),
  vue: z.enum(["liste", "carte"]).optional(),
  // Nombre de pages de 60 médecins déjà affichées (« Voir plus »).
  pages: z.coerce.number().int().min(1).max(20).optional(),
});

const PAGE_SIZE = 60;
type Search = z.infer<typeof searchSchema>;

function toFilters(s: Search): DoctorFilters {
  return {
    city: s.city,
    specialty: s.specialty,
    query: s.q,
    teleconsultation: s.tele === "1",
    home_visit: s.domicile === "1",
    language: s.lang,
    insurer: s.assurance,
    lat: s.lat,
    lng: s.lng,
    available: s.dispo,
    max_price: s.prix,
    sort: s.tri,
  };
}

const doctorsQO = ({ vue: _vue, ...search }: Search) =>
  queryOptions({
    queryKey: ["doctors", search],
    queryFn: () =>
      searchDoctors({ data: toFilters(search), limit: PAGE_SIZE * (search.pages ?? 1) }),
  });

const specialtiesQO = queryOptions({
  queryKey: ["specialties"],
  queryFn: () => listSpecialties(),
});

const LANGUAGES = ["Wolof", "Français", "Pulaar", "Serere", "Diola", "Anglais"];
const PRICES = [10000, 15000, 20000, 25000, 30000];

export const Route = createFileRoute("/medecins/")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(doctorsQO(deps)),
      context.queryClient.ensureQueryData(specialtiesQO),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Trouver un médecin — Fajma" },
      {
        name: "description",
        content:
          "Recherchez un médecin, un pédiatre ou un spécialiste au Sénégal. Prise de rendez-vous en ligne.",
      },
      { property: "og:title", content: "Trouver un médecin — Fajma" },
      {
        property: "og:description",
        content: "Annuaire médical vérifié à Dakar, Thiès, Saint-Louis et partout au Sénégal.",
      },
    ],
  }),
  component: MedecinsPage,
});

function MedecinsPage() {
  const search = Route.useSearch();
  const { t } = useI18n();
  const { data: insurers } = useQuery({ queryKey: ["insurers"], queryFn: listInsurers });
  const navigate = useNavigate();
  const {
    data: { data: doctors, total },
  } = useSuspenseQuery(doctorsQO(search));
  const { data: specialties } = useSuspenseQuery(specialtiesQO);
  const [q, setQ] = useState(search.q ?? "");
  const [city, setCity] = useState(search.city ?? (search.lat != null ? t("search.nearMe") : ""));
  // Aucun médecin dans la ville recherchée : la liste propose les plus proches (au-delà de 20 km).
  const onlyFarAway =
    (search.city || search.lat != null) &&
    doctors.length > 0 &&
    doctors.every((d) => d.distance_km != null && d.distance_km > 20);

  function updateSearch(patch: Partial<Record<keyof Search, string | number | undefined>>) {
    navigate({
      to: "/medecins",
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const k of Object.keys(next))
          if (next[k] === undefined || next[k] === "") delete next[k];
        return next;
      },
    });
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "border-sunu-green bg-sunu-green text-white"
        : "border-sunu-line bg-sunu-card text-sunu-ink/70 hover:border-sunu-green"
    }`;

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="sticky top-0 z-40 border-b border-sunu-line bg-sunu-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/auth"
              className="whitespace-nowrap rounded-full bg-sunu-green px-3 py-2 text-sm font-semibold text-white hover:bg-sunu-green/90 sm:px-4"
            >
              {t("nav.login")}
            </Link>
          </div>
        </div>
      </header>

      <div className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const nearMe = city === t("search.nearMe") && search.lat != null;
              updateSearch({
                q: q || undefined,
                city: nearMe ? undefined : city || undefined,
                ...(nearMe ? {} : { lat: undefined, lng: undefined }),
              });
            }}
            className="flex flex-col gap-2 rounded-2xl border border-sunu-line bg-sunu-card p-2 md:flex-row"
          >
            <label className="flex flex-1 items-center gap-3 rounded-xl px-4 py-2.5 focus-within:bg-sunu-green-soft">
              <Search className="size-4 text-sunu-green" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("search.namePh")}
                aria-label={t("search.nameAria")}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <div className="hidden w-px bg-sunu-line md:block" />
            <CityInput
              value={city}
              onChange={setCity}
              onPick={(name) =>
                updateSearch({ q: q || undefined, city: name, lat: undefined, lng: undefined })
              }
              onNearMe={(lat, lng) => {
                setCity(t("search.nearMe"));
                updateSearch({
                  city: undefined,
                  lat: Number(lat.toFixed(4)),
                  lng: Number(lng.toFixed(4)),
                });
              }}
              className="rounded-xl px-4 py-2.5 focus-within:bg-sunu-green-soft"
            />
            <button className="rounded-xl bg-sunu-green px-6 py-2.5 text-sm font-semibold text-white hover:bg-sunu-green/90">
              {t("home.search")}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                updateSearch({ dispo: search.dispo === "today" ? undefined : "today" })
              }
              className={chip(search.dispo === "today")}
            >
              {t("search.today")}
            </button>
            <button
              onClick={() => updateSearch({ dispo: search.dispo === "week" ? undefined : "week" })}
              className={chip(search.dispo === "week")}
            >
              {t("search.week")}
            </button>
            <button
              onClick={() => updateSearch({ tele: search.tele === "1" ? undefined : "1" })}
              className={chip(search.tele === "1")}
            >
              <Video className="mr-1 inline size-3" /> {t("search.video")}
            </button>
            <button
              onClick={() => updateSearch({ domicile: search.domicile === "1" ? undefined : "1" })}
              className={chip(search.domicile === "1")}
            >
              <House className="mr-1 inline size-3" /> {t("search.home")}
            </button>
            <Link to="/cliniques" className={chip(false)}>
              {t("search.clinics")}
            </Link>
            <select
              value={search.lang ?? ""}
              onChange={(e) => updateSearch({ lang: e.target.value || undefined })}
              aria-label={t("search.language")}
              className="rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              <option value="">{t("search.allLanguages")}</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t("search.speaks", { lang: l })}
                </option>
              ))}
            </select>
            <select
              value={search.assurance ?? ""}
              onChange={(e) => updateSearch({ assurance: e.target.value || undefined })}
              aria-label={t("search.insurer")}
              className="rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              <option value="">{t("search.allInsurers")}</option>
              {(insurers ?? []).map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </select>
            <select
              value={search.prix ?? ""}
              onChange={(e) =>
                updateSearch({ prix: e.target.value ? Number(e.target.value) : undefined })
              }
              aria-label={t("search.maxPrice")}
              className="rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              <option value="">{t("search.allPrices")}</option>
              {PRICES.map((p) => (
                <option key={p} value={p}>
                  {t("search.upTo", { price: p.toLocaleString("fr-FR") })}
                </option>
              ))}
            </select>
            <select
              value={search.tri ?? ""}
              onChange={(e) => updateSearch({ tri: e.target.value || undefined })}
              aria-label={t("search.sortBy")}
              className="ml-auto rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              <option value="">{t("search.sortRating")}</option>
              <option value="availability">{t("search.sortAvail")}</option>
              <option value="price">{t("search.sortPrice")}</option>
            </select>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]">
        {/* Encart sponsorisé séparé des résultats : il ne change jamais l'ordre des médecins. */}
        <CampaignSlot placement="search" city={search.city} className="lg:col-span-2" />
        <aside className="min-w-0">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            <Filter className="size-3.5" /> {t("search.specialties")}
          </h3>
          <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            <button
              onClick={() => updateSearch({ specialty: undefined })}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${!search.specialty ? "bg-sunu-green-soft font-semibold text-sunu-green" : "text-sunu-ink/70 hover:bg-sunu-green-soft/50"}`}
            >
              {t("search.all")}
            </button>
            {specialties.map((s) => (
              <button
                key={s.id}
                onClick={() => updateSearch({ specialty: s.slug })}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${search.specialty === s.slug ? "bg-sunu-green-soft font-semibold text-sunu-green" : "text-sunu-ink/70 hover:bg-sunu-green-soft/50"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-sunu-ink/60">{t("search.doctorsCount", { n: total })}</p>
            <div
              className="inline-flex rounded-lg border border-sunu-line bg-sunu-card p-0.5"
              role="group"
              aria-label={t("search.display")}
            >
              <button
                onClick={() => updateSearch({ vue: undefined })}
                aria-pressed={search.vue !== "carte"}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${search.vue !== "carte" ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
              >
                <List className="size-3.5" /> {t("search.list")}
              </button>
              <button
                onClick={() => updateSearch({ vue: "carte" })}
                aria-pressed={search.vue === "carte"}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${search.vue === "carte" ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
              >
                <MapIcon className="size-3.5" /> {t("search.map")}
              </button>
            </div>
          </div>

          {search.vue === "carte" && (
            <div className="mb-4">
              <DoctorMap
                points={doctors
                  .filter((d) => d.latitude != null && d.longitude != null)
                  .map((d) => ({
                    id: d.id,
                    doctorId: d.id,
                    lat: d.latitude!,
                    lng: d.longitude!,
                    title: d.full_name,
                    subtitle: `${d.specialty?.name ?? ""} · ${d.city}`,
                  }))}
              />
            </div>
          )}

          <div className="stagger grid gap-4">
            {onlyFarAway && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {search.city ? t("search.nearest", { city: search.city }) : t("search.aroundMe")}
              </p>
            )}
            {doctors.length === 0 && (
              <div className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-12 text-center text-sunu-ink/60">
                {t("search.none")}
              </div>
            )}
            {doctors.map((d) => (
              <Link
                key={d.id}
                to="/medecins/$id"
                params={{ id: d.id }}
                className="group flex flex-col gap-4 rounded-2xl border border-sunu-line bg-sunu-card p-5 transition-all hover:border-sunu-green hover:shadow-sunu-card md:flex-row"
              >
                {d.avatar_url ? (
                  <img
                    src={d.avatar_url}
                    alt=""
                    loading="lazy"
                    className="size-16 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sunu-green-soft text-xl font-bold text-sunu-green">
                    {d.full_name.split(" ").slice(-1)[0]?.[0] ?? "D"}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-sunu-dark group-hover:text-sunu-green">
                      {d.full_name}
                    </h3>
                    <CheckCircle2
                      className="size-4 text-sunu-success"
                      aria-label={t("search.verified")}
                    />
                  </div>
                  <p className="text-sm font-medium text-sunu-green">{d.specialty?.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-sunu-ink/60">
                    <MapPin className="size-3.5" /> {d.city}
                    {d.address ? ` · ${d.address}` : ""}
                    {d.distance_km != null && (
                      <span className="ml-1 rounded-full bg-sunu-green-soft px-2 py-0.5 text-xs font-semibold text-sunu-green">
                        {t("search.distance", {
                          km: d.distance_km < 1 ? "< 1" : Math.round(d.distance_km),
                        })}
                      </span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {d.reviews_count > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-sunu-dark">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        {d.rating}{" "}
                        <span className="font-normal text-sunu-ink/50">({d.reviews_count})</span>
                      </span>
                    )}
                    <span className="text-sunu-ink/60">
                      {t("search.years", { n: d.years_experience })}
                    </span>
                    <span className="text-sunu-ink/60">{d.languages.join(", ")}</span>
                    {d.teleconsultation && (
                      <span className="flex items-center gap-1 rounded-full bg-sunu-teal/10 px-2 py-0.5 font-semibold text-sunu-teal">
                        <Video className="size-3" /> {t("search.tele")}
                      </span>
                    )}
                    {d.home_visits && (
                      <span className="flex items-center gap-1 rounded-full bg-sunu-gold/15 px-2 py-0.5 font-semibold text-sunu-dark">
                        <House className="size-3" /> {t("search.home")}
                      </span>
                    )}
                    {!d.accepts_new_patients && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                        <UserX className="size-3" /> {t("search.knownOnly")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-2 border-t border-sunu-line pt-3 md:w-52 md:items-end md:border-l md:border-t-0 md:pl-4 md:pt-0">
                  <div className="md:text-right">
                    <p className="text-lg font-bold text-sunu-dark">
                      {d.consultation_price.toLocaleString("fr-FR")}{" "}
                      <span className="text-xs font-normal text-sunu-ink/60">FCFA</span>
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-xs md:justify-end ${d.next_slot ? "font-semibold text-sunu-teal" : "text-sunu-ink/50"}`}
                    >
                      <CalendarClock className="size-3.5" />
                      {d.next_slot
                        ? t("search.from", {
                            date: formatDateTime(d.next_slot.iso, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                          })
                        : t("search.noSlot")}
                    </p>
                  </div>
                  <span className="rounded-full bg-sunu-green px-4 py-1.5 text-center text-xs font-semibold text-white group-hover:bg-sunu-green/90">
                    {t("search.book")}
                  </span>
                </div>
              </Link>
            ))}
            {doctors.length < total && (
              <Link
                to="."
                search={(prev: Search) => ({ ...prev, pages: (prev.pages ?? 1) + 1 })}
                resetScroll={false}
                className="mx-auto rounded-full border border-sunu-line bg-sunu-card px-6 py-2.5 text-sm font-semibold text-sunu-green hover:border-sunu-green"
              >
                {t("search.more", { n: total - doctors.length })}
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
