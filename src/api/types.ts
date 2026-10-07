/** Formats des données renvoyées par l'API Django. */

export type Mode = "in_person" | "teleconsultation" | "home_visit";
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PayMethod = "wave" | "orange_money" | "free_money" | "cash" | "credit" | "card";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type User = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  city: string | null;
  is_admin: boolean;
  is_doctor: boolean;
  is_pharmacist: boolean;
  mfa_enabled: boolean;
  phone_verified: boolean;
  preferred_language?: "fr" | "wo" | "en";
  /** Compte rattaché à un laboratoire d'analyses. */
  is_lab?: boolean;
  is_clinic_staff?: boolean;
  /** Relais communautaire habilité. */
  is_community_agent?: boolean;
  /** Médecin, pharmacien, clinique ou administrateur : double authentification obligatoire. */
  is_professional?: boolean;
  /** Compte professionnel sans double authentification : il doit l'activer avant d'aller plus loin. */
  mfa_setup_required?: boolean;
  /** Faux pour un compte ouvert par SMS sans mot de passe. */
  has_password?: boolean;
  /** Nouvelle adresse en attente de confirmation (lien envoyé). */
  pending_email?: string | null;
};

export type Specialty = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description?: string;
};

export type ConsultationType = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  mode: "in_person" | "teleconsultation" | "both" | "home_visit";
  is_active: boolean;
  position: number;
  /** Nombre maximal de séances réservables en une fois (0 = pas de série). */
  series_max: number;
};

/** Adresse d'une visite à domicile. */
export type HomeVisit = {
  address: string;
  landmark: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Séance d'une série (rang et nombre de séances réservées). */
export type SeriesInfo = { id: string; index: number; total: number; interval_days: number };

export type DoctorSummary = {
  id: string;
  full_name: string;
  city: string;
  address: string | null;
  bio: string | null;
  years_experience: number;
  consultation_price: number;
  currency: string;
  teleconsultation: boolean;
  home_visits: boolean;
  home_visit_fee: number;
  home_visit_area: string | null;
  languages: string[];
  rating: number;
  reviews_count: number;
  avatar_url: string | null;
  specialty: Specialty | null;
  latitude: number | null;
  longitude: number | null;
};

export type DoctorLocation = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type DoctorListItem = DoctorSummary & {
  next_slot: Slot | null;
  accepts_new_patients: boolean;
  /** Distance au lieu recherché (ville connue ou position GPS), sinon null. */
  distance_km: number | null;
};

export type DoctorDetail = DoctorSummary & {
  consultation_types: ConsultationType[];
  /** Questions facultatives du médecin (par défaut, et propres à certains motifs). */
  questionnaire?: Question[];
  questionnaires_by_type?: Record<string, Question[]>;
  accepts_new_patients: boolean;
  cancellation_deadline_hours: number;
  booking_instructions: string | null;
  auto_confirm: boolean;
  teleconsultation_prepayment: boolean;
  locations: DoctorLocation[];
  insurers: AcceptedInsurer[];
  /** Remplacements acceptés, en cours ou à venir (dates incluses). */
  replacements: {
    starts_on: string;
    ends_on: string;
    replacement: { id: string; full_name: string; specialty: string | null };
  }[];
};

export type Insurer = {
  id: string;
  slug: string;
  name: string;
  kind: "ipm" | "mutuelle" | "assurance" | "public";
  kind_label: string;
  default_coverage_percent: number;
};

export type AcceptedInsurer = Insurer & { tiers_payant: boolean };

export type Coverage = {
  id: string;
  insurer: Insurer;
  member_number: string;
  coverage_percent: number;
  valid_until: string | null;
  relative: { id: string; full_name: string } | null;
};

/** Assurance retenue pour un rendez-vous (valeurs figées à la réservation). */
export type AppointmentInsurance = {
  insurer: string;
  member_number: string;
  coverage_percent: number;
  tiers_payant: boolean;
  patient_share: number | null;
  insurer_share: number | null;
};

export type Slot = {
  iso: string;
  label: string;
  location_id?: string | null;
  /** Nom du médecin remplaçant qui assure ce créneau. */
  replacement?: string | null;
};

export type SeriesSession = {
  iso: string;
  label: string;
  available: boolean;
  problem: string | null;
  replacement: string | null;
};
export type SlotsResponse = { slots: Slot[]; hasAvailability: boolean };

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  doctor_reply: string | null;
  replied_at: string | null;
};

