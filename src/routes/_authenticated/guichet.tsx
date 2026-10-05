/**
 * Poste de l'accueil d'un hôpital ou centre de santé : appeler le suivant, rappeler, reçu / absent, priorités
 * (femme enceinte, personne âgée…), ticket remis au guichet (imprimable), pause des tickets en ligne.
 * Le responsable voit le bilan du jour et règle les services (horaires, capacité, lettre, durée moyenne).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BellRing,
  Check,
  Loader2,
  Megaphone,
  MonitorPlay,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Settings2,
  Smartphone,
  Ticket,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import {
  PRIORITIES,
  callNext,
  etaLabel,
  getDesk,
  pauseService,
  saveService,
  ticketAction,
  walkIn,
  type DeskFacility,
  type DeskService,
  type DeskTicket,
  type ServiceSettings,
  type TicketPriority,
} from "@/api/queues";
import { FajmaMark } from "@/components/FajmaMark";
import { HelpLink } from "@/components/HelpLink";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SecuritySection } from "@/components/SecuritySection";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/guichet")({
  head: () => ({ meta: [{ title: "Accueil — file d'attente — Fajma" }] }),
  component: DeskPage,
});

const CHANNEL: Record<DeskTicket["channel"], string> = {
  web: "Site",
  whatsapp: "WhatsApp",
  ussd: "USSD",
  desk: "Guichet",
};

function readDesk() {
  try {
    return localStorage.getItem("fajma-desk") ?? "Box 1";
  } catch {
    return "Box 1";
  }
}

function DeskPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["queue-desk"],
    queryFn: getDesk,
    refetchInterval: 10_000,
  });
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [desk, setDesk] = useState(readDesk);
  useEffect(() => {
    try {
      localStorage.setItem("fajma-desk", desk);
    } catch {
      /* stockage indisponible */
    }
  }, [desk]);

  if (isLoading) return <Loader2 className="m-10 size-6 animate-spin text-sunu-ink/40" />;
  if (error || !data)
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <Ticket className="mx-auto size-10 text-sunu-ink/30" />
        <h1 className="mt-4 text-xl font-bold text-sunu-dark">Espace réservé à l'accueil</h1>
        <p className="mt-2 text-sm text-sunu-ink/60">
          Votre compte n'est rattaché à aucun établissement. Demandez à l'équipe Fajma de vous
          ajouter.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-sunu-green">
          Retour à l'accueil
        </Link>
      </div>
    );
  const facility = data.find((f) => f.id === facilityId) ?? data[0];
  const service = facility.services.find((s) => s.id === serviceId) ?? facility.services[0];

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="font-bold text-sunu-dark">Accueil · {facility.name}</span>
          </Link>
          <ThemeToggle className="ml-auto" />
          <NotificationBell />
          <HelpLink />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {data.length > 1 && (
            <select
              aria-label="Établissement"
              value={facility.id}
              onChange={(e) => {
                setFacilityId(e.target.value);
                setServiceId(null);
              }}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
            >
              {data.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex flex-wrap rounded-xl border border-sunu-line bg-sunu-card p-1">
            {facility.services.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${s.id === service?.id ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
              >
                {s.name} ({s.waiting})
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-sunu-ink/70">
            Mon guichet
            <input
              value={desk}
              onChange={(e) => setDesk(e.target.value.slice(0, 30))}
              aria-label="Nom de mon guichet"
              className="w-28 rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
            />
          </label>
          <a
            href={`/affichage/${facility.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-semibold text-sunu-ink/70"
          >
            <MonitorPlay className="size-4" /> Écran de la salle
          </a>
        </div>
        {!service ? (
          <p className="mt-10 text-center text-sm text-sunu-ink/55">
            Aucun service configuré.{" "}
            {facility.role === "manager" ? "Créez-en un ci-dessous." : "Demandez au responsable."}
          </p>
        ) : (
          <ServiceDesk key={service.id} service={service} desk={desk} />
        )}
        {facility.role === "manager" && <ManagerPanel facility={facility} service={service} />}
        <div className="mt-10">
          <SecuritySection />
        </div>
      </main>
    </div>
  );
}

function ServiceDesk({ service, desk }: { service: DeskService; desk: string }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["queue-desk"] });
  const call = useMutation({
    mutationFn: () => callNext(service.id, desk),
    onSuccess: (t) => {
      toast.success(`Ticket ${t.label} appelé${t.name ? ` : ${t.name}` : ""}`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const act = useMutation({
    mutationFn: (v: {
      id: string;
      action: Parameters<typeof ticketAction>[1];
      priority?: TicketPriority;
    }) => ticketAction(v.id, v.action, v.priority),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      pauseService(
        service.id,
        paused,
        paused ? (window.prompt("Message affiché aux patients (facultatif) :") ?? "") : "",
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const next = service.queue[0];

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sunu-line bg-sunu-card p-5">
          <button
            onClick={() => call.mutate()}
            disabled={!next || call.isPending}
            className="flex items-center gap-3 rounded-2xl bg-sunu-green px-8 py-5 text-xl font-bold text-white shadow-sm disabled:opacity-40"
          >
            {call.isPending ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Megaphone className="size-6" />
            )}
            Appeler le suivant
          </button>
          <div className="text-sm text-sunu-ink/65">
            {next ? (
              <>
                Prochain : <b className="text-lg text-sunu-dark">{next.label}</b>
                {next.name ? ` · ${next.name}` : ""}
                {next.priority_label ? ` · prioritaire (${next.priority_label})` : ""}
              </>
            ) : (
              "Personne n'attend."
            )}
            <p className="text-xs">
              {service.waiting} en attente · un patient toutes les {service.pace_minutes} min
            </p>
          </div>
          <button
            onClick={() => pause.mutate(!service.is_paused)}
            className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${service.is_paused ? "bg-amber-100 text-amber-800" : "border border-sunu-line text-sunu-ink/70"}`}
          >
            {service.is_paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {service.is_paused
              ? "Reprendre les tickets en ligne"
              : "Suspendre les tickets en ligne"}
          </button>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 font-bold text-sunu-dark">
            <BellRing className="size-5 text-sunu-green" /> Appelés ({service.called.length})
          </h2>
          {service.called.length === 0 ? (
            <p className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-6 text-center text-sm text-sunu-ink/50">
              Aucun patient appelé en attente de réception.
            </p>
          ) : (
            <div className="grid gap-2">
              {service.called.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card p-3"
                >
                  <span className="text-2xl font-black tabular-nums text-sunu-green">
                    {t.label}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <b className="text-sunu-dark">{t.name ?? "Sans nom"}</b>
                    <span className="block text-xs text-sunu-ink/55">
                      {t.desk ?? "Accueil"}
                      {t.recalls ? ` · rappelé ${t.recalls} fois` : ""}
                    </span>
                  </span>
                  <button
                    onClick={() => act.mutate({ id: t.id, action: "done" })}
                    className="flex items-center gap-1 rounded-lg bg-sunu-teal/15 px-3 py-1.5 text-xs font-semibold text-sunu-teal"
                  >
                    <Check className="size-3.5" /> Reçu
                  </button>
                  <button
                    onClick={() => act.mutate({ id: t.id, action: "recall" })}
                    className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
                  >
                    <BellRing className="size-3.5" /> Rappeler
                  </button>
                  <button
                    onClick={() => act.mutate({ id: t.id, action: "no_show" })}
                    className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                  >
                    <UserX className="size-3.5" /> Absent
                  </button>
                  <button
                    onClick={() => act.mutate({ id: t.id, action: "requeue" })}
                    aria-label={`Remettre ${t.label} en attente`}
                    title="Remettre en attente"
                    className="text-sunu-ink/40 hover:text-sunu-green"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 font-bold text-sunu-dark">En attente ({service.queue.length})</h2>
          <div className="overflow-hidden rounded-xl border border-sunu-line bg-sunu-card">
            {service.queue.length === 0 ? (
              <p className="p-6 text-center text-sm text-sunu-ink/50">File vide.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-sunu-surface text-left text-xs text-sunu-ink/55">
                  <tr>
                    <th className="px-3 py-2">N°</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Attente</th>
                    <th className="px-3 py-2">Priorité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sunu-line">
                  {service.queue.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-bold tabular-nums text-sunu-dark">{t.label}</td>
                      <td className="px-3 py-2">
                        {t.name ?? "—"}
                        {t.phone_hint && (
                          <span className="block text-xs text-sunu-ink/45">{t.phone_hint}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-sunu-ink/60">
                        <span className="flex items-center gap-1">
                          {t.channel !== "desk" && <Smartphone className="size-3.5" />}
                          {CHANNEL[t.channel]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-sunu-ink/60">
                        {etaLabel(t.eta_minutes)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Priorité du ticket ${t.label}`}
                          value={t.priority ?? ""}
                          onChange={(e) =>
                            act.mutate({
                              id: t.id,
                              action: "priority",
                              priority: e.target.value as TicketPriority,
                            })
                          }
                          className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1 text-xs"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
      <aside className="space-y-4 self-start">
        <WalkInForm service={service} />
      </aside>
    </div>
  );
}

function printTicket(t: DeskTicket) {
  const w = window.open("", "_blank", "width=320,height=420");
  if (!w) return;
  const when = new Date(t.created_at).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const doc = w.document;
  doc.title = `Ticket ${t.label}`;
  const box = doc.createElement("div");
  box.style.cssText = "font-family:Arial,sans-serif;text-align:center;padding:16px";
  const line = (text: string, css: string) => {
    const p = doc.createElement("p");
    p.textContent = text;
    p.style.cssText = `margin:4px 0;${css}`;
    box.appendChild(p);
  };
  line(t.facility.name, "font-weight:bold;font-size:14px");
  line(t.service.name, "font-size:12px;color:#555");
  line(t.label, "font-size:64px;font-weight:900;margin:12px 0");
  line(`${t.ahead} personne(s) devant vous`, "font-size:12px");
  line(`Suivi : fajma.sn/ticket/${t.code}`, "font-size:11px;color:#555");
  line(when, "font-size:11px;color:#555");
  doc.body.appendChild(box);
  w.focus();
  w.print();
}

function WalkInForm({ service }: { service: DeskService }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    priority: "" as TicketPriority,
    lang: "fr",
  });
  const [last, setLast] = useState<DeskTicket | null>(null);
  const add = useMutation({
    mutationFn: () => walkIn(service.id, { ...form, phone: form.phone || undefined }),
    onSuccess: (t) => {
      setLast(t);
      setForm({ name: "", phone: "", priority: "", lang: "fr" });
      qc.invalidateQueries({ queryKey: ["queue-desk"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
      className="grid gap-2 rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <UserPlus className="size-5 text-sunu-green" /> Ticket au guichet
      </h2>
      <p className="text-xs text-sunu-ink/55">
        Pour une personne venue sur place. Avec un numéro de téléphone, elle reçoit aussi les SMS.
      </p>
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Nom (facultatif)"
        aria-label="Nom"
        className={field}
      />
      <input
        type="tel"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        placeholder="Téléphone (facultatif)"
        aria-label="Téléphone"
        className={field}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
          aria-label="Priorité"
          className={field}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={form.lang}
          onChange={(e) => setForm({ ...form, lang: e.target.value })}
          aria-label="Langue des SMS"
          className={field}
        >
          <option value="fr">SMS en français</option>
          <option value="wo">SMS en wolof</option>
          <option value="en">SMS en anglais</option>
        </select>
      </div>
      <button
        disabled={add.isPending}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Ticket className="size-4" /> Remettre un ticket
      </button>
      {last && (
        <div className="mt-2 rounded-xl bg-sunu-green-soft p-4 text-center">
          <p className="text-xs text-sunu-ink/60">Ticket remis</p>
          <p className="text-4xl font-black text-sunu-green">{last.label}</p>
          <p className="text-xs text-sunu-ink/60">{last.ahead} personne(s) devant</p>
          <button
            type="button"
            onClick={() => printTicket(last)}
            className="mx-auto mt-2 flex items-center gap-1.5 text-xs font-semibold text-sunu-green"
          >
            <Printer className="size-4" /> Imprimer
          </button>
        </div>
      )}
    </form>
  );
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function ManagerPanel({ facility, service }: { facility: DeskFacility; service?: DeskService }) {
  const [editing, setEditing] = useState<ServiceSettings | null>(null);
  const stats = service?.stats;
  const max = Math.max(1, ...(stats?.by_hour.map((h) => h.count) ?? [1]));
  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-2">
      {stats && service && (
        <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
          <h2 className="font-bold text-sunu-dark">Bilan du jour · {service.name}</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
            {(
              [
                ["Tickets", stats.taken],
                ["Reçus", stats.done],
                ["Absents", stats.no_show],
                [
                  "Pris à distance",
                  `${stats.taken ? Math.round((stats.remote / stats.taken) * 100) : 0} %`,
                ],
                [
                  "Attente moyenne",
                  stats.avg_wait_minutes == null ? "—" : etaLabel(stats.avg_wait_minutes),
                ],
                ["Rythme", `${stats.pace_minutes} min / patient`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-sunu-surface p-3">
                <dd className="text-lg font-bold text-sunu-dark">{value}</dd>
                <dt className="text-xs text-sunu-ink/55">{label}</dt>
              </div>
            ))}
          </dl>
          {stats.by_hour.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-sunu-ink/60">Arrivées par heure</p>
              <div className="mt-2 flex h-24 items-end gap-1">
                {stats.by_hour.map((h) => (
                  <div key={h.hour} className="flex max-w-10 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-sunu-green"
                      style={{ height: `${(h.count / max) * 80}px` }}
                      title={`${h.count} ticket(s)`}
                    />
                    <span className="text-[10px] text-sunu-ink/50">{h.hour}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <Settings2 className="size-5 text-sunu-green" /> Services de {facility.name}
        </h2>
        <ul className="mt-3 divide-y divide-sunu-line text-sm">
          {facility.services.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <b className="text-sunu-dark">
                  {s.prefix} · {s.name}
                </b>
                <span className="block text-xs text-sunu-ink/55">
                  {s.opens_at}–{s.closes_at} · {s.open_days.map((d) => DAYS[d - 1]).join(", ")}
                  {s.daily_capacity ? ` · ${s.daily_capacity} tickets / jour` : ""}
                </span>
              </span>
              <button
                onClick={() =>
                  setEditing({
                    id: s.id,
                    name: s.name,
                    prefix: s.prefix,
                    opens_at: s.opens_at,
                    closes_at: s.closes_at,
                    open_days: s.open_days,
                    daily_capacity: s.daily_capacity,
                    avg_minutes: s.avg_minutes,
                    notice_ahead: s.notice_ahead,
                  })
                }
                className="text-xs font-semibold text-sunu-green"
              >
                Modifier
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() =>
            setEditing({
              name: "",
              prefix: "A",
              opens_at: "07:00",
              closes_at: "15:00",
              open_days: [1, 2, 3, 4, 5],
              daily_capacity: null,
              avg_minutes: 10,
              notice_ahead: 3,
            })
          }
          className="mt-3 text-sm font-semibold text-sunu-green"
        >
          + Ajouter un service
        </button>
        {editing && (
          <ServiceForm facilityId={facility.id} initial={editing} onDone={() => setEditing(null)} />
        )}
      </div>
    </section>
  );
}

function ServiceForm({
  facilityId,
  initial,
  onDone,
}: {
  facilityId: string;
  initial: ServiceSettings;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const save = useMutation({
    mutationFn: () => saveService(facilityId, form),
    onSuccess: () => {
      toast.success("Service enregistré");
      qc.invalidateQueries({ queryKey: ["queue-desk"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const label = "grid gap-1 text-xs font-semibold text-sunu-ink/60";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mt-4 grid gap-3 rounded-xl bg-sunu-surface p-4 sm:grid-cols-2"
    >
      <label className={label}>
        Nom du service
        <input
          required
          minLength={2}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Pédiatrie"
          className={field}
        />
      </label>
      <label className={label}>
        Lettre des tickets
        <input
          required
          maxLength={2}
          value={form.prefix}
          onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
          className={field}
        />
      </label>
      <label className={label}>
        Ouverture des tickets
        <input
          type="time"
          required
          value={form.opens_at}
          onChange={(e) => setForm({ ...form, opens_at: e.target.value })}
          className={field}
        />
      </label>
      <label className={label}>
        Fermeture
        <input
          type="time"
          required
          value={form.closes_at}
          onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
          className={field}
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-semibold text-sunu-ink/60">Jours</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = form.open_days.includes(i + 1);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setForm({
                    ...form,
                    open_days: on
                      ? form.open_days.filter((x) => x !== i + 1)
                      : [...form.open_days, i + 1].sort(),
                  })
                }
                className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-sunu-green text-white" : "bg-sunu-card text-sunu-ink/60 ring-1 ring-sunu-line"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className={label}>
        Tickets par jour (vide : sans limite)
        <input
          type="number"
          min={1}
          value={form.daily_capacity ?? ""}
          onChange={(e) =>
            setForm({ ...form, daily_capacity: e.target.value ? Number(e.target.value) : null })
          }
          className={field}
        />
      </label>
      <label className={label}>
        Durée moyenne par patient (min)
        <input
          type="number"
          min={1}
          max={120}
          value={form.avg_minutes}
          onChange={(e) => setForm({ ...form, avg_minutes: Number(e.target.value) })}
          className={field}
        />
      </label>
      <label className={label}>
        SMS « c'est bientôt » quand il reste
        <input
          type="number"
          min={1}
          max={30}
          value={form.notice_ahead}
          onChange={(e) => setForm({ ...form, notice_ahead: Number(e.target.value) })}
          className={field}
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          disabled={save.isPending}
          className="rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-sunu-line px-4 py-2 text-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
