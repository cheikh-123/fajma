/** Déplacement d'un RDV par le cabinet (médecin ou secrétariat) : nouvel horaire, durée, patient prévenu par SMS. */
import { useState } from "react";
import { fromDakarInput, toDakarInput } from "@/lib/datetime";

export function MoveAppointmentForm({
  currentIso,
  duration,
  pending,
  onSubmit,
  onCancel,
}: {
  currentIso: string;
  duration: number;
  pending: boolean;
  onSubmit: (scheduledAt: string, duration: number) => void;
  onCancel: () => void;
}) {
  const [when, setWhen] = useState(toDakarInput(currentIso));
  const [minutes, setMinutes] = useState(duration);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(fromDakarInput(when).toISOString(), minutes);
      }}
      className="flex w-full flex-wrap items-end gap-2 border-t border-sunu-line pt-3 text-xs md:basis-full"
    >
      <label className="grid gap-1 text-sunu-ink/60">
        Nouvel horaire
        <input
          type="datetime-local"
          required
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sunu-ink/60">
        Durée
        <select
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
        >
          {Array.from(new Set([10, 15, 20, 30, 45, 60, 90, 120, duration]))
            .sort((a, b) => a - b)
            .map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-sunu-green px-3 py-2 font-semibold text-white disabled:opacity-50"
      >
        Déplacer
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-2 text-sunu-ink/60">
        Annuler
      </button>
      <p className="w-full text-[11px] text-sunu-ink/50">
        Le patient est prévenu par SMS du nouvel horaire. Le rendez-vous reste confirmé.
      </p>
    </form>
  );
}
