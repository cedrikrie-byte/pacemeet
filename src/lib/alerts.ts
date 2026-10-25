import type { Activity, AlertPrefs, SportId, User } from "../types";
import { haversineKm } from "./geo";

export const DEFAULT_ALERTS: AlertPrefs = { on: true, radiusKm: 15, auto: true, runMaxKm: 15, rideMaxKm: 80 };

/** Tempo-Spanne, in der Hinweise kommen. Gleiche Regeln wie auf dem Server (activity_matches_alert). */
export function alertTempoRange(a: AlertPrefs, me: Pick<User, "pace" | "speed">, sport: SportId): [number, number] {
  if (sport === "run") return a.auto ? [me.pace - 30, me.pace + 60] : [a.runPaceMin ?? me.pace - 30, a.runPaceMax ?? me.pace + 60];
  return a.auto ? [me.speed - 4, me.speed + 2] : [a.rideSpeedMin ?? me.speed - 4, a.rideSpeedMax ?? me.speed + 2];
}

export function alertSports(a: AlertPrefs, me: Pick<User, "sports">): SportId[] {
  return a.sports && a.sports.length ? a.sports : me.sports;
}

export function matchesAlert(a: AlertPrefs, me: Pick<User, "pace" | "speed" | "sports">, home: [number, number], act: Pick<Activity, "sport" | "tempo" | "distanceKm" | "lat" | "lng">): boolean {
  if (!a.on) return false;
  const radius = Math.min(Math.max(a.radiusKm, 1), 100);
  if (haversineKm(home, [act.lat, act.lng]) > radius) return false;
  if (!alertSports(a, me).includes(act.sport)) return false;
  const [lo, hi] = alertTempoRange(a, me, act.sport);
  if (act.tempo < lo || act.tempo > hi) return false;
  return act.distanceKm <= (act.sport === "run" ? a.runMaxKm : a.rideMaxKm);
}
