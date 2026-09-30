/** Lien vers l'aide et le contact du support, présent dans l'en-tête de chaque espace. */
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";

export function HelpLink() {
  return (
    <Link
      to="/aide"
      className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
    >
      <LifeBuoy className="size-4" /> <span className="hidden sm:inline">Aide</span>
    </Link>
  );
}
