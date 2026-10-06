import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AsyncPanel } from "@/components/pro/AsyncPanel";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { ThemeToggle } from "@/lib/theme";
import {
  useSuspenseQuery,
  useQuery,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  MessageSquareText,
  LogOut,
  Calendar,
  Video,
  MapPin,
  Check,
  X,
  Clock,
  Plus,
  Trash2,
  Stethoscope,
  Building2,
  FilePlus2,
  MessageSquare,
  ListChecks,
  Users,
  UserCheck,
  UserX,
  FolderOpen,
  LayoutList,
  CalendarDays,
  House,
  Repeat,
  UserRoundCheck,
  Navigation,
  CalendarClock,
  UserRound,
  FileSignature,
  Wallet,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpLink } from "@/components/HelpLink";
import {
  LocationsPanel,
  SettingsPanel,
  StatsStrip,
  TimeOffPanel,
  WeekCalendar,
} from "@/components/pro/ProPanels";
import { FinancePanel } from "@/components/pro/FinancePanel";
import { InsurersPanel } from "@/components/pro/InsurersPanel";
import { VaccineAction } from "@/components/pro/VaccineAction";
import { IssueDocumentAction } from "@/components/pro/IssueDocumentAction";
import { QuestionnairePanel } from "@/components/pro/QuestionnairePanel";
import { ReviewsPanel } from "@/components/pro/ReviewsPanel";
import { WidgetPanel } from "@/components/pro/WidgetPanel";
import { CalendarSyncPanel } from "@/components/pro/CalendarSyncPanel";
import { PushToggle } from "@/components/PushToggle";
import { CredentialsPanel } from "@/components/pro/CredentialsPanel";
import { ReplacementsPanel } from "@/components/pro/ReplacementsPanel";
import { ProfilePanel } from "@/components/pro/ProfilePanel";
import { NewAppointmentForm } from "@/components/pro/NewAppointmentForm";
import { ExportsPanel } from "@/components/pro/ExportsPanel";
import { MissingMentions } from "@/components/pro/MissingMentions";
import { SchedulePanel } from "@/components/pro/SchedulePanel";
import { AiNotesAssistant } from "@/components/pro/AiNotesAssistant";
import { OnboardingChecklist } from "@/components/pro/OnboardingChecklist";
import { RenewalsPanel } from "@/components/pro/RenewalsPanel";
import { PrescriptionPreview } from "@/components/pro/PrescriptionPreview";
import { LabOrderAction } from "@/components/pro/LabOrderAction";
import { MoveAppointmentForm } from "@/components/MoveAppointmentForm";
import { SecretariatPanel } from "@/components/pro/SecretariatPanel";
import { PrescriptionHeaderPanel } from "@/components/pro/PrescriptionHeaderPanel";
import { PrescriptionEditor } from "@/components/pro/PrescriptionEditor";
import { filledItems, newDraft } from "@/lib/prescription-draft";
import { SecuritySection } from "@/components/SecuritySection";
import { markCashPaid } from "@/api/payments";
import { useMe } from "@/api/auth";
import {
  listMyLocations,
  markArrived,
  getMyDoctorProfile,
  createMyDoctorProfile,
  listDoctorAppointments,
  updateAppointmentStatus,
  listMyAvailability,
  saveConsultationRecord,
  addMyConsultationType,
  deleteMyConsultationType,
  getMyWaitlistCount,
  listMyConsultationTypes,
  updateMyConsultationType,
  repeatAppointment,
  moveAppointment,
} from "@/api/doctor";
import { SERIES_INTERVALS } from "@/api/appointments";
import { listSpecialties } from "@/api/directory";
import { logout } from "@/api/auth";
import { dayOfMonth, formatDate, formatDateTime } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const profileQO = queryOptions({
  queryKey: ["my-doctor-profile"],
  queryFn: () => getMyDoctorProfile(),
});
const apptsQO = queryOptions({
  queryKey: ["doctor-appointments"],
  queryFn: () => listDoctorAppointments(),
});
const availQO = queryOptions({
  queryKey: ["my-availability"],
  queryFn: () => listMyAvailability(),
});
const typesQO = queryOptions({
  queryKey: ["my-consultation-types"],
  queryFn: () => listMyConsultationTypes(),
});
const waitlistCountQO = queryOptions({
  queryKey: ["my-waitlist-count"],
  queryFn: () => getMyWaitlistCount(),
});
const specsQO = queryOptions({
  queryKey: ["specialties"],
  queryFn: () => listSpecialties(),
});

