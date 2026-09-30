/** Espace médecin : avis reçus, réponse publique, signalement à la modération. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Flag, MessageSquareReply, Star } from "lucide-react";
import { toast } from "sonner";
import { listMyReviews, replyToReview, reportReview } from "@/api/doctor";
import type { ProReview } from "@/api/types";
import { formatDate } from "@/lib/datetime";

const STATUS_LABEL = {
  published: null,
  reported: "Signalé — en attente de modération",
  hidden: "Masqué par la modération",
};

export function ReviewsPanel() {
  const { data } = useQuery({ queryKey: ["pro-reviews"], queryFn: listMyReviews });
  if (!data?.length) return null;
  return (
    <section
      aria-label="Avis des patients"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Star className="size-4" /> Avis des patients ({data.length})
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Vous pouvez répondre publiquement ou signaler un avis injurieux ; vous ne pouvez pas le
        modifier.
      </p>
      <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto">
        {data.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({ review }: { review: ProReview }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"reply" | "report" | null>(null);
  const [text, setText] = useState(review.doctor_reply ?? "");
  const done = (msg: string) => () => {
    toast.success(msg);
    setMode(null);
    qc.invalidateQueries({ queryKey: ["pro-reviews"] });
  };
  const reply = useMutation({
    mutationFn: () => replyToReview({ data: { id: review.id, reply: text } }),
    onSuccess: done("Réponse publiée"),
    onError: (e) => toast.error(e.message),
  });
  const report = useMutation({
    mutationFn: () => reportReview({ data: { id: review.id, reason: text } }),
    onSuccess: done("Avis signalé à la modération"),
    onError: (e) => toast.error(e.message),
  });
  const status = STATUS_LABEL[review.status];

  return (
    <li className="rounded-lg border border-sunu-line p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`size-3.5 ${n <= review.rating ? "fill-amber-400 text-amber-400" : "text-sunu-line"}`}
            />
          ))}
        </span>
        <span className="text-xs text-sunu-ink/45">{formatDate(review.created_at)}</span>
      </div>
      {review.comment && <p className="mt-1 text-sunu-ink/80">{review.comment}</p>}
      {status && <p className="mt-1 text-xs font-semibold text-amber-700">{status}</p>}
      {review.doctor_reply && mode !== "reply" && (
        <p className="mt-2 border-l-2 border-sunu-green pl-2 text-xs text-sunu-ink/70">
          Votre réponse : {review.doctor_reply}
        </p>
      )}
      {mode ? (
        <form
          className="mt-2 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            (mode === "reply" ? reply : report).mutate();
          }}
        >
          <textarea
            aria-label={mode === "reply" ? "Votre réponse" : "Motif du signalement"}
            rows={2}
            maxLength={mode === "reply" ? 1000 : 300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "reply"
                ? "Réponse visible par tous (sans information médicale)"
                : "Pourquoi cet avis doit-il être retiré ?"
            }
            className="w-full rounded border border-sunu-line px-2 py-1 text-xs"
          />
          <div className="flex gap-2 text-xs">
            <button
              type="submit"
              className="rounded bg-sunu-green px-3 py-1 font-semibold text-white"
            >
              {mode === "reply" ? "Publier" : "Signaler"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="text-sunu-ink/50">
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex gap-3 text-xs font-semibold">
          <button
            onClick={() => {
              setText(review.doctor_reply ?? "");
              setMode("reply");
            }}
            className="inline-flex items-center gap-1 text-sunu-green"
          >
            <MessageSquareReply className="size-3.5" />{" "}
            {review.doctor_reply ? "Modifier la réponse" : "Répondre"}
          </button>
          {review.status === "published" && (
            <button
              onClick={() => {
                setText("");
                setMode("report");
              }}
              className="inline-flex items-center gap-1 text-sunu-ink/50 hover:text-red-600"
            >
              <Flag className="size-3.5" /> Signaler
            </button>
          )}
        </div>
      )}
    </li>
  );
}
