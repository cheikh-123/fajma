/**
 * Itinéraires : liens qui ouvrent l'application GPS du téléphone (ou le site sur ordinateur) avec le trajet
 * vers un lieu, en partant de la position actuelle. Aucun service de calcul d'itinéraire à héberger : Google Maps
 * et Waze calculent le trajet (voiture, à pied, transports) avec le trafic en temps réel.
 */
export function googleDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function wazeUrl(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/** Distance à vol d'oiseau en kilomètres (formule de haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Fond de carte : OpenStreetMap par défaut ; un autre fournisseur se règle avec VITE_MAP_TILE_URL (à autoriser
 * aussi dans la politique de sécurité img-src de nginx). */
export const MAP_TILES = {
  url:
    (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ||
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    (import.meta.env.VITE_MAP_TILE_ATTRIBUTION as string | undefined) ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};
