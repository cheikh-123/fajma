import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AsyncRequestForm } from "@/components/AsyncRequestForm";
import { getBookFor, setBookFor, type BookFor } from "@/lib/book-for";
import {
  useSuspenseQuery,
  useQuery,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  MapPin,
  Star,
  Video,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Loader2,
  BellRing,
  Clock,
  UserPlus,
  House,
  Repeat,
  LocateFixed,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getDoctor, listDoctorSlots, listDoctorReviews } from "@/api/directory";
import { createAppointment, previewSeries, SERIES_INTERVALS } from "@/api/appointments";
import { BookingQuestions, type Answers } from "@/components/BookingQuestions";
import type { ConsultationType, Mode } from "@/api/types";
import { listMyCoverages, patientShare } from "@/api/insurance";
import { getMyWaitlistEntry, joinWaitlist, leaveWaitlist, listMyRelatives } from "@/api/patient";
import { useMe } from "@/api/auth";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";
import { formatDate } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const doctorQO = (id: string) =>
  queryOptions({
    queryKey: ["doctor", id],
    queryFn: () => getDoctor({ data: { id } }),
  });

export const Route = createFileRoute("/medecins/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(doctorQO(params.id)),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.full_name} — Fajma` : "Médecin — Fajma" },
      {
        name: "description",
        content: loaderData
          ? `Prenez rendez-vous avec ${loaderData.full_name}, ${loaderData.specialty?.name ?? "spécialiste"} à ${loaderData.city}.`
          : "Fiche médecin sur Fajma.",
      },
      { property: "og:title", content: loaderData ? `${loaderData.full_name}` : "Médecin" },
      {
        property: "og:description",
        content: loaderData?.bio ?? "Prenez rendez-vous en ligne.",
      },
    ],
  }),
  component: DoctorPage,
});

// Cabinet et vidéo partagent les mêmes plages ; les visites à domicile ont les leurs.
const slotsQO = (id: string, duration?: number, home = false) =>
  queryOptions({
    queryKey: ["doctor-slots", id, duration ?? null, home],
    queryFn: () =>
      listDoctorSlots({
        data: {
          doctor_id: id,
          days: 21,
          duration_minutes: duration,
          mode: home ? "home_visit" : undefined,
        },
      }),
  });

/** Même règle que le serveur : un motif « cabinet » peut aussi se faire à domicile. */
function typeAllows(ct: ConsultationType, mode: Mode) {
  if (mode === "home_visit") return ["home_visit", "in_person", "both"].includes(ct.mode);
  return ct.mode === "both" || ct.mode === mode;
}

const shortDate = (day: string) => formatDate(`${day}T12:00:00Z`);

const reviewsQO = (id: string) =>
  queryOptions({
    queryKey: ["doctor-reviews", id],
    queryFn: () => listDoctorReviews({ data: { doctor_id: id } }),
  });

function useLoggedIn() {
  return Boolean(useMe().data);
}

