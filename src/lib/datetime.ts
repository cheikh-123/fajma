/**
 * Dates et heures toujours affichées à l'heure de Dakar, quel que soit le fuseau de l'appareil
 * (patients de la diaspora, ordinateurs mal réglés). Le Sénégal est à UTC+0 sans heure d'été.
 */
export const TZ = "Africa/Dakar";

type DateInput = string | number | Date;

// Langue des dates : anglais pour l'interface anglaise ; français pour le français et le wolof
// (les dates s'écrivent couramment en français au Sénégal).
let LOCALE = "fr-FR";
export function setDateLocale(lang: string) {
  LOCALE = lang === "en" ? "en-GB" : "fr-FR";
}

export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(LOCALE, { ...options, timeZone: TZ });
}

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(value).toLocaleDateString(LOCALE, { ...options, timeZone: TZ });
}

export function formatTime(value: DateInput) {
  return new Date(value).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Jour du mois à Dakar (pour les pastilles de calendrier). */
export function dayOfMonth(value: DateInput) {
  return Number(new Date(value).toLocaleString("fr-FR", { day: "numeric", timeZone: TZ }));
}

/** Minuit (heure de Dakar) du jour donné. */
export function startOfDakarDay(value: DateInput) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0); // Dakar = UTC+0
  return d;
}

/** Valeur pour <input type="datetime-local"> exprimée en heure de Dakar. */
export function toDakarInput(value: DateInput) {
  return new Date(value).toISOString().slice(0, 16);
}

/** Lit la valeur d'un <input type="datetime-local"> comme une heure de Dakar. */
export function fromDakarInput(value: string) {
  return new Date(`${value}:00Z`);
}
