import type { AppState } from "../types";
import { buildDemoState } from "../data/demo";

const KEY = "pacemeet-demo-state";
const VERSION = 6;

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.version === VERSION) return s;
    }
  } catch { /* Speicher nicht verfügbar – Demo startet frisch */ }
  return buildDemoState();
}
export function saveState(s: AppState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorieren */ }
}
export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignorieren */ }
}
