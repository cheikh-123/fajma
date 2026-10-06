/** Fiche 360° d'un médecin : identité, justificatifs, activité, avis, argent, établissements, actions. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Pencil, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getDoctorOverview } from "@/api/backoffice";
import { adminUserAction, setVerification } from "@/api/admin";
import { formatDate } from "@/lib/datetime";
import { DoctorCorrection } from "./DoctorCorrection";

const CRED_STATUS: Record<string, string> = {
  pending: "À vérifier",
  approved: "Validé",
  accepted: "Validé",
  rejected: "Refusé",
};

export function Doctor360({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: d, isLoading } = useQuery({
    queryKey: ["admin-doctor-360", id],
    queryFn: () => getDoctorOverview(id),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-doctor-360", id] });
    qc.invalidateQueries({ queryKey: ["admin-doctors"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-todo"] });
  };
  const verify = useMutation({
    mutationFn: (verified: boolean) => setVerification({ data: { kind: "doctor", id, verified } }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const account = useMutation({
    mutationFn: (v: { action: "suspend" | "reactivate"; reason?: string }) =>
      adminUserAction(d!.user_id!, v.action, v.reason),
    onSuccess: () => {
      toast.success("Compte mis à jour");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Fiche du médecin"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto bg-sunu-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
              Fiche 360°
            </p>
            <h2 className="mt-1 text-xl font-bold text-sunu-dark">
              {d?.full_name ?? "Chargement…"}
            </h2>
            {d && (
              <p className="text-sm text-sunu-ink/60">
                {d.specialty} · {d.city} · inscrit le {formatDate(d.created_at)}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="text-sunu-ink/50">
            <X className="size-5" />
          </button>
        </div>
        {isLoading || !d ? (
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-sunu-card" />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => verify.mutate(!d.is_verified)}
                disabled={verify.isPending}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${d.is_verified ? "bg-sunu-teal/15 text-sunu-teal" : "bg-amber-100 text-amber-800"}`}
              >
                {d.is_verified ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                {d.is_verified ? "Vérifié (retirer)" : "Valider ce médecin"}
              </button>
              <button
                onClick={() => setEditing((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold"
              >
                <Pencil className="size-3.5" /> Corriger nom ou spécialité
              </button>
              {d.user_id &&
                (d.active ? (
                  <button
                    onClick={() => {
                      const reason = window.prompt(
                        "Raison de la suspension (5 caractères au moins)",
                      );
                      if (reason) account.mutate({ action: "suspend", reason });
                    }}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    Suspendre le compte
                  </button>
                ) : (
                  <button
                    onClick={() => account.mutate({ action: "reactivate" })}
                    className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-green"
                  >
                    Réactiver le compte (suspendu)
                  </button>
                ))}
            </div>
            {editing && <DoctorCorrection doctor={d} onDone={() => setEditing(false)} />}

            <Box title="Coordonnées">
              <Line k="Email" v={d.email} />
              <Line k="Téléphone" v={d.phone} />
              <Line k="Téléphone du cabinet" v={d.practice_phone} />
              <Line k="Adresse" v={d.address} />
              <Line k="N° de l'Ordre" v={d.order_number} />
              <Line k="Formule" v={d.plan} />
              <Line
                k="Tarif"
                v={`${d.consultation_price.toLocaleString("fr-FR")} F${d.teleconsultation ? " · téléconsultation" : ""}`}
              />
              <Line k="Établissements" v={d.clinics.join(", ") || null} />
            </Box>

            <Box title={`Justificatifs (${d.credentials.length})`}>
              {d.missing.length > 0 && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Manquant : {d.missing.join(", ")}
                </p>
              )}
              {d.credentials.length === 0 && (
                <p className="text-sm text-sunu-ink/50">Aucun document déposé.</p>
              )}
              {d.credentials.map((c) => (
                <a
                  key={c.id}
                  href={c.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-sunu-green"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-sunu-ink/40" />
                    {c.title || c.kind_label}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-sunu-ink/60">
                    {c.expired ? "Expiré" : (CRED_STATUS[c.status] ?? c.status)}
                    <ExternalLink className="size-3" />
                  </span>
                </a>
              ))}
            </Box>

            <Box title="Activité">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Num n={d.stats.last_90_days} l="RDV (90 j)" />
                <Num n={d.stats.completed_90} l="honorés (90 j)" />
                <Num n={d.stats.upcoming} l="à venir" />
                <Num n={d.stats.patients} l="patients suivis" />
                <Num n={d.stats.teleconsultations_90} l="téléconsult. (90 j)" />
                <Num
                  n={d.stats.no_show_rate === null ? "—" : `${d.stats.no_show_rate} %`}
                  l="absences"
                />
              </div>
            </Box>

            <Box title="Avis des patients">
              <Line
                k="Note"
                v={
                  d.reviews.average
                    ? `${d.reviews.average} / 5 (${d.reviews.count} avis)`
                    : "Aucun avis"
                }
              />
              {d.reviews.reported > 0 && (
                <p className="text-sm text-amber-700">
                  {d.reviews.reported} avis signalé(s) à modérer
                </p>
              )}
            </Box>

            <Box title="Argent (paiements en ligne)">
              <Line k="Solde à verser" v={`${d.finance.balance.toLocaleString("fr-FR")} F`} />
              <Line k="Gagné au total" v={`${d.finance.earned_total.toLocaleString("fr-FR")} F`} />
              {d.finance.payouts.map((p) => (
                <p key={p.reference} className="text-xs text-sunu-ink/60">
                  {formatDate(p.created_at)} · {p.amount.toLocaleString("fr-FR")} F · {p.status}
                </p>
              ))}
            </Box>
          </div>
        )}
      </aside>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-4">
      <h3 className="mb-2 text-sm font-bold text-sunu-dark">{title}</h3>
      {children}
    </section>
  );
}
function Line({ k, v }: { k: string; v: string | null }) {
  return (
    <p className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-sunu-ink/55">{k}</span>
      <span className="text-right text-sunu-dark">{v || "—"}</span>
    </p>
  );
}
function Num({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="rounded-lg bg-sunu-surface p-2">
      <p className="text-lg font-bold text-sunu-dark">{n}</p>
      <p className="text-[11px] text-sunu-ink/55">{l}</p>
    </div>
  );
}
