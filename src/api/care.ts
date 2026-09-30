/** Suivi à domicile : mesures (tension, glycémie, poids) et rappels de prise de médicaments. */
import { api } from "./client";

export type MeasurementKind = "blood_pressure" | "glucose" | "weight";

export type Measurement = {
  id: string;
  kind: MeasurementKind;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  value: number | null;
  context: "fasting" | "after_meal" | "random" | null;
  measured_at: string;
  note: string | null;
  relative: { id: string; full_name: string } | null;
  level: "normal" | "high" | "very_high" | "low";
  advice: string | null;
};

export const listMyMeasurements = (params: {
  kind?: MeasurementKind;
  relative_id?: string;
  days?: number;
}) => api.get<Measurement[]>("/patient/measurements", params);

export const addMeasurement = (data: {
  kind: MeasurementKind;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  value?: number | string;
  context?: string;
  note?: string;
  relative_id?: string;
}) => api.post<Measurement>("/patient/measurements", data);

export const deleteMeasurement = (id: string) =>
  api.post<{ ok: true }>(`/patient/measurements/${id}/delete`);

export type MedicationReminder = {
  id: string;
  medicine: string;
  dosage: string | null;
  times: string[];
  start_date: string;
  end_date: string | null;
  sms: boolean;
  active: boolean;
  relative: { id: string; full_name: string } | null;
  prescription_id: string | null;
};

export const listMedicationReminders = () =>
  api.get<MedicationReminder[]>("/patient/medication-reminders");

export const addMedicationReminder = (data: {
  medicine: string;
  dosage?: string;
  times: string[];
  days?: number;
  sms?: boolean;
  relative_id?: string;
  prescription_id?: string;
}) => api.post<MedicationReminder>("/patient/medication-reminders", data);

export const updateMedicationReminder = (
  id: string,
  data: { active?: boolean; delete?: boolean },
) => api.post<MedicationReminder | { ok: true }>(`/patient/medication-reminders/${id}`, data);
