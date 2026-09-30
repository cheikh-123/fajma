import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { redirectBeforeHydration } from "@/lib/first-load";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Heart,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdminOverview,
  getAdminTodo,
  setVerification,
  listSmsReminders,
  retrySmsReminder,
} from "@/api/admin";
import { getAdminAudit } from "@/api/auth";
import { formatDateTime } from "@/lib/datetime";
import { FinanceAdmin } from "@/components/admin/FinanceAdmin";
import { PharmacyMembersAdmin } from "@/components/admin/PharmacyMembersAdmin";
import { ReviewModeration } from "@/components/admin/ReviewModeration";
import { CredentialsAdmin } from "@/components/admin/CredentialsAdmin";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { LabsAdmin } from "@/components/admin/LabsAdmin";
import { PharmaciesAdmin } from "@/components/admin/PharmaciesAdmin";
import { SecuritySection } from "@/components/SecuritySection";

const adminQO = queryOptions({ queryKey: ["admin-overview"], queryFn: () => getAdminOverview() });
const smsQO = queryOptions({ queryKey: ["admin-sms"], queryFn: () => listSmsReminders() });

export const Route = createFileRoute("/_authenticated/admin")({
  // Réservé à l'équipe Fajma (l'API le vérifie aussi) : les autres comptes retournent à leur espace.
  beforeLoad: ({ context }) => {
    if (context.user.is_admin) return;
    if (redirectBeforeHydration("/mon-espace")) return new Promise<never>(() => {});
    throw redirect({ to: "/mon-espace" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminQO),
  head: () => ({
    meta: [
      { title: "Administration — Fajma" },
      { name: "description", content: "Supervision sécurisée de la plateforme Fajma." },
      { property: "og:title", content: "Administration — Fajma" },
      { property: "og:description", content: "Supervision de la plateforme." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(adminQO);
  const { data: sms } = useQuery(smsQO);
  const verify = useMutation({
    mutationFn: (v: { kind: "doctor" | "clinic"; id: string; verified: boolean }) =>
      setVerification({ data: v }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-todo"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retrySmsReminder({ data: { id } }),
    onSuccess: () => {
      toast.success("SMS replanifié");
      qc.invalidateQueries({ queryKey: ["admin-sms"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const revenue = data.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const smsFailed = (sms ?? []).filter((s) => s.status === "failed").length;
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <ShieldCheck className="size-4" />
            </span>
            <span className="font-bold text-sunu-dark">Fajma · Administration</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <div className="flex items-center gap-4">
            <Link to="/" className="hidden text-sm font-semibold text-sunu-green sm:inline">
              Voir le site
            </Link>
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">Pilotage</p>
          <h1 className="mt-1 text-3xl font-bold text-sunu-dark">Vue d'ensemble</h1>
        </div>
        <AdminTodoBar />
        <nav
          aria-label="Sections de l'administration"
          className="sticky top-0 z-30 -mx-6 mt-4 flex gap-1 overflow-x-auto border-y border-sunu-line bg-sunu-surface/95 px-6 py-2 backdrop-blur"
        >
          {ADMIN_SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-sunu-ink/70 hover:bg-sunu-card hover:text-sunu-green"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat icon={Stethoscope} label="Médecins" value={data.doctors.length.toString()} />
          <Stat icon={Building2} label="Cliniques" value={data.clinics.length.toString()} />
          <Stat icon={Calendar} label="Rendez-vous" value={data.appointments.length.toString()} />
          <Stat
            icon={Wallet}
            label="Paiements confirmés"
            value={`${revenue.toLocaleString("fr-FR")} F`}
          />
          <Stat icon={MessageSquare} label="SMS en échec" value={smsFailed.toString()} />
        </div>
        <div id="pilotage" className="mt-6 scroll-mt-20">
          <AnalyticsDashboard />
        </div>
        <div id="validation" className="mt-8 grid scroll-mt-20 gap-6 lg:grid-cols-2">
          <Panel title="Validation des médecins">
            {data.doctors.map((d) => (
              <Row
                key={d.id}
                title={d.full_name}
                sub={d.city}
                verified={d.is_verified}
                onToggle={() =>
                  verify.mutate({ kind: "doctor", id: d.id, verified: !d.is_verified })
                }
              />
            ))}
          </Panel>
          <Panel title="Validation des établissements">
            {data.clinics.length ? (
              data.clinics.map((c) => (
                <Row
                  key={c.id}
                  title={c.name}
                  sub={c.city}
                  verified={c.is_verified}
                  onToggle={() =>
                    verify.mutate({ kind: "clinic", id: c.id, verified: !c.is_verified })
                  }
                />
              ))
            ) : (
              <p className="py-8 text-center text-sm text-sunu-ink/50">
                Aucun établissement inscrit.
              </p>
            )}
          </Panel>
        </div>
        <div id="comptes" className="mt-6 scroll-mt-20">
          <UsersAdmin />
        </div>
        <div id="justificatifs" className="mt-6 scroll-mt-20">
          <CredentialsAdmin />
        </div>
        <div id="finances" className="mt-6 scroll-mt-20">
          <FinanceAdmin />
        </div>
        <div id="pharmacies" className="mt-6 scroll-mt-20">
          <PharmaciesAdmin />
        </div>
        <div id="laboratoires" className="mt-6 scroll-mt-20">
          <LabsAdmin />
        </div>
        <div id="pharmaciens" className="mt-6 scroll-mt-20">
          <PharmacyMembersAdmin />
        </div>
        <div id="avis" className="mt-6 scroll-mt-20">
          <ReviewModeration />
        </div>
        <div id="sms" className="mt-6 scroll-mt-20">
          <Panel title="Rappels SMS (100 derniers)">
            {(sms ?? []).length ? (
              (sms ?? []).map((s) => (
                <SmsRow
                  key={s.id}
                  sms={s}
                  onRetry={() => retry.mutate(s.id)}
                  retrying={retry.isPending}
                />
              ))
            ) : (
              <p className="py-8 text-center text-sm text-sunu-ink/50">
                Aucun rappel SMS enregistré pour le moment.
              </p>
            )}
          </Panel>
        </div>
        <div id="journal" className="mt-6 scroll-mt-20">
          <AuditPanel />
        </div>
        <div id="securite" className="mt-10 scroll-mt-20">
          <SecuritySection />
        </div>
      </main>
    </div>
  );
}

const ADMIN_SECTIONS = [
  ["pilotage", "Pilotage"],
  ["validation", "Validations"],
  ["comptes", "Comptes"],
  ["justificatifs", "Justificatifs"],
  ["finances", "Finances"],
  ["pharmacies", "Pharmacies"],
  ["laboratoires", "Laboratoires"],
  ["avis", "Avis"],
  ["sms", "SMS"],
  ["journal", "Journal d'audit"],
  ["securite", "Ma sécurité"],
] as const;

/** Bandeau « À traiter » : la file de travail du jour, chaque compteur mène à sa section. */
function AdminTodoBar() {
  const { data } = useQuery({
    queryKey: ["admin-todo"],
    queryFn: getAdminTodo,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  const items = [
    ["validation", "médecin(s) à valider", data.doctors_to_verify],
    ["justificatifs", "justificatif(s) à vérifier", data.credentials_pending],
    ["validation", "établissement(s) à valider", data.clinics_to_verify],
    ["avis", "avis signalé(s)", data.reviews_reported],
    ["finances", "virement(s) demandé(s)", data.payouts_requested],
    ["finances", "remboursement(s) à faire", data.refunds_pending],
    ["sms", "SMS en échec (7 j)", data.sms_failed],
  ] as const;
  const open = items.filter(([, , n]) => n > 0);
  return (
    <section
      aria-label="À traiter"
      className={`mt-5 rounded-xl border p-4 ${open.length ? "border-sunu-gold bg-sunu-card" : "border-sunu-line bg-sunu-card"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">À traiter</p>
      {open.length === 0 ? (
        <p className="mt-1 text-sm text-sunu-teal">Rien en attente. ✓</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {open.map(([id, label, n]) => (
            <a
              key={label}
              href={`#${id}`}
              className="rounded-lg bg-sunu-surface px-3 py-1.5 text-sm hover:text-sunu-green"
            >
              <b className="text-sunu-dark">{n}</b> {label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

const SMS_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  sent: { label: "Envoyé", cls: "bg-sunu-green-soft text-sunu-green" },
  delivered: { label: "Livré", cls: "bg-sunu-teal/15 text-sunu-teal" },
  failed: { label: "Échec", cls: "bg-red-100 text-red-700" },
};

function SmsRow({
  sms,
  onRetry,
  retrying,
}: {
  sms: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    recipient_phone: string;
    last_error: string | null;
    scheduled_for: string;
    sent_at: string | null;
  };
  onRetry: () => void;
  retrying: boolean;
}) {
  const st = SMS_STATUS[sms.status] ?? {
    label: sms.status,
    cls: "bg-sunu-green-soft text-sunu-green",
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-sunu-dark">
          {sms.recipient_phone} · {sms.kind === "reminder_24h" ? "Rappel 24h" : "Rappel 2h"}
        </p>
        <p className="text-xs text-sunu-ink/50">
          Planifié le{" "}
          {formatDateTime(sms.scheduled_for, { dateStyle: "short", timeStyle: "short" })}
          {sms.sent_at
            ? ` · envoyé le ${formatDateTime(sms.sent_at, { dateStyle: "short", timeStyle: "short" })}`
            : ""}{" "}
          · {sms.attempts} tentative(s)
        </p>
        {sms.last_error && (
          <p className="mt-1 max-w-xl truncate text-xs text-red-600">{sms.last_error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>
          {st.label}
        </span>
        {sms.status === "failed" && (
          <button
            disabled={retrying}
            onClick={onRetry}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-2.5 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" /> Réessayer
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <Icon className="size-5 text-sunu-green" />
      <p className="mt-4 text-2xl font-bold text-sunu-dark">{value}</p>
      <p className="text-xs text-sunu-ink/55">{label}</p>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="font-bold text-sunu-dark">{title}</h2>
      <div className="mt-3 divide-y divide-sunu-line">{children}</div>
    </section>
  );
}
function Row({
  title,
  sub,
  verified,
  onToggle,
}: {
  title: string;
  sub: string;
  verified: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-semibold text-sunu-dark">{title}</p>
        <p className="text-xs text-sunu-ink/50">{sub}</p>
      </div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${verified ? "bg-sunu-teal/15 text-sunu-teal" : "bg-amber-100 text-amber-800"}`}
      >
        {verified ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
        {verified ? "Vérifié" : "À valider"}
      </button>
    </div>
  );
}
function AuditPanel() {
  const { data } = useQuery({ queryKey: ["admin-audit"], queryFn: getAdminAudit });
  return (
    <Panel title="Journal d'audit (200 derniers évènements)">
      {(data ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-sunu-ink/50">Aucun évènement.</p>
      ) : (
        (data ?? []).map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              <b className="text-sunu-dark">{e.action}</b> · {e.who}
              {e.patient && <span className="text-sunu-ink/60"> → dossier de {e.patient}</span>}
            </span>
            <span className="text-xs text-sunu-ink/50">
              {e.ip ?? ""} · {formatDateTime(e.at, { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))
      )}
    </Panel>
  );
}
