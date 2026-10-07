/**
 * Espace relais communautaire : personnes suivies (sans téléphone ni internet), alertes du jour en tête
 * (tension, glycémie, vaccins en retard, rendez-vous proches), ajout avec accord, transfert du dossier.
 */
import { HelpLink } from "@/components/HelpLink";
import { BackButton } from "@/components/BackButton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CalendarPlus, HeartPulse, Loader2, Plus, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { FajmaMark } from "@/components/FajmaMark";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { formatDateTime } from "@/lib/datetime";
import { ThemeToggle } from "@/lib/theme";

type Alert = { level: "urgent" | "warning" | "info"; text: string };
type Person = {
  id: string;
  relative_id: string | null;
  full_name: string;
  birth_date: string | null;
  sex: string | null;
  phone: string | null;
  village: string | null;
  notes: string | null;
  consent_label: string;
  status: string;
  status_label: string;
  next_appointment: { at: string; doctor: string } | null;
  alerts: Alert[];
};
type Board = {
  agent: { organization: string; area: string; max_people: number };
  people: Person[];
  counts: { people: number; urgent: number; warning: number };
};

export const Route = createFileRoute("/_authenticated/relais")({
  head: () => ({ meta: [{ title: "Relais communautaire — Fajma" }] }),
  component: RelaisPage,
});

const TONE: Record<Alert["level"], string> = {
  urgent: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-900",
  info: "bg-sunu-green-soft text-sunu-green",
};

function RelaisPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["relais"],
    queryFn: () => api.get<Board>("/community/people"),
  });
  const [adding, setAdding] = useState(false);
  if (isLoading) return <Loader2 className="m-10 size-6 animate-spin text-sunu-ink/40" />;
  if (error || !data)
    return (
      <p className="mx-auto max-w-lg px-6 py-16 text-center text-sm text-sunu-ink/60">
        Espace réservé aux relais communautaires habilités par l'équipe Fajma.
      </p>
    );
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BackButton to="/" />
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="font-bold text-sunu-dark">Relais · {data.agent.organization}</span>
          </Link>
          <ThemeToggle className="ml-auto" />
          <NotificationBell />
          <HelpLink role="relais" />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Users} label="Personnes suivies" value={data.counts.people} />
          <Stat
            icon={AlertTriangle}
            label="À voir aujourd'hui"
            value={data.counts.urgent}
            tone="text-red-600"
          />
          <Stat
            icon={HeartPulse}
            label="À surveiller"
            value={data.counts.warning}
            tone="text-amber-700"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> Ajouter une personne
          </button>
          <Link
            to="/medecins"
            className="flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-4 py-2 text-sm font-semibold"
          >
            <CalendarPlus className="size-4" /> Prendre un RDV (choisir la personne dans « Pour qui
            »)
          </Link>
          <Link
            to="/dossier"
            className="flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-4 py-2 text-sm font-semibold"
          >
            <HeartPulse className="size-4" /> Noter une tension, une glycémie, un vaccin
          </Link>
        </div>
        {adding && <AddForm onDone={() => setAdding(false)} />}
        <div className="mt-6 grid gap-3">
          {data.people.length === 0 && (
            <p className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sm text-sunu-ink/55">
              Ajoutez les personnes que vous suivez dans {data.agent.area}.
            </p>
          )}
          {data.people.map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
        </div>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-sunu-dark",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-4">
      <Icon className="size-5 text-sunu-green" />
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-sunu-ink/55">{label}</p>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    full_name: "",
    birth_date: "",
    sex: "",
    phone: "",
    village: "",
    consent: "oral",
    consent_witness: "",
    notes: "",
  });
  const add = useMutation({
    mutationFn: () => api.post<Person>("/community/people", f),
    onSuccess: () => {
      toast.success("Personne ajoutée");
      qc.invalidateQueries({ queryKey: ["relais"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
      className="mt-4 grid gap-2 rounded-2xl border border-sunu-line bg-sunu-card p-5 sm:grid-cols-2"
    >
      <input
        required
        minLength={2}
        value={f.full_name}
        onChange={set("full_name")}
        placeholder="Prénom et nom"
        aria-label="Prénom et nom"
        className={field}
      />
      <input
        type="date"
        value={f.birth_date}
        onChange={set("birth_date")}
        aria-label="Date de naissance"
        className={field}
      />
      <select value={f.sex} onChange={set("sex")} aria-label="Sexe" className={field}>
        <option value="">Sexe</option>
        <option value="F">Femme</option>
        <option value="M">Homme</option>
      </select>
      <input
        value={f.village}
        onChange={set("village")}
        placeholder="Quartier ou village"
        aria-label="Quartier ou village"
        className={field}
      />
      <input
        type="tel"
        value={f.phone}
        onChange={set("phone")}
        placeholder="Téléphone d'un proche (facultatif)"
        aria-label="Téléphone"
        className={field}
      />
      <input
        value={f.notes}
        onChange={set("notes")}
        placeholder="Repère (maison, accès…) — pas de données médicales"
        aria-label="Repère"
        className={field}
      />
      <select value={f.consent} onChange={set("consent")} aria-label="Accord" className={field}>
        <option value="oral">Accord oral (devant témoin)</option>
        <option value="signed">Formulaire signé</option>
        <option value="guardian">Accord du tuteur ou parent</option>
      </select>
      <input
        value={f.consent_witness}
        onChange={set("consent_witness")}
        placeholder="Témoin de l'accord"
        aria-label="Témoin"
        className={field}
      />
      <p className="text-xs text-sunu-ink/55 sm:col-span-2">
        La personne (ou son tuteur) accepte que vous suiviez sa santé sur Fajma. Elle pourra
        récupérer son dossier quand elle aura un téléphone.
      </p>
      <button
        disabled={add.isPending}
        className="rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
      >
        Ajouter
      </button>
    </form>
  );
}

function PersonCard({ p }: { p: Person }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "phone" | "code">("idle");
  const start = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; dev_code?: string }>(`/community/people/${p.id}/transfer`, { phone }),
    onSuccess: (r) => {
      setStep("code");
      toast.success("Code envoyé par SMS à la personne");
      if (r.dev_code) toast.info(`Code de test : ${r.dev_code}`, { duration: 20000 });
    },
    onError: (e) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => api.post<Person>(`/community/people/${p.id}/transfer/confirm`, { code }),
    onSuccess: () => {
      toast.success("Dossier transféré : la personne se connecte avec son numéro");
      qc.invalidateQueries({ queryKey: ["relais"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const age = p.birth_date
    ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 3.15576e10)
    : null;
  return (
    <article className="rounded-2xl border border-sunu-line bg-sunu-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sunu-dark">{p.full_name}</p>
          <p className="text-xs text-sunu-ink/55">
            {[
              age != null && `${age} ans`,
              p.sex === "F" ? "femme" : p.sex === "M" ? "homme" : null,
              p.village,
              p.notes,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="text-xs text-sunu-ink/50">
          {p.status === "active" ? p.consent_label : p.status_label}
        </span>
      </div>
      {p.alerts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {p.alerts.map((a, i) => (
            <li
              key={i}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${TONE[a.level]}`}
            >
              {a.text}
            </li>
          ))}
        </ul>
      )}
      {p.next_appointment && (
        <p className="mt-2 text-xs text-sunu-ink/60">
          Prochain RDV :{" "}
          {formatDateTime(p.next_appointment.at, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
          {p.next_appointment.doctor}
        </p>
      )}
      {p.status === "active" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {step === "idle" && (
            <button onClick={() => setStep("phone")} className="font-semibold text-sunu-green">
              Elle a maintenant un téléphone : lui transférer son dossier
            </button>
          )}
          {step === "phone" && (
            <>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Son numéro"
                aria-label="Son numéro"
                className="rounded-lg border border-sunu-line px-2 py-1.5"
              />
              <button
                onClick={() => start.mutate()}
                className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white"
              >
                <Send className="size-3.5" /> Envoyer le code
              </button>
            </>
          )}
          {step === "code" && (
            <>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Code reçu"
                aria-label="Code reçu"
                className="w-28 rounded-lg border border-sunu-line px-2 py-1.5 text-center"
              />
              <button
                onClick={() => confirm.mutate()}
                className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white"
              >
                Transférer
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
