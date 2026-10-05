/**
 * Éléments communs des PDF médicaux (ordonnance, certificats) : couleurs, texte, en-tête du médecin,
 * bloc signature + cachet + QR de vérification.
 */
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { DocumentIssuer } from "@/api/types";
import { FAJMA_MARK_LETTER, FAJMA_MARK_PATHS } from "@/lib/fajma-mark";
import { clean, drName, frDate } from "@/lib/prescription-text";

export { ageAt, clean, drName, frDate } from "@/lib/prescription-text";

// Couleurs du drapeau (vert #00853f, jaune #fdef42, rouge #e31b23) et gris de texte.
export const GREEN = rgb(0, 0.522, 0.247);
export const GOLD = rgb(0.992, 0.937, 0.259);
export const RED = rgb(0.89, 0.106, 0.137);
export const INK = rgb(0.06, 0.1, 0.08);
export const MUTED = rgb(0.4, 0.45, 0.42);
export const LINE = rgb(0.86, 0.9, 0.87);
export const WASH = rgb(0.95, 0.975, 0.96);

export const PAGE: [number, number] = [595.28, 841.89];
export const M = 48;
export const WIDTH = PAGE[0] - M * 2;

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of clean(text).split("\n")) {
    let current = "";
    for (const word of raw.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}

export type Fonts = { font: PDFFont; bold: PDFFont; italic: PDFFont };

export function textAt(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = INK,
) {
  page.drawText(clean(s), { x, y, size, font, color });
}

export function textRight(
  page: PDFPage,
  s: string,
  y: number,
  size: number,
  font: PDFFont,
  color = INK,
) {
  const value = clean(s);
  page.drawText(value, {
    x: M + WIDTH - font.widthOfTextAtSize(value, size),
    y,
    size,
    font,
    color,
  });
}

/** Fine bande aux couleurs du drapeau en haut de page. */
export function drawFlagStripe(page: PDFPage) {
  const third = PAGE[0] / 3;
  const y = PAGE[1] - 5;
  page.drawRectangle({ x: 0, y, width: third, height: 5, color: GREEN });
  page.drawRectangle({ x: third, y, width: third, height: 5, color: GOLD });
  page.drawRectangle({ x: third * 2, y, width: third + 1, height: 5, color: RED });
}

/**
 * En-tête : médecin à gauche (nom, spécialité, titres, n° d'Ordre), lieu d'exercice à droite
 * (établissement, adresse, téléphone). Renvoie la hauteur disponible sous l'en-tête.
 */
export function drawIssuerHeader(page: PDFPage, issuer: DocumentIssuer, f: Fonts): number {
  drawFlagStripe(page);
  // Logo Fajma en haut à droite : document délivré via Fajma, vérifiable par son QR code.
  const logoSize = 22;
  const logoWidth = logoSize * 1.3 + f.bold.widthOfTextAtSize("Fajma", logoSize * 0.62);
  drawFajmaLogo(page, f.bold, M + WIDTH - logoWidth, PAGE[1] - 42, logoSize);
  let y = PAGE[1] - 70;
  textAt(page, drName(issuer.full_name), M, y, 14, f.bold);
  y -= 15;
  for (const [value, color, font] of [
    [issuer.specialty, GREEN, f.bold],
    [issuer.title, MUTED, f.font],
    [
      issuer.order_number
        ? `N° d'inscription à l'Ordre des médecins : ${issuer.order_number}`
        : null,
      INK,
      f.font,
    ],
    [issuer.replacing ? `Remplaçant du ${drName(issuer.replacing)}` : null, INK, f.bold],
  ] as const) {
    if (!value) continue;
    for (const line of wrap(value, font, 9, WIDTH / 2 - 10)) {
      textAt(page, line, M, y, 9, font, color);
      y -= 12;
    }
  }

  let ry = PAGE[1] - 70;
  const right = [
    [issuer.practice_name, 10.5, f.bold, INK],
    [issuer.address, 9, f.font, MUTED],
    [issuer.city, 9, f.font, MUTED],
    [issuer.phone ? `Tél. : ${issuer.phone}` : null, 9, f.font, MUTED],
  ] as const;
  for (const [value, size, font, color] of right) {
    if (!value) continue;
    for (const line of wrap(value, font, size, WIDTH / 2 - 10)) {
      textRight(page, line, ry, size, font, color);
      ry -= size + 3;
    }
  }
  y = Math.min(y, ry) - 8;
  page.drawLine({ start: { x: M, y }, end: { x: M + WIDTH, y }, thickness: 1, color: LINE });
  return y;
}

async function embedDataUrl(pdf: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl) return null;
  const [meta, b64] = dataUrl.split(",", 2);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    return meta.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null; // image illisible : on retombe sur la signature écrite
  }
}

