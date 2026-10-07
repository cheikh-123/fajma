/**
 * Générique d'ouverture : un tracé d'électrocardiogramme traverse l'écran, les battements s'accélèrent,
 * un éclat révèle le logo, puis l'écran s'efface sur la page d'accueil. Sept secondes.
 *
 * Il ne se joue qu'une fois par visite (première ouverture de l'application), jamais entre les pages.
 * « Passer » l'interrompt à tout moment, et il est entièrement ignoré pour qui a demandé à son appareil
 * de réduire les animations : la page d'accueil s'affiche alors immédiatement.
 */
import { useEffect, useRef, useState } from "react";
import { FajmaMark } from "@/components/FajmaMark";

const TOTAL = 7000; // durée du générique
const REVEAL = 5000; // le logo commence à apparaître
const FADE = 800; // fondu final vers la page d'accueil
const ONCE_KEY = "fajma-ouverture";

/** Vrai si le générique doit être joué : première ouverture de la visite, et animations non réduites. */
export function shouldPlayOpening(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    if (sessionStorage.getItem(ONCE_KEY)) return false;
    sessionStorage.setItem(ONCE_KEY, "1");
  } catch {
    // Navigation privée ou stockage bloqué : on joue le générique, sans mémoriser.
  }
  return true;
}

export function OpeningSplash({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const finished = useRef(false);

  // Fin du générique : un seul passage, que l'on arrive au bout ou que l'on passe.
  const finish = useRef(() => {});
  finish.current = () => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    window.setTimeout(onDone, FADE);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const size = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05090f";
      ctx.fillRect(0, 0, w, h);
    };
    size();
    window.addEventListener("resize", size);

    const mid = () => h * 0.52;
    const amp = () => Math.min(h * 0.26, 190);

    /** Hauteur du tracé au point `p` (0 à 1) d'un battement : onde P, complexe QRS, onde T. */
    const beat = (p: number): number => {
      const m = mid();
      const a = amp();
      if (p < 0.08) return m - a * 0.1 * Math.sin((p / 0.08) * Math.PI);
      if (p < 0.14) return m;
      if (p < 0.18) return m + a * 0.12 * ((p - 0.14) / 0.04);
      if (p < 0.24) return m + a * 0.12 - a * 1.12 * ((p - 0.18) / 0.06);
      if (p < 0.3) return m - a + a * 1.28 * ((p - 0.24) / 0.06);
      if (p < 0.36) return m + a * 0.28 - a * 0.28 * ((p - 0.3) / 0.06);
      if (p < 0.52) return m;
      if (p < 0.72) return m - a * 0.24 * Math.sin(((p - 0.52) / 0.2) * Math.PI);
      return m;
    };

    const started = performance.now();
    let raf = 0;
    let x = 0; // position de la pointe, en pixels
    let traveled = 0; // distance totale parcourue : sert à placer les battements
    let prev: { x: number; y: number } | null = null;
    let last = started;

    const frame = (now: number) => {
      const t = now - started;
      const dt = Math.min(now - last, 50);
      last = now;

      // Traînée : le tracé s'efface lentement derrière la pointe.
      ctx.fillStyle = "rgba(5, 9, 15, 0.075)";
      ctx.fillRect(0, 0, w, h);

      // La pointe avance de plus en plus vite et les battements se resserrent.
      const rush = Math.pow(Math.min(t / (REVEAL - 500), 1), 2);
      const speed = (w / 3000) * (1 + rush * 2.6); // pixels par milliseconde
      const period = Math.max(w * 0.3 * (1 - rush * 0.58), 110); // pixels par battement

      ctx.strokeStyle = "#3ee08a";
      ctx.lineWidth = 2.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(62, 224, 138, 0.9)";
      ctx.shadowBlur = 18 + rush * 16;

      // Le tracé est dessiné par petits pas : sans cela, le pic du battement serait sauté
      // dès que l'image met un peu de temps à s'afficher.
      const advance = speed * dt;
      const steps = Math.max(1, Math.ceil(advance / 2));
      for (let i = 0; i < steps; i++) {
        const nx = x + advance / steps;
        traveled += advance / steps;
        const wrapped = nx >= w;
        const px = wrapped ? 0 : nx;
        const y = beat((((traveled % period) + period) % period) / period);
        if (prev && !wrapped) {
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(px, y);
          ctx.stroke();
        }
        prev = { x: px, y };
        x = px;
      }
      ctx.shadowBlur = 0;
      if (prev) {
        // Pointe lumineuse
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#eafff2";
        ctx.beginPath();
        ctx.arc(prev.x, prev.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (t >= REVEAL && !finished.current) setRevealed(true);
      if (t >= TOTAL - FADE) {
        finish.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="fixed inset-0 z-[100] overflow-hidden bg-[#05090f]"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      {/* Éclat au dernier battement, puis le logo s'installe. */}
      <div
        className="pointer-events-none absolute inset-0 bg-white"
        style={{
          opacity: revealed ? 0 : 0,
          animation: revealed ? "fajma-open-flash 420ms ease-out both" : "none",
        }}
      />
      <div
        className="absolute inset-0 grid place-items-center"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "none" : "scale(0.92)",
          transition:
            "opacity 900ms cubic-bezier(0.16, 1, 0.3, 1), transform 900ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="grid justify-items-center gap-4 px-6 text-center">
          <FajmaMark className="size-20 drop-shadow-[0_18px_50px_rgba(62,224,138,0.4)]" />
          <p className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Fajma</p>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8ea396]">
            Santé numérique du Sénégal
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => finish.current()}
        aria-hidden="false"
        className="absolute bottom-6 right-6 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:border-white/50 hover:text-white"
      >
        Passer
      </button>
    </div>
  );
}
