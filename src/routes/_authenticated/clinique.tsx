import { createFileRoute, Link } from "@tanstack/react-router";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { ThemeToggle } from "@/lib/theme";
import { LogoutButton } from "@/components/LogoutButton";
import { HelpLink } from "@/components/HelpLink";
import { NotificationBell } from "@/components/NotificationBell";
import { useMe } from "@/api/auth";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import {
  Pencil,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Plus,
  Stethoscope,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateClinicTeam,
  addClinicDoctor,
  createMyClinic,
  getMyClinic,
  listClinicCandidates,
  addClinicStaff,
  clinicBookAppointment,
  clinicRepeatAppointment,
  clinicMoveAppointment,
  clinicExportUrl,
  clinicUpdateAppointment,
  listClinicAgenda,
  removeClinicMember,
  removeClinicStaff,
  updateClinic,
} from "@/api/clinic";
import { SecuritySection } from "@/components/SecuritySection";
import { CredentialsPanel } from "@/components/pro/CredentialsPanel";
import { listDoctorSlots } from "@/api/directory";
import type { Mode } from "@/api/types";
import { MoveAppointmentForm } from "@/components/MoveAppointmentForm";
import { listClinicPatients, type ClinicPatient } from "@/api/clinic";
import { PatientsDirectory } from "@/components/clinic/PatientsDirectory";
import {
  formatDate,
  formatTime,
  fromDakarInput,
  startOfDakarDay,
  toDakarInput,
} from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const clinicQO = queryOptions({ queryKey: ["my-clinic"], queryFn: () => getMyClinic() });
const candidatesQO = queryOptions({
  queryKey: ["clinic-candidates"],
  queryFn: () => listClinicCandidates(),
});

