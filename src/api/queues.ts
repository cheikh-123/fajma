/** Ticket virtuel : files d'attente des hôpitaux et centres de santé. */
import { api } from "./client";

export type QueueServiceInfo = {
  id: string;
  name: string;
  prefix: string;
  opens_at: string;
  closes_at: string;
  open_days: number[];
  daily_capacity: number | null;
  avg_minutes: number;
  notice_ahead: number;
  is_paused: boolean;
  pause_message: string | null;
  open: boolean;
  closed_reason: string | null;
  waiting: number;
  eta_minutes: number;
  /** Minutes entre deux appels (rythme réel du jour, sinon durée moyenne déclarée). */
  pace_minutes: number;
  now_serving: string | null;
};

export type Facility = {
  id: string;
  name: string;
  kind: "hopital" | "centre_sante" | "poste_sante" | "clinique";
  kind_label: string;
  city: string;
  district: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  services: QueueServiceInfo[];
};

export type TicketPriority = "" | "enceinte" | "age" | "handicap" | "enfant" | "urgence";

export const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "", label: "Aucune priorité" },
  { value: "enceinte", label: "Femme enceinte" },
  { value: "age", label: "Personne âgée" },
  { value: "handicap", label: "Handicap" },
  { value: "enfant", label: "Jeune enfant" },
  { value: "urgence", label: "Urgence" },
];

export type QueueTicket = {
  code: string;
  label: string;
  number: number;
  day: string;
  status: "waiting" | "called" | "done" | "no_show" | "cancelled" | "expired";
  status_label: string;
  priority: TicketPriority | null;
  priority_label: string | null;
  ahead: number;
  eta_minutes: number;
  travel_minutes: number | null;
  leave_now: boolean;
  desk: string | null;
  called_at: string | null;
  created_at: string;
  service: { id: string; name: string };
  facility: { id: string; name: string; city: string; address: string | null };
};

/** Vue de l'accueil : nom et téléphone masqué en plus. */
export type DeskTicket = QueueTicket & {
  id: string;
  name: string | null;
  phone_hint: string | null;
  channel: "web" | "whatsapp" | "ussd" | "desk";
  recalls: number;
};

export type DayStats = {
  taken: number;
  waiting: number;
  done: number;
  no_show: number;
  remote: number;
  avg_wait_minutes: number | null;
  pace_minutes: number;
  by_hour: { hour: number; count: number }[];
};

export type DeskService = QueueServiceInfo & {
  queue: DeskTicket[];
  called: DeskTicket[];
  stats?: DayStats;
};

export type DeskFacility = Omit<Facility, "services"> & {
  role: "agent" | "manager";
  services: DeskService[];
};

export type Display = {
  facility: { id: string; name: string };
  services: {
    id: string;
    name: string;
    called: { label: string; desk: string | null }[];
    waiting: number;
  }[];
  at: string;
};

export const listFacilities = (params: { city?: string; q?: string } = {}) =>
  api.get<Facility[]>("/queues/facilities", params);
export const getFacility = (id: string) => api.get<Facility>(`/queues/facilities/${id}`);
export const getDisplay = (id: string) => api.get<Display>(`/queues/facilities/${id}/display`);

export const takeTicket = (serviceId: string, travel_minutes?: number) =>
  api.post<QueueTicket>(`/queues/services/${serviceId}/take`, { travel_minutes });
export const getTicket = (code: string) => api.get<QueueTicket>(`/queues/tickets/${code}`);
export const cancelTicket = (code: string) =>
  api.post<QueueTicket>(`/queues/tickets/${code}/cancel`);
export const listMyTickets = () => api.get<QueueTicket[]>("/queues/mine");

export const getDesk = () => api.get<DeskFacility[]>("/queues/desk");
export const callNext = (serviceId: string, desk: string) =>
  api.post<DeskTicket>(`/queues/services/${serviceId}/call`, { desk });
export const ticketAction = (
  ticketId: string,
  action: "done" | "no_show" | "recall" | "requeue" | "priority",
  priority?: TicketPriority,
) => api.post<DeskTicket>(`/queues/tickets/${ticketId}/action`, { action, priority });
export const walkIn = (
  serviceId: string,
  data: { name?: string; phone?: string; priority?: TicketPriority; lang?: string },
) => api.post<DeskTicket>(`/queues/services/${serviceId}/walk-in`, data);
export const pauseService = (serviceId: string, is_paused: boolean, pause_message?: string) =>
  api.post<QueueServiceInfo>(`/queues/services/${serviceId}/pause`, { is_paused, pause_message });
export type ServiceSettings = {
  id?: string;
  name: string;
  prefix: string;
  opens_at: string;
  closes_at: string;
  open_days: number[];
  daily_capacity: number | null;
  avg_minutes: number;
  notice_ahead: number;
};
export const saveService = (facilityId: string, data: ServiceSettings) =>
  api.post<QueueServiceInfo>(`/queues/facilities/${facilityId}/services`, data);

export type AdminFacility = Facility & {
  agents: { id: string; full_name: string; email: string | null; role: "agent" | "manager" }[];
};
export const listAdminFacilities = () => api.get<AdminFacility[]>("/admin/facilities");
export const createFacility = (data: {
  name: string;
  kind: Facility["kind"];
  city: string;
  district?: string;
  address?: string;
  phone?: string;
}) => api.post<AdminFacility[]>("/admin/facilities", data);
export const updateFacility = (id: string, data: Record<string, unknown>) =>
  api.post<{ ok: true }>(`/admin/facilities/${id}`, data);

/** « 25 min », « 1 h 10 », « quelques minutes ». */
export function etaLabel(minutes: number) {
  if (minutes < 5) return "quelques minutes";
  if (minutes < 60) return `${Math.max(5, Math.floor(minutes / 5) * 5)} min`;
  const m = Math.floor((minutes % 60) / 5) * 5;
  return `${Math.floor(minutes / 60)} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}
