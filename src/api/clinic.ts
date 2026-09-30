/** Espace clinique : établissement, équipe, secrétariat, agenda partagé. */
import { api } from "./client";
import type { Clinic, ClinicAgendaItem, Mode } from "./types";

export const getMyClinic = () => api.get<Clinic | null>("/clinics/mine");

export const createMyClinic = ({
  data,
}: {
  data: { name: string; city: string; address?: string; phone?: string; description?: string };
}) => api.post<{ id: string }>("/clinics/mine", data);

export const listClinicCandidates = () =>
  api.get<{ id: string; full_name: string; city: string; specialty: { name: string } | null }[]>(
    "/clinics/candidates",
  );

export const addClinicDoctor = ({
  data,
}: {
  data: { clinic_id: string; doctor_id: string; title: string };
}) =>
  api.post<{ ok: true }>(`/clinics/${data.clinic_id}/members`, {
    doctor_id: data.doctor_id,
    title: data.title,
  });

export const addClinicStaff = ({
  data,
}: {
  data: { clinic_id: string; email: string; role: "secretary" | "manager" };
}) =>
  api.post<{ ok: true }>(`/clinics/${data.clinic_id}/staff`, {
    email: data.email,
    role: data.role,
  });

export const updateClinic = ({
  data,
}: {
  data: {
    clinic_id: string;
    name?: string;
    city?: string;
    address?: string;
    phone?: string;
    description?: string;
  };
}) => api.post<Clinic>(`/clinics/${data.clinic_id}/update`, data);

/** Retire un médecin de l'équipe (responsable) ou le médecin quitte l'établissement. */
export const removeClinicMember = ({ data }: { data: { clinic_id: string; member_id: string } }) =>
  api.post<{ ok: true }>(`/clinics/${data.clinic_id}/members/${data.member_id}/delete`);

export const removeClinicStaff = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/clinics/staff/${data.id}/delete`);

export const listClinicAgenda = ({
  data,
}: {
  data: { clinic_id: string; from: string; days: number };
}) =>
  api.get<ClinicAgendaItem[]>(`/clinics/${data.clinic_id}/agenda`, {
    from: data.from,
    days: data.days,
  });

export const clinicBookAppointment = ({
  data,
}: {
  data: {
    clinic_id: string;
    doctor_id: string;
    scheduled_at: string;
    duration_minutes: number;
    mode?: Mode;
    patient_name: string;
    patient_phone?: string;
    patient_id?: string;
    reason?: string;
    visit_address?: string;
    visit_landmark?: string;
  };
}) => api.post<{ id: string }>(`/clinics/${data.clinic_id}/book`, data);

/** Le secrétariat déplace un RDV (le patient est prévenu par SMS). */
export const clinicMoveAppointment = ({
  data,
}: {
  data: { clinic_id: string; id: string; scheduled_at: string; duration_minutes?: number };
}) =>
  api.post<{ ok: true }>(`/clinics/${data.clinic_id}/appointments/${data.id}/move`, {
    scheduled_at: data.scheduled_at,
    duration_minutes: data.duration_minutes,
  });

export const clinicExportUrl = (clinicId: string, from: string, to: string) =>
  `/api/clinics/${clinicId}/export.csv?from=${from}&to=${to}`;

/** Séances supplémentaires identiques, à intervalle régulier. */
export const clinicRepeatAppointment = ({
  data,
}: {
  data: { clinic_id: string; id: string; count: number; interval_days: number };
}) =>
  api.post<{ ok: true; created: number; skipped: string[] }>(
    `/clinics/${data.clinic_id}/appointments/${data.id}/repeat`,
    { count: data.count, interval_days: data.interval_days },
  );

/** Fichier patients de la clinique (reconstitué depuis les rendez-vous). */
export type ClinicPatient = {
  key: string;
  patient_id: string | null;
  name: string;
  name_variants: string[];
  phone: string | null;
  registered: boolean;
  appointments: number;
  last_visit: string | null;
  next_appointment: string | null;
  matching_account: { patient_id: string; name: string } | null;
};

export const listClinicPatients = ({ data }: { data: { clinic_id: string; q?: string } }) =>
  api.get<ClinicPatient[]>(`/clinics/${data.clinic_id}/patients`, { q: data.q || undefined });

export const unifyPatientName = ({
  data,
}: {
  data: { clinic_id: string; phone: string; name: string };
}) => api.post<{ updated: number }>(`/clinics/${data.clinic_id}/patients/unify`, data);

export const linkPatientAccount = ({ data }: { data: { clinic_id: string; phone: string } }) =>
  api.post<{ updated: number; patient_id: string }>(
    `/clinics/${data.clinic_id}/patients/link`,
    data,
  );

export const clinicUpdateAppointment = ({
  data,
}: {
  data: {
    clinic_id: string;
    id: string;
    status: "confirmed" | "cancelled" | "completed";
    scope?: "one" | "series";
  };
}) =>
  api.post<{ ok: true; cancelled?: number }>(`/clinics/${data.clinic_id}/appointments/${data.id}`, {
    status: data.status,
    scope: data.scope,
  });
