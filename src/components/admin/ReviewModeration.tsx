/** Administration : avis signalés par les médecins ou retenus automatiquement. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Star } from "lucide-react";
import { toast } from "sonner";
import { listReviewsToModerate, moderateReview } from "@/api/admin";

export function ReviewModeration() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-reviews"], queryFn: listReviewsToModerate });
  const moderate = useMutation({
    mutationFn: (v: { id: string; decision: "publish" | "hide" }) => moderateReview({ data: v }),
    onSuccess: () => {
      toast.success("Décision enregistrée");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Star className="size-4" /> Avis à modérer ({data?.length ?? 0})
      </h2>
      <div className="mt-3 divide-y divide-sunu-line">
        {(data ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-sunu-ink/50">Aucun avis en attente.</p>
        )}
        {(data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sunu-dark">
                {r.rating}/5 · {r.patient_name} → {r.doctor_name}
              </p>
              {r.comment && <p className="mt-0.5 text-sunu-ink/80">« {r.comment} »</p>}
              <p className="mt-0.5 text-xs text-amber-700">Motif : {r.report_reason}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => moderate.mutate({ id: r.id, decision: "publish" })}
                className="flex items-center gap-1 rounded-lg bg-sunu-teal/15 px-2.5 py-1.5 text-xs font-semibold text-sunu-teal"
              >
                <Eye className="size-3.5" /> Publier
              </button>
              <button
                onClick={() => moderate.mutate({ id: r.id, decision: "hide" })}
                className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
              >
                <EyeOff className="size-3.5" /> Masquer
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
