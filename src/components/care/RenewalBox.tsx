/**
 * Sous une ordonnance du patient : demander son renouvellement au médecin (traitement au long cours),
 * suivre la réponse (en attente, renouvelée, refusée avec le motif).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cancelRenewal, listMyRenewals, requestRenewal } from "@/api/followup";

const YEAR_MS = 365 * 86_400_000;

export function RenewalBox({
  prescriptionId,
  createdAt,
  doctorId,
}: {
  prescriptionId: string;
  createdAt: string;
  doctorId?: string;
}) {
  const qc = useQueryClient();
  const { data: renewals = [] } = useQuery({ queryKey: ["my-renewals"], queryFn: listMyRenewals });
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-renewals"] });
    qc.invalidateQueries({ queryKey: ["my-health-data"] });
  };
  const ask = useMutation({
    mutationFn: () => requestRenewal(prescriptionId, note || undefined),
    onSuccess: () => {
      toast.success("Demande envoyée : vous serez prévenu de la réponse du médecin.");
      setOpen(false);
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelRenewal(id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const last = renewals.find(
    (r) => r.prescription_id === prescriptionId && r.status !== "cancelled",
  );
  const tooOld = Date.now() - new Date(createdAt).getTime() > YEAR_MS;

  if (last?.status === "pending")
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Clock className="size-3.5" /> Renouvellement demandé au {last.doctor.full_name}, en attente
        de réponse.
        <button
          onClick={() => cancel.mutate(last.id)}
          className="ml-auto font-semibold underline"
          disabled={cancel.isPending}
        >
          Annuler
        </button>
      </p>
    );
  if (last?.status === "accepted" && last.new_prescription_id)
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-sunu-green-soft px-3 py-2 text-xs text-sunu-dark">
        <CheckCircle2 className="size-3.5 text-sunu-green" /> Renouvelée par le{" "}
        {last.doctor.full_name}.
        <Link
          to="/ordonnance/$id"
          params={{ id: last.new_prescription_id }}
          className="ml-auto font-semibold text-sunu-green underline"
        >
          Voir la nouvelle ordonnance
        </Link>
      </p>
    );

  return (
    <div className="mt-3">
      {last?.status === "refused" && (
        <p className="mb-2 flex flex-wrap items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Renouvellement non accordé : {last.doctor_reply}{" "}
            {doctorId && (
              <Link
                to="/medecins/$id"
                params={{ id: doctorId }}
                className="font-semibold underline"
              >
                Prendre rendez-vous
              </Link>
            )}
          </span>
        </p>
      )}
      {tooOld ? (
        <p className="text-[11px] text-sunu-ink/50">
          Ordonnance de plus d'un an : une nouvelle consultation est nécessaire.
        </p>
      ) : open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask.mutate();
          }}
          className="grid gap-2 rounded-lg border border-sunu-line p-3"
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Message au médecin (facultatif) : il me reste 5 comprimés, tension stable…"
            className="rounded-lg border border-sunu-line bg-sunu-card p-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={ask.isPending}
              className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {ask.isPending && <Loader2 className="size-3.5 animate-spin" />} Envoyer la demande
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
        >
          <RefreshCw className="size-3.5" /> Demander le renouvellement
        </button>
      )}
    </div>
  );
}
