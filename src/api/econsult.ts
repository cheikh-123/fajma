/** Avis médical écrit (consultation asynchrone). */
import { api } from "./client";

export type AsyncOffer = { price: number; response_hours: number; instructions: string | null };

export type AsyncRequest = {
  id: string;
  appointment_id: string;
  status: "awaiting_payment" | "submitted" | "answered" | "expired" | "cancelled";
  status_label: string;
  created_at: string;
  deadline_at: string | null;
  reason: string | null;
  symptoms: string;
  since: string | null;
  temperature: number | null;
  systolic: number | null;
  diastolic: number | null;
  weight: number | null;
  current_treatments: string | null;
  photos: { id: string; url: string }[];
  answer: string | null;
  outcome: "advice" | "prescription" | "in_person" | "emergency" | null;
  outcome_label: string | null;
  answered_at: string | null;
  amount: number;
  paid: boolean;
  doctor: { id: string; full_name: string; specialty: string | null };
  for_relative: string | null;
  patient?: { id: string; full_name: string; birth_date: string | null; sex: string | null };
};

export const getAsyncOffer = (doctorId: string) =>
  api.get<AsyncOffer | null>(`/econsult/offer/${doctorId}`);
export const sendAsyncRequest = (data: {
  doctor_id: string;
  relative_id?: string;
  reason: string;
  symptoms: string;
  since?: string;
  temperature?: string;
  systolic?: number;
  diastolic?: number;
  weight?: string;
  current_treatments?: string;
  photos?: { file_name: string; content_base64: string }[];
}) => api.post<AsyncRequest>("/econsult/requests", data);
export const listMyAsyncRequests = () => api.get<AsyncRequest[]>("/econsult/requests");
export const cancelAsyncRequest = (id: string) =>
  api.post<{ ok: true }>(`/econsult/requests/${id}/cancel`);

export const getMyAsyncOffer = () =>
  api.get<AsyncOffer & { enabled: boolean }>("/econsult/pro/offer");
export const saveMyAsyncOffer = (data: {
  enabled: boolean;
  price: number;
  response_hours: number;
  instructions?: string;
}) => api.post<AsyncOffer & { enabled: boolean }>("/econsult/pro/offer", data);
export const listProAsyncRequests = () => api.get<AsyncRequest[]>("/econsult/pro/requests");
export const answerAsyncRequest = (
  id: string,
  data: {
    answer: string;
    outcome: NonNullable<AsyncRequest["outcome"]>;
    diagnosis?: string;
    items?: { name: string; posology: string; duration: string }[];
    condition_code?: string;
    condition_status?: string;
    test_result?: string;
  },
) => api.post<AsyncRequest>(`/econsult/pro/requests/${id}/answer`, data);
