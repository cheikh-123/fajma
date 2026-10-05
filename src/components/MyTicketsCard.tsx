/** Espace patient : tickets d'hôpital du jour (place et attente en direct), lien vers la page de suivi. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, Ticket } from "lucide-react";
import { etaLabel, listMyTickets } from "@/api/queues";

export function MyTicketsCard() {
  const { data } = useQuery({
    queryKey: ["my-queue-tickets"],
    queryFn: listMyTickets,
    refetchInterval: 30_000,
  });
  const active = (data ?? []).filter((t) => t.status === "waiting" || t.status === "called");
  return (
    <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Ticket className="size-4" /> Ticket hôpital
      </h2>
      {active.length === 0 ? (
        <p className="mt-2 text-xs text-sunu-ink/60">
          Évitez la file d'attente : prenez votre numéro à l'hôpital depuis chez vous.{" "}
          <Link to="/hopitaux" className="font-semibold text-sunu-green">
            Prendre un ticket →
          </Link>
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((t) => (
            <li key={t.code}>
              <Link
                to="/ticket/$code"
                params={{ code: t.code }}
                className={`flex items-center gap-3 rounded-xl p-3 ${t.status === "called" ? "bg-sunu-green text-white" : "bg-sunu-surface"}`}
              >
                <span className="text-2xl font-black tabular-nums">{t.label}</span>
                <span className="min-w-0 text-xs">
                  <b className="block truncate">{t.facility.name}</b>
                  {t.status === "called" ? (
                    <span className="flex items-center gap-1">
                      <BellRing className="size-3.5" /> C'est votre tour
                      {t.desk ? ` : ${t.desk}` : ""}
                    </span>
                  ) : (
                    <span>
                      {t.ahead} devant vous · environ {etaLabel(t.eta_minutes)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
