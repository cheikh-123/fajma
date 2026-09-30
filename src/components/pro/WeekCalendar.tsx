/**
 * Agenda du médecin en vue semaine : une couleur par motif de consultation, statut signalé par la forme
 * (pointillés = à confirmer, estompé = passé). Glisser un rendez-vous le déplace (autre jour ou autre
 * heure), tirer son bord inférieur change sa durée : pas de 5 minutes, confirmation avant envoi, le
 * serveur vérifie que l'horaire est libre et prévient le patient.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, GripHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listMyTimeOff } from "@/api/doctor";
import type { DoctorAppointment } from "@/api/types";
import { formatDate, formatDateTime, formatTime, startOfDakarDay } from "@/lib/datetime";

const HOUR_START = 7;
const HOUR_END = 21;
const HOUR_PX = 52;
const SNAP = 5;
const MOTIF_SLOTS = 5;

function mondayOf(date: Date) {
  const d = startOfDakarDay(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP;
// Heure de Dakar = UTC.
const minutesOf = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const patientName = (a: DoctorAppointment) =>
  a.relative?.full_name ?? a.patient?.full_name ?? a.external_patient_name ?? "Patient";
const motifName = (a: DoctorAppointment) => a.consultation_type?.name ?? "Sans motif";

type Drag = {
  id: string;
  mode: "move" | "resize";
  x0: number;
  y0: number;
  min0: number;
  dur0: number;
  day: number;
  min: number;
  dur: number;
  moved: boolean;
};

export function WeekCalendar({
  appts,
  onSelect,
  onMove,
}: {
  appts: DoctorAppointment[];
  onSelect?: (a: DoctorAppointment) => void;
  onMove?: (a: DoctorAppointment, scheduledAt: string, durationMinutes: number) => void;
}) {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const { data: timeOff } = useQuery({ queryKey: ["pro-time-off"], queryFn: listMyTimeOff });
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000));
  const shift = (n: number) => setMonday(new Date(monday.getTime() + n * 7 * 86_400_000));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const height = (HOUR_END - HOUR_START) * HOUR_PX;

  // Couleur fixe par motif (ordre alphabétique : la couleur suit le motif d'une semaine à l'autre).
  const motifs = [...new Set(appts.map(motifName))].sort((a, b) => a.localeCompare(b, "fr"));
  const colorOf = (name: string) => {
    const i = motifs.indexOf(name);
    return i >= 0 && i < MOTIF_SLOTS ? `var(--motif-${i + 1})` : "var(--motif-other)";
  };
  const movable = (a: DoctorAppointment) =>
    Boolean(onMove) &&
    (a.status === "pending" || a.status === "confirmed") &&
    new Date(a.scheduled_at).getTime() > Date.now();

  // Pendant un glisser : suivi du pointeur sur toute la fenêtre, lecture de l'état dans dragRef.
  const dragKey = drag ? `${drag.id}:${drag.mode}` : "";
  useEffect(() => {
    if (!dragKey) return;
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.y0;
      const next = {
        ...d,
        moved: d.moved || Math.abs(e.clientX - d.x0) > 4 || Math.abs(dy) > 4,
      };
      if (d.mode === "resize") {
        next.dur = Math.min(240, Math.max(10, snap(d.dur0 + (dy / HOUR_PX) * 60)));
      } else {
        const col = cols.current.findIndex((c) => {
          const r = c?.getBoundingClientRect();
          return Boolean(r && e.clientX >= r.left && e.clientX < r.right);
        });
        next.day = col >= 0 ? col : d.day;
        next.min = Math.min(
          HOUR_END * 60 - d.dur0,
          Math.max(HOUR_START * 60, snap(d.min0 + (dy / HOUR_PX) * 60)),
        );
      }
      dragRef.current = next;
      setDrag(next);
    };
    const onPointerUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const a = appts.find((x) => x.id === d.id);
      if (!a) return;
      if (!d.moved) {
        onSelect?.(a);
        return;
      }
      const iso = new Date(days[d.day]!.getTime() + d.min * 60_000).toISOString();
      if (iso === new Date(a.scheduled_at).toISOString() && d.dur === a.duration_minutes) return;
      if (new Date(iso).getTime() <= Date.now()) {
        toast.error("Choisissez un horaire à venir.");
        return;
      }
      const question =
        d.mode === "resize"
          ? `Passer le rendez-vous de ${patientName(a)} à ${d.dur} minutes ?`
          : `Déplacer le rendez-vous de ${patientName(a)} au ${formatDateTime(iso, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })} ?`;
      if (window.confirm(`${question}\n\nLe patient sera prévenu.`)) onMove?.(a, iso, d.dur);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // Les écouteurs sont posés au début du glisser ; l'état courant est lu dans dragRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKey]);

  const startDrag = (
    e: React.PointerEvent,
    a: DoctorAppointment,
    dayIdx: number,
    mode: Drag["mode"],
  ) => {
    if (e.button !== 0) return;
    if (!movable(a)) {
      if (mode === "move") onSelect?.(a);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const d: Drag = {
      id: a.id,
      mode,
      x0: e.clientX,
      y0: e.clientY,
      min0: minutesOf(a.scheduled_at),
      dur0: a.duration_minutes,
      day: dayIdx,
      min: minutesOf(a.scheduled_at),
      dur: a.duration_minutes,
      moved: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const block = (a: DoctorAppointment, dayIdx: number, ghost = false) => {
    const live = drag?.id === a.id && drag.moved ? drag : null;
    const min = ghost && live ? live.min : minutesOf(a.scheduled_at);
    const dur = ghost && live ? live.dur : a.duration_minutes;
    const top = ((min - HOUR_START * 60) / 60) * HOUR_PX;
    const h = Math.max(20, (dur / 60) * HOUR_PX - 2);
    const color = colorOf(motifName(a));
    const pending = a.status === "pending";
    const past = a.status === "completed" || a.status === "no_show" || a.status === "cancelled";
    const canMove = movable(a);
    return (
      <div
        key={`${a.id}${ghost ? "-ghost" : ""}`}
        role="button"
        tabIndex={ghost ? -1 : 0}
        onPointerDown={(e) => startDrag(e, a, dayIdx, "move")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect?.(a);
        }}
        title={`${formatTime(a.scheduled_at)} · ${patientName(a)} · ${motifName(a)}${pending ? " · à confirmer" : ""}${canMove ? " (glisser pour déplacer)" : ""}`}
        aria-label={`${formatTime(a.scheduled_at)}, ${patientName(a)}, ${motifName(a)}${pending ? ", à confirmer" : ""}`}
        className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight text-sunu-dark ${
          pending ? "outline-1 -outline-offset-1 outline-dashed" : ""
        } ${past ? "opacity-55" : ""} ${
          a.status === "no_show" || a.status === "cancelled" ? "line-through" : ""
        } ${canMove ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${
          ghost ? "z-20 shadow-lg ring-2 ring-sunu-dark" : ""
        } ${live && !ghost ? "opacity-30" : ""}`}
        style={{
          top,
          height: h,
          borderLeftColor: color,
          outlineColor: pending ? color : undefined,
          background: `color-mix(in srgb, ${color} 18%, var(--sunu-card))`,
        }}
      >
        <b>{ghost && live ? hhmm(min) : formatTime(a.scheduled_at)}</b> {patientName(a)}
        {h >= 34 && <span className="block truncate text-sunu-ink/70">{motifName(a)}</span>}
        {a.mode === "home_visit" && <span className="font-semibold"> · domicile</span>}
        {a.mode === "teleconsultation" && <span className="font-semibold"> · vidéo</span>}
        {a.arrived_at && a.status !== "completed" && (
          <span className="ml-1 font-semibold text-sunu-teal">● arrivé</span>
        )}
        {canMove && !ghost && (
          <span
            onPointerDown={(e) => startDrag(e, a, dayIdx, "resize")}
            aria-hidden
            className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 hover:opacity-100"
          >
            <GripHorizontal className="size-3" />
          </span>
        )}
      </div>
    );
  };

  const dragged = drag?.moved ? appts.find((a) => a.id === drag.id) : undefined;

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card">
      <div className="flex items-center justify-between gap-2 border-b border-sunu-line px-4 py-3">
        <button
          onClick={() => shift(-1)}
          className="rounded-lg border border-sunu-line p-1.5"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold text-sunu-dark">
          Semaine du {formatDate(monday, { day: "numeric", month: "long" })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setMonday(mondayOf(new Date()))}
            className="rounded-lg border border-sunu-line px-2 py-1 text-xs font-semibold"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => shift(1)}
            className="rounded-lg border border-sunu-line p-1.5"
            aria-label="Semaine suivante"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {motifs.length > 0 && (
        <div
          aria-label="Légende"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-sunu-line px-4 py-2 text-[11px] text-sunu-ink/70"
        >
          {motifs.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: colorOf(m) }} /> {m}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm outline-1 outline-dashed outline-sunu-ink/60" /> À
            confirmer
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <div
          className={`grid min-w-[760px] ${drag?.moved ? "select-none" : ""}`}
          style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}
        >
          <div />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-b border-l border-sunu-line px-2 py-2 text-center text-xs font-semibold text-sunu-ink/70"
            >
              {formatDate(d, { weekday: "short", day: "numeric" })}
            </div>
          ))}
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-sunu-ink/40"
                style={{ top: (h - HOUR_START) * HOUR_PX - 6 }}
              >
                {h}h
              </div>
            ))}
          </div>
          {days.map((day, dayIdx) => {
            const dayStart = day.getTime();
            const dayEnd = dayStart + 86_400_000;
            const items = appts.filter((a) => {
              const t = new Date(a.scheduled_at).getTime();
              return t >= dayStart && t < dayEnd;
            });
            const offs = (timeOff ?? []).filter(
              (t) =>
                new Date(t.starts_at).getTime() < dayEnd &&
                new Date(t.ends_at).getTime() > dayStart,
            );
            return (
              <div
                key={day.toISOString()}
                ref={(el) => {
                  cols.current[dayIdx] = el;
                }}
                className={`relative border-l border-sunu-line ${drag?.moved && drag.day === dayIdx ? "bg-sunu-green-soft/30" : ""}`}
                style={{ height }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-sunu-line/60"
                    style={{ top: (h - HOUR_START) * HOUR_PX }}
                  />
                ))}
                {offs.length > 0 && (
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]">
                    <span className="m-1 inline-block rounded bg-sunu-card/80 px-1 text-[10px] font-semibold text-sunu-ink/60">
                      Absent
                    </span>
                  </div>
                )}
                {items.map((a) => block(a, dayIdx))}
                {dragged && drag?.day === dayIdx && block(dragged, dayIdx, true)}
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-sunu-line px-4 py-2 text-[11px] text-sunu-ink/50">
        {onMove
          ? "Glissez un rendez-vous pour le déplacer, tirez son bord inférieur pour changer sa durée, cliquez pour l'ouvrir. "
          : ""}
        Heures de Dakar · {formatDateTime(new Date(), { hour: "2-digit", minute: "2-digit" })}{" "}
        actuellement
      </p>
    </div>
  );
}
