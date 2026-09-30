/** Dossier patient : rappels de prise de médicaments (notification gratuite, SMS en option). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlarmClock, Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addMedicationReminder,
  listMedicationReminders,
  updateMedicationReminder,
} from "@/api/care";
import { listMyRelatives } from "@/api/patient";
import { formatDate } from "@/lib/datetime";

const PRESETS: Record<string, string[]> = {
  "1": ["08:00"],
  "2": ["08:00", "20:00"],
  "3": ["08:00", "13:00", "20:00"],
  "4": ["07:00", "12:00", "17:00", "22:00"],
};

type Rx = { id: string; content: string; for_relative?: string | null };

export function MedicationRemindersSection({ prescriptions }: { prescriptions: Rx[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["medication-reminders"],
    queryFn: listMedicationReminders,
  });
  const { data: relatives } = useQuery({
    queryKey: ["my-relatives"],
    queryFn: () => listMyRelatives(),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    medicine: "",
    dosage: "",
    perDay: "2",
    times: PRESETS["2"],
    days: "7",
    sms: false,
    relative_id: "",
    prescription_id: "",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["medication-reminders"] });
  const add = useMutation({
    mutationFn: () =>
      addMedicationReminder({
        medicine: form.medicine.trim(),
        dosage: form.dosage || undefined,
        times: form.times,
        days: form.days ? Number(form.days) : undefined,
        sms: form.sms,
        relative_id: form.relative_id || undefined,
        prescription_id: form.prescription_id || undefined,
      }),
    onSuccess: () => {
      toast.success("Rappel programmé : vous serez prévenu à chaque prise");
      setOpen(false);
      setForm({ ...form, medicine: "", dosage: "" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; active?: boolean; delete?: boolean }) =>
      updateMedicationReminder(v.id, { active: v.active, delete: v.delete }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  // Lignes de l'ordonnance choisie (une ligne = un médicament).
  const lines =
    prescriptions
      .find((p) => p.id === form.prescription_id)
      ?.content.split("\n")
      .map((l) => l.replace(/^[-•\d.\s]+/, "").trim())
      .filter((l) => l.length > 2) ?? [];
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  return (
    <section id="medicaments" className="scroll-mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <AlarmClock className="size-5 text-sunu-teal" /> Rappels de médicaments
      </h2>
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        <div className="grid gap-2">
          {(data ?? []).length === 0 && (
            <p className="text-xs text-sunu-ink/50">
              Aucun rappel. Programmez-en un pour ne plus oublier une prise.
            </p>
          )}
          {(data ?? []).map((r) => (
            <div
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm ${r.active ? "" : "opacity-50"}`}
            >
              <span className="min-w-0">
                <b className="text-sunu-dark">{r.medicine}</b>
                {r.dosage && <span className="text-sunu-ink/60"> · {r.dosage}</span>}
                {r.relative && (
                  <span className="text-sunu-ink/60"> · pour {r.relative.full_name}</span>
                )}
                <span className="block text-xs text-sunu-ink/55">
                  {r.times.join(", ")}
                  {r.end_date
                    ? ` · jusqu'au ${formatDate(`${r.end_date}T12:00:00Z`)}`
                    : " · sans date de fin"}
                  {r.sms ? " · SMS" : " · notification"}
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  onClick={() => update.mutate({ id: r.id, active: !r.active })}
                  aria-label={r.active ? "Suspendre" : "Reprendre"}
                  className="text-sunu-ink/50 hover:text-sunu-green"
                >
                  {r.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  onClick={() => update.mutate({ id: r.id, delete: true })}
                  aria-label="Supprimer"
                  className="text-sunu-ink/40 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-sunu-green"
          >
            <Plus className="size-4" /> Nouveau rappel
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="mt-4 grid gap-2 border-t border-sunu-line pt-4 text-sm"
          >
            {prescriptions.length > 0 && (
              <select
                value={form.prescription_id}
                onChange={(e) => setForm({ ...form, prescription_id: e.target.value })}
                aria-label="À partir d'une ordonnance"
                className={field}
              >
                <option value="">Saisie libre (ou choisir une ordonnance)</option>
                {prescriptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.content.split("\n")[0]?.slice(0, 60)}
                    {p.for_relative ? ` — pour ${p.for_relative}` : ""}
                  </option>
                ))}
              </select>
            )}
            {lines.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lines.map((l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setForm({ ...form, medicine: l.slice(0, 160) })}
                    className={`rounded-md border px-2 py-1 text-xs ${form.medicine === l.slice(0, 160) ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line"}`}
                  >
                    {l.length > 50 ? `${l.slice(0, 50)}…` : l}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                required
                minLength={2}
                value={form.medicine}
                onChange={(e) => setForm({ ...form, medicine: e.target.value })}
                placeholder="Médicament (ex. Amoxicilline 1 g)"
                aria-label="Médicament"
                className={field}
              />
              <input
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                placeholder="Dose (ex. 1 comprimé)"
                aria-label="Dose"
                className={field}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                Prises par jour
                <select
                  value={form.perDay}
                  onChange={(e) =>
                    setForm({ ...form, perDay: e.target.value, times: PRESETS[e.target.value] })
                  }
                  className={field}
                >
                  <option value="1">1 fois</option>
                  <option value="2">2 fois</option>
                  <option value="3">3 fois</option>
                  <option value="4">4 fois</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-sunu-ink/60">
                Pendant (jours)
                <input
                  inputMode="numeric"
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                  placeholder="vide = sans fin"
                  className={field}
                />
              </label>
              {(relatives ?? []).length > 0 && (
                <label className="grid gap-1 text-xs text-sunu-ink/60">
                  Pour
                  <select
                    value={form.relative_id}
                    onChange={(e) => setForm({ ...form, relative_id: e.target.value })}
                    className={field}
                  >
                    <option value="">Moi</option>
                    {(relatives ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {form.times.map((t, i) => (
                <input
                  key={i}
                  type="time"
                  value={t}
                  aria-label={`Heure de prise ${i + 1}`}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      times: form.times.map((x, j) => (j === i ? e.target.value : x)),
                    })
                  }
                  className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-sunu-ink/70">
              <input
                type="checkbox"
                checked={form.sms}
                onChange={(e) => setForm({ ...form, sms: e.target.checked })}
                className="accent-sunu-green"
              />
              Aussi par SMS / WhatsApp (sinon notification gratuite sur le téléphone : activez-les
              ci-dessous)
            </label>
            <div className="flex gap-2">
              <button
                disabled={add.isPending}
                className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Programmer
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
