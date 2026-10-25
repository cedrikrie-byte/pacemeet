import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Move, Search, TriangleAlert } from "lucide-react";
import { MapView, useMapLive } from "./MapView";
import { fitView } from "./RouteMap";
import { Field, inputCls, cx } from "./ui";
import { CITIES } from "../config/app";
import { PLACES } from "../data/places";
import { geocode, reverseGeocode, type GeoResult } from "../lib/mapServices";
import { cityName, looksLikeHomeAddress } from "../lib/activity";
import { knownCityPos } from "../lib/location";
import { CityPicker } from "./CityPicker";
import type { SportId } from "../types";

type P = [number, number];

export interface MeetingValue {
  city: string;
  label: string;
  pos: P;
  /** Wurde ein Ort gewählt oder der Pin gesetzt? */
  placed: boolean;
  /** Treffer war eine Hausadresse */
  addressHit: boolean;
  publicOk: boolean;
  /** Mittelpunkt der Stadt (für Suche und Kartenausschnitt) */
  cityCenter?: P;
}

export function initialMeeting(city: string, label = "", pos?: P, cityCenter?: P): MeetingValue {
  const center: P = knownCityPos(city) ?? cityCenter ?? [CITIES[0].lat, CITIES[0].lng];
  const place = PLACES.find((p) => p.name === label);
  return {
    city, label, cityCenter: center,
    pos: pos ?? (place ? [place.lat, place.lng] : center),
    placed: !!pos || !!place, addressHit: false, publicOk: false,
  };
}

export const needsPublicConfirm = (m: MeetingValue) => (m.label.length > 4 && looksLikeHomeAddress(m.label)) || m.addressHit;

