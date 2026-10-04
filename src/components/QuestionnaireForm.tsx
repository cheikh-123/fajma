/** Espace patient : questionnaire du médecin à remplir avant la consultation. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { answerQuestionnaire } from "@/api/appointments";
import type { PatientAppointment } from "@/api/types";

export function QuestionnaireForm({ appt }: { appt: PatientAppointment }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>(appt.answers ?? {});
  const save = useMutation({
    mutationFn: () => answerQuestionnaire({ data: { id: appt.id, answers } }),
    onSuccess: () => {
      toast.success("Réponses envoyées au médecin");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (!appt.questionnaire?.length || (!appt.can_answer && !appt.answered_at)) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!appt.can_answer}
        className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${appt.answered_at ? "bg-sunu-teal/10 text-sunu-teal" : "bg-amber-100 text-amber-800"}`}
      >
        <ClipboardList className="size-3.5" />
        {appt.answered_at
          ? "Questionnaire envoyé" + (appt.can_answer ? " · modifier" : "")
          : "Questionnaire à remplir avant la consultation"}
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-sunu-line bg-sunu-surface/60 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-xs text-sunu-ink/60">
        Facultatif : répondez aux questions que vous souhaitez. Vos réponses ne sont visibles que
        par ce médecin.
      </p>
      {appt.questionnaire.map((q) => (
        <fieldset key={q.id} className="text-sm">
          <legend className="font-medium text-sunu-dark">{q.label}</legend>
          {q.type === "yesno" && (
            <div className="mt-1 flex gap-4">
              {[
                [true, "Oui"],
                [false, "Non"],
              ].map(([value, label]) => (
                <label key={String(value)} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === value}
                    onChange={() => setAnswers({ ...answers, [q.id]: value as boolean })}
                  />
                  {label as string}
                </label>
              ))}
            </div>
          )}
          {q.type === "choice" && (
            <select
              aria-label={q.label}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2"
            >
              <option value="">Choisir…</option>
              {q.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
          {q.type === "text" && (
            <textarea
              aria-label={q.label}
              maxLength={1000}
              rows={2}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2"
            />
          )}
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Envoyer mes réponses
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-sunu-line px-4 py-2 text-sm"
        >
          Plus tard
        </button>
      </div>
    </form>
  );
}
