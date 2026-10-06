/**
 * Feuille de soins en PDF : le document que le patient remet à son organisme (IPM, mutuelle, CMU,
 * assurance privée) pour être remboursé. Même en-tête et même bas de page que l'ordonnance.
 *
 * Contenu attendu par un organisme : identité du praticien et son n° d'Ordre, identité du patient et son
 * n° d'adhérent, date des soins, actes codés (lettre-clé et coefficient), base de remboursement, somme
 * payée et part prise en charge.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { CareSheet } from "@/api/acts";
import {
  GREEN,
  INK,
  LINE,
  M,
  MUTED,
  PAGE,
  WIDTH,
  drName,
  drawFooter,
  drawIssuerHeader,
  frDate,
  spacedTitle,
  textAt,
  textRight,
  type Fonts,
} from "@/lib/pdf-common";

const money = (n: number) => `${n.toLocaleString("fr-FR")} F`;

export async function buildCareSheetPdf(sheet: CareSheet): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Feuille de soins — ${sheet.patient.full_name}`);
  pdf.setAuthor(drName(sheet.doctor.full_name));
  const f: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const page = pdf.addPage(PAGE);
  let y = drawIssuerHeader(
    page,
    {
      full_name: sheet.doctor.full_name,
      specialty: sheet.doctor.specialty,
      title: null,
      order_number: sheet.doctor.order_number,
      replacing: null,
      practice_name: null,
      address: sheet.doctor.address,
      city: sheet.doctor.city,
      phone: sheet.doctor.phone,
      signature: null,
      stamp: null,
    },
    f,
  );

  y -= 18;
  spacedTitle(page, "FEUILLE DE SOINS", M, y, 13, f.bold, GREEN);
  textRight(page, frDate(sheet.date), y, 9.5, f.font, MUTED);
  y -= 26;

  // Patient et prise en charge
  const left = (label: string, value: string | null) => {
    if (!value) return;
    textAt(page, label, M, y, 8.5, f.font, MUTED);
    textAt(page, value, M + 120, y, 10, f.bold, INK);
    y -= 15;
  };
  left("Patient", sheet.patient.full_name);
  left("Né(e) le", sheet.patient.birth_date ? frDate(sheet.patient.birth_date) : null);
  left("Titulaire du compte", sheet.patient.account_holder);
  left("Organisme", sheet.insurer);
  left("N° d'adhérent", sheet.member_number);
  left("Taux de prise en charge", sheet.coverage_percent ? `${sheet.coverage_percent} %` : null);

  // Tableau des actes
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: M + WIDTH, y }, thickness: 0.8, color: LINE });
  y -= 14;
  textAt(page, "Acte", M, y, 8.5, f.bold, MUTED);
  textAt(page, "Cotation", M + 300, y, 8.5, f.bold, MUTED);
  textRight(page, "Base", y, 8.5, f.bold, MUTED);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + WIDTH, y }, thickness: 0.8, color: LINE });
  y -= 16;

  if (sheet.acts.length === 0) {
    textAt(page, "Aucun acte codé pour cette consultation.", M, y, 9.5, f.italic, MUTED);
    y -= 16;
  }
  for (const act of sheet.acts) {
    textAt(page, act.label, M, y, 9.5, f.font, INK);
    textAt(page, act.notation, M + 300, y, 9.5, f.font, INK);
    textRight(page, money(act.amount), y, 9.5, f.font, INK);
    y -= 15;
  }

  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + WIDTH, y }, thickness: 0.8, color: LINE });
  y -= 18;

  const total = (label: string, value: string, bold = false) => {
    textAt(page, label, M + 220, y, 9.5, bold ? f.bold : f.font, bold ? INK : MUTED);
    textRight(page, value, y, bold ? 11 : 9.5, bold ? f.bold : f.font, bold ? GREEN : INK);
    y -= 16;
  };
  total("Base de remboursement", money(sheet.base_amount));
  total("Somme payée au praticien", money(sheet.paid_amount));
  if (sheet.above_base) total("Dépassement (non remboursable)", money(sheet.above_base));
  total("Part de l'organisme", money(sheet.reimbursed_amount), true);
  total("Reste à votre charge", money(sheet.patient_cost));

  y -= 10;
  textAt(
    page,
    "Document à remettre à votre organisme. Les montants sont ceux de la convention en vigueur à la date des soins.",
    M,
    y,
    8,
    f.italic,
    MUTED,
  );

  drawFooter(
    page,
    f,
    "Feuille de soins établie par Fajma — santé numérique du Sénégal. Les actes sont codés selon la nomenclature en vigueur.",
  );
  return pdf.save();
}
