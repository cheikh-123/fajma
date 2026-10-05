/** Espace médecin : fiche, agenda, disponibilités, motifs, comptes-rendus. */
import { api } from "./client";
import type {
  AppointmentStatus,
  Availability,
  ConsultationType,
  DoctorAppointment,
  DoctorLocation,
  DoctorProfile,
  DoctorSettings,
  DoctorStats,
  PatientFile,
  PrescriptionItem,
  Replacement,
  Sex,
  TimeOff,
} from "./types";

export const getMyDoctorProfile = () => api.get<DoctorProfile | null>("/pro/profile");

/** Langues proposées sur la fiche (même liste que le serveur). */
export const DOCTOR_LANGUAGES = [
  "Français",
  "Wolof",
  "Pulaar",
  "Serere",
  "Diola",
  "Mandinka",
  "Soninké",
  "Anglais",
  "Arabe",
  "Portugais",
  "Espagnol",
] as const;

export const editMyDoctorProfile = (data: {
  full_name?: string;
  specialty_id?: string;
  bio?: string;
  years_experience?: number;
  consultation_price?: number;
  teleconsultation?: boolean;
  languages?: string[];
  city?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}) => api.post<{ ok: true; avatar_url: string | null }>("/pro/profile/edit", data);

/** Photo de profil en base64 (sans préfixe data:) ; chaîne vide = retrait. */
export const uploadMyPhoto = (content_base64: string) =>
  api.post<{ avatar_url: string | null }>("/pro/profile/photo", { content_base64 });

export type Secretariat = {
  practice: { id: string; name: string } | null;
  secretaries: { id: string; full_name: string; email: string | null; phone: string | null }[];
  other_clinics: { clinic_id: string; member_id: string; name: string }[];
};

export const getMySecretariat = () => api.get<Secretariat>("/pro/secretariat");

export const addMySecretary = (email: string) =>
  api.post<Secretariat>("/pro/secretariat", { email });

export const createMyDoctorProfile = ({
  data,
}: {
  data: {
    full_name: string;
    specialty_id: string;
    city: string;
    address?: string;
    bio?: string;
    years_experience: number;
    consultation_price: number;
    teleconsultation: boolean;
  };
}) => api.post<{ id: string }>("/pro/profile", data);

export const listDoctorAppointments = () => api.get<DoctorAppointment[]>("/pro/appointments");

export const updateAppointmentStatus = ({
  data,
}: {
  /** scope "series" : annule aussi les séances suivantes de la série. */
  data: { id: string; status: AppointmentStatus; reason?: string; scope?: "one" | "series" };
}) =>
  api.post<{ ok: true; cancelled?: number }>(`/pro/appointments/${data.id}/status`, {
    status: data.status,
    reason: data.reason,
    scope: data.scope,
  });

/** Ajoute des séances identiques à intervalle régulier après ce rendez-vous (ou la fin de sa série). */
export const repeatAppointment = ({
  data,
}: {
  data: { id: string; count: number; interval_days: number };
}) =>
  api.post<{ ok: true; created: number; skipped: string[] }>(
    `/pro/appointments/${data.id}/repeat`,
    { count: data.count, interval_days: data.interval_days },
  );

/** RDV saisi par le médecin (téléphone, patient au cabinet) : patient connu ou sans compte. */
export const createDeskAppointment = (data: {
  scheduled_at: string;
  duration_minutes?: number;
  mode?: "in_person" | "teleconsultation" | "home_visit";
  patient_id?: string;
  patient_name?: string;
  patient_phone?: string;
  reason?: string;
  consultation_type_id?: string;
  visit_address?: string;
  visit_landmark?: string;
}) => api.post<{ id: string }>("/pro/appointments/new", data);

/** Le cabinet déplace un RDV (le patient est prévenu par SMS). */
export const moveAppointment = (
  id: string,
  data: { scheduled_at: string; duration_minutes?: number },
) => api.post<{ ok: true; scheduled_at: string }>(`/pro/appointments/${id}/move`, data);

export type KnownPatient = {
  patient_id: string | null;
  name: string;
  phone: string | null;
  last_visit: string;
};

