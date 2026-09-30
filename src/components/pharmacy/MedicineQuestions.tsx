/** Espace pharmacie : « Avez-vous ce médicament ? » — répondre en un clic (le patient est prévenu). */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { answerMedicine, type MedicineQuestion } from "@/api/pharmacy";
import { formatDateTime } from "@/lib/datetime";

export function MedicineQuestions({ questions }: { questions: MedicineQuestion[] }) {
  if (!questions.length) return null;
  const pending = questions.filter((q) => q.status === "pending").length;
  return (
    <section
      aria-label="Questions des patients"
      className={`mt-6 rounded-2xl border bg-sunu-card p-5 ${pending ? "border-sunu-gold" : "border-sunu-line"}`}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <PackageSearch className="size-4" /> Avez-vous ce médicament ? ({pending} en attente)
      </h2>
      <div className="mt-3 grid gap-2">
        {questions.map((q) => (
          <QuestionRow key={q.id} q={q} />
        ))}
      </div>
    </section>
  );
}

function QuestionRow({ q }: { q: MedicineQuestion }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(q.price ? String(q.price) : "");
  const answer = useMutation({
    mutationFn: (status: "available" | "unavailable") =>
      answerMedicine(q.id, {
        status,
        price: status === "available" && price ? Number(price) : undefined,
      }),
    onSuccess: () => {
      toast.success("Réponse envoyée au patient");
      qc.invalidateQueries({ queryKey: ["pharmacy-dashboard"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <b className="text-sunu-dark">{q.medicine}</b>
        {q.note && <span className="text-sunu-ink/60"> · {q.note}</span>}
        <span className="block text-[11px] text-sunu-ink/50">
          {q.pharmacy} · reçue{" "}
          {formatDateTime(q.created_at, { hour: "2-digit", minute: "2-digit" })}
          {q.status !== "pending" &&
            ` · répondu : ${q.status === "available" ? "disponible" : "indisponible"}`}
        </span>
      </div>
      <input
        inputMode="numeric"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Prix (F)"
        aria-label="Prix"
        className="w-24 rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-xs"
      />
      <button
        onClick={() => answer.mutate("available")}
        disabled={answer.isPending}
        className="rounded-lg bg-sunu-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Disponible
      </button>
      <button
        onClick={() => answer.mutate("unavailable")}
        disabled={answer.isPending}
        className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 disabled:opacity-50"
      >
        Indisponible
      </button>
    </div>
  );
}
