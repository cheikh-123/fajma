/** Textes des documents médicaux (sans dépendance au générateur PDF : utilisable dans les pages). */
import type { PrescriptionDetail } from "@/api/types";

/** Les polices standard du PDF ne couvrent pas les espaces fines insécables ni certains signes. */
export const clean = (s: string) =>
  s
    .replace(new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, "g"), " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

/** « Dr » n'est ajouté que si le nom ne le contient pas déjà (« Dr Aïssatou Diop »). */
export function drName(name: string) {
  return /^(dr|docteur|pr)\.?\s/i.test(name) ? name : `Dr ${name}`;
}

export function frDate(value: string) {
  return clean(
    new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
  );
}

/** Âge à une date donnée : « 34 ans », « 18 mois » avant 2 ans. */
export function ageAt(birth: string, at: string): string {
  const b = new Date(birth);
  const d = new Date(at);
  let months = (d.getFullYear() - b.getFullYear()) * 12 + d.getMonth() - b.getMonth();
  if (d.getDate() < b.getDate()) months -= 1;
  if (months < 24) return `${Math.max(months, 0)} mois`;
  return `${Math.floor(months / 12)} ans`;
}

export function renewalText(renewals: number) {
  return renewals > 0 ? `À renouveler ${renewals} fois` : "Non renouvelable";
}

export function patientLine(p: NonNullable<PrescriptionDetail["patient"]>, createdAt: string) {
  return [
    p.birth_date ? `${ageAt(p.birth_date, createdAt)} (né(e) le ${frDate(p.birth_date)})` : null,
    p.sex ? (p.sex === "F" ? "Sexe : F" : "Sexe : M") : null,
    p.weight_kg ? `Poids : ${String(p.weight_kg).replace(".", ",")} kg` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
}