// Onglets de l'espace médecin (dans l'adresse : un lien peut ouvrir directement le bon onglet).
const TABS = [
  { id: "rdv", label: "Rendez-vous", icon: CalendarDays },
  { id: "planning", label: "Emploi du temps", icon: CalendarClock },
  { id: "profil", label: "Profil et cabinet", icon: UserRound },
  { id: "ordonnances", label: "Ordonnances", icon: FileSignature },
  { id: "avis", label: "Avis écrits", icon: MessageSquareText },
  { id: "equipe", label: "Secrétariat et remplacements", icon: Users },
  { id: "finances", label: "Finances", icon: Wallet },
  { id: "securite", label: "Sécurité", icon: ShieldCheck },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/pro")({
  validateSearch: (s) =>
    z
      .object({
        onglet: z
          .enum([
            "rdv",
            "planning",
            "profil",
            "ordonnances",
            "avis",
            "equipe",
            "finances",
            "securite",
          ])
          .optional()
          .catch(undefined),
      })
      .parse(s),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileQO),
      context.queryClient.ensureQueryData(specsQO),
    ]),
  head: () => ({
    meta: [
      { title: "Espace pro — Fajma" },
      {
        name: "description",
        content:
          "Tableau de bord médecin : rendez-vous reçus, disponibilités et profil professionnel.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProPage,
});

// Même convention que le backend (et Date.getDay) : 0 = dimanche … 6 = samedi.
const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
// Affichage de la semaine à partir du lundi.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmé", cls: "bg-sunu-teal/15 text-sunu-teal" },
  cancelled: { label: "Annulé", cls: "bg-red-100 text-red-700" },
  completed: { label: "Terminé", cls: "bg-sunu-green-soft text-sunu-green" },
  no_show: { label: "Absent", cls: "bg-gray-200 text-gray-700" },
};

function ProPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useSuspenseQuery(profileQO);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">
              Fajma <span className="text-xs font-semibold text-sunu-teal">· Pro</span>
            </span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <div className="flex items-center gap-3">
            <HelpLink />
            <NotificationBell />
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {profile ? <DoctorDashboard profile={profile} /> : <OnboardingForm />}
      </main>
    </div>
  );
}

