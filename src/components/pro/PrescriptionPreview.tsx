/**
 * Aperçu d'une ordonnance (spécimen) avec l'en-tête, la signature et le cachet actuels du médecin :
 * il voit exactement ce que recevront ses patients et leurs pharmaciens.
 */
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getPrescriptionHeader } from "@/api/doctor";
import type { PrescriptionDetail } from "@/api/types";

export function PrescriptionPreview({
  fullName,
  specialty,
}: {
  fullName: string;
  specialty: string | null;
}) {
  const { data: header } = useQuery({
    queryKey: ["pro-prescription-header"],
    queryFn: getPrescriptionHeader,
  });
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!header) return;
    // Fenêtre ouverte tout de suite (sinon bloquée comme fenêtre surgissante), remplie ensuite.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const sample: PrescriptionDetail = {
        id: "00000000-0000-0000-0000-000000000000",
        reference: "SPECIMEN",
        content: "",
        items: [
          {
            name: "Paracétamol",
            dosage: "1 g",
            posology: "1 comprimé 3 fois par jour si douleur ou fièvre",
            duration: "5 jours",
            quantity: "1 boîte",
            non_substitutable: false,
          },
          {
            name: "Amoxicilline",
            dosage: "500 mg",
            posology: "1 gélule matin, midi et soir",
            duration: "7 jours",
            quantity: "2 boîtes",
            non_substitutable: false,
          },
        ],
        renewals: 0,
        instructions: "Exemple : bien s'hydrater, revenir si la fièvre persiste au-delà de 48 h.",
        valid_until: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
        created_at: now,
        patient_id: "",
        doctor: null,
        patient: {
          full_name: "Patient Exemple",
          birth_date: "1985-06-15",
          sex: "F",
          weight_kg: 64,
          city: null,
          phone: null,
          account_holder: null,
        },
        issuer: {
          full_name: fullName,
          specialty,
          title: header.professional_title || null,
          order_number: header.order_number || null,
          practice_name: header.practice_name || null,
          address: header.address || null,
          city: header.city || null,
          phone: header.practice_phone || null,
          signature: header.signature,
          stamp: header.stamp,
        },
        verify_url: `${window.location.origin}/verifier/SPECIMEN`,
      };
      // Bibliothèque PDF chargée seulement à la demande d'aperçu (allège l'espace médecin).
      const [{ degrees, PDFDocument, rgb, StandardFonts }, { buildPrescriptionPdf }] =
        await Promise.all([import("pdf-lib"), import("@/lib/prescription-pdf")]);
      const pdf = await PDFDocument.load(await buildPrescriptionPdf(sample));
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (const page of pdf.getPages()) {
        page.drawText("SPÉCIMEN", {
          x: 130,
          y: 300,
          size: 90,
          font,
          color: rgb(0.89, 0.106, 0.137),
          opacity: 0.18,
          rotate: degrees(35),
        });
      }
      const url = URL.createObjectURL(
        new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" }),
      );
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={!header || busy}
      className="mt-4 flex items-center gap-1.5 rounded-lg border border-sunu-green px-4 py-2 text-sm font-semibold text-sunu-green hover:bg-sunu-green-soft disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Aperçu de
      mon ordonnance
    </button>
  );
}
