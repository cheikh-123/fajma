/**
 * Carte interactive de l'accueil (Leaflet, OpenStreetMap) : médecins et pharmacies à leur adresse, zoom et
 * déplacement, « Autour de moi » (position du téléphone, distances), et pour chaque lieu : prendre rendez-vous,
 * itinéraire Google Maps ou Waze, appeler. Sans réseau ou si la carte ne peut pas se charger, la carte dessinée
 * du Sénégal (SenegalMap) s'affiche à la place.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Pill, Stethoscope } from "lucide-react";
import type { DoctorListItem, Pharmacy } from "@/api/types";
import { SenegalMap } from "@/components/SenegalMap";
import { distanceKm, formatKm, googleDirectionsUrl, MAP_TILES, wazeUrl } from "@/lib/directions";
import "leaflet/dist/leaflet.css";

type Layer = "doctors" | "pharmacies" | "duty";
type Me = { lat: number; lng: number };

/** La fiche s'ouvre toujours entièrement visible, sous les boutons de zoom. */
const POPUP = {
  autoPanPaddingTopLeft: [60, 50] as [number, number],
  autoPanPaddingBottomRight: [20, 20] as [number, number],
};

const SENEGAL_BOUNDS: [[number, number], [number, number]] = [
  [12.3, -17.6],
  [16.7, -11.3],
];

function pin(color: string, glyph: string) {
  return `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);color:#fff;font:700 13px/1 system-ui">${glyph}</span>`;
}

/** Contenu d'une fiche (construit en DOM : aucune donnée n'est interprétée comme du HTML). */
function card(parts: {
  title: string;
  lines: string[];
  actions: { label: string; href?: string; onClick?: () => void; primary?: boolean }[];
}) {
  const box = document.createElement("div");
  box.style.cssText = "min-width:200px;font:13px/1.4 system-ui";
  const t = document.createElement("div");
  t.textContent = parts.title;
  t.style.cssText = "font-weight:700;font-size:14px;color:#0f1a14";
  box.append(t);
  for (const line of parts.lines) {
    const l = document.createElement("div");
    l.textContent = line;
    l.style.cssText = "color:#4a5650;margin-top:2px";
    box.append(l);
  }
  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:10px";
  for (const a of parts.actions) {
    const el = document.createElement(a.href ? "a" : "button");
    el.textContent = a.label;
    if (a.href) {
      (el as HTMLAnchorElement).href = a.href;
      (el as HTMLAnchorElement).target = a.href.startsWith("tel:") ? "_self" : "_blank";
      (el as HTMLAnchorElement).rel = "noopener";
    }
    if (a.onClick) el.addEventListener("click", a.onClick);
    el.style.cssText = `padding:6px 10px;border-radius:9999px;font:600 12px system-ui;text-decoration:none;cursor:pointer;${
      a.primary
        ? "background:#00853f;color:#fff;border:0"
        : "background:#fff;color:#00753a;border:1px solid #cfe3d6"
    }`;
    row.append(el);
  }
  box.append(row);
  return box;
}

