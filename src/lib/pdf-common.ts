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
/** Étoile à cinq branches (repère 24 × 24), comme sur le drapeau du Sénégal. */
export const FLAG_STAR =
  "M12.00 1.10L14.70 8.88L22.94 9.05L16.37 14.02L18.76 21.90L12.00 17.20L5.24 21.90L7.63 14.02L1.06 9.05L9.30 8.88Z";

/** Bande aux couleurs du drapeau (haut de page par défaut), étoile verte au centre de la bande jaune. */
export function drawFlagStripe(page: PDFPage, top = PAGE[1], h = 7) {
  const third = PAGE[0] / 3;
  const y = top - h;
  page.drawRectangle({ x: 0, y, width: third, height: h, color: GREEN });
  page.drawRectangle({ x: third, y, width: third, height: h, color: GOLD });
  page.drawRectangle({ x: third * 2, y, width: third + 1, height: h, color: RED });
  const star = 6.4;
  page.drawSvgPath(FLAG_STAR, {
    x: PAGE[0] / 2 - star / 2,
    y: top - (h - star) / 2,
    scale: star / 24,
    color: GREEN,
  });
}

/** Phrase écrite sous le logo Fajma dans l'en-tête des documents. */
export const FAJMA_TAGLINE = "Votre santé, simplement";
const SOFT = rgb(0.84, 0.94, 0.87); // texte secondaire sur le bandeau vert
const WHITE = rgb(1, 1, 1);

/** Ligne de texte du bandeau : `soft` = vert pâle (secondaire), sinon blanc. */
export type BandLine = {
  text: string | null | undefined;
  size: number;
  bold?: boolean;
  soft?: boolean;
};

/**
 * En-tête des documents (choisi par le fondateur) : bandeau vert plein, logo Fajma en blanc avec sa phrase,
 * texte blanc à gauche et à droite, bande tricolore et étoile dessous. Le logo est en haut à gauche
 * (`logo: "top"`) ou à droite, centré (`logo: "right"`, quand la colonne de droite est vide).
 * Renvoie l'ordonnée sous la bande tricolore.
 */
export function drawBrandBand(
  page: PDFPage,
  f: Fonts,
  left: BandLine[],
  right: BandLine[] = [],
  opts: { logo?: "top" | "right" } = {},
): number {
  const logoAt = opts.logo ?? "top";
  const half = WIDTH / 2 - 10;
  const layout = (items: BandLine[], width: number) =>
    items.flatMap((l) =>
      l.text
        ? wrap(l.text, l.bold ? f.bold : f.font, l.size, width).map((t) => ({ ...l, text: t }))
        : [],
    );
  const L = layout(left, logoAt === "right" ? WIDTH - 130 : half);
  const R = layout(right, half);
  const height = (lines: BandLine[]) => lines.reduce((h, l) => h + l.size + 3.5, 0);
  const PAD_TOP = 18;
  const PAD_BOTTOM = 16;
  const LOGO = 16;
  const logoRow = logoAt === "top" ? LOGO + 18 : 0;
  const content = Math.max(height(L), height(R), logoAt === "right" ? LOGO + 10 : 0);
  const bandH = PAD_TOP + logoRow + content + PAD_BOTTOM;
  const top = PAGE[1];
  page.drawRectangle({ x: 0, y: top - bandH, width: PAGE[0], height: bandH, color: GREEN });

  if (logoAt === "top") {
    drawFajmaLogo(page, f.bold, M, top - PAD_TOP - LOGO, LOGO, { onGreen: true, tagline: f.font });
  } else {
    const w = LOGO * 1.3 + f.bold.widthOfTextAtSize("Fajma", LOGO * 0.62);
    const cy = top - PAD_TOP - content / 2;
    drawFajmaLogo(page, f.bold, M + WIDTH - w, cy - LOGO / 2 + 3, LOGO, {
      onGreen: true,
      tagline: f.font,
    });
  }
  const write = (lines: BandLine[], align: "left" | "right") => {
    let y = top - PAD_TOP - logoRow;
    for (const l of lines) {
      y -= l.size;
      const font = l.bold ? f.bold : f.font;
      const color = l.soft ? SOFT : WHITE;
      if (align === "left") textAt(page, l.text!, M, y, l.size, font, color);
      else textRight(page, l.text!, y, l.size, font, color);
      y -= 3.5;
    }
  };
  write(L, "left");
  write(R, "right");
  drawFlagStripe(page, top - bandH, 5);
  return top - bandH - 5;
}

/** Titre en capitales espacées (ex. « O R D O N N A N C E » sans les espaces visibles). */
export function spacedTitle(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = GREEN,
  spacing = size * 0.14,
) {
  let cx = x;
  for (const ch of clean(text)) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + spacing;
  }
  return cx - spacing - x;
}

/** Largeur d'un titre espacé (pour le centrer). */
export function spacedWidth(text: string, size: number, font: PDFFont, spacing = size * 0.14) {
  const t = clean(text);
  return font.widthOfTextAtSize(t, size) + spacing * Math.max(t.length - 1, 0);
}

