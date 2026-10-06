/** Administration : rôles de l'équipe, réglages, annonces, recherche globale, fiche 360°, journal d'audit. */
import { api } from "./client";

export type AdminSection =
  "pilotage" | "validation" | "finance" | "support" | "sante" | "communication" | "systeme";

export const getMyAdminAccess = () =>
  api.get<{ role: string; sections: AdminSection[] }>("/admin/me");

export type SearchResult = {
  type: "user" | "doctor" | "clinic" | "pharmacy" | "lab" | "prescription" | "payment";
  label: string;
  sub: string;
  id: string;
};
export const adminSearch = (q: string) =>
  api.get<{ results: SearchResult[] }>("/admin/search", { q });

export type AdminDoctorRow = {
  id: string;
  full_name: string;
  specialty: string | null;
  specialty_id: string;
  city: string;
  is_verified: boolean;
  active: boolean | null;
  created_at: string;
};
export const listAdminDoctors = (params: { q?: string; status?: string; city?: string }) =>
  api.get<AdminDoctorRow[]>("/admin/doctors", params);

export type DoctorOverview = {
  id: string;
  full_name: string;
  specialty: string | null;
  specialty_id: string;
  city: string;
  address: string | null;
  practice_phone: string | null;
  order_number: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  active: boolean;
  is_verified: boolean;
  created_at: string;
  plan: string;
  consultation_price: number;
  teleconsultation: boolean;
  credentials: {
    id: string;
    kind_label: string;
    title: string | null;
    status: string;
    expires_at: string | null;
    expired: boolean;
    file_url: string;
  }[];
  missing: string[];
  stats: {
    total: number;
    last_90_days: number;
    completed_90: number;
    no_show_rate: number | null;
    upcoming: number;
    patients: number;
    teleconsultations_90: number;
  };
  reviews: { count: number; average: number | null; reported: number };
  finance: {
    balance: number;
    earned_total: number;
    payouts: { amount: number; status: string; created_at: string; reference: string }[];
  };
  clinics: string[];
};
export const getDoctorOverview = (id: string) =>
  api.get<DoctorOverview>(`/admin/doctors/${id}/overview`);

export type Announcement = {
  id: string;
  audience: string;
  audience_label: string;
  city: string | null;
  title: string;
  body: string;
  sms: boolean;
  email: boolean;
  recipients: number;
  created_at: string;
  by: string | null;
};
export const listAnnouncements = () => api.get<Announcement[]>("/admin/announcements");
export const previewAnnouncement = (audience: string, city: string) =>
  api.get<{ count: number }>("/admin/announcements", { preview: "1", audience, city });
export const sendAnnouncement = (data: {
  audience: string;
  city: string;
  title: string;
  body: string;
  link: string;
  sms: boolean;
  email: boolean;
}) => api.post<Announcement[]>("/admin/announcements", data);

export type PlatformSetting = {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "int";
  value: string | number;
  public: boolean;
};
export const getPlatformSettings = () => api.get<PlatformSetting[]>("/admin/settings");
export const savePlatformSettings = (data: Record<string, string | number>) =>
  api.post<PlatformSetting[]>("/admin/settings", data);
export const getSiteInfo = () =>
  api.get<{
    maintenance_message: string;
    contact_email: string;
    contact_phone: string;
    support_hours: string;
    ussd_code: string;
  }>("/site-info");

export type StaffMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_label: string;
  is_me: boolean;
};
export const listStaff = () => api.get<StaffMember[]>("/admin/staff");
export const setStaff = (data: { email: string; role?: string; remove?: boolean }) =>
  api.post<StaffMember[]>("/admin/staff", data);

export type AuditRow = {
  id: string;
  action: string;
  action_label: string;
  who: string;
  patient: string | null;
  target: string | null;
  ip: string | null;
  at: string;
  details: Record<string, unknown> | null;
};
export type AuditFilters = {
  action?: string;
  who?: string;
  patient?: string;
  from?: string;
  to?: string;
};
export const getAuditLog = (filters: AuditFilters, page: number) =>
  api.get<{
    total: number;
    page: number;
    pages: number;
    results: AuditRow[];
    actions: { value: string; label: string }[];
  }>("/admin/audit", { ...filters, page: String(page) });
