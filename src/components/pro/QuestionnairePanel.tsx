/** Espace médecin : questions posées au patient avant la consultation (par défaut ou par motif). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getMyQuestionnaires, saveQuestionnaire, type QuestionDraft } from "@/api/doctor";

const TYPE_LABELS: Record<QuestionDraft["type"], string> = {
  yesno: "Oui / non",
  choice: "Choix",
  text: "Texte libre",
};

export function QuestionnairePanel() {
  const { data } = useQuery({ queryKey: ["pro-questionnaires"], queryFn: getMyQuestionnaires });
  const [target, setTarget] = useState("");
  if (!data) return null;
  const current = target
    ? (data.types.find((t) => t.id === target)?.questions ?? [])
    : data.default;
  return (
    <section
      aria-label="Questionnaire avant consultation"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <ClipboardList className="size-4" /> Questionnaire patient
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Le patient y répond après avoir réservé ; vous lisez ses réponses dans l'agenda.
      </p>
      {data.types.length > 0 && (
        <select
          aria-label="Questionnaire à modifier"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-3 w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
        >
          <option value="">Par défaut (tous les motifs)</option>
          {data.types.map((t) => (
            <option key={t.id} value={t.id}>
              Motif : {t.name}
            </option>
          ))}
        </select>
      )}
      {/* key : l'éditeur repart des questions enregistrées quand on change de questionnaire. */}
      <Editor key={target} typeId={target || undefined} initial={current} />
    </section>
  );
}

function Editor({ typeId, initial }: { typeId?: string; initial: QuestionDraft[] }) {
  const qc = useQueryClient();
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial);
  const [dirty, setDirty] = useState(false);
  const update = (i: number, patch: Partial<QuestionDraft>) => {
    setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () => saveQuestionnaire({ data: { consultation_type_id: typeId, questions } }),
    onSuccess: (res) => {
      qc.setQueryData(["pro-questionnaires"], res);
      setDirty(false);
      toast.success("Questionnaire enregistré");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-3 space-y-2">
      {questions.map((q, i) => (
        <div key={i} className="rounded-lg border border-sunu-line p-2">
          <div className="flex gap-1.5">
            <input
              aria-label={`Question ${i + 1}`}
              value={q.label}
              placeholder="Intitulé de la question"
              onChange={(e) => update(i, { label: e.target.value })}
              className="min-w-0 flex-1 rounded border border-sunu-line px-2 py-1 text-sm"
            />
            <button
              aria-label="Supprimer la question"
              onClick={() => {
                setQuestions(questions.filter((_, j) => j !== i));
                setDirty(true);
              }}
              className="text-sunu-ink/40 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label={`Type de la question ${i + 1}`}
              value={q.type}
              onChange={(e) => update(i, { type: e.target.value as QuestionDraft["type"] })}
              className="rounded border border-sunu-line px-1.5 py-0.5"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              obligatoire
            </label>
          </div>
          {q.type === "choice" && (
            <input
              aria-label={`Choix de la question ${i + 1}`}
              value={(q.options ?? []).join(" ; ")}
              placeholder="Choix séparés par ;"
              onChange={(e) =>
                update(i, { options: e.target.value.split(";").map((o) => o.trim()) })
              }
              className="mt-1.5 w-full rounded border border-sunu-line px-2 py-1 text-xs"
            />
          )}
        </div>
      ))}
      <button
        onClick={() => {
          setQuestions([...questions, { label: "", type: "yesno", required: false }]);
          setDirty(true);
        }}
        disabled={questions.length >= 15}
        className="inline-flex items-center gap-1 text-sm font-semibold text-sunu-green disabled:opacity-40"
      >
        <Plus className="size-4" /> Ajouter une question
      </button>
      {dirty && (
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer le questionnaire
        </button>
      )}
    </div>
  );
}
