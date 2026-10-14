import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { googleDirectionsUrl, wazeUrl } from "@/lib/directions";
import { addBuildings, DAKAR, MAP_STYLE_URL, markerElement, tiltWhenClose } from "@/lib/basemap";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  doctorId: string;
};

/**
 * Carte des médecins : rues, quartiers et bâtiments en relief (fond vectoriel OpenStreetMap).
 * Chargée uniquement dans le navigateur, et seulement quand la carte est réellement affichée.
 */
export function DoctorMap({ points, height = 420 }: { points: MapPoint[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    import("maplibre-gl").then(({ Map, Marker, Popup, NavigationControl, LngLatBounds }) => {
      if (cancelled || !box.current) return;
      map = new Map({
        container: box.current,
        style: MAP_STYLE_URL,
        center: DAKAR,
        zoom: 10,
        // Le style porte déjà ses mentions de source : repliées, pour ne pas manger la carte.
        attributionControl: { compact: true },
        // La molette ne doit pas capturer le défilement de la page : on zoome aux boutons ou à deux doigts.
        scrollZoom: false,
      });
      map.addControl(new NavigationControl({ visualizePitch: true }), "top-left");

      const bounds = new LngLatBounds();
      for (const p of points) {
        const popup = document.createElement("div");
        const name = document.createElement("b");
        name.textContent = p.title;
        popup.append(name);
        if (p.subtitle) {
          const sub = document.createElement("div");
          sub.textContent = p.subtitle;
          sub.style.fontSize = "12px";
          popup.append(sub);
        }
        const link = document.createElement("button");
        link.textContent = "Voir les disponibilités →";
        link.style.cssText =
          "display:block;margin-top:6px;color:#00853f;font-weight:600;font-size:12px";
        link.onclick = () => navigate({ to: "/medecins/$id", params: { id: p.doctorId } });
        popup.append(link);
        // Itinéraire : ouvre l'application GPS du téléphone (Google Maps ou Waze).
        for (const [label, href] of [
          ["Itinéraire", googleDirectionsUrl(p.lat, p.lng)],
          ["Waze", wazeUrl(p.lat, p.lng)],
        ]) {
          const a = document.createElement("a");
          a.textContent = label;
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener";
          a.style.cssText =
            "display:inline-block;margin:6px 10px 0 0;color:#00753a;font-weight:600;font-size:12px";
          popup.append(a);
        }
        new Marker({ element: markerElement() })
          .setLngLat([p.lng, p.lat])
          .setPopup(new Popup({ offset: 14, closeButton: false }).setDOMContent(popup))
          .addTo(map!);
        bounds.extend([p.lng, p.lat]);
      }

      map.on("load", () => {
        if (!map) return;
        addBuildings(map);
        map.resize();
        // La vue bascule en relief dès que l'on s'approche d'un cabinet, et revient à plat en s'éloignant.
        tiltWhenClose(map);
        if (points.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
        else if (points.length === 1) {
          map.jumpTo({ center: [points[0]!.lng, points[0]!.lat], zoom: 16 });
        }
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, navigate]);

  return (
    <div
      ref={box}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-2xl border border-sunu-line"
      role="region"
      aria-label="Carte des médecins"
    />
  );
}
