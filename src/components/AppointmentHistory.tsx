/** Historique d'un rendez-vous (qui l'a pris, confirmé, déplacé, annulé, et quand), chargé à l'ouverture. */
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { getAppointmentHistory } from "@/api/appointments";
import { formatDateTime } from "@/lib/datetime";

const SHORT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/** path : route API de l'historique (patient, médecin ou secrétariat). */
export function AppointmentHistory({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["appointment-history", path],
    queryFn: () => getAppointmentHistory(path),
    enabled: open,
  });
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold text-sunu-ink/55 hover:text-sunu-green"
      >
        <History className="size-3.5" /> {open ? "Masquer l'historique" : "Historique"}
      </button>
      {open && (
        <ol className="mt-1.5 grid gap-1 border-l-2 border-sunu-line pl-3 text-xs text-sunu-ink/70">
          {isLoading && <li>Chargement…</li>}
          {error && <li className="text-red-700">{(error as Error).message}</li>}
          {data?.length === 0 && <li>Aucun événement enregistré.</li>}
          {data?.map((e, i) => (
            <li key={i}>
              <span className="text-sunu-ink/45">{formatDateTime(e.at, SHORT)}</span> ·{" "}
              <b className="text-sunu-dark">{e.label}</b> par {e.by_role.toLowerCase()}
              {e.by_name ? ` (${e.by_name})` : ""}
              {e.action === "rescheduled" && e.from_at && e.to_at
                ? ` : ${formatDateTime(e.from_at, SHORT)} → ${formatDateTime(e.to_at, SHORT)}`
                : ""}
              {e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
