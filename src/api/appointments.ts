/** Rendez-vous côté patient : réserver, annuler, déplacer, accès téléconsultation. */
import { api } from "./client";
import type { Mode, PatientAppointment, SeriesSession, TeleconsultationAccess } from "./types";

/** Écart en jours entre deux séances d'une série (valeurs acceptées par le serveur). */
export const SERIES_INTERVALS = [1, 2, 3, 7, 14] as const;

export type SeriesRequest = { count: number; interval_days: number };

export const createAppointment = ({
  data,
}: {
  data: {
    doctor_id: string;
    scheduled_at: string;
    mode: Mode;
    reason?: string;
    consultation_type_id?: string;
    relative_id?: string;
    /** Entraide familiale : réservation au nom du proche aidé. */
    care_link_id?: string;
    coverage_id?: string;
    visit_address?: string;
    visit_landmark?: string;
    visit_latitude?: number;
    visit_longitude?: number;
    series?: SeriesRequest;
    /** Réponses facultatives au questionnaire du médecin. */
    answers?: Record<string, string | boolean>;
  };
}) =>
  api.post<{
    id: string;
    status: "pending" | "confirmed";
    series?: { id: string; booked: number; skipped: string[] };
  }>("/appointments/", data);

/** Dates d'une série et disponibilité de chacune (rien n'est réservé). */
export const previewSeries = (data: {
  doctor_id: string;
  scheduled_at: string;
  mode: Mode;
  consultation_type_id: string;
  series: SeriesRequest;
}) => api.post<{ sessions: SeriesSession[] }>("/appointments/series/preview", data);

export const listMyAppointments = () => api.get<PatientAppointment[]>("/appointments/mine");

export const cancelAppointment = ({
  data,
}: {
  /** scope "series" : annule aussi les séances suivantes de la série. */
  data: { id: string; reason?: string; scope?: "one" | "series" };
}) =>
  api.post<{ ok: true; cancelled: number; kept: number }>(`/appointments/${data.id}/cancel`, {
    reason: data.reason,
    scope: data.scope,
  });

/** Lien de téléchargement du fichier .ics (ajout à l'agenda du téléphone). */
export const appointmentIcsUrl = (id: string) => `/api/appointments/${id}/ics`;

export type AppointmentEvent = {
  at: string;
  action:
    | "created"
    | "confirmed"
    | "rescheduled"
    | "cancelled"
    | "completed"
    | "no_show"
    | "arrived"
    | "status";
  label: string;
  by_role: string;
  by_name: string | null;
  from_at: string | null;
  to_at: string | null;
  note: string | null;
};

/** Historique d'un RDV ; path : /appointments/<id>/history, /pro/appointments/<id>/history ou /clinics/<c>/appointments/<id>/history. */
export const getAppointmentHistory = (path: string) => api.get<AppointmentEvent[]>(path);

export const rescheduleAppointment = ({ data }: { data: { id: string; scheduled_at: string } }) =>
  api.post<{ ok: true }>(`/appointments/${data.id}/reschedule`, {
    scheduled_at: data.scheduled_at,
  });

export const getTeleconsultationAccess = ({ data }: { data: { appointment_id: string } }) =>
  api.get<TeleconsultationAccess>(`/appointments/${data.appointment_id}/teleconsultation`);

export const teleconsultationReady = (id: string) =>
  api.post<{ ok: true }>(`/appointments/${id}/teleconsultation/ready`);

export const teleconsultationStart = (id: string) =>
  api.post<{ ok: true }>(`/appointments/${id}/teleconsultation/start`);

export const answerQuestionnaire = ({
  data,
}: {
  data: { id: string; answers: Record<string, string | boolean> };
}) => api.post<{ ok: true }>(`/appointments/${data.id}/questionnaire`, { answers: data.answers });
