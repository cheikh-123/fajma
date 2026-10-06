/** Sécurité de la prescription : catalogue des médicaments et contrôle (allergies, interactions, état, âge). */
import { api } from "./client";
import type { PrescriptionItem } from "./types";

export type SafetyLevel = "majeure" | "moderee" | "information";

export type SafetyAlert = {
  level: SafetyLevel;
  level_label: string;
  title: string;
  detail: string;
  medicine: string;
  kind: "allergie" | "interaction" | "etat" | "age" | "doublon" | "inconnu";
};

export type SafetyResult = {
  alerts: SafetyAlert[];
  major: number;
  moderate: number;
  info: number;
  blocking: boolean;
  patient_known?: boolean;
};

export type CatalogMedicine = {
  code: string;
  dci: string;
  brands: string[];
  group: string;
  family: string;
  family_label: string;
  forms: string;
  essential: boolean;
};

export const getMedicines = () =>
  api.get<{ medicines: CatalogMedicine[] }>("/pro/medicines").then((r) => r.medicines);

export const checkPrescription = (appointmentId: string, items: PrescriptionItem[]) =>
  api.post<SafetyResult>(`/pro/appointments/${appointmentId}/prescription-check`, { items });
