/**
 * Temps réel : écoute le flux d'événements du serveur (/api/events) tant que l'utilisateur est connecté.
 * Nouveau message ou nouvelle notification → les données concernées sont rechargées aussitôt et une alerte
 * s'affiche. Le navigateur rouvre seul la connexion si elle est coupée (réseau mobile).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

type MessageEvent = { doctor_id: string; patient_id: string; from: string; preview: string };
type NotificationEvent = { kind: string; title: string; body: string; link: string };

export function useLiveEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/events", { withCredentials: true });

    source.addEventListener("message", (e) => {
      const m = JSON.parse((e as globalThis.MessageEvent).data) as MessageEvent;
      qc.invalidateQueries({ queryKey: ["thread", m.doctor_id, m.patient_id] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (!window.location.pathname.startsWith("/messages")) {
        toast(`Nouveau message de ${m.from}`, {
          description: m.preview,
          action: { label: "Lire", onClick: () => window.location.assign("/messages") },
        });
      }
    });

    source.addEventListener("notification", (e) => {
      const n = JSON.parse((e as globalThis.MessageEvent).data) as NotificationEvent;
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (n.kind === "message") return; // déjà signalé par l'événement « message »
      // Un RDV confirmé, une ordonnance prête… : les listes affichées sont rafraîchies.
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "notifications",
      });
      toast(n.title, {
        description: n.body || undefined,
        action: n.link
          ? { label: "Voir", onClick: () => window.location.assign(n.link) }
          : undefined,
      });
    });

    return () => source.close();
  }, [qc]);
}
