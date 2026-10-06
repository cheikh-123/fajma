/**
 * Nomenclature des actes : codage par le médecin, base de remboursement, feuille de soins pour l'organisme
 * (IPM, mutuelle, CMU, assurance privée).
 */
import { api } from "./client";

export type ActCatalogItem = {
  code: string;
  label: string;
  letter: string;
  coefficient: number;
  group: string;
  note: string | null;
  unit_value: number;
  base_amount: number;
};

export type ActLetter = { code: string; label: string; value: number; default: number };

export const getActsCatalog = () =>
  api.get<{ acts: ActCatalogItem[]; letters: ActLetter[] }>("/pro/acts");

export type PerformedAct = {
  id: string;
  code: string;
  label: string;
  letter: string;
  coefficient: number;
  quantity: number;
  unit_value: number;
  amount: number;
  notation: string;
};

export type Billing = {
  acts: PerformedAct[];
  base_amount: number;
  paid_amount: number;
  coverage_percent: number | null;
  insurer: string | null;
  member_number: string | null;
  reimbursed_amount: number;
  patient_cost: number;
  above_base: number | null;
};

export type CareSheet = Billing & {
  appointment_id: string;
  date: string;
  doctor: {
    full_name: string;
    order_number: string | null;
    specialty: string | null;
    address: string | null;
    city: string;
    phone: string | null;
  };
  patient: { full_name: string; birth_date: string | null; account_holder: string | null };
};

export const getCareSheet = (appointmentId: string) =>
  api.get<CareSheet>(`/appointments/${appointmentId}/care-sheet`);

export const getActLetters = () => api.get<{ letters: ActLetter[] }>("/admin/act-letters");
export const saveActLetters = (values: Record<string, number>) =>
  api.post<{ letters: ActLetter[] }>("/admin/act-letters", values);
