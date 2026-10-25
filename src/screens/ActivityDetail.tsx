import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronRight, Coffee, Copy, ExternalLink, Flag, Lock, MapPin, MessageCircle, Pencil, Repeat, Route as RouteIcon, Share2, ShieldCheck, Sprout, TriangleAlert, Users } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Avatar, Button, Empty, IconButton, Sheet, SportTag, TopBar, cx } from "../components/ui";
import { MapView } from "../components/MapView";
import { durationMin, fmtDateLong, fmtDistance, fmtDuration, fmtTempo, fmtTime, tempoLabel } from "../lib/format";
import { cityName, isHost, isJoined, needsMyConfirmation, spotsLeft, totalPeople } from "../lib/activity";
import { hasEnded, hasStarted } from "../lib/xp";
import { routeLengthKm } from "../lib/geo";
import { seriesLabel } from "../lib/series";
import { kindLabel } from "../lib/groups";
import { GroupBadge } from "../components/GroupBadge";

export function ActivityDetail({ id }: { id: string }) {
  const { state, api } = useApp();
  const nav = useNav();
  const a = state.activities.find((x) => x.id === id);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSeries, setConfirmSeries] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editChoice, setEditChoice] = useState(false);
  const [present, setPresent] = useState<string[] | null>(null);
  const needRule = !!a?.seriesId && !a.seriesRule;
  useEffect(() => { if (needRule && a?.seriesId) void api.seriesInfo(a.seriesId); }, [needRule, a?.seriesId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return <div><TopBar onBack={nav.back} title="Aktivität" /><div className="p-4"><Empty icon={<CalendarDays />} title="Nicht gefunden" text="Diese Aktivität gibt es nicht mehr." /></div></div>;

  const units = state.settings.units;
  const host = state.users[a.hostId];
  const mine = isHost(state, a), joined = isJoined(state, a), member = mine || joined;
  const left = spotsLeft(a);
  const ended = hasEnded(a), started = hasStarted(a);
  const cancelled = a.status === "cancelled";
  const group = a.groupId ? state.groups.find((g) => g.id === a.groupId) : undefined;
  const tl = tempoLabel(a.sport, a.tempo);
  const ev = a.eventId ? state.events.find((e) => e.id === a.eventId) : null;
  const msUntil = new Date(a.startsAt).getTime() - Date.now();
  const late = msUntil < 2 * 3600 * 1000;
  const need = needsMyConfirmation(state, a);
  const planned = a.route?.mode === "planned" && a.route.points.length > 1;
  const people = [a.hostId, ...a.participants].filter((p) => !state.blocked.includes(p));
  const osm = `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=16/${a.lat}/${a.lng}`;
  const shareUrl = `${window.location.origin}${window.location.pathname}#a-${a.id}`;
  const shareText = `${a.title}: ${fmtDateLong(a.startsAt)}, ${fmtTime(a.startsAt)} Uhr, ${a.meetingPoint}. Kommst du mit?`;
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: a!.title, text: shareText, url: shareUrl }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    setShareOpen(true);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${shareText} ${shareUrl}`); api.toast("Link kopiert", "good"); setShareOpen(false); }
    catch { (document.getElementById("share-link") as HTMLInputElement | null)?.select(); }
  }

  return (
    <div className="screen-in pb-28">
      <TopBar onBack={nav.back} title={a.title} sub={cityName(a.city)}
        right={<div className="flex items-center gap-1">
          {!cancelled && !ended && <IconButton label="Teilen" onClick={share}><Share2 size={19} /></IconButton>}
          {mine && !cancelled && !ended && <Button size="sm" variant="secondary" onClick={() => (a.seriesId ? setEditChoice(true) : nav.push({ name: "create", editId: a.id }))}><Pencil size={14} /> Bearbeiten</Button>}
        </div>} />

      <div className="flex flex-col gap-6 px-4 pt-4">
        {cancelled && (
          <div className="flex items-start gap-3 rounded-2xl bg-bad/10 p-3.5 text-[14px] text-bad"><TriangleAlert size={18} className="mt-0.5 shrink-0" /><span><b>Abgesagt.</b> Diese Aktivität findet nicht statt.</span></div>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SportTag sport={a.sport} />
            {ev && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-bold text-accent">{ev.name}</span>}
            {a.seriesId && <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><Repeat size={12} /> {a.seriesRule ? seriesLabel(a.seriesRule) : "Serie"}</span>}
            {a.visibility === "group" && <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><Lock size={12} /> Nur Mitglieder</span>}
          </div>
          <h1 className="mt-2 font-display text-[28px] font-black leading-[1.05]">{a.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold"><CalendarDays size={16} className="text-muted" /> {fmtDateLong(a.startsAt)}, {fmtTime(a.startsAt)} Uhr</p>
          {group && (
            <button onClick={() => nav.push({ name: "group", id: group.id })} className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left">
              <GroupBadge group={group} size={34} />
              <span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">{kindLabel(group.kind)}</span><span className="block truncate text-[14px] font-bold">{group.name}</span></span>
              <ChevronRight size={18} className="text-muted" />
            </button>
          )}
          <button onClick={() => !mine && nav.push({ name: "user", id: a.hostId })} className="mt-3 flex items-center gap-2.5 text-left">
            <Avatar user={host} size={36} />
            <span><span className="block text-[12px] text-muted">{host.kind === "club" ? "Verein / Gruppe" : "Gastgeber:in"}</span><span className="block text-[14px] font-bold">{mine ? "Du" : host.name}</span></span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          <Big label="Distanz" value={fmtDistance(a.distanceKm, units)} sub={a.route?.ascentM !== undefined ? `↗ ${a.route.ascentM} Höhenmeter` : undefined} />
          <Big label={a.sport === "run" ? "Pace" : "Ø Tempo"} value={fmtTempo(a.sport, a.tempo, units)} sub={tl.text} />
          <Big label="Dauer ca." value={fmtDuration(durationMin(a.sport, a.distanceKm, a.tempo))} />
          <Big label="Plätze" value={`${totalPeople(a)}/${a.maxParticipants}`} sub={left === 0 ? "Ausgebucht" : `${left} frei`} />
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="label">Treffpunkt & Route</h2>
            {planned && <span className="text-[12px] font-semibold text-muted tnum">Skizze: {fmtDistance(routeLengthKm(a.route!.points), units)}</span>}
          </div>
          <MapView points={planned ? a.route!.points : []} center={[a.lat, a.lng]} centerLabel="Treffpunkt" accent={a.sport} spanKm={a.sport === "run" ? 3 : 10} />
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-start gap-1.5 text-[15px] font-semibold"><MapPin size={17} className="mt-0.5 shrink-0 text-accent" />{a.meetingPoint}</p>
            <a href={osm} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-accent">Karte <ExternalLink size={13} /></a>
          </div>
          <p className="flex items-start gap-1.5 text-[13px] text-muted"><RouteIcon size={15} className="mt-0.5 shrink-0" />
            {planned
              ? `${a.route?.source === "gpx" ? "Route aus GPX-Datei." : a.route?.source === "loop" ? "Rundkurs, Start und Ziel am Treffpunkt." : a.route?.source === "a2b" ? `Vom Treffpunkt nach ${a.route.destination ?? "Ziel"}.` : "Vom Gastgeber gezeichnete Route."}${a.sport === "ride" && a.route?.bikeType ? (a.route.bikeType === "road" ? " Für Rennräder geplant." : " Für Tour- und Gravelräder geplant.") : ""} Kann vor Ort leicht abweichen.`
              : "Keine feste Route. Die Strecke wird spontan vor Ort abgestimmt."}
          </p>
        </section>

        {(a.description || a.beginnerFriendly || a.breaks) && (
          <section className="flex flex-col gap-3">
            <h2 className="label">Beschreibung</h2>
            {a.description && <p className="max-w-[65ch] text-[15px] leading-relaxed">{a.description}</p>}
            <div className="flex flex-wrap gap-2">
              {a.beginnerFriendly && <span className="inline-flex items-center gap-1.5 rounded-full bg-good/12 px-3 py-1.5 text-[13px] font-semibold text-good"><Sprout size={14} /> Anfänger willkommen</span>}
              {a.breaks && <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px] font-semibold"><Coffee size={14} /> {a.sport === "run" ? "Geh- und Ruhepausen eingeplant" : "Pausen eingeplant"}</span>}
            </div>
          </section>
        )}

        {need === "self" && (
          <div className="rounded-2xl border border-good/30 bg-good/10 p-4">
            <h3 className="font-display text-base font-extrabold">Warst du dabei?</h3>
            <p className="mt-1 text-[13.5px] text-muted">Deine Bestätigung zählt für deine Zuverlässigkeit und, falls aktiviert, für die Community-Liga.</p>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => api.confirmSelf(a.id)}><Check size={15} /> Ja, war dabei</Button></div>
          </div>
        )}
        {need === "host" && (
          <div className="rounded-2xl border border-good/30 bg-good/10 p-4">
            <h3 className="font-display text-base font-extrabold">Wer war dabei?</h3>
            <p className="mt-1 text-[13.5px] text-muted">Hake ab, wer tatsächlich mitgemacht hat. Es zählt nur, wer es auch selbst bestätigt.</p>
            <div className="mt-3 flex flex-col gap-1">
              {a.participants.map((pid) => {
                const u = state.users[pid], on = (present ?? a.participants).includes(pid);
                return (
                  <label key={pid} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5">
                    <input id={"present-" + pid} type="checkbox" checked={on} onChange={() => setPresent((p) => { const cur = p ?? a.participants; return on ? cur.filter((x) => x !== pid) : [...cur, pid]; })} className="h-5 w-5 accent-[rgb(var(--good))]" />
                    <Avatar user={u} size={28} /><span className="text-[14px] font-semibold">{u.name}</span>
                    {a.selfConfirmed.includes(pid) && <span className="ml-auto text-[11.5px] font-semibold text-good">hat bestätigt</span>}
                  </label>
                );
              })}
            </div>
            <Button size="sm" className="mt-3" onClick={() => api.hostConfirm(a.id, present ?? a.participants)}><Check size={15} /> Anwesenheit speichern</Button>
          </div>
        )}
        {ended && !need && member && !cancelled && (
          <p className="flex items-center gap-2 rounded-2xl bg-raised p-3.5 text-[13.5px]"><ShieldCheck size={18} className="text-good" /> Diese Aktivität ist abgeschlossen und bestätigt.</p>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="label">Dabei ({people.length})</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {people.map((pid) => {
              const u = state.users[pid]; const me = pid === state.meId;
              return (
                <li key={pid}>
                  <button disabled={me} onClick={() => nav.push({ name: "user", id: pid })} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left disabled:cursor-default">
                    <Avatar user={u} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{me ? `${u.name} (du)` : u.name}</span>
                      <span className="block text-[12px] text-muted">{pid === a.hostId ? "Gastgeber:in" : `${u.reliability.attended} gemeinsame Aktivitäten`}</span>
                    </span>
                    {ended && a.hostConfirmed.includes(pid) && <Check size={16} className="text-good" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          {member ? (
            <Button variant="secondary" block onClick={() => nav.push({ name: "chat", id: a.id })}><MessageCircle size={17} /> Gruppenchat öffnen <span className="text-muted tnum">({a.messages.filter((m) => !m.system).length})</span></Button>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-raised p-3.5 text-[13.5px] text-muted"><Lock size={16} /> Der Gruppenchat ist nur für Teilnehmende sichtbar.</p>
          )}
          {!mine && <button onClick={() => nav.push({ name: "user", id: a.hostId })} className="mt-2 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted hover:text-ink"><Flag size={14} /> Problem mit dieser Aktivität melden</button>}
          {mine && !cancelled && !started && <button onClick={() => setConfirmCancel(true)} className="mt-2 self-start text-[13px] font-semibold text-bad">Aktivität absagen</button>}
          {mine && !cancelled && !started && a.seriesId && <button onClick={() => setConfirmSeries(true)} className="self-start text-[13px] font-semibold text-bad">Serie beenden (alle kommenden Termine absagen)</button>}
        </section>
      </div>

      {!cancelled && !ended && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          {mine ? (
            <div className="flex gap-2"><Button variant="secondary" onClick={() => (a.seriesId ? setEditChoice(true) : nav.push({ name: "create", editId: a.id }))}><Pencil size={16} /> Bearbeiten</Button><Button block onClick={() => nav.push({ name: "chat", id: a.id })}><MessageCircle size={17} /> Chat</Button></div>
          ) : joined ? (
            <div className="flex gap-2"><Button variant="danger" onClick={() => setConfirmLeave(true)}>Absagen</Button><Button block onClick={() => nav.push({ name: "chat", id: a.id })}><MessageCircle size={17} /> Zum Gruppenchat</Button></div>
          ) : started ? (
            <Button block disabled>Hat bereits begonnen</Button>
          ) : left === 0 ? (
            <Button block disabled><Users size={17} /> Ausgebucht</Button>
          ) : (
            <Button block size="lg" className="pop" onClick={() => api.join(a.id)}>Teilnehmen <span className="opacity-80 tnum">· {left} {left === 1 ? "Platz" : "Plätze"} frei</span></Button>
          )}
        </div>
      )}

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Teilnahme absagen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setConfirmLeave(false)}>Doch dabei</Button><Button variant="danger" block onClick={() => { api.leave(a.id, late); setConfirmLeave(false); }}>Absagen</Button></div>}>
        <p className="text-[15px] leading-relaxed">Die Gruppe wird automatisch informiert, und dein Platz wird wieder frei.</p>
        {late && <p className={cx("mt-3 flex gap-2 rounded-xl bg-warn/12 p-3 text-[13.5px] text-warn")}><TriangleAlert size={17} className="shrink-0" /> Der Start ist in weniger als 2 Stunden. Kurzfristige Absagen werden in deinem Profil gezählt.</p>}
      </Sheet>
      <Sheet open={editChoice} onClose={() => setEditChoice(false)} title="Was möchtest du ändern?">
        <div className="flex flex-col gap-2">
          <Button block onClick={() => { setEditChoice(false); nav.push({ name: "create", editId: a.id, series: true }); }}><Repeat size={16} /> Ganze Serie</Button>
          <p className="-mt-0.5 mb-1 text-center text-[12.5px] text-muted">{a.seriesRule ? `${seriesLabel(a.seriesRule)} · ` : ""}alle kommenden Termine</p>
          <Button block variant="secondary" onClick={() => { setEditChoice(false); nav.push({ name: "create", editId: a.id }); }}>Nur diesen Termin ({fmtDateLong(a.startsAt)})</Button>
        </div>
      </Sheet>
      <Sheet open={confirmSeries} onClose={() => setConfirmSeries(false)} title="Serie beenden?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setConfirmSeries(false)}>Zurück</Button><Button variant="danger" block onClick={() => { api.cancelSeries(a.seriesId!); setConfirmSeries(false); }}>Alle absagen</Button></div>}>
        <p className="text-[15px] leading-relaxed">Alle kommenden Termine dieser wöchentlichen Serie werden abgesagt und alle Angemeldeten benachrichtigt. Vergangene Termine bleiben erhalten.</p>
      </Sheet>
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Aktivität teilen">
        <div className="flex flex-col gap-3 pb-3">
          <p className="text-[14px] text-muted">Schick den Link in deine Laufgruppe oder an Freunde. Ohne Konto sehen sie eine Vorschau; zum Mitmachen melden sie sich kurz an.</p>
          <label htmlFor="share-link" className="sr-only">Link</label>
          <input id="share-link" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="h-12 w-full rounded-xl border border-line bg-raised px-3.5 text-[14px]" />
          <Button onClick={copyLink}><Copy size={16} /> Link kopieren</Button>
        </div>
      </Sheet>
      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Aktivität absagen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setConfirmCancel(false)}>Zurück</Button><Button variant="danger" block onClick={() => { api.cancelActivity(a.id); setConfirmCancel(false); }}>Für alle absagen</Button></div>}>
        <p className="text-[15px] leading-relaxed">Alle {a.participants.length} Teilnehmenden werden benachrichtigt. Das lässt sich nicht rückgängig machen.</p>
      </Sheet>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="label">{label}</p>
      <p className="mt-0.5 font-cond text-[24px] font-bold leading-tight">{value}</p>
      {sub && <p className="text-[12px] font-medium text-muted">{sub}</p>}
    </div>
  );
}
