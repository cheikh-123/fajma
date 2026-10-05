/**
 * Logo Fajma (repère 32 × 32) : une bulle de consultation (l'échange entre le patient et son médecin, au cabinet
 * ou en vidéo) qui porte le « f » de Fajma dessiné en croix médicale, cœur doré au centre (vert et or du drapeau).
 * Utilisé par le site (components/FajmaMark), les PDF (lib/pdf-common) et repris dans public/favicon.svg et
 * les icônes de l'application.
 */
export const FAJMA_MARK_PATHS = {
  bubble:
    "M8 0h16a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H12.5l-6 4.2c-.9.6-2 0-2-1.1V27.2A8 8 0 0 1 0 20V8a8 8 0 0 1 8-8z",
  letter:
    "M13.6 13.4V11.8c0-3.2 2.3-5.3 5.5-5.3h2.6a2.2 2.2 0 0 1 0 4.4h-2.4c-.9 0-1.3.4-1.3 1.3v1.2h4.6a2.2 2.2 0 0 1 0 4.4H18v7.4a2.2 2.2 0 0 1-4.4 0v-7.4H9a2.2 2.2 0 0 1 0-4.4z",
  heart: "M13.6 13.4h4.4v4.4h-4.4z",
};

/** Le « f » en croix est réduit et remonté dans la bulle : point (x, y) → (SCALE·x + DX, SCALE·y + DY). */
export const FAJMA_MARK_LETTER = { scale: 0.82, dx: 2.88, dy: 0.88 };

export const FAJMA_MARK_COLORS = { bubble: "#00853f", letter: "#ffffff", heart: "#fdef42" };
