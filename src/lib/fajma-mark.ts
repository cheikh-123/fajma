/**
 * Formes du logo Fajma (repère 32 × 32) : le « f » de Fajma dessine une croix médicale, cœur doré au centre,
 * aux couleurs du drapeau. Utilisées par le site (components/FajmaMark), les PDF (lib/pdf-common) et
 * reprises dans public/favicon.svg et les icônes de l'application.
 */
export const FAJMA_MARK_PATHS = {
  square: "M8 0h16a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z",
  letter:
    "M13.6 13.4V11.8c0-3.2 2.3-5.3 5.5-5.3h2.6a2.2 2.2 0 0 1 0 4.4h-2.4c-.9 0-1.3.4-1.3 1.3v1.2h4.6a2.2 2.2 0 0 1 0 4.4H18v7.4a2.2 2.2 0 0 1-4.4 0v-7.4H9a2.2 2.2 0 0 1 0-4.4z",
  heart: "M13.6 13.4h4.4v4.4h-4.4z",
};

export const FAJMA_MARK_COLORS = { square: "#00853f", letter: "#ffffff", heart: "#fdef42" };
