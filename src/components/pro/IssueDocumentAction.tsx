/** Agenda du médecin : rédiger un certificat, un arrêt de travail ou un courrier pour ce rendez-vous. */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { issueDocument, type IssuedDocumentKind } from "@/api/documents";
import { downloadPdf } from "@/lib/download";

const KINDS: { value: IssuedDocumentKind; label: string; template: string }[] = [
  {
    value: "certificat",
    label: "Certificat médical",
    template: "Son état de santé ne présente pas de contre-indication à ",
  },
  { value: "arret_travail", label: "Arrêt de travail", template: "" },
  {
    value: "aptitude",
    label: "Aptitude au sport",
    template:
      "Son examen clinique ne révèle pas de contre-indication à la pratique du sport suivant, y compris en compétition : ",
  },
  {
    value: "courrier",
    label: "Courrier à un confrère",
    template:
      "Cher confrère,\n\nJe vous adresse ce patient pour avis concernant \n\nJe vous remercie de votre aide.\nBien confraternellement.",
  },
];
const today = () => new Date().toISOString().slice(0, 10);

export function IssueDocumentAction({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IssuedDocumentKind>("certificat");
  const [body, setBody] = useState(KINDS[0].template);
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [recipient, setRecipient] = useState("");
  const issue = useMutation({
    mutationFn: () =>
      issueDocument({
        data: {
          appointment_id: appointmentId,
          kind,
          body,
          start_date: kind === "arret_travail" ? start : undefined,
          end_date: kind === "arret_travail" ? end : undefined,
          recipient: kind === "courrier" ? recipient : undefined,
        },
      }),
    onSuccess: async (doc) => {
      toast.success(`${doc.kind_label} enregistré : le patient le retrouve dans son dossier.`);
      const { buildIssuedDocumentPdf } = await import("@/lib/medical-doc-pdf");
      downloadPdf(await buildIssuedDocumentPdf(doc), `${doc.kind}-${doc.reference}.pdf`);
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 ml-3 inline-flex items-center gap-1 text-xs font-semibold text-sunu-green hover:underline"
      >
        <FileSignature className="size-3" /> Rédiger un document
      </button>
    );
  }
  const field = "w-full rounded border border-sunu-line px-2 py-1 text-xs";
  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-sunu-line bg-sunu-surface/60 p-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        issue.mutate();
      }}
    >
      <select
        aria-label="Type de document"
        value={kind}
        onChange={(e) => {
          const k = e.target.value as IssuedDocumentKind;
          setKind(k);
          setBody(KINDS.find((x) => x.value === k)!.template);
        }}
        className={field}
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {kind === "arret_travail" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-0.5">
            Du
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          <label className="grid gap-0.5">
            Au (inclus)
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={field}
            />
          </label>
        </div>
      )}
      {kind === "courrier" && (
        <input
          required
          aria-label="Destinataire"
          placeholder="Destinataire (ex. Dr Sy, cardiologue, Hôpital Principal)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className={field}
        />
      )}
      <textarea
        aria-label="Contenu du document"
        rows={kind === "courrier" ? 7 : 3}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === "arret_travail"
            ? "Mentions complémentaires (facultatif) — pas de diagnostic : ce document est remis à l'employeur."
            : ""
        }
        className={field}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={issue.isPending}
          className="flex items-center gap-1 rounded bg-sunu-green px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {issue.isPending && <Loader2 className="size-3 animate-spin" />} Signer et générer le PDF
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sunu-ink/50">
          Annuler
        </button>
      </div>
    </form>
  );
}
