/** Dossier patient : saisie et suivi de la tension, de la glycémie et du poids (pour soi ou un proche). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addMeasurement,
  deleteMeasurement,
  listMyMeasurements,
  type Measurement,
  type MeasurementKind,
} from "@/api/care";
import { listMyRelatives } from "@/api/patient";
import { formatDateTime } from "@/lib/datetime";
import { formatMeasurement } from "@/lib/measurements";
import { MeasurementsChart } from "./MeasurementsChart";

const TABS: { kind: MeasurementKind; label: string }[] = [
  { kind: "blood_pressure", label: "Tension" },
  { kind: "glucose", label: "Glycémie" },
  { kind: "weight", label: "Poids" },
];

const LEVEL: Record<Measurement["level"], { label: string; cls: string } | null> = {
  normal: null,
  high: { label: "Élevée", cls: "bg-amber-100 text-amber-800" },
  very_high: { label: "Très élevée", cls: "bg-red-100 text-red-700" },
  low: { label: "Basse", cls: "bg-sky-100 text-sky-800" },
};

export function MeasurementsSection() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<MeasurementKind>("blood_pressure");
  const [relativeId, setRelativeId] = useState("");
  const [form, setForm] = useState({
    systolic: "",
    diastolic: "",
    pulse: "",
    value: "",
    context: "fasting",
  });
  const [advice, setAdvice] = useState<Measurement | null>(null);
  const { data: relatives } = useQuery({
    queryKey: ["my-relatives"],
    queryFn: () => listMyRelatives(),
  });
  const key = ["measurements", kind, relativeId];
  const { data: items } = useQuery({
    queryKey: key,
    queryFn: () => listMyMeasurements({ kind, relative_id: relativeId || undefined, days: 180 }),
  });
  const add = useMutation({
    mutationFn: () =>
      addMeasurement(
        kind === "blood_pressure"
          ? {
              kind,
              systolic: Number(form.systolic),
              diastolic: Number(form.diastolic),
              pulse: form.pulse ? Number(form.pulse) : undefined,
              relative_id: relativeId || undefined,
            }
          : {
              kind,
              value: form.value,
              context: kind === "glucose" ? form.context : undefined,
              relative_id: relativeId || undefined,
            },
      ),
    onSuccess: (m) => {
      setAdvice(m.advice ? m : null);
      toast.success("Mesure enregistrée");
      setForm({ ...form, systolic: "", diastolic: "", pulse: "", value: "" });
      qc.invalidateQueries({ queryKey: ["measurements"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteMeasurement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["measurements"] }),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  return (
    <section id="suivi" className="scroll-mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Activity className="size-5 text-sunu-green" /> Suivi à domicile
      </h2>
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        <p className="text-xs text-sunu-ink/60">
          Notez vos mesures (tensiomètre, lecteur de glycémie, balance). Les médecins qui vous
          suivent voient la courbe. Les repères affichés sont indicatifs et ne remplacent pas leur
          avis.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-sunu-line p-0.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.kind}
                role="tab"
                aria-selected={kind === t.kind}
                onClick={() => {
                  setKind(t.kind);
                  setAdvice(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${kind === t.kind ? "bg-sunu-green text-white" : "text-sunu-ink/60"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {(relatives ?? []).length > 0 && (
            <select
              value={relativeId}
              onChange={(e) => setRelativeId(e.target.value)}
              aria-label="Pour qui ?"
              className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1 text-xs"
            >
              <option value="">Moi</option>
              {(relatives ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          {kind === "blood_pressure" ? (
            <>
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                Haut (systolique)
                <input
                  required
                  inputMode="numeric"
                  value={form.systolic}
                  onChange={(e) => setForm({ ...form, systolic: e.target.value })}
                  placeholder="130"
                  className={`${field} w-24`}
                />
              </label>
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                Bas (diastolique)
                <input
                  required
                  inputMode="numeric"
                  value={form.diastolic}
                  onChange={(e) => setForm({ ...form, diastolic: e.target.value })}
                  placeholder="80"
                  className={`${field} w-24`}
                />
              </label>
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                Pouls (facultatif)
                <input
                  inputMode="numeric"
                  value={form.pulse}
                  onChange={(e) => setForm({ ...form, pulse: e.target.value })}
                  placeholder="72"
                  className={`${field} w-24`}
                />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                {kind === "glucose" ? "Glycémie (g/L)" : "Poids (kg)"}
                <input
                  required
                  inputMode="decimal"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={kind === "glucose" ? "1,05" : "70"}
                  className={`${field} w-28`}
                />
              </label>
              {kind === "glucose" && (
                <label className="grid gap-1 text-xs text-sunu-ink/60">
                  Moment
                  <select
                    value={form.context}
                    onChange={(e) => setForm({ ...form, context: e.target.value })}
                    className={field}
                  >
                    <option value="fasting">À jeun</option>
                    <option value="after_meal">Après un repas</option>
                    <option value="random">Autre moment</option>
                  </select>
                </label>
              )}
            </>
          )}
          <button
            disabled={add.isPending}
            className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Enregistrer
          </button>
        </form>
        {kind === "blood_pressure" && (
          <p className="mt-1 text-[11px] text-sunu-ink/50">
            Une tension de « 13/8 » s'écrit 130 et 80.
          </p>
        )}
        {advice && (
          <p
            className={`mt-3 flex gap-2 rounded-lg px-3 py-2 text-sm ${advice.level === "very_high" || advice.level === "low" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {advice.advice}
          </p>
        )}
        <div className="mt-4">
          <MeasurementsChart items={items ?? []} kind={kind} />
        </div>
        <ul className="mt-3 max-h-60 divide-y divide-sunu-line overflow-y-auto text-sm">
          {(items ?? []).length === 0 && (
            <li className="py-3 text-xs text-sunu-ink/50">Aucune mesure.</li>
          )}
          {(items ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <b className="text-sunu-dark">{formatMeasurement(m)}</b>
                <span className="ml-2 text-xs text-sunu-ink/50">
                  {formatDateTime(m.measured_at, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {LEVEL[m.level] && (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${LEVEL[m.level]!.cls}`}
                  >
                    {LEVEL[m.level]!.label}
                  </span>
                )}
              </span>
              <button
                onClick={() => del.mutate(m.id)}
                aria-label="Supprimer la mesure"
                className="text-sunu-ink/40 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
