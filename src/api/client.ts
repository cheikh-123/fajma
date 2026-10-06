/**
 * Client HTTP de l'API Django (même origine : /api, relayé vers Django par Vite en développement).
 * La session est un cookie HttpOnly géré par le navigateur ; les requêtes d'écriture portent
 * le jeton CSRF lu dans le cookie "csrftoken".
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Corps complet de la réponse : certaines erreurs portent des détails (alertes d'une ordonnance). */
    public data?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

// Dernière action de l'utilisateur (clic, frappe, défilement) : les comptes professionnels sont déconnectés
// par le serveur après une période sans activité, et les rafraîchissements automatiques ne comptent pas.
let lastInteraction = Date.now();
if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"])
    window.addEventListener(type, () => (lastInteraction = Date.now()), {
      passive: true,
      capture: true,
    });
}

let csrfReady: Promise<void> | null = null;

async function ensureCsrf(): Promise<string> {
  if (!readCookie("csrftoken")) {
    csrfReady ??= fetch("/api/auth/csrf", { credentials: "same-origin" }).then(() => undefined);
    await csrfReady;
    csrfReady = null;
  }
  return readCookie("csrftoken") ?? "";
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Query; body?: unknown; onHeaders?: (h: Headers) => void } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Fajma-Idle": String(Math.floor((Date.now() - lastInteraction) / 1000)),
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = await ensureCsrf();
  }
  let res: Response;
  try {
    res = await fetch(withQuery(`/api${path}`, opts.query), {
      method,
      headers,
      credentials: "same-origin",
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError("Serveur injoignable. Vérifiez votre connexion.", 0);
  }
  // Réponse servie par le service worker depuis le cache (réseau absent) : l'interface l'indique.
  if (res.headers.get("X-Fajma-Offline")) window.dispatchEvent(new Event("fajma:offline-data"));
  opts.onHeaders?.(res.headers);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // Page d'erreur HTML (serveur en panne, passerelle) : message compréhensible plutôt qu'une erreur technique.
    throw new ApiError(
      res.status >= 500
        ? "Le service rencontre un problème momentané. Réessayez dans quelques instants."
        : `Réponse inattendue du serveur (${res.status}).`,
      res.status,
    );
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Erreur ${res.status}`;
    // Compte professionnel sans double authentification : page d'activation obligatoire.
    if (
      res.status === 403 &&
      (data as { mfa_setup_required?: boolean } | null)?.mfa_setup_required &&
      window.location.pathname !== "/securite"
    ) {
      window.location.assign("/securite");
    }
    // Session professionnelle fermée pour inactivité : retour à la connexion, puis à la page en cours.
    if (
      res.status === 401 &&
      (data as { session_expired?: boolean } | null)?.session_expired &&
      window.location.pathname !== "/auth"
    ) {
      const back = window.location.pathname + window.location.search;
      window.location.assign(`/auth?expired=1&redirect=${encodeURIComponent(back)}`);
    }
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  /** Liste paginée : données + nombre total de résultats (en-tête X-Total-Count). */
  getPage: async <T>(path: string, query?: Query) => {
    let total = 0;
    const data = await request<T[]>("GET", path, {
      query,
      onHeaders: (h) => {
        total = Number(h.get("X-Total-Count") ?? 0);
      },
    });
    return { data, total: total || data.length };
  },
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
};