export type ProReview = Review & {
  status: "published" | "reported" | "hidden";
  report_reason: string | null;
};

export type Pharmacy = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  is_on_duty: boolean;
  /** Fin de la garde en cours (null = jusqu'à nouvel ordre). */
  on_duty_until?: string | null;
  opens_at: string;
  closes_at: string;
  /** Jours d'ouverture : 0 = dimanche … 6 = samedi. */
  open_days?: number[];
  latitude: number;
  longitude: number;
};

/** Officine telle que la modifient son pharmacien ou l'administration. */
export type EditablePharmacy = Pharmacy & { is_on_duty_setting: boolean; members: number };

export type PaymentSummary = {
  id: string;
  status: PaymentStatus;
  method: PayMethod;
  amount: number;
  reference: string;
  checkout_url: string | null;
  created_at: string;
  refund_status: "pending" | "done" | null;
};

export type PatientAppointment = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  mode: Mode;
  status: AppointmentStatus;
  reason: string | null;
  doctor_id: string;
  teleconsultation_room: string | null;
  price: number | null;
  doctor: {
    id: string;
    full_name: string;
    city: string;
    consultation_price: number;
    currency: string;
    specialty: { name: string } | null;
  } | null;
  payments: PaymentSummary[];
  relative: { id: string; full_name: string } | null;
  consultation_type: { id: string; name: string } | null;
  /** Annuler reste possible tant que le rendez-vous est actif. */
  can_cancel: boolean;
  /** Déplacer en ligne : seulement avant le délai fixé par le médecin. */
  can_move: boolean;
  /** Passé ce délai, l'annulation reste possible mais le cabinet est prévenu aussitôt. */
  late_cancellation_warning: boolean;
  late_cancellation: boolean;
  cancellation_deadline_hours: number;
  booking_instructions: string | null;
  cancelled_by: "patient" | "doctor" | "clinic" | null;
  cancel_reason: string | null;
  has_review: boolean;
  location: { name: string; address: string; city: string } | null;
  insurance: AppointmentInsurance | null;
  amount_due: number;
  questionnaire: Question[] | null;
  answers: Record<string, string | boolean> | null;
  answered_at: string | null;
  can_answer: boolean;
  visit: HomeVisit | null;
  /** Médecin remplaçant qui assure le rendez-vous. */
  practitioner: { id: string; full_name: string } | null;
  series: SeriesInfo | null;
};

export type Question = {
  id: string;
  label: string;
  type: "text" | "yesno" | "choice";
  required: boolean;
  options?: string[];
};

export type DoctorAppointment = {
  id: string;
  doctor_id: string;
  scheduled_at: string;
  mode: Mode;
  status: AppointmentStatus;
  reason: string | null;
  duration_minutes: number;
  patient_id: string | null;
  teleconsultation_room: string | null;
  external_patient_name: string | null;
  external_patient_phone: string | null;
  relative: {
    full_name: string;
    relationship: string;
    birth_date: string | null;
    sex?: Sex | null;
  } | null;
  consultation_type: { name: string } | null;
  patient: {
    full_name: string;
    phone: string | null;
    city: string | null;
    birth_date?: string | null;
    sex?: Sex | null;
  } | null;
  arrived_at: string | null;
  cancelled_by: "patient" | "doctor" | "clinic" | null;
  cancel_reason: string | null;
  /** Annulation faite après le délai : le créneau s'est libéré tard. */
  late_cancellation: boolean;
  paid: boolean;
  location_id: string | null;
  insurance: AppointmentInsurance | null;
  questionnaire:
    { label: string; type: Question["type"]; answer: string | boolean | null }[] | null;
  answered_at: string | null;
  visit: HomeVisit | null;
  /** Remplaçant qui assure la consultation (peut être le médecin connecté). */
  practitioner: { id: string; full_name: string } | null;
  /** Médecin titulaire de l'agenda. */
  doctor_name: string;
  series: SeriesInfo | null;
};