/** Treffpunkt per Suche, Vorschlag oder Pin auf der Karte. */
export function MeetingPointPicker({ value, onChange, sport, error }: { value: MeetingValue; onChange: (v: MeetingValue, moved: boolean) => void; sport: SportId; error?: string }) {
  const live = useMapLive();
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [typing, setTyping] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fitKey, setFitKey] = useState("init");
  const cityCenter: P = value.cityCenter ?? knownCityPos(value.city) ?? [CITIES[0].lat, CITIES[0].lng];
  const [cityOpen, setCityOpen] = useState(false);
  const reqId = useRef(0);
  const set = (p: Partial<MeetingValue>, moved = false) => onChange({ ...value, ...p }, moved);

  // Ortssuche während des Tippens
  useEffect(() => {
    if (!live || !typing) return;
    const q = value.label.trim();
    if (q.length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true); setSearchErr("");
      try { setResults(await geocode(q, value.placed ? value.pos : cityCenter, ctrl.signal)); }
      catch { if (!ctrl.signal.aborted) setSearchErr("Suche gerade nicht erreichbar. Setze den Treffpunkt auf der Karte."); }
      finally { if (!ctrl.signal.aborted) setSearching(false); }
    }, 350);
    return () => { ctrl.abort(); window.clearTimeout(t); };
  }, [value.label, live, typing, cityCenter, value.placed, value.pos]);

  function pickResult(r: GeoResult) {
    const label = r.isAddress ? r.name : r.detail ? `${r.name}, ${r.detail.split(", ").pop()}` : r.name;
    setTyping(false); setResults([]);
    set({ label, pos: [r.lat, r.lng], placed: true, addressHit: r.isAddress, publicOk: false }, true);
    setFitKey(`geo-${r.id}`);
  }
  function pickPlace(name: string) {
    const p = PLACES.find((x) => x.name === name)!;
    setTyping(false); setResults([]);
    set({ label: name, pos: [p.lat, p.lng], placed: true, addressHit: false, publicOk: false }, true);
    setFitKey(`place-${name}`);
  }
  async function onPinMove(p: P) {
    const id = ++reqId.current;
    setTyping(false); setResults([]);
    // Position sofort übernehmen, Name danach nachladen
    const keepLabel = value.label && !PLACES.some((x) => x.name === value.label) ? value.label : "";
    onChange({ ...value, pos: p, placed: true, label: keepLabel || value.label, addressHit: false, publicOk: false }, true);
    if (!live) return;
    setLocating(true);
    const r = await reverseGeocode(p);
    if (id !== reqId.current) return;
    setLocating(false);
    if (r && !keepLabel) onChange({ ...value, pos: p, placed: true, label: r.label, addressHit: false, publicOk: false }, true);
  }

  const warn = needsPublicConfirm(value);
  const cityPlaces = PLACES.filter((p) => p.city === value.city);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Öffentlicher Treffpunkt" htmlFor="meeting" error={error} hint="Zum Beispiel ein Parkeingang, Platz oder Bahnhof. Bitte keine Wohnadressen.">
        <div className="flex gap-2">
          <button type="button" id="city" onClick={() => setCityOpen((o) => !o)} aria-expanded={cityOpen}
            className={cx(inputCls, "!w-[38%] shrink-0 truncate text-left font-semibold")}>{cityName(value.city) || "Stadt"}</button>
          <div className="relative min-w-0 flex-1">
            <input id="meeting" className={cx(inputCls, live && "!pl-9")} value={value.label} autoComplete="off"
              onChange={(e) => { setTyping(true); set({ label: e.target.value, addressHit: false, publicOk: false }); }}
              placeholder={live ? "Ort oder Adresse suchen" : "Treffpunkt"} />
            {live && (searching ? <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted" /> : <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />)}
          </div>
        </div>
      </Field>

      {cityOpen && (
        <CityPicker id="meet-city" value={{ id: value.city, name: cityName(value.city), pos: cityCenter }} autoFocus
          onPick={(c) => { setCityOpen(false); set({ city: c.id, cityCenter: c.pos, label: "", pos: c.pos, placed: false, addressHit: false }, true); setFitKey(`city-${c.id}`); }} />
      )}
      {results.length > 0 && (
        <ul role="listbox" aria-label="Suchergebnisse" className="-mt-1 overflow-hidden rounded-xl border border-line bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => pickResult(r)} className="flex w-full items-start gap-2.5 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-raised">
                <MapPin size={16} className={cx("mt-0.5 shrink-0", r.isAddress ? "text-warn" : "text-muted")} />
                <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{r.name}</span><span className="block truncate text-[12px] text-muted">{r.isAddress ? "Adresse · " : ""}{r.detail}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchErr && <p className="text-[12.5px] text-muted">{searchErr}</p>}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {cityPlaces.map((p) => (
          <button type="button" key={p.name} onClick={() => pickPlace(p.name)} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", value.label === p.name ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>{p.name}</button>
        ))}
      </div>

      <div className="relative">
        <MapView points={[]} center={value.pos} pin onPinMove={onPinMove} accent={sport} spanKm={2.5} fitKey={fitKey} aspect={360 / 200}
          sketchView={fitView([], value.pos, 3)} hint={value.placed ? undefined : "Tippe auf den genauen Treffpunkt"} />
        {locating && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold shadow"><Loader2 size={13} className="animate-spin" /> Ort wird bestimmt</span>}
      </div>
      <p className="-mt-1 flex items-center gap-1.5 text-[12.5px] text-muted"><Move size={14} /> Pin ziehen oder auf die Karte tippen, um den genauen Treffpunkt festzulegen.</p>

      {warn && (
        <div className="rounded-xl bg-warn/12 p-3 text-[13px] text-warn">
          <p className="flex gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" /> Das sieht nach einer Wohnadresse aus. Zu deiner Sicherheit empfehlen wir einen öffentlichen Ort.</p>
          <label className="mt-2 flex items-center gap-2 font-semibold"><input id="public-ok" type="checkbox" checked={value.publicOk} onChange={(e) => set({ publicOk: e.target.checked })} /> Das ist ein öffentlicher Ort</label>
        </div>
      )}
    </div>
  );
}
