import type { SeriesRule } from "../types";

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 1 = Montag … 7 = Sonntag */
const utcDay = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
export const isoDow = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/**
 * Termine einer Serie (Ortszeit des Geräts). Gleiche Regeln wie auf dem Server (series_generate):
 * Wochentage, wöchentlich oder alle 2 Wochen ab der Startwoche, Ende nach Datum oder Anzahl.
 */
export function seriesDates(rule: SeriesRule, horizonWeeks = 6, from = new Date()): Date[] {
  const [h, m] = rule.time.split(":").map(Number);
  const start = new Date(`${rule.startDate}T00:00`);
  const anchor = new Date(start); anchor.setDate(anchor.getDate() - (isoDow(start) - 1));
  const last = new Date(from); last.setDate(last.getDate() + 7 * horizonWeeks);
  const until = rule.untilDate ? new Date(`${rule.untilDate}T23:59`) : null;
  const out: Date[] = [];
  for (const d = new Date(start); d <= last && (!until || d <= until); d.setDate(d.getDate() + 1)) {
    if (rule.maxCount && out.length >= rule.maxCount) break;
    const week = Math.floor((utcDay(d) - utcDay(anchor)) / 7);
    if (!rule.weekdays.includes(isoDow(d)) || week % rule.intervalWeeks !== 0) continue;
    const t = new Date(d); t.setHours(h, m, 0, 0);
    if (t.getTime() > from.getTime() + 10 * 60000) out.push(t);
  }
  return out;
}

/** „Jeden Montag, 9:00 Uhr“, „Di und Do alle 2 Wochen, 18:30 Uhr“ */
export function seriesLabel(rule: SeriesRule): string {
  const days = [...rule.weekdays].sort();
  const dayText = days.length === 1 ? LONG[days[0] - 1] : days.length === 7 ? "Täglich" : days.map((d) => WEEKDAYS[d - 1]).join(", ").replace(/, ([^,]+)$/, " und $1");
  const every = rule.intervalWeeks === 2 ? (days.length === 1 ? `Jeden 2. ${dayText}` : `${dayText} alle 2 Wochen`) : days.length === 1 ? `Jeden ${dayText}` : days.length === 7 ? dayText : dayText;
  return `${every}, ${rule.time.replace(/^0/, "")} Uhr`;
}

export function seriesEndLabel(rule: SeriesRule): string {
  if (rule.maxCount) return `${rule.maxCount} Termine`;
  if (rule.untilDate) return `bis ${new Date(rule.untilDate + "T12:00").toLocaleDateString("de-DE", { day: "numeric", month: "long" })}`;
  return "ohne Ende";
}
