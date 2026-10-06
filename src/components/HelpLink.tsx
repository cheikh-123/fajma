/**
 * Lien « Aide » de l'en-tête de chaque espace : ouvre le chapitre du guide d'utilisation propre à cet espace
 * (le guide renvoie ensuite vers le contact du support si besoin).
 */
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import type { GuideRoleId } from "@/lib/guide-content";

export function HelpLink({ role = "patient" }: { role?: GuideRoleId }) {
  return (
    <Link
      to="/guide"
      search={{ role }}
      className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
    >
      <LifeBuoy className="size-4" /> <span className="hidden sm:inline">Aide</span>
    </Link>
  );
}
