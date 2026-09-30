/** Espace médecin : synchronisation avec son agenda personnel (Google Agenda, Outlook, iPhone). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarSync, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { formatDateTime } from "@/lib/datetime";

type CalendarLinks = {
  feed_url: string;
  import_url: string | null;
  last_import_at: string | null;
  last_import_error: string | null;
  imported_count: number;
};

const getLinks = () => api.get<CalendarLinks>("/pro/calendar");
const saveImport = (import_url: string) => api.post<CalendarLinks>("/pro/calendar", { import_url });
const syncNow = () => api.post<CalendarLinks>("/pro/calendar/sync");
const resetFeed = () => api.post<CalendarLinks>("/pro/calendar/reset");

export function CalendarSyncPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-calendar"], queryFn: getLinks });
  const [url, setUrl] = useState<string | null>(null);
  const done = (msg: string) => (res: CalendarLinks) => {
    qc.setQueryData(["pro-calendar"], res);
    qc.invalidateQueries({ queryKey: ["doctor-slots"] });
    setUrl(null);
    toast.success(msg);
  };
  const onError = (e: Error) => {
    toast.error(e.message);
    qc.invalidateQueries({ queryKey: ["pro-calendar"] });
  };
  const save = useMutation({
    mutationFn: () => saveImport(url ?? ""),
    onSuccess: done("Agenda enregistré"),
    onError,
  });
  const sync = useMutation({ mutationFn: syncNow, onSuccess: done("Agenda synchronisé"), onError });
  const reset = useMutation({
    mutationFn: resetFeed,
    onSuccess: done("Nouveau lien créé : l'ancien ne fonctionne plus"),
    onError,
  });
  if (!data) return null;
  const importValue = url ?? data.import_url ?? "";

  return (
    <section
      aria-label="Synchronisation d'agenda"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <CalendarSync className="size-4" /> Mon agenda personnel
      </h2>

      <h3 className="mt-3 text-xs font-semibold text-sunu-dark">
        1. Voir mes RDV Fajma dans mon agenda
      </h3>
      <p className="mt-0.5 text-[11px] text-sunu-ink/55">
        Google Agenda : « Autres agendas » → « + » → « À partir de l'URL ». iPhone : Réglages →
        Calendrier → Comptes → « Ajouter un calendrier avec abonnement ». Outlook : « Ajouter un
        calendrier » → « À partir d'Internet ».
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <input
          readOnly
          aria-label="Lien d'abonnement"
          value={data.feed_url}
          className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-surface px-2 py-1.5 font-mono text-[11px]"
        />
        <button
          onClick={() =>
            navigator.clipboard.writeText(data.feed_url).then(() => toast.success("Lien copié"))
          }
          aria-label="Copier le lien"
          className="rounded-lg border border-sunu-line px-2 text-sunu-ink/60"
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-[11px] text-sunu-ink/45">
        Google Agenda relit ce lien toutes les quelques heures, Outlook environ toutes les 3 h : les
        nouveaux RDV y apparaissent avec ce décalage (ils sont immédiats dans Fajma). Lien personnel
        : ne le partagez pas (initiales des patients uniquement).{" "}
        <button onClick={() => reset.mutate()} className="underline">
          Créer un nouveau lien
        </button>
      </p>

      <h3 className="mt-4 text-xs font-semibold text-sunu-dark">
        2. Bloquer sur Fajma les moments où je suis occupé
      </h3>
      <p className="mt-0.5 text-[11px] text-sunu-ink/55">
        Google Agenda : paramètres de votre agenda → « Adresse secrète au format iCal ». Seuls les
        horaires sont lus, jamais les titres ; les événements marqués « disponible » sont ignorés.
        Relecture toutes les 10 minutes.
      </p>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <input
          aria-label="Adresse iCal de mon agenda"
          placeholder="https://calendar.google.com/…/basic.ics"
          value={importValue}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-sunu-line px-2 py-1.5 text-xs"
        />
        <button
          disabled={save.isPending || url === null}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          {save.isPending && <Loader2 className="size-3 animate-spin" />}{" "}
          {!importValue && data.import_url ? "Retirer" : "Enregistrer"}
        </button>
      </form>
      {data.import_url && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          {data.last_import_error ? (
            <span className="text-red-600">Erreur : {data.last_import_error}</span>
          ) : (
            <span className="text-sunu-teal">
              {data.imported_count} période(s) occupée(s)
              {data.last_import_at &&
                ` · lu le ${formatDateTime(data.last_import_at, { dateStyle: "short", timeStyle: "short" })}`}
            </span>
          )}
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1 font-semibold text-sunu-green"
          >
            <RefreshCw className={`size-3 ${sync.isPending ? "animate-spin" : ""}`} /> Synchroniser
          </button>
        </div>
      )}
    </section>
  );
}
