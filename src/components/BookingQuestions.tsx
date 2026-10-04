/**
 * Questions du médecin affichées pendant la réservation (fiche du médecin). Toujours facultatives :
 * le patient peut réserver sans répondre, ou compléter plus tard depuis son espace.
 */
import { ClipboardList } from "lucide-react";
import type { Question } from "@/api/types";

export type Answers = Record<string, string | boolean>;

export function BookingQuestions({
  questions,
  value,
  onChange,
  doctorName,
}: {
  questions: Question[];
  value: Answers;
  onChange: (next: Answers) => void;
  doctorName: string;
}) {
  if (!questions.length) return null;
  const set = (id: string, v: string | boolean | undefined) => {
    const next = { ...value };
    if (v === undefined || v === "") delete next[id];
    else next[id] = v;
    onChange(next);
  };
  const field =
    "mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green";
  return (
    <fieldset className="mt-4 rounded-xl border border-sunu-line bg-sunu-surface p-3">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        <span className="inline-flex items-center gap-1.5">
          <ClipboardList className="size-3.5" /> Questions du médecin
        </span>
      </legend>
      <p className="text-xs text-sunu-ink/60">
        Facultatif : vos réponses aident {doctorName} à préparer la consultation. Vous pouvez aussi
        répondre plus tard depuis votre espace.
      </p>
      <div className="mt-3 grid gap-3">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="text-sm font-medium text-sunu-dark">{q.label}</p>
            {q.type === "yesno" ? (
              <div className="mt-1 flex gap-2" role="radiogroup" aria-label={q.label}>
                {[
                  [true, "Oui"],
                  [false, "Non"],
                ].map(([v, label]) => (
                  <button
                    key={String(label)}
                    type="button"
                    role="radio"
                    aria-checked={value[q.id] === v}
                    onClick={() => set(q.id, value[q.id] === v ? undefined : (v as boolean))}
                    className={`rounded-lg border px-4 py-1.5 text-sm font-semibold ${value[q.id] === v ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line bg-sunu-card text-sunu-ink/70"}`}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            ) : q.type === "choice" ? (
              <select
                aria-label={q.label}
                value={(value[q.id] as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                className={field}
              >
                <option value="">— Pas de réponse —</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={q.label}
                value={(value[q.id] as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                maxLength={1000}
                className={field}
              />
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
