import { api } from "./client";

export type SupportTopic =
  "compte" | "rdv" | "paiement" | "ordonnance" | "pro" | "donnees" | "autre";

export const SUPPORT_TOPICS: { value: SupportTopic; label: string }[] = [
  { value: "compte", label: "Connexion et compte" },
  { value: "rdv", label: "Rendez-vous" },
  { value: "paiement", label: "Paiement et remboursement" },
  { value: "ordonnance", label: "Ordonnances et documents" },
  { value: "pro", label: "Espace professionnel" },
  { value: "donnees", label: "Mes données personnelles" },
  { value: "autre", label: "Autre question" },
];

export type SupportRequest = {
  id: string;
  name: string;
  contact: string;
  topic: SupportTopic;
  topic_label: string;
  message: string;
  status: "open" | "closed";
  admin_note: string | null;
  created_at: string;
  closed_at: string | null;
  has_account: boolean;
};

export const sendSupportRequest = (data: {
  name: string;
  contact: string;
  topic: SupportTopic;
  message: string;
  website?: string;
}) => api.post<{ ok: true }>("/support", data);

/** Demandes envoyées par l'utilisateur connecté (sans la note interne de l'équipe). */
export const listMySupportRequests = () =>
  api.get<Omit<SupportRequest, "admin_note">[]>("/support/mine");

export const listSupportRequests = (status: "open" | "all") =>
  api.get<SupportRequest[]>("/admin/support", { status });

export const closeSupportRequest = (id: string, data: { note?: string; reopen?: boolean }) =>
  api.post<SupportRequest>(`/admin/support/${id}`, data);
