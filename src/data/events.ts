import type { AppEvent } from "../types";

function day(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(0, 0, 0, 0); return d.toISOString(); }

/** Community-Events der App. Medaillen gibt es fürs Mitmachen, nie für Zeiten. */
export function buildEvents(): AppEvent[] {
  return [
    { id: "ruhr-herbst", name: "Ruhr Herbstwoche 2026", start: day(-3), end: day(6), required: 3, medal: "Herbstwoche", hue: 22, description: "Mach in dieser Woche bei 3 gemeinsamen Aktivitäten mit, egal welches Tempo." },
    { id: "lth-jubi", name: "Lauftreff-Abend Hattingen", start: day(-12), end: day(-8), required: 1, medal: "Altstadt-Abend", hue: 200, description: "Gemeinsamer Lauftreff mit dem Lauftreff Hattingen." },
  ];
}
