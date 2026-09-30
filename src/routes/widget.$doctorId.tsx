import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Loader2 } from "lucide-react";
import { getDoctor, listDoctorSlots } from "@/api/directory";

/**
 * Module de réservation à intégrer sur le site d'un médecin ou d'une clinique :
 * <iframe src="https://www.fajma.sn/widget/<id>" width="360" height="420"></iframe>
 * Il affiche les prochains créneaux ; la réservation se termine sur Fajma, dans un nouvel onglet
 * (connexion et paiement ne se font jamais dans un cadre intégré).
 */
export const Route = createFileRoute("/widget/$doctorId")({
  head: () => ({
    meta: [{ title: "Prendre rendez-vous — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: Widget,
});

function Widget() {
  const { doctorId } = Route.useParams();
  const { data: doctor, isError } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => getDoctor({ data: { id: doctorId } }),
  });
  const { data: slots, isLoading } = useQuery({
    queryKey: ["doctor-slots", doctorId, "widget"],
    queryFn: () => listDoctorSlots({ data: { doctor_id: doctorId, days: 14 } }),
  });
  const url = `${window.location.origin}/medecins/${doctorId}`;

  if (isError)
    return (
      <p className="p-4 text-sm text-sunu-ink/60">Ce praticien n'est pas disponible sur Fajma.</p>
    );
  return (
    <div className="min-h-screen bg-sunu-card p-4 font-sans">
      <div className="rounded-2xl border border-sunu-line p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-sunu-green">
          Prendre rendez-vous
        </p>
        <h1 className="mt-1 text-lg font-bold text-sunu-dark">{doctor?.full_name ?? "…"}</h1>
        {doctor && (
          <p className="text-xs text-sunu-ink/60">
            {doctor.specialty?.name} · {doctor.city} ·{" "}
            {doctor.consultation_price.toLocaleString("fr-FR")} F
          </p>
        )}
        <p className="mt-3 text-xs font-semibold text-sunu-ink/60">Prochains créneaux</p>
        {isLoading ? (
          <Loader2 className="mt-2 size-5 animate-spin text-sunu-green" />
        ) : (slots?.slots ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-sunu-ink/55">
            Aucun créneau libre dans les 14 prochains jours.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(slots?.slots ?? []).slice(0, 8).map((s) => (
              <a
                key={s.iso}
                href={url}
                target="_blank"
                rel="noopener"
                className="rounded-lg border border-sunu-line px-2 py-1.5 text-center text-xs font-medium text-sunu-ink/80 hover:border-sunu-green hover:text-sunu-green"
              >
                {s.label}
              </a>
            ))}
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white"
        >
          <CalendarCheck className="size-4" /> Réserver sur Fajma
        </a>
        <p className="mt-2 text-center text-[10px] text-sunu-ink/40">
          Rappel par SMS · paiement Wave / Orange Money ou au cabinet
        </p>
      </div>
    </div>
  );
}
