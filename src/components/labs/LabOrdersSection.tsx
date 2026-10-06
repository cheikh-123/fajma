/**
 * Dossier patient : analyses et examens d'imagerie prescrits, choix du laboratoire ou du centre
 * d'imagerie (seuls ceux qui réalisent l'examen demandé sont proposés), résultats.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, FileText, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { listLaboratories, listMyLabOrders, sendLabOrder, type LabOrder } from "@/api/labs";
import { formatDate } from "@/lib/datetime";

const STATUS_CLS: Record<LabOrder["status"], string> = {
  prescribed: "bg-amber-100 text-amber-800",
  sent: "bg-sunu-green-soft text-sunu-green",
  received: "bg-sunu-green-soft text-sunu-green",
  completed: "bg-sunu-teal/15 text-sunu-teal",
  cancelled: "bg-sunu-surface text-sunu-ink/60",
};

export function LabOrdersSection() {
  const { data } = useQuery({ queryKey: ["my-lab-orders"], queryFn: listMyLabOrders });
  if (!data?.length) return null;
  return (
    <section id="analyses" className="scroll-mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <FlaskConical className="size-5 text-sunu-green" /> Analyses et imagerie ({data.length})
      </h2>
      <div className="grid gap-3">
        {data.map((o) => (
          <LabOrderCard key={o.id} order={o} />
        ))}
      </div>
    </section>
  );
}

function LabOrderCard({ order }: { order: LabOrder }) {
  const qc = useQueryClient();
  const [choosing, setChoosing] = useState(order.status === "prescribed");
  const [city, setCity] = useState("");
  const imaging = order.kind === "imagerie";
  const { data: labs } = useQuery({
    queryKey: ["laboratories", city, order.kind, order.modality],
    queryFn: () =>
      listLaboratories({ city, kind: order.kind, modality: order.modality ?? undefined }),
    enabled: choosing,
  });
  const where = imaging ? "centre d'imagerie" : "laboratoire";
  const send = useMutation({
    mutationFn: (labId: string) => sendLabOrder(order.id, labId),
    onSuccess: (o) => {
      toast.success(
        `Envoyée à ${o.laboratory?.name} : présentez-vous avec la référence ${o.reference}`,
      );
      setChoosing(false);
      qc.invalidateQueries({ queryKey: ["my-lab-orders"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <article className="rounded-xl border border-sunu-line bg-sunu-card p-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-sunu-green">
            {order.doctor.full_name} · {formatDate(order.created_at)}
            {order.for_relative ? ` · pour ${order.for_relative}` : ""}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-medium text-sunu-dark">
            {imaging && <ScanLine className="size-4 shrink-0 text-sunu-green" />}
            <span className="whitespace-pre-wrap">{order.tests}</span>
          </p>
          {order.modality_label && (
            <p className="text-xs font-semibold text-sunu-green">
              {order.modality_label}
              {order.contrast ? " · avec produit de contraste" : ""}
            </p>
          )}
          {order.instructions && (
            <p className="mt-1 text-xs text-sunu-ink/60">{order.instructions}</p>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLS[order.status]}`}
        >
          {order.urgent ? "Urgent · " : ""}
          {order.status_label}
        </span>
      </div>
      <p className="mt-2 text-xs text-sunu-ink/55">
        Référence à présenter : <b>{order.reference}</b>
      </p>
      {order.laboratory && (
        <p className="mt-1 text-xs text-sunu-ink/70">
          {order.laboratory.name} — {order.laboratory.address}, {order.laboratory.city}
          {order.laboratory.phone ? ` · ${order.laboratory.phone}` : ""}
          {order.laboratory.opening_hours ? ` · ${order.laboratory.opening_hours}` : ""}
        </p>
      )}
      {order.results.length > 0 && (
        <div className="mt-3 grid gap-1">
          {order.result_note && <p className="text-xs text-sunu-ink/70">{order.result_note}</p>}
          {order.results.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-semibold text-sunu-green hover:underline"
            >
              <FileText className="size-4" /> {d.title}
            </a>
          ))}
          <p className="text-[11px] text-sunu-ink/50">
            Résultats partagés automatiquement avec {order.doctor.full_name}.
          </p>
        </div>
      )}
      {(order.status === "prescribed" || order.status === "sent") && (
        <div className="mt-3 border-t border-sunu-line pt-3">
          {!choosing ? (
            <button
              onClick={() => setChoosing(true)}
              className="text-xs font-semibold text-sunu-green"
            >
              Changer de {where}
            </button>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-sunu-ink/70">Choisissez votre {where} :</p>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ville (ex. Dakar)"
                aria-label="Ville"
                className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
              />
              {(labs ?? []).length === 0 && (
                <p className="text-xs text-sunu-ink/50">
                  Aucun {where} partenaire ne réalise cet examen{city ? ` à ${city}` : ""}.
                </p>
              )}
              {(labs ?? []).map((lab) => (
                <button
                  key={lab.id}
                  onClick={() => send.mutate(lab.id)}
                  disabled={send.isPending}
                  className="flex justify-between gap-2 rounded-lg border border-sunu-line px-3 py-2 text-left text-xs hover:border-sunu-green disabled:opacity-50"
                >
                  <span>
                    <b className="text-sunu-dark">{lab.name}</b>
                    <span className="block text-sunu-ink/55">
                      {lab.address}, {lab.city}
                      {lab.opening_hours ? ` · ${lab.opening_hours}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-sunu-green">Choisir</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
