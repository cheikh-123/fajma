/** Laboratoires d'analyses : prescription, choix du laboratoire, résultats. */
import { api } from "./client";

export type Laboratory = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  opening_hours: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type LabOrder = {
  id: string;
  reference: string;
  tests: string;
  instructions: string | null;
  urgent: boolean;
  status: "prescribed" | "sent" | "received" | "completed" | "cancelled";
  status_label: string;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  result_note: string | null;
  doctor: { id: string; full_name: string };
  laboratory: Laboratory | null;
  for_relative: string | null;
  results: { id: string; title: string; mime_type: string; url: string }[];
  /** Vue laboratoire seulement. */
  patient?: {
    full_name: string;
    birth_date: string | null;
    sex: string | null;
    phone: string | null;
  };
};

export const listMyLabOrders = () => api.get<LabOrder[]>("/labs/orders");
export const listLaboratories = (city?: string) =>
  api.get<Laboratory[]>("/labs/laboratories", { city: city || undefined });
export const sendLabOrder = (id: string, laboratory_id: string) =>
  api.post<LabOrder>(`/labs/orders/${id}/send`, { laboratory_id });

export const prescribeLabs = (
  appointmentId: string,
  data: { tests: string; instructions?: string; urgent?: boolean },
) => api.post<LabOrder>(`/pro/appointments/${appointmentId}/lab-order`, data);
export const cancelLabOrder = (id: string) => api.post<LabOrder>(`/pro/lab-orders/${id}/cancel`);

export const getLabDashboard = () =>
  api.get<{ laboratories: Laboratory[]; orders: LabOrder[] }>("/labs/dashboard");
export const labReceive = (id: string) => api.post<LabOrder>(`/labs/orders/${id}/receive`);
export const labUploadResult = (
  id: string,
  data: { file_name: string; content_base64: string; note?: string; final?: boolean },
) => api.post<LabOrder>(`/labs/orders/${id}/result`, data);

export type AdminLab = Laboratory & {
  members: { id: string; full_name: string; email: string | null }[];
};
export const listAdminLabs = () => api.get<AdminLab[]>("/admin/laboratories");
export const createLab = (data: {
  name: string;
  city: string;
  district?: string;
  address: string;
  phone?: string;
  opening_hours?: string;
}) => api.post<AdminLab[]>("/admin/laboratories", data);
export const labMember = (labId: string, data: { email?: string; remove_member_id?: string }) =>
  api.post<{ ok: true }>(`/admin/laboratories/${labId}/members`, data);
