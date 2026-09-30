import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Réseau absent : les lectures partent quand même vers le service worker, qui renvoie la dernière
      // version enregistrée (sinon React Query mettrait les requêtes en pause). Écritures : jamais hors ligne.
      queries: { networkMode: "offlineFirst", retry: 1 },
      mutations: { networkMode: "online" },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
