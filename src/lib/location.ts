import { CITIES } from "../config/app";
import type { AppState } from "../types";

type P = [number, number];

/** Mittelpunkt einer bekannten Stadt (Kürzel oder Name), sonst null. */
export function knownCityPos(cityOrId: string): P | null {
  const c = CITIES.find((x) => x.id === cityOrId || x.name.toLowerCase() === cityOrId.toLowerCase());
  return c ? [c.lat, c.lng] : null;
}

/** Bezugspunkt für Umkreissuche und Entfernungen. */
export function myPos(s: AppState): P {
  return s.locationPos ?? knownCityPos(s.locationCity) ?? (s.users[s.meId]?.cityPos) ?? [CITIES[0].lat, CITIES[0].lng];
}
