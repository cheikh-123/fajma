/** Espace patient : profil, dossier, avis, proches, listes d'attente. */
import { api } from "./client";
import type { AppNotification, HealthData, HealthProfile, Relative, WaitlistItem } from "./types";

export const getMyHealthData = () => api.get<HealthData>("/patient/health");

export type MyDoctor = {
  id: string;
  full_name: string;
  city: string;
  specialty: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  last_visit: string | null;
  next_appointment: string | null;
  visits: number;
  next_slot: { iso: string; label: string } | null;
};

/** Médecins déjà consultés, pour reprendre rendez-vous en un clic. */
export const listMyDoctors = () => api.get<MyDoctor[]>("/patient/my-doctors");

export const updateMyProfile = ({
  data,
}: {
  data: {
    full_name: string;
    phone?: string;
    city?: string;
    notification_channel?: "sms" | "whatsapp";
    preferred_language?: "fr" | "wo" | "en";
    birth_date?: string;
    sex?: "F" | "M" | "";
  };
}) => api.post<{ ok: true }>("/patient/profile", data);

export const createReview = ({
  data,
}: {
  data: { appointment_id: string; doctor_id: string; rating: number; comment?: string };
}) => api.post<{ ok: true; pending_moderation: boolean }>("/patient/reviews", data);

export const listMyRelatives = () => api.get<Relative[]>("/patient/relatives");

export const addRelative = ({
  data,
}: {
  data: {
    full_name: string;
    relationship: Relative["relationship"];
    birth_date?: string;
    sex?: "F" | "M" | "";
    phone?: string;
  };
}) => api.post<{ id: string }>("/patient/relatives", data);

export const deleteRelative = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/patient/relatives/${data.id}/delete`);

export const listMyWaitlist = () => api.get<WaitlistItem[]>("/patient/waitlist");

export const getMyWaitlistEntry = ({ data }: { data: { doctor_id: string } }) =>
  api.get<{ id: string; status: string; created_at: string; notified_at: string | null } | null>(
    `/patient/waitlist/${data.doctor_id}`,
  );

export const joinWaitlist = ({ data }: { data: { doctor_id: string } }) =>
  api.post<{ ok: true }>(`/patient/waitlist/${data.doctor_id}/join`);

export const leaveWaitlist = ({ data }: { data: { doctor_id: string } }) =>
  api.post<{ ok: true }>(`/patient/waitlist/${data.doctor_id}/leave`);

export const getMyHealthProfile = () => api.get<HealthProfile>("/patient/health-profile");

export const updateMyHealthProfile = ({ data }: { data: Omit<HealthProfile, "updated_at"> }) =>
  api.post<HealthProfile>("/patient/health-profile", data);

export const listMyNotifications = () =>
  api.get<{ unread: number; items: AppNotification[] }>("/patient/notifications");

export const markNotificationsRead = () => api.post<{ ok: true }>("/patient/notifications/read");
