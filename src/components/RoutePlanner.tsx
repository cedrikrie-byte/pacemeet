import { useEffect, useRef, useState } from "react";
import { ArrowRight, Flag, Loader2, Mountain, Plus, RefreshCw, Repeat, Search, Shuffle, Trash2, Undo2, Upload, Wand2, X } from "lucide-react";
import { MapView, useMapLive } from "./MapView";
import { fitView, type MapPoi, type View } from "./RouteMap";
import { Button, Segmented, inputCls, cx } from "./ui";
import { PLACES } from "../data/places";
import { geocode, routeBetween, type GeoResult } from "../lib/mapServices";
import { planAtoB, planLoop, type PlannedRoute } from "../lib/routing";
import { parseGpx, routeLengthKm } from "../lib/geo";
import type { BikeType, Route, SportId, Units } from "../types";

type P = [number, number];
type Tab = "loop" | "a2b" | "draw";
interface Spot { label: string; pos: P; }

const MI = 1.609344;
const fmtKm = (km: number, units: Units) => `${(units === "imperial" ? km / MI : km).toFixed(1).replace(".", ",")} ${units === "imperial" ? "mi" : "km"}`;

export interface RouteValue extends Route {}

export function RoutePlanner({ value, onChange, sport, start, startLabel, targetKm, onDistance, units, error, city }: {
  value: RouteValue;
  onChange: (r: RouteValue) => void;
  sport: SportId;
  start: P;
  startLabel: string;
  targetKm: number;
  onDistance: (km: number) => void;
  units: Units;
  error?: string;
  city: string;
}) {
  const live = useMapLive();
  const online = live === true;
  const planned = value.mode === "planned";
  const [tab, setTab] = useState<Tab>(value.source === "a2b" ? "a2b" : value.source === "drawn" || value.source === "gpx" ? "draw" : "loop");
  const [bike, setBike] = useState<BikeType>(value.bikeType ?? "tour");
  const [variant, setVariant] = useState(0);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<PlannedRoute | null>(null);
  const [fitKey, setFitKey] = useState("init");
  // Start → Ziel
  const [dest, setDest] = useState<Spot | null>(null);
  const [via, setVia] = useState<Spot | null>(null);
  const [tapSets, setTapSets] = useState<"dest" | "via">("dest");
  const [ret, setRet] = useState<"none" | "same" | "different">("none");
  // Zeichnen
  const [follow, setFollow] = useState(true);
  const [history, setHistory] = useState<P[][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>(() => fitView(value.points, start, sport === "run" ? 4 : 14));

  const points = value.points;
  const set = (p: Partial<RouteValue>) => onChange({ ...value, ...p });

  // Treffpunkt verschoben: Ausschnitt neu einpassen
  useEffect(() => { setView(fitView(points, start, sport === "run" ? 4 : 14)); setFitKey(`start-${start.join(",")}`); }, [start[0], start[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  function apply(r: PlannedRoute, source: Route["source"], extra: Partial<RouteValue> = {}) {
    setResult(r);
    setHistory((h) => [...h, points]);
    set({ mode: "planned", points: r.points, source, ascentM: r.ascentM, bikeType: sport === "ride" ? bike : undefined, ...extra });
    onDistance(Math.round(r.distanceKm * 10) / 10);
    setView(fitView(r.points, start, 4)); setFitKey(`${source}-${Date.now()}`);
    setNote(r.provider === "Luftlinie" ? (online ? "Wegsuche gerade nicht erreichbar. Strecke als Luftlinie skizziert." : "Ohne Kartendienst wird die Strecke als Luftlinie skizziert.") : "");
  }

  async function suggestLoop(v = variant) {
    if (!(targetKm > 0.5)) { setNote("Gib zuerst eine Wunschlänge ein."); return; }
    setBusy("Strecke wird berechnet");
    try { apply(await planLoop(start, targetKm, sport, bike, v, online), "loop", { destination: undefined }); }
    finally { setBusy(""); }
  }
  async function calcA2B() {
    if (!dest) { setNote("Wähle zuerst ein Ziel."); return; }
    setBusy("Strecke wird berechnet");
    try { apply(await planAtoB(start, dest.pos, via?.pos ?? null, ret, sport, bike, online), "a2b", { destination: dest.label }); }
    finally { setBusy(""); }
  }

  // Zeichnen: Teilstück anfügen
  async function extendTo(target: P) {
    if (busy) return;
    if (tab === "a2b") { // Kartentipp setzt Ziel oder Zwischenziel
      const s = { label: tapSets === "dest" ? "Ziel" : "Zwischenziel", pos: target };
      if (tapSets === "dest") setDest(s); else { setVia(s); setTapSets("dest"); }
      return;
    }
    if (tab !== "draw") return;
    const from = points.length ? points[points.length - 1] : start;
    let seg: P[] = [from, target];
    if (online && follow) {
      setBusy("Weg wird gesucht");
      try { seg = await routeBetween(from, target, sport); setNote(""); }
      catch { setNote("Wegsuche nicht erreichbar. Teilstück wurde als gerade Linie gesetzt."); }
      finally { setBusy(""); }
    }
    setHistory((h) => [...h, points]);
    setResult(null);
    set({ mode: "planned", points: points.length ? [...points, ...seg.slice(1)] : seg, source: "drawn", ascentM: undefined, destination: undefined });
  }
  function undo() {
    if (!history.length) { set({ points: [] }); return; }
    set({ points: history[history.length - 1] });
    setHistory(history.slice(0, -1));
  }
  function onGpx(file: File) {
    const r = new FileReader();
    r.onload = () => {
      const pts = parseGpx(String(r.result));
      if (pts.length < 2) { setNote("In der Datei wurden keine Routenpunkte gefunden."); return; }
      setTab("draw");
      apply({ points: pts, distanceKm: routeLengthKm(pts), provider: "BRouter" }, "gpx", { destination: undefined });
      setNote("");
    };
    r.readAsText(file);
  }

  const km = routeLengthKm(points);
  const pois: MapPoi[] = tab === "a2b" ? [via && { lat: via.pos[0], lng: via.pos[1], label: "Zwischenziel" }, dest && { lat: dest.pos[0], lng: dest.pos[1], label: "Ziel" }].filter(Boolean) as MapPoi[] : [];
  const hint = !planned ? undefined
    : tab === "draw" ? (points.length ? undefined : "Tippe, um Wegpunkte zu setzen")
    : tab === "a2b" ? (tapSets === "via" ? "Tippe, um das Zwischenziel zu setzen" : dest ? undefined : "Tippe, um das Ziel zu setzen")
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Route</span>
        <Segmented label="Route" value={value.mode} onChange={(m) => set({ mode: m })} options={[{ value: "spontaneous", label: <><Shuffle size={15} /> Spontan</> }, { value: "planned", label: <><Wand2 size={15} /> Route planen</> }]} />
        <p className="text-[12.5px] text-muted">{planned ? "Wir schlagen eine Strecke vor, die für " + (sport === "run" ? "Laufende geeignet ist (Wege, Parks, wenig Verkehr)." : "Radfahrende geeignet ist.") : "Ihr entscheidet die Strecke gemeinsam vor Ort."}</p>
      </div>

      {planned && (
        <>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Art der Planung">
            {([["loop", "Rundkurs", <Repeat size={14} key="i" />], ["a2b", "Start → Ziel", <Flag size={14} key="i" />], ["draw", "Selbst zeichnen", <Plus size={14} key="i" />]] as const).map(([v, l, icon]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => { setTab(v); setNote(""); }}
                className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition", tab === v ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>{icon}{l}</button>
            ))}
          </div>

          {sport === "ride" && tab !== "draw" && (
            <Segmented label="Radtyp" value={bike} onChange={setBike} options={[{ value: "road", label: "Rennrad, wenig Verkehr" }, { value: "tour", label: "Tour & Gravel" }]} />
          )}

          {tab === "loop" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <p className="text-[13.5px]">Start und Ziel am Treffpunkt <b>{startLabel || "(noch nicht gewählt)"}</b>. Wunschlänge: <b className="tnum">{fmtKm(targetKm, units)}</b> <span className="text-muted">(Feld „Distanz“)</span></p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => suggestLoop()} disabled={!!busy}><Wand2 size={15} /> Strecke vorschlagen</Button>
                {value.source === "loop" && points.length > 1 && <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => { const v = variant + 1; setVariant(v); suggestLoop(v); }}><RefreshCw size={14} /> Andere Variante</Button>}
              </div>
            </div>
          )}

          {tab === "a2b" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2 text-[13.5px]"><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] font-bold text-bg">A</span><span className="min-w-0 truncate"><span className="text-muted">Start: </span><b>{startLabel || "Treffpunkt"}</b></span></div>
              {via && <SpotRow letter="↓" label="Zwischenziel" spot={via} onClear={() => setVia(null)} />}
              <SpotSearch id="dest" label="Ziel" letter="B" value={dest} onPick={setDest} onClear={() => setDest(null)} online={online} near={start} city={city} />
              {!via && (
                <button type="button" onClick={() => setTapSets("via")} className={cx("self-start text-[13px] font-semibold", tapSets === "via" ? "text-ink" : "text-accent")}>
                  {tapSets === "via" ? "Tippe jetzt auf die Karte für das Zwischenziel" : "+ Zwischenziel auf der Karte setzen"}
                </button>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted">Rückweg zum Treffpunkt</span>
                <Segmented label="Rückweg" value={ret} onChange={setRet} options={[{ value: "none", label: "Keiner" }, { value: "same", label: "Gleicher Weg" }, { value: "different", label: "Anderer Weg" }]} />
              </div>
              <Button type="button" size="sm" className="self-start" onClick={calcA2B} disabled={!!busy || !dest}><ArrowRight size={15} /> Strecke berechnen</Button>
            </div>
          )}

          {tab === "draw" && online && (
            <label htmlFor="follow" className="flex items-center justify-between gap-3 rounded-xl bg-raised px-3.5 py-2.5 text-[13.5px]">
              <span><b>Wegen folgen</b><span className="block text-[12px] text-muted">{sport === "run" ? "Fußwege" : "Radwege und Straßen"} zwischen deinen Punkten</span></span>
              <input id="follow" type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
            </label>
          )}

          <div className="relative">
            <MapView points={points} center={start} centerLabel="Start" editable={tab !== "loop"} onAdd={extendTo} sketchView={view} accent={sport}
              spanKm={sport === "run" ? 4 : 14} fitKey={fitKey} aspect={360 / 260} pois={pois} hint={hint} />
            {busy && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold shadow"><Loader2 size={13} className="animate-spin" /> {busy}</span>}
          </div>

          {tab === "draw" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={undo} disabled={(!points.length && !history.length) || !!busy}><Undo2 size={14} /> Zurück</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => extendTo(start)} disabled={points.length < 3 || !!busy}><RefreshCw size={14} /> Rundkurs schließen</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setHistory((h) => [...h, points]); set({ points: [] }); }} disabled={!points.length || !!busy}><Trash2 size={14} /> Leeren</Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> GPX-Datei laden</Button>
            <input ref={fileRef} id="gpx" type="file" accept=".gpx,application/gpx+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onGpx(f); e.target.value = ""; }} />
          </div>

          {note && <p className="text-[12.5px] text-warn">{note}</p>}
          {points.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-raised px-3.5 py-2.5 text-[13.5px]">
              <span className="flex flex-wrap items-center gap-x-3">
                <span>Strecke <b className="tnum">{fmtKm(result?.distanceKm ?? km, units)}</b></span>
                {value.ascentM !== undefined && <span className="inline-flex items-center gap-1"><Mountain size={14} className="text-muted" /><b className="tnum">{value.ascentM} Hm</b></span>}
                {result && result.provider !== "Luftlinie" && <span className="text-[12px] text-muted">{result.provider === "BRouter" ? (sport === "run" ? "über Wege und Pfade" : bike === "road" ? "über verkehrsarme Straßen" : "über Radwege") : "entlang von Wegen"}</span>}
              </span>
              {value.source === "drawn" && <button type="button" className="font-semibold text-accent" onClick={() => onDistance(Math.round(km * 10) / 10)}>Als Distanz übernehmen</button>}
              {(value.source === "loop" || value.source === "a2b" || value.source === "gpx") && <span className="text-[12px] text-muted">als Distanz übernommen</span>}
            </div>
          )}
          {error && <p className="text-[12.5px] font-medium text-bad">{error}</p>}
        </>
      )}
    </div>
  );
}