/** Taille d'une image ramenée dans un cadre, proportions conservées. */
function fit(img: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.5);
  return { width: img.width * scale, height: img.height * scale };
}

export const SIGNATURE_BLOCK_HEIGHT = 150;

/**
 * Bas de page : QR de vérification à gauche, « Fait à …, le … », signature et cachet à droite.
 * `top` : ordonnée du haut du bloc.
 */
export async function drawSignatureBlock(
  pdf: PDFDocument,
  page: PDFPage,
  f: Fonts,
  opts: {
    issuer: DocumentIssuer;
    reference: string;
    verifyUrl: string;
    createdAt: string;
    top: number;
  },
) {
  const { issuer, top } = opts;
  const qr = await pdf.embedPng(await QRCode.toDataURL(opts.verifyUrl, { margin: 0, width: 240 }));
  const qrSize = 84;
  page.drawImage(qr, { x: M, y: top - qrSize - 4, width: qrSize, height: qrSize });
  textAt(page, "Vérifier l'authenticité", M, top - qrSize - 18, 8, f.bold, GREEN);
  textAt(page, opts.reference, M, top - qrSize - 29, 8, f.font, MUTED);

  const boxW = 230;
  const x = M + WIDTH - boxW;
  textAt(
    page,
    `Fait à ${issuer.city ?? ""}, le ${frDate(opts.createdAt)}`,
    x,
    top - 8,
    9,
    f.font,
    INK,
  );
  textAt(page, "Signature et cachet du médecin", x, top - 22, 8, f.bold, GREEN);

  const areaTop = top - 30;
  const stamp = await embedDataUrl(pdf, issuer.stamp);
  const signature = await embedDataUrl(pdf, issuer.signature);
  if (stamp) {
    const s = fit(stamp, 95, 95);
    page.drawImage(stamp, { x, y: areaTop - s.height, ...s, opacity: 0.9 });
  }
  if (signature) {
    const s = fit(signature, stamp ? 130 : 200, 70);
    const sx = stamp ? x + 100 : x;
    page.drawImage(signature, { x: sx, y: areaTop - 8 - s.height, ...s });
  } else {
    textAt(page, drName(issuer.full_name), x + (stamp ? 100 : 0), areaTop - 40, 14, f.italic);
  }
  page.drawLine({
    start: { x, y: areaTop - 100 },
    end: { x: x + boxW, y: areaTop - 100 },
    thickness: 0.8,
    color: LINE,
  });
  textAt(page, drName(issuer.full_name), x, areaTop - 112, 8, f.font, MUTED);
}

// Logo Fajma (celui du site, lib/fajma-mark.ts) : bulle de consultation et « f » en croix médicale, en vectoriel.
/**
 * Logo et nom « Fajma ». (x, y) : coin inférieur gauche du carré ; `size` : côté du carré.
 * Renvoie la largeur occupée.
 */
export function drawFajmaLogo(page: PDFPage, bold: PDFFont, x: number, y: number, size: number) {
  const unit = size / 32;
  page.drawSvgPath(FAJMA_MARK_PATHS.bubble, { x, y: y + size, scale: unit, color: GREEN });
  // « f » réduit et remonté dans la bulle (mêmes réglages que le site)
  const letter = {
    x: x + FAJMA_MARK_LETTER.dx * unit,
    y: y + size - FAJMA_MARK_LETTER.dy * unit,
    scale: unit * FAJMA_MARK_LETTER.scale,
  };
  page.drawSvgPath(FAJMA_MARK_PATHS.letter, { ...letter, color: rgb(1, 1, 1) });
  page.drawSvgPath(FAJMA_MARK_PATHS.heart, { ...letter, color: GOLD });
  const textSize = size * 0.62;
  page.drawText("Fajma", {
    x: x + size + size * 0.3,
    y: y + (size - textSize * 0.72) / 2,
    size: textSize,
    font: bold,
    color: GREEN,
  });
  return size * 1.3 + bold.widthOfTextAtSize("Fajma", textSize);
}

/** Pied de page : mentions et numéro de page. */
export function drawFooter(page: PDFPage, f: Fonts, text: string, pageLabel?: string) {
  page.drawLine({
    start: { x: M, y: 62 },
    end: { x: M + WIDTH, y: 62 },
    thickness: 1,
    color: LINE,
  });
  let y = 50;
  for (const line of wrap(text, f.font, 7.5, WIDTH - (pageLabel ? 40 : 0))) {
    textAt(page, line, M, y, 7.5, f.font, MUTED);
    y -= 10;
  }
  if (pageLabel) textRight(page, pageLabel, 50, 7.5, f.font, MUTED);
}
