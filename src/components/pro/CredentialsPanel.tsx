/**
 * Justificatifs exigés avant publication : médecin (Ordre, pièce d'identité), clinique (autorisation du ministère,
 * NINEA/RCCM, responsable, médecin responsable), pharmacie (autorisation, pharmacien titulaire), laboratoire
 * (agrément, biologiste responsable). La liste vient du serveur ; les pièces à durée limitée demandent leur date
 * de fin de validité.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, Circle, FileCheck2, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCredentials,
  removeCredential,
  uploadOwnerCredential,
  type Credential,
  type CredentialOwnerType,
} from "@/api/credentials";
import { ACCEPTED_FILES, fileToBase64 } from "@/lib/file-base64";

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
const HIDDEN_FROM: Record<CredentialOwnerType, string> = {
  doctor: "Votre fiche n'est pas encore visible des patients",
  clinic: "Votre établissement n'apparaît pas encore dans l'annuaire",
  pharmacy: "Votre officine ne reçoit pas encore les ordonnances en ligne",
  laboratory: "Votre laboratoire ne reçoit pas encore les demandes d'analyses en ligne",
};

const frDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR");
const today = () => new Date().toISOString().slice(0, 10);

export function CredentialsPanel({
  ownerType = "doctor",
  ownerId,
  title = "Justificatifs professionnels",
}: {
  ownerType?: CredentialOwnerType;
  ownerId?: string;
  title?: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["credentials", ownerType, ownerId ?? "me"];
  const { data } = useQuery({ queryKey, queryFn: () => getCredentials(ownerType, ownerId) });
  const [kind, setKind] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = data?.requirements.find((r) => r.kind === kind) ?? data?.requirements[0];
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !selected) throw new Error("Choisissez un fichier");
      if (selected.expires && !expiresAt) throw new Error("Indiquez la date de fin de validité");
      return uploadOwnerCredential(ownerType, ownerId, {
        kind: selected.kind,
        expires_at: selected.expires ? expiresAt : undefined,
        file_name: file.name,
        content_base64: await fileToBase64(file),
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(queryKey, res);
      setFile(null);
      setExpiresAt("");
      if (input.current) input.current.value = "";
      toast.success("Justificatif déposé : l'équipe Fajma le vérifie sous 48 h ouvrées.");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: removeCredential,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e) => toast.error(e.message),
  });
  if (!data || !selected) return null;
  const required = data.requirements.filter((r) => r.required);
  const missing = new Set(data.missing.map((m) => m.kind));

  return (
    <section
      aria-label="Justificatifs"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <FileCheck2 className="size-4" /> {title}
      </h2>
      {!data.is_verified && (
        <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          {HIDDEN_FROM[ownerType]} : déposez les pièces obligatoires ci-dessous. L'équipe Fajma les
          contrôle puis publie votre compte.
        </p>
      )}
      <ul aria-label="Pièces obligatoires" className="mt-3 space-y-1 text-xs">
        {required.map((r) => (
          <li key={r.kind} className="flex items-start gap-1.5">
            {missing.has(r.kind) ? (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-sunu-teal" />
            )}
            <span className={missing.has(r.kind) ? "text-sunu-ink/80" : "text-sunu-ink/50"}>
              {r.label}
              {missing.has(r.kind) ? " (obligatoire, à valider)" : " (validée)"}
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1.5 border-t border-sunu-line pt-3">
        {data.credentials.length === 0 && (
          <li className="text-xs text-sunu-ink/50">Aucun document déposé pour l'instant.</li>
        )}
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
              {c.expires_at && (
                <p
                  className={`text-xs ${c.expired ? "text-red-600" : c.expires_soon ? "text-amber-700" : "text-sunu-ink/50"}`}
                >
                  {c.expired ? "Expiré le " : "Valable jusqu'au "}
                  {frDate(c.expires_at)}
                  {c.expired || c.expires_soon ? " : déposez la nouvelle version" : ""}
                </p>
              )}
              {c.review_note && <p className="text-xs text-red-600">{c.review_note}</p>}
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.expired ? "bg-red-100 text-red-700" : STATUS[c.status]}`}
              >
                {c.expired ? "Expiré" : STATUS_LABEL[c.status]}
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
          value={selected.kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
        >
          {data.requirements.map((r) => (
            <option key={r.kind} value={r.kind}>
              {r.label}
              {r.required ? " (obligatoire)" : ""}
            </option>
          ))}
        </select>
        {selected.expires && (
          <label className="block text-xs text-sunu-ink/70">
            Date de fin de validité
            <input
              type="date"
              required
              min={today()}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
            />
          </label>
        )}
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
