/* Fajma — service worker : réseau lent (3G), hors ligne et notifications push.
 *
 * - /assets/* (fichiers versionnés) : cache d'abord, ils ne changent jamais.
 * - Pages : réseau d'abord ; hors ligne, l'application déjà chargée une fois s'ouvre quand même.
 * - Quelques lectures de l'API (mes RDV, carnet, documents, annuaire) : réseau d'abord avec délai
 *   limité, puis dernière version connue — la réponse porte alors l'en-tête X-Fajma-Offline.
 *   Ces données personnelles sont effacées à la déconnexion (message « logout »).
 * - Tout le reste (écritures, paiements, fichiers médicaux) ne passe jamais par le cache.
 */
const VERSION = "fajma-v3"; // v3 : nouveau logo (icônes)
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;
const OFFLINE_URL = "/offline.html";
const SHELL_URL = "/_shell.html"; // coquille de l'application (servie pour toutes les pages)
const NETWORK_TIMEOUT_MS = 6000;

// Lectures utiles hors ligne (préfixes d'URL).
const CACHED_API = [
  "/api/auth/me",
  "/api/appointments/mine",
  "/api/carnet/",
  "/api/patient/health",
  "/api/patient/relatives",
  "/api/documents/issued",
  "/api/insurance/coverages",
  "/api/pharmacy/orders",
  "/api/directory/specialties",
  "/api/directory/doctors",
  "/api/directory/pharmacies",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll([OFFLINE_URL, SHELL_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) {
      // Signale à l'application qu'il s'agit d'une copie enregistrée (bandeau « hors ligne »).
      const headers = new Headers(hit.headers);
      headers.set("X-Fajma-Offline", "1");
      return new Response(await hit.blob(), { status: hit.status, headers });
    }
    if (fallback) return fallback();
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (CACHED_API.some((p) => url.pathname.startsWith(p))) {
      event.respondWith(networkFirst(req, DATA));
    }
    return;
  }

  if (req.mode === "navigate") {
    // Hors ligne : la page déjà vue, sinon la coquille de l'application (elle affiche les données enregistrées),
    // sinon la page « hors ligne ».
    event.respondWith(
      networkFirst(
        req,
        PAGES,
        async () => (await caches.match(SHELL_URL)) || caches.match(OFFLINE_URL),
      ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "logout") {
    event.waitUntil(caches.delete(DATA));
  }
});

// ── Notifications push ────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Fajma", body: event.data?.text() ?? "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Fajma", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
      lang: "fr",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) return existing.navigate(target).then((w) => (w || existing).focus());
      return self.clients.openWindow(target);
    }),
  );
});