export type Relative = {
  id: string;
  full_name: string;
  relationship: "enfant" | "conjoint" | "parent" | "autre";
  birth_date: string | null;
  sex?: Sex | null;
  phone: string | null;
};

export type Sex = "F" | "M";

export type WaitlistItem = {
  id: string;
  doctor_id: string;
  created_at: string;
  notified_at: string | null;
  doctor: { full_name: string; city: string; specialty: { name: string } | null } | null;
};

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  birth_date?: string | null;
  sex?: Sex | null;
  avatar_url: string | null;
  notification_channel: "sms" | "whatsapp";
  preferred_language: "fr" | "wo" | "en";
};

export type HealthData = {
  profile: Profile | null;
  records: {
    id: string;
    appointment_id: string;
    summary: string;
    diagnosis: string | null;
    treatment: string | null;
    created_at: string;
    doctor: { full_name: string; specialty: { name: string } | null } | null;
  }[];
  prescriptions: {
    id: string;
    appointment_id: string;
    reference: string | null;
    content: string;
    instructions: string | null;
    valid_until: string | null;
    created_at: string;
    doctor: { id?: string; full_name: string } | null;
    for_relative?: string | null;
  }[];
  reviews: {
    id: string;
    appointment_id: string;
    doctor_id: string;
    rating: number;
    comment: string | null;
  }[];
};

export type DoctorProfile = {
  id: string;
  full_name: string;
  city: string;
  address: string | null;
  bio: string | null;
  years_experience: number;
  consultation_price: number;
  currency: string;
  teleconsultation: boolean;
  languages: string[];
  avatar_url: string | null;
  is_verified: boolean;
  latitude?: number | null;
  longitude?: number | null;
  specialty: { id: string; slug: string; name: string } | null;
} & DoctorSettings;

export type DoctorSettings = {
  auto_confirm: boolean;
  min_notice_hours: number;
  booking_horizon_days: number;
  accepts_new_patients: boolean;
  cancellation_deadline_hours: number;
  booking_instructions: string;
  teleconsultation_prepayment: boolean;
  home_visits: boolean;
  home_visit_fee: number;
  home_visit_area: string;
};

export type ReplacementDoctor = {
  id: string;
  full_name: string;
  city: string;
  specialty: string | null;
  order_number: string | null;
};

export type Replacement = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  starts_at: string;
  ends_at: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  responded_at: string | null;
  doctor: ReplacementDoctor;
  replacement: ReplacementDoctor;
  appointments: number;
  ongoing: boolean;
};

export type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string | null };

export type DoctorStats = {
  last_30_days: {
    total: number;
    completed: number;
    no_show: number;
    cancelled: number;
    no_show_rate: number;
    revenue_paid: number;
    patients: number;
    new_patients: number;
  };
  next_7_days: { total: number; pending: number; teleconsultations: number };
};

export type HealthProfile = {
  blood_group: string;
  allergies: string;
  conditions: string;
  treatments: string;
  vaccinations: string;
  emergency_contact: string;
  updated_at: string | null;
};

export type PatientFile = {
  patient: {
    id: string;
    full_name: string;
    phone: string | null;
    city: string | null;
    email: string;
  };
  health_profile: HealthProfile;
  prescriptions?: {
    id: string;
    reference: string;
    created_at: string;
    content: string;
    valid_until: string | null;
    renewals: number;
    for_relative: string | null;
    /** Autre médecin (titulaire ou remplaçant) qui l'a rédigée. */
    author?: string | null;
  }[];
  appointments: {
    id: string;
    scheduled_at: string;
    status: AppointmentStatus;
    mode: Mode;
    reason: string | null;
    consultation_type: string | null;
    relative: string | null;
    seen_by?: string | null;
  }[];
  records: {
    id: string;
    created_at: string;
    summary: string;
    diagnosis: string | null;
    treatment: string | null;
    author?: string | null;
  }[];
  documents: { id: string; title: string; category: string; created_at: string }[];
  measurements?: import("./care").Measurement[];
  lab_orders?: import("./labs").LabOrder[];
  notes: { id: string; content: string; created_at: string }[];
  recalls: { id: string; due_date: string; message: string; sent: boolean }[];
  stats: { total: number; no_show: number; completed: number };
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export type Availability = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  location_id: string | null;
  kind: "office" | "home_visit";
};

