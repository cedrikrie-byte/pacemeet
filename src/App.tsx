import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, Compass, Plus, Trophy, User as UserIcon } from "lucide-react";
import { AppProvider, useApp } from "./store/AppStore";
import { NavCtx, type Nav, type Screen, type Tab } from "./nav";
import { cx } from "./components/ui";
import { PrototypeInfo } from "./components/PrototypeInfo";
import { Discover, Logo } from "./screens/Discover";
import { ActivityDetail } from "./screens/ActivityDetail";
import { CreateActivity } from "./screens/CreateActivity";
import { MyActivities } from "./screens/MyActivities";
import { Chat } from "./screens/Chat";
import { Profile, UserProfile } from "./screens/Profile";
import { EditProfile } from "./screens/EditProfile";
import { League } from "./screens/League";
import { InfoScreen, Settings } from "./screens/Settings";
import { Notifications } from "./screens/Notifications";
import { Onboarding } from "./screens/Onboarding";
import { APP } from "./config/app";
import { setLocale } from "./lib/format";
import { LIVE } from "./config/backend";
import { LegalScreen } from "./screens/Legal";
import { Moderation } from "./screens/Moderation";
import { PublicActivityScreen } from "./screens/PublicActivity";
import { GroupDetail } from "./screens/GroupDetail";
import { PublicGroupScreen } from "./screens/PublicGroup";
import { GroupEdit } from "./screens/GroupEdit";

/** Geteilter Link: …/#a-<id> (Aktivität) oder …/#g-<id> (Gruppe) */
const readShare = () => /^#a-([0-9a-zA-Z-]{6,})$/.exec(window.location.hash)?.[1] ?? null;
const readGroupShare = () => /^#g-([0-9a-zA-Z-]{2,})$/.exec(window.location.hash)?.[1] ?? null;
const clearHash = () => { try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* ignorieren */ } };

const TABS: Tab[] = ["discover", "mine", "league", "profile"];

