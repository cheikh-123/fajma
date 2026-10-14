/**
 * Carte interactive de l'accueil : rues, quartiers et bâtiments en relief (fond vectoriel OpenStreetMap),
 * déplacement, « Autour de moi » (position du téléphone, distances), et pour chaque lieu : prendre rendez-vous,
 * itinéraire Google Maps ou Waze, appeler. Sans réseau ou si la carte ne peut pas se charger, la carte dessinée
 * du Sénégal (SenegalMap) s'affiche à la place.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Maximize2, Pill, Stethoscope } from "lucide-react";
import type { DoctorListItem, Pharmacy } from "@/api/types";
import { SenegalMap } from "@/components/SenegalMap";
import { distanceKm, formatKm, googleDirectionsUrl, wazeUrl } from "@/lib/directions";
import { addBuildings, DAKAR, MAP_STYLE_URL, tiltWhenClose } from "@/lib/basemap";
import "maplibre-gl/dist/maplibre-gl.css";

type Layer = "doctors" | "pharmacies" | "duty";
type Me = { lat: number; lng: number };

/** La fiche s'ouvre au-dessus du repère, sans croix de fermeture (on referme en cliquant ailleurs). */
const POPUP = { offset: 18, closeButton: false, maxWidth: "260px" };

const SENEGAL_BOUNDS: [[number, number], [number, number]] = [
  [12.3, -17.6],
  [16.7, -11.3],
];

/** Repère rond avec sa lettre, construit en DOM : le nom du lieu n'est jamais interprété comme du HTML. */
function pinElement(color: string, glyph: string, label: string) {
  const el = document.createElement("span");
  el.title = label;
  el.textContent = glyph;
  el.style.cssText = `display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);color:#fff;font:700 13px/1 system-ui;cursor:pointer`;
  return el;
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
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  // MapLibre n'a pas de groupes de calques : on garde les marqueurs par rubrique et on les affiche ou non.
  const markersRef = useRef<Record<Layer, import("maplibre-gl").Marker[]>>({
    doctors: [],
    pharmacies: [],
    duty: [],
  });
  const meRef = useRef<import("maplibre-gl").Marker | null>(null);
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
    import("maplibre-gl")
      .then(({ Map, NavigationControl }) => {
        if (cancelled || !box.current) return;
        const map = new Map({
          container: box.current,
          style: MAP_STYLE_URL,
          // On ouvre sur Dakar plutôt que sur le pays entier : à l'échelle du Sénégal, aucune carte au
          // monde ne montre les rues ni les bâtiments. Le bouton « Tout le Sénégal » élargit la vue.
          center: DAKAR,
          zoom: 11,
          maxBounds: [-20, 10.5, -9.5, 18.5],
          minZoom: 5,
          maxZoom: 18,
          // Le style porte déjà ses mentions de source : repliées, pour ne pas manger la carte.
          attributionControl: { compact: true },
          scrollZoom: false,
        });
        map.addControl(new NavigationControl({ visualizePitch: true }), "top-left");
        // Molette : seulement après un clic sur la carte, sinon la page ne défile plus.
        map.on("click", () => map.scrollZoom.enable());
        map.getCanvas().addEventListener("mouseleave", () => map.scrollZoom.disable());
        mapRef.current = map;
        map.on("load", () => {
          addBuildings(map);
          map.resize();
          tiltWhenClose(map);
          setReady(true); // affiche les marqueurs
        });
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
    if (!ready || !map) return;
    let cancelled = false;
    import("maplibre-gl").then(({ Marker, Popup }) => {
      if (cancelled) return;
      const groups = markersRef.current;
      for (const list of Object.values(groups)) for (const m of list) m.remove();
      groups.doctors = [];
      groups.pharmacies = [];
      groups.duty = [];
      const away = (lat: number, lng: number) =>
        me ? [`À ${formatKm(distanceKm(me, { lat, lng }))} de vous`] : [];
      for (const d of doctors) {
        if (d.latitude == null || d.longitude == null) continue;
        const marker = new Marker({ element: pinElement("#00853f", "+", d.full_name) }).setLngLat([
          d.longitude,
          d.latitude,
        ]);
        marker.setPopup(
          new Popup(POPUP).setDOMContent(
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
          ),
        );
        groups.doctors.push(marker);
      }
      for (const p of pharmacies) {
        const marker = new Marker({
          element: pinElement(p.is_on_duty ? "#b45309" : "#0f7f5f", "Rx", p.name),
        }).setLngLat([p.longitude, p.latitude]);
        marker.setPopup(
          new Popup(POPUP).setDOMContent(
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
          ),
        );
        groups.pharmacies.push(marker);
        if (p.is_on_duty) groups.duty.push(marker);
      }
      // Une pharmacie de garde figure dans deux rubriques : on n'affiche que celle qui est demandée.
      for (const [name, list] of Object.entries(groups) as [
        Layer,
        import("maplibre-gl").Marker[],
      ][]) {
        for (const m of list) if (name === layer) m.addTo(map);
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
    import("maplibre-gl").then(({ Marker, Popup }) => {
      meRef.current?.remove();
      const dot = document.createElement("span");
      dot.setAttribute("aria-label", "Vous êtes ici");
      dot.style.cssText =
        "display:block;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)";
      meRef.current = new Marker({ element: dot })
        .setLngLat([me.lng, me.lat])
        .setPopup(new Popup({ offset: 14, closeButton: false }).setText("Vous êtes ici"))
        .addTo(map);
      map.easeTo({ center: [me.lng, me.lat], zoom: 13 });
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
          onClick={() =>
            mapRef.current?.fitBounds(
              [
                SENEGAL_BOUNDS[0][1],
                SENEGAL_BOUNDS[0][0],
                SENEGAL_BOUNDS[1][1],
                SENEGAL_BOUNDS[1][0],
              ],
              { padding: 30 },
            )
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green"
        >
          <Maximize2 className="size-3.5" /> Tout le Sénégal
        </button>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-green hover:border-sunu-green sm:ml-auto"
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
