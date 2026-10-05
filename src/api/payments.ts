/** Paiement : mobile money (PayDunya) ou au cabinet. */
import { api } from "./client";
import type { PayMethod, PaymentStatus, Receipt } from "./types";

export const startPayment = ({ data }: { data: { appointment_id: string; method: PayMethod } }) =>
  api.post<
    | { kind: "cash"; reference: string; amount: number }
    | { kind: "paid"; reference: string; amount: number }
    | { kind: "redirect"; url: string; reference: string; amount: number }
  >("/payments/start", data);

export const refreshPayment = ({ data }: { data: { payment_id: string } }) =>
  api.post<{ status: PaymentStatus; amount: number; reference: string; method: PayMethod }>(
    `/payments/${data.payment_id}/refresh`,
  );

export const getReceipt = (paymentId: string) => api.get<Receipt>(`/payments/${paymentId}/receipt`);

export const markCashPaid = (appointmentId: string) =>
  api.post<{ ok: true; reference: string }>(`/pro/appointments/${appointmentId}/cash-paid`);
