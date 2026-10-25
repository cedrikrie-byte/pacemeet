import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import { CITIES } from "../config/app";
import { useMapLive } from "./MapView";
import { searchCities, type CityResult } from "../lib/mapServices";
import { inputCls, cx } from "./ui";

export interface CityValue { id: string; name: string; pos: [number, number]; }

/** Stadt wählen: Vorschläge aus dem Startgebiet plus Suche in ganz Deutschland. */
export function CityPicker({ value, onPick, id = "city-search", autoFocus }: { value?: CityValue | null; onPick: (c: CityValue) => void; id?: string; autoFocus?: boolean }) {
  const live = useMapLive();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<CityResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (!live || term.length < 2) { setRes([]); setErr(""); return; }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setBusy(true); setErr("");
      try { setRes(await searchCities(term, ctrl.signal)); }
      catch { if (!ctrl.signal.aborted) setErr("Suche gerade nicht erreichbar."); }
      finally { if (!ctrl.signal.aborted) setBusy(false); }
    }, 300);
    return () => { ctrl.abort(); window.clearTimeout(t); };
  }, [q, live]);

  const presets = CITIES.filter((c) => !q.trim() || c.name.toLowerCase().startsWith(q.trim().toLowerCase()));
  const isSel = (name: string) => value?.name.toLowerCase() === name.toLowerCase();

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input id={id} className={cx(inputCls, "!pl-9")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off"
          placeholder={live === false ? "Stadt (Suche ohne Internet nicht verfügbar)" : "Stadt suchen, z. B. Münster"} aria-label="Stadt suchen" />
        {busy ? <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted" /> : <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />}
      </div>
      <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface" role="listbox" aria-label="Städte">
        {res.map((c) => (
          <Row key={`${c.name}-${c.region}`} name={c.name} sub={c.region} on={isSel(c.name)} onClick={() => { onPick({ id: c.name, name: c.name, pos: c.pos }); setQ(""); }} />
        ))}
        {presets.filter((p) => !res.some((r) => r.name === p.name)).map((c) => (
          <Row key={c.id} name={c.name} sub="Startgebiet" on={isSel(c.name)} onClick={() => { onPick({ id: c.id, name: c.name, pos: [c.lat, c.lng] }); setQ(""); }} />
        ))}
        {!res.length && !presets.length && !busy && q.trim().length >= 2 && <li className="px-4 py-3 text-[13px] text-muted">Keine Stadt gefunden. Prüfe die Schreibweise.</li>}
      </ul>
      {err && <p className="text-[12.5px] text-muted">{err}</p>}
    </div>
  );
}

function Row({ name, sub, on, onClick }: { name: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" role="option" aria-selected={on} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raised">
        <MapPin size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold">{name}</span>{sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}</span>
        {on && <Check size={16} className="shrink-0 text-good" />}
      </button>
    </li>
  );
}
