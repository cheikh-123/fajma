/** Annonces groupées, réglages de la plateforme, équipe et rôles, journal d'audit filtrable. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Megaphone, Send, Settings, Users, ScrollText } from "lucide-react";
import { toast } from "sonner";
import {
  getAuditLog,
  getPlatformSettings,
  listAnnouncements,
  listStaff,
  previewAnnouncement,
  savePlatformSettings,
  sendAnnouncement,
  setStaff,
  type AuditFilters,
} from "@/api/backoffice";
import { formatDateTime } from "@/lib/datetime";

const input =
  "w-full rounded-lg border border-sunu-line bg-sunu-surface px-3 py-2 text-sm outline-none focus:border-sunu-green";

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Megaphone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Icon className="size-5 text-sunu-green" /> {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const AUDIENCES = [
  ["doctors", "Médecins"],
  ["pharmacies", "Pharmacies"],
  ["labs", "Laboratoires"],
  ["clinics", "Cliniques et secrétariats"],
  ["relais", "Relais communautaires"],
  ["patients", "Patients"],
  ["all", "Tous les utilisateurs"],
] as const;

export function AnnouncementsAdmin() {
  const qc = useQueryClient();
  const [f, setF] = useState({
    audience: "doctors",
    city: "",
    title: "",
    body: "",
    link: "",
    sms: false,
    email: false,
  });
  const { data: history } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: listAnnouncements,
  });
  const { data: preview } = useQuery({
    queryKey: ["admin-announcement-preview", f.audience, f.city.trim()],
    queryFn: () => previewAnnouncement(f.audience, f.city.trim()),
  });
  const send = useMutation({
    mutationFn: () => sendAnnouncement({ ...f, city: f.city.trim() }),
    onSuccess: (rows) => {
      toast.success(`Annonce envoyée à ${rows[0]?.recipients ?? 0} personne(s)`);
      setF((v) => ({ ...v, title: "", body: "", link: "" }));
      qc.setQueryData(["admin-announcements"], rows);
    },
    onError: (e) => toast.error(e.message),
  });
  const n = preview?.count ?? 0;
  return (
    <Card icon={Megaphone} title="Annonce à un groupe">
      <p className="text-sm text-sunu-ink/60">
        Une notification dans l'application pour chaque destinataire ; SMS et email en plus si vous
        les cochez (le SMS coûte : à réserver à l'important).
      </p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm(`Envoyer cette annonce à ${n} personne(s) ?`)) send.mutate();
        }}
      >
        <label className="text-sm">
          Destinataires
          <select
            value={f.audience}
            onChange={(e) => setF({ ...f, audience: e.target.value })}
            className={input}
          >
            {AUDIENCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ville (facultatif)
          <input
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
            placeholder="Toutes les villes"
            className={input}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Titre
          <input
            value={f.title}
            maxLength={120}
            required
            onChange={(e) => setF({ ...f, title: e.target.value })}
            className={input}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Message
          <textarea
            value={f.body}
            maxLength={600}
            required
            rows={3}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            className={input}
          />
        </label>
        <label className="text-sm">
          Page à ouvrir (facultatif)
          <input
            value={f.link}
            placeholder="/pro, /guide…"
            onChange={(e) => setF({ ...f, link: e.target.value })}
            className={input}
          />
        </label>
        <div className="flex items-end gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.sms}
              onChange={(e) => setF({ ...f, sms: e.target.checked })}
            />
            SMS
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.email}
              onChange={(e) => setF({ ...f, email: e.target.checked })}
            />
            Email
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <p className="text-sm text-sunu-ink/70">
            <b className="text-sunu-dark">{n}</b> destinataire(s)
          </p>
          <button
            disabled={send.isPending || n === 0}
            className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="size-4" /> Envoyer
          </button>
        </div>
      </form>
      {(history ?? []).length > 0 && (
        <div className="mt-5 divide-y divide-sunu-line border-t border-sunu-line">
          <p className="pt-3 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            Déjà envoyées
          </p>
          {(history ?? []).map((a) => (
            <div key={a.id} className="py-2 text-sm">
              <p className="font-semibold text-sunu-dark">{a.title}</p>
              <p className="text-xs text-sunu-ink/55">
                {formatDateTime(a.created_at, { dateStyle: "short", timeStyle: "short" })} ·{" "}
                {a.audience_label}
                {a.city ? ` (${a.city})` : ""} · {a.recipients} destinataire(s)
                {a.sms ? " · SMS" : ""}
                {a.email ? " · email" : ""}
                {a.by ? ` · par ${a.by}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SettingsAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: getPlatformSettings });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => savePlatformSettings(draft),
    onSuccess: (rows) => {
      toast.success("Réglages enregistrés");
      setDraft({});
      qc.setQueryData(["admin-settings"], rows);
      qc.invalidateQueries({ queryKey: ["site-info"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card icon={Settings} title="Réglages de la plateforme">
      <p className="text-sm text-sunu-ink/60">
        Modifiables sans technicien. Chaque changement est inscrit au journal d'audit.
      </p>
      <div className="mt-3 grid gap-3">
        {(data ?? []).map((s) => (
          <label key={s.key} className="text-sm">
            {s.label}
            {s.public && (
              <span className="ml-1 text-xs text-sunu-ink/45">(visible sur le site)</span>
            )}
            <input
              type={s.type === "int" ? "number" : s.type === "email" ? "email" : "text"}
              value={draft[s.key] ?? String(s.value ?? "")}
              onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
              className={input}
            />
          </label>
        ))}
      </div>
      <button
        disabled={save.isPending || Object.keys(draft).length === 0}
        onClick={() => save.mutate()}
        className="mt-4 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Enregistrer
      </button>
    </Card>
  );
}

const ROLES = [
  ["validation", "Validations (professionnels, justificatifs, réseau)"],
  ["support", "Support (comptes, demandes d'aide, avis, SMS)"],
  ["finance", "Finances (virements, remboursements)"],
  ["sante", "Santé publique (veille, déclarations)"],
  ["communication", "Communication (annonces, partenaires, campagnes)"],
  ["superadmin", "Super-administrateur (tout)"],
] as const;

export function StaffAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-staff"], queryFn: listStaff });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("support");
  const change = useMutation({
    mutationFn: setStaff,
    onSuccess: (rows) => {
      toast.success("Équipe mise à jour");
      setEmail("");
      qc.setQueryData(["admin-staff"], rows);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card icon={Users} title="Équipe et rôles">
      <p className="text-sm text-sunu-ink/60">
        Chaque membre ne voit que sa partie. La personne doit d'abord créer son compte Fajma ; la
        double authentification lui sera demandée.
      </p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate({ email: email.trim(), role });
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email du membre"
          className={`${input} min-w-48 flex-1`}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`${input} w-auto`}
        >
          {ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          disabled={change.isPending}
          className="rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
        >
          Donner l'accès
        </button>
      </form>
      <div className="mt-4 divide-y divide-sunu-line">
        {(data ?? []).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div>
              <p className="text-sm font-semibold text-sunu-dark">
                {m.full_name} {m.is_me && <span className="text-xs text-sunu-ink/45">(vous)</span>}
              </p>
              <p className="text-xs text-sunu-ink/55">
                {m.email} · {m.role_label}
              </p>
            </div>
            {!m.is_me && m.email && (
              <div className="flex gap-2">
                <select
                  value={m.role}
                  onChange={(e) => change.mutate({ email: m.email!, role: e.target.value })}
                  aria-label={`Rôle de ${m.full_name}`}
                  className="rounded-lg border border-sunu-line bg-sunu-surface px-2 py-1 text-xs"
                >
                  {ROLES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l.split(" (")[0]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (window.confirm(`Retirer l'accès de ${m.full_name} ?`))
                      change.mutate({ email: m.email!, remove: true });
                  }}
                  className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                >
                  Retirer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AuditLogAdmin() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ["admin-audit", filters, page],
    queryFn: () => getAuditLog(filters, page),
    placeholderData: keepPreviousData,
  });
  const set = (k: keyof AuditFilters, v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  };
  const csv = new URLSearchParams({
    ...(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>),
    export: "csv",
  });
  return (
    <Card icon={ScrollText} title={`Journal d'audit (${data?.total ?? 0} évènements)`}>
      <div className="grid gap-2 sm:grid-cols-5">
        <select
          value={filters.action ?? ""}
          onChange={(e) => set("action", e.target.value)}
          aria-label="Type d'action"
          className={`${input} sm:col-span-2`}
        >
          <option value="">Toutes les actions</option>
          {(data?.actions ?? []).map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Qui (nom, email)"
          onChange={(e) => set("who", e.target.value)}
          className={input}
        />
        <input
          type="date"
          aria-label="Depuis le"
          onChange={(e) => set("from", e.target.value)}
          className={input}
        />
        <input
          type="date"
          aria-label="Jusqu'au"
          onChange={(e) => set("to", e.target.value)}
          className={input}
        />
        <input
          placeholder="Patient concerné"
          onChange={(e) => set("patient", e.target.value)}
          className={`${input} sm:col-span-2`}
        />
        <a
          href={`/api/admin/audit?${csv}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-sm font-semibold text-sunu-green"
        >
          <Download className="size-4" /> Export tableur
        </a>
      </div>
      <div className="mt-3 divide-y divide-sunu-line">
        {(data?.results ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-sunu-ink/50">Aucun évènement.</p>
        )}
        {(data?.results ?? []).map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              <b className="text-sunu-dark">{e.action_label}</b> · {e.who}
              {e.patient && <span className="text-sunu-ink/60"> → dossier de {e.patient}</span>}
            </span>
            <span className="text-xs text-sunu-ink/50">
              {e.ip ?? ""} · {formatDateTime(e.at, { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
      </div>
      {data && data.pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-sunu-line px-3 py-1 disabled:opacity-40"
          >
            Précédent
          </button>
          <span>
            Page {data.page} / {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-sunu-line px-3 py-1 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </Card>
  );
}