export function InteractiveMap({
  doctors,
  pharmacies,
}: {
  doctors: DoctorListItem[];
  pharmacies: Pharmacy[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<Record<Layer, import("leaflet").LayerGroup> | null>(null);
  const meRef = useRef<import("leaflet").Layer | null>(null);
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<Layer>("doctors");
  const [me, setMe] = useState<Me | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  // Création de la carte (une fois).
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !box.current) return;
        const map = L.map(box.current, {
          scrollWheelZoom: false,
          zoomControl: true,
          minZoom: 6,
          maxZoom: 18,
        });
        map.fitBounds(SENEGAL_BOUNDS);
        map.setMaxBounds([
          [10.5, -20],
          [18.5, -9.5],
        ]);
        L.tileLayer(MAP_TILES.url, { maxZoom: 18, attribution: MAP_TILES.attribution }).addTo(map);
        // Molette : seulement après un clic sur la carte (la page défile normalement).
        map.on("click focus", () => map.scrollWheelZoom.enable());
        map.on("mouseout", () => map.scrollWheelZoom.disable());
        mapRef.current = map;
        layersRef.current = {
          doctors: L.layerGroup(),
          pharmacies: L.layerGroup(),
          duty: L.layerGroup(),
        };
        requestAnimationFrame(() => map.invalidateSize());
        setReady(true); // affiche les marqueurs
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Marqueurs (médecins, pharmacies), refaits quand les données ou la position changent.
  useEffect(() => {
    const map = mapRef.current;
    const groups = layersRef.current;
    if (!ready || !map || !groups) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      for (const g of Object.values(groups)) g.clearLayers();
      const away = (lat: number, lng: number) =>
        me ? [`À ${formatKm(distanceKm(me, { lat, lng }))} de vous`] : [];
      for (const d of doctors) {
        if (d.latitude == null || d.longitude == null) continue;
        const marker = L.marker([d.latitude, d.longitude], {
          icon: L.divIcon({
            className: "",
            html: pin("#00853f", "+"),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          title: d.full_name,
        });
        marker.bindPopup(
          () =>
            card({
              title: d.full_name,
              lines: [
                d.specialty?.name ?? "",
                d.address ? `${d.address}, ${d.city}` : d.city,
                d.next_slot
                  ? `Prochain créneau : ${d.next_slot.label}`
                  : "Pas de créneau en ligne cette semaine",
                ...away(d.latitude!, d.longitude!),
              ].filter(Boolean),
              actions: [
                {
                  label: "Prendre rendez-vous",
                  primary: true,
                  onClick: () => navigate({ to: "/medecins/$id", params: { id: d.id } }),
                },
                { label: "Itinéraire", href: googleDirectionsUrl(d.latitude!, d.longitude!) },
                { label: "Waze", href: wazeUrl(d.latitude!, d.longitude!) },
              ],
            }),
          POPUP,
        );
        groups.doctors.addLayer(marker);
      }
      for (const p of pharmacies) {
        const marker = L.marker([p.latitude, p.longitude], {
          icon: L.divIcon({
            className: "",
            html: pin(p.is_on_duty ? "#b45309" : "#0f7f5f", "Rx"),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          title: p.name,
        });
        marker.bindPopup(
          () =>
            card({
              title: p.name,
              lines: [
                p.is_on_duty ? "Pharmacie de garde" : `Ouverte de ${p.opens_at} à ${p.closes_at}`,
                [p.address, p.district, p.city].filter(Boolean).join(", "),
                ...away(p.latitude, p.longitude),
              ],
              actions: [
                {
                  label: "Itinéraire",
                  primary: true,
                  href: googleDirectionsUrl(p.latitude, p.longitude),
                },
                { label: "Waze", href: wazeUrl(p.latitude, p.longitude) },
                ...(p.phone
                  ? [{ label: `Appeler`, href: `tel:${p.phone.replace(/\s/g, "")}` }]
                  : []),
              ],
            }),
          POPUP,
        );
        groups.pharmacies.addLayer(marker);
        if (p.is_on_duty) groups.duty.addLayer(marker);
      }
      for (const [name, g] of Object.entries(groups) as [Layer, import("leaflet").LayerGroup][]) {
        if (name === layer) g.addTo(map);
        else g.remove();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, doctors, pharmacies, layer, me, navigate]);

  // Position de l'utilisateur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    import("leaflet").then((L) => {
      meRef.current?.remove();
      meRef.current = L.circleMarker([me.lat, me.lng], {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .bindTooltip("Vous êtes ici")
        .addTo(map);
      map.setView([me.lat, me.lng], 13);
    });
  }, [me]);

  function locate() {
    if (!navigator.geolocation) {
      setLocError("Votre appareil ne donne pas sa position.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocError(
          "Position refusée ou indisponible : autorisez la localisation dans le navigateur.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (failed) return <SenegalMap />;

  const nearest =
    me &&
    [...doctors]
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => ({ d, km: distanceKm(me, { lat: d.latitude!, lng: d.longitude! }) }))
      .sort((a, b) => a.km - b.km)[0];

  const chip = (value: Layer, label: string, Icon: typeof Pill) => (
    <button
      type="button"
      onClick={() => setLayer(value)}
      aria-pressed={layer === value}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        layer === value
          ? "border-sunu-green bg-sunu-green text-white"
          : "border-sunu-line bg-sunu-card text-sunu-ink/70 hover:border-sunu-green"
      }`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip(
          "doctors",
          `Médecins (${doctors.filter((d) => d.latitude != null).length})`,
          Stethoscope,
        )}
        {chip("pharmacies", `Pharmacies (${pharmacies.length})`, Pill)}
        {chip("duty", `De garde (${pharmacies.filter((p) => p.is_on_duty).length})`, Pill)}
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-green hover:border-sunu-green"
        >
          {locating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Crosshair className="size-3.5" />
          )}{" "}
          Autour de moi
        </button>
      </div>
      <div
        ref={box}
        className="z-0 h-[380px] w-full overflow-hidden rounded-2xl border border-sunu-line sm:h-[440px]"
        role="region"
        aria-label="Carte interactive des médecins et pharmacies du Sénégal"
      />
      {locError && <p className="text-xs font-semibold text-red-700">{locError}</p>}
      {nearest && (
        <p className="text-xs text-sunu-ink/70">
          Médecin le plus proche : <b className="text-sunu-dark">{nearest.d.full_name}</b>
          {nearest.d.specialty ? ` (${nearest.d.specialty.name})` : ""}, à {formatKm(nearest.km)}.{" "}
          <a
            href={googleDirectionsUrl(nearest.d.latitude!, nearest.d.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sunu-green underline"
          >
            Itinéraire
          </a>
        </p>
      )}
      <p className="text-xs text-sunu-ink/55">
        Touchez un lieu pour prendre rendez-vous ou lancer l'itinéraire dans Google Maps ou Waze.
      </p>
    </div>
  );
}
