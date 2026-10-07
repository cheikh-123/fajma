import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/lib/theme";
import { redirectBeforeHydration } from "@/lib/first-load";
import { formatDateTime } from "@/lib/datetime";
import { LogoutButton } from "@/components/LogoutButton";
import { HelpLink } from "@/components/HelpLink";
import { NotificationBell } from "@/components/NotificationBell";
import { SecuritySection } from "@/components/SecuritySection";
import {
  getAdminOverview,
  getAdminTodo,
  setVerification,
  type VerificationKind,
  listSmsReminders,
  retrySmsReminder,
} from "@/api/admin";
import {
  getMyAdminAccess,
  listAdminDoctors,
  type AdminSection,
  type SearchResult,
} from "@/api/backoffice";
import { ActivityReport } from "@/components/admin/ActivityReport";
import { CommunityAdmin } from "@/components/admin/CommunityAdmin";
import { CredentialsAdmin } from "@/components/admin/CredentialsAdmin";
import { Doctor360 } from "@/components/admin/Doctor360";
import { EpidemioAdmin } from "@/components/admin/EpidemioAdmin";
import { FinanceAdmin } from "@/components/admin/FinanceAdmin";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { LabsAdmin } from "@/components/admin/LabsAdmin";
import { PartnersAdmin } from "@/components/admin/PartnersAdmin";
import { PharmaciesAdmin } from "@/components/admin/PharmaciesAdmin";
import { PharmacyMembersAdmin } from "@/components/admin/PharmacyMembersAdmin";
import { ReviewModeration } from "@/components/admin/ReviewModeration";
import { SupportAdmin } from "@/components/admin/SupportAdmin";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import {
  ActLettersAdmin,
  AnnouncementsAdmin,
  AuditLogAdmin,
  SettingsAdmin,
  StaffAdmin,
} from "@/components/admin/BackofficeAdmin";
// Tableau de pilotage (graphiques, bibliothèque lourde) chargé seulement quand on l'ouvre.
const AnalyticsDashboard = lazy(() =>
  import("@/components/admin/AnalyticsDashboard").then((m) => ({ default: m.AnalyticsDashboard })),
);

const adminQO = queryOptions({ queryKey: ["admin-overview"], queryFn: () => getAdminOverview() });
const smsQO = queryOptions({ queryKey: ["admin-sms"], queryFn: () => listSmsReminders() });
const accessQO = queryOptions({ queryKey: ["admin-access"], queryFn: () => getMyAdminAccess() });

export const Route = createFileRoute("/_authenticated/admin")({
  // Réservé à l'équipe Fajma (l'API le vérifie aussi) : les autres comptes retournent à leur espace.
  beforeLoad: ({ context }) => {
    if (context.user.is_admin) return;
    if (redirectBeforeHydration("/mon-espace")) return new Promise<never>(() => {});
    throw redirect({ to: "/mon-espace" });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminQO),
      context.queryClient.ensureQueryData(accessQO),
    ]),
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

type Rubric =
  | "tableau"
  | "valider"
  | "utilisateurs"
  | "reseau"
  | "finances"
  | "sante"
  | "communication"
  | "support"
  | "systeme"
  | "securite";
type NetworkTab = "medecins" | "etablissements" | "pharmacies" | "laboratoires" | "relais";

