/**
 * Remontée des erreurs d'affichage (React). Journalise dans la console du navigateur ;
 * c'est ici qu'il faudra brancher un outil de suivi (Sentry, etc.) si besoin.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  // Les loaders et fonctions serveur peuvent lever une Response brute : on en extrait le statut.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error("[Fajma]", message, { route: window.location.pathname, ...context }, error);
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": readCsrf() },
      credentials: "same-origin",
      body: JSON.stringify({ message: message.slice(0, 500), route: window.location.pathname }),
    });
  } catch {
    // la remontée d'erreur ne doit jamais provoquer d'erreur
  }
}

function readCsrf() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]!) : "";
}
