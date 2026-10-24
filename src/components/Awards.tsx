import { Award, Lock } from "lucide-react";
import type { Badge, EventProgress } from "../lib/xp";
import { cx } from "./ui";

export function MedalIcon({ hue, size = 56, locked }: { hue: number; size?: number; locked?: boolean }) {
  const c1 = locked ? "rgb(var(--line))" : `hsl(${hue} 70% 55%)`;
  const c2 = locked ? "rgb(var(--raised))" : `hsl(${hue + 18} 75% 42%)`;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden>
      <path d="M17 2 L25 22 L20 24 L12 4 Z" fill={locked ? "rgb(var(--line))" : `hsl(${hue + 180} 45% 45%)`} />
      <path d="M39 2 L31 22 L36 24 L44 4 Z" fill={locked ? "rgb(var(--line))" : `hsl(${hue + 180} 45% 38%)`} />
      <circle cx="28" cy="35" r="17" fill={c2} />
      <circle cx="28" cy="35" r="13" fill={c1} />
      <circle cx="28" cy="35" r="13" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1.2" strokeDasharray="2 2.4" />
      <path d="M28 27 l2.4 5 5.4.6-4 3.7 1.1 5.3L28 39l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" fill={locked ? "rgb(var(--muted) / .5)" : "rgb(255 255 255 / .9)"} />
    </svg>
  );
}

export function EventMedals({ items }: { items: EventProgress[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(({ event, done, booked, earned }) => (
        <div key={event.id} className={cx("flex flex-col items-center rounded-2xl border p-3 text-center", earned ? "border-line bg-surface" : "border-dashed border-line")}>
          <MedalIcon hue={event.hue} locked={!earned} />
          <p className="mt-1 text-[13.5px] font-bold leading-tight">{event.medal}</p>
          <p className="text-[11.5px] text-muted">{event.name}</p>
          <p className={cx("mt-1.5 text-[11.5px] font-semibold tnum", earned ? "text-good" : "text-muted")}>
            {earned ? "Erhalten" : `${done}/${event.required} bestätigt${booked ? ` · ${booked} geplant` : ""}`}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {badges.map((b) => (
        <div key={b.id} title={b.desc} className={cx("flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-center", b.earned ? "border-line bg-surface" : "border-dashed border-line opacity-70")}>
          <span className={cx("grid h-10 w-10 place-items-center rounded-full", b.earned ? "bg-accent/12 text-accent" : "bg-raised text-muted")}>
            {b.earned ? <Award size={20} /> : <Lock size={16} />}
          </span>
          <span className="text-[12px] font-bold leading-tight">{b.name}</span>
          {!b.earned && b.progress && <span className="text-[11px] text-muted tnum">{b.progress}</span>}
        </div>
      ))}
    </div>
  );
}
