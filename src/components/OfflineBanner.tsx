/** Bandeau affiché quand le réseau manque : les données visibles sont la dernière version enregistrée. */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const cached = () => setOffline(true);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("fajma:offline-data", cached);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("fajma:offline-data", cached);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900"
    >
      <WifiOff className="size-4" />
      {t("common.offline")}
      <button
        onClick={() => (navigator.onLine ? window.location.reload() : undefined)}
        className="underline"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
