/** Revenus du médecin : solde des paiements en ligne, demande de virement, historique et abonnement. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  Crown,
  Loader2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  getProFinance,
  refreshSubscription,
  requestPayout,
  startSubscription,
  type PayoutMethod,
  type PlanId,
  type ProFinance,
} from "@/api/finance";
import { formatDate, formatDateTime } from "@/lib/datetime";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "En traitement", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "Versé", cls: "bg-sunu-teal/15 text-sunu-teal" },
  rejected: { label: "Refusé", cls: "bg-red-100 text-red-700" },
};

export function FinancePanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-finance"], queryFn: getProFinance });

  // Retour de PayDunya après paiement d'un abonnement (?abonnement=<id>) : on vérifie le paiement.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("abonnement");
    if (!id) return;
    refreshSubscription(id)
      .then((r) => {
        if (r.status === "paid") toast.success("Abonnement activé. Merci !");
        else if (r.status === "failed") toast.error("Le paiement de l'abonnement n'a pas abouti.");
        else toast.info("Paiement de l'abonnement en cours de confirmation…");
        qc.invalidateQueries({ queryKey: ["pro-finance"] });
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => window.history.replaceState(null, "", window.location.pathname));
  }, [qc]);

  if (!data) return null;
  return (
    <section
      aria-label="Revenus"
      className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0"
    >
      <BalanceCard data={data} />
      <HistoryCard data={data} />
      <PlanCard data={data} />
    </section>
  );
}

function BalanceCard({ data }: { data: ProFinance }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayoutMethod>("wave");
  const [destination, setDestination] = useState("");
  const pending = data.payouts.find((p) => p.status === "requested");
  const ask = useMutation({
    mutationFn: () => requestPayout({ data: { amount: Number(amount), method, destination } }),
    onSuccess: (p) => {
      toast.success(`Virement demandé (réf. ${p.reference})`);
      setOpen(false);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["pro-finance"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const canAsk = !pending && data.balance >= data.min_payout;

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        <Wallet className="size-4" /> Solde disponible
      </h2>
      <p className="mt-3 text-3xl font-bold text-sunu-dark">{fcfa(data.balance)}</p>
      <p className="mt-1 text-xs text-sunu-ink/55">
        {data.totals.count} paiement(s) en ligne · {fcfa(data.totals.gross)} encaissés · commission{" "}
        {fcfa(data.totals.commission)}
      </p>
      <p className="mt-1 text-xs text-sunu-ink/45">
        Les consultations réglées en espèces ne passent pas par Fajma.
      </p>

      {pending ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Virement de {fcfa(pending.amount)} vers {pending.method_label} en cours de traitement
          (réf. {pending.reference}).
        </p>
      ) : open ? (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask.mutate();
          }}
        >
          <label className="block text-xs font-semibold text-sunu-ink/70">
            Montant (FCFA)
            <input
              type="number"
              required
              min={data.min_payout}
              max={data.balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sunu-line px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-sunu-ink/70">
            Moyen
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PayoutMethod)}
              className="mt-1 w-full rounded-lg border border-sunu-line px-3 py-2 text-sm"
            >
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="bank">Virement bancaire</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-sunu-ink/70">
            {method === "bank" ? "IBAN" : "Numéro de téléphone"}
            <input
              required
              minLength={6}
              maxLength={60}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sunu-line px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={ask.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {ask.isPending && <Loader2 className="size-4 animate-spin" />} Demander le virement
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          disabled={!canAsk}
          onClick={() => {
            setAmount(String(data.balance));
            setOpen(true);
          }}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Banknote className="size-4" /> Retirer mes gains
        </button>
      )}
      {!pending && !canAsk && (
        <p className="mt-2 text-center text-[11px] text-sunu-ink/45">
          Retrait possible à partir de {fcfa(data.min_payout)}.
        </p>
      )}
    </div>
  );
}

function HistoryCard({ data }: { data: ProFinance }) {
  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">Mouvements</h2>
      <div className="mt-3 max-h-72 divide-y divide-sunu-line overflow-y-auto">
        {data.entries.length === 0 && (
          <p className="py-8 text-center text-sm text-sunu-ink/50">
            Aucun paiement en ligne pour le moment.
          </p>
        )}
        {data.entries.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sunu-dark">
                {e.amount >= 0 ? (
                  <ArrowDownLeft className="size-3.5 text-sunu-teal" />
                ) : (
                  <ArrowUpRight className="size-3.5 text-sunu-ink/50" />
                )}
                {e.label}
              </p>
              <p className="truncate text-[11px] text-sunu-ink/50">{e.description}</p>
              {e.kind === "earning" && (
                <p className="text-[11px] text-sunu-ink/45">
                  {fcfa(e.gross)} − commission {fcfa(e.commission)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p
                className={`text-sm font-bold ${e.amount >= 0 ? "text-sunu-teal" : "text-sunu-dark"}`}
              >
                {e.amount >= 0 ? "+" : "−"}
                {fcfa(Math.abs(e.amount))}
              </p>
              <p className="text-[11px] text-sunu-ink/45">
                {formatDateTime(e.created_at, { dateStyle: "short" })}
              </p>
            </div>
          </div>
        ))}
      </div>
      {data.payouts.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            Virements
          </h3>
          <div className="mt-2 space-y-1.5">
            {data.payouts.map((p) => {
              const st = PAYOUT_STATUS[p.status];
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {fcfa(p.amount)} · {p.method_label} ·{" "}
                    {formatDateTime(p.created_at, { dateStyle: "short" })}
                    {p.note && p.status === "rejected" && (
                      <span className="text-red-600"> — {p.note}</span>
                    )}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PlanCard({ data }: { data: ProFinance }) {
  const [months, setMonths] = useState(1);
  const current = data.subscription;
  const buy = useMutation({
    mutationFn: (plan: Exclude<PlanId, "essentiel">) =>
      startSubscription({ data: { plan, months } }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        <Crown className="size-4" /> Mon abonnement
      </h2>
      <p className="mt-3 flex items-center gap-1.5 text-lg font-bold text-sunu-dark">
        <BadgeCheck className="size-5 text-sunu-green" /> Formule {current.plan_name}
      </p>
      <p className="text-xs text-sunu-ink/55">
        Commission {current.commission_percent} % sur les paiements en ligne
        {current.current_period_end &&
          ` · jusqu'au ${formatDate(current.current_period_end, { dateStyle: "long" })}`}
      </p>

      <div
        className="mt-4 flex gap-1 rounded-lg bg-sunu-surface p-1"
        role="radiogroup"
        aria-label="Durée"
      >
        {data.durations.map((d) => (
          <button
            key={d.months}
            role="radio"
            aria-checked={months === d.months}
            onClick={() => setMonths(d.months)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${months === d.months ? "bg-sunu-card text-sunu-dark shadow-sm" : "text-sunu-ink/55"}`}
          >
            <span className="block whitespace-nowrap">{d.months} mois</span>
            {d.discount_percent ? (
              <span className="block whitespace-nowrap text-[10px] font-bold text-sunu-green">
                −{d.discount_percent} %
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {data.plans
          .filter((p) => p.id !== "essentiel")
          .map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 ${current.plan === p.id ? "border-sunu-green" : "border-sunu-line"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sunu-dark">{p.name}</p>
                <p className="text-sm font-bold text-sunu-dark">{fcfa(p.prices[String(months)])}</p>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-[11px] text-sunu-ink/60">
                    <Check className="size-3 text-sunu-teal" /> {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={buy.isPending}
                onClick={() => buy.mutate(p.id as Exclude<PlanId, "essentiel">)}
                className="mt-2 w-full rounded-lg border border-sunu-green px-3 py-1.5 text-xs font-semibold text-sunu-green hover:bg-sunu-green hover:text-white disabled:opacity-50"
              >
                {current.plan === p.id ? "Prolonger" : "Choisir"} · paiement Wave / Orange Money
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
