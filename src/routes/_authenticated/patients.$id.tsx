import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  BellRing,
  CalendarDays,
  FileText,
  Heart,
  Lock,
  MessageSquare,
  Phone,
  StickyNote,
  Trash2,
  Pill,
  FlaskConical,
} from "lucide-react";
import { LazyMeasurementsChart as MeasurementsChart } from "@/components/care/LazyMeasurementsChart";
import { formatMeasurement } from "@/lib/measurements";
import type { Measurement, MeasurementKind } from "@/api/care";
import { toast } from "sonner";
import {
  addPatientNote,
  addRecall,
  deleteRecall,
  getMyDoctorProfile,
  getPatientFile,
} from "@/api/doctor";
import { formatDate, formatDateTime } from "@/lib/datetime";

const fileQO = (id: string) =>
  queryOptions({
    queryKey: ["patient-file", id],
    queryFn: () => getPatientFile({ data: { patient_id: id } }),
  });

export const Route = createFileRoute("/_authenticated/patients/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(fileQO(params.id)),
  head: () => ({
    meta: [{ title: "Fiche patient — Fajma Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: PatientFilePage,
});

const STATUS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
  no_show: "Absent",
};

const HEALTH_LABELS: [keyof Omit<import("@/api/types").HealthProfile, "updated_at">, string][] = [
  ["blood_group", "Groupe sanguin"],
  ["allergies", "Allergies"],
  ["conditions", "Antécédents"],
  ["treatments", "Traitements en cours"],
  ["vaccinations", "Vaccinations"],
  ["emergency_contact", "Personne à prévenir"],
];

function PatientFilePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(fileQO(id));
  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: () => addPatientNote({ data: { patient_id: id, content: note } }),
    onSuccess: (res) => {
      qc.setQueryData(fileQO(id).queryKey, res);
      setNote("");
      toast.success("Note enregistrée");
    },
    onError: (e) => toast.error(e.message),
  });
  const hp = data.health_profile;
  const hasHealth = HEALTH_LABELS.some(([k]) => hp[k]);

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" />
            </span>
            <span className="text-xl font-bold text-sunu-green">
              Fajma <span className="text-xs font-semibold text-sunu-teal">· Pro</span>
            </span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/pro"
            className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60"
          >
            <ArrowLeft className="size-4" /> Mon agenda
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
              Fiche patient
            </p>
            <h1 className="mt-1 text-3xl font-bold text-sunu-dark">{data.patient.full_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-sunu-ink/60">
              {data.patient.phone && (
                <a
                  href={`tel:${data.patient.phone}`}
                  className="inline-flex items-center gap-1 text-sunu-green"
                >
                  <Phone className="size-3.5" /> {data.patient.phone}
                </a>
              )}
              {data.patient.city && <span>{data.patient.city}</span>}
              <span>{data.patient.email}</span>
            </p>
          </div>
          <div className="flex gap-2 text-center text-xs">
            <Badge label="RDV" value={data.stats.total} />
            <Badge label="Vus" value={data.stats.completed} />
            <Badge label="Absences" value={data.stats.no_show} warn={data.stats.no_show > 0} />
            <MessageLink patientId={data.patient.id} />
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card title="Profil de santé" icon={Activity}>
              {hasHealth ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {HEALTH_LABELS.filter(([k]) => hp[k]).map(([k, label]) => (
                    <div
                      key={k}
                      className={
                        k === "blood_group" || k === "emergency_contact" ? "" : "sm:col-span-2"
                      }
                    >
                      <dt className="text-xs font-semibold text-sunu-ink/50">{label}</dt>
                      <dd
                        className={`whitespace-pre-wrap text-sm ${k === "allergies" ? "font-semibold text-red-700" : "text-sunu-dark"}`}
                      >
                        {hp[k]}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-sunu-ink/50">
                  Le patient n'a pas renseigné son profil de santé.
                </p>
              )}
            </Card>

            <Card title={`Ordonnances délivrées (${data.prescriptions?.length ?? 0})`} icon={Pill}>
              {!data.prescriptions?.length ? (
                <p className="text-sm text-sunu-ink/50">Aucune ordonnance délivrée à ce patient.</p>
              ) : (
                <div className="divide-y divide-sunu-line">
                  {data.prescriptions.map((p) => (
                    <article key={p.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-xs text-sunu-ink/50">
                          {formatDate(p.created_at)} · {p.reference}
                          {p.author && ` · par ${p.author}`}
                          {p.for_relative && ` · pour ${p.for_relative}`}
                          {p.valid_until && ` · valable jusqu'au ${formatDate(p.valid_until)}`}
                        </p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-sunu-dark">
                          {p.content}
                        </p>
                      </div>
                      <Link
                        to="/ordonnance/$id"
                        params={{ id: p.id }}
                        className="shrink-0 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green hover:border-sunu-green"
                      >
                        Voir / imprimer
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`Comptes-rendus (${data.records.length})`} icon={FileText}>
              {data.records.length === 0 ? (
                <p className="text-sm text-sunu-ink/50">Aucun compte-rendu pour ce patient.</p>
              ) : (
                <div className="divide-y divide-sunu-line">
                  {data.records.map((r) => (
                    <article key={r.id} className="py-3">
                      <time className="text-xs text-sunu-ink/50">
                        {formatDate(r.created_at, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {r.author && ` · rédigé par ${r.author}`}
                      </time>
                      <p className="mt-1 text-sm text-sunu-dark">{r.summary}</p>
                      {r.diagnosis && (
                        <p className="mt-1 text-sm">
                          <b>Conclusion :</b> {r.diagnosis}
                        </p>
                      )}
                      {r.treatment && (
                        <p className="mt-1 text-sm">
                          <b>Traitement :</b> {r.treatment}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Card>

            {(data.measurements ?? []).length > 0 && (
              <Card title="Mesures à domicile (6 derniers mois)" icon={Activity}>
                <PatientMeasurements items={data.measurements ?? []} />
              </Card>
            )}
            {(data.lab_orders ?? []).length > 0 && (
              <Card title={`Analyses prescrites (${data.lab_orders?.length})`} icon={FlaskConical}>
                <ul className="divide-y divide-sunu-line text-sm">
                  {(data.lab_orders ?? []).map((o) => (
                    <li key={o.id} className="py-2">
                      <p className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-sunu-dark">{o.tests}</span>
                        <span className="text-xs text-sunu-ink/60">
                          {o.status_label}
                          {o.laboratory ? ` · ${o.laboratory.name}` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-sunu-ink/50">
                        {o.reference} · {formatDate(o.created_at)}
                        {o.for_relative ? ` · pour ${o.for_relative}` : ""}
                      </p>
                      {o.result_note && (
                        <p className="mt-1 text-xs text-sunu-ink/70">{o.result_note}</p>
                      )}
                      {o.results.map((d) => (
                        <a
                          key={d.id}
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs font-semibold text-sunu-green hover:underline"
                        >
                          {d.title}
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card title="Historique des rendez-vous" icon={CalendarDays}>
              <ul className="divide-y divide-sunu-line text-sm">
                {data.appointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {formatDateTime(a.scheduled_at, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      <span className="ml-2 text-xs text-sunu-ink/50">
                        {a.consultation_type ??
                          (a.mode === "teleconsultation"
                            ? "Téléconsultation"
                            : a.mode === "home_visit"
                              ? "À domicile"
                              : "Cabinet")}
                        {a.relative ? ` · pour ${a.relative}` : ""}
                        {a.seen_by ? ` · ${a.seen_by}` : ""}
                      </span>
                    </span>
                    <span className="rounded-full bg-sunu-surface px-2 py-0.5 text-xs font-semibold text-sunu-ink/70">
                      {STATUS[a.status] ?? a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Notes privées" icon={StickyNote}>
              <p className="mb-3 flex items-center gap-1 text-xs text-sunu-ink/50">
                <Lock className="size-3" /> Visibles par vous seul, jamais par le patient.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) addNote.mutate();
                }}
                className="grid gap-2"
              >
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Nouvelle note…"
                  className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
                />
                <button
                  disabled={addNote.isPending || !note.trim()}
                  className="rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Ajouter la note
                </button>
              </form>
              <div className="mt-4 space-y-2">
                {data.notes.map((n) => (
                  <div key={n.id} className="rounded-lg bg-amber-50 px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm text-sunu-dark">{n.content}</p>
                    <time className="text-[10px] text-sunu-ink/50">
                      {formatDateTime(n.created_at, { dateStyle: "short", timeStyle: "short" })}
                    </time>
                  </div>
                ))}
              </div>
            </Card>

            <RecallsCard patientId={id} recalls={data.recalls} />

            <Card title={`Documents partagés (${data.documents.length})`} icon={FileText}>
              {data.documents.length === 0 ? (
                <p className="text-sm text-sunu-ink/50">
                  Le patient ne vous a partagé aucun document.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id}>
                      <a
                        href={`/api/documents/${d.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-sunu-green hover:underline"
                      >
                        {d.title}
                      </a>
                      <span className="ml-1 text-xs text-sunu-ink/50">
                        · {formatDate(d.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function RecallsCard({
  patientId,
  recalls,
}: {
  patientId: string;
  recalls: { id: string; due_date: string; message: string; sent: boolean }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ due_date: "", message: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["patient-file", patientId] });
  const add = useMutation({
    mutationFn: () => addRecall({ data: { patient_id: patientId, ...form } }),
    onSuccess: () => {
      setForm({ due_date: "", message: "" });
      refresh();
      toast.success("Rappel programmé");
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: deleteRecall,
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card title="Rappels programmés" icon={BellRing}>
      <p className="mb-3 text-xs text-sunu-ink/50">
        Le patient reçoit un SMS et une notification à la date choisie (vaccin, contrôle, suivi).
      </p>
      <div className="space-y-2">
        {recalls.map((r) => (
          <div
            key={r.id}
            className="flex items-start justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <span>
              <b className="text-sunu-dark">
                {formatDate(r.due_date, { day: "numeric", month: "long", year: "numeric" })}
              </b>
              <span className="block text-xs text-sunu-ink/60">{r.message}</span>
              {r.sent && <span className="text-[10px] font-semibold text-sunu-teal">Envoyé</span>}
            </span>
            {!r.sent && (
              <button
                onClick={() => del.mutate(r.id)}
                className="text-sunu-ink/40 hover:text-red-600"
                aria-label="Supprimer le rappel"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-3 grid gap-2"
      >
        <input
          type="date"
          required
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          aria-label="Date du rappel"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <input
          required
          minLength={3}
          maxLength={300}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Ex. Rappel du vaccin contre la fièvre jaune"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <button
          disabled={add.isPending}
          className="rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Programmer le rappel
        </button>
      </form>
    </Card>
  );
}

function MessageLink({ patientId }: { patientId: string }) {
  const { data: doctor } = useSuspenseQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: () => getMyDoctorProfile(),
  });
  if (!doctor) return null;
  return (
    <Link
      to="/messages"
      search={{ doctor: doctor.id, patient: patientId }}
      className="flex items-center gap-1 self-center rounded-xl border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
    >
      <MessageSquare className="size-4" /> Écrire
    </Link>
  );
}

function Badge({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded-xl px-3 py-2 ${warn ? "bg-amber-50 text-amber-800" : "bg-sunu-card text-sunu-dark"} border border-sunu-line`}
    >
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sunu-ink/50">
        {label}
      </p>
    </div>
  );
}

function PatientMeasurements({ items }: { items: Measurement[] }) {
  const kinds = (["blood_pressure", "glucose", "weight"] as MeasurementKind[]).filter((k) =>
    items.some((m) => m.kind === k),
  );
  const [kind, setKind] = useState<MeasurementKind>(kinds[0] ?? "blood_pressure");
  const last = items.filter((m) => m.kind === kind).slice(0, 5);
  return (
    <div>
      {kinds.length > 1 && (
        <div className="mb-2 inline-flex rounded-lg border border-sunu-line p-0.5">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${kind === k ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
            >
              {k === "blood_pressure" ? "Tension" : k === "glucose" ? "Glycémie" : "Poids"}
            </button>
          ))}
        </div>
      )}
      <MeasurementsChart items={items} kind={kind} />
      <ul className="mt-2 text-xs text-sunu-ink/70">
        {last.map((m) => (
          <li key={m.id}>
            {formatDateTime(m.measured_at, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — <b>{formatMeasurement(m)}</b>
            {m.relative ? ` (${m.relative.full_name})` : ""}
            {m.level !== "normal" && (
              <span className="ml-1 font-semibold text-red-700">
                · {m.level === "low" ? "basse" : m.level === "high" ? "élevée" : "très élevée"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Heart;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-sunu-dark">
        <Icon className="size-5 text-sunu-green" /> {title}
      </h2>
      {children}
    </section>
  );
}
