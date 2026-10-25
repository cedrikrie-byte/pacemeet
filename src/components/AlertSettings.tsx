import { useApp } from "../store/AppStore";
import { Segmented, Toggle, cx } from "./ui";
import { alertSports, alertTempoRange, matchesAlert } from "../lib/alerts";
import { fmtTempo } from "../lib/format";
import { cityName } from "../lib/activity";
import { knownCityPos } from "../lib/location";
import { SPORTS } from "../data/sports";
import type { AlertPrefs, SportId } from "../types";

/** Einstellungen für Hinweise bei neuen passenden Aktivitäten in der Nähe. */
export function AlertSettings() {
  const { state, api } = useApp();
  const me = state.users[state.meId];
  if (!me) return null;
  const a = state.settings.alerts;
  const set = (p: Partial<AlertPrefs>) => api.setSettings({ alerts: { ...a, ...p } });
  const sports = alertSports(a, me);
  const home = me.cityPos ?? knownCityPos(me.city);
  const units = state.settings.units;

  const upcoming = state.activities.filter((x) => x.status === "open" && x.hostId !== state.meId && new Date(x.startsAt).getTime() > Date.now());
  const fitting = home ? upcoming.filter((x) => matchesAlert(a, me, home, x)).length : 0;

  const toggleSport = (sp: SportId) => {
    const next = sports.includes(sp) ? sports.filter((x) => x !== sp) : [...sports, sp];
    if (next.length) set({ sports: next });
  };
  const [rLo, rHi] = alertTempoRange(a, me, "run");
  const [bLo, bHi] = alertTempoRange(a, me, "ride");

  return (
    <div className="border-b border-line">
      <Toggle id="n-nearby" checked={a.on} onChange={(v) => set({ on: v })} label="Neue passende Aktivitäten in der Nähe"
        desc="Nur, was zu deinem Tempo, deiner Strecke und deinem Umkreis passt. Höchstens 6 Hinweise am Tag." />
      {a.on && (
        <div className="flex flex-col gap-4 pb-4">
          <div>
            <p className="mb-1 flex justify-between text-[14px] font-semibold"><span>Umkreis um {cityName(me.city)}</span><span className="tnum text-muted">{a.radiusKm} km</span></p>
            <input id="al-radius" aria-label="Umkreis in Kilometern" type="range" min={2} max={50} value={a.radiusKm} onChange={(e) => set({ radiusKm: +e.target.value })} className="w-full" />
            {!home && <p className="text-[12.5px] text-warn">Lege im Profil deine Stadt fest, damit wir Entfernungen berechnen können.</p>}
          </div>

          <div>
            <p className="mb-2 text-[14px] font-semibold">Sportarten</p>
            <div className="flex gap-2">
              {(["run", "ride"] as SportId[]).map((sp) => (
                <button key={sp} type="button" aria-pressed={sports.includes(sp)} onClick={() => toggleSport(sp)}
                  className={cx("rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold", sports.includes(sp) ? "border-ink bg-ink text-bg" : "border-line text-muted")}>{SPORTS[sp].label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-semibold">Tempo</p>
            <Segmented label="Tempo für Hinweise" value={a.auto ? "auto" : "custom"} onChange={(v) => set(v === "auto" ? { auto: true } : { auto: false, runPaceMin: rLo, runPaceMax: rHi, rideSpeedMin: bLo, rideSpeedMax: bHi })}
              options={[{ value: "auto", label: "Passend zu mir" }, { value: "custom", label: "Selbst festlegen" }]} />
            {a.auto ? (
              <p className="text-[12.5px] text-muted">
                {sports.includes("run") && <>Läufe von {fmtTempo("run", rLo, units)} bis {fmtTempo("run", rHi, units)} (dein Tempo {fmtTempo("run", me.pace, units)}). </>}
                {sports.includes("ride") && <>Radtouren von {fmtTempo("ride", bLo, units)} bis {fmtTempo("ride", bHi, units)} (dein Schnitt {fmtTempo("ride", me.speed, units)}). </>}
                Dein Tempo änderst du im Profil.
              </p>
            ) : (
              <>
                {sports.includes("run") && <Dual id="al-pace" label="Lauf-Tempo" min={180} max={600} step={5} lo={a.runPaceMin ?? rLo} hi={a.runPaceMax ?? rHi} fmt={(v) => fmtTempo("run", v, units)} onChange={(lo, hi) => set({ runPaceMin: lo, runPaceMax: hi })} note="links schneller, rechts langsamer" />}
                {sports.includes("ride") && <Dual id="al-speed" label="Rad-Schnitt" min={10} max={40} step={1} lo={a.rideSpeedMin ?? bLo} hi={a.rideSpeedMax ?? bHi} fmt={(v) => fmtTempo("ride", v, units)} onChange={(lo, hi) => set({ rideSpeedMin: lo, rideSpeedMax: hi })} />}
              </>
            )}
          </div>

          {sports.includes("run") && (
            <div>
              <p className="mb-1 flex justify-between text-[14px] font-semibold"><span>Läufe bis</span><span className="tnum text-muted">{a.runMaxKm} km</span></p>
              <input id="al-runkm" aria-label="Maximale Laufdistanz" type="range" min={3} max={42} value={a.runMaxKm} onChange={(e) => set({ runMaxKm: +e.target.value })} className="w-full" />
            </div>
          )}
          {sports.includes("ride") && (
            <div>
              <p className="mb-1 flex justify-between text-[14px] font-semibold"><span>Radtouren bis</span><span className="tnum text-muted">{a.rideMaxKm} km</span></p>
              <input id="al-ridekm" aria-label="Maximale Tourlänge" type="range" min={10} max={200} step={5} value={a.rideMaxKm} onChange={(e) => set({ rideMaxKm: +e.target.value })} className="w-full" />
            </div>
          )}

          {home && <p className="rounded-xl bg-raised px-3 py-2.5 text-[13px]"><span className="font-semibold tnum">{fitting} von {upcoming.length}</span> kommenden Aktivitäten, die du gerade siehst, würden passen.</p>}
        </div>
      )}
    </div>
  );
}

function Dual({ id, label, min, max, step, lo, hi, fmt, onChange, note }: { id: string; label: string; min: number; max: number; step: number; lo: number; hi: number; fmt: (v: number) => string; onChange: (lo: number, hi: number) => void; note?: string }) {
  return (
    <div>
      <p className="mb-1 flex justify-between text-[13.5px] font-semibold"><span>{label}</span><span className="tnum text-muted">{fmt(lo)} – {fmt(hi)}</span></p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-muted">von<input id={id + "-lo"} type="range" min={min} max={max} step={step} value={lo} onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)} className="w-full" /></label>
        <label className="text-[12px] text-muted">bis<input id={id + "-hi"} type="range" min={min} max={max} step={step} value={hi} onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))} className="w-full" /></label>
      </div>
      {note && <p className="text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}
