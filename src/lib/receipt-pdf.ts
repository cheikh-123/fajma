/** Reçu de paiement en PDF, généré dans le navigateur à partir des données de l'API. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Receipt } from "@/api/types";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { drawFajmaLogo } from "@/lib/pdf-common";

// Vert du drapeau (#00853f).
const BLUE = rgb(0, 0.522, 0.247);
const INK = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.45, 0.5, 0.56);

// Les polices standard du PDF ne couvrent pas certains caractères (espaces fines de toLocaleString).
const NON_BREAKING_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, "g");
const clean = (s: string) => s.replace(NON_BREAKING_SPACES, " ");

export async function buildReceiptPdf(r: Receipt): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (s: string, x: number, y: number, size = 11, f = font, color = INK) =>
    page.drawText(clean(s), { x, y, size, font: f, color });

  drawFajmaLogo(page, bold, 50, 774, 30);
  text("Reçu de paiement", 50, 755, 14, bold);
  if (r.receipt_number) text(`Reçu n° ${r.receipt_number}`, 380, 795, 10, bold);
  text(`Référence : ${r.reference}`, 380, 780, 10, font, MUTED);
  text(
    `Payé le : ${formatDate(r.paid_at, { day: "2-digit", month: "long", year: "numeric" })}`,
    380,
    765,
    10,
    font,
    MUTED,
  );

  page.drawLine({
    start: { x: 50, y: 735 },
    end: { x: 545, y: 735 },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.92),
  });

  const rows: [string, string][] = [
    ["Praticien", r.doctor_name + (r.doctor_specialty ? ` — ${r.doctor_specialty}` : "")],
    ["Adresse", r.doctor_address || "—"],
    ["Patient", r.patient_name],
    ["Payé par", r.payer_name],
    ["Prestation", r.consultation],
    [
      "Date du rendez-vous",
      formatDateTime(r.appointment_at, { dateStyle: "long", timeStyle: "short" }),
    ],
    ["Moyen de paiement", r.method],
  ];
  // Feuille de soins : informations utiles à l'organisme de prise en charge.
  if (r.insurance) {
    rows.push(["Organisme", `${r.insurance.insurer} — n° ${r.insurance.member_number}`]);
    rows.push([
      "Tarif de la consultation",
      `${(r.full_price ?? r.amount).toLocaleString("fr-FR")} FCFA`,
    ]);
    rows.push([
      "Prise en charge",
      r.insurance.tiers_payant && r.insurance.insurer_share != null
        ? `${r.insurance.coverage_percent} % en tiers payant (${r.insurance.insurer_share.toLocaleString("fr-FR")} FCFA facturés à l'organisme)`
        : `${r.insurance.coverage_percent} % — à demander à l'organisme avec ce reçu`,
    ]);
  }
  let y = 705;
  for (const [label, value] of rows) {
    text(label, 50, y, 10, font, MUTED);
    text(value, 200, y, 11);
    y -= 24;
  }

  page.drawRectangle({ x: 50, y: y - 40, width: 495, height: 44, color: rgb(0.93, 0.96, 1) });
  text("Montant réglé", 65, y - 24, 12, bold);
  text(
    `${r.amount.toLocaleString("fr-FR")} ${r.currency === "XOF" ? "FCFA" : r.currency}`,
    400,
    y - 24,
    14,
    bold,
    BLUE,
  );

  text("Ce reçu atteste du paiement de la prestation ci-dessus via Fajma.", 50, 90, 9, font, MUTED);
  text("Il ne constitue pas une facture fiscale du praticien.", 50, 76, 9, font, MUTED);
  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
