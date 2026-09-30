/** Brouillon d'ordonnance saisi par le médecin (voir components/pro/PrescriptionEditor). */
import type { DoctorAppointment, PrescriptionItem, Sex } from "@/api/types";

export type PrescriptionDraft = {
  items: PrescriptionItem[];
  renewals: number;
  validity_months: number;
  patient_birth_date: string;
  patient_sex: Sex | "";
  patient_weight_kg: string;
  instructions: string;
};

export const emptyItem = (): PrescriptionItem => ({
  name: "",
  dosage: "",
  posology: "",
  duration: "",
  quantity: "",
  non_substitutable: false,
});

export function newDraft(appt: DoctorAppointment): PrescriptionDraft {
  const subject = appt.relative ?? appt.patient;
  return {
    items: [emptyItem()],
    renewals: 0,
    validity_months: 3,
    patient_birth_date: subject?.birth_date ?? "",
    patient_sex: subject?.sex ?? "",
    patient_weight_kg: "",
    instructions: "",
  };
}

/** Lignes réellement remplies (une ligne vide n'est pas envoyée). */
export const filledItems = (d: PrescriptionDraft) => d.items.filter((it) => it.name.trim());
