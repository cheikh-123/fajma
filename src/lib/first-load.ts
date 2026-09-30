/**
 * Redirections au tout premier affichage de l'application.
 *
 * La page servie par le serveur web est un squelette commun à toutes les adresses. Si une page
 * protégée redirige (vers la connexion…) pendant que React reprend ce squelette, React signale un
 * décalage (erreur #418) et redessine tout. Au premier chargement seulement, on redirige donc comme
 * un lien classique ; ensuite, les redirections restent instantanées dans l'application.
 */
let hydrated = false;

export function markHydrated() {
  hydrated = true;
}

/** Au premier chargement : redirection du navigateur (renvoie true, l'appelant attend). */
export function redirectBeforeHydration(href: string): boolean {
  if (hydrated || typeof window === "undefined") return false;
  window.location.replace(href);
  return true;
}