function DoctorPage() {
  const { id } = Route.useParams();
  const { data: doctor } = useSuspenseQuery(doctorQO(id));
  const { data: reviews } = useQuery(reviewsQO(id));
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="sticky top-0 z-40 border-b border-sunu-line bg-sunu-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/medecins"
              className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <ArrowLeft className="size-4" /> {t("nav.back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_400px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-sunu-line bg-sunu-card p-6 shadow-sunu-card">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              {doctor.avatar_url ? (
                <img
                  src={doctor.avatar_url}
                  alt={`Photo de ${doctor.full_name}`}
                  className="size-20 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-sunu-green-soft text-2xl font-bold text-sunu-green">
                  {doctor.full_name.split(" ").slice(-1)[0]?.[0]}
                </div>
              )}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-sunu-dark">{doctor.full_name}</h1>
                  <CheckCircle2 className="size-5 text-sunu-success" />
                </div>
                <p className="mt-0.5 font-semibold text-sunu-green">{doctor.specialty?.name}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-sunu-ink/60">
                  <MapPin className="size-4" /> {doctor.city}
                  {doctor.address ? ` · ${doctor.address}` : ""}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      doctor.latitude != null && doctor.longitude != null
                        ? `${doctor.latitude},${doctor.longitude}`
                        : `${doctor.address ?? ""} ${doctor.city}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sunu-green hover:underline"
                  >
                    Itinéraire
                  </a>
                </p>
                {doctor.locations.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-sunu-ink/60">
                    {doctor.locations.map((loc) => (
                      <li key={loc.id} className="flex items-center gap-1.5">
                        <MapPin className="size-4 text-sunu-teal" /> {loc.name} · {loc.address},{" "}
                        {loc.city}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                  {doctor.reviews_count > 0 && (
                    <span className="flex items-center gap-1 font-semibold text-sunu-dark">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      {doctor.rating}
                      <span className="ml-1 font-normal text-sunu-ink/50">
                        ({t("doctor.reviewsCount", { n: doctor.reviews_count })})
                      </span>
                    </span>
                  )}
                  <span className="text-sunu-ink/60">
                    {t("search.years", { n: doctor.years_experience })}
                  </span>
                  {doctor.teleconsultation && (
                    <span className="flex items-center gap-1 rounded-full bg-sunu-teal/10 px-2 py-0.5 text-xs font-semibold text-sunu-teal">
                      <Video className="size-3" /> {t("book.tele")}
                    </span>
                  )}
                  {doctor.home_visits && (
                    <span className="flex items-center gap-1 rounded-full bg-sunu-gold/15 px-2 py-0.5 text-xs font-semibold text-sunu-dark">
                      <House className="size-3" /> {t("doctor.homeVisits")}
                    </span>
                  )}
                </div>
                {doctor.home_visits && doctor.home_visit_area && (
                  <p className="mt-2 text-xs text-sunu-ink/60">
                    {t("book.homeArea", { area: doctor.home_visit_area })}
                  </p>
                )}
              </div>
            </div>
            {doctor.replacements.length > 0 && (
              <ul className="mt-4 space-y-2">
                {doctor.replacements.map((r) => (
                  <li
                    key={r.starts_on + r.replacement.id}
                    className="flex items-start gap-2 rounded-lg border border-sunu-gold/40 bg-sunu-gold/10 px-3 py-2 text-sm text-sunu-ink/80"
                  >
                    <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-sunu-dark" />
                    <span>
                      {t("book.replacement", {
                        from: shortDate(r.starts_on),
                        to: shortDate(r.ends_on),
                        name: r.replacement.full_name,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {doctor.bio && (
              <div className="mt-6 border-t border-sunu-line pt-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                  {t("doctor.about")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-sunu-ink/80">{doctor.bio}</p>
              </div>
            )}
            <div className="mt-4 border-t border-sunu-line pt-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                {t("doctor.languages")}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {doctor.languages.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-sunu-green-soft px-3 py-1 text-xs font-medium text-sunu-green"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-sunu-line pt-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                {t("doctor.pricing")}
              </h2>
              {doctor.consultation_types.length === 0 ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-sunu-ink/60">{t("doctor.consultation")}</span>
                  <span className="text-lg font-bold text-sunu-dark">
                    {doctor.consultation_price.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              ) : (
                <ul className="mt-2 divide-y divide-sunu-line">
                  {doctor.consultation_types.map((ct) => (
                    <li
                      key={ct.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="text-sunu-ink/80">
                        {ct.name}{" "}
                        <span className="text-xs text-sunu-ink/45">
                          · {ct.duration_minutes} min
                        </span>
                      </span>
                      <span className="font-bold text-sunu-dark">
                        {ct.price.toLocaleString("fr-FR")} FCFA
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {doctor.insurers.length > 0 && (
              <div className="mt-4 border-t border-sunu-line pt-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                  {t("doctor.insurers")}
                </h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {doctor.insurers.map((i) => (
                    <li
                      key={i.id}
                      className="rounded-full border border-sunu-line px-3 py-1 text-xs text-sunu-ink/80"
                    >
                      {i.name}
                      {i.tiers_payant && (
                        <span className="ml-1 font-semibold text-sunu-teal">
                          · {t("doctor.tiers")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-6 shadow-sunu-card">
            <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
              <Star className="size-5 fill-amber-400 text-amber-400" /> {t("doctor.reviews")}
            </h2>
            {(reviews ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-sunu-ink/55">{t("doctor.noReviews")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-sunu-line">
                {(reviews ?? []).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`size-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-sunu-line"}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-sunu-ink/50">{formatDate(r.created_at)}</span>
                    </div>
                    {r.comment && <p className="mt-1.5 text-sm text-sunu-ink/80">{r.comment}</p>}
                    {r.doctor_reply && (
                      <div className="mt-2 rounded-lg border-l-2 border-sunu-green bg-sunu-green-soft/40 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-sunu-green">{t("doctor.reply")}</p>
                        <p className="mt-0.5 text-sunu-ink/80">{r.doctor_reply}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="self-start lg:sticky lg:top-24">
          <AsyncRequestForm doctorId={doctor.id} doctorName={doctor.full_name} />
          <BookingPanel doctor={doctor} />
        </div>
      </main>
    </div>
  );
}

type Doctor = Awaited<ReturnType<typeof getDoctor>>;

function BookingPanel({ doctor }: { doctor: Doctor }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const loggedIn = useLoggedIn();
  const modes: Mode[] = [
    "in_person",
    ...(doctor.teleconsultation ? (["teleconsultation"] as const) : []),
    ...(doctor.home_visits ? (["home_visit"] as const) : []),
  ];
  const [mode, setMode] = useState<Mode>("in_person");
  const types = doctor.consultation_types.filter((ct) => typeAllows(ct, mode));
  const [typeId, setTypeId] = useState<string | null>(null);
  const type = types.find((ct) => ct.id === typeId) ?? types[0] ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const [relativeId, setRelativeId] = useState<string>("");
  // Réservation pour un proche aidé (venu de l'espace Famille).
  const [bookFor, setBookForState] = useState<BookFor | null>(null);
  useEffect(() => setBookForState(getBookFor()), []);
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  // Autre motif = autres questions : les réponses repartent de zéro.
  useEffect(() => setAnswers({}), [type?.id]);
  // "" = tous les lieux, "main" = cabinet principal, sinon identifiant du lieu.
  const [place, setPlace] = useState("");
  // Visite à domicile
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // Série de séances
  const canSeries = (type?.series_max ?? 0) >= 2;
  const [seriesOn, setSeriesOn] = useState(false);
  const [seriesCount, setSeriesCount] = useState(4);
  const [interval, setIntervalDays] = useState<number>(7);
  const series = canSeries && seriesOn ? { count: seriesCount, interval_days: interval } : null;

  const { data: slotData, isLoading: slotsLoading } = useQuery(
    slotsQO(doctor.id, type?.duration_minutes, mode === "home_visit"),
  );
  const { data: seriesPreview, isFetching: previewLoading } = useQuery({
    queryKey: ["series-preview", doctor.id, type?.id, mode, slot, seriesCount, interval],
    queryFn: () =>
      previewSeries({
        doctor_id: doctor.id,
        scheduled_at: slot!,
        mode,
        consultation_type_id: type!.id,
        series: { count: seriesCount, interval_days: interval },
      }),
    enabled: Boolean(series && slot && type),
  });
  const sessionsOk = (seriesPreview?.sessions ?? []).filter((s) => s.available).length;
  const { data: relatives } = useQuery({
    queryKey: ["my-relatives"],
    queryFn: () => listMyRelatives(),
    enabled: loggedIn,
  });
  const allSlots = slotData?.slots ?? [];
  const slots =
    mode !== "in_person" || !place
      ? allSlots
      : allSlots.filter((s) => (place === "main" ? !s.location_id : s.location_id === place));
  const placeName = (id: string | null | undefined) =>
    id ? (doctor.locations.find((l) => l.id === id)?.name ?? "") : doctor.address || doctor.city;
  const price =
    (type?.price ?? doctor.consultation_price) +
    (mode === "home_visit" ? doctor.home_visit_fee : 0);
  const { data: coverages } = useQuery({
    queryKey: ["my-coverages"],
    queryFn: listMyCoverages,
    enabled: loggedIn && doctor.insurers.length > 0,
  });
  // Couvertures utilisables : celles de la personne qui consulte, auprès d'un organisme accepté par ce médecin.
  const today = new Date().toISOString().slice(0, 10);
  const eligible = (coverages ?? []).filter(
    (c) =>
      (c.relative?.id ?? "") === relativeId &&
      (!c.valid_until || c.valid_until >= today) &&
      doctor.insurers.some((i) => i.id === c.insurer.id),
  );
  const [coverageId, setCoverageId] = useState("");
  const coverage = eligible.find((c) => c.id === coverageId) ?? null;
  const tiersPayant = coverage
    ? (doctor.insurers.find((i) => i.id === coverage.insurer.id)?.tiers_payant ?? false)
    : false;
  const amountDue =
    coverage && tiersPayant ? patientShare(price, coverage.coverage_percent) : price;
  useEffect(() => setCoverageId(""), [relativeId]);

  // Un créneau choisi n'est plus valable si le motif (donc la durée) change.
  useEffect(() => setSlot(null), [type?.id, mode]);
  useEffect(() => {
    if (type && seriesCount > type.series_max) setSeriesCount(type.series_max);
  }, [type, seriesCount]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error(t("book.locateFail"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        toast.error(t("book.locateFail"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const book = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error(t("book.chooseSlot"));
      if (mode === "home_visit" && address.trim().length < 5) {
        throw new Error(t("book.addressRequired"));
      }
      if (!loggedIn) {
        toast.info(t("book.loginFirst"));
        // Retour sur cette fiche après connexion pour finir la réservation.
        navigate({
          to: "/auth",
          search: { redirect: window.location.pathname + window.location.search },
        });
        throw new Error("Non connecté");
      }
      return createAppointment({
        data: {
          doctor_id: doctor.id,
          scheduled_at: slot,
          mode,
          reason: reason || undefined,
          consultation_type_id: type?.id,
          relative_id: bookFor ? undefined : relativeId || undefined,
          care_link_id: bookFor?.linkId,
          coverage_id: coverage?.id,
          ...(mode === "home_visit"
            ? {
                visit_address: address.trim(),
                visit_landmark: landmark.trim() || undefined,
                visit_latitude: position?.lat,
                visit_longitude: position?.lng,
              }
            : {}),
          series: series ?? undefined,
          answers: Object.keys(answers).length ? answers : undefined,
        },
      });
    },
    onSuccess: (res) => {
      if (res.series) {
        toast.success(t("book.seriesDone", { n: res.series.booked }), {
          description: res.series.skipped.length
            ? t("book.seriesSkipped", { n: res.series.skipped.length })
            : undefined,
        });
      } else {
        toast.success(t(res.status === "confirmed" ? "book.confirmed" : "book.success"));
      }
      if (bookFor) {
        setBookFor(null);
        navigate({ to: "/famille" });
        return;
      }
      navigate({ to: "/mon-espace" });
    },
    onError: (e) => {
      if (e.message !== "Non connecté") toast.error(e.message);
    },
  });

  return (
    <aside className="rounded-2xl border border-sunu-line bg-sunu-card p-6 shadow-sunu-card">
      <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Calendar className="size-5 text-sunu-green" /> {t("book.title")}
      </h2>
      {bookFor && (
        <p className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-sunu-green-soft px-3 py-2 text-xs font-semibold text-sunu-green">
          Rendez-vous pour {bookFor.label}
          <button
            type="button"
            onClick={() => {
              setBookFor(null);
              setBookForState(null);
            }}
            className="text-sunu-ink/60 underline"
          >
            Pour moi
          </button>
        </p>
      )}

      {modes.length > 1 && (
        <div
          className={`mt-4 grid gap-1 rounded-xl bg-sunu-green-soft/40 p-1 ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-2 py-2 text-xs font-semibold ${mode === m ? "bg-sunu-card text-sunu-green shadow-sm" : "text-sunu-ink/60"}`}
            >
              {m === "in_person"
                ? t("book.inPerson")
                : m === "teleconsultation"
                  ? t("book.tele")
                  : t("book.home")}
            </button>
          ))}
        </div>
      )}

      {mode === "home_visit" && (
        <div className="mt-4 space-y-2 rounded-xl border border-sunu-gold/40 bg-sunu-gold/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sunu-dark">
            <House className="size-4" /> {t("book.homeInfo")}
          </p>
          {doctor.home_visit_area && (
            <p className="text-xs text-sunu-ink/70">
              {t("book.homeArea", { area: doctor.home_visit_area })}
            </p>
          )}
          {doctor.home_visit_fee > 0 && (
            <p className="text-xs text-sunu-ink/70">
              {t("book.homeFee", { fee: doctor.home_visit_fee.toLocaleString("fr-FR") })}
            </p>
          )}
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
              {t("book.address")}
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              placeholder={t("book.addressPh")}
              autoComplete="street-address"
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
              {t("book.landmark")}
            </span>
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              maxLength={200}
              placeholder={t("book.landmarkPh")}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
            />
          </label>
          {position ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-sunu-teal">
              <CheckCircle2 className="size-3.5" /> {t("book.located")}
              <button
                type="button"
                onClick={() => setPosition(null)}
                className="ml-auto font-normal text-sunu-ink/50 hover:text-red-600"
              >
                ✕
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="flex items-center gap-1.5 text-xs font-semibold text-sunu-green hover:underline disabled:opacity-50"
            >
              {locating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LocateFixed className="size-3.5" />
              )}
              {t("book.locate")}
            </button>
          )}
        </div>
      )}

      {types.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            {t("book.type")}
          </p>
          <div className="grid gap-1.5">
            {types.map((ct) => (
              <label
                key={ct.id}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${type?.id === ct.id ? "border-sunu-green bg-sunu-green-soft/40" : "border-sunu-line"}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ctype"
                    checked={type?.id === ct.id}
                    onChange={() => setTypeId(ct.id)}
                    className="accent-sunu-green"
                  />
                  <span>
                    {ct.name}
                    <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-sunu-ink/50">
                      <Clock className="size-3" /> {ct.duration_minutes} min
                    </span>
                  </span>
                </span>
                <span className="text-xs font-bold text-sunu-dark">
                  {(ct.price + (mode === "home_visit" ? doctor.home_visit_fee : 0)).toLocaleString(
                    "fr-FR",
                  )}{" "}
                  F
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {canSeries && type && (
        <div className="mt-4 rounded-xl border border-sunu-line p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-sunu-dark">
            <input
              type="checkbox"
              checked={seriesOn}
              onChange={(e) => setSeriesOn(e.target.checked)}
              className="mt-0.5 accent-sunu-green"
            />
            <span>
              <Repeat className="mr-1 inline size-3.5 text-sunu-green" />
              {t("book.series")}
              <span className="block text-xs font-normal text-sunu-ink/55">
                {t("book.seriesHint")}
              </span>
            </span>
          </label>
          {seriesOn && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-sunu-ink/60">
                {t("book.seriesCount")}
                <select
                  value={seriesCount}
                  onChange={(e) => setSeriesCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm text-sunu-ink"
                >
                  {Array.from({ length: type.series_max - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-sunu-ink/60">
                {t("book.seriesEvery")}
                <select
                  value={interval}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm text-sunu-ink"
                >
                  {SERIES_INTERVALS.map((d) => (
                    <option key={d} value={d}>
                      {t(`book.every${d}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {loggedIn && !bookFor && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            {t("book.forWhom")}
          </p>
          <div className="flex gap-2">
            <select
              value={relativeId}
              onChange={(e) => setRelativeId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
            >
              <option value="">{t("book.me")}</option>
              {(relatives ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <Link
              to="/mon-espace"
              hash="proches"
              title={t("book.addRelative")}
              className="grid place-items-center rounded-lg border border-sunu-line px-3 text-sunu-ink/60 hover:border-sunu-green hover:text-sunu-green"
            >
              <UserPlus className="size-4" />
              <span className="sr-only">{t("book.addRelative")}</span>
            </Link>
          </div>
        </div>
      )}

      {loggedIn && eligible.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            {t("book.coverage")}
          </p>
          <select
            aria-label={t("book.coverage")}
            value={coverageId}
            onChange={(e) => setCoverageId(e.target.value)}
            className="w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
          >
            <option value="">{t("book.noCoverage")}</option>
            {eligible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.insurer.name} ({c.coverage_percent} %)
              </option>
            ))}
          </select>
          {coverage && (
            <p className="mt-1.5 text-xs text-sunu-ink/60">
              {tiersPayant
                ? t("book.tiersInfo", {
                    amount: amountDue.toLocaleString("fr-FR"),
                    insurer: coverage.insurer.name,
                  })
                : t("book.noTiersInfo")}
            </p>
          )}
        </div>
      )}

      {doctor.locations.length > 0 && mode === "in_person" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            {t("book.place")}
          </p>
          <select
            value={place}
            onChange={(e) => {
              setPlace(e.target.value);
              setSlot(null);
            }}
            className="w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
          >
            <option value="">{t("book.allPlaces")}</option>
            <option value="main">
              {doctor.address || t("book.mainPractice")} ({doctor.city})
            </option>
            {doctor.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.city})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
          {t("book.slots")}
        </p>
        {slotsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-sunu-green" />
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg bg-sunu-surface px-3 py-4 text-center text-sm text-sunu-ink/60">
            {t("book.noSlots")}
          </p>
        ) : (
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {slots.map((s) => (
              <button
                key={s.iso}
                onClick={() => setSlot(s.iso)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${slot === s.iso ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/80 hover:border-sunu-green"}`}
              >
                {s.label}
                {doctor.locations.length > 0 && mode === "in_person" && !place && (
                  <span className="block truncate text-[10px] opacity-70">
                    {placeName(s.location_id)}
                  </span>
                )}
                {s.replacement && (
                  <span className="block truncate text-[10px] opacity-70">
                    {t("book.byReplacement", { name: s.replacement })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {series && slot && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            {t("book.seriesPreview")}
          </p>
          {previewLoading && !seriesPreview ? (
            <div className="flex justify-center py-3">
              <Loader2 className="size-4 animate-spin text-sunu-green" />
            </div>
          ) : (
            <ol className="max-h-48 space-y-1 overflow-y-auto pr-1 text-xs">
              {(seriesPreview?.sessions ?? []).map((s, i) => (
                <li
                  key={s.iso}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${s.available ? "bg-sunu-green-soft/40 text-sunu-ink/80" : "bg-sunu-surface text-sunu-ink/45 line-through decoration-sunu-ink/30"}`}
                >
                  <span className="w-5 shrink-0 font-semibold">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    {s.label}
                    {s.replacement && ` · ${t("book.byReplacement", { name: s.replacement })}`}
                    {!s.available && (
                      <span className="block no-underline">{t("book.seriesUnavailable")}</span>
                    )}
                  </span>
                  {s.available && <CheckCircle2 className="size-3.5 shrink-0 text-sunu-success" />}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {slots.length > 0 && (
        <>
          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
              {t("book.reason")}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t("book.reasonPh")}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
            />
          </label>

          <BookingQuestions
            key={type?.id ?? "default"}
            questions={
              (type ? doctor.questionnaires_by_type?.[type.id] : undefined) ??
              doctor.questionnaire ??
              []
            }
            value={answers}
            onChange={setAnswers}
            doctorName={doctor.full_name}
          />

          <button
            disabled={
              !slot || book.isPending || Boolean(series && (previewLoading || sessionsOk === 0))
            }
            onClick={() => book.mutate()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sunu-green px-4 py-3 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-50"
          >
            {book.isPending && <Loader2 className="size-4 animate-spin" />}
            {series
              ? `${t("book.seriesConfirm", { n: sessionsOk || seriesCount })} · ${amountDue.toLocaleString("fr-FR")} F ${t("book.perSession")}`
              : `${t("book.confirm")} · ${amountDue.toLocaleString("fr-FR")} F`}
          </button>
          <p className="mt-3 text-center text-xs text-sunu-ink/50">
            {t(doctor.auto_confirm ? "book.instant" : "book.byDoctor")} · {t("book.payInfo")}
          </p>
        </>
      )}

      <div className="mt-4 space-y-2 text-xs text-sunu-ink/60">
        {!doctor.accepts_new_patients && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-800">
            {t("book.knownOnly")}
          </p>
        )}
        {doctor.booking_instructions && (
          <p className="rounded-lg bg-sunu-green-soft/50 px-3 py-2 text-sunu-ink/80">
            <b>{t("book.before")}</b> {doctor.booking_instructions}
          </p>
        )}
        <p>
          {doctor.cancellation_deadline_hours > 0
            ? t("book.cancelUntil", { h: doctor.cancellation_deadline_hours })
            : t("book.cancelAny")}
        </p>
      </div>

      <WaitlistBox doctorId={doctor.id} loggedIn={loggedIn} />
    </aside>
  );
}

function WaitlistBox({ doctorId, loggedIn }: { doctorId: string; loggedIn: boolean }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: entry } = useQuery({
    queryKey: ["waitlist-entry", doctorId],
    queryFn: () => getMyWaitlistEntry({ data: { doctor_id: doctorId } }),
    enabled: loggedIn,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["waitlist-entry", doctorId] });
  const join = useMutation({
    mutationFn: () => joinWaitlist({ data: { doctor_id: doctorId } }),
    onSuccess: () => {
      toast.success(t("wait.joined"));
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const leave = useMutation({
    mutationFn: () => leaveWaitlist({ data: { doctor_id: doctorId } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-5 rounded-xl border border-dashed border-sunu-line p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-sunu-dark">
        <BellRing className="size-4 text-sunu-teal" /> {t("wait.title")}
      </p>
      <p className="mt-1 text-xs text-sunu-ink/60">{t("wait.pitch")}</p>
      {!loggedIn ? (
        <Link
          to="/auth"
          search={{
            redirect: typeof window === "undefined" ? undefined : window.location.pathname,
          }}
          className="mt-3 inline-block text-xs font-semibold text-sunu-green hover:underline"
        >
          {t("book.loginFirst")} →
        </Link>
      ) : entry ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-sunu-teal">✓ {t("wait.joined")}</span>
          <button
            onClick={() => leave.mutate()}
            disabled={leave.isPending}
            className="text-xs text-sunu-ink/50 hover:text-red-600"
          >
            {t("wait.leave")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => join.mutate()}
          disabled={join.isPending}
          className="mt-3 w-full rounded-lg border border-sunu-teal px-3 py-2 text-xs font-semibold text-sunu-teal hover:bg-sunu-teal/10 disabled:opacity-50"
        >
          {t("wait.join")}
        </button>
      )}
    </div>
  );
}
