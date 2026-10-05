/**
 * Suivi d'un ticket (lien reçu par SMS, sans connexion) : place, attente estimée, « partez maintenant »,
 * appel au guichet. Mise à jour automatique ; le téléphone vibre et sonne quand c'est le tour du patient.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  BellRing,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cancelTicket, etaLabel, getTicket, type QueueTicket } from "@/api/queues";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/ticket/$code")({
  head: () => ({
    meta: [{ title: "Mon ticket — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: TicketPage,
});

/** Petit signal sonore (sans fichier) quand le numéro est appelé. */
function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [660, 880, 1100][i];
      gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {
    /* navigateur sans audio : la vibration et l'affichage suffisent */
  }
}

function TicketPage() {
  const { code } = Route.useParams();
  const qc = useQueryClient();
  const { data: t, error } = useQuery({
    queryKey: ["ticket", code],
    queryFn: () => getTicket(code),
    refetchInterval: (q) =>
      q.state.data && ["waiting", "called"].includes(q.state.data.status) ? 15_000 : false,
  });
  const previous = useRef<QueueTicket["status"] | null>(null);
  useEffect(() => {
    if (t?.status === "called" && previous.current === "waiting") {
      navigator.vibrate?.([400, 200, 400, 200, 400]);
      chime();
    }
    if (t) previous.current = t.status;
  }, [t]);
  const cancel = useMutation({
    mutationFn: () => cancelTicket(code),
    onSuccess: (res) => {
      qc.setQueryData(["ticket", code], res);
      toast.success("Ticket annulé : votre place est libérée pour quelqu'un d'autre.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (error)
    return (
      <Shell>
        <XCircle className="mx-auto size-10 text-red-600" />
        <p className="mt-3 text-center text-sm">
          Ticket introuvable. Vérifiez le lien reçu par SMS.
        </p>
      </Shell>
    );
  if (!t)
    return (
      <Shell>
        <Loader2 className="mx-auto size-6 animate-spin text-sunu-ink/40" />
      </Shell>
    );

  const tone =
    t.status === "called"
      ? "bg-sunu-green text-white"
      : t.status === "waiting"
        ? "bg-sunu-card text-sunu-dark"
        : "bg-sunu-surface text-sunu-ink/60";
  return (
    <Shell>
      <p className="text-center text-sm font-semibold text-sunu-ink/70">{t.facility.name}</p>
      <p className="text-center text-xs text-sunu-ink/50">{t.service.name}</p>
      <div
        className={`mx-auto mt-4 rounded-3xl border border-sunu-line p-6 text-center ${tone}`}
        aria-live="polite"
      >
        <p className="text-xs font-bold uppercase tracking-widest opacity-70">Votre numéro</p>
        <p className="mt-1 text-7xl font-black tabular-nums tracking-tight">{t.label}</p>
        {t.priority_label && (
          <p className="mt-1 text-xs font-semibold opacity-80">Prioritaire : {t.priority_label}</p>
        )}
        {t.status === "called" && (
          <p className="mt-3 flex items-center justify-center gap-2 text-lg font-bold">
            <BellRing className="size-5" /> C'est votre tour ! Présentez-vous{" "}
            {t.desk ? `au ${t.desk}` : "à l'accueil"}.
          </p>
        )}
        {t.status === "done" && (
          <p className="mt-3 flex items-center justify-center gap-2 font-semibold">
            <CheckCircle2 className="size-5" /> Vous avez été reçu(e). Bon rétablissement !
          </p>
        )}
        {["no_show", "cancelled", "expired"].includes(t.status) && (
          <p className="mt-3 font-semibold">{t.status_label}</p>
        )}
      </div>

      {t.status === "waiting" && (
        <>
          {t.leave_now && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
              <Navigation className="size-5 shrink-0" /> Partez maintenant : votre tour arrive dans
              environ {etaLabel(t.eta_minutes)}.
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-sunu-line bg-sunu-card p-4 text-center">
              <Users className="mx-auto size-5 text-sunu-green" />
              <p className="mt-1 text-3xl font-bold text-sunu-dark tabular-nums">{t.ahead}</p>
              <p className="text-xs text-sunu-ink/55">
                personne{t.ahead > 1 ? "s" : ""} devant vous
              </p>
            </div>
            <div className="rounded-2xl border border-sunu-line bg-sunu-card p-4 text-center">
              <Clock className="mx-auto size-5 text-sunu-green" />
              <p className="mt-1 text-3xl font-bold text-sunu-dark">{etaLabel(t.eta_minutes)}</p>
              <p className="text-xs text-sunu-ink/55">d'attente estimée</p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-sunu-ink/55">
            Cette page se met à jour toute seule. Vous recevez aussi un SMS quand c'est bientôt
            votre tour{t.travel_minutes ? " et quand il faut partir" : ""}.
          </p>
          <button
            onClick={() => {
              if (window.confirm("Annuler ce ticket et libérer votre place ?")) cancel.mutate();
            }}
            className="mx-auto mt-6 block text-sm font-semibold text-red-600 hover:underline"
          >
            Je ne viendrai pas : annuler mon ticket
          </button>
        </>
      )}
      {t.facility.address && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${t.facility.name}, ${t.facility.address}, ${t.facility.city}`)}`}
          target="_blank"
          rel="noreferrer"
          className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-sm font-semibold text-sunu-green"
        >
          <MapPin className="size-4" /> Itinéraire vers {t.facility.name}
        </a>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-sunu-surface px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mx-auto mb-6 flex w-fit items-center gap-2">
          <FajmaMark className="size-8" />
          <span className="text-lg font-bold text-sunu-green">Fajma</span>
        </Link>
        {children}
        <Link
          to="/hopitaux"
          className="mx-auto mt-8 block w-fit text-xs font-semibold text-sunu-ink/50 hover:text-sunu-green"
        >
          Autres hôpitaux et services
        </Link>
      </div>
    </main>
  );
}
