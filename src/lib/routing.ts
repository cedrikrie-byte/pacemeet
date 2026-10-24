import { MAP } from "../config/map";
import type { BikeType, SportId } from "../types";
import { routeLengthKm } from "./geo";

type P = [number, number];
export interface PlannedRoute { points: P[]; distanceKm: number; ascentM?: number; provider: "BRouter" | "OSRM" | "Luftlinie"; }

function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fn(ctrl.signal).finally(() => clearTimeout(t));
}

async function brouter(waypoints: P[], profile: string): Promise<PlannedRoute> {
  const lonlats = waypoints.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join("|");
  const url = `${MAP.brouterUrl}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  return withTimeout(15000, async (signal) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`BRouter ${r.status}`);
    const j = await r.json() as { features: { properties: Record<string, string>; geometry: { coordinates: number[][] } }[] };
    const f = j.features?.[0];
    if (!f) throw new Error("BRouter: keine Route");
    const points = f.geometry.coordinates.map((c) => [c[1], c[0]] as P);
    const len = parseFloat(f.properties["track-length"]);
    const asc = parseFloat(f.properties["filtered ascend"] ?? f.properties["plain-ascend"]);
    return { points, distanceKm: Number.isFinite(len) ? len / 1000 : routeLengthKm(points), ascentM: Number.isFinite(asc) ? Math.max(0, Math.round(asc)) : undefined, provider: "BRouter" };
  });
}

async function osrm(waypoints: P[], sport: SportId): Promise<PlannedRoute> {
  const coords = waypoints.map((p) => `${p[1]},${p[0]}`).join(";");
  const url = `${MAP.routeUrl(sport === "run" ? "foot" : "bike")}${coords}?overview=full&geometries=geojson`;
  return withTimeout(12000, async (signal) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`OSRM ${r.status}`);
    const j = await r.json() as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const rt = j.routes?.[0];
    if (!rt) throw new Error("OSRM: keine Route");
    const points = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng] as P);
    return { points, distanceKm: rt.distance / 1000, provider: "OSRM" };
  });
}

function straight(waypoints: P[]): PlannedRoute {
  return { points: waypoints, distanceKm: routeLengthKm(waypoints), provider: "Luftlinie" };
}

/**
 * Route über alle Wegpunkte, rad- bzw. lauffreundlich.
 * Reihenfolge: BRouter, dann OSRM, zuletzt Luftlinie (z. B. offline).
 */
export async function planRoute(waypoints: P[], sport: SportId, bikeType: BikeType = "tour", online = true): Promise<PlannedRoute> {
  if (!online) return straight(waypoints);
  const profile = sport === "run" ? MAP.brouterProfiles.run : MAP.brouterProfiles[bikeType];
  try { return await brouter(waypoints, profile); } catch { /* weiter mit OSRM */ }
  try { return await osrm(waypoints, sport); } catch { /* weiter mit Luftlinie */ }
  return straight(waypoints);
}

/** Punkt in gegebener Entfernung (km) und Richtung (Grad, 0 = Nord). */
export function offset(p: P, km: number, bearingDeg: number): P {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (km * Math.cos(b)) / 111.32;
  const dLng = (km * Math.sin(b)) / (111.32 * Math.cos((p[0] * Math.PI) / 180));
  return [p[0] + dLat, p[1] + dLng];
}

/** Wegpunkte für einen Rundkurs: drei Punkte auf einem leicht verzerrten Kreis. */
export function loopWaypoints(start: P, targetKm: number, variant: number, scale = 1): P[] {
  // Wege sind länger als Luftlinie: Kreisumfang ~ 0,72 × Zieldistanz
  const r = ((targetKm * 0.72) / (2 * Math.PI)) * scale;
  const dir = (variant * 67) % 360;                 // Richtung des Kreismittelpunkts
  const center = offset(start, r, dir);
  const back = (dir + 180) % 360;                   // Start liegt auf dem Kreis
  const pts: P[] = [start];
  [90, 180, 270].forEach((a, i) => {
    const wobble = 1 + 0.12 * Math.sin(variant * 1.7 + i * 2.1);
    pts.push(offset(center, r * wobble, (back + a) % 360));
  });
  pts.push(start);
  return pts;
}

/** Rundkurs mit Wunschdistanz. Passt den Radius einmal nach, wenn die Länge stark abweicht. */
export async function planLoop(start: P, targetKm: number, sport: SportId, bikeType: BikeType, variant: number, online = true): Promise<PlannedRoute> {
  let scale = online ? 1 : 1 / 0.72 * 0.95;
  let best: PlannedRoute | null = null;
  for (let i = 0; i < 3; i++) {
    const r = await planRoute(loopWaypoints(start, targetKm, variant, scale), sport, bikeType, online);
    if (!best || Math.abs(r.distanceKm - targetKm) < Math.abs(best.distanceKm - targetKm)) best = r;
    const ratio = r.distanceKm / targetKm;
    if (ratio > 0.9 && ratio < 1.1) break;
    scale *= Math.max(0.5, Math.min(1.8, 1 / ratio));
  }
  return best!;
}

/** Start → Ziel, optional über Zwischenziel und zurück. */
export async function planAtoB(start: P, dest: P, via: P | null, returnTrip: "none" | "same" | "different", sport: SportId, bikeType: BikeType, online = true): Promise<PlannedRoute> {
  const outWps: P[] = via ? [start, via, dest] : [start, dest];
  if (returnTrip === "none") return planRoute(outWps, sport, bikeType, online);
  if (returnTrip === "same") {
    // Über BRouter gerechnet, damit auch die Höhenmeter des Rückwegs stimmen
    return planRoute([...outWps, ...outWps.slice(0, -1).reverse()], sport, bikeType, online);
  }
  // anderer Rückweg: über einen seitlich versetzten Punkt zurück
  const mid: P = [(start[0] + dest[0]) / 2, (start[1] + dest[1]) / 2];
  const dy = dest[0] - start[0], dx = (dest[1] - start[1]) * Math.cos((start[0] * Math.PI) / 180);
  const side: P = [mid[0] - dx * 0.35, mid[1] + (dy * 0.35) / Math.cos((start[0] * Math.PI) / 180)];
  return planRoute([...outWps, side, start], sport, bikeType, online);
}
