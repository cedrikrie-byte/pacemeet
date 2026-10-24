import { Clock, Coffee, MapPin, Route as RouteIcon, Sprout, Users } from "lucide-react";
import type { Activity } from "../types";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Avatar, AvatarStack, SportIcon, cx } from "./ui";
import { durationMin, fmtDay, fmtDistance, fmtDuration, fmtTempo, fmtTime, tempoLabel } from "../lib/format";
import { distanceFromMe, isHost, isJoined, spotsLeft, totalPeople } from "../lib/activity";

export function ActivityCard({ a, compact }: { a: Activity; compact?: boolean }) {
  const { state } = useApp();
  const nav = useNav();
  const units = state.settings.units;
  const host = state.users[a.hostId];
  const people = [host, ...a.participants.map((id) => state.users[id])].filter(Boolean);
  const left = spotsLeft(a);
  const joined = isJoined(state, a), mine = isHost(state, a);
  const tl = tempoLabel(a.sport, a.tempo);
  const ev = a.eventId ? state.events.find((e) => e.id === a.eventId) : null;
  const cancelled = a.status === "cancelled";

  return (
    <button
      type="button"
      onClick={() => nav.push({ name: "activity", id: a.id })}
      className={cx("group w-full rounded-[20px] border border-line bg-surface p-4 text-left transition hover:border-muted/50 hover:shadow-[0_10px_30px_-18px_rgb(0_0_0/.35)] active:scale-[.995]", cancelled && "opacity-70")}
    >
      <div className="flex items-start gap-3">
        <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", a.sport === "run" ? "bg-run/10 text-run" : "bg-ride/10 text-ride")}>
          <SportIcon sport={a.sport} size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold text-muted">
            <span className={cx("tnum", !cancelled && "text-ink")}>{fmtDay(a.startsAt)} · {fmtTime(a.startsAt)}</span>
            {cancelled && <span className="rounded-full bg-bad/10 px-2 py-px text-[11px] font-bold text-bad">Abgesagt</span>}
            {!cancelled && joined && <span className="rounded-full bg-good/12 px-2 py-px text-[11px] font-bold text-good">Dabei</span>}
            {!cancelled && mine && <span className="rounded-full bg-accent/12 px-2 py-px text-[11px] font-bold text-accent">Du organisierst</span>}
          </div>
          <h3 className="mt-0.5 font-display text-[17px] font-extrabold leading-tight">{a.title}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-muted"><MapPin size={13} className="shrink-0" /> <span className="truncate">{a.meetingPoint}</span> <span className="shrink-0 tnum">· {fmtDistance(distanceFromMe(state, a), units)}</span></p>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-3 divide-x divide-line rounded-xl bg-raised/70 py-2.5">
        <Stat value={fmtDistance(a.distanceKm, units)} label="Distanz" />
        <Stat value={fmtTempo(a.sport, a.tempo, units)} label={tl.text} />
        <Stat value={fmtDuration(durationMin(a.sport, a.distanceKm, a.tempo))} label="ca. Dauer" />
      </div>

      {!compact && (a.beginnerFriendly || a.breaks || a.route?.mode === "planned" || ev) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.beginnerFriendly && <Pill icon={<Sprout size={12} />}>Anfänger willkommen</Pill>}
          {a.breaks && <Pill icon={<Coffee size={12} />}>{a.sport === "run" ? "Gehpausen" : "Pausen"}</Pill>}
          {a.route?.mode === "planned" && <Pill icon={<RouteIcon size={12} />}>{a.route.source === "loop" ? "Rundkurs" : a.route.source === "a2b" && a.route.destination ? `nach ${a.route.destination}` : "Route geplant"}{a.route.ascentM ? ` · ${a.route.ascentM} Hm` : ""}</Pill>}
          {ev && <Pill accent icon={<Clock size={12} />}>{ev.name}</Pill>}
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px]">
          <Avatar user={host} size={24} />
          <span className="truncate"><span className="text-muted">mit </span><span className="font-semibold">{host?.name}</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <AvatarStack users={people.slice(1)} max={3} size={22} />
          <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tnum", left === 0 ? "bg-raised text-muted" : left <= 2 ? "bg-warn/12 text-warn" : "bg-raised text-ink")}>
            <Users size={12} /> {totalPeople(a)}/{a.maxParticipants}
          </span>
        </span>
      </div>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center px-1">
      <span className="font-cond text-[17px] font-bold leading-tight">{value}</span>
      <span className="truncate text-[11px] font-medium text-muted">{label}</span>
    </span>
  );
}
function Pill({ children, icon, accent }: { children: React.ReactNode; icon: React.ReactNode; accent?: boolean }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold", accent ? "bg-accent/10 text-accent" : "bg-raised text-ink/80")}>{icon}{children}</span>;
}
