import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarCheck, Clock3, Flag, MapPin, Pencil, Settings as SettingsIcon, ShieldCheck, Trophy, UserCheck } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { User } from "../types";
import { Avatar, Button, Section, Sheet, SportIcon, TopBar, IconButton, cx } from "../components/ui";
import { BadgeGrid, EventMedals } from "../components/Awards";
import { ActivityCard } from "../components/ActivityCard";
import { fmtMonthYear, fmtTempo } from "../lib/format";
import { cityName } from "../lib/activity";
import { computeBadges, computeLedger, confirmedActivities, eventProgress, levelOf, monthXp, sumXp } from "../lib/xp";
import { SPORTS } from "../data/sports";

function ProfileBody({ user, own }: { user: User; own: boolean }) {
  const { state } = useApp();
  const nav = useNav();
  const units = state.settings.units;
  const ledger = useMemo(() => own ? computeLedger(state, user.id) : [], [state, user.id, own]);
  const xp = own ? sumXp(ledger) : user.league?.xp ?? 0;
  const mxp = own ? monthXp(ledger) : user.league?.monthXp ?? 0;
  const leagueOn = own ? state.league.optIn : !!user.league?.optIn;
  const lvl = levelOf(xp);
  const badges = own ? computeBadges(state, user.id, ledger) : [];
  const events = eventProgress(state, user.id).filter((e) => own || e.earned);
  const conf = confirmedActivities(state, user.id);
  const showPace = true;
  const history = conf.slice().sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 3);
  const r = user.reliability;
  const showAge = user.age && (own || user.showAge);

  return (
    <div className="flex flex-col gap-7 px-4 pb-10 pt-5">
      <div className="flex items-center gap-4">
        <Avatar user={user} size={84} />
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-black leading-tight">{user.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
            <span className="inline-flex items-center gap-1"><MapPin size={14} /> {cityName(user.city)}</span>
            {showAge && <span>· {user.age} Jahre{own && !user.showAge && " (nur für dich)"}</span>}
            {user.kind === "club" && <span>· Verein</span>}
          </p>
        </div>
      </div>
      {user.bio && <p className="-mt-3 max-w-[60ch] text-[15px] leading-relaxed">{user.bio}</p>}

      <div className="flex flex-wrap gap-2">
        {user.sports.map((s) => (
          <span key={s} className={cx("inline-flex items-center gap-2 rounded-2xl px-3.5 py-2", s === "run" ? "bg-run/10 text-run" : "bg-ride/10 text-ride")}>
            <SportIcon sport={s} size={17} />
            <span className="text-[13px] font-bold">{SPORTS[s].label}</span>
            {showPace && <span className="font-cond text-[15px] font-bold text-ink">{fmtTempo(s, s === "run" ? user.pace : user.speed, units)}</span>}
          </span>
        ))}
      </div>

      {leagueOn ? (
        <button onClick={() => own && nav.tab("league")} className="flex items-center gap-4 rounded-2xl bg-ink p-4 text-left text-bg">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink"><Trophy size={22} /></span>
          <span className="flex-1">
            <span className="block text-[12px] font-bold uppercase tracking-wider opacity-70">Community-Liga · Level {lvl.level}</span>
            <span className="block font-cond text-[28px] font-bold leading-none">{xp.toLocaleString("de-DE")} XP</span>
          </span>
          <span className="text-right"><span className="block font-cond text-[20px] font-bold">{mxp}</span><span className="block text-[11px] opacity-70">diesen Monat</span></span>
        </button>
      ) : own ? (
        <button onClick={() => nav.tab("league")} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3.5 text-left text-[13.5px]">
          <Trophy size={18} className="text-muted" /><span className="flex-1 text-muted">Community-Liga ist aus. Freiwillig, ohne Nachteile.</span><span className="font-semibold text-accent">Ansehen</span>
        </button>
      ) : null}

      <Section title="Zuverlässigkeit">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          <Signal icon={<UserCheck size={15} />} value={r.attended} label="bestätigt dabei" />
          <Signal icon={<CalendarCheck size={15} />} value={r.hosted} label="organisiert" />
          <Signal icon={<Clock3 size={15} />} value={r.lateCancels} label="kurzfristig abgesagt" warn={r.lateCancels > 2} />
        </div>
        <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><ShieldCheck size={14} /> Dabei seit {fmtMonthYear(r.memberSince)}. Nur überprüfbare Fakten, keine Sternebewertungen.</p>
      </Section>

      {user.bests.length > 0 && (
        <Section title="Bestzeiten" action={own ? <button onClick={() => nav.push({ name: "editProfile" })} className="text-[13px] font-semibold text-accent">Bearbeiten</button> : undefined}>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {user.bests.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 text-[14px] font-semibold"><span className={b.sport === "run" ? "text-run" : "text-ride"}><SportIcon sport={b.sport} size={15} /></span>{b.label}</span>
                <span className="font-cond text-[18px] font-bold">{b.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">Selbst angegeben. Bestzeiten bringen bewusst keine Liga-Punkte.</p>
        </Section>
      )}

      {events.length > 0 && (
        <Section title="Event-Medaillen"><EventMedals items={events} /></Section>
      )}
      {own && leagueOn && <Section title="Abzeichen"><BadgeGrid badges={badges} /></Section>}

      {own && history.length > 0 && (
        <Section title="Zuletzt gemeinsam unterwegs">
          {history.map((a) => <ActivityCard key={a.id} a={a} compact />)}
        </Section>
      )}
    </div>
  );
}

function Signal({ icon, value, label, warn }: { icon: React.ReactNode; value: number; label: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-3 py-3">
      <span className={cx("text-muted", warn && "text-warn")}>{icon}</span>
      <span className="font-cond text-[24px] font-bold leading-none tnum">{value}</span>
      <span className="text-[11.5px] leading-tight text-muted">{label}</span>
    </div>
  );
}

export function Profile() {
  const { me } = useApp();
  const nav = useNav();
  return (
    <div className="screen-in">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line/60 bg-bg/85 px-4 backdrop-blur-md">
        <span className="font-display text-[17px] font-extrabold">Profil</span>
        <div className="flex">
          <IconButton label="Profil bearbeiten" onClick={() => nav.push({ name: "editProfile" })}><Pencil size={19} /></IconButton>
          <IconButton label="Einstellungen" onClick={() => nav.push({ name: "settings" })}><SettingsIcon size={20} /></IconButton>
        </div>
      </header>
      <ProfileBody user={me} own />
    </div>
  );
}

const REASONS = ["Unangemessenes Verhalten", "Belästigung oder Kontaktversuche außerhalb des Sports", "Fake-Profil oder Spam", "Falsche Angaben zu Treffpunkt oder Aktivität", "Sonstiges"];

export function UserProfile({ id }: { id: string }) {
  const { state, api } = useApp();
  const nav = useNav();
  const user = state.users[id];
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [blockSheet, setBlockSheet] = useState(false);
  useEffect(() => { void api.loadUser(id); }, [api, id]);
  if (!user) return null;
  const blocked = state.blocked.includes(id);
  const restricted = state.settings.profileVisibility === "participants";
  return (
    <div className="screen-in">
      <TopBar onBack={nav.back} title={user.name} />
      {blocked ? (
        <div className="p-4"><p className="rounded-2xl bg-raised p-4 text-[14px]">Du hast diese Person blockiert. Ihr seht eure Aktivitäten und Nachrichten nicht mehr.</p><Button className="mt-3" variant="secondary" onClick={() => api.unblock(id)}>Blockierung aufheben</Button></div>
      ) : (
        <>
          <ProfileBody user={user} own={false} />
          <div className="flex flex-col gap-2 px-4 pb-10">
            {restricted && <p className="text-[12px] text-muted">Hinweis: Dein eigenes Profil ist nur für Teilnehmende gemeinsamer Aktivitäten sichtbar.</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReport(true)}><Flag size={14} /> Melden</Button>
              <Button variant="danger" size="sm" onClick={() => setBlockSheet(true)}><Ban size={14} /> Blockieren</Button>
            </div>
          </div>
        </>
      )}
      <Sheet open={report} onClose={() => setReport(false)} title={`${user.name} melden`}
        footer={<Button block onClick={() => { api.report(id, reason); setReport(false); }}>Meldung senden</Button>}>
        <p className="mb-3 text-[13.5px] text-muted">Meldungen sind vertraulich. Die Person erfährt nicht, wer gemeldet hat.</p>
        <div className="flex flex-col gap-2 pb-2">
          {REASONS.map((r) => (
            <label key={r} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[14px]", reason === r ? "border-ink" : "border-line")}>
              <input id={"reason-" + r} type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
            </label>
          ))}
        </div>
      </Sheet>
      <Sheet open={blockSheet} onClose={() => setBlockSheet(false)} title={`${user.name} blockieren?`}
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setBlockSheet(false)}>Abbrechen</Button><Button variant="danger" block onClick={() => { api.block(id); setBlockSheet(false); }}>Blockieren</Button></div>}>
        <p className="text-[15px] leading-relaxed">Ihr seht gegenseitig keine Aktivitäten und Nachrichten mehr. Die Person wird nicht benachrichtigt. Du kannst das in den Einstellungen rückgängig machen.</p>
      </Sheet>
    </div>
  );
}
