/**
 * Emploi du temps du médecin : semaine type (plages récurrentes), ajout sur plusieurs jours d'un coup,
 * modification et suppression d'une plage, aperçu des créneaux réellement proposés aux patients.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Eye, House, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  addMyAvailability,
  deleteMyAvailability,
  listMyAvailability,
  listMyLocations,
  updateMyAvailability,
} from "@/api/doctor";
import { listDoctorSlots } from "@/api/directory";
import type { Availability } from "@/api/types";
import { formatDate, formatTime } from "@/lib/datetime";

// 0 = dimanche … 6 = samedi (comme le serveur) ; affichage à partir du lundi.
const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const PRESETS = [
  { label: "Matinée", start: "08:00", end: "13:00" },
  { label: "Après-midi", start: "15:00", end: "19:00" },
  { label: "Journée continue", start: "08:00", end: "17:00" },
];
const SLOTS = [10, 15, 20, 30, 45, 60, 90, 120];

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (t: string) => t.slice(0, 5);
const hoursLabel = (m: number) =>
  m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m / 60} h`;

type Draft = {
  weekdays: number[];
  start: string;
  end: string;
  slot: number;
  kind: "office" | "home_visit";
  locationId: string;
};
const EMPTY: Draft = {
  weekdays: [1, 2, 3, 4, 5],
  start: "08:00",
  end: "13:00",
  slot: 30,
  kind: "office",
  locationId: "",
};

export function SchedulePanel({ doctorId, verified }: { doctorId: string; verified: boolean }) {
  const qc = useQueryClient();
  const { data: avail = [] } = useQuery({
    queryKey: ["my-availability"],
    queryFn: listMyAvailability,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["pro-locations"],
    queryFn: listMyLocations,
  });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<Availability | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-availability"] });
    qc.invalidateQueries({ queryKey: ["doctor-slots"] });
  };
  const payload = () => ({
    start_time: draft.start,
    end_time: draft.end,
    slot_minutes: draft.slot,
    kind: draft.kind,
    location_id: draft.kind === "office" ? draft.locationId || undefined : undefined,
  });
  const add = useMutation({
    mutationFn: () => addMyAvailability({ data: { ...payload(), weekdays: draft.weekdays } }),
    onSuccess: (r) => {
      toast.success(r.created > 1 ? `Plage ajoutée à ${r.created} jours` : "Plage ajoutée");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () =>
      updateMyAvailability(editing!.id, { ...payload(), weekday: draft.weekdays[0]! }),
    onSuccess: () => {
      toast.success("Plage modifiée");
      setEditing(null);
      setDraft(EMPTY);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteMyAvailability({ data: { id } }),
    onSuccess: () => {
      toast.success("Plage supprimée");
      setEditing(null);
      setDraft(EMPTY);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const edit = (a: Availability) => {
    setEditing(a);
    setDraft({
      weekdays: [a.weekday],
      start: hhmm(a.start_time),
      end: hhmm(a.end_time),
      slot: a.slot_minutes,
      kind: a.kind,
      locationId: a.location_id ?? "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const addOn = (day: number) => {
    setEditing(null);
    setDraft({ ...EMPTY, weekdays: [day] });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const toggleDay = (day: number) =>
    setDraft((d) =>
      editing
        ? { ...d, weekdays: [day] }
        : {
            ...d,
            weekdays: d.weekdays.includes(day)
              ? d.weekdays.filter((x) => x !== day)
              : [...d.weekdays, day],
          },
    );

  // Échelle de la frise : 7 h – 21 h au moins, élargie si une plage dépasse.
  const from = Math.min(7 * 60, ...avail.map((a) => minutes(a.start_time)));
  const to = Math.max(21 * 60, ...avail.map((a) => minutes(a.end_time)));
  const span = to - from;
  const ticks: number[] = [];
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h += 2) ticks.push(h);
  const weekly = avail.reduce((s, a) => s + minutes(a.end_time) - minutes(a.start_time), 0);
  const workDays = new Set(avail.map((a) => a.weekday)).size;
  const length = minutes(draft.end) - minutes(draft.start);
  const perDay = length > 0 ? Math.floor(length / draft.slot) : 0;
  const locationName = (id: string | null) =>
    id ? (locations.find((l) => l.id === id)?.name ?? "Autre lieu") : "Cabinet principal";

  return (
    <section
      aria-label="Emploi du temps"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
            <CalendarClock className="size-5 text-sunu-green" /> Ma semaine type
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-sunu-ink/60">
            Les patients réservent uniquement dans ces plages, découpées en créneaux. Cliquez sur
            une plage pour la modifier ou la supprimer. Pour des congés ou une formation, ajoutez
            une absence plus bas : aucun créneau ne sera proposé pendant cette période.
          </p>
        </div>
        <p className="rounded-xl bg-sunu-green-soft px-3 py-2 text-sm text-sunu-green">
          <b>{hoursLabel(weekly)}</b> par semaine · {workDays} jour{workDays > 1 ? "s" : ""}
        </p>
      </div>

      {/* Frise de la semaine */}
      <div className="mt-5">
        <div className="relative ml-12 h-4 text-[10px] text-sunu-ink/45 sm:ml-24">
          {ticks.map((h) => (
            <span
              key={h}
              className={`absolute whitespace-nowrap ${h * 60 >= to - 30 ? "-translate-x-full" : h * 60 <= from + 30 ? "" : "-translate-x-1/2"}`}
              style={{ left: `${((h * 60 - from) / span) * 100}%` }}
            >
              {h} h
            </span>
          ))}
        </div>
        <ul className="mt-1 grid gap-1.5">
          {WEEK.map((day) => {
            const plages = avail
              .filter((a) => a.weekday === day)
              .sort((x, y) => x.start_time.localeCompare(y.start_time));
            return (
              <li key={day} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-semibold text-sunu-dark sm:w-22 sm:text-sm">
                  <span className="sm:hidden">{SHORT[day]}</span>
                  <span className="hidden sm:inline">{DAYS[day]}</span>
                </span>
                <div className="relative h-10 min-w-0 flex-1 rounded-lg bg-sunu-surface">
                  {ticks.map((h) => (
                    <span
                      key={h}
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-sunu-line"
                      style={{ left: `${((h * 60 - from) / span) * 100}%` }}
                    />
                  ))}
                  {plages.length === 0 && (
                    <span className="absolute inset-0 grid place-items-center text-[11px] text-sunu-ink/40">
                      Fermé
                    </span>
                  )}
                  {plages.map((a) => {
                    const left = ((minutes(a.start_time) - from) / span) * 100;
                    const width = ((minutes(a.end_time) - minutes(a.start_time)) / span) * 100;
                    const label = `${hhmm(a.start_time)} – ${hhmm(a.end_time)}`;
                    const home = a.kind === "home_visit";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => edit(a)}
                        title={`${label} · créneaux de ${a.slot_minutes} min · ${home ? "visites à domicile" : locationName(a.location_id)}`}
                        aria-label={`${DAYS[day]} ${label}, créneaux de ${a.slot_minutes} minutes, ${home ? "visites à domicile" : locationName(a.location_id)}. Modifier`}
                        className={`absolute inset-y-1 overflow-hidden rounded-md border-2 px-1 text-left text-[10px] font-semibold leading-tight sm:text-[11px] ${
                          editing?.id === a.id ? "border-sunu-dark" : "border-transparent"
                        } ${home ? "bg-sunu-gold/70 text-sunu-dark" : "bg-sunu-green text-white"}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="block truncate">{label}</span>
                        <span className="block truncate font-normal opacity-85">
                          {home ? "Domicile" : `${a.slot_minutes} min`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => addOn(day)}
                  aria-label={`Ajouter une plage le ${DAYS[day].toLowerCase()}`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-sunu-line text-sunu-ink/60 hover:border-sunu-green hover:text-sunu-green"
                >
                  <Plus className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-sunu-ink/55">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-sunu-green" /> Cabinet et vidéo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-sunu-gold/70" /> Visites à domicile
          </span>
        </p>
      </div>

      {/* Ajout / modification */}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.weekdays.length) return toast.error("Choisissez au moins un jour");
          if (length <= 0) return toast.error("L'heure de fin doit être après l'heure de début");
          if (editing) save.mutate();
          else add.mutate();
        }}
        className={`mt-6 rounded-xl border p-4 ${editing ? "border-sunu-green bg-sunu-green-soft/40" : "border-sunu-line"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-sunu-dark">
            {editing ? (
              <>
                <Pencil className="size-4" /> Modifier la plage du {DAYS[editing.weekday]}
              </>
            ) : (
              <>
                <Plus className="size-4" /> Ajouter une plage
              </>
            )}
          </h3>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(EMPTY);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-sunu-ink/60 hover:text-sunu-dark"
            >
              <X className="size-3.5" /> Annuler
            </button>
          )}
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-sunu-ink/60">
            {editing ? "Jour" : "Jours (plusieurs possibles)"}
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {WEEK.map((day) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${on ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/70 hover:border-sunu-green"}`}
                >
                  {SHORT[day]}
                </button>
              );
            })}
            {!editing && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, weekdays: [1, 2, 3, 4, 5] }))}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold text-sunu-green hover:underline"
              >
                Lun → Ven
              </button>
            )}
          </div>
        </fieldset>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, start: p.start, end: p.end }))}
              className="rounded-full bg-sunu-surface px-3 py-1 text-xs text-sunu-ink/70 hover:text-sunu-green"
            >
              {p.label} ({p.start.replace(":00", " h")} – {p.end.replace(":00", " h")})
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Début
            <input
              type="time"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Fin
            <input
              type="time"
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Durée d'un créneau
            <select
              value={draft.slot}
              onChange={(e) => setDraft({ ...draft, slot: Number(e.target.value) })}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink"
            >
              {SLOTS.map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Type
            <select
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as Draft["kind"];
                setDraft({
                  ...draft,
                  kind,
                  slot: kind === "home_visit" && draft.slot < 45 ? 60 : draft.slot,
                });
              }}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink"
            >
              <option value="office">Cabinet et vidéo</option>
              <option value="home_visit">Visites à domicile</option>
            </select>
          </label>
        </div>
        {draft.kind === "office" && locations.length > 0 && (
          <label className="mt-3 grid gap-1 text-xs font-semibold text-sunu-ink/60 sm:max-w-sm">
            Lieu
            <select
              value={draft.locationId}
              onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink"
            >
              <option value="">Cabinet principal</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === "home_visit" && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-sunu-ink/60">
            <House className="mt-0.5 size-3.5 shrink-0" /> Comptez le trajet dans la durée du
            créneau, et activez les visites à domicile dans « Règles de réservation ».
          </p>
        )}

        <p className="mt-3 text-xs text-sunu-ink/60">
          {length > 0 ? (
            <>
              Soit <b>{perDay}</b> créneau{perDay > 1 ? "x" : ""} de {draft.slot} min
              {editing ? "" : " par jour"}
              {!editing && draft.weekdays.length > 1
                ? `, ${perDay * draft.weekdays.length} par semaine`
                : ""}
              .
            </>
          ) : (
            <span className="text-red-600">L'heure de fin doit être après l'heure de début.</span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={add.isPending || save.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-50"
          >
            {editing ? (
              "Enregistrer les modifications"
            ) : (
              <>
                <Plus className="size-4" />
                {draft.weekdays.length > 1
                  ? `Ajouter à ${draft.weekdays.length} jours`
                  : "Ajouter la plage"}
              </>
            )}
          </button>
          {editing && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Supprimer la plage du ${DAYS[editing.weekday].toLowerCase()} ${hhmm(editing.start_time)} – ${hhmm(editing.end_time)} ? Les rendez-vous déjà pris ne sont pas annulés.`,
                  )
                )
                  remove.mutate(editing.id);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Supprimer cette plage
            </button>
          )}
        </div>
      </form>

      <SlotsPreview doctorId={doctorId} verified={verified} empty={avail.length === 0} />
    </section>
  );
}

/** Ce que les patients voient réellement (plages − absences − RDV déjà pris − délai de réservation). */
function SlotsPreview({
  doctorId,
  verified,
  empty,
}: {
  doctorId: string;
  verified: boolean;
  empty: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["doctor-slots", doctorId, "preview"],
    queryFn: () => listDoctorSlots({ data: { doctor_id: doctorId, days: 7 } }),
  });
  const byDay = new Map<string, string[]>();
  for (const s of data?.slots ?? []) {
    const day = formatDate(s.iso, { weekday: "long", day: "numeric", month: "long" });
    byDay.set(day, [...(byDay.get(day) ?? []), formatTime(s.iso)]);
  }
  return (
    <div className="mt-6 border-t border-sunu-line pt-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-sunu-dark">
        <Eye className="size-4 text-sunu-green" /> Ce que voient les patients (7 prochains jours)
      </h3>
      {!verified && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Votre fiche n'est pas encore publiée : ces créneaux seront réservables après la validation
          de vos justificatifs par l'équipe Fajma.
        </p>
      )}
      {byDay.size === 0 ? (
        <p className="mt-2 text-sm text-sunu-ink/55">
          {empty
            ? "Aucun créneau : ajoutez au moins une plage ci-dessus."
            : "Aucun créneau libre sur les 7 prochains jours (plages passées, absences ou agenda complet)."}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[...byDay].map(([day, times]) => (
            <li key={day} className="min-w-0 rounded-lg bg-sunu-surface px-3 py-2 text-sm">
              <span className="font-semibold capitalize text-sunu-dark">{day}</span>
              <span className="ml-1 text-xs text-sunu-ink/55">
                · {times.length} créneau{times.length > 1 ? "x" : ""}
              </span>
              <span className="mt-0.5 block truncate text-xs text-sunu-ink/60">
                {times.slice(0, 8).join(" · ")}
                {times.length > 8 ? " …" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
