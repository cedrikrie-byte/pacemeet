import type { Activity, AppState } from "../types";
import { CITIES } from "../config/app";
import { haversineKm } from "./geo";
import { hasEnded } from "./xp";

export const participantCount = (a: Activity) => a.participantCount ?? a.participants.length;
export const totalPeople = (a: Activity) => participantCount(a) + 1;
export const spotsLeft = (a: Activity) => Math.max(0, a.maxParticipants - totalPeople(a));
export const isHost = (s: AppState, a: Activity) => a.hostId === s.meId;
export const isJoined = (s: AppState, a: Activity) => a.participants.includes(s.meId);
export const isMember = (s: AppState, a: Activity) => isHost(s, a) || isJoined(s, a);
export function distanceFromMe(s: AppState, a: Activity): number {
  const c = CITIES.find((x) => x.id === s.locationCity) ?? CITIES[0];
  return haversineKm([c.lat, c.lng], [a.lat, a.lng]);
}
export const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;

/** Braucht diese Aktivität eine Bestätigung von mir? */
export function needsMyConfirmation(s: AppState, a: Activity): "self" | "host" | null {
  if (a.status !== "open" || !hasEnded(a)) return null;
  if (isJoined(s, a) && !a.selfConfirmed.includes(s.meId)) return "self";
  if (isHost(s, a) && a.hostConfirmed.length === 0 && a.participants.length > 0) return "host";
  return null;
}

/** Warnung bei Eingaben, die wie eine private Wohnadresse aussehen. */
export function looksLikeHomeAddress(v: string): boolean {
  return /\b[\wäöüß-]*(straße|strasse|str\.|weg|allee|gasse|ring|damm)\s*\d+\s*[a-z]?\b/i.test(v) || /\b\d{5}\b/.test(v);
}