function SpotRow({ letter, label, spot, onClear }: { letter: string; label: string; spot: Spot; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[13.5px]">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">{letter}</span>
      <span className="min-w-0 flex-1 truncate"><span className="text-muted">{label}: </span><b>{spot.label}</b></span>
      <button type="button" aria-label={`${label} entfernen`} onClick={onClear} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-raised"><X size={15} /></button>
    </div>
  );
}

/** Ziel per Suche (mit Kartendienst) oder Vorschlag. */
function SpotSearch({ id, label, letter, value, onPick, onClear, online, near, city }: { id: string; label: string; letter: string; value: Spot | null; onPick: (s: Spot) => void; onClear: () => void; online: boolean; near: P; city: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!online || q.trim().length < 3) { setRes([]); return; }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try { setRes(await geocode(q, near, ctrl.signal)); } catch { setRes([]); } finally { if (!ctrl.signal.aborted) setLoading(false); }
    }, 350);
    return () => { ctrl.abort(); window.clearTimeout(t); };
  }, [q, online, near]);

  if (value) return <SpotRow letter={letter} label={label} spot={value} onClear={onClear} />;
  const suggestions = PLACES.filter((p) => Math.abs(p.lat - near[0]) + Math.abs(p.lng - near[1]) > 0.003).sort((a, b) => (a.city === city ? 0 : 1) - (b.city === city ? 0 : 1)).slice(0, 8);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input id={id} aria-label={label} className={cx(inputCls, "!pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={online ? "Ziel suchen oder auf Karte tippen" : "Ziel unten wählen oder auf Karte tippen"} disabled={!online} autoComplete="off" />
        {loading ? <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted" /> : <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />}
      </div>
      {res.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line">
          {res.map((r) => (
            <li key={r.id}><button type="button" onClick={() => { onPick({ label: r.name, pos: [r.lat, r.lng] }); setQ(""); setRes([]); }} className="w-full border-b border-line px-3.5 py-2 text-left last:border-0 hover:bg-raised"><span className="block text-[13.5px] font-semibold">{r.name}</span><span className="block text-[12px] text-muted">{r.detail}</span></button></li>
          ))}
        </ul>
      )}
      <div className="no-scrollbar -mx-3.5 flex gap-2 overflow-x-auto px-3.5">
        {suggestions.map((p) => <button type="button" key={p.name} onClick={() => onPick({ label: p.name.split(",")[0], pos: [p.lat, p.lng] })} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-semibold">{p.name.split(",")[0]}</button>)}
      </div>
    </div>
  );
}
