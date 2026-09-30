/** Espace médecin : prescrire des analyses lors d'une consultation (le patient choisit ensuite son laboratoire). */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { prescribeLabs } from "@/api/labs";

const COMMON = [
  "NFS",
  "Glycémie à jeun",
  "HbA1c",
  "Créatininémie",
  "Bilan lipidique",
  "Goutte épaisse (paludisme)",
  "Test de grossesse (β-HCG)",
  "ECBU",
];

export function LabOrderAction({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [tests, setTests] = useState("");
  const [instructions, setInstructions] = useState("");
  const [urgent, setUrgent] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      prescribeLabs(appointmentId, { tests, instructions: instructions || undefined, urgent }),
    onSuccess: (o) => {
      toast.success(
        `Analyses prescrites (réf. ${o.reference}) : le patient choisit son laboratoire`,
      );
      setOpen(false);
      setTests("");
      setInstructions("");
    },
    onError: (e) => toast.error(e.message),
  });
  const add = (t: string) => setTests(tests ? `${tests}, ${t}` : t);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 mr-2 inline-flex items-center gap-1 text-xs font-semibold text-sunu-green hover:underline"
      >
        <FlaskConical className="size-3.5" /> Prescrire des analyses
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
      className="mt-2 grid gap-2 rounded-lg border border-sunu-line p-3 text-xs"
    >
      <div className="flex flex-wrap gap-1">
        {COMMON.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => add(t)}
            className="rounded-md border border-sunu-line px-2 py-0.5 hover:border-sunu-green"
          >
            + {t}
          </button>
        ))}
      </div>
      <textarea
        required
        minLength={3}
        rows={2}
        value={tests}
        onChange={(e) => setTests(e.target.value)}
        placeholder="Analyses demandées"
        aria-label="Analyses demandées"
        className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={300}
        placeholder="Consignes (ex. à jeun depuis 12 h)"
        aria-label="Consignes"
        className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="accent-sunu-green"
        />{" "}
        Urgent
      </label>
      <div className="flex gap-2">
        <button
          disabled={send.isPending}
          className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          Prescrire
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-sunu-ink/60">
          Annuler
        </button>
      </div>
    </form>
  );
}
