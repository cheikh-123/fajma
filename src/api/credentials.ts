/**
 * Justificatifs des médecins et des établissements (clinique, pharmacie, laboratoire).
 * Pièces exigées décidées côté serveur (backend/directory/requirements.py) : l'écran les affiche telles quelles.
 */
import { api } from "./client";

export type CredentialOwnerType = "doctor" | "clinic" | "pharmacy" | "laboratory";

export type Credential = {
  id: string;
  kind: string;
  kind_label: string;
  title: string | null;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "accepted" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
  expired: boolean;
  expires_soon: boolean;
  file_url: string;
};

export type CredentialRequirement = {
  kind: string;
  label: string;
  required: boolean;
  /** La pièce a une date de fin de validité à indiquer au dépôt. */
  expires: boolean;
};

export type CredentialStatus = {
  owner_type: CredentialOwnerType;
  owner_name: string;
  is_verified: boolean;
  requirements: CredentialRequirement[];
  missing: { kind: string; label: string }[];
  credentials: Credential[];
};

export type CredentialUpload = {
  kind: string;
  title?: string;
  expires_at?: string;
  file_name: string;
  content_base64: string;
};

/** Le médecin passe par sa route historique ; les établissements par leur identifiant. */
const path = (ownerType: CredentialOwnerType, ownerId?: string) =>
  ownerType === "doctor" ? "/pro/credentials" : `/credentials/${ownerType}/${ownerId}`;

export const getCredentials = (ownerType: CredentialOwnerType, ownerId?: string) =>
  api.get<CredentialStatus>(path(ownerType, ownerId));

export const uploadOwnerCredential = (
  ownerType: CredentialOwnerType,
  ownerId: string | undefined,
  data: CredentialUpload,
) => api.post<CredentialStatus>(path(ownerType, ownerId), data);

export const removeCredential = (id: string) => api.post<{ ok: true }>(`/credentials/${id}/delete`);
