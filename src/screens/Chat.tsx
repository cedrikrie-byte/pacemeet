import { useEffect, useRef, useState } from "react";
import { Lock, Send } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Avatar, Button, DemoTag, Empty, TopBar, cx } from "../components/ui";
import { fmtDay, fmtTime } from "../lib/format";
import { LIVE } from "../config/backend";
import { isMember } from "../lib/activity";

export function Chat({ id }: { id: string }) {
  const { state, api } = useApp();
  const nav = useNav();
  const a = state.activities.find((x) => x.id === id);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [a?.messages.length]);
  if (!a) return null;
  const member = isMember(state, a);
  const people = [a.hostId, ...a.participants].length;
  const hiddenCount = a.messages.filter((m) => state.blocked.includes(m.userId)).length;

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    api.sendMessage(a!.id, t); setText("");
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar onBack={nav.back} title={a.title} sub={`${people} Personen · ${fmtDay(a.startsAt)}, ${fmtTime(a.startsAt)}`}
        right={<button onClick={() => nav.push({ name: "activity", id: a.id })} className="mr-2 text-[13px] font-semibold text-accent">Details</button>} />
      {!member ? (
        <div className="p-4"><Empty icon={<Lock size={22} />} title="Nur für Teilnehmende" text="Melde dich an, um mit der Gruppe zu schreiben." action={<Button size="sm" onClick={() => nav.replace({ name: "activity", id: a.id })}>Zur Aktivität</Button>} /></div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-2.5 px-4 pb-28 pt-4">
            <p className="mx-auto flex max-w-[34ch] flex-col items-center gap-1.5 rounded-xl bg-raised px-3 py-2 text-center text-[12px] text-muted">
              <span>Nur bestätigte Teilnehmende sehen diesen Chat. Teile keine privaten Adressen.</span>
              {!LIVE && <DemoTag>Antworten anderer simuliert</DemoTag>}
            </p>
            {a.messages.filter((m) => !state.blocked.includes(m.userId)).map((m, i, arr) => {
              if (m.system) return <p key={m.id} className="my-1 text-center text-[12px] font-medium text-muted">{m.text}</p>;
              const mine = m.userId === state.meId;
              const u = state.users[m.userId];
              const prev = arr[i - 1];
              const grouped = prev && prev.userId === m.userId && !prev.system;
              return (
                <div key={m.id} className={cx("flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine && <span className="w-7 shrink-0">{!grouped && <button onClick={() => nav.push({ name: "user", id: u.id })} aria-label={`Profil von ${u.name}`}><Avatar user={u} size={28} /></button>}</span>}
                  <div className={cx("max-w-[78%] rounded-[18px] px-3.5 py-2", mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface border border-line")}>
                    {!mine && !grouped && <p className="mb-0.5 text-[11.5px] font-bold" style={{ color: `hsl(${u.hue} 55% 45%)` }}>{u.name}{u.id === a.hostId && " · Gastgeber:in"}</p>}
                    <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">{m.text}</p>
                    <p className={cx("mt-0.5 text-right text-[10.5px] tnum", mine ? "opacity-75" : "text-muted")}>{fmtTime(m.at)}</p>
                  </div>
                </div>
              );
            })}
            {hiddenCount > 0 && <p className="text-center text-[12px] text-muted">{hiddenCount} Nachricht(en) von blockierten Personen ausgeblendet</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="absolute inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md">
            <label htmlFor="chat-input" className="sr-only">Nachricht</label>
            <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht an die Gruppe" autoComplete="off" maxLength={500}
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-[15px] outline-none focus:border-accent" />
            <button type="submit" disabled={!text.trim()} aria-label="Senden" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-40"><Send size={18} /></button>
          </form>
        </>
      )}
    </div>
  );
}
