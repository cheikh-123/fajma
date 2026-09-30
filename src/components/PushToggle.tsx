/** Active les notifications push sur cet appareil (rappels, confirmations) — gratuit, sans SMS. */
import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

type State = "unsupported" | "loading" | "off" | "on" | "denied" | "disabled";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      return setState("unsupported");
    (async () => {
      const { public_key } = await api.get<{ public_key: string | null }>(
        "/notifications/push/key",
      );
      if (!public_key) return setState("disabled");
      setKey(public_key);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("loading");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key!),
      });
      await api.post("/notifications/push/subscribe", sub.toJSON());
      setState("on");
      toast.success(t("push.enabled"));
    } catch (e) {
      toast.error((e as Error).message);
      setState("off");
    }
  }

  async function disable() {
    setState("loading");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api
        .post("/notifications/push/unsubscribe", { endpoint: sub.endpoint })
        .catch(() => undefined);
      await sub.unsubscribe();
    }
    setState("off");
  }

  // Fonction absente (navigateur, configuration serveur) : on n'affiche rien plutôt qu'un bouton inutile.
  if (state === "unsupported" || state === "disabled") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sunu-line bg-sunu-card p-4 text-sm">
      <p className="flex items-center gap-2 text-sunu-ink/80">
        <BellRing className="size-4 text-sunu-green" />
        {state === "on" ? t("push.on") : state === "denied" ? t("push.denied") : t("push.pitch")}
      </p>
      {state === "loading" ? (
        <Loader2 className="size-4 animate-spin text-sunu-ink/40" />
      ) : state === "on" ? (
        <button
          onClick={disable}
          className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/60"
        >
          {t("push.disable")}
        </button>
      ) : state === "off" ? (
        <button
          onClick={enable}
          className="rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
        >
          {t("push.enable")}
        </button>
      ) : null}
    </div>
  );
}