export const listKnownPatients = (q: string) =>
  api.get<KnownPatient[]>("/pro/known-patients", { q: q || undefined });

/** Liens de téléchargement des exports CSV (tableur), période incluse. */
export const proExportUrl = (
  kind: "appointments" | "insurance" | "finance",
  from: string,
  to: string,
) => `/api/pro/export/${kind}.csv?from=${from}&to=${to}`;

export const listMyReplacements = () =>
  api.get<{ given: Replacement[]; received: Replacement[] }>("/pro/replacements");

export const proposeReplacement = ({
  data,
}: {
  data: { replacement_doctor_id: string; starts_on: string; ends_on: string; note?: string };
}) => api.post<Replacement>("/pro/replacements", data);

export const respondReplacement = ({ data }: { data: { id: string; accept: boolean } }) =>
  api.post<Replacement>(`/pro/replacements/${data.id}/respond`, { accept: data.accept });

export const cancelReplacement = (id: string) =>
  api.post<{ ok: true; returned_appointments: number }>(`/pro/replacements/${id}/cancel`);

export const saveConsultationRecord = ({
  data,
}: {
  data: {
    appointment_id: string;
    summary: string;
    diagnosis?: string;
    treatment?: string;
    prescription?: string;
    items?: PrescriptionItem[];
    renewals?: number;
    validity_months?: number;
    patient_birth_date?: string;
    patient_sex?: Sex | "";
    patient_weight_kg?: string;
    instructions?: string;
  };
}) =>
  api.post<{ ok: true; prescription_id: string | null }>(
    `/pro/appointments/${data.appointment_id}/record`,
    data,
  );

/** En-tête des ordonnances et certificats : identité professionnelle, signature et cachet. */
export type PrescriptionHeader = {
  order_number: string;
  professional_title: string;
  practice_name: string;
  practice_phone: string;
  address: string;
  city: string;
  signature: string | null;
  stamp: string | null;
  /** Mentions obligatoires manquantes (empêchent de délivrer une ordonnance). */
  missing: string[];
};

export const getPrescriptionHeader = () => api.get<PrescriptionHeader>("/pro/prescription-header");

export const savePrescriptionHeader = (
  data: Omit<PrescriptionHeader, "signature" | "stamp" | "missing">,
) => api.post<PrescriptionHeader>("/pro/prescription-header", data);

/** Image PNG/JPEG en base64 (sans préfixe data:) ; chaîne vide = retrait. */
export const savePrescriptionImage = (image: "signature" | "stamp", content_base64: string) =>
  api.post<PrescriptionHeader>("/pro/prescription-header", { image, content_base64 });

export const listMyAvailability = () => api.get<Availability[]>("/pro/availability");

export type AvailabilityInput = {
  start_time: string;
  end_time: string;
  slot_minutes: number;
  location_id?: string;
  kind?: "office" | "home_visit";
};

/** Même plage ajoutée à plusieurs jours de la semaine (0 = dimanche … 6 = samedi). */
export const addMyAvailability = ({ data }: { data: AvailabilityInput & { weekdays: number[] } }) =>
  api.post<{ ok: true; created: number }>("/pro/availability", data);

export const updateMyAvailability = (id: string, data: AvailabilityInput & { weekday: number }) =>
  api.post<{ ok: true }>(`/pro/availability/${id}`, data);

export const deleteMyAvailability = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/pro/availability/${data.id}/delete`);

export const listMyConsultationTypes = () => api.get<ConsultationType[]>("/pro/consultation-types");

export const addMyConsultationType = ({
  data,
}: {
  data: {
    name: string;
    duration_minutes: number;
    price: number;
    mode: ConsultationType["mode"];
    series_max?: number;
  };
}) => api.post<{ ok: true }>("/pro/consultation-types", data);

export const updateMyConsultationType = ({
  data,
}: {
  data: { id: string; is_active?: boolean; series_max?: number };
}) =>
  api.post<{ ok: true }>(`/pro/consultation-types/${data.id}`, {
    is_active: data.is_active,
    series_max: data.series_max,
  });

export const deleteMyConsultationType = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/pro/consultation-types/${data.id}/delete`);

