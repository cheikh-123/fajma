/**
 * Réservation pour un proche aidé (entraide familiale) : le choix est gardé le temps de chercher un médecin,
 * puis la fiche du médecin réserve au nom du proche. Gardé dans l'onglet seulement (sessionStorage).
 */
export type BookFor = { linkId: string; label: string };

const KEY = "fajma-book-for";

export function getBookFor(): BookFor | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BookFor) : null;
  } catch {
    return null;
  }
}

export function setBookFor(value: BookFor | null) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : la réservation se fera pour soi */
  }
}
