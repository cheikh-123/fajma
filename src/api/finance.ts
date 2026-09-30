/** Argent : revenus du médecin (solde, virements, abonnement) et suivi financier de l'administration. */
import { api } from "./client";

export type PlanId = "essentiel" | "pro" | "clinique";
export type PayoutMethod = "wave" | "orange_money" | "bank";

export type Plan = {
  id: PlanId;
  name: string;
  monthly_price: number;
  commission_percent: number;
  features: string[];
  prices: Record<string, number>;
};

export type Payout = {
  id: string;
  reference: string;
  amount: number;
  method: PayoutMethod;
  method_label: string;
  destination: string;
  status: "requested" | "paid" | "rejected";
  note: string | null;
  created_at: string;
  processed_at: string | null;
};

export type LedgerEntry = {
  id: string;
  kind: "earning" | "refund" | "payout" | "payout_reversal";
  label: string;
  amount: number;
  gross: number;
  commission: number;
  description: string;
  created_at: string;
};

export type ProFinance = {
  balance: number;
  min_payout: number;
  currency: string;
  totals: { gross: number; commission: number; count: number };
  entries: LedgerEntry[];
  payouts: Payout[];
  subscription: {
    plan: PlanId;
    plan_name: string;
    commission_percent: number;
    current_period_end: string | null;
  };
  plans: Plan[];
  durations: { months: number; discount_percent: number }[];
};

export type AdminRefund = {
  id: string;
  amount: number;
  status: "pending" | "done";
  reason: string | null;
  payment_reference: string;
  method: string;
  patient_name: string;
  patient_phone: string | null;
  doctor_name: string;
  transfer_reference: string | null;
  created_at: string;
  processed_at: string | null;
};

export type AdminFinance = {
  totals: {
    online_volume: number;
    commission: number;
    subscriptions: number;
    doctors_balance: number;
  };
  payouts: (Payout & { doctor_name: string })[];
  refunds: AdminRefund[];
};

export const getProFinance = () => api.get<ProFinance>("/pro/finance");

export const requestPayout = ({
  data,
}: {
  data: { amount: number; method: PayoutMethod; destination: string };
}) => api.post<Payout>("/pro/payouts", data);

export const startSubscription = ({
  data,
}: {
  data: { plan: Exclude<PlanId, "essentiel">; months: number };
}) =>
  api.post<{ url: string; reference: string; amount: number }>("/pro/subscription/checkout", data);

export const refreshSubscription = (id: string) =>
  api.post<{ status: "pending" | "paid" | "failed"; plan: PlanId; period_end: string | null }>(
    `/pro/subscription/${id}/refresh`,
  );

export const getAdminFinance = () => api.get<AdminFinance>("/admin/finance");

export const processPayout = ({
  data,
}: {
  data: { id: string; decision: "paid" | "rejected"; note?: string };
}) =>
  api.post<{ ok: true }>(`/admin/payouts/${data.id}`, { decision: data.decision, note: data.note });

export const completeRefund = ({ data }: { data: { id: string; transfer_reference: string } }) =>
  api.post<{ ok: true }>(`/admin/refunds/${data.id}`, {
    transfer_reference: data.transfer_reference,
  });

/** Formules des professionnels (page publique « Tarifs »). */
export const getPublicPlans = () =>
  api.get<{ plans: Plan[]; durations: { months: number; discount_percent: number }[] }>(
    "/directory/plans",
  );
