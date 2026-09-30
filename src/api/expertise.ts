/** Télé-expertise : demandes d'avis entre médecins, avec ou sans dossier patient. */
import { api } from "./client";

type DoctorBrief = { id: string; full_name: string; specialty: string | null; city: string };

export type ExpertiseSummary = {
  id: string;
  subject: string;
  status: "open" | "answered" | "closed";
  status_label: string;
  role: "requester" | "expert";
  requester: DoctorBrief;
  expert: DoctorBrief;
  patient_name: string | null;
  updated_at: string;
  last_message: string | null;
  awaiting_me: boolean;
};

export type ExpertiseDetail = ExpertiseSummary & {
  messages: { id: string; author: string; mine: boolean; body: string; created_at: string }[];
  patient?: {
    full_name: string;
    health_profile: {
      blood_group: string;
      allergies: string;
      conditions: string;
      treatments: string;
    };
  };
  documents?: { id: string; title: string; category: string; url: string }[];
};

export const listExpertise = () => api.get<ExpertiseSummary[]>("/expertise/");

export const getExpertise = (id: string) => api.get<ExpertiseDetail>(`/expertise/${id}`);

export const searchExperts = (q: string) =>
  api.get<DoctorBrief[]>("/expertise/experts", { q: q || undefined });

export const listMyFollowedPatients = () =>
  api.get<{ id: string; full_name: string; documents: { id: string; title: string }[] }[]>(
    "/expertise/patients",
  );

export const createExpertise = ({
  data,
}: {
  data: {
    expert_id: string;
    subject: string;
    question: string;
    patient_id?: string;
    patient_informed?: boolean;
    document_ids?: string[];
  };
}) => api.post<ExpertiseSummary>("/expertise/", data);

export const replyExpertise = ({ data }: { data: { id: string; body: string } }) =>
  api.post<{ ok: true }>(`/expertise/${data.id}/messages`, { body: data.body });

export const closeExpertise = (id: string) => api.post<{ ok: true }>(`/expertise/${id}/close`);
