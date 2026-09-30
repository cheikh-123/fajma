/**
 * Guide de démarrage du médecin : étapes pour être opérationnel (fiche, justificatif, emploi du temps,
 * motifs, en-tête d'ordonnance, sécurité, publication). Disparaît quand tout est fait ; repliable.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, ChevronDown, Circle, Clock, Rocket } from "lucide-react";
import { useState } from "react";
import { getMyOnboarding, type OnboardingStep } from "@/api/doctor";

const KEY = "fajma:onboarding-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function OnboardingChecklist({
  onGo,
}: {
  onGo: (tab: NonNullable<OnboardingStep["tab"]>) => void;
}) {
  const { data } = useQuery({ queryKey: ["pro-onboarding"], queryFn: getMyOnboarding });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  if (!data || data.done === data.total) return null;
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(KEY, collapsed ? "0" : "1");
    } catch {
      /* stockage indisponible : préférence non mémorisée */
    }
  };
  const next = data.steps.find((s) => !s.done && s.tab);
  const pct = Math.round((data.done / data.total) * 100);

  return (
    <section
      aria-label="Guide de démarrage"
      className="mb-6 rounded-2xl border border-sunu-gold bg-sunu-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sunu-gold/20 text-sunu-dark">
            <Rocket className="size-5" />
          </span>
          <div>
            <h2 className="font-bold text-sunu-dark">Bien démarrer sur Fajma</h2>
            <p className="text-xs text-sunu-ink/60">
              {data.done} étape{data.done > 1 ? "s" : ""} sur {data.total} terminée
              {data.done > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {collapsed && next?.tab && (
            <button
              onClick={() => onGo(next.tab!)}
              className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
            >
              Étape suivante <ArrowRight className="size-3.5" />
            </button>
          )}
          <button
            onClick={toggle}
            aria-expanded={!collapsed}
            className="flex items-center gap-1 text-xs font-semibold text-sunu-ink/60 hover:text-sunu-dark"
          >
            {collapsed ? "Afficher" : "Réduire"}
            <ChevronDown className={`size-4 transition ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-sunu-surface"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression"
      >
        <div
          className="h-full rounded-full bg-sunu-green transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!collapsed && (
        <ol className="stagger mt-4 grid gap-2">
          {data.steps.map((s) => (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 ${s.done ? "bg-sunu-surface/60" : "bg-sunu-surface"}`}
            >
              {s.done ? (
                <CheckCircle2 className="size-5 text-sunu-green" aria-label="Fait" />
              ) : s.tab ? (
                <Circle className="size-5 text-sunu-ink/30" aria-label="À faire" />
              ) : (
                <Clock className="size-5 text-sunu-gold" aria-label="En attente" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${s.done ? "text-sunu-ink/50 line-through" : "text-sunu-dark"}`}
                >
                  {s.title}
                </p>
                {!s.done && <p className="text-xs text-sunu-ink/60">{s.hint}</p>}
              </div>
              {!s.done && s.tab && (
                <button
                  onClick={() => onGo(s.tab!)}
                  className="flex items-center gap-1 rounded-lg border border-sunu-green px-3 py-1.5 text-xs font-semibold text-sunu-green hover:bg-sunu-green-soft"
                >
                  Faire <ArrowRight className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