/**
 * En-tête : bandeau vert avec le médecin à gauche (nom, spécialité, titres, n° d'Ordre) et le lieu d'exercice
 * à droite (établissement, adresse, téléphone). Renvoie la hauteur disponible sous l'en-tête.
 */
export function drawIssuerHeader(page: PDFPage, issuer: DocumentIssuer, f: Fonts): number {
  return drawBrandBand(
    page,
    f,
    [
      { text: drName(issuer.full_name), size: 15, bold: true },
      { text: issuer.specialty, size: 9.5, bold: true, soft: true },
      { text: issuer.title, size: 8.5, soft: true },
      {
        text: issuer.order_number
          ? `N° d'inscription à l'Ordre des médecins : ${issuer.order_number}`
          : null,
        size: 8.5,
        soft: true,
      },
      {
        text: issuer.replacing ? `Remplaçant du ${drName(issuer.replacing)}` : null,
        size: 8.5,
        bold: true,
      },
    ],
    [
      { text: issuer.practice_name, size: 10.5, bold: true },
      { text: issuer.address, size: 8.5, soft: true },
      { text: issuer.city, size: 8.5, soft: true },
      { text: issuer.phone ? `Tél. : ${issuer.phone}` : null, size: 8.5, soft: true },
    ],
  );
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
 * Logo et nom « Fajma ». (x, y) : coin inférieur gauche du symbole ; `size` : côté du symbole.
 * `onGreen` : version blanche pour le bandeau vert ; `tagline` : police de la phrase écrite sous le logo.
 * Renvoie la largeur occupée.
 */
export function drawFajmaLogo(
  page: PDFPage,
  bold: PDFFont,
  x: number,
  y: number,
  size: number,
  opts: { onGreen?: boolean; tagline?: PDFFont } = {},
) {
  const unit = size / 32;
  const [bubble, mark, word] = opts.onGreen ? [WHITE, GREEN, WHITE] : [GREEN, WHITE, GREEN];
  page.drawSvgPath(FAJMA_MARK_PATHS.bubble, { x, y: y + size, scale: unit, color: bubble });
  // « f » réduit et remonté dans la bulle (mêmes réglages que le site)
  const letter = {
    x: x + FAJMA_MARK_LETTER.dx * unit,
    y: y + size - FAJMA_MARK_LETTER.dy * unit,
    scale: unit * FAJMA_MARK_LETTER.scale,
  };
  page.drawSvgPath(FAJMA_MARK_PATHS.letter, { ...letter, color: mark });
  page.drawSvgPath(FAJMA_MARK_PATHS.heart, { ...letter, color: GOLD });
  const textSize = size * 0.62;
  page.drawText("Fajma", {
    x: x + size + size * 0.3,
    y: y + (size - textSize * 0.72) / 2,
    size: textSize,
    font: bold,
    color: word,
  });
  if (opts.tagline) {
    page.drawText(clean(FAJMA_TAGLINE), {
      x,
      y: y - size * 0.42 - 2,
      size: Math.max(size * 0.4, 6.5),
      font: opts.tagline,
      color: opts.onGreen ? SOFT : MUTED,
    });
  }
  return size * 1.3 + bold.widthOfTextAtSize("Fajma", textSize);
}

/** Texte centré sur la largeur utile de la page. */
function textCenter(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: PDFFont,
  color = INK,
) {
  const t = clean(text);
  page.drawText(t, { x: M + (WIDTH - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
}

/**
 * Pied de page (choisi par le fondateur, « Tricolore centré ») : fine bande vert, jaune, rouge avec l'étoile,
 * mention centrée dessous, puis « fajma.sn · Page x/y » en vert. Occupe le bas de la page jusqu'à y = 64.
 */
export function drawFooter(page: PDFPage, f: Fonts, text: string, pageLabel?: string) {
  const top = 62;
  const h = 2.5;
  const third = WIDTH / 3;
  page.drawRectangle({ x: M, y: top, width: third, height: h, color: GREEN });
  page.drawRectangle({ x: M + third, y: top, width: third, height: h, color: GOLD });
  page.drawRectangle({ x: M + third * 2, y: top, width: third, height: h, color: RED });
  // Étoile verte sur une pastille blanche, au centre de la bande jaune.
  const cx = M + WIDTH / 2;
  page.drawCircle({ x: cx, y: top + h / 2, size: 5.2, color: rgb(1, 1, 1) });
  const star = 7.5;
  page.drawSvgPath(FLAG_STAR, {
    x: cx - star / 2,
    y: top + h / 2 + star / 2,
    scale: star / 24,
    color: GREEN,
  });
  let y = top - 11;
  for (const line of wrap(text, f.font, 7, WIDTH)) {
    textCenter(page, line, y, 7, f.font, MUTED);
    y -= 9;
  }
  textCenter(
    page,
    pageLabel ? `fajma.sn · Page ${pageLabel}` : "fajma.sn",
    y - 2,
    7.5,
    f.bold,
    GREEN,
  );
}
