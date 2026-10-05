import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/NotFoundPage";

/**
 * Toute adresse inconnue : page « introuvable » rendue comme une page ordinaire (dans la structure de
 * l'application), ce qui évite l'erreur de reprise React (#418) d'un 404 au premier chargement.
 */
export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [{ title: "Page introuvable — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: NotFoundPage,
});
