/**
 * Carte de l'itinéraire vers un rendez-vous : le lieu de consultation, la position du patient, et le trajet
 * routier entre les deux (distance et durée estimée). Les boutons ouvrent la navigation guidée du téléphone
 * (Google Maps ou Waze), qui tient compte du trafic.
 *
 * Sans autorisation de localisation, la carte montre simplement le cabinet. Si le calcul d'itinéraire est
 * indisponible, le trajet direct est tracé en pointillés avec la distance à vol d'oiseau.
 */
import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Navigation } from "lucide-react";
import { distanceKm, formatKm, googleDirectionsUrl, MAP_TILES, wazeUrl } from "@/lib/directions";
import { fetchRoute, formatDuration, type LatLng, type Route } from "@/lib/routing";
import "leaflet/dist/leaflet.css";

const GREEN = "#00853f";
const RED = "#e31b23";

function dot(color: string, label: string) {
  return `<span aria-label="${label}" style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span>`;
}

export function RouteMap({
  destination,
  title,
  address,
  height = 260,
}: {
  destination: LatLng;
  title: string;
  address: string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const lineRef = useRef<import("leaflet").Polyline | null>(null);
  const meMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noRoute, setNoRoute] = useState(false);

  // La carte et le point d'arrivée : affichés tout de suite, sans attendre la localisation.
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !box.current || mapRef.current) return;
        const map = L.map(box.current, { scrollWheelZoom: false }).setView(
          [destination.lat, destination.lng],
          14,
        );
        mapRef.current = map;
        L.tileLayer(MAP_TILES.url, { maxZoom: 18, attribution: MAP_TILES.attribution }).addTo(map);
        L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({
            className: "",
            html: dot(GREEN, title),
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          title,
        })
          .addTo(map)
          .bindPopup(`${title}`);
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [destination.lat, destination.lng, title]);

  // Position du patient, puis tracé du trajet.
  useEffect(() => {
    if (!me) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      const found = await fetchRoute(me, destination, controller.signal);
      if (cancelled) return;
      setRoute(found);
      setNoRoute(!found);
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map || cancelled) return;
      meMarkerRef.current?.remove();
      meMarkerRef.current = L.marker([me.lat, me.lng], {
        icon: L.divIcon({
          className: "",
          html: dot(RED, "Ma position"),
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: "Ma position",
      })
        .addTo(map)
        .bindPopup("Ma position");
      lineRef.current?.remove();
      const points: [number, number][] = found?.points ?? [
        [me.lat, me.lng],
        [destination.lat, destination.lng],
      ];
      lineRef.current = L.polyline(points, {
        color: GREEN,
        weight: 5,
        opacity: 0.85,
        // Trajet direct (service indisponible) : pointillés, pour ne pas le faire passer pour une route.
        dashArray: found ? undefined : "8 8",
      }).addTo(map);
      map.fitBounds(lineRef.current.getBounds(), { padding: [30, 30] });
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [me, destination]);

  const locate = () => {
    if (!navigator.geolocation) return setFailed(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const asCrow = me ? distanceKm(me, destination) : null;
  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/75 hover:border-sunu-green hover:text-sunu-green";

  return (
    <div className="mt-3 rounded-xl border border-sunu-line bg-sunu-surface p-3">
      <p className="flex items-start gap-1.5 text-xs font-semibold text-sunu-dark">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-sunu-green" />
        <span>
          {title}
          <span className="block font-normal text-sunu-ink/60">{address}</span>
        </span>
      </p>
      {failed ? (
        <p className="mt-2 text-xs text-sunu-ink/60">
          La carte n'a pas pu se charger. Utilisez les boutons ci-dessous pour l'itinéraire.
        </p>
      ) : (
        <div
          ref={box}
          style={{ height }}
          role="region"
          aria-label={`Itinéraire vers ${title}`}
          className="z-0 mt-2 w-full overflow-hidden rounded-lg border border-sunu-line"
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!me && (
          <button type="button" onClick={locate} disabled={locating} className={button}>
            {locating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Crosshair className="size-3.5" />
            )}
            Partir de ma position
          </button>
        )}
        <a
          href={googleDirectionsUrl(destination.lat, destination.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <Navigation className="size-3.5" /> Google Maps
        </a>
        <a
          href={wazeUrl(destination.lat, destination.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <Navigation className="size-3.5" /> Waze
        </a>
        {route && (
          <span className="text-xs text-sunu-ink/70">
            <b className="text-sunu-dark">{formatKm(route.meters / 1000)}</b> ·{" "}
            {formatDuration(route.seconds)} en voiture
          </span>
        )}
        {noRoute && asCrow !== null && (
          <span className="text-xs text-sunu-ink/60">
            {formatKm(asCrow)} à vol d'oiseau (trajet routier indisponible)
          </span>
        )}
      </div>
    </div>
  );
}
