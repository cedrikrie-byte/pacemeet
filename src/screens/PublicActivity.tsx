import { useEffect, useState } from "react";
import { CalendarDays, Coffee, MapPin, Sprout, Users } from "lucide-react";
import { MapView } from "../components/MapView";
import { Button, Empty, SportTag } from "../components/ui";
import { Logo } from "./Discover";
import { APP } from "../config/app";
import { durationMin, fmtDateLong, fmtDistance, fmtDuration, fmtTempo, fmtTime, tempoLabel } from "../lib/format";
import { fetchPublicActivity, type PublicActivity } from "../backend/supabase";

/** Vorschau einer geteilten Aktivität für Menschen ohne Konto. */
export function PublicActivityScreen({ id, onJoin, onDismiss }: { id: string; onJoin: () => void; onDismiss: () => void }) {
  const [a, setA] = useState<PublicActivity | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    fetchPublicActivity(id).then((r) => on && setA(r)).catch((e) => on && (setErr((e as Error).message), setA(null)));
    return () => { on = false; };
  }, [id]);

  if (a === undefined) return <div className="grid h-full place-items-center text-muted"><Logo size={40} /></div>;
  if (!a || a.status !== "open") {
    return (
      <div className="flex min-h-full flex-col gap-6 px-5 pb-8 pt-10">
        <div className="flex items-center gap-2"><Logo size={32} /><span className="font-display text-[22px] font-black">{APP.name}</span></div>
        <Empty icon={<CalendarDays size={22} />} title={a?.status === "cancelled" ? "Diese Aktivität wurde abgesagt" : "Diese Aktivität ist vorbei oder existiert nicht"} text={err || "Schau dir an, was sonst in deiner Nähe los ist."}
          action={<Button size="sm" onClick={onDismiss}>Weitere Aktivitäten entdecken</Button>} />
      </div>
    );
  }
  const left = Math.max(0, a.max_participants - a.participant_count - 1);
  const tl = tempoLabel(a.sport, Number(a.tempo));
  const planned = a.route?.mode === "planned" && (a.route.points?.length ?? 0) > 1;
  return (
    <div className="screen-in flex min-h-full flex-col gap-6 px-5 pb-10 pt-6">
      <div className="flex items-center gap-2"><Logo size={30} /><span className="font-display text-[20px] font-black">{APP.name}</span><span className="ml-auto text-[12px] font-semibold text-muted">Einladung</span></div>
      <div>
        <SportTag sport={a.sport} />
        <h1 className="mt-2 font-display text-[28px] font-black leading-[1.05]">{a.title}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold"><CalendarDays size={16} className="text-muted" /> {fmtDateLong(a.starts_at)}, {fmtTime(a.starts_at)} Uhr</p>
        <p className="mt-1 flex items-center gap-1.5 text-[15px]"><MapPin size={16} className="text-accent" /> {a.meeting_point}</p>
        <p className="mt-1 text-[14px] text-muted">Gastgeber:in: <b className="text-ink">{a.host_name}</b></p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface py-3 text-center">
        <span><b className="block font-cond text-[20px]">{fmtDistance(Number(a.distance_km), "metric")}</b><span className="text-[11.5px] text-muted">Distanz{a.route?.ascentM ? ` · ${a.route.ascentM} Hm` : ""}</span></span>
        <span><b className="block font-cond text-[20px]">{fmtTempo(a.sport, Number(a.tempo), "metric")}</b><span className="text-[11.5px] text-muted">{tl.text}</span></span>
        <span><b className="block font-cond text-[20px]">{fmtDuration(durationMin(a.sport, Number(a.distance_km), Number(a.tempo)))}</b><span className="text-[11.5px] text-muted">ca. Dauer</span></span>
      </div>
      <MapView points={planned ? a.route!.points : []} center={[a.lat, a.lng]} centerLabel="Treffpunkt" accent={a.sport} spanKm={a.sport === "run" ? 3 : 10} />
      {a.description && <p className="max-w-[65ch] text-[15px] leading-relaxed">{a.description}</p>}
      <div className="flex flex-wrap gap-2">
        {a.beginner_friendly && <span className="inline-flex items-center gap-1.5 rounded-full bg-good/12 px-3 py-1.5 text-[13px] font-semibold text-good"><Sprout size={14} /> Anfänger willkommen</span>}
        {a.breaks && <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px] font-semibold"><Coffee size={14} /> Pausen eingeplant</span>}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px] font-semibold"><Users size={14} /> {left === 0 ? "Ausgebucht" : `${left} ${left === 1 ? "Platz" : "Plätze"} frei`}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Button size="lg" block onClick={onJoin} disabled={left === 0}>Anmelden und mitmachen</Button>
        <p className="text-center text-[12.5px] text-muted">Kostenlos, mit E-Mail-Code, ohne Passwort.</p>
      </div>
    </div>
  );
}