function Shell() {
  const { state, toasts, api } = useApp();
  const [stack, setStack] = useState<Screen[]>([{ name: "discover" }]);
  const scroller = useRef<HTMLDivElement>(null);
  const current = stack[stack.length - 1];
  setLocale(state.settings.language);

  const nav: Nav = useMemo(() => ({
    current,
    push: (s) => setStack((st) => [...st, s]),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    tab: (t) => setStack([{ name: t } as Screen]),
    replace: (s) => setStack((st) => [...st.slice(0, -1), s]),
  }), [current]);

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [stack.length, current]);

  // Farbschema
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    m?.addEventListener("change", h);
    return () => m?.removeEventListener("change", h);
  }, []);
  const hostTheme = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  const dark = state.settings.theme === "dark" || (state.settings.theme === "system" && (hostTheme ? hostTheme === "dark" : sysDark));
  const modeCls = state.settings.theme === "system" ? (hostTheme ? (dark ? "mode-dark" : "mode-light") : "") : dark ? "mode-dark" : "mode-light";

  const ready = LIVE ? state.auth === "ready" && !!state.users[state.meId] : state.onboarded;

  // Geteilte Aktivität öffnen (beim Start, bei Push-Klick oder Linkwechsel)
  const [shareId, setShareId] = useState<string | null>(readShare);
  const [wantsLogin, setWantsLogin] = useState(false);
  useEffect(() => {
    const h = () => setShareId(readShare());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!ready || !shareId) return;
    let on = true;
    void api.ensureActivity(shareId).then((found) => {
      if (!on) return;
      if (found) nav.push({ name: "activity", id: shareId });
      else api.toast("Diese Aktivität gibt es nicht mehr.", "warn");
      setShareId(null); setWantsLogin(false); clearHash();
    });
    return () => { on = false; };
  }, [ready, shareId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Einladungslink zu einer Gruppe: nach dem Laden öffnen
  const [groupShare, setGroupShare] = useState<string | null>(readGroupShare);
  const autoJoin = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => {
    const h = () => setGroupShare(readGroupShare());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!ready || !groupShare) return;
    const gid = groupShare;
    nav.push({ name: "group", id: gid });
    setGroupShare(null); clearHash();
    // „Anmelden und beitreten“ aus der Vorschau: direkt beitreten bzw. Anfrage senden
    if (autoJoin.current) {
      autoJoin.current = false;
      void api.ensureGroup(gid).then((found) => { if (found && !stateRef.current.groups.find((g) => g.id === gid)?.myStatus) void api.joinGroup(gid); });
    }
  }, [ready, groupShare]); // eslint-disable-line react-hooks/exhaustive-deps
  const isTab = TABS.includes(current.name as Tab);
  const activeTab = isTab ? (current.name as Tab) : null;
  const unconfirmed = state.activities.filter((a) => a.status === "open" && (a.participants.includes(state.meId)) && !a.selfConfirmed.includes(state.meId) && new Date(a.startsAt).getTime() < Date.now() - 3 * 3600e3).length;

  const screen = (() => {
    switch (current.name) {
      case "discover": return <Discover />;
      case "mine": return <MyActivities />;
      case "league": return <League />;
      case "profile": return <Profile />;
      case "create": return <CreateActivity key={(current.editId ?? "new" + (current.groupId ?? "")) + (current.series ? "-serie" : "")} editId={current.editId} groupId={current.groupId} series={current.series} />;
      case "group": return <GroupDetail key={current.id} id={current.id} />;
      case "groupEdit": return <GroupEdit key={current.id ?? "new"} id={current.id} />;
      case "activity": return <ActivityDetail key={current.id} id={current.id} />;
      case "chat": return <Chat id={current.id} />;
      case "user": return <UserProfile id={current.id} />;
      case "editProfile": return <EditProfile />;
      case "settings": return <Settings />;
      case "notifications": return <Notifications />;
      case "info": return <InfoScreen />;
      case "moderation": return <Moderation />;
      case "legal": return <LegalScreen doc={current.doc} />;
    }
  })();

  return (
    <div className={cx(modeCls, "h-full bg-bg text-ink")}>
      <div className="mx-auto flex h-full max-w-[1120px] justify-center gap-10 lg:px-6 lg:py-6">
        <aside className={cx("hidden w-[380px] shrink-0 overflow-y-auto py-2", !LIVE && "lg:block")}>
          <div className="flex items-center gap-2"><Logo size={34} /><span className="font-display text-[26px] font-black">{APP.name}</span></div>
          <p className="mt-2 font-display text-[20px] font-extrabold text-muted">{APP.motto}</p>
          <p className="mt-4 text-[14px] leading-relaxed">Interaktiver Prototyp einer Social-Sport-App für spontane und geplante gemeinsame Läufe und Radtouren. Alles rechts ist klickbar.</p>
          <div className="mt-6 rounded-2xl border border-line bg-surface p-5"><PrototypeInfo compact /></div>
        </aside>

        <div id="app-frame" className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-bg lg:rounded-[32px] lg:border lg:border-line lg:shadow-[0_30px_80px_-40px_rgb(0_0_0/.45)]">
          <NavCtx.Provider value={nav}>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {LIVE && state.auth === "loading" ? <Splash />
                : LIVE && state.auth === "error" ? <LoadProblem message={state.liveError} />
                : !ready ? (current.name === "legal" ? screen
                  : LIVE && shareId && !wantsLogin && state.auth === "signedOut"
                    ? <PublicActivityScreen id={shareId} onJoin={() => setWantsLogin(true)} onDismiss={() => { setShareId(null); clearHash(); }} />
                    : LIVE && groupShare && !wantsLogin && state.auth === "signedOut"
                    ? <PublicGroupScreen id={groupShare} onJoin={() => { autoJoin.current = true; setWantsLogin(true); }} onDismiss={() => { setGroupShare(null); clearHash(); }} />
                    : <Onboarding />)
                : screen}
            </div>
            {ready && isTab && (
              <nav aria-label="Hauptnavigation" className="relative z-30 grid grid-cols-5 border-t border-line bg-surface/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md">
                <TabBtn label="Entdecken" icon={<Compass size={22} />} active={activeTab === "discover"} onClick={() => nav.tab("discover")} />
                <TabBtn label="Meine" icon={<CalendarCheck size={22} />} active={activeTab === "mine"} onClick={() => nav.tab("mine")} dot={unconfirmed > 0} />
                <div className="grid place-items-center">
                  <button aria-label="Aktivität erstellen" onClick={() => nav.push({ name: "create" })} className="grid h-12 w-12 -translate-y-1 place-items-center rounded-2xl bg-accent text-accent-ink shadow-[0_8px_20px_-6px_rgb(var(--accent)/.7)] transition active:scale-95"><Plus size={26} strokeWidth={2.6} /></button>
                </div>
                <TabBtn label="Liga" icon={<Trophy size={21} />} active={activeTab === "league"} onClick={() => nav.tab("league")} />
                <TabBtn label="Profil" icon={<UserIcon size={22} />} active={activeTab === "profile"} onClick={() => nav.tab("profile")} />
              </nav>
            )}
            <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
              {toasts.map((t) => (
                <div key={t.id} className={cx("sheet-in max-w-full rounded-full px-4 py-2.5 text-[13.5px] font-semibold shadow-lg", t.tone === "good" ? "bg-ink text-bg" : t.tone === "warn" ? "bg-warn text-white" : t.tone === "bad" ? "bg-bad text-white" : "bg-ink text-bg")}>{t.text}</div>
              ))}
            </div>
          </NavCtx.Provider>
        </div>
      </div>
    </div>
  );
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setSlow(true), 10000); return () => window.clearTimeout(t); }, []);
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex flex-col items-center gap-3 text-center text-muted">
        <Logo size={48} />
        <span className="text-[13px] font-semibold">Wird geladen …</span>
        {slow && (<>
          <p className="mt-2 max-w-[280px] text-[13px]">Das dauert länger als gewohnt. Prüf deine Verbindung oder lade neu.</p>
          <RecoveryButtons />
        </>)}
      </div>
    </div>
  );
}

function LoadProblem({ message }: { message?: string | null }) {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={48} />
        <h2 className="font-display text-[18px] font-extrabold">Laden hat nicht geklappt</h2>
        <p className="max-w-[300px] text-[13.5px] text-muted">{message || "Die Verbindung zum Server ist abgebrochen."} Lade neu – deine Anmeldung bleibt erhalten.</p>
        <RecoveryButtons />
      </div>
    </div>
  );
}

function RecoveryButtons() {
  const { api } = useApp();
  return (
    <div className="mt-2 flex gap-2">
      <button onClick={() => window.location.reload()} className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-bold text-accent-ink">Neu laden</button>
      <button onClick={() => { void Promise.resolve(api.signOut()).catch(() => undefined).finally(() => window.location.reload()); }} className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold">Abmelden</button>
    </div>
  );
}

function TabBtn({ label, icon, active, onClick, dot }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void; dot?: boolean }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition", active ? "text-ink" : "text-muted")}>
      {icon}{label}
      {dot && <span className="absolute right-[30%] top-1 h-2 w-2 rounded-full bg-good" />}
      {active && <span className="absolute -top-1.5 h-[3px] w-6 rounded-full bg-accent" />}
    </button>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
