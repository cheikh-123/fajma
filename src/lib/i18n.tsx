import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/api/client";
import { setDateLocale } from "@/lib/datetime";
import en from "./i18n/en";
import fr, { type Dict, type TKey } from "./i18n/fr";
import wo from "./i18n/wo";

/**
 * Langues de l'application : français (référence), wolof, anglais.
 * Ajouter une langue = ajouter un fichier dans ./i18n/ (le typage signale toute clé manquante).
 * Le wolof doit être relu par un locuteur natif avant la mise en production.
 */
export type Lang = "fr" | "wo" | "en";
export type { TKey };

export const LANGS: { id: Lang; short: string; label: string }[] = [
  { id: "fr", short: "FR", label: "Français" },
  { id: "wo", short: "WO", label: "Wolof" },
  { id: "en", short: "EN", label: "English" },
];

const DICTS: Record<Lang, Dict> = { fr, wo, en };
const STORAGE_KEY = "sunu-lang";
const isLang = (v: unknown): v is Lang => v === "fr" || v === "wo" || v === "en";

type Vars = Record<string, string | number>;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey, vars?: Vars) => string };

function translate(lang: Lang, key: TKey, vars?: Vars) {
  const text = DICTS[lang][key] ?? fr[key];
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : text;
}

const I18nContext = createContext<Ctx>({
  lang: "fr",
  setLang: () => {},
  t: (k, vars) => translate("fr", k, vars),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Le premier rendu est toujours en français ; la préférence est appliquée ensuite.
  const [lang, setLangState] = useState<Lang>("fr");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) setLangState(saved);
    } catch {
      // stockage indisponible (navigation privée…) : on reste en français
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    setDateLocale(lang);
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignoré
    }
    // Connecté : la langue devient aussi celle des SMS et rappels (sans effet si déconnecté).
    api.post("/auth/language", { lang: l }).catch(() => undefined);
  }, []);
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (k, vars) => translate(lang, k, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={`inline-flex rounded-full border border-sunu-line bg-sunu-card p-0.5 text-xs font-bold ${className}`}
      role="group"
      aria-label="Langue / Làkk / Language"
    >
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          title={l.label}
          className={`rounded-full px-2 py-1 sm:px-2.5 ${lang === l.id ? "bg-sunu-green text-white" : "text-sunu-ink/60 hover:text-sunu-green"}`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
