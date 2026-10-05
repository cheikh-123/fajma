import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  CreditCard,
  Loader2,
  LockKeyhole,
  Play,
  UserCheck,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTeleconsultationAccess,
  teleconsultationReady,
  teleconsultationStart,
} from "@/api/appointments";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

// Serveur de visioconférence : meet.jit.si par défaut, un Jitsi hébergé au Sénégal en production.
const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || "meet.jit.si";

// Rafraîchissement toutes les 5 s : le patient voit la vidéo s'ouvrir dès que le médecin démarre.
const accessQO = (id: string) =>
  queryOptions({
    queryKey: ["teleconsultation", id],
    queryFn: () => getTeleconsultationAccess({ data: { appointment_id: id } }),
    refetchInterval: (q) => (q.state.data?.room ? false : 5000),
  });

export const Route = createFileRoute("/_authenticated/teleconsultation/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(accessQO(params.id)),
  head: () => ({
    meta: [
      { title: "Téléconsultation sécurisée — Fajma" },
      {
        name: "description",
        content: "Salle d'attente et vidéo privée de votre rendez-vous médical.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeleconsultationPage,
});

function TeleconsultationPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(accessQO(id));
  const refresh = () => qc.invalidateQueries({ queryKey: ["teleconsultation", id] });
  const ready = useMutation({
    mutationFn: () => teleconsultationReady(id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => teleconsultationStart(id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const roomUrl = data.room
    ? `https://${JITSI_DOMAIN}/${encodeURIComponent(data.room)}#config.prejoinPageEnabled=true&config.disableDeepLinking=true&userInfo.displayName=${encodeURIComponent(data.is_doctor ? data.doctor_name : data.patient_name)}`
    : null;

  return (
    <div className="min-h-screen bg-sunu-night text-white">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-5 md:px-8">
        <Link
          to={data.is_doctor ? "/pro" : "/mon-espace"}
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 hover:text-white"
        >
          <ArrowLeft className="size-4" /> Retour
        </Link>
        <span className="flex items-center gap-2 font-bold">
          <FajmaMark className="size-8" />
          Fajma
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
          <LockKeyhole className="size-3.5" /> Salle privée
        </span>
      </header>
      <main className="mx-auto max-w-[1500px] p-4 md:p-6">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-sunu-teal">
            Téléconsultation
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {data.is_doctor
              ? `Consultation de ${data.patient_name}`
              : `Consultation avec ${data.doctor_name}`}
          </h1>
          {data.replacing && (
            <p className="text-sm text-white/70">Remplaçant de {data.replacing}</p>
          )}
          <p className="text-sm text-white/60">
            {formatDateTime(data.scheduled_at, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {roomUrl && (data.started || !data.is_doctor) ? (
          <iframe
            title="Salle de téléconsultation Fajma"
            src={roomUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="h-[calc(100vh-190px)] min-h-[520px] w-full rounded-xl border border-white/10 bg-sunu-night"
          />
        ) : (
          <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            {!data.open_now ? (
              <>
                <Clock className="mx-auto size-10 text-sunu-teal" />
                <p className="mt-4 text-lg font-semibold">
                  La salle ouvre à {formatTime(data.opens_at)}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  15 minutes avant l'heure du rendez-vous. Revenez sur cette page à ce moment-là.
                </p>
              </>
            ) : data.is_doctor ? (
              <>
                <UserCheck
                  className={`mx-auto size-10 ${data.patient_ready ? "text-sunu-teal" : "text-white/40"}`}
                />
                <p className="mt-4 text-lg font-semibold">
                  {data.patient_ready
                    ? `${data.patient_name} est en salle d'attente`
                    : "Le patient n'est pas encore connecté"}
                </p>
                {data.payment_required && (
                  <p className="mt-2 text-sm text-amber-300">
                    Le patient n'a pas encore réglé la consultation.
                  </p>
                )}
                <button
                  onClick={() => start.mutate()}
                  disabled={start.isPending}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sunu-teal px-6 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <Play className="size-4" /> Démarrer la consultation
                </button>
              </>
            ) : data.payment_required ? (
              <>
                <CreditCard className="mx-auto size-10 text-amber-300" />
                <p className="mt-4 text-lg font-semibold">Paiement requis avant la consultation</p>
                <p className="mt-2 text-sm text-white/60">
                  Réglez la consultation depuis votre espace (Wave, Orange Money, Free Money).
                </p>
                <Link
                  to="/mon-espace"
                  className="mt-6 inline-block rounded-xl bg-sunu-green px-6 py-3 font-semibold"
                >
                  Payer maintenant
                </Link>
              </>
            ) : !data.patient_ready ? (
              <>
                <Video className="mx-auto size-10 text-sunu-teal" />
                <p className="mt-4 text-lg font-semibold">Prêt(e) pour votre consultation ?</p>
                <p className="mt-2 text-sm text-white/60">
                  Installez-vous au calme, vérifiez votre connexion, puis signalez votre arrivée au
                  médecin.
                </p>
                <button
                  onClick={() => ready.mutate()}
                  disabled={ready.isPending}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sunu-teal px-6 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <UserCheck className="size-4" /> Entrer en salle d'attente
                </button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto size-10 animate-spin text-sunu-teal" />
                <p className="mt-4 text-lg font-semibold">Vous êtes en salle d'attente</p>
                <p className="mt-2 text-sm text-white/60">
                  {data.doctor_name} va démarrer la consultation. La vidéo s'ouvrira
                  automatiquement.
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
