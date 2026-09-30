/**
 * Mode clair / sombre. Sans choix enregistré, on suit le réglage du téléphone ou de l'ordinateur.
 * Le choix est appliqué avant l'affichage de la page (THEME_SCRIPT, dans <head>) pour éviter un flash blanc.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STORAGE_KEY = "sunu-theme";
const THEME_COLORS = { light: "#00853f", dark: "#071a0e" };

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    // Sans choix enregistré, on suit les changements du réglage système.
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        // stockage indisponible : on suit le système
      }
      apply(e.matches);
      setDark(e.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = !dark;
    const root = document.documentElement;
    // Le nouveau thème s'étend en cercle depuis le bouton (navigateurs récents, animations autorisées).
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = e.currentTarget.getBoundingClientRect();
      root.style.setProperty("--vt-x", `${r.left + r.width / 2}px`);
      root.style.setProperty("--vt-y", `${r.top + r.height / 2}px`);
      root.dataset.vt = "theme";
      doc.startViewTransition(() => apply(next)).finished.finally(() => delete root.dataset.vt);
    } else {
      apply(next);
    }
    setDark(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // navigation privée : le choix vaut pour cette visite
    }
  };

  const label = dark ? t("theme.light") : t("theme.dark");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={`grid size-8 shrink-0 place-items-center rounded-full border border-sunu-line bg-sunu-card text-sunu-ink/70 hover:text-sunu-green ${className}`}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
