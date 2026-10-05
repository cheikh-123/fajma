import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { googleDirectionsUrl, MAP_TILES, wazeUrl } from "@/lib/directions";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  doctorId: string;
};

/**
 * Carte OpenStreetMap (Leaflet) des médecins. Chargée uniquement dans le navigateur.
 * Les marqueurs sont des pastilles CSS : pas d'image externe à charger.
 */
export function DoctorMap({ points, height = 420 }: { points: MapPoint[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false }).setView([14.7167, -17.4677], 11);
      L.tileLayer(MAP_TILES.url, { maxZoom: 18, attribution: MAP_TILES.attribution }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#00853f;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const bounds: [number, number][] = [];
      for (const p of points) {
        const marker = L.marker([p.lat, p.lng], { icon, title: p.title }).addTo(map);
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
        link.style.cssText = "margin-top:6px;color:#00853f;font-weight:600;font-size:12px";
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
        marker.bindPopup(popup);
        bounds.push([p.lat, p.lng]);
      }
      // Cadrage après la mise en page : la carte doit connaître sa taille réelle pour englober tous les points.
      const fit = () => {
        if (!map) return;
        map.invalidateSize();
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
        else if (bounds.length === 1) map.setView(bounds[0]!, 14);
      };
      requestAnimationFrame(fit);
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
