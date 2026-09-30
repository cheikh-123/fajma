/**
 * Assistant de prise de notes : dictée vocale (reconnaissance du navigateur, en français) puis brouillon
 * de compte-rendu rédigé par l'IA. Le médecin relit et corrige toujours avant d'enregistrer.
 */
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { draftRecordWithAi } from "@/api/doctor";

type Draft = { summary: string; diagnosis: string; treatment: string };

// Reconnaissance vocale du navigateur (Chrome, Edge, Android) : types minimaux.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function createRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
      .webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function AiNotesAssistant({
  appointmentId,
  current,
  onDraft,
}: {
  appointmentId: string;
  current: Draft;
  onDraft: (d: Draft) => void;
}) {
  const [notes, setNotes] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => createRecognition() !== null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  const toggleDictation = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = createRecognition();
    if (!r) return;
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else partial += res[0]!.transcript;
      }
      if (finalText) setNotes((n) => `${n}${n && !n.endsWith(" ") ? " " : ""}${finalText.trim()}`);
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed")
        toast.error("Autorisez l'accès au micro dans votre navigateur pour dicter.");
      else if (e.error !== "no-speech" && e.error !== "aborted")
        toast.error("Dictée interrompue : réessayez.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const draft = useMutation({
    mutationFn: () => draftRecordWithAi(appointmentId, notes),
    onSuccess: (d) => {
      const filled = current.summary || current.diagnosis || current.treatment;
      if (filled && !window.confirm("Remplacer le compte-rendu déjà saisi par le brouillon ?"))
        return;
      onDraft({ summary: d.summary, diagnosis: d.diagnosis, treatment: d.treatment });
      toast.success(
        d.source === "ia"
          ? "Brouillon rédigé par l'IA : relisez-le avant d'enregistrer."
          : "Notes rangées dans le compte-rendu (IA non configurée) : relisez avant d'enregistrer.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mb-3 rounded-xl border border-sunu-line bg-sunu-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sunu-dark">
          <Sparkles className="size-4 text-sunu-green" /> Assistant de prise de notes
        </p>
        {supported ? (
          <button
            type="button"
            onClick={toggleDictation}
            aria-pressed={listening}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${listening ? "bg-red-600 text-white" : "border border-sunu-line text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"}`}
          >
            {listening ? (
              <>
                <Square className="size-3.5" /> Arrêter la dictée
              </>
            ) : (
              <>
                <Mic className="size-3.5" /> Dicter
              </>
            )}
          </button>
        ) : (
          <span className="text-[11px] text-sunu-ink/50">
            Dictée vocale indisponible sur ce navigateur (utilisez Chrome) : tapez vos notes.
          </span>
        )}
      </div>
      <textarea
        value={listening && interim ? `${notes} ${interim}` : notes}
        onChange={(e) => setNotes(e.target.value)}
        readOnly={listening}
        placeholder="Notes de consultation, en vrac : symptômes, examen, tension, conclusion, traitement, suivi…"
        aria-label="Notes de consultation"
        className="mt-2 min-h-24 w-full rounded-lg border border-sunu-line bg-sunu-card p-3 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-sunu-ink/55">
          Ne dictez pas le nom ni le numéro du patient. Le brouillon est à relire : l'assistant peut
          se tromper, il ne doit rien ajouter à vos notes.
        </p>
        <button
          type="button"
          onClick={() => draft.mutate()}
          disabled={notes.trim().length < 20 || draft.isPending || listening}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {draft.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Rédiger le compte-rendu
        </button>
      </div>
    </div>
  );
}
