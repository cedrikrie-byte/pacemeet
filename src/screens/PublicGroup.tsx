import { useEffect, useState } from "react";
import { CalendarDays, Globe, Lock, Repeat, ShieldCheck, Users } from "lucide-react";
import { Button, Empty, SportIcon, SportTag } from "../components/ui";
import { GroupBadge } from "../components/GroupBadge";
import { Logo } from "./Discover";
import { APP } from "../config/app";
import type { Group } from "../types";
import { groupPreview, publicGroupActivities, type PublicGroupActivity } from "../backend/supabase";
import { kindLabel } from "../lib/groups";
import { cityName } from "../lib/activity";
import { fmtDay, fmtDistance, fmtTempo, fmtTime } from "../lib/format";

/** Vorschau einer Gruppe aus einem Einladungslink, für Menschen ohne Konto. */
export function PublicGroupScreen({ id, onJoin, onDismiss }: { id: string; onJoin: () => void; onDismiss: () => void }) {
  const [g, setG] = useState<Group | null | undefined>(undefined);
  const [acts, setActs] = useState<PublicGroupActivity[]>([]);
  useEffect(() => {
    let on = true;
    groupPreview(id).then((r) => on && setG(r)).catch(() => on && setG(null));
    publicGroupActivities(id).then((r) => on && setActs(r)).catch(() => undefined);
    return () => { on = false; };
  }, [id]);

  if (g === undefined) return <div className="grid h-full place-items-center text-muted"><Logo size={40} /></div>;
  if (!g) {
    return (
      <div className="flex min-h-full flex-col gap-6 px-5 pb-8 pt-10">
        <div className="flex items-center gap-2"><Logo size={32} /><span className="font-display text-[22px] font-black">{APP.name}</span></div>
        <Empty icon={<Users size={22} />} title="Diese Gruppe gibt es nicht mehr" text="Vielleicht wurde sie aufgelöst. Schau, was sonst in deiner Nähe los ist."
          action={<Button size="sm" onClick={onDismiss}>{APP.name} entdecken</Button>} />
      </div>
    );
  }
  // Je Serie nur der nächste Termin
  const seen = new Set<string>();
  const list = acts.filter((a) => !a.series_id || (!seen.has(a.series_id) && seen.add(a.series_id)));
  return (
    <div className="screen-in flex min-h-full flex-col gap-6 px-5 pb-10 pt-6">
      <div className="flex items-center gap-2"><Logo size={30} /><span className="font-display text-[20px] font-black">{APP.name}</span><span className="ml-auto text-[12px] font-semibold text-muted">Einladung</span></div>

      <div className="flex items-start gap-4">
        <GroupBadge group={g} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{kindLabel(g.kind)}{g.city ? ` · ${cityName(g.city)}` : ""}</p>
          <h1 className="mt-0.5 font-display text-[26px] font-black leading-[1.05]">{g.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {g.sports.map((s) => <SportTag key={s} sport={s} />)}
            <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><Users size={12} /> {g.memberCount} {g.memberCount === 1 ? "Mitglied" : "Mitglieder"}</span>
          </div>
        </div>
      </div>

      {g.ownerName && <p className="-mt-2 text-[13.5px] text-muted">Gegründet von <b className="text-ink">{g.ownerName}</b></p>}
      {g.description && <p className="whitespace-pre-line text-[15px] leading-relaxed">{g.description}</p>}
      {g.website && <a href={g.website} target="_blank" rel="noreferrer noopener" className="-mt-3 inline-flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-accent"><Globe size={14} /> {g.website.replace(/^https:\/\//, "")}</a>}

      <section className="flex flex-col gap-2.5">
        <h2 className="label">Nächste offene Termine</h2>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-5 text-[13.5px] text-muted"><Lock size={15} className="shrink-0" /> Termine siehst du, sobald du Mitglied bist.</p>
        ) : list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised"><SportIcon sport={a.sport} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-[15px] font-bold">{a.title}{a.series_id && <Repeat size={13} className="shrink-0 text-muted" />}</span>
              <span className="block truncate text-[12.5px] text-muted"><CalendarDays size={12} className="mr-1 inline" />{fmtDay(a.starts_at)}, {fmtTime(a.starts_at)} · {fmtDistance(Number(a.distance_km), "metric")} · {fmtTempo(a.sport, Number(a.tempo), "metric")}</span>
            </span>
          </div>
        ))}
      </section>

      <div className="mt-auto flex flex-col gap-2">
        <Button block size="lg" onClick={onJoin}>{g.joinMode === "open" ? "Anmelden und beitreten" : "Anmelden und Beitritt anfragen"}</Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted">
          {g.joinMode === "request" ? <><ShieldCheck size={13} /> Die Admins nehmen neue Mitglieder auf.</> : "Kostenlos. Anmeldung mit deiner E-Mail-Adresse, ohne Passwort."}
        </p>
        <button onClick={onDismiss} className="mt-1 text-[13px] font-semibold text-muted">Erst mal umschauen</button>
      </div>
    </div>
  );
}
