import { useEffect, useMemo, useState } from "react";
import { LIVE } from "../config/backend";
import { CalendarHeart, CheckCircle2, EyeOff, Scale, ShieldCheck, Trophy, Users } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Avatar, Button, Section, Segmented, cx } from "../components/ui";
import { BadgeGrid, EventMedals } from "../components/Awards";
import { XP_RULES, computeBadges, computeLedger, confirmedActivities, eventProgress, levelOf, monthXp, sumXp } from "../lib/xp";
import { fmtDay, fmtMonthYear } from "../lib/format";
import { needsMyConfirmation } from "../lib/activity";

export function League() {
  const { state, api, me } = useApp();
  const nav = useNav();
  const [board, setBoard] = useState<"friends" | "local">("local");
  const ledger = useMemo(() => computeLedger(state, me.id), [state, me.id]);
  const xp = sumXp(ledger), mxp = monthXp(ledger), lvl = levelOf(xp);
  const badges = computeBadges(state, me.id, ledger);
  const events = eventProgress(state, me.id);
  const pending = state.activities.filter((a) => needsMyConfirmation(state, a));
  const month = fmtMonthYear(new Date().toISOString()).split(" ")[0];

  const friends = useMemo(() => {
    const s = new Set<string>();
    confirmedActivities(state, me.id).forEach((a) => [a.hostId, ...a.participants].forEach((p) => p !== me.id && s.add(p)));
    return s;
  }, [state, me.id]);

  useEffect(() => { if (state.league.optIn) void api.loadLeague(); }, [state.league.optIn, api]);
  const rows = useMemo(() => {
    if (LIVE) {
      const src = state.leagueBoard?.[board] ?? [];
      const list = src.map((r) => ({ id: r.userId, user: state.users[r.userId] ?? { ...me, id: r.userId, name: r.name, photo: r.photo, hue: 200 }, xp: r.isMe ? mxp : r.monthXp }));
      if (!list.some((r) => r.id === me.id)) list.push({ id: me.id, user: me, xp: mxp });
      return list.sort((a, b) => b.xp - a.xp);
    }
    const others = Object.values(state.users).filter((u) => u.id !== me.id && u.league?.optIn && !state.blocked.includes(u.id) && (board === "local" || friends.has(u.id)));
    const list = [...others.map((u) => ({ id: u.id, user: u, xp: u.league!.monthXp })), { id: me.id, user: me, xp: mxp }];
    return list.sort((a, b) => b.xp - a.xp);
  }, [state, board, friends, me, mxp]);

  const Events = (
    <Section title="Community-Events">
      <p className="-mt-1 text-[13px] text-muted">Medaillen gibt es fürs Mitmachen, unabhängig von der Liga.</p>
      <EventMedals items={events} />
      {events.filter((e) => e.active).map((e) => (
        <div key={e.event.id} className="flex items-start gap-3 rounded-2xl bg-accent/10 p-3.5">
          <CalendarHeart size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="text-[13.5px]"><b>{e.event.name}</b> läuft gerade. {e.event.description}
            <button onClick={() => nav.tab("discover")} className="mt-1 block font-semibold text-accent">Passende Aktivitäten finden</button></div>
        </div>
      ))}
    </Section>
  );

  if (!state.league.optIn) {
    return (
      <div className="screen-in">
        <header className="px-4 pb-2 pt-5"><h1 className="font-display text-[26px] font-black">Community-Liga</h1></header>
        <div className="flex flex-col gap-7 px-4 pb-10 pt-2">
          <div className="overflow-hidden rounded-3xl bg-ink p-5 text-bg">
            <Trophy size={28} className="text-accent" />
            <h2 className="mt-3 font-display text-[22px] font-black leading-tight">Punkte fürs Mitmachen, nicht fürs Schnellsein.</h2>
            <p className="mt-2 text-[14px] leading-relaxed opacity-80">Sammle XP, wenn du bei gemeinsamen Aktivitäten dabei bist oder welche organisierst. Die Liga ist komplett freiwillig. Ohne Liga hast du keinerlei Nachteile.</p>
            <ul className="mt-4 flex flex-col gap-2 text-[14px]">
              <Rule xp={XP_RULES.attend} text="bestätigte Teilnahme" />
              <Rule xp={XP_RULES.host} text="organisierte Aktivität, die stattgefunden hat" />
              <Rule xp={XP_RULES.newGroup} text="erstes Mal mit einer neuen Gruppe" />
            </ul>
            <Button className="mt-5" block onClick={() => api.setLeague({ optIn: true, visibility: "friends" })}>Liga aktivieren</Button>
            <p className="mt-2 text-center text-[12px] opacity-60">Jederzeit in den Einstellungen deaktivierbar.</p>
          </div>
          <Principles />
          {Events}
        </div>
      </div>
    );
  }

  const myRank = rows.findIndex((r) => r.id === me.id) + 1;
  return (
    <div className="screen-in">
      <header className="flex items-end justify-between px-4 pb-2 pt-5">
        <h1 className="font-display text-[26px] font-black">Community-Liga</h1>
        <button onClick={() => nav.push({ name: "settings" })} className="text-[13px] font-semibold text-muted">Sichtbarkeit</button>
      </header>
      <div className="flex flex-col gap-7 px-4 pb-10 pt-2">
        <div className="rounded-3xl bg-ink p-5 text-bg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wider opacity-70">Level {lvl.level}</p>
              <p className="font-cond text-[44px] font-bold leading-none">{xp.toLocaleString("de-DE")}<span className="ml-1 text-[20px] opacity-70">XP</span></p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-bold uppercase tracking-wider opacity-70">{month}</p>
              <p className="font-cond text-[28px] font-bold leading-none">{mxp}</p>
              <p className="text-[11.5px] opacity-70">Platz {myRank} {board === "local" ? "lokal" : "unter Freunden"}</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-bg/15"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(lvl.into / lvl.need) * 100}%` }} /></div>
          <p className="mt-1.5 text-[12px] opacity-70 tnum">{lvl.need - lvl.into} XP bis Level {lvl.level + 1}</p>
        </div>

        {pending.length > 0 && (
          <button onClick={() => nav.push({ name: "activity", id: pending[0].id })} className="flex items-center gap-3 rounded-2xl border border-good/30 bg-good/10 p-3.5 text-left text-[13.5px]">
            <CheckCircle2 size={20} className="shrink-0 text-good" /><span className="flex-1"><b>{pending.length} Bestätigung{pending.length > 1 ? "en" : ""} offen.</b> Punkte gibt es erst, wenn alle Seiten bestätigt haben.</span>
          </button>
        )}

        <Section title={`${month}-Liga`}>
          <Segmented label="Rangliste" value={board} onChange={setBoard} options={[{ value: "local", label: <><Users size={14} /> {LIVE ? "Deine Stadt" : "Ruhrgebiet"}</> }, { value: "friends", label: "Trainingspartner" }]} />
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((r, i) => {
              const isMe = r.id === me.id;
              return (
                <li key={r.id} className={cx("flex items-center gap-3 px-3.5 py-2.5", isMe && "bg-accent/10")}>
                  <span className={cx("w-6 text-center font-cond text-[18px] font-bold tnum", i < 3 ? "text-accent" : "text-muted")}>{i + 1}</span>
                  <Avatar user={r.user} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{isMe ? `${r.user.name} (du)` : r.user.name}</span>
                  <span className="font-cond text-[17px] font-bold tnum">{r.xp}</span>
                </li>
              );
            })}
          </ol>
          {rows.length === 1 && board === "friends" && <p className="text-[13px] text-muted">Trainingspartner sind Personen, mit denen du eine bestätigte Aktivität hattest.</p>}
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><EyeOff size={14} />
            {state.league.visibility === "private" ? "Du bist für andere unsichtbar und siehst nur deine eigene Position." : state.league.visibility === "friends" ? "Nur deine Trainingspartner sehen dich in der Rangliste." : "Du erscheinst in der lokalen Rangliste."}
          </p>
        </Section>

        <Section title="Abzeichen"><BadgeGrid badges={badges} /></Section>
        {Events}

        <Section title="Punkteverlauf">
          {ledger.length === 0 ? <p className="text-[13.5px] text-muted">Noch keine Punkte. Mach bei einer Aktivität mit und bestätige danach deine Teilnahme.</p> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {ledger.map((e) => (
                <li key={e.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{e.type === "attend" ? "Teilnahme" : e.type === "host" ? "Organisiert" : "Neue Gruppe"}</span><span className="block truncate text-[12px] text-muted">{e.title} · {fmtDay(e.at)}{e.note && ` · ${e.note}`}</span></span>
                  <span className={cx("font-cond text-[17px] font-bold tnum", e.xp ? "text-good" : "text-muted")}>+{e.xp}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Principles />
      </div>
    </div>
  );
}

function Rule({ xp, text }: { xp: number; text: string }) {
  return <li className="flex items-center gap-3"><span className="w-14 rounded-full bg-accent/20 py-0.5 text-center font-cond text-[15px] font-bold text-accent">+{xp}</span><span className="opacity-90">{text}</span></li>;
}

function Principles() {
  return (
    <Section title="Fair Play">
      <ul className="flex flex-col gap-3 text-[13.5px]">
        <li className="flex gap-3"><Scale size={18} className="shrink-0 text-muted" /><span>Keine Punkte für Geschwindigkeit, Gewichtsverlust oder extreme Belastung. Ein lockerer 4-km-Lauf zählt genauso wie ein langer Lauf.</span></li>
        <li className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-muted" /><span>Teilnahme zählt nur, wenn du und der Gastgeber sie bestätigen. Organisieren zählt ab {XP_RULES.hostMinConfirmed} bestätigten Teilnehmenden. Max. {XP_RULES.dailyCap} punktende Aktivitäten pro Tag, jede Aktivität nur einmal.</span></li>
        <li className="flex gap-3"><EyeOff size={18} className="shrink-0 text-muted" /><span>Du bestimmst, wer dich in Ranglisten sieht. Ohne Liga hast du keine Nachteile.</span></li>
      </ul>
    </Section>
  );
}
