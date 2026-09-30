/** Administration : volumes, commissions, virements aux médecins et remboursements aux patients. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { completeRefund, getAdminFinance, processPayout } from "@/api/finance";
import { formatDateTime } from "@/lib/datetime";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const when = (v: string) => formatDateTime(v, { dateStyle: "short", timeStyle: "short" });

export function FinanceAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-finance"], queryFn: getAdminFinance });
  const done = (msg: string) => () => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };
  const payout = useMutation({
    mutationFn: (v: { id: string; decision: "paid" | "rejected"; note?: string }) =>
      processPayout({ data: v }),
    onSuccess: done("Virement mis à jour"),
    onError: (e) => toast.error(e.message),
  });
  const refund = useMutation({
    mutationFn: (v: { id: string; transfer_reference: string }) => completeRefund({ data: v }),
    onSuccess: done("Remboursement enregistré"),
    onError: (e) => toast.error(e.message),
  });
  if (!data) return null;

  const totals = [
    { label: "Volume payé en ligne", value: data.totals.online_volume },
    { label: "Commissions nettes", value: data.totals.commission },
    { label: "Abonnements encaissés", value: data.totals.subscriptions },
    { label: "Dû aux médecins", value: data.totals.doctors_balance },
  ];

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="font-bold text-sunu-dark">Finances</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((t) => (
          <div key={t.label} className="rounded-lg bg-sunu-surface px-3 py-2">
            <p className="text-lg font-bold text-sunu-dark">{fcfa(t.value)}</p>
            <p className="text-[11px] text-sunu-ink/55">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-sunu-dark">
            <Banknote className="size-4" /> Virements aux médecins
          </h3>
          <div className="mt-2 divide-y divide-sunu-line">
            {data.payouts.length === 0 && (
              <p className="py-6 text-center text-sm text-sunu-ink/50">Aucune demande.</p>
            )}
            {data.payouts.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-sunu-dark">
                    {p.doctor_name} · {fcfa(p.amount)}
                  </p>
                  <p className="text-xs text-sunu-ink/55">
                    {p.method_label} {p.destination} · réf. {p.reference} · {when(p.created_at)}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
                {p.status === "requested" ? (
                  <div className="flex gap-1.5">
                    <button
                      disabled={payout.isPending}
                      onClick={() => {
                        const note = window.prompt(
                          "Référence du transfert effectué (Wave, Orange Money, banque) :",
                        );
                        if (note) payout.mutate({ id: p.id, decision: "paid", note });
                      }}
                      className="flex items-center gap-1 rounded-lg bg-sunu-teal/15 px-2.5 py-1.5 text-xs font-semibold text-sunu-teal"
                    >
                      <Check className="size-3.5" /> Versé
                    </button>
                    <button
                      disabled={payout.isPending}
                      onClick={() => {
                        const note = window.prompt("Motif du refus (visible par le médecin) :");
                        if (note !== null) payout.mutate({ id: p.id, decision: "rejected", note });
                      }}
                      className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                    >
                      <X className="size-3.5" /> Refuser
                    </button>
                  </div>
                ) : (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "paid" ? "bg-sunu-teal/15 text-sunu-teal" : "bg-red-100 text-red-700"}`}
                  >
                    {p.status === "paid" ? "Versé" : "Refusé"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-sunu-dark">
            <Undo2 className="size-4" /> Remboursements aux patients
          </h3>
          <div className="mt-2 divide-y divide-sunu-line">
            {data.refunds.length === 0 && (
              <p className="py-6 text-center text-sm text-sunu-ink/50">Aucun remboursement.</p>
            )}
            {data.refunds.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-sunu-dark">
                    {r.patient_name} · {fcfa(r.amount)}
                  </p>
                  <p className="text-xs text-sunu-ink/55">
                    {r.method} {r.patient_phone ?? ""} · {r.doctor_name} · réf.{" "}
                    {r.payment_reference} · {when(r.created_at)}
                  </p>
                  {r.reason && <p className="text-xs text-sunu-ink/45">{r.reason}</p>}
                </div>
                {r.status === "pending" ? (
                  <button
                    disabled={refund.isPending}
                    onClick={() => {
                      const ref = window.prompt("Référence du remboursement effectué :");
                      if (ref) refund.mutate({ id: r.id, transfer_reference: ref });
                    }}
                    className="flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800"
                  >
                    <Check className="size-3.5" /> Marquer remboursé
                  </button>
                ) : (
                  <span className="rounded-full bg-sunu-teal/15 px-2.5 py-1 text-xs font-semibold text-sunu-teal">
                    Remboursé · {r.transfer_reference}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
