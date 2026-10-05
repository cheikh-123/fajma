/** « Télécharger mon dossier (PDF) » : tout le dossier médical en un document, généré sur l'appareil. */
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getMedicalRecord } from "@/api/followup";
import { downloadPdf } from "@/lib/download";

export function MedicalRecordPdfButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const [data, { buildMedicalRecordPdf }] = await Promise.all([
            getMedicalRecord(),
            import("@/lib/medical-record-pdf"),
          ]);
          const slug = data.patient.full_name
            .normalize("NFD")
            .replace(/[^\w]+/g, "-")
            .toLowerCase();
          downloadPdf(await buildMedicalRecordPdf(data), `dossier-medical-${slug}.pdf`);
          toast.success("Dossier médical téléchargé");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
      Télécharger mon dossier (PDF)
    </button>
  );
}