export const Route = createFileRoute("/_authenticated/clinique")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicQO),
  head: () => ({
    meta: [
      { title: "Espace clinique — Fajma" },
      { name: "description", content: "Gérez votre établissement, son agenda et son équipe." },
      { property: "og:title", content: "Espace clinique — Fajma" },
      { property: "og:description", content: "Gestion d'établissement de santé." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClinicPage,
});

type Clinic = NonNullable<Awaited<ReturnType<typeof getMyClinic>>>;

function ClinicPage() {
  const { data: clinic } = useSuspenseQuery(clinicQO);
  const { data: me } = useMe();
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="font-bold text-sunu-green">Fajma · Clinique</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <div className="flex items-center gap-4">
            {me?.is_doctor && (
              <Link
                to="/pro"
                className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60"
              >
                <ArrowLeft className="size-4" />{" "}
                <span className="hidden sm:inline">Espace pro</span>
              </Link>
            )}
            <NotificationBell />
            <HelpLink role="clinique" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {clinic ? <ClinicDashboard clinic={clinic} /> : <CreateClinicForm />}
      </main>
    </div>
  );
}

function CreateClinicForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    city: "Dakar",
    address: "",
    phone: "",
    description: "",
  });
  const create = useMutation({
    mutationFn: () => createMyClinic({ data: form }),
    onSuccess: () => {
      toast.success("Établissement créé");
      qc.invalidateQueries({ queryKey: ["my-clinic"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-sunu-line bg-sunu-card p-7">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-sunu-green-soft text-sunu-green">
          <Building2 />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-sunu-dark">Inscrire mon établissement</h1>
          <p className="text-sm text-sunu-ink/60">Clinique, cabinet de groupe ou centre médical.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="mt-6 grid gap-3 sm:grid-cols-2"
      >
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nom de l'établissement"
          className="rounded-lg border border-sunu-line px-3 py-3 text-sm"
        />
        <input
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          placeholder="Ville"
          className="rounded-lg border border-sunu-line px-3 py-3 text-sm"
        />
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Adresse"
          className="rounded-lg border border-sunu-line px-3 py-3 text-sm"
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Téléphone"
          className="rounded-lg border border-sunu-line px-3 py-3 text-sm"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Présentation"
          className="min-h-28 rounded-lg border border-sunu-line px-3 py-3 text-sm sm:col-span-2"
        />
        <button
          disabled={create.isPending}
          className="rounded-lg bg-sunu-green px-4 py-3 text-sm font-semibold text-white sm:col-span-2"
        >
          Créer l'établissement
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-sunu-ink/50">
        Vous êtes secrétaire ? Demandez au responsable de votre clinique de vous ajouter avec
        l'email de votre compte.
      </p>
    </div>
  );
}

function ClinicDashboard({ clinic }: { clinic: Clinic }) {
  const [tab, setTab] = useState<"agenda" | "patients" | "team">("agenda");
  const isOwner = clinic.access === "owner";
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-sunu-dark">{clinic.name}</h1>
            {clinic.is_verified && <CheckCircle2 className="size-5 text-sunu-success" />}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-sunu-ink/60">
            <MapPin className="size-4" /> {clinic.address ? `${clinic.address}, ` : ""}
            {clinic.city}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${clinic.is_verified ? "bg-sunu-teal/15 text-sunu-teal" : "bg-amber-100 text-amber-800"}`}
          >
            {clinic.is_verified ? "Établissement vérifié" : "Vérification en cours"}
          </span>
          {!isOwner && (
            <span className="text-xs font-semibold text-sunu-ink/50">
              Connecté en tant que {clinic.access === "manager" ? "gestionnaire" : "secrétaire"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-xl border border-sunu-line bg-sunu-card p-1">
        {(
          [
            ["agenda", "Agenda", CalendarDays],
            ["patients", "Patients", UserCog],
            ["team", "Équipe", Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "agenda" ? (
          <Agenda clinic={clinic} />
        ) : tab === "patients" ? (
          <PatientsDirectory clinicId={clinic.id} />
        ) : (
          <Team clinic={clinic} />
        )}
      </div>
      {isOwner && clinic.kind !== "practice" && (
        <div className="mt-10 max-w-2xl">
          <CredentialsPanel
            ownerType="clinic"
            ownerId={clinic.id}
            title="Justificatifs de l'établissement"
          />
        </div>
      )}
      <div className="mt-10">
        <SecuritySection />
      </div>
    </>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "À confirmer", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmé", cls: "bg-sunu-teal/15 text-sunu-teal" },
  cancelled: { label: "Annulé", cls: "bg-red-100 text-red-700" },
  completed: { label: "Terminé", cls: "bg-sunu-green-soft text-sunu-green" },
  no_show: { label: "Absent", cls: "bg-gray-200 text-gray-700" },
};

function Agenda({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => startOfDakarDay(new Date()));
  const [doctorFilter, setDoctorFilter] = useState("");
  const agendaKey = ["clinic-agenda", clinic.id, from.toISOString()];
  const { data: appts, isLoading } = useQuery({
    queryKey: agendaKey,
    queryFn: () =>
      listClinicAgenda({ data: { clinic_id: clinic.id, from: from.toISOString(), days: 7 } }),
    refetchInterval: 30_000,
  });
  const update = useMutation({
    mutationFn: (v: {
      id: string;
      status: "confirmed" | "cancelled" | "completed";
      scope?: "one" | "series";
    }) => clinicUpdateAppointment({ data: { clinic_id: clinic.id, ...v } }),
    onSuccess: (res, v) => {
      toast.success(
        v.scope === "series"
          ? `${res.cancelled ?? 0} séance(s) annulée(s)`
          : "Rendez-vous mis à jour",
      );
      qc.invalidateQueries({ queryKey: ["clinic-agenda", clinic.id] });
    },
    onError: (e) => toast.error(e.message),
  });
  const [repeatFor, setRepeatFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: (v: { id: string; scheduled_at: string; duration_minutes: number }) =>
      clinicMoveAppointment({ data: { clinic_id: clinic.id, ...v } }),
    onSuccess: () => {
      toast.success("Rendez-vous déplacé : le patient est prévenu par SMS");
      setMoveFor(null);
      qc.invalidateQueries({ queryKey: ["clinic-agenda", clinic.id] });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (appts ?? []).filter((a) => !doctorFilter || a.doctor_id === doctorFilter);
  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * 86_400_000));
  const shift = (n: number) => setFrom(new Date(from.getTime() + n * 86_400_000));

  if (clinic.members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/55">
        Ajoutez d'abord des médecins dans l'onglet « Équipe » pour gérer leur agenda.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => shift(-7)}
              className="rounded-lg border border-sunu-line bg-sunu-card p-2"
              aria-label="Semaine précédente"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-sunu-dark">
              {formatDate(from, { day: "numeric", month: "long" })} –{" "}
              {formatDate(days[6] ?? 0, { day: "numeric", month: "long" })}
            </span>
            <button
              onClick={() => shift(7)}
              className="rounded-lg border border-sunu-line bg-sunu-card p-2"
              aria-label="Semaine suivante"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              onClick={() => setFrom(startOfDakarDay(new Date()))}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-xs font-semibold"
            >
              Aujourd'hui
            </button>
            <a
              href={clinicExportUrl(
                clinic.id,
                from.toISOString().slice(0, 10),
                (days[6] ?? from).toISOString().slice(0, 10),
              )}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-xs font-semibold"
              title="Télécharger la semaine affichée (Excel)"
            >
              Exporter
            </a>
          </div>
          <select
            value={doctorFilter}
            aria-label="Filtrer par médecin"
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
          >
            <option value="">Tous les médecins</option>
            {clinic.members.map(
              (m) =>
                m.doctor && (
                  <option key={m.doctor.id} value={m.doctor.id}>
                    {m.doctor.full_name}
                  </option>
                ),
            )}
          </select>
        </div>

        {isLoading ? (
          <p className="text-sm text-sunu-ink/50">Chargement…</p>
        ) : (
          <div className="space-y-5">
            {days.map((day) => {
              const list = rows.filter(
                (a) => startOfDakarDay(new Date(a.scheduled_at)).getTime() === day.getTime(),
              );
              return (
                <div key={day.toISOString()}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
                    {formatDate(day, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    ({list.length})
                  </h3>
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-sunu-line bg-sunu-card px-4 py-3 text-xs text-sunu-ink/40">
                      Aucun rendez-vous
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {list.map((a) => {
                        const st = STATUS[a.status] ?? { label: a.status, cls: "" };
                        const active = a.status === "pending" || a.status === "confirmed";
                        return (
                          <div
                            key={a.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card p-3"
                          >
                            <span className="w-14 text-center text-sm font-bold text-sunu-green">
                              {formatTime(a.scheduled_at)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sunu-dark">
                                {a.patient_name}
                                {a.walk_in && (
                                  <span className="ml-2 text-[11px] font-normal text-sunu-ink/50">
                                    (sans compte)
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-sunu-ink/55">
                                {a.doctor?.full_name} · {a.duration_minutes} min
                                {a.consultation_type ? ` · ${a.consultation_type.name}` : ""}
                                {a.mode === "teleconsultation" ? " · Vidéo" : ""}
                                {a.series ? ` · séance ${a.series.index}/${a.series.total}` : ""}
                              </p>
                              {a.practitioner && (
                                <p className="text-xs font-semibold text-sunu-dark">
                                  Assuré par {a.practitioner.full_name} (remplaçant)
                                </p>
                              )}
                              {a.visit && (
                                <p className="text-xs font-semibold text-sunu-dark">
                                  À domicile : {a.visit.address}
                                  {a.visit.landmark ? ` (${a.visit.landmark})` : ""}
                                </p>
                              )}
                              {a.patient_phone && (
                                <a
                                  href={`tel:${a.patient_phone}`}
                                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-sunu-green"
                                >
                                  <Phone className="size-3" /> {a.patient_phone}
                                </a>
                              )}
                              <AppointmentHistory
                                path={`/clinics/${clinic.id}/appointments/${a.id}/history`}
                              />
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}
                            >
                              {st.label}
                            </span>
                            {active && (
                              <div className="flex gap-1.5">
                                {a.status === "pending" && (
                                  <button
                                    onClick={() => update.mutate({ id: a.id, status: "confirmed" })}
                                    className="rounded-lg bg-sunu-teal p-1.5 text-white"
                                    aria-label="Confirmer"
                                  >
                                    <Check className="size-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => update.mutate({ id: a.id, status: "completed" })}
                                  className="rounded-lg border border-sunu-line px-2 py-1 text-xs font-semibold"
                                >
                                  Venu
                                </button>
                                <button
                                  onClick={() => setMoveFor(moveFor === a.id ? null : a.id)}
                                  className="rounded-lg border border-sunu-line px-2 py-1 text-xs font-semibold"
                                >
                                  Déplacer
                                </button>
                                <button
                                  onClick={() => setRepeatFor(repeatFor === a.id ? null : a.id)}
                                  className="rounded-lg border border-sunu-line px-2 py-1 text-xs font-semibold"
                                  title="Programmer des séances identiques"
                                >
                                  Séances
                                </button>
                                <button
                                  onClick={() => {
                                    const series =
                                      a.series &&
                                      a.series.index < a.series.total &&
                                      window.confirm(
                                        "Séance d'une série : annuler aussi toutes les séances suivantes ?\n\nOK = cette séance et les suivantes · Annuler = cette séance seulement",
                                      );
                                    update.mutate({
                                      id: a.id,
                                      status: "cancelled",
                                      scope: series ? "series" : "one",
                                    });
                                  }}
                                  className="rounded-lg border border-sunu-line p-1.5 text-sunu-ink/60 hover:text-red-600"
                                  aria-label="Annuler"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            )}
                            {moveFor === a.id && (
                              <MoveAppointmentForm
                                currentIso={a.scheduled_at}
                                duration={a.duration_minutes}
                                pending={move.isPending}
                                onSubmit={(scheduled_at, duration_minutes) =>
                                  move.mutate({ id: a.id, scheduled_at, duration_minutes })
                                }
                                onCancel={() => setMoveFor(null)}
                              />
                            )}
                            {repeatFor === a.id && (
                              <RepeatRow
                                clinicId={clinic.id}
                                appointmentId={a.id}
                                onDone={() => setRepeatFor(null)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <WalkInForm clinic={clinic} />
    </div>
  );
}

const INTERVALS = [
  { days: 1, label: "tous les jours" },
  { days: 2, label: "tous les 2 jours" },
  { days: 3, label: "tous les 3 jours" },
  { days: 7, label: "chaque semaine" },
  { days: 14, label: "toutes les 2 semaines" },
];

function RepeatRow({
  clinicId,
  appointmentId,
  onDone,
}: {
  clinicId: string;
  appointmentId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [count, setCount] = useState(4);
  const [interval, setIntervalDays] = useState(7);
  const repeat = useMutation({
    mutationFn: () =>
      clinicRepeatAppointment({
        data: { clinic_id: clinicId, id: appointmentId, count, interval_days: interval },
      }),
    onSuccess: (r) => {
      toast.success(`${r.created} séance(s) programmée(s)`, {
        description: r.skipped.length
          ? `Horaires déjà pris, non programmés : ${r.skipped.join(", ")}`
          : undefined,
        duration: r.skipped.length ? 10000 : undefined,
      });
      qc.invalidateQueries({ queryKey: ["clinic-agenda", clinicId] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-sunu-line pt-2 text-xs">
      <span className="text-sunu-ink/60">Ajouter</span>
      <select
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        aria-label="Nombre de séances"
        className="rounded border border-sunu-line bg-sunu-card px-1.5 py-1"
      >
        {Array.from({ length: 19 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} séance{n > 1 ? "s" : ""}
          </option>
        ))}
      </select>
      <select
        value={interval}
        onChange={(e) => setIntervalDays(Number(e.target.value))}
        aria-label="Rythme"
        className="rounded border border-sunu-line bg-sunu-card px-1.5 py-1"
      >
        {INTERVALS.map((i) => (
          <option key={i.days} value={i.days}>
            {i.label}
          </option>
        ))}
      </select>
      <span className="text-sunu-ink/60">au même horaire</span>
      <button
        onClick={() => repeat.mutate()}
        disabled={repeat.isPending}
        className="rounded-lg bg-sunu-teal px-3 py-1 font-semibold text-white disabled:opacity-50"
      >
        Programmer
      </button>
    </div>
  );
}

function WalkInForm({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const doctors = clinic.members.flatMap((m) => (m.doctor ? [m.doctor] : []));
  const [form, setForm] = useState({
    doctor_id: doctors[0]?.id ?? "",
    when: "",
    duration_minutes: 30,
    patient_name: "",
    patient_phone: "",
    reason: "",
    mode: "in_person" as Mode,
    visit_address: "",
    visit_landmark: "",
    extra_sessions: 0,
    interval_days: 7,
  });
  // Patient choisi dans le fichier : un patient inscrit reçoit le RDV dans son espace (et ses rappels).
  const [picked, setPicked] = useState<ClinicPatient | null>(null);
  const { data: suggestions } = useQuery({
    queryKey: ["clinic-patients", clinic.id, form.patient_name],
    queryFn: () => listClinicPatients({ data: { clinic_id: clinic.id, q: form.patient_name } }),
    enabled: !picked && form.patient_name.trim().length >= 2,
  });
  const home = form.mode === "home_visit";
  const { data: slots } = useQuery({
    queryKey: ["doctor-slots", form.doctor_id, form.duration_minutes, "clinic", home],
    queryFn: () =>
      listDoctorSlots({
        data: {
          doctor_id: form.doctor_id,
          days: 7,
          duration_minutes: form.duration_minutes,
          mode: home ? "home_visit" : undefined,
        },
      }),
    enabled: Boolean(form.doctor_id),
  });
  const book = useMutation({
    mutationFn: async () => {
      const res = await clinicBookAppointment({
        data: {
          clinic_id: clinic.id,
          doctor_id: form.doctor_id,
          scheduled_at: fromDakarInput(form.when).toISOString(),
          duration_minutes: form.duration_minutes,
          mode: form.mode,
          patient_name: form.patient_name,
          patient_phone: form.patient_phone || undefined,
          patient_id: picked?.registered ? (picked.patient_id ?? undefined) : undefined,
          reason: form.reason || undefined,
          ...(home
            ? {
                visit_address: form.visit_address,
                visit_landmark: form.visit_landmark || undefined,
              }
            : {}),
        },
      });
      // Séances suivantes programmées dans la foulée (kiné, pansements…).
      if (form.extra_sessions > 0) {
        return clinicRepeatAppointment({
          data: {
            clinic_id: clinic.id,
            id: res.id,
            count: form.extra_sessions,
            interval_days: form.interval_days,
          },
        });
      }
      return null;
    },
    onSuccess: (r) => {
      toast.success(
        r
          ? `Rendez-vous et ${r.created} séance(s) suivante(s) enregistrés`
          : "Rendez-vous enregistré",
        {
          description: r?.skipped.length
            ? `Horaires déjà pris, non programmés : ${r.skipped.join(", ")}`
            : undefined,
        },
      );
      setForm({
        ...form,
        when: "",
        patient_name: "",
        patient_phone: "",
        reason: "",
        visit_address: "",
        visit_landmark: "",
        extra_sessions: 0,
      });
      setPicked(null);
      qc.invalidateQueries({ queryKey: ["clinic-agenda", clinic.id] });
      qc.invalidateQueries({ queryKey: ["doctor-slots", form.doctor_id] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <aside className="self-start rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Plus className="size-4 text-sunu-green" /> Nouveau rendez-vous
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/50">
        Pour un patient au guichet ou au téléphone, même sans compte Fajma.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.when) return toast.error("Choisissez un horaire");
          if (home && form.visit_address.trim().length < 5) {
            return toast.error("Indiquez l'adresse de la visite");
          }
          book.mutate();
        }}
        className="mt-4 grid gap-2"
      >
        <select
          value={form.mode}
          onChange={(e) => setForm({ ...form, mode: e.target.value as Mode, when: "" })}
          aria-label="Type de consultation"
          className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
        >
          <option value="in_person">Au cabinet</option>
          <option value="teleconsultation">Téléconsultation</option>
          <option value="home_visit">Visite à domicile</option>
        </select>
        <select
          value={form.doctor_id}
          aria-label="Médecin"
          onChange={(e) => setForm({ ...form, doctor_id: e.target.value, when: "" })}
          className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <select
          value={form.duration_minutes}
          aria-label="Durée"
          onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
          className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
        >
          {[15, 20, 30, 45, 60, 90].map((n) => (
            <option key={n} value={n}>
              {n} min
            </option>
          ))}
        </select>
        {(slots?.slots ?? []).length > 0 && (
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {(slots?.slots ?? []).slice(0, 24).map((s) => {
              const v = toDakarInput(s.iso);
              return (
                <button
                  type="button"
                  key={s.iso}
                  onClick={() => setForm({ ...form, when: v })}
                  className={`rounded-md border px-2 py-1 text-[11px] ${form.when === v ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        <input
          type="datetime-local"
          aria-label="Horaire"
          value={form.when}
          onChange={(e) => setForm({ ...form, when: e.target.value })}
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <input
          required
          minLength={2}
          value={form.patient_name}
          onChange={(e) => {
            setPicked(null);
            setForm({ ...form, patient_name: e.target.value });
          }}
          placeholder="Nom du patient"
          aria-label="Nom du patient"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        {picked ? (
          <p className="flex items-center justify-between rounded-lg bg-sunu-green-soft/50 px-3 py-1.5 text-xs text-sunu-green">
            {picked.registered
              ? "Patient inscrit : le RDV apparaîtra dans son espace"
              : "Patient déjà connu de la clinique"}
            <button type="button" onClick={() => setPicked(null)} className="font-semibold">
              Changer
            </button>
          </p>
        ) : (
          (suggestions ?? []).length > 0 && (
            <ul className="rounded-lg border border-sunu-line text-xs" aria-label="Patients connus">
              {(suggestions ?? []).slice(0, 5).map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(s);
                      setForm({ ...form, patient_name: s.name, patient_phone: s.phone ?? "" });
                    }}
                    className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-sunu-surface"
                  >
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-sunu-ink/50">{s.phone ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        <input
          value={form.patient_phone}
          onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
          placeholder="Téléphone (pour les rappels SMS)"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        {home && (
          <>
            <input
              value={form.visit_address}
              onChange={(e) => setForm({ ...form, visit_address: e.target.value })}
              maxLength={300}
              placeholder="Adresse de la visite (quartier, rue, n° de maison)"
              aria-label="Adresse de la visite"
              className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
            />
            <input
              value={form.visit_landmark}
              onChange={(e) => setForm({ ...form, visit_landmark: e.target.value })}
              maxLength={200}
              placeholder="Repère (derrière la mosquée, portail bleu…)"
              aria-label="Repère"
              className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
            />
          </>
        )}
        <input
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Motif (optionnel)"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-sunu-ink/60">
            Séances suivantes
            <select
              value={form.extra_sessions}
              onChange={(e) => setForm({ ...form, extra_sessions: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 20 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Aucune" : `+ ${n}`}
                </option>
              ))}
            </select>
          </label>
          {form.extra_sessions > 0 && (
            <label className="text-xs text-sunu-ink/60">
              Rythme
              <select
                value={form.interval_days}
                onChange={(e) => setForm({ ...form, interval_days: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
              >
                {INTERVALS.map((i) => (
                  <option key={i.days} value={i.days}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          disabled={book.isPending || !form.doctor_id}
          className="rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </form>
    </aside>
  );
}

/** Informations de l'établissement (responsable uniquement). */
function ClinicInfoForm({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: clinic.name,
    city: clinic.city,
    address: clinic.address ?? "",
    phone: clinic.phone ?? "",
    description: clinic.description ?? "",
  });
  const save = useMutation({
    mutationFn: () => updateClinic({ data: { clinic_id: clinic.id, ...form } }),
    onSuccess: () => {
      toast.success("Informations enregistrées");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-clinic"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-sunu-line bg-sunu-card p-4 text-left text-sm font-semibold text-sunu-green hover:border-sunu-green"
      >
        Modifier les informations de l'établissement
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid gap-2 rounded-xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="font-bold text-sunu-dark">Informations de l'établissement</h2>
      <input
        required
        minLength={2}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        aria-label="Nom"
        placeholder="Nom"
        className={field}
      />
      <input
        required
        minLength={2}
        value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })}
        aria-label="Ville"
        placeholder="Ville"
        className={field}
      />
      <input
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        aria-label="Adresse"
        placeholder="Adresse"
        className={field}
      />
      <input
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        aria-label="Téléphone"
        placeholder="Téléphone"
        className={field}
      />
      <textarea
        rows={3}
        maxLength={1500}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        aria-label="Présentation"
        placeholder="Présentation, services, urgences…"
        className={field}
      />
      <div className="flex gap-2">
        <button
          disabled={save.isPending}
          className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function Team({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const isOwner = clinic.access === "owner";
  const { data: doctors } = useQuery({ ...candidatesQO, enabled: isOwner });
  const [doctorId, setDoctorId] = useState("");
  const [staff, setStaff] = useState<{ email: string; role: "secretary" | "manager" }>({
    email: "",
    role: "secretary",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-clinic"] });
  const add = useMutation({
    mutationFn: () =>
      addClinicDoctor({ data: { clinic_id: clinic.id, doctor_id: doctorId, title: "Médecin" } }),
    onSuccess: () => {
      toast.success("Médecin ajouté");
      setDoctorId("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const addStaff = useMutation({
    mutationFn: () => addClinicStaff({ data: { clinic_id: clinic.id, ...staff } }),
    onSuccess: () => {
      toast.success("Membre ajouté");
      setStaff({ email: "", role: "secretary" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeStaff = useMutation({
    mutationFn: (id: string) => removeClinicStaff({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const team = useMutation({
    mutationFn: (
      v: { staff_id: string; role: "secretary" | "manager" } | { member_id: string; title: string },
    ) => updateClinicTeam(clinic.id, v),
    onSuccess: () => {
      toast.success("Équipe mise à jour");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = useMutation({
    mutationFn: (member_id: string) =>
      removeClinicMember({ data: { clinic_id: clinic.id, member_id } }),
    onSuccess: () => {
      toast.success("Médecin retiré de l'équipe");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-8">
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-sunu-dark">
            <Stethoscope className="size-5 text-sunu-green" /> Équipe médicale (
            {clinic.members.length})
          </h2>
          {clinic.members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/55">
              Ajoutez le premier médecin de votre établissement.
            </div>
          ) : (
            <div className="grid gap-3">
              {clinic.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card p-4"
                >
                  <span className="grid size-11 place-items-center rounded-lg bg-sunu-green-soft text-sunu-green">
                    <Stethoscope className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sunu-dark">{m.doctor?.full_name}</p>
                    <p className="text-xs text-sunu-ink/55">
                      {m.title} · {m.doctor?.specialty?.name} · {m.doctor?.city}
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => {
                        const title = window.prompt(
                          `Titre affiché pour ${m.doctor?.full_name} (ex. Chef de service) :`,
                          m.title,
                        );
                        if (title && title.trim().length >= 2)
                          team.mutate({ member_id: m.id, title: title.trim() });
                      }}
                      className="text-sunu-ink/40 hover:text-sunu-green"
                      aria-label={`Modifier le titre de ${m.doctor?.full_name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Retirer ${m.doctor?.full_name} de l'équipe ? Le secrétariat n'aura plus accès à son agenda (ses rendez-vous restent valables).`,
                          )
                        )
                          removeMember.mutate(m.id);
                      }}
                      className="text-sunu-ink/40 hover:text-red-600"
                      aria-label={`Retirer ${m.doctor?.full_name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {isOwner && (
          <div>
            <h2 className="mb-3 flex items-center gap-2 font-bold text-sunu-dark">
              <UserCog className="size-5 text-sunu-green" /> Secrétariat ({clinic.staff.length})
            </h2>
            {clinic.staff.length === 0 ? (
              <p className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-6 text-center text-sm text-sunu-ink/55">
                Ajoutez vos secrétaires pour qu'ils gèrent l'agenda de tous les médecins.
              </p>
            ) : (
              <div className="grid gap-2">
                {clinic.staff.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-sunu-line bg-sunu-card p-3"
                  >
                    <div>
                      <p className="font-semibold text-sunu-dark">{s.full_name}</p>
                      <p className="text-xs text-sunu-ink/55">{s.phone ?? ""}</p>
                    </div>
                    <select
                      aria-label={`Rôle de ${s.full_name}`}
                      value={s.role}
                      onChange={(e) =>
                        team.mutate({
                          staff_id: s.id,
                          role: e.target.value as "secretary" | "manager",
                        })
                      }
                      className="ml-auto mr-3 rounded-lg border border-sunu-line bg-sunu-card px-2 py-1 text-xs"
                    >
                      <option value="secretary">Secrétaire</option>
                      <option value="manager">Gestionnaire</option>
                    </select>
                    <button
                      onClick={() => {
                        if (window.confirm(`Retirer l'accès de ${s.full_name} ?`))
                          removeStaff.mutate(s.id);
                      }}
                      className="text-sunu-ink/40 hover:text-red-600"
                      aria-label={`Retirer ${s.full_name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      {isOwner && (
        <aside className="space-y-4 self-start">
          <ClinicInfoForm clinic={clinic} />
          <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
            <h2 className="font-bold text-sunu-dark">Ajouter un praticien</h2>
            <select
              value={doctorId}
              aria-label="Médecin à rattacher"
              onChange={(e) => setDoctorId(e.target.value)}
              className="mt-4 w-full rounded-lg border border-sunu-line px-3 py-2.5 text-sm"
            >
              <option value="">Choisir un médecin</option>
              {(doctors ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} — {d.specialty?.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => doctorId && add.mutate()}
              disabled={!doctorId || add.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="size-4" /> Ajouter
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addStaff.mutate();
            }}
            className="rounded-xl border border-sunu-line bg-sunu-card p-5"
          >
            <h2 className="font-bold text-sunu-dark">Ajouter au secrétariat</h2>
            <p className="mt-1 text-xs text-sunu-ink/50">
              La personne doit déjà avoir un compte Fajma.
            </p>
            <input
              required
              type="email"
              value={staff.email}
              onChange={(e) => setStaff({ ...staff, email: e.target.value })}
              placeholder="Email du compte"
              className="mt-3 w-full rounded-lg border border-sunu-line px-3 py-2.5 text-sm"
            />
            <select
              value={staff.role}
              aria-label="Rôle"
              onChange={(e) =>
                setStaff({ ...staff, role: e.target.value as "secretary" | "manager" })
              }
              className="mt-2 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm"
            >
              <option value="secretary">Secrétaire</option>
              <option value="manager">Gestionnaire</option>
            </select>
            <button
              disabled={addStaff.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="size-4" /> Ajouter
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
