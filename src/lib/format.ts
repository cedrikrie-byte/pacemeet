import type { SportId, Units } from "../types";
import { SPORTS } from "../data/sports";

const MI = 1.609344;
let LOCALE = "de-DE";
export const setLocale = (l: string) => { LOCALE = l; };

const nf = (d: number) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtDistance(km: number, units: Units, digits = 1): string {
  const v = units === "imperial" ? km / MI : km;
  return `${nf(v >= 100 ? 0 : digits).format(v)} ${units === "imperial" ? "mi" : "km"}`;
}

export function secToClock(s: number): string {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
export function clockToSec(v: string): number | null {
  const m = v.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Tempo je nach Sportart: Pace (min/km) oder Geschwindigkeit (km/h). */
export function fmtTempo(sport: SportId, value: number, units: Units): string {
  if (SPORTS[sport].tempo === "pace") {
    const s = units === "imperial" ? value * MI : value;
    return `${secToClock(s)} /${units === "imperial" ? "mi" : "km"}`;
  }
  const v = units === "imperial" ? value / MI : value;
  return `${nf(0).format(v)} ${units === "imperial" ? "mph" : "km/h"}`;
}

export function durationMin(sport: SportId, km: number, tempo: number): number {
  return SPORTS[sport].tempo === "pace" ? (km * tempo) / 60 : (km / tempo) * 60;
}
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m} Min.`;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

/** Einordnung in Worten – hilft Anfängern mehr als Zahlen. */
export function tempoLabel(sport: SportId, tempo: number): { text: string; level: 0 | 1 | 2 } {
  if (SPORTS[sport].tempo === "pace") {
    if (tempo >= 420) return { text: "Gesprächstempo", level: 0 };
    if (tempo >= 345) return { text: "Moderat", level: 1 };
    return { text: "Zügig", level: 2 };
  }
  if (tempo < 23) return { text: "Gemütlich", level: 0 };
  if (tempo < 28) return { text: "Moderat", level: 1 };
  return { text: "Zügig", level: 2 };
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function dayDiff(iso: string): number {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(new Date()).getTime()) / 86400000);
}
export function fmtDay(iso: string): string {
  const diff = dayDiff(iso);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
export function fmtMonthYear(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(new Date(iso));
}
export function fmtAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return `vor ${Math.floor(s / 86400)} T.`;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
