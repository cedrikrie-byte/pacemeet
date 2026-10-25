import { useMemo, useState } from "react";
import { Bell, ChevronDown, List, Map as MapIcon, MapPin, Search, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { MapView } from "../components/MapView";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { Activity, SportId } from "../types";
import { ActivityCard } from "../components/ActivityCard";
import { Button, Chip, Empty, IconButton, Segmented, Sheet, SportIcon, Toggle, cx } from "../components/ui";
import { APP } from "../config/app";
import { CityPicker } from "../components/CityPicker";
import { myPos } from "../lib/location";
import { dayDiff, fmtDateLong, fmtDistance, fmtTempo, secToClock } from "../lib/format";
import { cityName, distanceFromMe, needsMyConfirmation, spotsLeft } from "../lib/activity";
import { hasEnded } from "../lib/xp";

type When = "all" | "today" | "tomorrow" | "weekend" | "week";
type Daytime = "morning" | "midday" | "evening";
interface Filters {
  q: string; sport: "all" | SportId; when: When; daytime: Daytime[];
  distMin: number; distMax: number; paceMin: number; paceMax: number; speedMin: number; speedMax: number;
  freeOnly: boolean; beginner: boolean; routeOnly: boolean; myTempo: boolean; sort: "time" | "near";
}
const DEFAULT: Filters = { q: "", sport: "all", when: "all", daytime: [], distMin: 0, distMax: 120, paceMin: 240, paceMax: 600, speedMin: 12, speedMax: 40, freeOnly: false, beginner: false, routeOnly: false, myTempo: false, sort: "time" };
let remembered: Filters = DEFAULT;
let rememberedMode: "list" | "map" = "list";

function activeCount(f: Filters) {
  let n = 0;
  if (f.daytime.length) n++;
  if (f.distMin > 0 || f.distMax < 120) n++;
  if (f.paceMin > 240 || f.paceMax < 600) n++;
  if (f.speedMin > 12 || f.speedMax < 40) n++;
  if (f.freeOnly) n++; if (f.beginner) n++; if (f.routeOnly) n++; if (f.myTempo) n++;
  return n;
}

export function Discover() {
  const { state, api, me } = useApp();
  const nav = useNav();
  const [f, setF] = useState<Filters>(remembered);
  const [sheet, setSheet] = useState(false);
  const [citySheet, setCitySheet] = useState(false);
  const [mode, setMode] = useState<"list" | "map">(rememberedMode);
  const [sel, setSel] = useState<string | null>(null);
  const setModeR = (m: "list" | "map") => { rememberedMode = m; setMode(m); setSel(null); };
  const upd = (p: Partial<Filters>) => setF((x) => { const n = { ...x, ...p }; remembered = n; return n; });
  const units = state.settings.units;

  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return state.activities.filter((a) => {
      if (a.status !== "open" || hasEnded(a)) return false;
      if (state.blocked.includes(a.hostId)) return false;
      if (distanceFromMe(state, a) > state.radiusKm) return false;
      if (f.sport !== "all" && a.sport !== f.sport) return false;
      if (q && !`${a.title} ${a.meetingPoint} ${cityName(a.city)} ${state.users[a.hostId]?.name}`.toLowerCase().includes(q)) return false;
      const dd = dayDiff(a.startsAt), wd = new Date(a.startsAt).getDay();
      if (f.when === "today" && dd !== 0) return false;
      if (f.when === "tomorrow" && dd !== 1) return false;
      if (f.when === "weekend" && !((wd === 6 || wd === 0) && dd <= 7)) return false;
      if (f.when === "week" && dd > 7) return false;
      if (f.daytime.length) {
        const h = new Date(a.startsAt).getHours();
        const dt: Daytime = h < 11 ? "morning" : h < 16 ? "midday" : "evening";
        if (!f.daytime.includes(dt)) return false;
      }
      if (a.distanceKm < f.distMin || a.distanceKm > f.distMax) return false;
      if (a.sport === "run" && (a.tempo < f.paceMin || a.tempo > f.paceMax)) return false;
      if (a.sport === "ride" && (a.tempo < f.speedMin || a.tempo > f.speedMax)) return false;
      if (f.myTempo) {
        if (a.sport === "run" && Math.abs(a.tempo - me.pace) > 45) return false;
        if (a.sport === "ride" && Math.abs(a.tempo - me.speed) > 3) return false;
      }
      if (f.freeOnly && spotsLeft(a) === 0) return false;
      if (f.beginner && !a.beginnerFriendly) return false;
      if (f.routeOnly && a.route?.mode !== "planned") return false;
      return true;
    }).sort((a, b) => f.sort === "near" ? distanceFromMe(state, a) - distanceFromMe(state, b) : a.startsAt.localeCompare(b.startsAt));
  }, [state, f, me]);

  const groups = useMemo(() => {
    if (f.sort === "near") return [{ key: "near", label: "Nach Entfernung", items: list }];
    const m = new Map<string, Activity[]>();
    list.forEach((a) => { const k = a.startsAt.slice(0, 10); m.set(k, [...(m.get(k) || []), a]); });
    return [...m.entries()].map(([k, items]) => {
      const dd = dayDiff(items[0].startsAt);
      return { key: k, label: dd === 0 ? "Heute" : dd === 1 ? "Morgen" : fmtDateLong(items[0].startsAt), items };
    });
  }, [list, f.sort]);

  const pending = state.activities.filter((a) => needsMyConfirmation(state, a));
  const unread = state.notifications.filter((n) => !n.read).length;
  const n = activeCount(f);

  return (
    <div className="screen-in">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/85 px-4 pb-3 pt-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-[20px] font-black tracking-tight">{APP.name}</span>
          </div>
          <div className="flex items-center">
            <button onClick={() => setCitySheet(true)} className="flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-semibold hover:bg-raised">
              <MapPin size={15} className="text-accent" /> {cityName(state.locationCity) || "Stadt wählen"} <ChevronDown size={14} className="text-muted" />
            </button>
            <IconButton label="Benachrichtigungen" badge={unread} onClick={() => nav.push({ name: "notifications" })}><Bell size={20} /></IconButton>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-accent">
            <Search size={17} className="shrink-0 text-muted" />
            <input id="search" value={f.q} onChange={(e) => upd({ q: e.target.value })} placeholder="Ort, Titel oder Gastgeber" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70" />
          </label>
          <button onClick={() => setSheet(true)} aria-label="Filter" className={cx("relative grid h-11 w-11 shrink-0 place-items-center rounded-full border transition", n ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
            <SlidersHorizontal size={18} />
            {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">{n}</span>}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={f.sport === "all"} onClick={() => upd({ sport: "all" })}>Alle</Chip>
          <Chip active={f.sport === "run"} onClick={() => upd({ sport: "run" })} icon={<SportIcon sport="run" size={14} />}>Laufen</Chip>
          <Chip active={f.sport === "ride"} onClick={() => upd({ sport: "ride" })} icon={<SportIcon sport="ride" size={14} />}>Radfahren</Chip>
          <span className="mx-1 w-px shrink-0 bg-line" />
          {([["all", "Jederzeit"], ["today", "Heute"], ["tomorrow", "Morgen"], ["weekend", "Wochenende"], ["week", "7 Tage"]] as [When, string][]).map(([v, l]) => (
            <Chip key={v} active={f.when === v} onClick={() => upd({ when: v })}>{l}</Chip>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 pb-8 pt-4">
        {state.myStatus?.suspended && (
          <div className="rounded-2xl border border-bad/30 bg-bad/10 p-3.5 text-[13.5px] text-bad">
            <b>Dein Konto ist gesperrt.</b> Du kannst Aktivitäten ansehen, aber nichts anlegen, beitreten oder schreiben.{state.myStatus.reason ? ` Grund: ${state.myStatus.reason}` : ""} Wenn du glaubst, dass das ein Fehler ist, schreib uns über das Impressum.
          </div>
        )}
        {pending.length > 0 && (
          <button onClick={() => nav.push({ name: "activity", id: pending[0].id })} className="flex items-center gap-3 rounded-2xl border border-good/30 bg-good/10 p-3.5 text-left">
            <CheckCircle2 size={22} className="shrink-0 text-good" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold">Hat „{pending[0].title}“ stattgefunden?</span>
              <span className="block text-[12.5px] text-muted">Bestätige kurz, wer dabei war. Das macht Teilnahmen nachvollziehbar.</span>
            </span>
          </button>
        )}

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-muted">Hallo {me.name.split(" ")[0]}</p>
            <h1 className="font-display text-[26px] font-black leading-[1.05]">Wer ist heute dabei?</h1>
          </div>
          <div className="w-[112px] shrink-0"><Segmented label="Ansicht" value={mode} onChange={setModeR} options={[{ value: "list", label: <><List size={15} /><span className="sr-only">Liste</span></> }, { value: "map", label: <><MapIcon size={15} /><span className="sr-only">Karte</span></> }]} /></div>
        </div>

        <div className="-mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted tnum">{list.length} {list.length === 1 ? "Aktivität" : "Aktivitäten"} im Umkreis von {fmtDistance(state.radiusKm, units, 0)}</p>
          {mode === "list" && <button onClick={() => upd({ sort: f.sort === "time" ? "near" : "time" })} className="shrink-0 text-[13px] font-semibold text-accent">{f.sort === "time" ? "Nach Zeit" : "Nach Nähe"} ↕</button>}
        </div>

        {mode === "map" && list.length > 0 ? (
          <div className="flex flex-col gap-3">
            <MapView points={[]} center={myPos(state)}
              markers={list.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, sport: a.sport, label: a.title }))}
              selectedId={sel} onMarker={setSel} spanKm={20} aspect={360 / 380} fitKey={list.map((a) => a.id).join(",")} />
            {sel && list.find((a) => a.id === sel) ? <ActivityCard a={list.find((a) => a.id === sel)!} /> : (
              <p className="rounded-2xl bg-raised p-3.5 text-center text-[13.5px] text-muted">Tippe auf einen Punkt, um die Aktivität zu sehen. <span className="text-run">●</span> Laufen <span className="text-ride">●</span> Rad</p>
            )}
          </div>
        ) : list.length === 0 ? (
          <Empty icon={<Search size={22} />} title="Nichts gefunden" text="Erweitere den Umkreis oder setze die Filter zurück. Oder starte selbst eine Aktivität."
            action={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { upd(DEFAULT); }}>Filter zurücksetzen</Button><Button size="sm" onClick={() => nav.push({ name: "create" })}>Aktivität erstellen</Button></div>} />
        ) : groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            <h2 className="label">{g.label}</h2>
            {g.items.map((a) => <ActivityCard key={a.id} a={a} />)}
          </section>
        ))}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filter"
        footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => upd({ ...DEFAULT, q: f.q, sport: f.sport, when: f.when, sort: f.sort })}>Zurücksetzen</Button><Button block onClick={() => setSheet(false)}>{list.length} Ergebnisse anzeigen</Button></div>}>
        <div className="flex flex-col gap-6 pb-2">
          <div>
            <p className="mb-2 flex justify-between text-[14px] font-semibold"><span>Umkreis um {cityName(state.locationCity)}</span><span className="tnum">{fmtDistance(state.radiusKm, units, 0)}</span></p>
            <input id="radius" type="range" min={2} max={60} value={state.radiusKm} onChange={(e) => api.setRadius(+e.target.value)} className="w-full" />
          </div>
          <div>
            <p className="mb-2 text-[14px] font-semibold">Tageszeit</p>
            <div className="flex flex-wrap gap-2">
              {([["morning", "Morgens (bis 11 Uhr)"], ["midday", "Mittags"], ["evening", "Abends (ab 16 Uhr)"]] as [Daytime, string][]).map(([v, l]) => (
                <Chip key={v} active={f.daytime.includes(v)} onClick={() => upd({ daytime: f.daytime.includes(v) ? f.daytime.filter((x) => x !== v) : [...f.daytime, v] })}>{l}</Chip>
              ))}
            </div>
          </div>
          <Range id="dist" label="Distanz" min={0} max={120} step={1} lo={f.distMin} hi={f.distMax} fmt={(v) => fmtDistance(v, units, 0)} onChange={(lo, hi) => upd({ distMin: lo, distMax: hi })} />
          {f.sport !== "ride" && <Range id="pace" label="Lauf-Pace" min={240} max={600} step={15} lo={f.paceMin} hi={f.paceMax} fmt={(v) => units === "metric" ? `${secToClock(v)} /km` : fmtTempo("run", v, units)} onChange={(lo, hi) => upd({ paceMin: lo, paceMax: hi })} />}
          {f.sport !== "run" && <Range id="speed" label="Rad-Tempo" min={12} max={40} step={1} lo={f.speedMin} hi={f.speedMax} fmt={(v) => fmtTempo("ride", v, units)} onChange={(lo, hi) => upd({ speedMin: lo, speedMax: hi })} />}
          <div className="divide-y divide-line">
            <Toggle id="f-mytempo" checked={f.myTempo} onChange={(v) => upd({ myTempo: v })} label="Passt zu meinem Tempo" desc={`Laufen ±45 s um ${fmtTempo("run", me.pace, units)}, Rad ±3 km/h um ${fmtTempo("ride", me.speed, units)}`} />
            <Toggle id="f-free" checked={f.freeOnly} onChange={(v) => upd({ freeOnly: v })} label="Nur mit freien Plätzen" />
            <Toggle id="f-beg" checked={f.beginner} onChange={(v) => upd({ beginner: v })} label="Anfänger willkommen" />
            <Toggle id="f-route" checked={f.routeOnly} onChange={(v) => upd({ routeOnly: v })} label="Nur mit geplanter Route" />
          </div>
        </div>
      </Sheet>

      <Sheet open={citySheet} onClose={() => setCitySheet(false)} title="Standort">
        <p className="mb-3 text-[13px] text-muted">Wir nutzen nur die ungefähre Stadt, nie deinen genauen Standort. Start zunächst in Deutschland.</p>
        <div className="pb-2">
          <CityPicker id="loc-search" value={{ id: state.locationCity, name: cityName(state.locationCity), pos: myPos(state) }}
            onPick={(c) => { api.setLocation(c.id, c.pos); setCitySheet(false); }} />
        </div>
      </Sheet>
    </div>
  );
}

function Range({ id, label, min, max, step, lo, hi, fmt, onChange }: { id: string; label: string; min: number; max: number; step: number; lo: number; hi: number; fmt: (v: number) => string; onChange: (lo: number, hi: number) => void }) {
  return (
    <div>
      <p className="mb-2 flex justify-between text-[14px] font-semibold"><span>{label}</span><span className="tnum text-muted">{fmt(lo)} – {fmt(hi)}</span></p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-muted">von<input id={id + "-lo"} type="range" min={min} max={max} step={step} value={lo} onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)} className="w-full" /></label>
        <label className="text-[12px] text-muted">bis<input id={id + "-hi"} type="range" min={min} max={max} step={step} value={hi} onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))} className="w-full" /></label>
      </div>
    </div>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="rgb(var(--accent))" />
      <circle cx="12" cy="16" r="6" fill="none" stroke="rgb(var(--accent-ink))" strokeWidth="2.6" />
      <circle cx="20" cy="16" r="6" fill="none" stroke="rgb(var(--accent-ink))" strokeWidth="2.6" opacity=".75" />
    </svg>
  );
}
