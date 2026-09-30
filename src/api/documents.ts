/** Documents médicaux et ordonnances. Le PDF d'ordonnance est généré dans le navigateur. */
import { api } from "./client";
import type { DocumentIssuer, MedicalDocument, PrescriptionDetail } from "./types";

export const listMyDocuments = () => api.get<MedicalDocument[]>("/documents/");

export const uploadMyDocument = ({
  data,
}: {
  data: {
    title: string;
    category: "analyse" | "imagerie" | "ordonnance" | "autre";
    file_name: string;
    mime_type: string;
    content_base64: string;
  };
}) => api.post<{ ok: true }>("/documents/", data);

export const getMyDocumentUrl = ({ data }: { data: { id: string } }) =>
  api.post<{ url: string }>(`/documents/${data.id}/url`);

export const deleteMyDocument = ({ data }: { data: { id: string } }) =>
  api.post<{ ok: true }>(`/documents/${data.id}/delete`);

export const getMyPrescription = ({ data }: { data: { id: string } }) =>
  api.get<PrescriptionDetail>(`/documents/prescriptions/${data.id}`);

export async function getMyPrescriptionPdf({ data }: { data: { id: string } }) {
  const p = await getMyPrescription({ data });
  const { buildPrescriptionPdf } = await import("@/lib/prescription-pdf");
  const reference = p.reference ?? `ORD-${p.id.slice(0, 8).toUpperCase()}`;
  const bytes = await buildPrescriptionPdf(p);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { file_name: `ordonnance-${reference}.pdf`, content_base64: btoa(binary) };
}

export const verifyPrescription = ({ data }: { data: { reference: string } }) =>
  api.post<
    | { valid: false }
    | {
        valid: true;
        reference: string;
        created_at: string;
        doctor_name: string | null;
        doctor_specialty: string | null;
        doctor_city: string | null;
        doctor_order_number?: string | null;
        practice_name?: string | null;
        /** Titulaire, si le document a été signé par son remplaçant. */
        replacing?: string | null;
        // Ordonnance
        renewals?: number;
        expired?: boolean;
        valid_until?: string | null;
        // Certificat, arrêt de travail, courrier (références DOC-…)
        document?: string;
        start_date?: string | null;
        end_date?: string | null;
        patient_initials?: string;
      }
  >("/documents/prescriptions/verify", data);

export type IssuedDocumentKind = "certificat" | "arret_travail" | "aptitude" | "courrier";

export type IssuedDocument = {
  id: string;
  kind: IssuedDocumentKind;
  kind_label: string;
  reference: string;
  body: string;
  start_date: string | null;
  end_date: string | null;
  recipient: string | null;
  created_at: string;
  subject_name: string;
  subject_birth_date: string | null;
  doctor: { full_name: string; specialty: string | null; address: string | null; city: string };
  issuer: DocumentIssuer;
  verify_url: string;
};

export const listMyIssuedDocuments = () => api.get<IssuedDocument[]>("/documents/issued");

export const issueDocument = ({
  data,
}: {
  data: {
    appointment_id: string;
    kind: IssuedDocumentKind;
    body?: string;
    start_date?: string;
    end_date?: string;
    recipient?: string;
  };
}) => api.post<IssuedDocument>(`/pro/appointments/${data.appointment_id}/documents`, data);

export const listShareTargets = () =>
  api.get<{ id: string; full_name: string; specialty: string | null }[]>(
    "/documents/share-targets",
  );

export const shareDocument = ({
  data,
}: {
  data: { id: string; doctor_id: string; shared: boolean };
}) =>
  api.post<{ ok: true }>(`/documents/${data.id}/share`, {
    doctor_id: data.doctor_id,
    shared: data.shared,
  });
