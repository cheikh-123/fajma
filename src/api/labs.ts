/**
 * Plateaux techniques : laboratoires d'analyses et centres d'imagerie (même circuit — prescription,
 * choix du centre par le patient, résultats dans le dossier).
 */
import { api } from "./client";
import type { SafetyResult } from "./safety";

export type LabKind = "analyses" | "imagerie" | "both";

export type ImagingModality = {
  code: string;
  label: string;
  short: string;
  prep: string;
  contrast: boolean;
  examples: string[];
};
export const getImagingModalities = () =>
  api.get<{ modalities: ImagingModality[] }>("/imaging/modalities").then((r) => r.modalities);

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
  kind: LabKind;
  kind_label: string;
  /** Examens d'imagerie réalisés (vide pour un laboratoire d'analyses). */
  modalities: string[];
  modality_labels: string[];
};

export type LabOrder = {
  id: string;
  reference: string;
  tests: string;
  kind: "analyses" | "imagerie";
  kind_label: string;
  modality: string | null;
  modality_label: string | null;
  contrast: boolean;
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
export const listLaboratories = (params?: { city?: string; kind?: string; modality?: string }) =>
  api.get<Laboratory[]>("/labs/laboratories", {
    city: params?.city || undefined,
    kind: params?.kind || undefined,
    modality: params?.modality || undefined,
  });
export const sendLabOrder = (id: string, laboratory_id: string) =>
  api.post<LabOrder>(`/labs/orders/${id}/send`, { laboratory_id });

export const prescribeLabs = (
  appointmentId: string,
  data: {
    tests: string;
    instructions?: string;
    urgent?: boolean;
    kind?: "analyses" | "imagerie";
    modality?: string;
    contrast?: boolean;
  },
) =>
  api.post<LabOrder & { safety?: SafetyResult }>(
    `/pro/appointments/${appointmentId}/lab-order`,
    data,
  );
export const cancelLabOrder = (id: string) => api.post<LabOrder>(`/pro/lab-orders/${id}/cancel`);

export const getLabDashboard = () =>
  api.get<{ laboratories: Laboratory[]; orders: LabOrder[] }>("/labs/dashboard");
export const labReceive = (id: string) => api.post<LabOrder>(`/labs/orders/${id}/receive`);
export const labUploadResult = (
  id: string,
  data: { file_name: string; content_base64: string; note?: string; final?: boolean },
) => api.post<LabOrder>(`/labs/orders/${id}/result`, data);

type LabFields = {
  kind?: LabKind;
  modalities?: string[];
  district?: string;
  address?: string;
  phone?: string;
  opening_hours?: string;
};
/** Membres du laboratoire : téléphone, horaires, adresse, quartier. */
export const updateMyLab = (data: LabFields & { laboratory_id: string }) =>
  api.post<Laboratory[]>("/labs/mine", data);
/** Administration : toute la fiche, nom et ville compris. */
export const adminUpdateLab = (id: string, data: LabFields & { name?: string; city?: string }) =>
  api.post<Laboratory>(`/admin/laboratories/${id}`, data);

export type AdminLab = Laboratory & {
  members: { id: string; full_name: string; email: string | null }[];
};
export const listAdminLabs = () => api.get<AdminLab[]>("/admin/laboratories");
export const createLab = (data: {
  name: string;
  city: string;
  kind?: LabKind;
  modalities?: string[];
  district?: string;
  address: string;
  phone?: string;
  opening_hours?: string;
}) => api.post<AdminLab[]>("/admin/laboratories", data);
export const labMember = (labId: string, data: { email?: string; remove_member_id?: string }) =>
  api.post<{ ok: true }>(`/admin/laboratories/${labId}/members`, data);
