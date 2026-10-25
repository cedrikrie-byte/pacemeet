import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PaceInput } from "../components/PaceInput";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { Activity, SeriesRule, SportId } from "../types";
import { WEEKDAYS, isoDow, seriesDates, seriesLabel } from "../lib/series";
import { canPost } from "../lib/groups";
import { Button, Field, Segmented, SportIcon, Toggle, TopBar, inputCls, cx } from "../components/ui";
import { MeetingPointPicker, initialMeeting, needsPublicConfirm, type MeetingValue } from "../components/MeetingPointPicker";
import { RoutePlanner, type RouteValue } from "../components/RoutePlanner";
import { myPos } from "../lib/location";
import { SPORTS, PLANNED_SPORTS } from "../data/sports";
import { clockToSec, durationMin, fmtDuration, fmtTempo, secToClock, tempoLabel, uid } from "../lib/format";

const MI = 1.609344;
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function CreateActivity({ editId, groupId: presetGroup, series: editSeries }: { editId?: string; groupId?: string; series?: boolean }) {
  const { state, api, me } = useApp();
  const nav = useNav();
  const units = state.settings.units;
  const editing = editId ? state.activities.find((a) => a.id === editId) : undefined;
  /** Ganze Serie bearbeiten (alle kommenden Termine) */
  const seriesEdit = !!(editSeries && editing?.seriesId);

  const initStart = useMemo(() => {
    if (editing) return new Date(editing.startsAt);
    const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); if (d.getHours() < 7) d.setHours(18); return d;
  }, [editing]);

  const [sport, setSport] = useState<SportId>(editing?.sport ?? (me.sports[0] || "run"));
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(toDate(initStart));
  const [time, setTime] = useState(toTime(initStart));
  const initDist = editing?.distanceKm ?? SPORTS[sport].defaultDistance;
  const [dist, setDist] = useState(String(+(units === "imperial" ? initDist / MI : initDist).toFixed(1)));
  const initPace = editing && editing.sport === "run" ? editing.tempo : me.pace;
  const [pace, setPace] = useState(secToClock(units === "imperial" ? initPace * MI : initPace));
  const initSpeed = editing && editing.sport === "ride" ? editing.tempo : me.speed;
  const [speed, setSpeed] = useState(String(Math.round(units === "imperial" ? initSpeed / MI : initSpeed)));
  const [max, setMax] = useState(editing?.maxParticipants ?? 6);
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [beginner, setBeginner] = useState(editing?.beginnerFriendly ?? true);
  const [breaks, setBreaks] = useState(editing?.breaks ?? false);
  const [route, setRoute] = useState<RouteValue>(editing?.route ?? { mode: "spontaneous", points: [] });
  const [eventId, setEventId] = useState(editing?.eventId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [meet, setMeet] = useState<MeetingValue>(() => editing
    ? { ...initialMeeting(editing.city, editing.meetingPoint, [editing.lat, editing.lng]), publicOk: true }
    : initialMeeting(state.locationCity, "", undefined, myPos(state)));
  const center = meet.pos;

  function onMeeting(v: MeetingValue, moved: boolean) {
    setMeet(v);
    // Treffpunkt verschoben: geplante Route passt nicht mehr zum Start
    if (moved && route.mode === "planned" && route.points.length) setRoute({ ...route, points: [], ascentM: undefined });
  }

  const distKm = (parseFloat(dist.replace(",", ".")) || 0) * (units === "imperial" ? MI : 1);
  const paceSecRaw = clockToSec(pace);
  const tempo = sport === "run" ? (paceSecRaw ? paceSecRaw / (units === "imperial" ? MI : 1) : 0) : (parseFloat(speed.replace(",", ".")) || 0) * (units === "imperial" ? MI : 1);
  const activeEvents = state.events.filter((e) => new Date(e.end).getTime() + 86400000 > Date.now());

  const [saving, setSaving] = useState(false);
  const [repeatOn, setRepeat] = useState(false);
  const repeat = seriesEdit || repeatOn;
  const [days, setDays] = useState<number[] | null>(null);   // null = Wochentag des Datums
  const [every, setEvery] = useState<1 | 2>(1);
  const [endMode, setEndMode] = useState<"none" | "count" | "until">("none");
  const [count, setCount] = useState(8);
  const [until, setUntil] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return toDate(d); });
  const postable = state.groups.filter((g) => canPost(g));
  const [groupId, setGroupId] = useState(editing?.groupId ?? (presetGroup && postable.some((g) => g.id === presetGroup) ? presetGroup : ""));
  const [membersOnly, setMembersOnly] = useState(editing?.visibility === "group");
  // Serie bearbeiten: Rhythmus übernehmen (live ggf. erst nachladen)
  const editRule = seriesEdit ? editing?.seriesRule : undefined;
  useEffect(() => { if (seriesEdit && !editRule && editing?.seriesId) void api.seriesInfo(editing.seriesId); }, [seriesEdit, !!editRule]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ruleLoaded, setRuleLoaded] = useState(false);
  useEffect(() => {
    if (!editRule || ruleLoaded) return;
    setDays([...editRule.weekdays].sort()); setEvery(editRule.intervalWeeks); setTime(editRule.time);
    if (editRule.maxCount) { setEndMode("count"); setCount(editRule.maxCount); } else if (editRule.untilDate) { setEndMode("until"); setUntil(editRule.untilDate); } else setEndMode("none");
    if (editRule.startDate) setDate(editRule.startDate);
    setRuleLoaded(true);
  }, [editRule, ruleLoaded]);
  const dateDow = (() => { const d = new Date(`${date}T12:00`); return isNaN(d.getTime()) ? 1 : isoDow(d); })();
  const weekdays = days ?? [dateDow];
  const rule: SeriesRule = { weekdays, intervalWeeks: every, time, startDate: date, ...(endMode === "count" ? { maxCount: count } : endMode === "until" ? { untilDate: until } : {}) };
  const preview = repeat ? seriesDates(rule, endMode === "none" ? 6 : 60) : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const start = new Date(`${date}T${time}`);
    if (title.trim().length < 3) err.title = "Gib einen Titel mit mindestens 3 Zeichen ein.";
    if (isNaN(start.getTime())) err.when = "Wähle Datum und Uhrzeit.";
    else if (!repeat && !seriesEdit && start.getTime() < Date.now() + 10 * 60000) err.when = "Der Start muss mindestens 10 Minuten in der Zukunft liegen.";
    if (meet.label.trim().length < 3) err.meeting = "Gib einen öffentlichen Treffpunkt an.";
    else if (needsPublicConfirm(meet) && !meet.publicOk) err.meeting = "Das sieht nach einer Wohnadresse aus. Wähle einen öffentlichen Ort oder bestätige unten, dass er öffentlich ist.";
    if (!(distKm > 0 && distKm <= 300)) err.dist = "Gib eine Distanz zwischen 0,1 und 300 an.";
    if (sport === "run" && !(tempo >= 150 && tempo <= 900)) err.tempo = "Tippe die Pace als Ziffern, z. B. 730 für 7:30 (Sekunden bis 59).";
    if (sport === "ride" && !(tempo >= 8 && tempo <= 50)) err.tempo = "Tempo zwischen 8 und 50 km/h.";
    if (editing && !seriesEdit && max < editing.participants.length + 1) err.max = `Es sind schon ${editing.participants.length + 1} Personen dabei.`;
    if (seriesEdit && !ruleLoaded) err.when = "Die Serie wird noch geladen. Versuch es gleich noch einmal.";
    else if (repeat && (!editing || seriesEdit)) {
      if (endMode === "until" && until < (seriesEdit ? toDate(new Date()) : date)) err.when = "Das Ende der Serie liegt vor dem ersten Termin.";
      else if (preview.length === 0) err.when = "Mit diesen Einstellungen entsteht kein Termin. Prüfe Wochentage und Ende.";
    }
    if (route.mode === "planned" && route.points.length < 2) err.route = "Lass dir eine Strecke vorschlagen, zeichne sie selbst oder wähle „Spontan“.";
    setErrors(err);
    if (Object.values(err).some(Boolean)) {
      document.getElementById(`f-${Object.keys(err).find((k) => err[k])}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const base = {
      title: title.trim(), sport, city: meet.city, meetingPoint: meet.label.trim(),
      lat: center[0], lng: center[1], startsAt: start.toISOString(), distanceKm: Math.round(distKm * 10) / 10,
      tempo: sport === "run" ? Math.round(tempo) : Math.round(tempo * 10) / 10, maxParticipants: max,
      description: desc.trim(), beginnerFriendly: beginner, breaks,
      route: route.mode === "planned" ? route : { mode: "spontaneous" as const, points: [] },
      eventId: eventId || undefined,
      groupId: groupId || undefined,
      visibility: groupId && membersOnly ? "group" as const : "public" as const,
    };
    if (seriesEdit && editing?.seriesId) {
      setSaving(true);
      const id = await api.updateSeries(editing.seriesId, base, rule);
      setSaving(false);
      if (id) nav.replace({ name: "activity", id });
    } else if (editing) {
      const changes: string[] = [];
      if (editing.startsAt !== base.startsAt) changes.push("Startzeit");
      if (editing.meetingPoint !== base.meetingPoint) changes.push("Treffpunkt");
      if (editing.tempo !== base.tempo) changes.push("Tempo");
      if (editing.distanceKm !== base.distanceKm) changes.push("Distanz");
      if (JSON.stringify(editing.route) !== JSON.stringify(base.route)) changes.push("Route");
      setSaving(true);
      const ok = await api.update(editing.id, base, changes.join(", "));
      setSaving(false);
      if (ok) nav.back();
    } else {
      const a: Activity = { ...base, id: uid(), hostId: state.meId, participants: [], status: "open", selfConfirmed: [], hostConfirmed: [], messages: [] };
      setSaving(true);
      let id: string | null;
      if (repeat) {
        // Serie: der Server legt die Termine an und verlängert laufende Serien automatisch
        id = await api.createSeries({ ...a, startsAt: preview[0].toISOString() }, rule);
      } else {
        id = await api.create(a);
      }
      setSaving(false);
      if (id) nav.replace({ name: "activity", id });
    }
  }

  const tl = tempo ? tempoLabel(sport, tempo) : null;
  const dur = tempo && distKm ? durationMin(sport, distKm, tempo) : 0;

  return (
    <form onSubmit={submit} noValidate className="screen-in pb-28">
      <TopBar onBack={nav.back} title={seriesEdit ? "Serie bearbeiten" : editing ? (editing.seriesId ? "Termin bearbeiten" : "Aktivität bearbeiten") : "Neue Aktivität"} />
      <div className="flex flex-col gap-7 px-4 pt-4">
        {seriesEdit && <p className="rounded-2xl bg-accent/10 p-3.5 text-[13.5px] leading-relaxed"><b>Gilt für alle kommenden Termine.</b> Angemeldete bleiben dabei und werden informiert. Termine an Tagen, die wegfallen, werden abgesagt.</p>}
        {editing?.seriesId && !seriesEdit && <p className="rounded-2xl bg-raised p-3.5 text-[13.5px] leading-relaxed">Du änderst nur diesen einen Termin der Serie.</p>}
        <Field label="Sportart" hint={`Bald auch: ${PLANNED_SPORTS.join(", ")}`}>
          <Segmented label="Sportart" value={sport} onChange={(v) => { setSport(v); setDist(String(SPORTS[v].defaultDistance)); if (route.points.length) setRoute({ ...route, points: [], ascentM: undefined }); }}
            options={[{ value: "run", label: <><SportIcon sport="run" /> Laufen</> }, { value: "ride", label: <><SportIcon sport="ride" /> Radfahren</> }]} />
        </Field>

        <div id="f-title"><Field label="Titel" htmlFor="title" error={errors.title}>
          <input id="title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={sport === "run" ? "z. B. Feierabendrunde am See" : "z. B. Kaffeerunde Ruhrtal"} maxLength={60} />
        </Field></div>

        <div id="f-when" className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            {!seriesEdit && <Field label={repeat ? "Erster Termin ab" : "Datum"} htmlFor="date"><input id="date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
            <Field label="Uhrzeit" htmlFor="time"><input id="time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} step={300} /></Field>
          </div>
          {!seriesEdit && <div className="flex gap-2">
            {[["Heute", 0], ["Morgen", 1], ["Übermorgen", 2]].map(([l, o]) => {
              const d = new Date(); d.setDate(d.getDate() + (o as number));
              return <button type="button" key={l} onClick={() => setDate(toDate(d))} className={cx("rounded-full border px-3 py-1 text-[12.5px] font-semibold", date === toDate(d) ? "border-ink" : "border-line text-muted")}>{l}</button>;
            })}
          </div>}
          {errors.when && <p className="text-[12.5px] font-medium text-bad">{errors.when}</p>}
        </div>

        <div id="f-meeting"><MeetingPointPicker value={meet} onChange={onMeeting} sport={sport} error={errors.meeting} /></div>

        <div className="grid grid-cols-2 gap-3">
          <div id="f-dist"><Field label={`Distanz (${units === "imperial" ? "mi" : "km"})`} htmlFor="dist" error={errors.dist}>
            <input id="dist" inputMode="decimal" className={cx(inputCls, "tnum")} value={dist} onChange={(e) => setDist(e.target.value)} />
          </Field></div>
          <div id="f-tempo">
            {sport === "run" ? (
              <Field label={`Pace (min/${units === "imperial" ? "mi" : "km"})`} htmlFor="pace" error={errors.tempo}>
                <PaceInput id="pace" value={pace} onChange={setPace} placeholder="7:30" />
              </Field>
            ) : (
              <Field label={`Ø Tempo (${units === "imperial" ? "mph" : "km/h"})`} htmlFor="speed" error={errors.tempo}>
                <input id="speed" inputMode="decimal" className={cx(inputCls, "tnum")} value={speed} onChange={(e) => setSpeed(e.target.value)} />
              </Field>
            )}
          </div>
        </div>
        {tl && dur > 0 && (
          <p className="-mt-4 text-[13px] text-muted">Einordnung: <b className="text-ink">{tl.text}</b> · Dauer ca. <b className="text-ink tnum">{fmtDuration(dur)}</b> · {fmtTempo(sport, tempo, units)}</p>
        )}

        <div id="f-route">
          <RoutePlanner value={route} onChange={setRoute} sport={sport} start={center} startLabel={meet.placed ? meet.label : ""} targetKm={distKm}
            onDistance={(km) => setDist(String(+(units === "imperial" ? km / MI : km).toFixed(1)))} units={units} error={errors.route} city={meet.city} />
        </div>

        <div id="f-max"><Field label="Maximale Teilnehmerzahl (inkl. dir)" error={errors.max}>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Weniger" onClick={() => setMax((m) => Math.max(2, m - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line"><Minus size={18} /></button>
            <span className="w-10 text-center font-cond text-[26px] font-bold">{max}</span>
            <button type="button" aria-label="Mehr" onClick={() => setMax((m) => Math.min(30, m + 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line"><Plus size={18} /></button>
          </div>
        </Field></div>

        <Field label="Beschreibung" htmlFor="desc" hint="Was erwartet die Gruppe? Untergrund, Pausen, Ausrüstung.">
          <textarea id="desc" rows={4} className={cx(inputCls, "h-auto py-3 leading-relaxed")} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        </Field>

        <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          <Toggle id="beginner" checked={beginner} onChange={setBeginner} label="Anfänger willkommen" desc="Niemand wird zurückgelassen." />
          <Toggle id="breaks" checked={breaks} onChange={setBreaks} label={sport === "run" ? "Geh- oder Ruhepausen" : "Pausen eingeplant"} desc="Hilft beim Einstieg oder Wiedereinstieg." />
          {!editing && (
            <Toggle id="repeat" checked={repeat} onChange={setRepeat} label="Als Serie wiederholen"
              desc={repeat ? seriesLabel(rule) : "Für einen festen Lauftreff, z. B. jeden Montag um 9 Uhr."} />
          )}
          {(!editing || seriesEdit) && repeat && (
            <div className="flex flex-col gap-4 py-3">
              <div>
                <p className="mb-2 text-[14px] font-medium">An welchen Tagen?</p>
                <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Wochentage">
                  {WEEKDAYS.map((w, i) => {
                    const d = i + 1, on = weekdays.includes(d);
                    return <button type="button" key={w} aria-pressed={on} onClick={() => { const next = on ? weekdays.filter((x) => x !== d) : [...weekdays, d]; if (next.length) setDays(next.sort()); }}
                      className={cx("h-10 rounded-xl border text-[13px] font-bold", on ? "border-ink bg-ink text-bg" : "border-line text-muted")}>{w}</button>;
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[14px] font-medium">Rhythmus</p>
                <Segmented label="Rhythmus" value={String(every) as "1" | "2"} onChange={(v) => setEvery(v === "2" ? 2 : 1)} options={[{ value: "1", label: "Jede Woche" }, { value: "2", label: "Alle 2 Wochen" }]} />
              </div>
              <div>
                <p className="mb-2 text-[14px] font-medium">Ende</p>
                <Segmented label="Ende der Serie" value={endMode} onChange={setEndMode} options={[{ value: "none", label: "Ohne Ende" }, { value: "count", label: "Anzahl" }, { value: "until", label: "Bis Datum" }]} />
                {endMode === "count" && (
                  <div className="mt-2 flex gap-1.5">
                    {[4, 8, 12, 26].map((w) => (
                      <button type="button" key={w} onClick={() => setCount(w)} aria-pressed={count === w}
                        className={cx("h-9 min-w-[48px] rounded-full border px-3 text-[13px] font-semibold tnum", count === w ? "border-ink bg-ink text-bg" : "border-line")}>{w}</button>
                    ))}
                    <span className="self-center text-[12.5px] text-muted">Termine</span>
                  </div>
                )}
                {endMode === "until" && <input id="until" type="date" aria-label="Letzter Tag der Serie" className={cx(inputCls, "mt-2")} value={until} min={date} onChange={(e) => setUntil(e.target.value)} />}
              </div>
              <div className="rounded-xl bg-raised px-3 py-2.5 text-[13px]">
                <p className="font-semibold">{seriesLabel(rule)}</p>
                {preview.length > 0 ? (
                  <p className="mt-0.5 text-muted">Nächste Termine: {preview.slice(0, 4).map((d) => d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })).join(" · ")}{preview.length > 4 ? " …" : ""}</p>
                ) : <p className="mt-0.5 text-bad">Kein Termin in der Zukunft.</p>}
                <p className="mt-1 text-[12px] text-muted">{endMode === "none" ? "Wir legen immer die nächsten 6 Wochen an und verlängern automatisch, bis du die Serie beendest." : `${endMode === "count" ? count : preview.length} Termine insgesamt.`}</p>
              </div>
            </div>
          )}
        </div>

        {postable.length > 0 && (
          <div className="flex flex-col gap-2">
            <Field label="Für eine Gruppe?" htmlFor="group" hint="Mitglieder der Gruppe werden über den Termin informiert.">
              <select id="group" className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!!editing}>
                <option value="">Keine Gruppe</option>
                {postable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            {groupId && (
              <div className="rounded-2xl border border-line bg-surface px-4">
                <Toggle id="members-only" checked={membersOnly} onChange={setMembersOnly} label="Nur für Mitglieder sichtbar" desc={membersOnly ? "Andere sehen den Termin nicht." : "Alle in der Nähe können den Termin sehen und mitmachen."} />
              </div>
            )}
          </div>
        )}

        {activeEvents.length > 0 && (
          <Field label="Teil eines Community-Events?" htmlFor="event" hint="Aktivitäten im Event-Zeitraum zählen für die Event-Medaille.">
            <select id="event" className={inputCls} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Kein Event</option>
              {activeEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <Button type="submit" block size="lg" disabled={saving}>{saving ? "Wird gespeichert …" : seriesEdit ? "Serie speichern" : editing ? "Änderungen speichern" : repeat ? "Serie veröffentlichen" : "Aktivität veröffentlichen"}</Button>
      </div>
    </form>
  );
}
