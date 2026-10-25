import { useEffect, useRef } from "react";
import { inputCls, cx } from "./ui";

/** Ziffern → „m:ss“ (von rechts aufgefüllt): 8 → 0:08, 80 → 0:80, 800 → 8:00, 1230 → 12:30 */
export function digitsToClock(d: string): string {
  if (!d) return "";
  const s = d.padStart(3, "0");
  return `${Number(s.slice(0, -2))}:${s.slice(-2)}`;
}
const toDigits = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);

/**
 * Pace-Eingabe mit festem Doppelpunkt: Ziffern nacheinander tippen, der Doppelpunkt
 * steht immer vor den letzten zwei Ziffern. Löschen entfernt die letzte Ziffer.
 * Wert und onChange arbeiten mit „m:ss“, damit clockToSec weiter passt.
 */
export function PaceInput({ id, value, onChange, placeholder = "0:00", className }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = digitsToClock(toDigits(value));
  // Cursor immer ans Ende, damit das Weitertippen von rechts natürlich wirkt
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement === el) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch { /* manche Typen erlauben das nicht */ } }
  }, [shown]);
  return (
    <input
      ref={ref} id={id} inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done"
      className={cx(inputCls, "tnum", className)} value={shown} placeholder={placeholder}
      onChange={(e) => {
        const prev = toDigits(value);
        let next = toDigits(e.target.value);
        // Löschen des Doppelpunkts: letzte Ziffer entfernen statt nichts zu tun
        if (next === prev && e.target.value.length < shown.length) next = prev.slice(0, -1);
        onChange(digitsToClock(next));
      }}
      onFocus={(e) => { const n = e.target.value.length; window.setTimeout(() => { try { e.target.setSelectionRange(n, n); } catch { /* egal */ } }, 0); }}
    />
  );
}
