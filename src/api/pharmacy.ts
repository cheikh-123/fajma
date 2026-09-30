/** Ordonnances transmises aux pharmacies (patient, pharmacien, administration). */
import { api } from "./client";
import type { EditablePharmacy, PrescriptionItem } from "./types";

export type OrderStatus =
  "sent" | "preparing" | "ready" | "unavailable" | "collected" | "cancelled";

export type PharmacyOrder = {
  id: string;
  status: OrderStatus;
  status_label: string;
  patient_note: string | null;
  pharmacy_note: string | null;
  total_price: number | null;
  created_at: string;
  updated_at: string;
  pharmacy: { id: string; name: string; address: string; city: string; phone: string | null };
  prescription: {
    id: string;
    reference: string;
    doctor_name: string;
    created_at: string;
    // Contenu : seulement pour la pharmacie, tant que la demande est en cours.
    content?: string;
    items?: PrescriptionItem[];
    instructions?: string | null;
    valid_until?: string | null;
    /** Personne soignée (l'enfant pour une ordonnance pédiatrique). */
    patient_name?: string;
    patient_birth_date?: string | null;
    patient_sex?: "F" | "M" | null;
    patient_weight_kg?: number | null;
    account_holder?: string | null;
    patient_phone?: string | null;
    doctor_order_number?: string | null;
    /** Titulaire, quand l'ordonnance est signée par son remplaçant. */
    replacing?: string | null;
    renewals?: number;
    /** Délivrances déjà faites (hors cette demande) et maximum autorisé. */
    dispensed?: number;
    max_dispensings?: number;
  };
};

export type ReceivingPharmacy = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  is_on_duty: boolean;
};

export const OPEN_STATUSES: OrderStatus[] = ["sent", "preparing", "ready"];

export const listMyOrders = () => api.get<PharmacyOrder[]>("/pharmacy/orders");

export const sendPrescription = ({
  data,
}: {
  data: { prescription_id: string; pharmacy_id: string; note?: string };
}) => api.post<PharmacyOrder>("/pharmacy/orders", data);

export const cancelOrder = (id: string) => api.post<{ ok: true }>(`/pharmacy/orders/${id}/cancel`);

export const listReceivingPharmacies = () => api.get<ReceivingPharmacy[]>("/pharmacy/receiving");

export const getPharmacyDashboard = () =>
  api.get<{
    pharmacies: { id: string; name: string; city: string }[];
    orders: PharmacyOrder[];
    /** « Avez-vous ce médicament ? » : questions des patients (sans leur identité). */
    medicine_questions: MedicineQuestion[];
  }>("/pharmacy/dashboard");

export const updateOrder = ({
  data,
}: {
  data: {
    id: string;
    status: "preparing" | "ready" | "unavailable" | "collected";
    note?: string;
    total_price?: number;
  };
}) => api.post<PharmacyOrder>(`/pharmacy/orders/${data.id}/status`, data);

export type PharmacyMemberRow = {
  id: string;
  pharmacy: string;
  city: string;
  user: string;
  email: string | null;
};

export type MedicineQuery = {
  id: string;
  medicine: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  expired: boolean;
  answers: {
    id: string;
    status: "pending" | "available" | "unavailable";
    price: number | null;
    note: string | null;
    answered_at: string | null;
    pharmacy: {
      id: string;
      name: string;
      city: string;
      address: string;
      phone: string | null;
      latitude: number;
      longitude: number;
    };
  }[];
};

export type MedicineQuestion = {
  id: string;
  status: "pending" | "available" | "unavailable";
  medicine: string;
  note: string | null;
  pharmacy: string;
  created_at: string;
  expires_at: string;
  price: number | null;
};

export const listMyMedicineQueries = () => api.get<MedicineQuery[]>("/pharmacy/queries");
export const askMedicine = (data: { medicine: string; note?: string; pharmacy_ids: string[] }) =>
  api.post<MedicineQuery>("/pharmacy/queries", data);
export const answerMedicine = (
  id: string,
  data: { status: "available" | "unavailable"; price?: number; note?: string },
) => api.post<{ ok: true }>(`/pharmacy/answers/${id}`, data);

export type PharmacyUpdate = {
  phone?: string;
  address?: string;
  district?: string;
  opens_at?: string;
  closes_at?: string;
  open_days?: number[];
  is_on_duty?: boolean;
  /** Fin de la garde (ISO) ; absent = jusqu'à nouvel ordre. */
  on_duty_until?: string;
};

/** Officines du pharmacien connecté (horaires, garde, coordonnées). */
export const getMyPharmacies = () => api.get<EditablePharmacy[]>("/pharmacy/mine");

export const updateMyPharmacy = (data: PharmacyUpdate & { pharmacy_id: string }) =>
  api.post<EditablePharmacy[]>("/pharmacy/mine", data);

export const listAdminPharmacies = (q?: string) =>
  api.get<EditablePharmacy[]>("/admin/pharmacies", { q: q || undefined });

export const createPharmacy = (
  data: PharmacyUpdate & {
    name: string;
    city: string;
    address: string;
    latitude?: number;
    longitude?: number;
  },
) => api.post<EditablePharmacy>("/admin/pharmacies", data);

export const adminUpdatePharmacy = (
  id: string,
  data: PharmacyUpdate & { name?: string; city?: string; relocate?: boolean },
) => api.post<EditablePharmacy>(`/admin/pharmacies/${id}`, data);

export const listPharmacyMembers = () => api.get<PharmacyMemberRow[]>("/admin/pharmacy-members");

export const addPharmacyMember = ({ data }: { data: { pharmacy_id: string; email: string } }) =>
  api.post<PharmacyMemberRow[]>("/admin/pharmacy-members", data);

export const removePharmacyMember = (id: string) =>
  api.post<{ ok: true }>(`/admin/pharmacy-members/${id}/delete`);
