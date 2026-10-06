/** Espace patient : avis écrits demandés, délai, réponse du médecin. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { cancelAsyncRequest, listMyAsyncRequests } from "@/api/econsult";
import { formatDateTime } from "@/lib/datetime";

export function MyAsyncCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-async"], queryFn: listMyAsyncRequests });
  const cancel = useMutation({
    mutationFn: cancelAsyncRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-async"] }),
    onError: (e) => toast.error(e.message),
  });
  const rows = (data ?? []).filter((r) => r.status !== "cancelled").slice(0, 6);
  if (!rows.length) return null;
  return (
    <section
      id="avis"
      className="scroll-mt-24 rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <MessageSquareText className="size-4" /> Avis écrits
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl bg-sunu-surface p-3 text-sm">
            <p className="font-semibold text-sunu-dark">
              {r.doctor.full_name} · {r.reason}
            </p>
            <p className="text-xs text-sunu-ink/60">
              {r.status_label}
              {r.status === "submitted" && r.deadline_at
                ? ` · réponse avant le ${formatDateTime(r.deadline_at, { dateStyle: "short", timeStyle: "short" })}`
                : ""}
            </p>
            {r.answer && (
              <div className="mt-2 rounded-lg bg-sunu-card p-2.5 text-xs">
                <b className={r.outcome === "emergency" ? "text-red-600" : "text-sunu-green"}>
                  {r.outcome_label}
                </b>
                <p className="mt-1 whitespace-pre-line">{r.answer}</p>
                {r.outcome === "prescription" && (
                  <Link to="/dossier" className="mt-1 inline-block font-semibold text-sunu-green">
                    Voir l'ordonnance →
                  </Link>
                )}
                {r.outcome === "in_person" && (
                  <Link
                    to="/medecins/$id"
                    params={{ id: r.doctor.id }}
                    className="mt-1 inline-block font-semibold text-sunu-green"
                  >
                    Prendre rendez-vous →
                  </Link>
                )}
              </div>
            )}
            {(r.status === "awaiting_payment" || r.status === "submitted") && (
              <button
                onClick={() => cancel.mutate(r.id)}
                className="mt-1 text-xs text-sunu-ink/50 hover:text-red-600"
              >
                Annuler la demande
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
