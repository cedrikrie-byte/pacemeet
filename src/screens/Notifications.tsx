import { Bell, CalendarClock, CheckCircle2, MessageCircle, UserPlus, XCircle } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Button, DemoTag, Empty, TopBar, cx } from "../components/ui";
import type { NotifKind } from "../types";
import { fmtAgo } from "../lib/format";
import { LIVE } from "../config/backend";

const ICON: Record<NotifKind, React.ReactNode> = {
  change: <CalendarClock size={18} />, cancel: <XCircle size={18} />, join: <UserPlus size={18} />,
  chat: <MessageCircle size={18} />, reminder: <CheckCircle2 size={18} />, system: <Bell size={18} />,
};

export function Notifications() {
  const { state, api } = useApp();
  const nav = useNav();
  const list = state.notifications;
  return (
    <div className="screen-in pb-10">
      <TopBar onBack={nav.back} title="Benachrichtigungen" right={list.some((n) => !n.read) ? <Button size="sm" variant="ghost" onClick={api.markAllRead}>Alle gelesen</Button> : undefined} />
      <div className="flex flex-col gap-2 px-4 pt-4">
        {LIVE
          ? <p className="mb-1 text-[12.5px] text-muted">Neue Meldungen erscheinen sofort. Damit sie auch bei geschlossener App ankommen, schalte <button className="font-semibold text-accent" onClick={() => nav.push({ name: "settings" })}>Push in den Einstellungen</button> ein.</p>
          : <p className="mb-1 flex items-center gap-2 text-[12.5px] text-muted"><DemoTag>Push simuliert</DemoTag> In der echten App kommen diese als Push-Nachricht.</p>}
        {list.length === 0 ? <Empty icon={<Bell size={22} />} title="Alles ruhig" text="Hier erscheinen Änderungen, Absagen und neue Nachrichten." /> : list.map((n) => (
          <button key={n.id} onClick={async () => { api.markRead(n.id); if (n.activityId && await api.ensureActivity(n.activityId)) nav.push({ name: "activity", id: n.activityId }); }}
            className={cx("flex items-start gap-3 rounded-2xl border p-3.5 text-left transition", n.read ? "border-line bg-surface" : "border-accent/30 bg-accent/5")}>
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", n.kind === "cancel" ? "bg-bad/10 text-bad" : n.kind === "reminder" ? "bg-good/12 text-good" : "bg-raised text-ink")}>{ICON[n.kind]}</span>
            <span className="min-w-0 flex-1"><span className="block text-[14px] leading-snug">{n.text}</span><span className="mt-0.5 block text-[12px] text-muted">{fmtAgo(n.at)}</span></span>
            {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}
