/** Back-office : validation des médecins et établissements, supervision des rappels SMS. */
import { api } from "./client";

export type VerifiableEstablishment = {
  id: string;
  name: string;
  city: string;
  is_verified: boolean;
  created_at: string;
};
export type VerificationKind = "doctor" | "clinic" | "pharmacy" | "laboratory";

export const getAdminOverview = () =>
  api.get<{
    doctors: {
      id: string;
      full_name: string;
      city: string;
      is_verified: boolean;
      created_at: string;
      specialty_id: string;
      specialty: string;
    }[];
    appointments: { id: string; status: string; mode: string; scheduled_at: string }[];
    clinics: VerifiableEstablishment[];
    pharmacies: VerifiableEstablishment[];
    laboratories: VerifiableEstablishment[];
    payments: {
      id: string;
      amount: number;
      status: string;
      currency: string;
      created_at: string;
    }[];
  }>("/admin/overview");

export type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  roles: (
    "patient" | "doctor" | "pharmacist" | "lab" | "clinic_owner" | "clinic_staff" | "admin"
  )[];
  is_active: boolean;
  mfa_enabled: boolean;
  date_joined: string;
  last_login: string | null;
  doctor: { id: string; full_name: string; is_verified: boolean } | null;
  upcoming_appointments: number;
};

export const searchUsers = (q: string, suspendedOnly = false) =>
  api.get<AdminUser[]>("/admin/users", {
    q: q || undefined,
    status: suspendedOnly ? "suspended" : undefined,
  });

export const adminUserAction = (
  id: string,
  action: "suspend" | "reactivate" | "reset_mfa",
  reason?: string,
) => api.post<AdminUser>(`/admin/users/${id}`, { action, reason });

export type AdminTodo = {
  doctors_to_verify: number;
  credentials_pending: number;
  credentials_expiring: number;
  mdo_to_declare?: number;
  clinics_to_verify: number;
  reviews_reported: number;
  payouts_requested: number;
  refunds_pending: number;
  support_open: number;
  sms_failed: number;
};
export const getAdminTodo = () => api.get<AdminTodo>("/admin/todo");

export const setVerification = ({
  data,
}: {
  data: { kind: VerificationKind; id: string; verified: boolean };
}) => api.post<{ ok: true }>("/admin/verification", data);

/** Correction du nom ou de la spécialité d'une fiche médecin (motif obligatoire). */
export const correctDoctor = (
  id: string,
  data: { full_name: string; specialty_id: string; reason: string },
) => api.post<{ ok: true }>(`/admin/doctors/${id}`, data);

export const listSmsReminders = () =>
  api.get<
    {
      id: string;
      kind: string;
      status: string;
      attempts: number;
      recipient_phone: string;
      last_error: string | null;
      scheduled_for: string;
      sent_at: string | null;
      message: string;
    }[]
  >("/admin/sms");

export const retrySmsReminder = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>("/admin/sms/retry", data);

export type ReviewToModerate = import("./types").ProReview & {
  doctor_name: string;
  patient_name: string;
  reported_at: string | null;
};

export const listReviewsToModerate = () => api.get<ReviewToModerate[]>("/admin/reviews");

export const moderateReview = ({ data }: { data: { id: string; decision: "publish" | "hide" } }) =>
  api.post<{ ok: true }>(`/admin/reviews/${data.id}`, { decision: data.decision });

export type AdminCredential = import("./credentials").Credential & {
  owner_type: VerificationKind;
  owner_type_label: string;
  owner_id: string;
  owner_name: string;
  doctor_id: string | null;
  doctor_name: string | null;
};

export const listCredentials = () => api.get<AdminCredential[]>("/admin/credentials");

export const reviewCredential = ({
  data,
}: {
  data: { id: string; decision: "accepted" | "rejected"; note?: string };
}) =>
  api.post<AdminCredential>(`/admin/credentials/${data.id}`, {
    decision: data.decision,
    note: data.note,
  });

export type AnalyticsWeek = {
  week: string;
  booked: number;
  completed: number;
  no_show: number;
  cancelled: number;
  teleconsultations: number;
  new_patients: number;
  online_volume: number;
  commission: number;
};

export type Analytics = {
  series: AnalyticsWeek[];
  kpis: {
    patients: number;
    doctors_verified: number;
    doctors_pending: number;
    clinics: number;
    partner_pharmacies: number;
    paying_subscriptions: number;
    no_show_rate: number;
    teleconsultation_share: number;
  };
  by_channel: { channel: "web" | "whatsapp" | "ussd" | "clinic"; n: number }[];
  by_specialty: { name: string; n: number }[];
  by_city: { name: string; n: number }[];
};

export const getAnalytics = (weeks = 12) =>
  api.get<Analytics>("/admin/analytics", { weeks: String(weeks) });

export type ActivityMonth = {
  month: string;
  label: string;
  new_patients: number;
  active_patients: number;
  new_doctors: number;
  appointments_booked: number;
  appointments_completed: number;
  teleconsultations: number;
  no_shows: number;
  prescriptions: number;
  pharmacy_orders: number;
  lab_orders: number;
  online_volume: number;
  commission: number;
  subscriptions: number;
  revenue: number;
};

export type ActivityReport = {
  generated_at: string;
  period: { from: string; to: string; months: number };
  totals: {
    patients: number;
    doctors_verified: number;
    cities: number;
    clinics: number;
    partner_pharmacies: number;
    partner_labs: number;
    appointments_completed: number;
    revenue: number;
    online_volume: number;
    returning_patients_rate: number | null;
    no_show_rate: number | null;
    reviews: number;
    average_rating: number | null;
    growth_appointments: number | null;
    growth_patients: number | null;
  };
  channels: { channel: string; n: number }[];
  months: ActivityMonth[];
};

export const getActivityReport = (months: number) =>
  api.get<ActivityReport>("/admin/activity-report", { months });

export const activityReportCsvUrl = (months: number) =>
  `/api/admin/activity-report?months=${months}&export=csv`;
