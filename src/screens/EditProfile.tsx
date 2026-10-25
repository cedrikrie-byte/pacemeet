import { useRef, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { PaceInput } from "../components/PaceInput";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { Best, SportId } from "../types";
import { Avatar, Button, Field, SportIcon, Toggle, TopBar, inputCls, cx } from "../components/ui";
import { CityPicker, type CityValue } from "../components/CityPicker";
import { cityName } from "../lib/activity";
import { knownCityPos } from "../lib/location";
import { SPORT_LIST } from "../data/sports";
import { clockToSec, secToClock, uid } from "../lib/format";

const PRESETS: Record<SportId, string[]> = {
  run: ["5 km", "10 km", "Halbmarathon", "Marathon", "Längster Lauf"],
  ride: ["Längste Tour", "Meiste Höhenmeter", "Ø Tempo 100 km"],
};

/** Skaliert ein Foto auf 320 px, damit es klein bleibt. */
function resizeImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = 320, c = document.createElement("canvas"); c.width = s; c.height = s;
        const ctx = c.getContext("2d")!; const m = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = rej; img.src = String(r.result);
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

export function EditProfile() {
  const { me, api } = useApp();
  const nav = useNav();
  const [name, setName] = useState(me.name);
  const [city, setCity] = useState<CityValue>({ id: me.city, name: cityName(me.city), pos: me.cityPos ?? knownCityPos(me.city) ?? [51.4556, 7.0116] });
  const [cityOpen, setCityOpen] = useState(false);
  const [sports, setSports] = useState<SportId[]>(me.sports);
  const [pace, setPace] = useState(secToClock(me.pace));
  const [speed, setSpeed] = useState(String(me.speed));
  const [bio, setBio] = useState(me.bio);
  const [age, setAge] = useState(me.age ? String(me.age) : "");
  const [showAge, setShowAge] = useState(!!me.showAge);
  const [photo, setPhoto] = useState(me.photo);
  const [bests, setBests] = useState<Best[]>(me.bests);
  const [err, setErr] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (name.trim().length < 2) er.name = "Bitte gib einen Namen an.";
    const p = clockToSec(pace); if (sports.includes("run") && (!p || p < 150 || p > 900)) er.pace = "Tippe z. B. 630 für 6:30 (Sekunden bis 59).";
    const a = age ? parseInt(age) : undefined; if (age && (!a || a < 16 || a > 99)) er.age = "Alter zwischen 16 und 99, oder leer lassen.";
    if (!sports.length) er.sports = "Wähle mindestens eine Sportart.";
    setErr(er); if (Object.keys(er).length) return;
    api.updateProfile({ name: name.trim(), city: city.id, cityPos: city.pos, sports, pace: p ?? me.pace, speed: parseFloat(speed) || me.speed, bio: bio.trim(), age: a, showAge: a ? showAge : false, photo, bests: bests.filter((b) => b.value.trim()) });
    nav.back();
  }

  return (
    <form onSubmit={save} noValidate className="screen-in pb-28">
      <TopBar onBack={nav.back} title="Profil bearbeiten" />
      <div className="flex flex-col gap-6 px-4 pt-5">
        <div className="flex items-center gap-4">
          <Avatar user={{ ...me, name: name || me.name, photo }} size={84} />
          <div className="flex flex-col items-start gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Camera size={15} /> {photo ? "Foto ändern" : "Foto hinzufügen"}</Button>
            {photo && <button type="button" onClick={() => setPhoto(undefined)} className="text-[13px] font-semibold text-muted">Foto entfernen</button>}
            <input ref={fileRef} id="photo" type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await resizeImage(f)); e.target.value = ""; }} />
          </div>
        </div>
        <Field label="Anzeigename" htmlFor="name" error={err.name} hint="Wir empfehlen Vorname und Initial, z. B. „Alex R.“"><input id="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} /></Field>
        <Field label="Region" htmlFor="pcity" hint="Nur die Stadt wird angezeigt, nie deine Adresse.">
          {cityOpen
            ? <CityPicker id="pcity" value={city} onPick={(c) => { setCity(c); setCityOpen(false); }} autoFocus />
            : <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3"><span className="font-semibold">{city.name}</span><button type="button" className="text-[13px] font-semibold text-accent" onClick={() => setCityOpen(true)}>Ändern</button></div>}
        </Field>
        <Field label="Kurzbeschreibung" htmlFor="bio" hint={`${bio.length}/200`}><textarea id="bio" rows={3} maxLength={200} className={cx(inputCls, "h-auto py-3")} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Wann und wie trainierst du gern?" /></Field>

        <Field label="Sportarten" error={err.sports}>
          <div className="flex gap-2">
            {SPORT_LIST.map((s) => (
              <button type="button" key={s.id} aria-pressed={sports.includes(s.id)} onClick={() => setSports((x) => x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id])}
                className={cx("flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold", sports.includes(s.id) ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
                <SportIcon sport={s.id} /> {s.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {sports.includes("run") && <Field label="Übliche Pace (min/km)" htmlFor="ppace" error={err.pace}><PaceInput id="ppace" value={pace} onChange={setPace} placeholder="6:30" /></Field>}
          {sports.includes("ride") && <Field label="Übliches Rad-Tempo (km/h)" htmlFor="pspeed"><input id="pspeed" inputMode="decimal" className={cx(inputCls, "tnum")} value={speed} onChange={(e) => setSpeed(e.target.value)} /></Field>}
        </div>

        <div className="flex flex-col gap-2">
          <Field label="Alter (optional)" htmlFor="age" error={err.age}><input id="age" inputMode="numeric" className={cx(inputCls, "!w-28 tnum")} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="–" /></Field>
          {age && <Toggle id="showage" checked={showAge} onChange={setShowAge} label="Alter im Profil anzeigen" desc="Standardmäßig nur für dich sichtbar." />}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold">Bestzeiten (optional)</span><span className="text-[12px] text-muted">Keine Liga-Punkte</span></div>
          {bests.map((b, i) => (
            <div key={b.id} className="flex items-center gap-2">
              <select aria-label="Sportart" className={cx(inputCls, "!w-[30%] !px-2")} value={b.sport} onChange={(e) => setBests((x) => x.map((y, j) => j === i ? { ...y, sport: e.target.value as SportId, label: PRESETS[e.target.value as SportId][0] } : y))}>
                {SPORT_LIST.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select aria-label="Disziplin" className={cx(inputCls, "min-w-0 flex-1 !px-2")} value={b.label} onChange={(e) => setBests((x) => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))}>
                {[...new Set([...PRESETS[b.sport], b.label])].map((l) => <option key={l}>{l}</option>)}
              </select>
              <input aria-label="Wert" className={cx(inputCls, "!w-[26%] !px-2 tnum")} value={b.value} onChange={(e) => setBests((x) => x.map((y, j) => j === i ? { ...y, value: e.target.value } : y))} placeholder={b.sport === "run" ? "49:30" : "120 km"} />
              <button type="button" aria-label="Entfernen" onClick={() => setBests((x) => x.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-raised"><Trash2 size={16} /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setBests((x) => [...x, { id: uid(), sport: sports[0] || "run", label: PRESETS[sports[0] || "run"][0], value: "" }])}><Plus size={15} /> Bestzeit hinzufügen</Button>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <Button type="submit" block size="lg">Speichern</Button>
      </div>
    </form>
  );
}
