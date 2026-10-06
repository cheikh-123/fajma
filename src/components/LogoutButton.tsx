/** Déconnexion : vide les données en mémoire (poste partagé) puis retour à l'accueil. */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { logout } from "@/api/auth";

export function LogoutButton() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await qc.cancelQueries();
        qc.clear();
        await logout();
        navigate({ to: "/", replace: true });
      }}
      aria-label="Se déconnecter"
      className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
    >
      <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
    </button>
  );
}
