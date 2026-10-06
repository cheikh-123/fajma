/**
 * Espace « Famille » : aider un proche au Sénégal depuis n'importe où. Inviter (accord par code SMS donné au
 * téléphone), recharger son crédit santé (carte bancaire ou mobile money, montant affiché aussi en euros),
 * payer ses consultations, prendre ses rendez-vous et suivre ses comptes-rendus si le proche l'a accepté.
 */
import { HelpLink } from "@/components/HelpLink";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  CalendarPlus,
  ChevronDown,
  CreditCard,
  FileText,
  HeartHandshake,
  Loader2,
  Plus,
  Send,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmCareLink,
  fcfa,
  getCareLink,
  inviteRelative,
  listCareLinks,
  payForRelative,
  refreshTopUp,
  resendCareCode,
  revokeCareLink,
  toEur,
  topUpCredit,
  updateCareLink,
  type CareLink,
  type FamilyAppt,
} from "@/api/family";
import { FajmaMark } from "@/components/FajmaMark";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { setBookFor } from "@/lib/book-for";
import { formatDateTime } from "@/lib/datetime";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/famille")({
  validateSearch: (s) => z.object({ recharge: z.string().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Famille — aider un proche — Fajma" }] }),
  component: FamilyPage,
});

const AMOUNTS = [10_000, 25_000, 50_000, 100_000];

