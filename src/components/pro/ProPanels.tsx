/** Panneaux de l'espace médecin : statistiques, règles de réservation, absences, agenda semaine. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Pencil,
  BarChart3,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addMyLocation,
  addMyTimeOff,
  deleteMyLocation,
  deleteMyTimeOff,
  getMySettings,
  getMyStats,
  listMyLocations,
  listMyTimeOff,
  updateMySettings,
} from "@/api/doctor";
import type { DoctorAppointment, DoctorSettings } from "@/api/types";
import {
  formatDate,
  formatDateTime,
  formatTime,
  fromDakarInput,
  startOfDakarDay,
} from "@/lib/datetime";

// ── Statistiques ─────────────────────────────────────────────────────

export function StatsStrip() {
  const { data } = useQuery({ queryKey: ["pro-stats"], queryFn: getMyStats });
  if (!data) return null;
  const m = data.last_30_days;
  const items = [
    { label: "Consultations (30 j)", value: m.completed },
    { label: "Patients vus", value: m.patients },
    { label: "Nouveaux patients", value: m.new_patients },
    { label: "Taux d'absence", value: `${m.no_show_rate} %` },
    {
      label: "Encaissé (30 j, espèces comprises)",
      value: `${m.revenue_paid.toLocaleString("fr-FR")} F`,
    },
    { label: "RDV sur 7 jours", value: data.next_7_days.total },
  ];
  return (
    <section
      aria-label="Statistiques"
      className="mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-4"
    >
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        <BarChart3 className="size-4" /> Activité
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl bg-sunu-surface px-3 py-2">
            <p className="text-lg font-bold text-sunu-dark">{i.value}</p>
            <p className="text-[11px] text-sunu-ink/55">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Règles de réservation ────────────────────────────────────────────

export function SettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-settings"], queryFn: getMySettings });
  const [draft, setDraft] = useState<Partial<DoctorSettings>>({});
  const values = { ...data, ...draft } as DoctorSettings;
  const save = useMutation({
    mutationFn: () => updateMySettings({ data: draft }),
    onSuccess: (res) => {
      qc.setQueryData(["pro-settings"], res);
      setDraft({});
      toast.success("Règles enregistrées");
    },
    onError: (e) => toast.error(e.message),
  });
  if (!data) return null;
  const set = (patch: Partial<DoctorSettings>) => setDraft({ ...draft, ...patch });
  const num = "w-20 rounded-lg border border-sunu-line px-2 py-1.5 text-sm";
  return (
    <section
      aria-label="Règles de réservation"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Settings2 className="size-4" /> Règles de réservation
      </h2>
      <div className="mt-4 grid gap-3 text-sm text-sunu-ink/80">
        <label className="flex items-center justify-between gap-3">
          <span>
            Confirmer automatiquement
            <span className="block text-xs font-normal text-sunu-ink/50">
              Un créneau libre réservé en ligne est confirmé tout de suite. Décochez pour valider
              vous-même chaque demande.
            </span>
          </span>
          <input
            type="checkbox"
            checked={values.auto_confirm}
            onChange={(e) => set({ auto_confirm: e.target.checked })}
            className="size-4 accent-sunu-green"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          Accepter de nouveaux patients
          <input
            type="checkbox"
            checked={values.accepts_new_patients}
            onChange={(e) => set({ accepts_new_patients: e.target.checked })}
            className="size-4 accent-sunu-green"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          Paiement en ligne exigé pour la vidéo
          <input
            type="checkbox"
            checked={values.teleconsultation_prepayment}
            onChange={(e) => set({ teleconsultation_prepayment: e.target.checked })}
            className="size-4 accent-sunu-green"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          Délai minimum avant un RDV (h)
          <input
            type="number"
            min={0}
            max={168}
            value={values.min_notice_hours}
            onChange={(e) => set({ min_notice_hours: Number(e.target.value) })}
            className={num}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          Réservable jusqu'à (jours)
          <input
            type="number"
            min={1}
            max={180}
            value={values.booking_horizon_days}
            onChange={(e) => set({ booking_horizon_days: Number(e.target.value) })}
            className={num}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          Annulation en ligne jusqu'à (h avant)
          <input
            type="number"
            min={0}
            max={168}
            value={values.cancellation_deadline_hours}
            onChange={(e) => set({ cancellation_deadline_hours: Number(e.target.value) })}
            className={num}
          />
        </label>
        <label className="grid gap-1">
          Consignes aux patients
          <textarea
            rows={3}
            maxLength={1000}
            value={values.booking_instructions}
            onChange={(e) => set({ booking_instructions: e.target.value })}
            placeholder="Ex. venir à jeun, apporter le carnet de santé et les dernières analyses…"
            className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
          />
        </label>
        <fieldset className="grid gap-3 rounded-xl border border-sunu-line p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            Visites à domicile
          </legend>
          <label className="flex items-center justify-between gap-3">
            Je me déplace chez les patients
            <input
              type="checkbox"
              checked={values.home_visits}
              onChange={(e) => set({ home_visits: e.target.checked })}
              className="size-4 accent-sunu-green"
            />
          </label>
          {values.home_visits && (
            <>
              <label className="flex items-center justify-between gap-3">
                Supplément déplacement (FCFA)
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={values.home_visit_fee}
                  onChange={(e) => set({ home_visit_fee: Number(e.target.value) || 0 })}
                  className="w-24 rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
                />
              </label>
              <label className="grid gap-1">
                Zone desservie
                <input
                  maxLength={300}
                  value={values.home_visit_area}
                  onChange={(e) => set({ home_visit_area: e.target.value })}
                  placeholder="Ex. Dakar Plateau, Médina, Fann, Point E"
                  className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
                />
              </label>
              <p className="text-[11px] text-sunu-ink/55">
                Ajoutez ensuite des plages « Visites à domicile » dans vos disponibilités : les
                patients ne peuvent réserver que sur ces plages.
              </p>
            </>
          )}
        </fieldset>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || Object.keys(draft).length === 0}
          className="rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </section>
  );
}

// ── Lieux de consultation ────────────────────────────────────────────

export function LocationsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-locations"], queryFn: listMyLocations });
  const empty = { name: "", address: "", city: "", phone: "" };
  const [form, setForm] = useState(empty);
  // Lieu en cours de modification : sa position GPS est conservée.
  const [editing, setEditing] = useState<{
    id: string;
    latitude: number | null;
    longitude: number | null;
  } | null>(null);
  const add = useMutation({
    mutationFn: () =>
      addMyLocation({
        data: {
          ...form,
          phone: form.phone || null,
          id: editing?.id,
          latitude: editing?.latitude ?? null,
          longitude: editing?.longitude ?? null,
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(["pro-locations"], res);
      setForm(empty);
      toast.success(editing ? "Lieu modifié" : "Lieu ajouté");
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: deleteMyLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-locations"] });
      qc.invalidateQueries({ queryKey: ["my-availability"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <MapPin className="size-4" /> Lieux de consultation
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/50">
        Cabinet principal : l'adresse de votre fiche. Ajoutez vos autres sites puis affectez-leur
        des plages horaires.
      </p>
      <div className="mt-3 grid gap-2">
        {(data ?? []).map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <b className="text-sunu-dark">{l.name}</b>
              <span className="block truncate text-xs text-sunu-ink/55">
                {l.address}, {l.city}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditing({ id: l.id, latitude: l.latitude, longitude: l.longitude });
                  setForm({ name: l.name, address: l.address, city: l.city, phone: l.phone ?? "" });
                }}
                className="text-sunu-ink/40 hover:text-sunu-green"
                aria-label={`Modifier ${l.name}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() =>
                  window.confirm(`Supprimer « ${l.name} » et ses plages horaires ?`) &&
                  del.mutate(l.id)
                }
                className="text-sunu-ink/40 hover:text-red-600"
                aria-label={`Supprimer ${l.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-4 grid gap-2 border-t border-sunu-line pt-4"
      >
        <input
          required
          minLength={2}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nom (ex. Clinique de Pikine)"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <input
          required
          minLength={2}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Adresse"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            minLength={2}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Ville"
            className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Téléphone"
            className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            disabled={add.isPending}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {editing ? (
              "Enregistrer les modifications"
            ) : (
              <>
                <Plus className="size-3.5" /> Ajouter le lieu
              </>
            )}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
              className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70"
            >
              Annuler
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Absences ─────────────────────────────────────────────────────────

export function TimeOffPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-time-off"], queryFn: listMyTimeOff });
  const [form, setForm] = useState({ start: "", end: "", reason: "" });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pro-time-off"] });
    qc.invalidateQueries({ queryKey: ["doctor-slots"] });
  };
  const add = useMutation({
    mutationFn: () =>
      addMyTimeOff({
        data: {
          starts_at: fromDakarInput(`${form.start}T00:00`).toISOString(),
          ends_at: fromDakarInput(`${form.end}T23:59`).toISOString(),
          reason: form.reason || undefined,
        },
      }),
    onSuccess: (res) => {
      setForm({ start: "", end: "", reason: "" });
      refresh();
      if (res.conflicting_appointments > 0) {
        toast.warning(
          `Absence enregistrée. ${res.conflicting_appointments} rendez-vous déjà pris sur cette période : pensez à les annuler ou les déplacer.`,
        );
      } else {
        toast.success("Absence enregistrée");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteMyTimeOff({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <CalendarOff className="size-4" /> Absences et congés
      </h2>
      <div className="mt-3 grid gap-2">
        {(data ?? []).length === 0 && (
          <p className="text-xs text-sunu-ink/50">Aucune absence prévue.</p>
        )}
        {(data ?? []).map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <span>
              <b className="text-sunu-dark">
                {formatDate(t.starts_at, { day: "numeric", month: "short" })} →{" "}
                {formatDate(t.ends_at, { day: "numeric", month: "short" })}
              </b>
              {t.reason && <span className="ml-1 text-xs text-sunu-ink/50">· {t.reason}</span>}
            </span>
            <button
              onClick={() => del.mutate(t.id)}
              className="text-sunu-ink/40 hover:text-red-600"
              aria-label="Supprimer l'absence"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.start || !form.end || form.end < form.start)
            return toast.error("Dates invalides");
          add.mutate();
        }}
        className="mt-4 grid gap-2 border-t border-sunu-line pt-4"
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            aria-label="Premier jour d'absence"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            className="rounded-lg border border-sunu-line px-2 py-2 text-sm"
          />
          <input
            type="date"
            aria-label="Dernier jour d'absence"
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
            className="rounded-lg border border-sunu-line px-2 py-2 text-sm"
          />
        </div>
        <input
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Motif (optionnel) : congés, formation…"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
        />
        <button
          disabled={add.isPending}
          className="flex items-center justify-center gap-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Ajouter une absence
        </button>
      </form>
    </div>
  );
}

// L'agenda en vue semaine (glisser-déposer) est dans components/pro/WeekCalendar.tsx.
export { WeekCalendar } from "@/components/pro/WeekCalendar";
