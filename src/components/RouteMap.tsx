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
import { distanceKm, formatKm, googleDirectionsUrl, wazeUrl } from "@/lib/directions";
import { fetchRoute, formatDuration, type LatLng, type Route } from "@/lib/routing";
import { addBuildings, MAP_STYLE_URL, markerElement, tiltWhenClose } from "@/lib/basemap";
import "maplibre-gl/dist/maplibre-gl.css";

const GREEN = "#00853f";
const RED = "#e31b23";

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
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const meMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const readyRef = useRef(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noRoute, setNoRoute] = useState(false);

  // La carte et le point d'arrivée : affichés tout de suite, sans attendre la localisation.
  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl")
      .then(({ Map, Marker, Popup, NavigationControl }) => {
        if (cancelled || !box.current || mapRef.current) return;
        const map = new Map({
          container: box.current,
          style: MAP_STYLE_URL,
          center: [destination.lng, destination.lat],
          zoom: 15,
          // Le style porte déjà ses mentions de source : repliées, pour ne pas manger la carte.
          attributionControl: { compact: true },
          scrollZoom: false,
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ visualizePitch: true }), "top-left");
        new Marker({ element: markerElement(GREEN) })
          .setLngLat([destination.lng, destination.lat])
          .setPopup(new Popup({ offset: 14, closeButton: false }).setText(title))
          .addTo(map);
        map.on("load", () => {
          readyRef.current = true;
          addBuildings(map);
          map.resize();
          // Vue inclinée sur le lieu de consultation : on reconnaît le quartier d'un coup d'œil.
          tiltWhenClose(map, 14);
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      readyRef.current = false;
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
      const { Marker, Popup, LngLatBounds } = await import("maplibre-gl");
      const map = mapRef.current;
      if (!map || cancelled) return;
      meMarkerRef.current?.remove();
      meMarkerRef.current = new Marker({ element: markerElement(RED) })
        .setLngLat([me.lng, me.lat])
        .setPopup(new Popup({ offset: 14, closeButton: false }).setText("Ma position"))
        .addTo(map);

      // Le tracé : [latitude, longitude] côté calcul d'itinéraire, [longitude, latitude] pour la carte.
      const line: [number, number][] = (
        found?.points ?? [
          [me.lat, me.lng],
          [destination.lat, destination.lng],
        ]
      ).map(([lat, lng]) => [lng, lat] as [number, number]);

      const draw = () => {
        const data = {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: line },
        };
        const existing = map.getSource("fajma-trajet");
        if (existing) {
          (existing as import("maplibre-gl").GeoJSONSource).setData(data);
        } else {
          map.addSource("fajma-trajet", { type: "geojson", data });
          map.addLayer({
            id: "fajma-trajet",
            type: "line",
            source: "fajma-trajet",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": GREEN,
              "line-width": 5,
              "line-opacity": 0.85,
              // Trajet direct (service indisponible) : pointillés, pour ne pas le faire passer pour une route.
              ...(found ? {} : { "line-dasharray": [1.5, 1.5] }),
            },
          });
        }
        const bounds = new LngLatBounds();
        for (const point of line) bounds.extend(point);
        map.fitBounds(bounds, { padding: 50, duration: 0 });
      };
      // Le style peut ne pas être encore chargé : on attend, sinon la couche est refusée.
      if (readyRef.current) draw();
      else map.once("load", draw);
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
