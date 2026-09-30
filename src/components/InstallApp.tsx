/** Propose d'installer Fajma sur l'écran d'accueil (Android : bouton ; iPhone : explication). */
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const DISMISS_KEY = "fajma-install-dismissed";

export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      // stockage indisponible
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (dismissed || standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault(); // on affiche notre propre bouton, au bon moment
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iPhone/iPad : pas d'invite automatique, on explique le geste « Partager → Sur l'écran d'accueil ».
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIos(true);
      setHidden(false);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignoré
    }
  };

  if (hidden) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-sunu-green/30 bg-sunu-green-soft/40 p-3 text-sm">
      <p className="text-sunu-ink/80">
        {ios ? (
          <>
            Installez Fajma : touchez <Share className="inline size-4" /> puis « Sur l'écran
            d'accueil ».
          </>
        ) : (
          "Installez Fajma sur votre téléphone : accès direct, même avec une connexion faible."
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {event && (
          <button
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              dismiss();
            }}
            className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Download className="size-3.5" /> Installer
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Masquer"
          className="p-1 text-sunu-ink/40 hover:text-sunu-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
