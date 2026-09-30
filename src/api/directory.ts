/** Annuaire public : spécialités, médecins, créneaux, avis, pharmacies, assistant IA. */
import { api } from "./client";
import type {
  DoctorDetail,
  DoctorListItem,
  Pharmacy,
  Review,
  SlotsResponse,
  Specialty,
} from "./types";

export const listSpecialties = () => api.get<Specialty[]>("/directory/specialties");

export type DoctorFilters = {
  city?: string;
  specialty?: string;
  query?: string;
  teleconsultation?: boolean;
  home_visit?: boolean;
  language?: string;
  available?: "today" | "week";
  max_price?: number;
  insurer?: string;
  sort?: "availability" | "price" | "rating";
  lat?: number;
  lng?: number;
};

export const listDoctors = ({ data }: { data: DoctorFilters }) =>
  api.get<DoctorListItem[]>("/directory/doctors", {
    city: data.city,
    specialty: data.specialty,
    query: data.query,
    teleconsultation: data.teleconsultation ? "1" : undefined,
    home_visit: data.home_visit ? "1" : undefined,
    language: data.language,
    available: data.available,
    max_price: data.max_price,
    insurer: data.insurer,
    sort: data.sort,
    lat: data.lat,
    lng: data.lng,
  });

/** Villes et quartiers du Sénégal correspondant au début de la saisie. */
export const listLocalities = (q: string) =>
  api.get<{ name: string; region: string; latitude: number; longitude: number }[]>(
    "/directory/localities",
    { q },
  );

export const getDoctor = ({ data }: { data: { id: string } }) =>
  api.get<DoctorDetail>(`/directory/doctors/${data.id}`);

export const listDoctorReviews = ({ data }: { data: { doctor_id: string } }) =>
  api.get<Review[]>(`/directory/doctors/${data.doctor_id}/reviews`);

export const listDoctorSlots = ({
  data,
}: {
  data: {
    doctor_id: string;
    days?: number;
    duration_minutes?: number;
    ignore_appointment_id?: string;
    mode?: import("./types").Mode;
  };
}) =>
  api.get<SlotsResponse>(`/directory/doctors/${data.doctor_id}/slots`, {
    days: data.days,
    duration_minutes: data.duration_minutes,
    ignore_appointment_id: data.ignore_appointment_id,
    mode: data.mode,
  });

export type PublicClinic = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  doctors_count: number;
  specialties: string[];
  doctors?: import("./types").DoctorListItem[];
};

export const listPublicClinics = (params: { city?: string; q?: string } = {}) =>
  api.get<PublicClinic[]>("/directory/clinics", { city: params.city, q: params.q });

export const getPublicClinic = (id: string) => api.get<PublicClinic>(`/directory/clinics/${id}`);

export const listPharmacies = ({ data }: { data?: { city?: string; onDuty?: boolean } } = {}) =>
  api.get<Pharmacy[]>("/directory/pharmacies", {
    city: data?.city,
    onDuty: data?.onDuty ? "1" : undefined,
  });

export const askSymptomAssistant = ({
  data,
}: {
  data: { messages: { role: "user" | "assistant"; content: string }[] };
}) => api.post<{ content: string }>("/directory/assistant", data);

/** Chiffres réels de la plateforme (page d'accueil). */
export const getPublicStats = () =>
  api.get<{
    doctors: number;
    cities: number;
    reviews: number;
    rating: number | null;
    by_specialty: Record<string, number>;
  }>("/directory/stats");
