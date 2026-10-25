import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP } from "../config/map";
import { mapAvailable } from "../lib/mapServices";
import { RouteMap, type MapMarker, type MapPoi, type View } from "./RouteMap";
import { cx } from "./ui";

type P = [number, number];

export interface MapViewProps {
  points: P[];
  center: P;
  centerLabel?: string;
  editable?: boolean;
  onAdd?: (p: P) => void;
  markers?: MapMarker[];
  selectedId?: string | null;
  onMarker?: (id: string) => void;
  accent?: "run" | "ride";
  spanKm?: number;
  /** Ändert sich dieser Wert, wird der Ausschnitt neu eingepasst */
  fitKey?: string;
  /** Seitenverhältnis Breite/Höhe */
  aspect?: number;
  /** Fester Ausschnitt für die Skizze */
  sketchView?: View;
  /** Verschiebbarer Pin am Mittelpunkt (Treffpunkt wählen) */
  pin?: boolean;
  onPinMove?: (p: P) => void;
  /** Benannte Punkte, z. B. Ziel und Zwischenziel */
  pois?: MapPoi[];
  /** Hinweis oben links */
  hint?: string;
}

/** Status des Kartendienstes: null = wird geprüft */
export function useMapLive(): boolean | null {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => { let on = true; mapAvailable().then((ok) => on && setLive(ok)); return () => { on = false; }; }, []);
  return live;
}

/** Echte Karte, wenn der Kartendienst erreichbar ist, sonst die Skizze. */
export function MapView(props: MapViewProps) {
  const live = useMapLive();
  const [failed, setFailed] = useState(false);
  const aspect = props.aspect ?? 360 / 230;
  if (live === null) return <div className="w-full animate-pulse rounded-2xl border border-line bg-raised" style={{ aspectRatio: String(aspect), maxWidth: "100%" }} />;
  if (live && !failed) return <LiveMap {...props} aspect={aspect} onFail={() => setFailed(true)} />;
  return (
    <div className="flex flex-col gap-1.5">
      <RouteMap points={props.points} center={props.center} centerLabel={props.centerLabel} editable={props.editable || props.pin} onAdd={props.pin ? props.onPinMove : props.onAdd}
        accent={props.accent} spanKm={props.spanKm} view={props.sketchView} markers={props.markers} selectedId={props.selectedId} onMarker={props.onMarker}
        pois={props.pois} hint={props.hint ?? (props.pin ? "Tippe, um den Treffpunkt zu setzen" : undefined)} />
      <p className="text-[11.5px] text-muted">Kartendienst nicht erreichbar. Vereinfachte Skizze ohne Kartendaten.</p>
    </div>
  );
}

const DE_LOCALE = {
  "NavigationControl.ZoomIn": "Vergrößern",
  "NavigationControl.ZoomOut": "Verkleinern",
  "AttributionControl.ToggleAttribution": "Quellenangaben",
  "CooperativeGesturesHandler.WindowsHelpText": "Strg + Scrollen zum Zoomen",
  "CooperativeGesturesHandler.MacHelpText": "⌘ + Scrollen zum Zoomen",
  "CooperativeGesturesHandler.MobileHelpText": "Mit zwei Fingern verschieben",
};

function rgbVar(el: HTMLElement, name: string): string {
  const v = getComputedStyle(el).getPropertyValue(`--${name}`).trim().split(/\s+/).join(",");
  return v ? `rgb(${v})` : "#e8421f";
}
const line = (pts: P[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: pts.map((p) => [p[1], p[0]]) } });
const pointFc = (items: { lat: number; lng: number; props: Record<string, unknown> }[]) => ({
  type: "FeatureCollection" as const,
  features: items.map((i) => ({ type: "Feature" as const, properties: i.props, geometry: { type: "Point" as const, coordinates: [i.lng, i.lat] } })),
});

