/** « Mes médecins » : médecins déjà consultés, prochain créneau, reprise de rendez-vous en un clic. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";
import { listMyDoctors } from "@/api/patient";
import { formatDateTime } from "@/lib/datetime";

export function MyDoctorsPanel() {
  const { data } = useQuery({ queryKey: ["my-doctors"], queryFn: listMyDoctors });
  if (!data?.length) return null;
  return (
    <section className="min-w-0 rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Stethoscope className="size-4" /> Mes médecins
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2">
        {data.map((d) => (
          <li
            key={d.id}
            className="flex min-w-0 items-center gap-3 rounded-lg bg-sunu-surface px-3 py-2"
          >
            {d.avatar_url ? (
              <img
                src={d.avatar_url}
                alt=""
                className="size-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunu-green-soft text-sm font-bold text-sunu-green">
                {d.full_name.split(" ").slice(-1)[0]?.[0]}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sunu-dark">{d.full_name}</p>
              <p className="truncate text-[11px] text-sunu-ink/55">
                {d.specialty ?? "Médecin"}
                {d.next_appointment
                  ? ` · prochain RDV ${formatDateTime(d.next_appointment, { day: "numeric", month: "short" })}`
                  : d.next_slot
                    ? ` · libre ${d.next_slot.label}`
                    : ""}
              </p>
            </div>
            {d.is_verified && !d.next_appointment && (
              <Link
                to="/medecins/$id"
                params={{ id: d.id }}
                className="shrink-0 rounded-lg bg-sunu-green px-2.5 py-1.5 text-[11px] font-semibold text-white"
              >
                Reprendre RDV
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
