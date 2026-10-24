import { useState } from "react";
import { CalendarPlus, CheckCircle2, History } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { ActivityCard } from "../components/ActivityCard";
import { Button, Empty, Segmented } from "../components/ui";
import { isHost, isMember, needsMyConfirmation } from "../lib/activity";
import { hasEnded } from "../lib/xp";

export function MyActivities() {
  const { state } = useApp();
  const nav = useNav();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const mine = state.activities.filter((a) => isMember(state, a));
  const upcoming = mine.filter((a) => !hasEnded(a)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = mine.filter((a) => hasEnded(a)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const pending = past.filter((a) => needsMyConfirmation(state, a));
  const hosted = upcoming.filter((a) => isHost(state, a));
  const booked = upcoming.filter((a) => !isHost(state, a));

  return (
    <div className="screen-in">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/85 px-4 pb-3 pt-4 backdrop-blur-md">
        <h1 className="font-display text-[26px] font-black">Meine Aktivitäten</h1>
        <div className="mt-3"><Segmented label="Zeitraum" value={tab} onChange={setTab} options={[{ value: "upcoming", label: `Kommend (${upcoming.length})` }, { value: "past", label: `Vergangen (${past.length})` }]} /></div>
      </header>
      <div className="flex flex-col gap-7 px-4 pb-8 pt-4">
        {tab === "upcoming" ? (
          upcoming.length === 0 ? (
            <Empty icon={<CalendarPlus size={22} />} title="Noch nichts geplant" text="Finde eine Runde in deiner Nähe oder lade selbst ein." action={<Button size="sm" onClick={() => nav.tab("discover")}>Aktivitäten entdecken</Button>} />
          ) : (
            <>
              {hosted.length > 0 && <section className="flex flex-col gap-3"><h2 className="label">Von dir organisiert</h2>{hosted.map((a) => <ActivityCard key={a.id} a={a} compact />)}</section>}
              {booked.length > 0 && <section className="flex flex-col gap-3"><h2 className="label">Angemeldet</h2>{booked.map((a) => <ActivityCard key={a.id} a={a} compact />)}</section>}
            </>
          )
        ) : (
          <>
            {pending.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="label flex items-center gap-1.5 !text-good"><CheckCircle2 size={14} /> Bestätigung offen</h2>
                {pending.map((a) => <ActivityCard key={a.id} a={a} compact />)}
              </section>
            )}
            {past.length === 0 ? <Empty icon={<History size={22} />} title="Noch kein Verlauf" text="Hier erscheinen Aktivitäten, bei denen du dabei warst." /> : (
              <section className="flex flex-col gap-3"><h2 className="label">Verlauf</h2>{past.filter((a) => !pending.includes(a)).map((a) => <ActivityCard key={a.id} a={a} compact />)}</section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
