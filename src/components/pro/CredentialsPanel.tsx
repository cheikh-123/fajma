/** Espace médecin : justificatifs (Ordre, diplômes, identité) requis pour publier la fiche. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileCheck2, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCredential,
  getMyCredentials,
  uploadCredential,
  type Credential,
} from "@/api/doctor";
import { ACCEPTED_FILES, fileToBase64 } from "@/lib/file-base64";

const KINDS: { value: Credential["kind"]; label: string }[] = [
  { value: "ordre", label: "Inscription à l'Ordre des médecins" },
  { value: "diplome", label: "Diplôme de médecine / spécialité" },
  { value: "identite", label: "Pièce d'identité" },
  { value: "autre", label: "Autre justificatif" },
];
const STATUS: Record<Credential["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-sunu-teal/15 text-sunu-teal",
  rejected: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<Credential["status"], string> = {
  pending: "En vérification",
  accepted: "Validé",
  rejected: "Refusé",
};

export function CredentialsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-credentials"], queryFn: getMyCredentials });
  const [kind, setKind] = useState<Credential["kind"]>("ordre");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choisissez un fichier");
      return uploadCredential({
        data: { kind, file_name: file.name, content_base64: await fileToBase64(file) },
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(["pro-credentials"], res);
      setFile(null);
      if (input.current) input.current.value = "";
      toast.success("Justificatif déposé : l'équipe Fajma le vérifie sous 48 h ouvrées.");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pro-credentials"] }),
    onError: (e) => toast.error(e.message),
  });
  if (!data) return null;

  return (
    <section
      aria-label="Justificatifs"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <FileCheck2 className="size-4" /> Justificatifs professionnels
      </h2>
      {!data.is_verified && (
        <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          Votre fiche n'est pas encore visible des patients : déposez votre inscription à l'Ordre
          des médecins pour qu'elle soit vérifiée.
        </p>
      )}
      <ul className="mt-3 space-y-1.5">
        {data.credentials.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <a
                href={c.file_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sunu-dark hover:underline"
              >
                {c.kind_label}
              </a>
              {c.review_note && <p className="text-xs text-red-600">{c.review_note}</p>}
            </div>
            <span className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[c.status]}`}
              >
                {STATUS_LABEL[c.status]}
              </span>
              {c.status !== "accepted" && (
                <button
                  onClick={() => remove.mutate(c.id)}
                  aria-label="Supprimer le justificatif"
                  className="text-sunu-ink/40 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 space-y-2 border-t border-sunu-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate();
        }}
      >
        <select
          aria-label="Type de justificatif"
          value={kind}
          onChange={(e) => setKind(e.target.value as Credential["kind"])}
          className="w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          ref={input}
          type="file"
          aria-label="Fichier du justificatif"
          accept={ACCEPTED_FILES}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-sunu-ink/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sunu-green-soft file:px-3 file:py-2 file:text-xs file:font-semibold file:text-sunu-green hover:file:bg-sunu-green/20"
        />
        <button
          disabled={!file || upload.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {upload.isPending && <Loader2 className="size-4 animate-spin" />} Déposer
        </button>
      </form>
    </section>
  );
}