function FamilyPage() {
  const { recharge } = Route.useSearch();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["care-links"], queryFn: listCareLinks });
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    if (!recharge) return;
    refreshTopUp(recharge)
      .then((r) => {
        if (r.status === "paid") toast.success(`Crédit santé rechargé : ${fcfa(r.amount)}`);
        else if (r.status === "failed") toast.error("Paiement de la recharge non abouti");
        qc.invalidateQueries({ queryKey: ["care-links"] });
      })
      .catch(() => undefined);
  }, [recharge, qc]);
  const mine = (data ?? []).filter((l) => l.role === "sponsor");

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link to="/mon-espace" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="font-bold text-sunu-dark">Famille</span>
          </Link>
          <ThemeToggle className="ml-auto" />
          <NotificationBell />
          <HelpLink role="famille" />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green">
          <HeartHandshake className="size-4" /> Entraide familiale
        </p>
        <h1 className="mt-2 text-3xl font-bold text-sunu-dark">
          Prenez soin de vos parents, où que vous soyez
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-sunu-ink/65">
          Payez leurs consultations par carte bancaire ou mobile money, offrez-leur un crédit santé,
          prenez leurs rendez-vous et recevez des nouvelles après chaque visite. Toujours avec leur
          accord : ils peuvent retirer l'accès quand ils veulent.
        </p>

        {isLoading ? (
          <Loader2 className="mt-8 size-6 animate-spin text-sunu-ink/40" />
        ) : (
          <div className="mt-6 space-y-4">
            {mine.map((l) => (
              <LinkCard key={l.id} link={l} />
            ))}
            {mine.length === 0 && !inviting && (
              <p className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sm text-sunu-ink/55">
                Ajoutez un proche : il reçoit un code par SMS, il vous le donne au téléphone, et
                c'est fait. Aucun smartphone n'est nécessaire de son côté.
              </p>
            )}
            {inviting ? (
              <InviteForm onDone={() => setInviting(false)} />
            ) : (
              <button
                onClick={() => setInviting(true)}
                className="flex items-center gap-2 rounded-full bg-sunu-green px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="size-4" /> Ajouter un proche
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    label: "",
    phone: "",
    lang: "fr",
    can_book: true,
    can_see_records: false,
  });
  const send = useMutation({
    mutationFn: () => inviteRelative(form),
    onSuccess: (l) => {
      toast.success(`Code envoyé par SMS à ${l.label}. Demandez-le-lui au téléphone.`);
      if (l.dev_code) toast.info(`Code de test : ${l.dev_code}`, { duration: 20000 });
      qc.invalidateQueries({ queryKey: ["care-links"] });
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
        send.mutate();
      }}
      className="grid gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-5 sm:grid-cols-2"
    >
      <label className={label}>
        Prénom et nom de votre proche
        <input
          required
          minLength={2}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="Awa Ndiaye"
          className={field}
        />
      </label>
      <label className={label}>
        Vous l'appelez
        <input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Maman, Tonton Ibrahima…"
          className={field}
        />
      </label>
      <label className={label}>
        Son numéro au Sénégal
        <input
          required
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="77 123 45 67"
          className={field}
        />
      </label>
      <label className={label}>
        Langue du SMS
        <select
          value={form.lang}
          onChange={(e) => setForm({ ...form, lang: e.target.value })}
          className={field}
        >
          <option value="fr">Français</option>
          <option value="wo">Wolof</option>
          <option value="en">Anglais</option>
        </select>
      </label>
      <fieldset className="grid gap-1.5 text-sm sm:col-span-2">
        <legend className="text-xs font-semibold text-sunu-ink/60">Ce que vous demandez</legend>
        <label className="flex items-center gap-2 text-sunu-ink/60">
          <input type="checkbox" checked disabled /> Payer ses consultations (toujours inclus)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.can_book}
            onChange={(e) => setForm({ ...form, can_book: e.target.checked })}
          />
          Prendre ses rendez-vous
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.can_see_records}
            onChange={(e) => setForm({ ...form, can_see_records: e.target.checked })}
          />
          Voir ses ordonnances et comptes-rendus (données de santé)
        </label>
        <p className="text-xs text-sunu-ink/50">
          Le SMS annonce exactement ces droits. Votre proche donne son accord en vous transmettant
          le code reçu.
        </p>
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <button
          disabled={send.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send className="size-4" /> Envoyer le code par SMS
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

function LinkCard({ link }: { link: CareLink }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [custom, setCustom] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["care-links"] });
    qc.invalidateQueries({ queryKey: ["care-link", link.id] });
  };
  const confirm = useMutation({
    mutationFn: () => confirmCareLink(link.id, code),
    onSuccess: () => {
      toast.success(`${link.label} a accepté : c'est prêt !`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const resend = useMutation({
    mutationFn: () => resendCareCode(link.id),
    onSuccess: (l) => {
      toast.success("Nouveau code envoyé");
      if (l.dev_code) toast.info(`Code de test : ${l.dev_code}`, { duration: 20000 });
    },
    onError: (e) => toast.error(e.message),
  });
  const topup = useMutation({
    mutationFn: (amount: number) => topUpCredit(link.id, amount),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeCareLink(link.id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  if (link.status === "pending")
    return (
      <section className="rounded-2xl border border-amber-300 bg-sunu-card p-5">
        <h2 className="font-bold text-sunu-dark">
          {link.label}{" "}
          <span className="text-xs font-normal text-sunu-ink/55">
            ({link.beneficiary.full_name} · {link.beneficiary.phone_hint})
          </span>
        </h2>
        <p className="mt-1 text-sm text-sunu-ink/65">
          Un code à 6 chiffres lui a été envoyé par SMS. Appelez-le et saisissez le code qu'il vous
          donne : c'est son accord.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="Code reçu"
            aria-label="Code donné par votre proche"
            className="w-32 rounded-lg border border-sunu-line px-3 py-2 text-center text-lg tracking-widest"
          />
          <button
            disabled={code.length !== 6 || confirm.isPending}
            className="rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Valider
          </button>
          <button
            type="button"
            onClick={() => resend.mutate()}
            className="text-sm font-semibold text-sunu-green"
          >
            Renvoyer un code
          </button>
          <button
            type="button"
            onClick={() => revoke.mutate()}
            className="ml-auto text-sm text-sunu-ink/50 hover:text-red-600"
          >
            Annuler l'invitation
          </button>
        </form>
      </section>
    );

  return (
    <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-sunu-dark">{link.label}</h2>
          <p className="text-xs text-sunu-ink/55">
            {link.beneficiary.full_name} · {link.beneficiary.phone_hint}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-sunu-ink/55">Crédit santé</p>
          <p className="text-2xl font-bold text-sunu-green">{fcfa(link.balance)}</p>
          <p className="text-xs text-sunu-ink/50">≈ {toEur(link.balance)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-sunu-ink/60">
          <Wallet className="size-4" /> Recharger :
        </span>
        {AMOUNTS.map((a) => (
          <button
            key={a}
            disabled={topup.isPending}
            onClick={() => topup.mutate(a)}
            className="rounded-full border border-sunu-line px-3 py-1.5 text-xs font-semibold hover:border-sunu-green hover:text-sunu-green"
            title={`≈ ${toEur(a)}`}
          >
            {fcfa(a)} <span className="font-normal text-sunu-ink/50">({toEur(a)})</span>
          </button>
        ))}
        <input
          type="number"
          min={2000}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Autre montant"
          aria-label="Autre montant en francs CFA"
          className="w-32 rounded-full border border-sunu-line px-3 py-1.5 text-xs"
        />
        {Number(custom) >= 2000 && (
          <button
            onClick={() => topup.mutate(Number(custom))}
            className="rounded-full bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
          >
            Payer {fcfa(Number(custom))} ({toEur(Number(custom))})
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-sunu-ink/45">
        Paiement sécurisé par carte bancaire (Visa, Mastercard) ou mobile money. Taux fixe : 1 € =
        655,957 F CFA.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {link.can_book && (
          <button
            onClick={() => {
              setBookFor({ linkId: link.id, label: link.label });
              navigate({ to: "/medecins" });
            }}
            className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white"
          >
            <CalendarPlus className="size-4" /> Prendre un rendez-vous pour {link.label}
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70"
        >
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} /> Rendez-vous,
          paiements{link.can_see_records ? ", comptes-rendus" : ""}
        </button>
      </div>
      {open && <LinkDetail link={link} />}
    </section>
  );
}

function ApptRow({ link, a }: { link: CareLink; a: FamilyAppt }) {
  const qc = useQueryClient();
  const pay = useMutation({
    mutationFn: (method: "online" | "credit") => payForRelative(link.id, a.id, method),
    onSuccess: (r) => {
      if (r.kind === "redirect") {
        window.location.assign(r.url);
        return;
      }
      toast.success(`Consultation payée · solde ${fcfa(r.balance)}`);
      qc.invalidateQueries({ queryKey: ["care-links"] });
      qc.invalidateQueries({ queryKey: ["care-link", link.id] });
    },
    onError: (e) => toast.error(e.message),
  });
  const canPay = !a.paid && a.status !== "cancelled" && a.amount_due > 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div>
        <p className="font-semibold text-sunu-dark">
          {a.doctor.full_name}
          {a.doctor.specialty ? ` · ${a.doctor.specialty}` : ""}
        </p>
        <p className="text-xs text-sunu-ink/55">
          {formatDateTime(a.scheduled_at, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
          {a.status_label}
          {a.paid ? ` · payé (${a.paid_with})` : a.amount_due ? ` · ${fcfa(a.amount_due)}` : ""}
        </p>
      </div>
      {canPay && (
        <span className="flex gap-1.5">
          {link.balance >= a.amount_due && (
            <button
              disabled={pay.isPending}
              onClick={() => pay.mutate("credit")}
              className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Wallet className="size-3.5" /> Avec le crédit
            </button>
          )}
          <button
            disabled={pay.isPending}
            onClick={() => pay.mutate("online")}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold"
          >
            <CreditCard className="size-3.5" /> Payer {toEur(a.amount_due)}
          </button>
        </span>
      )}
    </li>
  );
}

function LinkDetail({ link }: { link: CareLink }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["care-link", link.id],
    queryFn: () => getCareLink(link.id),
  });
  const [settings, setSettings] = useState({
    monthly_reminder_amount: link.monthly_reminder_amount,
    low_balance_alert: link.low_balance_alert,
  });
  const save = useMutation({
    mutationFn: (v: Partial<CareLink>) => updateCareLink(link.id, v),
    onSuccess: () => {
      toast.success("Enregistré");
      qc.invalidateQueries({ queryKey: ["care-links"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeCareLink(link.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care-links"] }),
    onError: (e) => toast.error(e.message),
  });
  if (!data) return <Loader2 className="mt-4 size-5 animate-spin text-sunu-ink/40" />;
  return (
    <div className="mt-4 grid gap-5 border-t border-sunu-line pt-4 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-bold text-sunu-dark">Rendez-vous à venir</h3>
        {data.upcoming.length === 0 ? (
          <p className="mt-1 text-xs text-sunu-ink/55">Aucun.</p>
        ) : (
          <ul className="divide-y divide-sunu-line">
            {data.upcoming.map((a) => (
              <ApptRow key={a.id} link={link} a={a} />
            ))}
          </ul>
        )}
        <h3 className="mt-4 text-sm font-bold text-sunu-dark">Historique</h3>
        <ul className="divide-y divide-sunu-line">
          {data.past.slice(0, 8).map((a) => (
            <ApptRow key={a.id} link={link} a={a} />
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        {data.records && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-sunu-dark">
              <FileText className="size-4" /> Comptes-rendus et ordonnances
            </h3>
            <ul className="mt-1 space-y-2 text-xs">
              {data.records.map((r) => (
                <li key={r.id} className="rounded-lg bg-sunu-surface p-2.5">
                  <b>{r.doctor}</b> · {formatDateTime(r.created_at, { dateStyle: "medium" })}
                  {r.diagnosis && <p>Diagnostic : {r.diagnosis}</p>}
                  {r.treatment && <p>Traitement : {r.treatment}</p>}
                  {r.summary && <p className="text-sunu-ink/60">{r.summary}</p>}
                </li>
              ))}
              {(data.prescriptions ?? []).map((p) => (
                <li key={p.id} className="rounded-lg bg-sunu-surface p-2.5">
                  <b>Ordonnance {p.reference}</b> · {p.doctor} ·{" "}
                  {formatDateTime(p.created_at, { dateStyle: "medium" })}
                  {p.items.length === 0 && p.content && (
                    <p className="mt-1 whitespace-pre-line">{p.content}</p>
                  )}
                  <ul className="mt-1 list-disc pl-4">
                    {p.items.map((i, k) => (
                      <li key={k}>
                        {i.name}
                        {i.posology ? ` — ${i.posology}` : ""}
                        {i.duration ? ` (${i.duration})` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {data.records.length === 0 && (data.prescriptions ?? []).length === 0 && (
                <li className="text-sunu-ink/55">Rien pour l'instant.</li>
              )}
            </ul>
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-sunu-dark">Mouvements du crédit</h3>
          <ul className="mt-1 divide-y divide-sunu-line text-xs">
            {data.credit.map((e, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5">
                <span>
                  {e.kind_label}
                  {e.description ? ` · ${e.description}` : ""}
                </span>
                <b className={e.amount > 0 ? "text-sunu-green" : "text-sunu-ink/70"}>
                  {e.amount > 0 ? "+" : ""}
                  {fcfa(e.amount)}
                </b>
              </li>
            ))}
            {data.credit.length === 0 && <li className="py-1.5 text-sunu-ink/55">Aucun.</li>}
          </ul>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(settings);
          }}
          className="grid gap-2 rounded-xl bg-sunu-surface p-3 text-xs"
        >
          <label className="grid gap-1 font-semibold text-sunu-ink/60">
            Me rappeler chaque mois de recharger (F, 0 : jamais)
            <input
              type="number"
              min={0}
              value={settings.monthly_reminder_amount}
              onChange={(e) =>
                setSettings({ ...settings, monthly_reminder_amount: Number(e.target.value) })
              }
              className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5"
            />
          </label>
          <label className="grid gap-1 font-semibold text-sunu-ink/60">
            M'alerter quand le crédit passe sous (F)
            <input
              type="number"
              min={0}
              value={settings.low_balance_alert}
              onChange={(e) =>
                setSettings({ ...settings, low_balance_alert: Number(e.target.value) })
              }
              className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white">
              Enregistrer
            </button>
            {link.can_see_records && (
              <button
                type="button"
                onClick={() => save.mutate({ can_see_records: false })}
                className="text-sunu-ink/60 underline"
              >
                Ne plus voir ses comptes-rendus
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Arrêter d'aider ${link.label} sur Fajma ?`)) revoke.mutate();
              }}
              className="ml-auto text-red-600 underline"
            >
              Arrêter l'entraide
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
