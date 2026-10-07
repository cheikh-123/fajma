/**
 * Flèche de retour, présente dans l'en-tête de chaque page.
 *
 * Revient à la page précédente quand il y en a une. Quand il n'y en a pas — page ouverte depuis un SMS,
 * une notification, un favori ou un nouvel onglet — elle mène à la page parente indiquée par `to`
 * (l'espace du patient, l'accueil…), pour ne jamais laisser l'utilisateur dans une impasse.
 */
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

const STYLE =
  "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-sunu-ink/70 hover:bg-sunu-surface hover:text-sunu-green";

export function BackButton({
  to = "/",
  label = "Retour",
}: {
  /** Page de repli quand il n'y a pas d'historique (arrivée directe sur cette adresse). */
  to?: string;
  label?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (!canGoBack) {
    return (
      <Link to={to} className={STYLE} aria-label={label}>
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      className={STYLE}
      aria-label={label}
    >
      <ArrowLeft className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