function LiveMap({ points, center, centerLabel, editable, onAdd, markers, selectedId, onMarker, accent = "run", spanKm = 4, fitKey, aspect, onFail, pin, onPinMove, pois, hint }: MapViewProps & { onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef({ onAdd, onMarker, editable, onPinMove, pin });
  cb.current = { onAdd, onMarker, editable, onPinMove, pin };
  const pinRef = useRef<import("maplibre-gl").Marker | null>(null);
  const data = useRef({ points, center, markers, pois });
  data.current = { points, center, markers, pois };

  // Karte einmal anlegen
  useEffect(() => {
    let cancelled = false;
    let m: MLMap | null = null;
    // Nur auf die Skizze wechseln, wenn der Kartenstil gar nicht lädt.
    // (map.loaded() ist auch bei funktionierender Karte false, solange noch Kacheln nachladen.)
    let styleReady = false;
    const failTimer = window.setTimeout(() => { if (!styleReady) onFail(); }, 15000);
    import("maplibre-gl").then(({ default: ml }) => {
      if (cancelled || !el.current) return;
      const zoom = Math.max(10, Math.min(15.5, Math.log2(40000 / Math.max(1, spanKm)) - 1.5));
      m = new ml.Map({
        container: el.current, style: MAP.styleUrl, center: [center[1], center[0]], zoom,
        attributionControl: { compact: true }, cooperativeGestures: !markers, locale: DE_LOCALE,
        dragRotate: false, pitchWithRotate: false, maxZoom: 18,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      let setupDone = false;
      const setup = () => {
        styleReady = true; window.clearTimeout(failTimer);
        if (setupDone || !m || !el.current || !m.isStyleLoaded()) return;
        setupDone = true;
        const col = rgbVar(el.current, accent);
        const run = rgbVar(el.current, "run"), ride = rgbVar(el.current, "ride"), ink = rgbVar(el.current, "ink");
        m.addSource("route", { type: "geojson", data: line([]) });
        m.addSource("start", { type: "geojson", data: pointFc([]) });
        m.addSource("end", { type: "geojson", data: pointFc([]) });
        m.addSource("acts", { type: "geojson", data: pointFc([]) });
        m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
        m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": col, "line-width": 4.5 } });
        m.addLayer({ id: "end", type: "circle", source: "end", paint: { "circle-radius": 5, "circle-color": col, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        m.addLayer({ id: "start", type: "circle", source: "start", paint: { "circle-radius": 7, "circle-color": ink, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
        m.addLayer({ id: "start-label", type: "symbol", source: "start", layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, -1.4], "text-anchor": "bottom" }, paint: { "text-color": ink, "text-halo-color": "#fff", "text-halo-width": 1.5 } });
        m.addLayer({ id: "acts", type: "circle", source: "acts", paint: {
          "circle-radius": ["case", ["boolean", ["get", "selected"], false], 10, 7.5],
          "circle-color": ["match", ["get", "sport"], "run", run, ride],
          "circle-stroke-color": "#fff", "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
        } });
        m.on("mouseenter", "acts", () => { m!.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "acts", () => { m!.getCanvas().style.cursor = cb.current.editable ? "crosshair" : ""; });
        m.addSource("pois", { type: "geojson", data: pointFc([]) });
        m.addLayer({ id: "pois", type: "circle", source: "pois", paint: { "circle-radius": 6, "circle-color": col, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        m.addLayer({ id: "pois-label", type: "symbol", source: "pois", layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, -1.2], "text-anchor": "bottom" }, paint: { "text-color": ink, "text-halo-color": "#fff", "text-halo-width": 1.5 } });
        if (editable || pin) m.getCanvas().style.cursor = "crosshair";
        if (pin) {
          const elPin = document.createElement("div");
          elPin.className = "pm-pin";
          elPin.setAttribute("aria-label", "Treffpunkt, zum Verschieben ziehen");
          elPin.innerHTML = `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43s15-14.6 15-26A15 15 0 0 0 2 17c0 11.4 15 26 15 26z" fill="${col}" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="17" r="5.5" fill="#fff"/></svg>`;
          const mk = new ml.Marker({ element: elPin, draggable: true, anchor: "bottom" }).setLngLat([data.current.center[1], data.current.center[0]]).addTo(m);
          mk.on("dragend", () => { const ll = mk.getLngLat(); cb.current.onPinMove?.([ll.lat, ll.lng]); });
          pinRef.current = mk;
        }
        setReady(true);
      };
      // Einrichten, sobald der Stil da ist (oder spätestens beim ersten fertigen Bild)
      m.on("style.load", setup);
      m.on("load", setup);
      m.on("idle", setup);
      m.on("click", (e) => {
        if (!m) return;
        if (m.getLayer("acts")) {
          const hit = m.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: ["acts"] })[0];
          if (hit) { cb.current.onMarker?.(String(hit.properties?.id)); return; }
        }
        if (cb.current.pin) { pinRef.current?.setLngLat(e.lngLat); cb.current.onPinMove?.([e.lngLat.lat, e.lngLat.lng]); return; }
        if (cb.current.editable) cb.current.onAdd?.([e.lngLat.lat, e.lngLat.lng]);
      });
    }).catch(onFail);
    return () => { cancelled = true; window.clearTimeout(failTimer); m?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daten aktualisieren
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("route") as GeoJSONSource).setData(line(points.length > 1 ? points : []));
    (m.getSource("end") as GeoJSONSource).setData(pointFc(editable && points.length > 1 ? [{ lat: points[points.length - 1][0], lng: points[points.length - 1][1], props: {} }] : []));
    (m.getSource("start") as GeoJSONSource).setData(pointFc(markers || pin ? [] : [{ lat: center[0], lng: center[1], props: { label: centerLabel ?? "" } }]));
    (m.getSource("pois") as GeoJSONSource).setData(pointFc((pois ?? []).map((p) => ({ lat: p.lat, lng: p.lng, props: { label: p.label } }))));
    pinRef.current?.setLngLat([center[1], center[0]]);
    (m.getSource("acts") as GeoJSONSource).setData(pointFc((markers ?? []).map((k) => ({ lat: k.lat, lng: k.lng, props: { id: k.id, sport: k.sport, selected: k.id === selectedId } }))));
  }, [ready, points, center, centerLabel, markers, selectedId, editable, pin, pois]);

  // Ausschnitt einpassen (beim Start und wenn sich fitKey ändert)
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const { points: pts, center: c, markers: mk } = data.current;
    const all: P[] = mk?.length ? mk.map((k) => [k.lat, k.lng]) : [...pts, c, ...(data.current.pois ?? []).map((p) => [p.lat, p.lng] as P)];
    if (all.length < 2) { m.easeTo({ center: [c[1], c[0]], duration: 400 }); return; }
    const lats = all.map((p) => p[0]), lngs = all.map((p) => p[1]);
    const b: LngLatBoundsLike = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
    m.fitBounds(b, { padding: 36, maxZoom: 15, duration: 400 });
  }, [ready, fitKey]);

  return (
    <div className="relative">
      <div ref={el} className={cx("pm-map w-full overflow-hidden rounded-2xl border border-line bg-raised")} style={{ aspectRatio: String(aspect), maxWidth: "100%" }} role="region" aria-label={pin ? "Karte: Treffpunkt verschieben" : editable ? "Karte: tippe, um Wegpunkte zu setzen" : "Karte"} />
      {(hint || pin) && <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-surface/90 px-2 py-1 text-[11.5px] font-semibold text-ink shadow-sm">{hint ?? "Pin ziehen oder auf die Karte tippen"}</p>}
    </div>
  );
}
