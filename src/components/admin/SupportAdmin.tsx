/** Demandes d'aide reçues par la page « Aide et contact » : répondre, puis marquer comme traitée. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LifeBuoy, Mail, Phone, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { closeSupportRequest, listSupportRequests, type SupportRequest } from "@/api/support";
import { formatDateTime } from "@/lib/datetime";

export function SupportAdmin() {
  const [scope, setScope] = useState<"open" | "all">("open");
  const { data = [] } = useQuery({
    queryKey: ["admin-support", scope],
    queryFn: () => listSupportRequests(scope),
  });
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <LifeBuoy className="size-4 text-sunu-green" /> Demandes d'aide
          {scope === "open" ? ` (${data.length} à traiter)` : ""}
        </h2>
        <label className="flex items-center gap-2 text-xs text-sunu-ink/60">
          <input
            type="checkbox"
            checked={scope === "all"}
            onChange={(e) => setScope(e.target.checked ? "all" : "open")}
            className="accent-sunu-green"
          />
          Afficher aussi les demandes traitées
        </label>
      </div>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Répondez par email ou téléphone, puis marquez la demande comme traitée (avec une note
        interne). Les demandes traitées sont effacées automatiquement après 2 ans.
      </p>
      <div className="mt-4 divide-y divide-sunu-line">
        {data.length === 0 && (
          <p className="py-6 text-center text-sm text-sunu-ink/50">Aucune demande en attente.</p>
        )}
        {data.map((r) => (
          <SupportRow key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}

function SupportRow({ r }: { r: SupportRequest }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(r.admin_note ?? "");
  const update = useMutation({
    mutationFn: (reopen: boolean) => closeSupportRequest(r.id, { note: note || undefined, reopen }),
    onSuccess: (res) => {
      toast.success(res.status === "closed" ? "Demande traitée" : "Demande rouverte");
      qc.invalidateQueries({ queryKey: ["admin-support"] });
      qc.invalidateQueries({ queryKey: ["admin-todo"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const isEmail = r.contact.includes("@");
  return (
    <article className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sunu-dark">
            {r.name}{" "}
            <span className="rounded-full bg-sunu-surface px-2 py-0.5 text-[11px] font-semibold text-sunu-ink/70">
              {r.topic_label}
            </span>{" "}
            {!r.has_account && <span className="text-[11px] text-sunu-ink/50">· sans compte</span>}
          </p>
          <a
            href={isEmail ? `mailto:${r.contact}` : `tel:${r.contact.replace(/\s/g, "")}`}
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-sunu-green hover:underline"
          >
            {isEmail ? <Mail className="size-3.5" /> : <Phone className="size-3.5" />} {r.contact}
          </a>
        </div>
        <span className="text-xs text-sunu-ink/50">
          {formatDateTime(r.created_at, { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line rounded-lg bg-sunu-surface px-3 py-2 text-sm text-sunu-ink/80">
        {r.message}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note interne (réponse donnée…)"
          aria-label="Note interne"
          className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs"
        />
        {r.status === "open" ? (
          <button
            onClick={() => update.mutate(false)}
            disabled={update.isPending}
            className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 className="size-3.5" /> Marquer traitée
          </button>
        ) : (
          <button
            onClick={() => update.mutate(true)}
            disabled={update.isPending}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" /> Rouvrir
          </button>
        )}
      </div>
    </article>
  );
}