// Rubriques du menu ; « section » = droit nécessaire (rôle de l'équipe, contrôlé aussi par le serveur).
const RUBRICS: { id: Rubric; label: string; icon: typeof Heart; section: AdminSection | null }[] = [
  { id: "tableau", label: "Tableau de bord", icon: LayoutDashboard, section: "pilotage" },
  { id: "valider", label: "À valider", icon: ClipboardCheck, section: "validation" },
  { id: "utilisateurs", label: "Utilisateurs", icon: Users, section: "support" },
  { id: "reseau", label: "Réseau de soins", icon: Stethoscope, section: "validation" },
  { id: "finances", label: "Finances", icon: Wallet, section: "finance" },
  { id: "sante", label: "Santé publique", icon: Activity, section: "sante" },
  { id: "communication", label: "Communication", icon: Megaphone, section: "communication" },
  { id: "support", label: "Support", icon: LifeBuoy, section: "support" },
  { id: "systeme", label: "Système", icon: Settings, section: "systeme" },
  { id: "securite", label: "Ma sécurité", icon: ShieldCheck, section: null },
];
// Anciennes ancres (liens des notifications, du guide) → nouvelle rubrique et onglet.
const LEGACY: Record<string, [Rubric, NetworkTab?]> = {
  pilotage: ["tableau"],
  rapport: ["tableau"],
  validation: ["valider"],
  justificatifs: ["valider"],
  comptes: ["utilisateurs"],
  pharmacies: ["reseau", "pharmacies"],
  pharmaciens: ["reseau", "pharmacies"],
  laboratoires: ["reseau", "laboratoires"],
  relais: ["reseau", "relais"],
  veille: ["sante"],
  partenaires: ["communication"],
  avis: ["support"],
  sms: ["support"],
  journal: ["systeme"],
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: "super-administrateur",
  validation: "validations",
  support: "support",
  finance: "finances",
  sante: "santé publique",
  communication: "communication",
};

type Overview = Awaited<ReturnType<typeof getAdminOverview>>;
type Todo = Awaited<ReturnType<typeof getAdminTodo>>;

