/** Carnet de santé familial : vaccination (calendrier PEV) et suivi de grossesse. */
import { api } from "./client";

export type VaccineStatus = "done" | "late" | "due" | "upcoming" | "unknown";

export type VaccineItem = {
  code: string;
  name: string;
  age_label: string;
  due_date: string | null;
  status: VaccineStatus;
  given_on: string | null;
  verified: boolean;
  dose_id: string | null;
};

export type CarnetPerson = {
  id: string | null;
  full_name: string;
  relationship: string;
  birth_date: string | null;
  vaccinations: VaccineItem[];
};

export type PregnancyFollowUp = {
  id: string;
  status: "active" | "ended";
  last_period: string;
  due_date: string;
  weeks: number;
  days: number;
  ended_on: string | null;
  visits: {
    contact: number;
    week: number;
    target_date: string;
    done_on: string | null;
    status: "done" | "late" | "todo";
  }[];
};

export const getCarnet = () =>
  api.get<{ people: CarnetPerson[]; pregnancies: PregnancyFollowUp[] }>("/carnet/");

export const listVaccines = () =>
  api.get<{ code: string; name: string; age_label: string }[]>("/carnet/vaccines");

export const recordDose = ({
  data,
}: {
  data: { vaccine_code: string; given_on: string; relative_id?: string };
}) => api.post<{ ok: true }>("/carnet/doses", data);

export const deleteDose = (id: string) => api.post<{ ok: true }>(`/carnet/doses/${id}/delete`);

export const startPregnancy = (last_period: string) =>
  api.post<PregnancyFollowUp>("/carnet/pregnancies", { last_period });

export const recordPrenatalVisit = ({
  data,
}: {
  data: { id: string; contact: number; done_on: string };
}) => api.post<PregnancyFollowUp>(`/carnet/pregnancies/${data.id}/visits`, data);

export const endPregnancy = ({
  data,
}: {
  data: { id: string; outcome: "birth" | "other"; child_name?: string; ended_on?: string };
}) =>
  api.post<PregnancyFollowUp & { child_id: string | null }>(
    `/carnet/pregnancies/${data.id}/end`,
    data,
  );

export const doctorRecordDose = ({
  data,
}: {
  data: { appointment_id: string; vaccine_code: string };
}) =>
  api.post<{ ok: true; vaccine: string }>(
    `/pro/appointments/${data.appointment_id}/vaccination`,
    data,
  );
