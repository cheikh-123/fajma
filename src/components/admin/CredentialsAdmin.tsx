/** Administration : contrôle des justificatifs des médecins avant publication de leur fiche. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, FileCheck2, X } from "lucide-react";
import { toast } from "sonner";
import { listCredentials, reviewCredential } from "@/api/admin";
import { formatDateTime } from "@/lib/datetime";

export function CredentialsAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-credentials"], queryFn: listCredentials });
  const review = useMutation({
    mutationFn: (v: { id: string; decision: "accepted" | "rejected"; note?: string }) =>
      reviewCredential({ data: v }),
    onSuccess: () => {
      toast.success("Justificatif traité");
      qc.invalidateQueries({ queryKey: ["admin-credentials"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const pending = (data ?? []).filter((c) => c.status === "pending");

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <FileCheck2 className="size-4" /> Justificatifs des médecins ({pending.length} à vérifier)
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Contrôlez le numéro d'inscription auprès de l'Ordre des médecins avant de valider. Chaque
        consultation de fichier est tracée.
      </p>
      <div className="mt-3 divide-y divide-sunu-line">
        {(data ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-sunu-ink/50">Aucun justificatif déposé.</p>
        )}
        {(data ?? []).map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
          >
            <div>
              <p className="font-semibold text-sunu-dark">
                {c.doctor_name} · {c.kind_label}
              </p>
              <p className="text-xs text-sunu-ink/55">
                Déposé le {formatDateTime(c.created_at, { dateStyle: "short", timeStyle: "short" })}
                {c.review_note && ` · ${c.review_note}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={c.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border border-sunu-line px-2.5 py-1.5 text-xs font-semibold text-sunu-ink/70"
              >
                <ExternalLink className="size-3.5" /> Ouvrir
              </a>
              {c.status === "pending" ? (
                <>
                  <button
                    onClick={() => review.mutate({ id: c.id, decision: "accepted" })}
                    className="flex items-center gap-1 rounded-lg bg-sunu-teal/15 px-2.5 py-1.5 text-xs font-semibold text-sunu-teal"
                  >
                    <Check className="size-3.5" /> Valider
                  </button>
                  <button
                    onClick={() => {
                      const note = window.prompt("Motif du refus (envoyé au médecin) :");
                      if (note) review.mutate({ id: c.id, decision: "rejected", note });
                    }}
                    className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                  >
                    <X className="size-3.5" /> Refuser
                  </button>
                </>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === "accepted" ? "bg-sunu-teal/15 text-sunu-teal" : "bg-red-100 text-red-700"}`}
                >
                  {c.status === "accepted" ? "Validé" : "Refusé"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
