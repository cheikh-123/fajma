import type { Measurement } from "@/api/care";

/** Mesure lisible : « 130/80 mmHg · pouls 72 », « 1,05 g/L · à jeun », « 70 kg ». */
export function formatMeasurement(m: Measurement) {
  if (m.kind === "blood_pressure")
    return `${m.systolic}/${m.diastolic} mmHg${m.pulse ? ` · pouls ${m.pulse}` : ""}`;
  if (m.kind === "glucose")
    return `${m.value?.toLocaleString("fr-FR")} g/L${m.context === "fasting" ? " · à jeun" : m.context === "after_meal" ? " · après repas" : ""}`;
  return `${m.value?.toLocaleString("fr-FR")} kg`;
}
