import type { Sport, SportId } from "../types";

/** Sport-Registry: neue Sportarten (z. B. Wandern, Schwimmen) werden hier ergänzt. */
export const SPORTS: Record<SportId, Sport> = {
  run: { id: "run", label: "Laufen", tempo: "pace", defaultTempo: 390, defaultDistance: 8 },
  ride: { id: "ride", label: "Radfahren", tempo: "speed", defaultTempo: 24, defaultDistance: 45 },
};
export const SPORT_LIST = Object.values(SPORTS);
export const PLANNED_SPORTS = ["Wandern", "Schwimmen", "Inline", "Gravel"];
