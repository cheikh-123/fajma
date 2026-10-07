/**
 * Tracé d'un itinéraire routier entre deux points, pour l'afficher sur la carte.
 *
 * Le calcul est fait par un service **OSRM** (logiciel libre). Par défaut, le serveur public de
 * démonstration du projet OpenStreetMap est utilisé : il suffit pour un usage léger. En production, régler
 * `VITE_ROUTING_URL` sur son propre serveur OSRM (et autoriser son adresse dans `connect-src` de la
 * politique de sécurité) : aucune dépendance à un fournisseur payant, et les adresses des patients ne
 * sortent pas de chez vous.
 *
 * Si le service ne répond pas, la carte trace la ligne directe et annonce une distance à vol d'oiseau :
 * l'écran reste utile même hors ligne ou sans ce service.
 */

export type LatLng = { lat: number; lng: number };

export type Route = {
  /** Points du tracé, dans l'ordre. */
  points: [number, number][];
  /** Distance en mètres. */
  meters: number;
  /** Durée estimée en secondes. */
  seconds: number;
};

const ROUTING_URL =
  (import.meta.env.VITE_ROUTING_URL as string | undefined) ||
  "https://router.project-osrm.org/route/v1/driving";

export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<Route | null> {
  const url = `${ROUTING_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const route = data.code === "Ok" ? data.routes?.[0] : undefined;
    if (!route) return null;
    return {
      // OSRM renvoie [longitude, latitude] ; Leaflet attend l'inverse.
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      meters: route.distance,
      seconds: route.duration,
    };
  } catch {
    return null; // hors ligne, service indisponible ou requête annulée
  }
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}
