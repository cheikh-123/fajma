/**
 * « Feuille de soins » : le document à remettre à son organisme (IPM, mutuelle, CMU, assurance) pour être
 * remboursé. N'apparaît que si le médecin a codé les actes de la consultation.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { getCareSheet } from "@/api/acts";
import { downloadPdf } from "@/lib/download";

export function CareSheetButton({ appointmentId }: { appointmentId: string }) {
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["care-sheet", appointmentId],
    queryFn: () => getCareSheet(appointmentId),
    retry: false,
    staleTime: 300_000,
  });
  if (!data || data.acts.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sunu-line pt-3 text-xs">
      <span className="text-sunu-ink/60">
        Base de remboursement{" "}
        <b className="text-sunu-dark">{data.base_amount.toLocaleString("fr-FR")} F</b>
        {data.coverage_percent
          ? ` · ${data.insurer ?? "votre organisme"} rembourse ${data.reimbursed_amount.toLocaleString("fr-FR")} F`
          : " · aucune assurance déclarée pour cette consultation"}
      </span>
      <button
        onClick={async () => {
          setBusy(true);
          try {
            const { buildCareSheetPdf } = await import("@/lib/care-sheet-pdf");
            downloadPdf(
              await buildCareSheetPdf(data),
              `feuille-de-soins-${data.appointment_id.slice(0, 8)}.pdf`,
            );
            toast.success("Feuille de soins téléchargée");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-sunu-line px-2.5 py-1.5 font-semibold text-sunu-green hover:border-sunu-green disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
        Feuille de soins
      </button>
    </div>
  );
}