function OnboardingForm() {
  const qc = useQueryClient();
  const { data: specs } = useSuspenseQuery(specsQO);
  const { data: me } = useMe();
  // Nom déjà saisi à l'inscription : repris, précédé de « Dr ».
  const known = (me?.full_name ?? "").trim();
  const [form, setForm] = useState({
    full_name: known && !/^(dr|docteur|pr)\.?\s/i.test(known) ? `Dr ${known}` : known,
    specialty_id: "",
    city: "Dakar",
    address: "",
    bio: "",
    years_experience: 5,
    consultation_price: 20000,
    teleconsultation: true,
  });

  const create = useMutation({
    mutationFn: () => createMyDoctorProfile({ data: form }),
    onSuccess: () => {
      toast.success("Fiche médecin créée");
      qc.invalidateQueries({ queryKey: ["my-doctor-profile"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-sunu-line bg-sunu-card p-8 shadow-sunu-card">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-sunu-teal/15 text-sunu-teal">
            <Stethoscope className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-sunu-dark">Devenez médecin Fajma</h1>
            <p className="text-sm text-sunu-ink/60">
              Complétez votre fiche pour recevoir des rendez-vous.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.specialty_id) return toast.error("Choisissez une spécialité");
            create.mutate();
          }}
          className="mt-6 grid gap-4"
        >
          <Field label="Nom complet">
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Dr. Prénom Nom"
              className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
            />
          </Field>
          <Field label="Spécialité">
            <select
              required
              value={form.specialty_id}
              onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
              className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
            >
              <option value="">— Choisir —</option>
              {specs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ville">
              <input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
              />
            </Field>
            <Field label="Années d'expérience">
              <input
                type="number"
                min={0}
                max={70}
                value={form.years_experience}
                onChange={(e) =>
                  setForm({ ...form, years_experience: Number(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
              />
            </Field>
          </div>
          <Field label="Adresse du cabinet (optionnel)">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rue, quartier"
              className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
            />
          </Field>
          <Field label="Présentation (optionnel)">
            <textarea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Parcours, approche, langues parlées..."
              className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prix consultation (FCFA)">
              <input
                type="number"
                min={0}
                step={500}
                value={form.consultation_price}
                onChange={(e) =>
                  setForm({ ...form, consultation_price: Number(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm outline-none focus:border-sunu-green"
              />
            </Field>
            <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={form.teleconsultation}
                onChange={(e) => setForm({ ...form, teleconsultation: e.target.checked })}
                className="size-4 accent-sunu-green"
              />
              Propose la téléconsultation
            </label>
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="mt-2 rounded-xl bg-sunu-green px-4 py-3 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-50"
          >
            {create.isPending ? "Création..." : "Créer ma fiche"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sunu-ink/50">
        {label}
      </span>
      {children}
    </label>
  );
}

type Profile = NonNullable<Awaited<ReturnType<typeof getMyDoctorProfile>>>;

function DoctorDashboard({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { data: appts } = useSuspenseQuery(apptsQO);
  const { data: avail } = useSuspenseQuery(availQO);
  const { data: waitlistCount } = useQuery(waitlistCountQO);

  const [view, setView] = useState<"list" | "week">("list");
  const [showNew, setShowNew] = useState(false);
  const { data: me } = useMe();
  const tab: TabId = Route.useSearch().onglet ?? "rdv";
  const navigate = useNavigate();
  const goTo = (onglet: TabId) =>
    navigate({ to: "/pro", search: onglet === "rdv" ? {} : { onglet }, resetScroll: false });
  const update = useMutation({
    mutationFn: (v: {
      id: string;
      status: "confirmed" | "cancelled" | "completed" | "no_show";
      reason?: string;
      scope?: "one" | "series";
    }) => updateAppointmentStatus({ data: v }),
    onSuccess: (res, v) => {
      toast.success(
        v.scope === "series" ? `${res.cancelled ?? 0} séance(s) annulée(s)` : "Statut mis à jour",
      );
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      qc.invalidateQueries({ queryKey: ["pro-stats"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const moveFromCalendar = useMutation({
    mutationFn: (v: { id: string; scheduled_at: string; duration_minutes: number }) =>
      moveAppointment(v.id, { scheduled_at: v.scheduled_at, duration_minutes: v.duration_minutes }),
    onSuccess: () => {
      toast.success("Rendez-vous déplacé : le patient est prévenu.");
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      qc.invalidateQueries({ queryKey: ["doctor-slots"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelWithReason = (a: Appt) => {
    // Séance d'une série : proposer d'annuler aussi les suivantes.
    const scope =
      a.series && a.series.index < a.series.total
        ? window.confirm(
            "Cette séance fait partie d'une série. Annuler aussi toutes les séances suivantes ?\n\nOK = cette séance et les suivantes · Annuler = cette séance seulement",
          )
          ? "series"
          : "one"
        : "one";
    const reason = window.prompt("Motif de l'annulation (envoyé au patient, facultatif) :");
    if (reason === null) return;
    update.mutate({ id: a.id, status: "cancelled", reason: reason || undefined, scope });
  };

  const now = Date.now();
  // « Aujourd'hui et à venir » garde les RDV du jour encore à traiter (arrivée, terminé, absent).
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const upcoming = appts.filter(
    (a) =>
      (a.status === "pending" || a.status === "confirmed") &&
      new Date(a.scheduled_at).getTime() >= todayStart.getTime(),
  );
  const past = appts
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const pendingCount = appts.filter((a) => a.status === "pending").length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sunu-dark">Bonjour {profile.full_name}</h1>
          {!profile.is_verified && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Fiche en attente de validation : elle apparaîtra dans l’annuaire une fois vos diplômes
              vérifiés par notre équipe.
            </p>
          )}
          <p className="mt-1 text-sm text-sunu-ink/60">
            {profile.specialty?.name} · {profile.city}
          </p>
          {me && !me.mfa_enabled && (
            <button
              onClick={() => goTo("securite")}
              className="mt-2 inline-block rounded-lg bg-red-50 px-3 py-2 text-left text-xs font-semibold text-red-700 hover:underline"
            >
              Sécurisez votre compte : activez la double authentification (vous accédez à des
              données de santé).
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/messages"
            className="flex items-center gap-2 rounded-xl border border-sunu-line bg-sunu-card px-4 py-2 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
          >
            <MessageSquare className="size-4" /> Messages
          </Link>
          <Link
            to="/clinique"
            className="flex items-center gap-2 rounded-xl border border-sunu-line bg-sunu-card px-4 py-2 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
          >
            <Building2 className="size-4" /> Ma clinique
          </Link>
          <Link
            to="/expertise"
            className="flex items-center gap-2 rounded-xl border border-sunu-line bg-sunu-card px-4 py-2 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
          >
            <Stethoscope className="size-4" /> Télé-expertise
          </Link>
          <Stat label="À traiter" value={pendingCount} tone="amber" />
          <Stat label="À venir" value={upcoming.length} tone="blue" />
          <Stat label="Liste d'attente" value={waitlistCount ?? 0} tone="teal" />
        </div>
      </div>

      <MissingMentions />

      <nav
        aria-label="Sections de l'espace médecin"
        className="sticky top-0 z-20 -mx-6 mt-6 flex gap-1 overflow-x-auto border-b border-sunu-line bg-sunu-surface/95 px-6 py-2 backdrop-blur"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => goTo(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === id ? "bg-sunu-green text-white" : "text-sunu-ink/65 hover:bg-sunu-card hover:text-sunu-green"}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === "rdv" && (
        <div className="mt-6">
          <OnboardingChecklist onGo={goTo} />
          <RenewalsPanel />
          <StatsStrip />
          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                Aujourd'hui et à venir
              </h2>
              <button
                onClick={() => setShowNew((v) => !v)}
                className="ml-auto mr-2 flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Plus className="size-3.5" /> Nouveau RDV
              </button>
              <div
                className="inline-flex rounded-lg border border-sunu-line bg-sunu-card p-0.5"
                role="group"
                aria-label="Affichage de l'agenda"
              >
                <button
                  onClick={() => setView("list")}
                  aria-pressed={view === "list"}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "list" ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
                >
                  <LayoutList className="size-3.5" /> Liste
                </button>
                <button
                  onClick={() => setView("week")}
                  aria-pressed={view === "week"}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "week" ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
                >
                  <CalendarDays className="size-3.5" /> Semaine
                </button>
              </div>
            </div>
            {showNew && <NewAppointmentForm profile={profile} onDone={() => setShowNew(false)} />}
            {view === "week" ? (
              <WeekCalendar
                appts={appts}
                onSelect={(a) => {
                  setView("list");
                  setTimeout(
                    () =>
                      document
                        .getElementById(`rdv-${a.id}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                    120,
                  );
                }}
                onMove={(a, scheduled_at, duration_minutes) =>
                  moveFromCalendar.mutate({ id: a.id, scheduled_at, duration_minutes })
                }
              />
            ) : upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center">
                <Calendar className="mx-auto size-10 text-sunu-ink/30" />
                <p className="mt-3 text-sm text-sunu-ink/60">Aucun rendez-vous à venir.</p>
              </div>
            ) : (
              <div className="stagger grid gap-3">
                {upcoming.map((a) => (
                  <DoctorApptCard
                    key={a.id}
                    appt={a}
                    myDoctorId={profile.id}
                    onConfirm={() => update.mutate({ id: a.id, status: "confirmed" })}
                    onCancel={() => cancelWithReason(a)}
                    onDone={() => update.mutate({ id: a.id, status: "completed" })}
                    onNoShow={() => update.mutate({ id: a.id, status: "no_show" })}
                  />
                ))}
              </div>
            )}

            {past.length > 0 && (
              <>
                <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                  Historique
                </h2>
                <div className="stagger grid gap-3">
                  {past.slice(0, 15).map((a) => (
                    <DoctorApptCard key={a.id} appt={a} myDoctorId={profile.id} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "planning" && (
        <div className="mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0">
          <SchedulePanel doctorId={profile.id} verified={profile.is_verified} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <TimeOffPanel />
            <SettingsPanel />
            <ConsultationTypesPanel />
            <LocationsPanel />
            <CalendarSyncPanel />
          </div>
        </div>
      )}

      {tab === "profil" && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
          <ProfilePanel profile={profile} />
          <CredentialsPanel />
          <InsurersPanel />
          <QuestionnairePanel />
          <ReviewsPanel />
          <WidgetPanel />
        </div>
      )}

      {tab === "ordonnances" && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
          <PrescriptionHeaderPanel />
          <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5 text-sm text-sunu-ink/70">
            <h2 className="font-bold text-sunu-dark">Comment délivrer une ordonnance</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                Complétez l'en-tête : n° d'inscription à l'Ordre, cabinet, signature (et cachet).
              </li>
              <li>
                Dans « Rendez-vous », ouvrez la consultation (bouton « Dossier » ou « Compte-rendu /
                ordonnance ») : rédigez le compte-rendu, ajoutez les médicaments, enregistrez.
              </li>
              <li>
                Le patient la reçoit aussitôt (notification et SMS) et peut l'envoyer à sa pharmacie
                ; le pharmacien vérifie son authenticité grâce au QR code.
              </li>
            </ol>
            <PrescriptionPreview
              fullName={profile.full_name}
              specialty={profile.specialty?.name ?? null}
            />
          </div>
        </div>
      )}

      {tab === "avis" && <AsyncPanel />}

      {tab === "equipe" && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
          <SecretariatPanel />
          <ReplacementsPanel myDoctorId={profile.id} />
        </div>
      )}

      {tab === "finances" && (
        <div className="mt-2">
          <FinancePanel />
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <ExportsPanel />
          </div>
        </div>
      )}

      {tab === "securite" && (
        <div className="mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0">
          <PushToggle />
          <SecuritySection />
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "teal";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-sunu-green-soft text-sunu-green",
    teal: "bg-sunu-teal/15 text-sunu-teal",
  }[tone];
  return (
    <div className={`rounded-xl px-4 py-2 ${tones}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider">{label}</div>
    </div>
  );
}

type Appt = Awaited<ReturnType<typeof listDoctorAppointments>>[number];

function DoctorApptCard({
  appt,
  myDoctorId,
  onConfirm,
  onCancel,
  onDone,
  onNoShow,
}: {
  appt: Appt;
  myDoctorId: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onDone?: () => void;
  onNoShow?: () => void;
}) {
  const qc = useQueryClient();
  const arrive = useMutation({
    mutationFn: (arrived: boolean) => markArrived({ data: { id: appt.id, arrived } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctor-appointments"] }),
    onError: (e) => toast.error(e.message),
  });
  const started = new Date(appt.scheduled_at).getTime() <= Date.now();
  // Documents médicaux (compte-rendu, ordonnance, certificat) : à partir de 30 min avant l'heure.
  const canWrite = new Date(appt.scheduled_at).getTime() - 30 * 60_000 <= Date.now();
  const cashPaid = useMutation({
    mutationFn: () => markCashPaid(appt.id),
    onSuccess: (r) => {
      toast.success(`Paiement enregistré · réf. ${r.reference}`);
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      qc.invalidateQueries({ queryKey: ["pro-stats"] });
    },
    onError: (e) => toast.error(e.message),
  });
  // Je remplace le titulaire de ce rendez-vous (ou un remplaçant le reçoit à ma place).
  const iReplace = appt.doctor_id !== myDoctorId;
  const replacedBy = !iReplace && appt.practitioner ? appt.practitioner.full_name : null;
  const [openRepeat, setOpenRepeat] = useState(false);
  const [openMove, setOpenMove] = useState(false);
  const move = useMutation({
    mutationFn: (v: { scheduled_at: string; duration_minutes: number }) =>
      moveAppointment(appt.id, v),
    onSuccess: () => {
      toast.success("Rendez-vous déplacé : le patient est prévenu par SMS");
      setOpenMove(false);
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const [openRecord, setOpenRecord] = useState(false);
  const [record, setRecord] = useState({ summary: "", diagnosis: "", treatment: "" });
  const [rx, setRx] = useState(() => newDraft(appt));
  const navigate = useNavigate();
  const saveRecord = useMutation({
    mutationFn: () => {
      const items = filledItems(rx);
      return saveConsultationRecord({
        data: {
          appointment_id: appt.id,
          ...record,
          ...(items.length ? { ...rx, items } : {}),
        },
      });
    },
    onSuccess: (res) => {
      setOpenRecord(false);
      setRx(newDraft(appt));
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      const prescriptionId = res.prescription_id;
      if (prescriptionId) {
        toast.success("Compte-rendu et ordonnance enregistrés", {
          action: {
            label: "Voir l'ordonnance",
            onClick: () => navigate({ to: "/ordonnance/$id", params: { id: prescriptionId } }),
          },
        });
      } else {
        toast.success("Compte-rendu enregistré");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const d = new Date(appt.scheduled_at);
  const status = STATUS[appt.status] ?? {
    label: appt.status,
    cls: "bg-sunu-green-soft text-sunu-green",
  };
  return (
    <div
      id={`rdv-${appt.id}`}
      className="flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-5 md:flex-row md:flex-wrap md:items-center"
    >
      <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase">
            {formatDate(d, { month: "short" })}
          </div>
          <div className="text-xl font-bold leading-none">{dayOfMonth(d)}</div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-sunu-dark">
            {appt.relative?.full_name ?? (appt.patient?.full_name || "Patient")}
          </h3>
          {appt.relative && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sunu-surface px-2 py-0.5 text-[11px] font-semibold text-sunu-ink/60">
              <Users className="size-3" /> via {appt.patient?.full_name || "son proche"}
            </span>
          )}
          {!appt.patient_id && (
            <span className="rounded-full bg-sunu-surface px-2 py-0.5 text-[11px] font-semibold text-sunu-ink/60">
              Patient sans compte Fajma
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.cls}`}>
            {status.label}
          </span>
          {appt.arrived_at && (appt.status === "pending" || appt.status === "confirmed") && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sunu-teal px-2 py-0.5 text-[11px] font-semibold text-white">
              <UserCheck className="size-3" /> En salle d'attente
            </span>
          )}
          {appt.series && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sunu-surface px-2 py-0.5 text-[11px] font-semibold text-sunu-ink/70">
              <Repeat className="size-3" /> Séance {appt.series.index}/{appt.series.total}
            </span>
          )}
        </div>
        {(iReplace || replacedBy) && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sunu-gold/15 px-2 py-0.5 text-[11px] font-semibold text-sunu-dark">
            <UserRoundCheck className="size-3" />
            {iReplace
              ? `Remplacement de ${appt.doctor_name}`
              : `Assuré par votre remplaçant, ${replacedBy}`}
          </p>
        )}
        {appt.status === "cancelled" && appt.cancelled_by && (
          <p className="mt-1 text-xs text-red-700">
            Annulé par{" "}
            {{ patient: "le patient", doctor: "vous", clinic: "le secrétariat" }[appt.cancelled_by]}
            {appt.cancel_reason ? ` : ${appt.cancel_reason}` : ""}
          </p>
        )}
        <AppointmentHistory path={`/pro/appointments/${appt.id}/history`} />
        <p className="mt-1 text-sm text-sunu-ink/60">
          {formatDateTime(d, { weekday: "long", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {appt.mode === "teleconsultation" ? (
            <span className="inline-flex items-center gap-1">
              <Video className="size-3.5" /> Téléconsultation
            </span>
          ) : appt.mode === "home_visit" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-sunu-dark">
              <House className="size-3.5" /> À domicile
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> Cabinet
            </span>
          )}
          {(appt.patient?.phone ?? appt.external_patient_phone) && (
            <> · {appt.patient?.phone ?? appt.external_patient_phone}</>
          )}
        </p>
        {appt.visit && (
          <div className="mt-1 rounded-lg bg-sunu-gold/10 px-3 py-2 text-xs text-sunu-ink/80">
            <p className="font-semibold text-sunu-dark">{appt.visit.address}</p>
            {appt.visit.landmark && <p>Repère : {appt.visit.landmark}</p>}
            <a
              href={
                appt.visit.latitude != null && appt.visit.longitude != null
                  ? `https://www.google.com/maps/dir/?api=1&destination=${appt.visit.latitude},${appt.visit.longitude}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.visit.address)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-semibold text-sunu-green hover:underline"
            >
              <Navigation className="size-3" />
              {appt.visit.latitude != null
                ? "Itinéraire (position GPS du patient)"
                : "Voir sur la carte"}
            </a>
          </div>
        )}
        {appt.consultation_type && (
          <p className="mt-1 text-xs font-semibold text-sunu-green">
            {appt.consultation_type.name} · {appt.duration_minutes} min
          </p>
        )}
        {appt.reason && <p className="mt-1 text-xs text-sunu-ink/50">Motif : {appt.reason}</p>}
        {appt.insurance && (
          <p className="mt-1 text-xs text-sunu-teal">
            {appt.insurance.insurer} n° {appt.insurance.member_number} ·{" "}
            {appt.insurance.coverage_percent} %
            {appt.insurance.tiers_payant && appt.insurance.insurer_share != null
              ? ` · part patient ${appt.insurance.patient_share?.toLocaleString("fr-FR")} F, à facturer à l'organisme ${appt.insurance.insurer_share.toLocaleString("fr-FR")} F`
              : " · sans tiers payant"}
          </p>
        )}
        {appt.questionnaire && (
          <details className="mt-1 text-xs" open={!!appt.answered_at}>
            <summary
              className={`cursor-pointer font-semibold ${appt.answered_at ? "text-sunu-green" : "text-sunu-ink/45"}`}
            >
              {appt.answered_at ? "Réponses au questionnaire" : "Questionnaire non rempli"}
            </summary>
            {appt.answered_at && (
              <dl className="mt-1 space-y-0.5 rounded-lg bg-sunu-surface p-2">
                {appt.questionnaire.map((q) => (
                  <div key={q.label}>
                    <dt className="text-sunu-ink/55">{q.label}</dt>
                    <dd className="font-medium text-sunu-dark">
                      {q.answer === true ? "Oui" : q.answer === false ? "Non" : (q.answer ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </details>
        )}
        {appt.patient_id &&
          canWrite &&
          (appt.status === "confirmed" || appt.status === "completed") && (
            <>
              <VaccineAction appointmentId={appt.id} />
              <IssueDocumentAction appointmentId={appt.id} />
              <LabOrderAction appointmentId={appt.id} />
            </>
          )}
      </div>
      {(onConfirm || onCancel || onDone) &&
        (appt.status === "pending" || appt.status === "confirmed") && (
          <div className="flex flex-wrap gap-2">
            {appt.status === "pending" && onConfirm && (
              <button
                onClick={onConfirm}
                className="flex items-center gap-1 rounded-lg bg-sunu-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-sunu-teal/90"
              >
                <Check className="size-3.5" /> Confirmer
              </button>
            )}
            {onDone && appt.mode === "in_person" && (
              <button
                onClick={() => arrive.mutate(!appt.arrived_at)}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${appt.arrived_at ? "border-sunu-teal text-sunu-teal" : "border-sunu-line text-sunu-ink/70 hover:border-sunu-teal hover:text-sunu-teal"}`}
              >
                <UserCheck className="size-3.5" /> {appt.arrived_at ? "Arrivé ✓" : "Arrivé"}
              </button>
            )}
            {onDone && started && (
              <button
                onClick={onDone}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <Check className="size-3.5" /> Terminé
              </button>
            )}
            {onNoShow && started && !appt.arrived_at && (
              <button
                onClick={onNoShow}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-gray-400"
              >
                <UserX className="size-3.5" /> Absent
              </button>
            )}
            {appt.patient_id && appt.status === "confirmed" && (
              <Link
                to="/patients/$id"
                params={{ id: appt.patient_id }}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <FolderOpen className="size-3.5" /> Fiche patient
              </Link>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-red-300 hover:text-red-600"
              >
                <X className="size-3.5" /> {appt.status === "pending" ? "Refuser" : "Annuler"}
              </button>
            )}
            {appt.mode === "teleconsultation" && appt.status === "confirmed" && (
              <Link
                to="/teleconsultation/$id"
                params={{ id: appt.id }}
                className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Video className="size-3.5" /> Vidéo
              </Link>
            )}
            {onDone && (
              <button
                onClick={() => setOpenMove((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <CalendarDays className="size-3.5" /> Déplacer
              </button>
            )}
            {onDone && (
              <button
                onClick={() => setOpenRepeat((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <Repeat className="size-3.5" /> Séances
              </button>
            )}
            {appt.patient_id && !iReplace && (
              <Link
                to="/messages"
                search={{ doctor: appt.doctor_id, patient: appt.patient_id }}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
              >
                <MessageSquare className="size-3.5" /> Écrire
              </Link>
            )}
            {onDone && appt.patient_id && canWrite && (
              <button
                onClick={() => setOpenRecord((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
              >
                <FilePlus2 className="size-3.5" /> Dossier
              </button>
            )}
          </div>
        )}
      {appt.status === "completed" &&
        appt.patient_id &&
        (appt.paid ? (
          <span className="rounded-lg bg-sunu-teal/15 px-3 py-1.5 text-xs font-semibold text-sunu-teal">
            Réglé
          </span>
        ) : (
          <button
            onClick={() => cashPaid.mutate()}
            disabled={cashPaid.isPending}
            className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-teal hover:text-sunu-teal disabled:opacity-50"
          >
            Réglé au cabinet
          </button>
        ))}
      {appt.status === "completed" && appt.patient_id && (
        // Compte-rendu et ordonnance aussi après « Terminé » : beaucoup de médecins rédigent après le départ du patient.
        <button
          onClick={() => setOpenRecord((v) => !v)}
          className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
        >
          <FilePlus2 className="size-3.5" /> Compte-rendu / ordonnance
        </button>
      )}
      {openMove && (
        <MoveAppointmentForm
          currentIso={appt.scheduled_at}
          duration={appt.duration_minutes}
          pending={move.isPending}
          onSubmit={(scheduled_at, duration_minutes) =>
            move.mutate({ scheduled_at, duration_minutes })
          }
          onCancel={() => setOpenMove(false)}
        />
      )}
      {openRepeat && <RepeatForm appt={appt} onDone={() => setOpenRepeat(false)} />}
      {openRecord && (
        <div className="w-full border-t border-sunu-line pt-4 md:basis-full">
          <AiNotesAssistant appointmentId={appt.id} current={record} onDraft={setRecord} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Résumé de la consultation *
              <textarea
                required
                value={record.summary}
                onChange={(e) => setRecord({ ...record, summary: e.target.value })}
                placeholder="Résumé de la consultation *"
                className="min-h-24 rounded-lg border border-sunu-line p-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Conclusion / diagnostic
              <textarea
                value={record.diagnosis}
                onChange={(e) => setRecord({ ...record, diagnosis: e.target.value })}
                placeholder="Conclusion / diagnostic"
                className="min-h-24 rounded-lg border border-sunu-line p-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Traitement conseillé
              <textarea
                value={record.treatment}
                onChange={(e) => setRecord({ ...record, treatment: e.target.value })}
                placeholder="Traitement conseillé"
                className="min-h-24 rounded-lg border border-sunu-line p-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-3">
            <MissingMentions compact />
            <PrescriptionEditor appt={appt} value={rx} onChange={setRx} />
          </div>
          <button
            onClick={() =>
              record.summary.trim() ? saveRecord.mutate() : toast.error("Le résumé est obligatoire")
            }
            disabled={saveRecord.isPending}
            className="mt-3 rounded-lg bg-sunu-teal px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Enregistrer dans le dossier patient
          </button>
        </div>
      )}
    </div>
  );
}

const INTERVAL_LABELS: Record<number, string> = {
  1: "Tous les jours",
  2: "Tous les 2 jours",
  3: "Tous les 3 jours",
  7: "Chaque semaine",
  14: "Toutes les 2 semaines",
};

/** Programmer des séances identiques après ce rendez-vous (kiné, pansements, suivi rapproché…). */
function RepeatForm({ appt, onDone }: { appt: Appt; onDone: () => void }) {
  const qc = useQueryClient();
  const [count, setCount] = useState(appt.series ? 1 : 4);
  const [interval, setIntervalDays] = useState(appt.series?.interval_days ?? 7);
  const repeat = useMutation({
    mutationFn: () => repeatAppointment({ data: { id: appt.id, count, interval_days: interval } }),
    onSuccess: (r) => {
      toast.success(`${r.created} séance(s) ajoutée(s), confirmées`, {
        description: r.skipped.length
          ? `Horaires déjà pris ou pendant une absence, non programmés : ${r.skipped.join(", ")}`
          : undefined,
        duration: r.skipped.length ? 10000 : undefined,
      });
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="w-full border-t border-sunu-line pt-4 md:basis-full">
      <p className="text-xs text-sunu-ink/60">
        {appt.series
          ? `Ajouter des séances à la suite de la série (${appt.series.total} séance(s) prévues), même horaire et même motif.`
          : "Programmer des séances identiques après ce rendez-vous, au même horaire. Le patient reçoit un seul message récapitulatif."}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-sunu-ink/60">
          Séances à ajouter
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 block rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 19 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-sunu-ink/60">
          Rythme
          <select
            value={interval}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
            className="mt-1 block rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
          >
            {SERIES_INTERVALS.map((d) => (
              <option key={d} value={d}>
                {INTERVAL_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => repeat.mutate()}
          disabled={repeat.isPending}
          className="rounded-lg bg-sunu-teal px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Programmer
        </button>
      </div>
    </div>
  );
}

const MODES = [
  { value: "both", label: "Cabinet et vidéo" },
  { value: "in_person", label: "Cabinet (et domicile)" },
  { value: "teleconsultation", label: "Vidéo" },
  { value: "home_visit", label: "À domicile seulement" },
] as const;

const SERIES_OPTIONS = [0, 5, 10, 15, 20];

function ConsultationTypesPanel() {
  const qc = useQueryClient();
  const { data: types } = useQuery(typesQO);
  const [form, setForm] = useState<{
    name: string;
    duration_minutes: number;
    price: number;
    mode: (typeof MODES)[number]["value"];
    series_max: number;
  }>({
    name: "",
    duration_minutes: 30,
    price: 15000,
    mode: "both",
    series_max: 0,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-consultation-types"] });
  const add = useMutation({
    mutationFn: () => addMyConsultationType({ data: form }),
    onSuccess: () => {
      toast.success("Motif ajouté");
      setForm({ ...form, name: "" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active?: boolean; series_max?: number }) =>
      updateMyConsultationType({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteMyConsultationType({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <ListChecks className="size-4" /> Motifs de consultation
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/50">
        Chaque motif a sa durée et son tarif. Le patient le choisit en réservant.
      </p>
      <div className="mt-3 grid gap-2">
        {(types ?? []).length === 0 && (
          <p className="text-xs text-sunu-ink/50">Aucun motif : le tarif par défaut s'applique.</p>
        )}
        {(types ?? []).map((t) => (
          <div
            key={t.id}
            className={`flex items-center justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm ${t.is_active ? "" : "opacity-50"}`}
          >
            <span className="min-w-0">
              <b className="text-sunu-dark">{t.name}</b>
              <span className="block text-xs text-sunu-ink/55">
                {t.duration_minutes} min · {t.price.toLocaleString("fr-FR")} F ·{" "}
                {MODES.find((m) => m.value === t.mode)?.label}
              </span>
              <label className="mt-0.5 flex items-center gap-1 text-[11px] text-sunu-ink/55">
                <Repeat className="size-3" /> Série :
                <select
                  value={t.series_max}
                  onChange={(e) => toggle.mutate({ id: t.id, series_max: Number(e.target.value) })}
                  aria-label={`Séances réservables d'un coup pour ${t.name}`}
                  className="rounded border border-sunu-line bg-sunu-card px-1 py-0.5 text-[11px]"
                >
                  {Array.from(new Set([...SERIES_OPTIONS, t.series_max]))
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "non" : `jusqu'à ${n} séances`}
                      </option>
                    ))}
                </select>
              </label>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => toggle.mutate({ id: t.id, is_active: !t.is_active })}
                className="text-xs font-semibold text-sunu-green"
              >
                {t.is_active ? "Masquer" : "Activer"}
              </button>
              <button
                onClick={() => del.mutate(t.id)}
                className="text-sunu-ink/40 hover:text-red-600"
                aria-label={`Supprimer ${t.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-4 grid gap-2 border-t border-sunu-line pt-4"
      >
        <input
          required
          minLength={2}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex. Première consultation, Suivi…"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm outline-none focus:border-sunu-green"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-sunu-ink/60">
            Durée
            <select
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-2 text-sm"
            >
              {[15, 20, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-sunu-ink/60">
            Tarif (FCFA)
            <input
              type="number"
              min={0}
              step={500}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-sunu-line px-2 py-2 text-sm"
            />
          </label>
        </div>
        <select
          value={form.mode}
          onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}
          className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="text-xs text-sunu-ink/60">
          Réservation en série (kiné, pansements, rééducation…)
          <select
            value={form.series_max}
            onChange={(e) => setForm({ ...form, series_max: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-2 text-sm"
          >
            {SERIES_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Une séance à la fois" : `Jusqu'à ${n} séances d'un coup`}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={add.isPending}
          className="flex items-center justify-center gap-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Ajouter le motif
        </button>
      </form>
    </div>
  );
}