export const getMyWaitlistCount = () => api.get<number>("/pro/waitlist-count");

export const getMySettings = () => api.get<DoctorSettings>("/pro/settings");

export const updateMySettings = ({ data }: { data: Partial<DoctorSettings> }) =>
  api.post<DoctorSettings>("/pro/settings", data);

export const listMyTimeOff = () => api.get<TimeOff[]>("/pro/time-off");

export const addMyTimeOff = ({
  data,
}: {
  data: { starts_at: string; ends_at: string; reason?: string };
}) => api.post<{ ok: true; conflicting_appointments: number }>("/pro/time-off", data);

export const deleteMyTimeOff = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/pro/time-off/${data.id}/delete`);

export const getMyStats = () => api.get<DoctorStats>("/pro/stats");

export const markArrived = ({ data }: { data: { id: string; arrived: boolean } }) =>
  api.post<{ ok: true; arrived_at: string | null }>(`/pro/appointments/${data.id}/arrived`, {
    arrived: data.arrived,
  });

export const getPatientFile = ({ data }: { data: { patient_id: string } }) =>
  api.get<PatientFile>(`/pro/patients/${data.patient_id}`);

export const addPatientNote = ({ data }: { data: { patient_id: string; content: string } }) =>
  api.post<PatientFile>(`/pro/patients/${data.patient_id}`, { content: data.content });

export const listMyLocations = () => api.get<DoctorLocation[]>("/pro/locations");

export const addMyLocation = ({ data }: { data: Omit<DoctorLocation, "id"> }) =>
  api.post<DoctorLocation[]>("/pro/locations", data);

export const deleteMyLocation = (id: string) =>
  api.post<{ ok: true }>(`/pro/locations/${id}/delete`);

export const addRecall = ({
  data,
}: {
  data: { patient_id: string; due_date: string; message: string };
}) =>
  api.post<{ ok: true }>(`/pro/patients/${data.patient_id}/recalls`, {
    due_date: data.due_date,
    message: data.message,
  });

export const deleteRecall = (id: string) => api.post<{ ok: true }>(`/pro/recalls/${id}/delete`);

export type QuestionDraft = {
  label: string;
  type: "text" | "yesno" | "choice";
  required: boolean;
  options?: string[];
};

export const getMyQuestionnaires = () =>
  api.get<{
    default: QuestionDraft[];
    types: { id: string; name: string; questions: QuestionDraft[] }[];
  }>("/pro/questionnaires");

export const saveQuestionnaire = ({
  data,
}: {
  data: { consultation_type_id?: string; questions: QuestionDraft[] };
}) =>
  api.post<{
    default: QuestionDraft[];
    types: { id: string; name: string; questions: QuestionDraft[] }[];
  }>("/pro/questionnaires", data);

export const listMyReviews = () => api.get<import("./types").ProReview[]>("/pro/reviews");

export const replyToReview = ({ data }: { data: { id: string; reply: string } }) =>
  api.post<import("./types").ProReview>(`/pro/reviews/${data.id}/reply`, { reply: data.reply });

export const reportReview = ({ data }: { data: { id: string; reason: string } }) =>
  api.post<import("./types").ProReview>(`/pro/reviews/${data.id}/report`, { reason: data.reason });

export type { Credential } from "./credentials";

export type OnboardingStep = {
  id: string;
  title: string;
  hint: string;
  /** Onglet de l'espace médecin où faire l'étape (null : étape réalisée par l'équipe Fajma). */
  tab: "profil" | "planning" | "ordonnances" | "securite" | null;
  done: boolean;
};

export const getMyOnboarding = () =>
  api.get<{ steps: OnboardingStep[]; done: number; total: number }>("/pro/onboarding");

/** Brouillon de compte-rendu à partir des notes du médecin (IA, ou mise en forme locale sans IA). */
export const draftRecordWithAi = (appointmentId: string, notes: string) =>
  api.post<{ summary: string; diagnosis: string; treatment: string; source: "ia" | "local" }>(
    `/pro/appointments/${appointmentId}/ai-draft`,
    { notes },
  );
