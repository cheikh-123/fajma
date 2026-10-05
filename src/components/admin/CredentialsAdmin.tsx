/**
 * Administration : contrôle des justificatifs (médecins, cliniques, pharmacies, laboratoires) avant publication.
 * Les pièces en attente passent en premier ; les pièces validées expirées ou bientôt expirées sont signalées.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ExternalLink, FileCheck2, X } from "lucide-react";
import { toast } from "sonner";
import { listCredentials, reviewCredential, type VerificationKind } from "@/api/admin";
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
  const [owner, setOwner] = useState<VerificationKind | "all">("all");
  const rows = (data ?? []).filter((c) => owner === "all" || c.owner_type === owner);
  const pending = (data ?? []).filter((c) => c.status === "pending");
  const expiring = (data ?? []).filter(
    (c) => c.status === "accepted" && (c.expired || c.expires_soon),
  );

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <FileCheck2 className="size-4" /> Justificatifs des professionnels ({pending.length} à
        vérifier{expiring.length ? `, ${expiring.length} à faire renouveler` : ""})
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Vérifiez chaque pièce à la source (Ordre des médecins, Ordre des pharmaciens, ministère de
        la Santé, registre du commerce) et la date de validité avant de valider. Un compte n'est
        publié qu'avec toutes ses pièces obligatoires validées. Chaque ouverture de fichier est
        tracée.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par titulaire">
        {(
          [
            ["all", "Tous"],
            ["doctor", "Médecins"],
            ["clinic", "Cliniques"],
            ["pharmacy", "Pharmacies"],
            ["laboratory", "Laboratoires"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setOwner(id)}
            aria-pressed={owner === id}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${owner === id ? "bg-sunu-green text-white" : "bg-sunu-surface text-sunu-ink/70"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 divide-y divide-sunu-line">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-sunu-ink/50">Aucun justificatif déposé.</p>
        )}
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
          >
            <div>
              <p className="font-semibold text-sunu-dark">
                {c.owner_name} · {c.kind_label}
              </p>
              <p className="text-xs text-sunu-ink/55">
                {c.owner_type_label} · déposé le{" "}
                {formatDateTime(c.created_at, { dateStyle: "short", timeStyle: "short" })}
                {c.expires_at && (
                  <span
                    className={
                      c.expired ? "text-red-600" : c.expires_soon ? "text-amber-700" : undefined
                    }
                  >
                    {" "}
                    · {c.expired ? "expiré le" : "valable jusqu'au"}{" "}
                    {new Date(`${c.expires_at}T00:00:00`).toLocaleDateString("fr-FR")}
                  </span>
                )}
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
                      const note = window.prompt("Motif du refus (envoyé au professionnel) :");
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
