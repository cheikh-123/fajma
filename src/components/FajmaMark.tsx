/** Logo Fajma (symbole) : voir lib/fajma-mark.ts. Le nom « Fajma » s'écrit à côté, en texte. */
import { FAJMA_MARK_COLORS, FAJMA_MARK_LETTER, FAJMA_MARK_PATHS } from "@/lib/fajma-mark";

const { scale, dx, dy } = FAJMA_MARK_LETTER;

export function FajmaMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={FAJMA_MARK_PATHS.bubble} fill={FAJMA_MARK_COLORS.bubble} />
      <g transform={`translate(${dx} ${dy}) scale(${scale})`}>
        <path d={FAJMA_MARK_PATHS.letter} fill={FAJMA_MARK_COLORS.letter} />
        <path d={FAJMA_MARK_PATHS.heart} fill={FAJMA_MARK_COLORS.heart} />
      </g>
    </svg>
  );
}
