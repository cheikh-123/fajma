/**
 * Écran de la salle d'attente (télévision ou ordinateur branché à un écran) : derniers numéros appelés par
 * service et guichet, en très grand. À chaque appel : signal sonore et annonce vocale (« Numéro A 12, box 2 »).
 * Aucune donnée personnelle : seulement les numéros.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getDisplay } from "@/api/queues";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/affichage/$facilityId")({
  head: () => ({
    meta: [{ title: "Salle d'attente — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: DisplayPage,
});

function announce(label: string, desk: string | null) {
  try {
    const ctx = new AudioContext();
    [0, 0.3].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i ? 660 : 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch {
    /* pas d'audio */
  }
  if ("speechSynthesis" in window) {
    // « A12 » se lit « A douze » : on sépare la lettre du nombre.
    const spoken = `Numéro ${label.replace(/^([A-Z]+)(\d+)$/, "$1, $2")}${desk ? `, ${desk}` : ", à l'accueil"}.`;
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = "fr-FR";
    u.rate = 0.9;
    window.setTimeout(() => window.speechSynthesis.speak(u), 700);
  }
}

function DisplayPage() {
  const { facilityId } = Route.useParams();
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { data } = useQuery({
    queryKey: ["queue-display", facilityId],
    queryFn: () => getDisplay(facilityId),
    refetchInterval: 4000,
  });
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!data) return;
    const latest = data.services.flatMap((s) => s.called.slice(0, 1));
    const keys = latest.map((c) => `${c.label}@${c.desk ?? ""}`);
    if (seen.current && sound) {
      latest
        .filter((_, i) => !seen.current!.has(keys[i]))
        .forEach((c) => announce(c.label, c.desk));
    }
    seen.current = new Set(keys);
  }, [data, sound]);

  return (
    <main className="min-h-screen bg-[#06140d] p-6 text-white">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FajmaMark className="size-10" />
          <div>
            <p className="text-2xl font-bold">{data?.facility.name ?? "…"}</p>
            <p className="text-sm text-white/60">
              Écoutez votre numéro ou suivez-le sur votre téléphone
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-bold tabular-nums">
            {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <button
            onClick={() => {
              // Le navigateur n'autorise le son qu'après un clic : on en profite pour le tester.
              if (!sound && "speechSynthesis" in window) {
                const u = new SpeechSynthesisUtterance("Annonces activées.");
                u.lang = "fr-FR";
                window.speechSynthesis.speak(u);
              }
              setSound((v) => !v);
            }}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold"
          >
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            {sound ? "Annonces activées" : "Activer les annonces"}
          </button>
        </div>
      </header>
      <div
        className="mt-8 grid gap-6"
        style={{
          gridTemplateColumns: `repeat(${Math.min(data?.services.length ?? 1, 3)}, minmax(0, 1fr))`,
        }}
      >
        {(data?.services ?? []).map((s) => (
          <section key={s.id} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <h2 className="text-2xl font-bold text-[#7ee2a8]">{s.name}</h2>
            {s.called[0] ? (
              <div className="mt-4 rounded-2xl bg-[#00853f] p-6 text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-white/80">Appelé</p>
                <p className="text-8xl font-black tabular-nums">{s.called[0].label}</p>
                <p className="text-3xl font-bold">{s.called[0].desk ?? "Accueil"}</p>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-white/5 p-10 text-center text-xl text-white/60">
                Aucun appel pour l'instant
              </p>
            )}
            <ul className="mt-4 grid grid-cols-3 gap-2 text-center">
              {s.called.slice(1, 4).map((c) => (
                <li key={`${c.label}-${c.desk}`} className="rounded-xl bg-white/5 py-2">
                  <p className="text-2xl font-bold tabular-nums">{c.label}</p>
                  <p className="text-xs text-white/60">{c.desk ?? "Accueil"}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-lg text-white/70">{s.waiting} personne(s) en attente</p>
          </section>
        ))}
      </div>
      <footer className="mt-10 text-center text-white/50">
        Prenez votre ticket depuis votre téléphone : fajma.sn/hopitaux ou par USSD (menu 5)
      </footer>
    </main>
  );
}
