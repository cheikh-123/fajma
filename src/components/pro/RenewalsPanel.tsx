/**
 * Demandes de renouvellement d'ordonnance reçues par le médecin : renouveler (nouvelle ordonnance,
 * mêmes médicaments, signature actuelle) ou refuser avec un motif envoyé au patient.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { decideRenewal, listProRenewals, type Renewal } from "@/api/followup";
import { formatDate } from "@/lib/datetime";

const REFUSALS = [
  "Une consultation est nécessaire avant de renouveler ce traitement.",
  "Merci de faire le bilan demandé avant le renouvellement.",
];

export function RenewalsPanel() {
  const { data = [] } = useQuery({
    queryKey: ["pro-renewals"],
    queryFn: listProRenewals,
    refetchInterval: 120_000,
  });
  if (!data.length) return null;
  return (
    <section
      aria-label="Demandes de renouvellement"
      className="mb-6 rounded-2xl border border-sunu-teal/40 bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <RefreshCw className="size-4 text-sunu-teal" /> Demandes de renouvellement ({data.length})
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/60">
        Renouveler crée une nouvelle ordonnance (mêmes médicaments, votre signature actuelle),
        envoyée au patient par SMS.
      </p>
      <ul className="stagger mt-4 grid gap-3">
        {data.map((r) => (
          <RenewalRow key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

function RenewalRow({ r }: { r: Renewal }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"idle" | "accept" | "refuse">("idle");
  const [message, setMessage] = useState("");
  const decide = useMutation({
    mutationFn: () =>
      decideRenewal(r.id, mode === "refuse" ? "refuse" : "accept", message || undefined),
    onSuccess: (res) => {
      toast.success(
        res.status === "accepted"
          ? "Ordonnance renouvelée : le patient est prévenu."
          : "Refus envoyé au patient.",
      );
      qc.invalidateQueries({ queryKey: ["pro-renewals"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <li className="rounded-xl bg-sunu-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sunu-dark">
            {r.patient?.full_name}
            {r.patient?.is_relative && (
              <span className="ml-1 text-xs font-normal text-sunu-ink/55">(proche)</span>
            )}
          </p>
          <p className="text-xs text-sunu-ink/55">
            Ordonnance {r.prescription_reference} du{" "}
            {r.prescribed_at ? formatDate(r.prescribed_at) : "—"} · demande du{" "}
            {formatDate(r.created_at)}
          </p>
        </div>
        {r.patient && (
          <Link
            to="/patients/$id"
            params={{ id: r.patient.id }}
            className="text-xs font-semibold text-sunu-green hover:underline"
          >
            Fiche patient
          </Link>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line rounded-lg bg-sunu-card px-3 py-2 text-sm text-sunu-dark">
        {r.medicines}
      </p>
      {r.patient_note && (
        <p className="mt-2 text-xs text-sunu-ink/70">
          <b>Message du patient :</b> {r.patient_note}
        </p>
      )}
      {mode === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setMode("accept")}
            className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Check className="size-3.5" /> Renouveler
          </button>
          <button
            onClick={() => setMode("refuse")}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:text-red-600"
          >
            <X className="size-3.5" /> Refuser
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            decide.mutate();
          }}
          className="mt-3 grid gap-2"
        >
          {mode === "refuse" && (
            <div className="flex flex-wrap gap-1.5">
              {REFUSALS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMessage(t)}
                  className="rounded-full bg-sunu-card px-2.5 py-1 text-[11px] text-sunu-ink/70 hover:text-sunu-green"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            required={mode === "refuse"}
            placeholder={
              mode === "refuse"
                ? "Motif envoyé au patient *"
                : "Conseil au patient, ajouté à l'ordonnance (facultatif)"
            }
            className="rounded-lg border border-sunu-line bg-sunu-card p-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={decide.isPending}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${mode === "refuse" ? "bg-red-600" : "bg-sunu-green"}`}
            >
              {decide.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {mode === "refuse" ? "Envoyer le refus" : "Confirmer le renouvellement"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setMessage("");
              }}
              className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
