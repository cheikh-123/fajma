/** Formulaire des informations d'une officine : coordonnées, horaires, jours d'ouverture, garde. */
import { useState } from "react";
import type { PharmacyUpdate } from "@/api/pharmacy";
import type { EditablePharmacy } from "@/api/types";
import { fromDakarInput, toDakarInput } from "@/lib/datetime";
import { WEEK } from "@/lib/weekdays";

export function PharmacyEditor({
  pharmacy,
  saving,
  onSave,
  onCancel,
}: {
  pharmacy: EditablePharmacy;
  saving: boolean;
  onSave: (data: PharmacyUpdate) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    phone: pharmacy.phone ?? "",
    address: pharmacy.address,
    district: pharmacy.district ?? "",
    opens_at: pharmacy.opens_at.slice(0, 5),
    closes_at: pharmacy.closes_at.slice(0, 5),
    open_days: pharmacy.open_days ?? [1, 2, 3, 4, 5, 6],
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const toggleDay = (d: number) =>
    setForm({
      ...form,
      open_days: form.open_days.includes(d)
        ? form.open_days.filter((x) => x !== d)
        : [...form.open_days, d],
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="grid gap-3 text-sm"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Téléphone
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="33 821 00 00"
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Quartier
          <input
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            className={field}
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs text-sunu-ink/60">
        Adresse
        <input
          required
          minLength={3}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Ouverture
          <input
            type="time"
            required
            value={form.opens_at}
            onChange={(e) => setForm({ ...form, opens_at: e.target.value })}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Fermeture
          <input
            type="time"
            required
            value={form.closes_at}
            onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
            className={field}
          />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs text-sunu-ink/60">Jours d'ouverture</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEK.map((w) => (
            <button
              type="button"
              key={w.day}
              aria-pressed={form.open_days.includes(w.day)}
              onClick={() => toggleDay(w.day)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${form.open_days.includes(w.day) ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/60"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-[11px] text-sunu-ink/50">
        Ouverte 24 h/24 : indiquez 00:00 – 23:59. En dehors de ces horaires, activez la garde.
      </p>
      <div className="flex gap-2">
        <button
          disabled={saving || form.open_days.length === 0}
          className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

/** Garde : activée jusqu'à une date (fin de la garde) ou jusqu'à nouvel ordre. */
export function DutyControl({
  pharmacy,
  saving,
  onSave,
}: {
  pharmacy: EditablePharmacy;
  saving: boolean;
  onSave: (data: PharmacyUpdate) => void;
}) {
  // Par défaut : garde d'une semaine, jusqu'au même jour à 8 h.
  const [until, setUntil] = useState(() => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    d.setUTCHours(8, 0, 0, 0);
    return toDakarInput(d.toISOString());
  });
  const [open, setOpen] = useState(false);
  if (pharmacy.is_on_duty) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunu-teal/15 px-3 py-2 text-sm">
        <span className="font-semibold text-sunu-teal">
          De garde
          {pharmacy.on_duty_until
            ? ` jusqu'au ${new Date(pharmacy.on_duty_until).toLocaleString("fr-FR", { timeZone: "Africa/Dakar", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
            : " (jusqu'à nouvel ordre)"}
        </span>
        <button
          onClick={() => onSave({ is_on_duty: false })}
          disabled={saving}
          className="rounded-lg border border-sunu-teal px-3 py-1 text-xs font-semibold text-sunu-teal disabled:opacity-50"
        >
          Terminer la garde
        </button>
      </div>
    );
  }
  return open ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          is_on_duty: true,
          on_duty_until: until ? fromDakarInput(until).toISOString() : undefined,
        });
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-xs"
    >
      <label className="grid gap-1 text-sunu-ink/60">
        Fin de la garde
        <input
          type="datetime-local"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
        />
      </label>
      <button
        disabled={saving}
        className="rounded-lg bg-sunu-teal px-3 py-2 font-semibold text-white disabled:opacity-50"
      >
        Commencer la garde
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sunu-ink/60">
        Annuler
      </button>
    </form>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="rounded-lg border border-sunu-teal px-3 py-2 text-xs font-semibold text-sunu-teal"
    >
      Je suis de garde
    </button>
  );
}
