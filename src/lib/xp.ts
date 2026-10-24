import type { Activity, AppEvent, AppState } from "../types";
import { durationMin } from "./format";

export const XP_RULES = {
  attend: 100,
  host: 150,
  newGroup: 75,
  dailyCap: 2,          // max. punktende Aktivitäten pro Tag
  hostMinConfirmed: 2,  // so viele Teilnehmende müssen selbst bestätigen
};

export function endsAt(a: Activity): number {
  return new Date(a.startsAt).getTime() + durationMin(a.sport, a.distanceKm, a.tempo) * 60000;
}
export const hasEnded = (a: Activity) => endsAt(a) < Date.now();
export const hasStarted = (a: Activity) => new Date(a.startsAt).getTime() < Date.now();

export interface XpEntry { key: string; activityId: string; title: string; type: "attend" | "host" | "newGroup"; xp: number; at: string; note?: string; }

/**
 * Punkte werden nie gespeichert, sondern aus bestätigten Aktivitäten abgeleitet.
 * Dadurch sind doppelte Punkte ausgeschlossen (ein Schlüssel je Aktivität und Typ).
 * Schutz gegen Manipulation: Teilnahme zählt nur mit Selbst- UND Gastgeber-Bestätigung,
 * Organisieren nur, wenn mindestens zwei andere ihre Teilnahme selbst bestätigt haben.
 */
export function computeLedger(state: AppState, userId: string): XpEntry[] {
  const done = state.activities
    .filter((a) => a.status === "open" && hasEnded(a))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const out: XpEntry[] = [];
  const metHosts = new Set<string>();
  const perDay: Record<string, number> = {};
  for (const a of done) {
    const day = a.startsAt.slice(0, 10);
    let candidate: XpEntry[] = [];
    if (a.participants.includes(userId) && a.selfConfirmed.includes(userId) && a.hostConfirmed.includes(userId)) {
      candidate.push({ key: `${a.id}:attend`, activityId: a.id, title: a.title, type: "attend", xp: XP_RULES.attend, at: a.startsAt });
      if (!metHosts.has(a.hostId)) {
        candidate.push({ key: `${a.id}:new`, activityId: a.id, title: a.title, type: "newGroup", xp: XP_RULES.newGroup, at: a.startsAt });
      }
      metHosts.add(a.hostId);
    }
    if (a.hostId === userId) {
      const verified = a.hostConfirmed.filter((id) => a.selfConfirmed.includes(id));
      if (verified.length >= XP_RULES.hostMinConfirmed) {
        candidate.push({ key: `${a.id}:host`, activityId: a.id, title: a.title, type: "host", xp: XP_RULES.host, at: a.startsAt });
      }
    }
    if (candidate.length) {
      perDay[day] = (perDay[day] || 0) + 1;
      if (perDay[day] > XP_RULES.dailyCap) candidate = candidate.map((c) => ({ ...c, xp: 0, note: "Tageslimit erreicht" }));
      out.push(...candidate);
    }
  }
  return out.reverse();
}

export const sumXp = (l: XpEntry[]) => l.reduce((s, e) => s + e.xp, 0);
export function monthXp(l: XpEntry[]) {
  const now = new Date();
  return sumXp(l.filter((e) => { const d = new Date(e.at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }));
}
export const levelOf = (xp: number) => ({ level: Math.floor(xp / 500) + 1, into: xp % 500, need: 500 });

/** Aktivitäten, die ein Nutzer nachweislich mitgemacht hat (für Abzeichen/Medaillen). */
export function confirmedActivities(state: AppState, userId: string): Activity[] {
  return state.activities.filter((a) => a.status === "open" && hasEnded(a) &&
    ((a.participants.includes(userId) && a.selfConfirmed.includes(userId) && a.hostConfirmed.includes(userId)) ||
     (a.hostId === userId && a.hostConfirmed.length > 0)));
}

export interface Badge { id: string; name: string; desc: string; earned: boolean; progress?: string; }
export function computeBadges(state: AppState, userId: string, ledger: XpEntry[]): Badge[] {
  const conf = confirmedActivities(state, userId);
  const attend = ledger.filter((e) => e.type === "attend").length;
  const hosted = ledger.filter((e) => e.type === "host").length;
  const groups = ledger.filter((e) => e.type === "newGroup").length;
  const early = conf.some((a) => new Date(a.startsAt).getHours() < 8);
  const sports = new Set(conf.map((a) => a.sport));
  return [
    { id: "first", name: "Erste Runde", desc: "Erste bestätigte gemeinsame Aktivität", earned: attend >= 1, progress: `${Math.min(attend, 1)}/1` },
    { id: "five", name: "Fünferpack", desc: "5 bestätigte Teilnahmen", earned: attend >= 5, progress: `${Math.min(attend, 5)}/5` },
    { id: "host", name: "Gastgeber", desc: "Eine Aktivität organisiert, die stattgefunden hat", earned: hosted >= 1, progress: `${Math.min(hosted, 1)}/1` },
    { id: "bridge", name: "Brückenbauer", desc: "Mit 3 verschiedenen Gruppen unterwegs gewesen", earned: groups >= 3, progress: `${Math.min(groups, 3)}/3` },
    { id: "early", name: "Frühstart", desc: "Bei einer Aktivität vor 8 Uhr dabei", earned: early },
    { id: "both", name: "Zwei Räder, zwei Beine", desc: "Laufen und Radfahren in der Gruppe", earned: sports.size >= 2, progress: `${sports.size}/2` },
  ];
}

export interface EventProgress { event: AppEvent; done: number; booked: number; earned: boolean; active: boolean; }
export function eventProgress(state: AppState, userId: string): EventProgress[] {
  const conf = confirmedActivities(state, userId);
  return state.events.map((ev) => {
    const done = conf.filter((a) => a.eventId === ev.id).length;
    const booked = state.activities.filter((a) => a.eventId === ev.id && a.status === "open" && !hasEnded(a) && (a.participants.includes(userId) || a.hostId === userId)).length;
    const now = Date.now();
    return { event: ev, done, booked, earned: done >= ev.required, active: now >= new Date(ev.start).getTime() && now <= new Date(ev.end).getTime() + 86400000 };
  });
}
