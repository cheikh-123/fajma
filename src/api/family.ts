/** Entraide familiale : proches aidés (souvent depuis l'étranger), crédit santé, paiement et suivi à distance. */
import { api } from "./client";

export type CareLink = {
  id: string;
  role: "sponsor" | "beneficiary";
  label: string;
  status: "pending" | "active" | "revoked" | "expired";
  status_label: string;
  can_book: boolean;
  can_see_records: boolean;
  sponsor: { full_name: string };
  beneficiary: { full_name: string; phone_hint: string | null };
  balance: number;
  balance_eur: number;
  accepted_at: string | null;
  monthly_reminder_amount: number;
  low_balance_alert: number;
  invite_expires_at: string | null;
  /** Code affiché seulement en développement (sans SMS réel). */
  dev_code?: string;
};

export type FamilyAppt = {
  id: string;
  scheduled_at: string;
  status: string;
  status_label: string;
  mode: string;
  doctor: { id: string; full_name: string; specialty: string | null; city: string };
  amount_due: number;
  paid: boolean;
  paid_with: string | null;
};

export type CareLinkDetail = CareLink & {
  upcoming: FamilyAppt[];
  past: FamilyAppt[];
  credit: {
    kind: string;
    kind_label: string;
    amount: number;
    description: string;
    created_at: string;
  }[];
  records?: {
    id: string;
    created_at: string;
    doctor: string;
    summary: string | null;
    diagnosis: string | null;
    treatment: string | null;
  }[];
  prescriptions?: {
    id: string;
    reference: string;
    created_at: string;
    doctor: string;
    items: { name: string; posology: string | null; duration: string | null }[];
    content: string | null;
  }[];
};

export const XOF_PER_EUR = 655.957;
export const toEur = (xof: number) =>
  (xof / XOF_PER_EUR).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

export const listCareLinks = () => api.get<CareLink[]>("/family/links");
export const getCareLink = (id: string) => api.get<CareLinkDetail>(`/family/links/${id}`);
export const inviteRelative = (data: {
  phone: string;
  full_name: string;
  label?: string;
  lang?: string;
  can_book?: boolean;
  can_see_records?: boolean;
}) => api.post<CareLink>("/family/links", data);
export const confirmCareLink = (id: string, code: string) =>
  api.post<CareLink>(`/family/links/${id}/confirm`, { code });
export const resendCareCode = (id: string) => api.post<CareLink>(`/family/links/${id}/resend`);
export const acceptCareLink = (id: string) => api.post<CareLink>(`/family/links/${id}/accept`);
export const revokeCareLink = (id: string) => api.post<{ ok: true }>(`/family/links/${id}/revoke`);
export const updateCareLink = (id: string, data: Partial<CareLink>) =>
  api.post<CareLink>(`/family/links/${id}/settings`, data);
export const payForRelative = (id: string, appointment_id: string, method: "online" | "credit") =>
  api.post<
    | { kind: "paid"; reference: string; amount: number; balance: number }
    | { kind: "redirect"; url: string; reference: string; amount: number; amount_eur: number }
  >(`/family/links/${id}/pay`, { appointment_id, method });
export const topUpCredit = (id: string, amount: number) =>
  api.post<{ url: string; reference: string; amount: number; amount_eur: number }>(
    `/family/links/${id}/topup`,
    { amount },
  );
export const refreshTopUp = (topupId: string) =>
  api.post<{ status: string; amount: number; balance: number }>(
    `/family/topups/${topupId}/refresh`,
  );
