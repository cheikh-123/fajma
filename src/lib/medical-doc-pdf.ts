/** Certificats, arrêts de travail et courriers en PDF (générés dans le navigateur, avec QR de vérification). */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { IssuedDocument } from "@/api/documents";
import {
  GREEN,
  M,
  MUTED,
  PAGE,
  SIGNATURE_BLOCK_HEIGHT,
  WIDTH,
  drName,
  drawFooter,
  drawIssuerHeader,
  drawSignatureBlock,
  frDate,
  textAt,
  textRight,
  wrap,
  type Fonts,
} from "@/lib/pdf-common";

function mainText(d: IssuedDocument): string {
  const doctor = drName(d.issuer.full_name || d.doctor.full_name);
  const who =
    d.subject_name + (d.subject_birth_date ? ` (né(e) le ${frDate(d.subject_birth_date)})` : "");
  if (d.kind === "arret_travail") {
    const days =
      Math.round((new Date(d.end_date!).getTime() - new Date(d.start_date!).getTime()) / 86400000) +
      1;
    return (
      `Je soussigné(e), ${doctor}, certifie avoir examiné ce jour ${who} ` +
      `et prescris un arrêt de travail de ${days} jour(s), du ${frDate(d.start_date!)} au ${frDate(d.end_date!)} inclus.` +
      (d.body ? `\n\n${d.body}` : "")
    );
  }
  if (d.kind === "courrier") return d.body;
  return `Je soussigné(e), ${doctor}, certifie avoir examiné ce jour ${who}.\n\n${d.body}`;
}

export async function buildIssuedDocumentPdf(d: IssuedDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind_label} ${d.reference}`);
  pdf.setAuthor(drName(d.issuer.full_name || d.doctor.full_name));
  pdf.setCreator("Fajma");
  const page = pdf.addPage(PAGE);
  const f: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  let y = drawIssuerHeader(page, d.issuer, f) - 20;
  textRight(page, `Réf. ${d.reference}`, y, 9, f.bold);
  y -= 34;
  const title = d.kind_label.toUpperCase();
  textAt(page, title, M + (WIDTH - f.bold.widthOfTextAtSize(title, 15)) / 2, y, 15, f.bold, GREEN);
  y -= 34;
  if (d.kind === "courrier" && d.recipient) {
    textAt(page, `À l'attention de : ${d.recipient}`, M, y, 10.5, f.bold);
    y -= 16;
    textAt(page, `Concerne : ${d.subject_name}`, M, y, 10.5, f.font);
    y -= 28;
  }
  const bottom = 70 + SIGNATURE_BLOCK_HEIGHT + 20;
  for (const line of wrap(mainText(d), f.font, 11, WIDTH)) {
    if (y < bottom + 20) break;
    textAt(page, line, M, y, 11, f.font);
    y -= 17;
  }
  if (d.kind !== "courrier") {
    y -= 10;
    for (const line of wrap(
      "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.",
      f.italic,
      9,
      WIDTH,
    )) {
      textAt(page, line, M, y, 9, f.italic, MUTED);
      y -= 12;
    }
  }

  await drawSignatureBlock(pdf, page, f, {
    issuer: d.issuer,
    reference: d.reference,
    verifyUrl: d.verify_url,
    createdAt: d.created_at,
    top: Math.min(y - 10, bottom - 10),
  });
  drawFooter(
    page,
    f,
    "Document médical électronique délivré via Fajma. Scannez le QR code pour vérifier son authenticité ; toute modification le rend invalide.",
  );
  return pdf.save();
}