function AdminPage() {
  const { data } = useSuspenseQuery(adminQO);
  const { data: access } = useSuspenseQuery(accessQO);
  const { data: todo } = useQuery({
    queryKey: ["admin-todo"],
    queryFn: getAdminTodo,
    refetchInterval: 60_000,
  });
  const [rubric, setRubricState] = useState<Rubric>("tableau");
  const [tab, setTab] = useState<NetworkTab>("medecins");
  const [doctor360, setDoctor360] = useState<string | null>(null);
  const allowed = RUBRICS.filter((r) => r.section === null || access.sections.includes(r.section));
  const setRubric = (r: Rubric) => {
    setRubricState(r);
    window.history.replaceState(null, "", `#${r}`);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      const [r, t] = LEGACY[h] ?? [h as Rubric];
      if (RUBRICS.some((x) => x.id === r)) setRubricState(r);
      if (t) setTab(t);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const current = allowed.some((r) => r.id === rubric) ? rubric : allowed[0].id;

  // Compteurs du menu : ce qui attend une action dans chaque rubrique.
  const unverified =
    data.doctors.filter((d) => !d.is_verified).length +
    data.clinics.filter((c) => !c.is_verified).length +
    data.pharmacies.filter((p) => !p.is_verified).length +
    data.laboratories.filter((l) => !l.is_verified).length;
  const counts: Partial<Record<Rubric, number>> = {
    valider: unverified + (todo?.credentials_pending ?? 0) + (todo?.credentials_expiring ?? 0),
    finances: (todo?.payouts_requested ?? 0) + (todo?.refunds_pending ?? 0),
    sante: todo?.mdo_to_declare ?? 0,
    support: (todo?.support_open ?? 0) + (todo?.reviews_reported ?? 0) + (todo?.sms_failed ?? 0),
  };

  // Résultat de la recherche globale : la fiche 360° pour un médecin, sinon la bonne rubrique.
  const pick = (r: SearchResult) => {
    if (r.type === "doctor") return setDoctor360(r.id);
    const go: Partial<Record<SearchResult["type"], [Rubric, NetworkTab?]>> = {
      user: ["utilisateurs"],
      clinic: ["reseau", "etablissements"],
      pharmacy: ["reseau", "pharmacies"],
      lab: ["reseau", "laboratoires"],
      payment: ["finances"],
    };
    const target = go[r.type];
    if (target && allowed.some((x) => x.id === target[0])) {
      setRubric(target[0]);
      if (target[1]) setTab(target[1]);
    }
    toast.info(`${r.label} — ${r.sub}`);
  };

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="sticky top-0 z-40 border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <BackButton to="/" />
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <ShieldCheck className="size-4" />
            </span>
            <span className="font-bold text-sunu-dark">Fajma · Administration</span>
          </Link>
          <div className="order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1">
            <GlobalSearch onPick={pick} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <HelpLink role="admin" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav
          aria-label="Rubriques de l'administration"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
        >
          {allowed.map((r) => {
            const n = counts[r.id] ?? 0;
            const active = current === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRubric(r.id)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold ${active ? "bg-sunu-green text-white" : "text-sunu-ink/70 hover:bg-sunu-card hover:text-sunu-green"}`}
              >
                <r.icon className="size-4 shrink-0" />
                <span className="flex-1">{r.label}</span>
                {n > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-sunu-gold/30 text-sunu-dark"}`}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
          <p className="hidden px-3 pt-4 text-xs text-sunu-ink/45 lg:block">
            Votre rôle : {ROLE_LABEL[access.role] ?? access.role}
          </p>
        </nav>
        <main className="min-w-0 flex-1 space-y-6">
          {current === "tableau" && (
            <TableauDeBord data={data} todo={todo} onGo={setRubric} allowed={allowed} />
          )}
          {current === "valider" && <AValider data={data} onOpenDoctor={setDoctor360} />}
          {current === "utilisateurs" && <UsersAdmin />}
          {current === "reseau" && (
            <Reseau data={data} tab={tab} setTab={setTab} onOpenDoctor={setDoctor360} />
          )}
          {current === "finances" && <FinanceAdmin />}
          {current === "sante" && <EpidemioAdmin />}
          {current === "communication" && (
            <>
              <AnnouncementsAdmin />
              <PartnersAdmin />
            </>
          )}
          {current === "support" && (
            <>
              <SupportAdmin />
              <ReviewModeration />
              <SmsPanel />
            </>
          )}
          {current === "systeme" && (
            <>
              <SettingsAdmin />
              <ActLettersAdmin />
              <StaffAdmin />
              <AuditLogAdmin />
            </>
          )}
          {current === "securite" && <SecuritySection />}
        </main>
      </div>
      {doctor360 && <Doctor360 id={doctor360} onClose={() => setDoctor360(null)} />}
    </div>
  );
}

function TableauDeBord({
  data,
  todo,
  onGo,
  allowed,
}: {
  data: Overview;
  todo: Todo | undefined;
  onGo: (r: Rubric) => void;
  allowed: { id: Rubric }[];
}) {
  const revenue = data.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const items: [Rubric, string, number][] = todo
    ? [
        ["support", "demande(s) d'aide", todo.support_open],
        ["valider", "médecin(s) à valider", todo.doctors_to_verify],
        ["sante", "cas à déclaration immédiate non déclaré(s)", todo.mdo_to_declare ?? 0],
        ["valider", "justificatif(s) à vérifier", todo.credentials_pending],
        ["valider", "justificatif(s) expiré(s) ou bientôt", todo.credentials_expiring ?? 0],
        ["valider", "établissement(s) à valider", todo.clinics_to_verify],
        ["support", "avis signalé(s)", todo.reviews_reported],
        ["finances", "virement(s) demandé(s)", todo.payouts_requested],
        ["finances", "remboursement(s) à faire", todo.refunds_pending],
        ["support", "SMS en échec (7 j)", todo.sms_failed],
      ]
    : [];
  const open = items.filter(([r, , n]) => n > 0 && allowed.some((a) => a.id === r));
  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">Pilotage</p>
        <h1 className="mt-1 text-2xl font-bold text-sunu-dark">Tableau de bord</h1>
      </div>
      <section
        aria-label="À traiter"
        className={`rounded-xl border bg-sunu-card p-4 ${open.length ? "border-sunu-gold" : "border-sunu-line"}`}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">À traiter</p>
        {open.length === 0 ? (
          <p className="mt-1 text-sm text-sunu-teal">Rien en attente. ✓</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {open.map(([r, label, n]) => (
              <button
                key={label}
                onClick={() => onGo(r)}
                className="rounded-lg bg-sunu-surface px-3 py-1.5 text-sm hover:text-sunu-green"
              >
                <b className="text-sunu-dark">{n}</b> {label}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Stethoscope} label="Médecins" value={data.doctors.length.toString()} />
        <Stat icon={Building2} label="Établissements" value={data.clinics.length.toString()} />
        <Stat icon={Calendar} label="Rendez-vous" value={data.appointments.length.toString()} />
        <Stat
          icon={Wallet}
          label="Paiements confirmés"
          value={`${revenue.toLocaleString("fr-FR")} F`}
        />
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-sunu-card" />}>
        <AnalyticsDashboard />
      </Suspense>
      <ActivityReport />
    </>
  );
}

/** File « À valider » : uniquement ce qui attend, avec les justificatifs à côté. */
function AValider({ data, onOpenDoctor }: { data: Overview; onOpenDoctor: (id: string) => void }) {
  const verify = useVerify();
  const queue: { kind: VerificationKind; id: string; title: string; sub: string }[] = [
    ...data.doctors
      .filter((d) => !d.is_verified)
      .map((d) => ({
        kind: "doctor" as const,
        id: d.id,
        title: d.full_name,
        sub: `Médecin · ${d.specialty} · ${d.city}`,
      })),
    ...data.clinics
      .filter((c) => !c.is_verified)
      .map((c) => ({
        kind: "clinic" as const,
        id: c.id,
        title: c.name,
        sub: `Établissement · ${c.city}`,
      })),
    ...data.pharmacies
      .filter((p) => !p.is_verified)
      .map((p) => ({
        kind: "pharmacy" as const,
        id: p.id,
        title: p.name,
        sub: `Pharmacie · ${p.city}`,
      })),
    ...data.laboratories
      .filter((l) => !l.is_verified)
      .map((l) => ({
        kind: "laboratory" as const,
        id: l.id,
        title: l.name,
        sub: `Laboratoire · ${l.city}`,
      })),
  ];
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-sunu-dark">À valider</h1>
        <p className="mt-1 text-sm text-sunu-ink/60">
          Vérifiez les justificatifs (à droite) puis validez. Pour un médecin, « Fiche » montre tout
          son dossier.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={`En attente de validation (${queue.length})`}>
          {queue.length === 0 ? (
            <p className="py-8 text-center text-sm text-sunu-teal">Tout est validé. ✓</p>
          ) : (
            queue.map((q) => (
              <div key={q.kind + q.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-sunu-dark">{q.title}</p>
                  <p className="text-xs text-sunu-ink/50">{q.sub}</p>
                </div>
                {q.kind === "doctor" && (
                  <button
                    onClick={() => onOpenDoctor(q.id)}
                    className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold"
                  >
                    Fiche
                  </button>
                )}
                <button
                  onClick={() => verify.mutate({ kind: q.kind, id: q.id, verified: true })}
                  disabled={verify.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white"
                >
                  <CheckCircle2 className="size-3.5" /> Valider
                </button>
              </div>
            ))
          )}
        </Panel>
        <CredentialsAdmin />
      </div>
    </>
  );
}

const NETWORK_TABS: [NetworkTab, string][] = [
  ["medecins", "Médecins"],
  ["etablissements", "Établissements"],
  ["pharmacies", "Pharmacies"],
  ["laboratoires", "Laboratoires"],
  ["relais", "Relais"],
];

/** Réseau de soins : un seul endroit par type d'acteur (fiche, validation, membres). */
function Reseau({
  data,
  tab,
  setTab,
  onOpenDoctor,
}: {
  data: Overview;
  tab: NetworkTab;
  setTab: (t: NetworkTab) => void;
  onOpenDoctor: (id: string) => void;
}) {
  const verify = useVerify();
  const toggles = (
    kind: VerificationKind,
    rows: { id: string; name: string; city: string; is_verified: boolean }[],
    empty: string,
  ) =>
    rows.length ? (
      rows.map((r) => (
        <Row
          key={r.id}
          title={r.name}
          sub={r.city}
          verified={r.is_verified}
          onToggle={() => verify.mutate({ kind, id: r.id, verified: !r.is_verified })}
        />
      ))
    ) : (
      <p className="py-8 text-center text-sm text-sunu-ink/50">{empty}</p>
    );
  return (
    <>
      <div className="flex flex-wrap gap-1 rounded-xl border border-sunu-line bg-sunu-card p-1">
        {NETWORK_TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === id ? "bg-sunu-green text-white" : "text-sunu-ink/70 hover:text-sunu-green"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "medecins" && <DoctorsNetwork onOpen={onOpenDoctor} />}
      {tab === "etablissements" && (
        <Panel title={`Établissements (${data.clinics.length})`}>
          {toggles("clinic", data.clinics, "Aucun établissement inscrit.")}
        </Panel>
      )}
      {tab === "pharmacies" && (
        <>
          <PharmaciesAdmin />
          <Panel title="Pharmacies avec un compte pharmacien : validation">
            {toggles("pharmacy", data.pharmacies, "Aucune pharmacie avec un compte pharmacien.")}
          </Panel>
          <PharmacyMembersAdmin />
        </>
      )}
      {tab === "laboratoires" && (
        <>
          <LabsAdmin />
          <Panel title="Laboratoires avec un compte : validation">
            {toggles("laboratory", data.laboratories, "Aucun laboratoire avec un compte rattaché.")}
          </Panel>
        </>
      )}
      {tab === "relais" && <CommunityAdmin />}
    </>
  );
}

function DoctorsNetwork({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [city, setCity] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-doctors", q.trim(), status, city.trim()],
    queryFn: () => listAdminDoctors({ q: q.trim(), status, city: city.trim() }),
    placeholderData: keepPreviousData,
  });
  const field = "rounded-lg border border-sunu-line bg-sunu-surface px-3 py-2 text-sm";
  return (
    <Panel title={`Médecins (${data?.length ?? 0})`}>
      <div className="grid gap-2 pb-3 sm:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, n° de l'Ordre, email"
          aria-label="Rechercher un médecin"
          className={field}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Statut"
          className={field}
        >
          <option value="all">Tous</option>
          <option value="to_verify">À valider</option>
          <option value="verified">Vérifiés</option>
        </select>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ville"
          aria-label="Ville"
          className={field}
        />
      </div>
      {(data ?? []).map((d) => (
        <button
          key={d.id}
          onClick={() => onOpen(d.id)}
          className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-sunu-green"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-sunu-dark">{d.full_name}</span>
            <span className="block text-xs text-sunu-ink/50">
              {d.specialty} · {d.city}
              {d.active === false && " · compte suspendu"}
              {d.active === null && " · sans compte"}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${d.is_verified ? "bg-sunu-teal/15 text-sunu-teal" : "bg-amber-100 text-amber-800"}`}
          >
            {d.is_verified ? "Vérifié" : "À valider"}
          </span>
        </button>
      ))}
    </Panel>
  );
}

function useVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: VerificationKind; id: string; verified: boolean }) =>
      setVerification({ data: v }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-todo"] });
      qc.invalidateQueries({ queryKey: ["admin-doctors"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

function SmsPanel() {
  const qc = useQueryClient();
  const { data: sms } = useQuery(smsQO);
  const retry = useMutation({
    mutationFn: (id: string) => retrySmsReminder({ data: { id } }),
    onSuccess: () => {
      toast.success("SMS replanifié");
      qc.invalidateQueries({ queryKey: ["admin-sms"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
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
      <div className="min-w-0 flex-1">
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