export type ClinicAccess = "owner" | "secretary" | "manager";

export type Clinic = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  is_verified: boolean;
  /** « clinic » : établissement de l'annuaire ; « practice » : cabinet d'un médecin seul. */
  kind?: "clinic" | "practice";
  access: ClinicAccess;
  members: {
    id: string;
    title: string;
    doctor: {
      id: string;
      full_name: string;
      city: string;
      specialty: { name: string } | null;
    } | null;
  }[];
  staff: { id: string; user_id: string; role: string; full_name: string; phone: string | null }[];
};

export type ClinicAgendaItem = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  mode: Mode;
  status: AppointmentStatus;
  reason: string | null;
  doctor: { full_name: string } | null;
  consultation_type: { name: string } | null;
  patient_name: string;
  patient_phone: string | null;
  walk_in: boolean;
  practitioner: { full_name: string } | null;
  visit: { address: string; landmark: string | null } | null;
  series: { index: number; total: number } | null;
};

export type Thread = {
  doctor_id: string;
  patient_id: string;
  title: string;
  subtitle: string;
  last_body: string | null;
  last_at: string | null;
  unread: number;
};

export type ThreadDetail = {
  me: string;
  counterpart: string;
  messages: {
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
    /** Photo ou PDF joint (servi seulement aux deux participants du fil). */
    attachment: { name: string; mime: string; size: number; url: string } | null;
  }[];
};

export type MedicalDocument = {
  id: string;
  title: string;
  category: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  file_path: string;
  shared_with: { doctor_id: string; doctor_name: string }[];
};

/** Médicament d'une ordonnance. */
export type PrescriptionItem = {
  name: string;
  dosage: string;
  posology: string;
  duration: string;
  quantity: string;
  non_substitutable: boolean;
};

/** En-tête du médecin, figé à l'émission (signature et cachet en data URL). */
export type DocumentIssuer = {
  full_name: string;
  specialty: string | null;
  title: string | null;
  order_number: string | null;
  /** Nom du titulaire quand le document est signé par son remplaçant. */
  replacing?: string | null;
  practice_name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  signature: string | null;
  stamp: string | null;
};

export type PrescriptionDetail = {
  id: string;
  reference: string | null;
  content: string;
  items: PrescriptionItem[];
  renewals: number;
  issuer: DocumentIssuer;
  instructions: string | null;
  valid_until: string | null;
  created_at: string;
  patient_id: string;
  doctor: {
    full_name: string;
    city: string;
    address: string | null;
    specialty: { name: string } | null;
  } | null;
  patient: {
    full_name: string;
    birth_date: string | null;
    sex: Sex | null;
    weight_kg: number | null;
    city: string | null;
    phone: string | null;
    /** Titulaire du compte quand l'ordonnance concerne un proche (enfant…). */
    account_holder: string | null;
  } | null;
  verify_url: string;
};

export type Receipt = {
  reference: string;
  /** Numéro légal, séquentiel et sans trou (FJ-2026-000001) ; absent pour un paiement antérieur. */
  receipt_number: string | null;
  amount: number;
  currency: string;
  method: string;
  paid_at: string;
  appointment_at: string;
  consultation: string;
  patient_name: string;
  payer_name: string;
  doctor_name: string;
  doctor_specialty: string | null;
  doctor_address: string;
  insurance: AppointmentInsurance | null;
  full_price: number | null;
};

export type TeleconsultationAccess = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  doctor_name: string;
  /** Titulaire, quand la téléconsultation est assurée par son remplaçant. */
  replacing: string | null;
  patient_name: string;
  is_doctor: boolean;
  opens_at: string;
  open_now: boolean;
  patient_ready: boolean;
  started: boolean;
  payment_required: boolean;
  room: string | null;
};
