/** Suivi au long cours : renouvellement d'ordonnance, fiche d'urgence (QR code), alertes de mesures. */
import { api } from "./client";

export type Renewal = {
  id: string;
  status: "pending" | "accepted" | "refused" | "cancelled";
  prescription_id: string;
  prescription_reference: string;
  medicines: string;
  patient_note: string | null;
  doctor_reply: string | null;
  new_prescription_id: string | null;
  created_at: string;
  decided_at: string | null;
  doctor: { id: string; full_name: string };
  /** Côté médecin seulement. */
  patient?: { id: string; full_name: string; is_relative: boolean };
  prescribed_at?: string;
};

export const listMyRenewals = () => api.get<Renewal[]>("/patient/renewals");
export const requestRenewal = (prescription_id: string, note?: string) =>
  api.post<Renewal>("/patient/renewals", { prescription_id, note });
export const cancelRenewal = (id: string) =>
  api.post<{ ok: true }>(`/patient/renewals/${id}/cancel`);

export const listProRenewals = () => api.get<Renewal[]>("/pro/renewals");
export const decideRenewal = (id: string, decision: "accept" | "refuse", message?: string) =>
  api.post<Renewal>(`/pro/renewals/${id}`, { decision, message });

export type EmergencyField =
  "blood_group" | "allergies" | "treatments" | "conditions" | "emergency_contact";

export type EmergencySettings = {
  enabled: boolean;
  token: string | null;
  fields: EmergencyField[];
  alert_doctors: boolean;
};

export const getEmergencySettings = () => api.get<EmergencySettings>("/patient/emergency-card");
export const updateEmergencySettings = (
  data: Partial<{
    enabled: boolean;
    fields: EmergencyField[];
    regenerate: boolean;
    alert_doctors: boolean;
  }>,
) => api.post<EmergencySettings>("/patient/emergency-card", data);

export type EmergencyCard = {
  full_name: string;
  age: number | null;
  sex: "F" | "M" | null;
  updated_at: string;
} & Partial<Record<EmergencyField, string | null>>;

export const getEmergencyCard = (token: string) => api.get<EmergencyCard>(`/emergency/${token}`);

export type MedicalRecordExport = {
  generated_at: string;
  patient: {
    full_name: string;
    birth_date: string | null;
    sex: "F" | "M" | null;
    phone: string | null;
    email: string | null;
    city: string | null;
  };
  relatives: { full_name: string; relationship: string; birth_date: string | null }[];
  health_profile: {
    blood_group: string | null;
    allergies: string | null;
    conditions: string | null;
    treatments: string | null;
    vaccinations: string | null;
    emergency_contact: string | null;
  } | null;
  records: {
    date: string;
    doctor: string;
    specialty: string | null;
    for: string | null;
    summary: string;
    diagnosis: string | null;
    treatment: string | null;
  }[];
  prescriptions: {
    date: string;
    reference: string;
    doctor: string;
    for: string | null;
    content: string;
    instructions: string | null;
    valid_until: string | null;
  }[];
  issued_documents: {
    date: string;
    kind: string;
    reference: string;
    doctor: string;
    for: string | null;
    start_date: string | null;
    end_date: string | null;
  }[];
  lab_orders: {
    date: string;
    reference: string;
    doctor: string;
    for: string | null;
    tests: string;
    status: string;
    laboratory: string | null;
    result_note: string | null;
    completed_at: string | null;
  }[];
  measurements: {
    date: string;
    kind: string;
    for: string | null;
    systolic: number | null;
    diastolic: number | null;
    pulse: number | null;
    value: number | null;
    context: string | null;
    level: string;
  }[];
  vaccines: { date: string; vaccine: string; for: string | null; verified: boolean }[];
  documents: { date: string; title: string; category: string }[];
};

export const getMedicalRecord = () => api.get<MedicalRecordExport>("/patient/medical-record");
