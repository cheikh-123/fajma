/**
 * Ordonnance en PDF (générée dans le navigateur). Mentions : médecin (nom, spécialité, n° d'Ordre),
 * lieu d'exercice, patient (nom, âge, sexe, poids), médicaments, renouvellements, validité, date et lieu,
 * signature et cachet, référence et QR code de vérification. Plusieurs pages si la liste est longue.
 */
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import type { PrescriptionDetail } from "@/api/types";
import {
  GREEN,
  INK,
  LINE,
  M,
  MUTED,
  PAGE,
  RED,
  SIGNATURE_BLOCK_HEIGHT,
  WASH,
  WIDTH,
  drName,
  drawFooter,
  drawIssuerHeader,
  spacedTitle,
  drawSignatureBlock,
  frDate,
  textAt,
  textRight,
  wrap,
  type Fonts,
} from "@/lib/pdf-common";
import { patientLine, renewalText } from "@/lib/prescription-text";

export { patientLine, renewalText };

const FOOTER_TOP = 70;

export async function buildPrescriptionPdf(p: PrescriptionDetail): Promise<Uint8Array> {
  const reference = p.reference ?? `ORD-${p.id.slice(0, 8).toUpperCase()}`;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Ordonnance ${reference}`);
  pdf.setAuthor(drName(p.issuer.full_name));
  pdf.setCreator("Fajma");
  const f: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage(PAGE);
    pages.push(page);
    y = drawIssuerHeader(page, p.issuer, f) - 24;
    if (pages.length > 1) {
      // Nom du patient sur chaque page : les feuilles peuvent être séparées.
      textAt(
        page,
        `Ordonnance ${reference} (suite) - ${p.patient?.full_name ?? ""}`,
        M,
        y,
        9,
        f.bold,
        MUTED,
      );
      y -= 20;
    }
  };
  /** Place pour `height` points ; sinon page suivante (le bloc signature va sur la dernière page). */
  const ensure = (height: number) => {
    if (y - height < FOOTER_TOP + 20) newPage();
  };

  newPage();
  // Titre et référence
  spacedTitle(page, "ORDONNANCE", M, y, 15, f.bold);
  textRight(page, `Réf. ${reference}`, y + 4, 9, f.bold);
  textRight(page, `Délivrée le ${frDate(p.created_at)}`, y - 8, 8.5, f.font, MUTED);
  y -= 30;

  // Patient
  const patient = p.patient;
  page.drawRectangle({ x: M, y: y - 34, width: WIDTH, height: 46, color: WASH });
  textAt(page, "PATIENT", M + 12, y, 7.5, f.bold, GREEN);
  textAt(page, patient?.full_name ?? "—", M + 12, y - 14, 11.5, f.bold);
  const meta = patient ? patientLine(patient, p.created_at) : "";
  if (meta) textAt(page, meta, M + 12, y - 27, 8.5, f.font, MUTED);
  y -= 62;

  // Médicaments
  if (p.items.length) {
    p.items.forEach((it, i) => {
      const head = `${i + 1}. ${[it.name, it.dosage].filter(Boolean).join(" ")}`;
      const posology = wrap(it.posology, f.font, 10, WIDTH - 18);
      const extra = [
        it.duration ? `Durée : ${it.duration}` : null,
        it.quantity ? `Quantité : ${it.quantity}` : null,
      ]
        .filter(Boolean)
        .join("   ·   ");
      ensure(18 + posology.length * 13 + (extra ? 13 : 0) + 10);
      textAt(page, head, M, y, 11.5, f.bold);
      if (it.non_substitutable) {
        const w = f.bold.widthOfTextAtSize(head, 11.5);
        textAt(page, "NON SUBSTITUABLE", M + w + 10, y + 1, 7.5, f.bold, RED);
      }
      y -= 15;
      for (const line of posology) {
        textAt(page, line, M + 18, y, 10, f.font);
        y -= 13;
      }
      if (extra) {
        textAt(page, extra, M + 18, y, 9, f.font, MUTED);
        y -= 13;
      }
      y -= 10;
    });
  } else {
    // Anciennes ordonnances : texte libre.
    for (const line of wrap(p.content, f.font, 11, WIDTH)) {
      ensure(16);
      textAt(page, line, M, y, 11, f.font);
      y -= 16;
    }
  }

  ensure(30);
  y -= 4;
  page.drawLine({
    start: { x: M, y: y + 8 },
    end: { x: M + WIDTH, y: y + 8 },
    thickness: 0.6,
    color: LINE,
  });
  textAt(page, renewalText(p.renewals), M, y - 6, 9.5, f.bold);
  if (p.valid_until) {
    textRight(page, `Valable jusqu'au ${frDate(p.valid_until)}`, y - 6, 9.5, f.bold);
  }
  y -= 26;

  if (p.instructions) {
    const lines = wrap(`Conseils : ${p.instructions}`, f.font, 9.5, WIDTH - 24);
    ensure(lines.length * 13 + 20);
    page.drawRectangle({
      x: M,
      y: y - lines.length * 13 + 4,
      width: WIDTH,
      height: lines.length * 13 + 12,
      color: WASH,
    });
    for (const line of lines) {
      textAt(page, line, M + 12, y - 2, 9.5, f.font, INK);
      y -= 13;
    }
    y -= 16;
  }

  // Signature, cachet, QR : sur la dernière page, en bas.
  ensure(SIGNATURE_BLOCK_HEIGHT);
  await drawSignatureBlock(pdf, page, f, {
    issuer: p.issuer,
    reference,
    verifyUrl: p.verify_url,
    createdAt: p.created_at,
    top: Math.min(y, FOOTER_TOP + SIGNATURE_BLOCK_HEIGHT + 10),
  });

  const footer =
    "Ordonnance électronique délivrée via Fajma. À présenter en pharmacie avec une pièce d'identité. " +
    "Scannez le QR code pour vérifier son authenticité ; toute modification la rend invalide.";
  pages.forEach((pg, i) =>
    drawFooter(pg, f, footer, pages.length > 1 ? `${i + 1}/${pages.length}` : undefined),
  );
  return pdf.save();
}
