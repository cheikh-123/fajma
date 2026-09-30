/** Messagerie patient ↔ médecin. */
import { api } from "./client";
import type { Thread, ThreadDetail } from "./types";

export type { Thread };

export const listThreads = () => api.get<Thread[]>("/messages/threads");

export const getThread = ({ data }: { data: { doctor_id: string; patient_id: string } }) =>
  api.get<ThreadDetail>("/messages/thread", data);

export const sendChatMessage = ({
  data,
}: {
  data: {
    doctor_id: string;
    patient_id: string;
    body: string;
    /** Pièce jointe : photo ou PDF (6 Mo au plus), en base64 sans préfixe data:. */
    file_name?: string;
    content_base64?: string;
  };
}) => api.post<{ ok: true }>("/messages/send", data);
