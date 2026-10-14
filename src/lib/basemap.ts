/**
 * Fond de carte vectoriel : rues, noms et **bâtiments en relief**, à partir des données OpenStreetMap.
 *
 * Pourquoi pas l'image satellite de Google : ses conditions d'utilisation interdisent d'afficher ses tuiles
 * ailleurs que dans son propre outil, qui est payant et lie la plateforme à ce fournisseur. Le rendu « à la
 * Snapchat » vient, lui, de tuiles vectorielles comme celles-ci — c'est la même technique.
 *
 * Portabilité : le service par défaut (OpenFreeMap) est libre, sans clé et sans compte. Le jour où le trafic
 * le justifie, il s'héberge sur votre propre serveur sans changer une ligne de code — il suffit de pointer
 * VITE_MAP_STYLE_URL sur votre instance. Aucun engagement, aucune facture.
 *
 * Si vous passez un jour à un fournisseur payant (Google, Mapbox), c'est ici et dans la politique de sécurité
 * de nginx (`connect-src`, `img-src`, `worker-src`) que cela se règle.
 */
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

export const MAP_STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ||
  "https://tiles.openfreemap.org/styles/liberty";

// Les mentions de source (OpenFreeMap, OpenStreetMap, OpenMapTiles) sont portées par le style lui-même :
// la carte les affiche repliées, en bas à droite.
/** Dakar, cadrage par défaut quand on n'a encore aucun point à montrer. */
export const DAKAR: [number, number] = [-17.4677, 14.7167];

/** Vrai si l'appareil demande à réduire les animations : on évite alors le relief et les déplacements animés. */
export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Ajoute les bâtiments en relief. Appelé une fois le style chargé.
 *
 * Les hauteurs viennent d'OpenStreetMap : à Dakar et dans les grandes villes elles sont souvent absentes, d'où
 * la hauteur de repli (6 m, environ deux niveaux). Un bâtiment plat vaut mieux qu'un bâtiment manquant : on
 * voit tout de même son emprise au sol, donc la forme des rues et des quartiers.
 */
export function addBuildings(map: MapLibreMap): void {
  if (map.getLayer("fajma-batiments")) return;
  const style = map.getStyle() as StyleSpecification;
  const source = style.sources?.openmaptiles ? "openmaptiles" : Object.keys(style.sources ?? {})[0];
  if (!source) {
    console.warn("[carte] aucune source de tuiles : pas de relief");
    return;
  }
  // Le relief se glisse sous les noms de rues, sinon les étiquettes passent derrière les immeubles.
  const firstLabel = style.layers?.find((l) => l.type === "symbol")?.id;
  try {
    map.addLayer(
      {
        id: "fajma-batiments",
        source,
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#c8d6cd",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 6],
          "fill-extrusion-base": [
            "coalesce",
            ["get", "render_min_height"],
            ["get", "min_height"],
            0,
          ],
          // Les immeubles apparaissent en fondu entre le zoom 14 et 15 : pas de surgissement brutal.
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.85],
        },
      },
      firstLabel,
    );
  } catch (err) {
    // Style sans couche « building » (fond personnalisé, autre fournisseur) : la carte reste utilisable, mais
    // l'exploitant doit savoir pourquoi le relief a disparu.
    console.warn("[carte] relief des bâtiments indisponible dans ce style :", err);
  }
}

/**
 * Fait basculer la vue en relief dès qu'on s'approche, et la remet à plat quand on s'éloigne.
 *
 * Vu du dessus, un immeuble en relief ressemble à un immeuble à plat : sans inclinaison, le travail ne se voit
 * pas. Plutôt que d'attendre que le visiteur découvre qu'on incline la carte à deux doigts, elle le fait
 * d'elle-même au bon moment. De loin, en revanche, l'inclinaison déforme les distances : on revient à plat.
 */
export function tiltWhenClose(map: MapLibreMap, threshold = 15): void {
  if (reducedMotion()) return;
  const update = () => {
    const close = map.getZoom() >= threshold;
    const pitched = map.getPitch() > 5;
    if (close && !pitched) map.easeTo({ pitch: 50, duration: 700 });
    else if (!close && pitched) map.easeTo({ pitch: 0, duration: 500 });
  };
  map.on("zoomend", update);
  update();
}

/** Incline la vue pour faire apparaître le relief, sauf si l'appareil demande des animations réduites. */
export function tilt(map: MapLibreMap, pitch = 50): void {
  if (reducedMotion()) return;
  map.easeTo({ pitch, duration: 600 });
}

/** Pastille verte Fajma, en HTML : aucune image à charger. */
export function markerElement(color = "#00853f", size = 18): HTMLElement {
  const el = document.createElement("span");
  el.style.cssText = `display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer`;
  return el;
}
