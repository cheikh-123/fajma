import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMe, meQueryKey } from "@/api/auth";
import { useLiveEvents } from "@/hooks/use-live-events";

// Pages réservées aux utilisateurs connectés. Confort d'interface seulement :
// la vraie protection est assurée par l'API Django sur chaque requête.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: meQueryKey,
      queryFn: getMe,
      staleTime: 60_000,
    });
    // Après connexion, retour à la page demandée (lien d'ordonnance ou de téléconsultation reçu par SMS…).
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    // Compte professionnel sans double authentification : activation obligatoire avant tout le reste.
    if (user.mfa_setup_required && location.pathname !== "/securite")
      throw redirect({ to: "/securite" });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // Messages et notifications en temps réel sur toutes les pages de l'espace connecté.
  useLiveEvents();
  return <Outlet />;
}
