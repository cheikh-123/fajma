/**
 * « Dossier au format international (FHIR) » : le même dossier dans le langage que comprennent les hôpitaux
 * et les autres logiciels de santé. Permet de transmettre son dossier ailleurs sans ressaisie, et de ne
 * jamais être prisonnier de Fajma.
 */
import { FileJson, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";

export function FhirExportButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const bundle = await api.get<{ entry: unknown[] }>("/patient/medical-record/fhir");
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "dossier-fajma-fhir.json";
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`Dossier exporté (${bundle.entry.length} éléments, format FHIR R4)`);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      title="Format HL7 FHIR R4 : lisible par les hôpitaux et les autres logiciels de santé"
      className="inline-flex items-center gap-2 rounded-xl border border-sunu-line px-4 py-2.5 text-sm font-semibold text-sunu-ink/80 hover:border-sunu-green hover:text-sunu-green disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileJson className="size-4" />}
      Format international (FHIR)
    </button>
  );
}
