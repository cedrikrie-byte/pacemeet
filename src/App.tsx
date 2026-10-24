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

const TABS: Tab[] = ["discover", "mine", "league", "profile"];

function Shell() {
  const { state, toasts } = useApp();
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
  const isTab = TABS.includes(current.name as Tab);
  const activeTab = isTab ? (current.name as Tab) : null;
  const unconfirmed = state.activities.filter((a) => a.status === "open" && (a.participants.includes(state.meId)) && !a.selfConfirmed.includes(state.meId) && new Date(a.startsAt).getTime() < Date.now() - 3 * 3600e3).length;

  const screen = (() => {
    switch (current.name) {
      case "discover": return <Discover />;
      case "mine": return <MyActivities />;
      case "league": return <League />;
      case "profile": return <Profile />;
      case "create": return <CreateActivity key={current.editId ?? "new"} editId={current.editId} />;
      case "activity": return <ActivityDetail key={current.id} id={current.id} />;
      case "chat": return <Chat id={current.id} />;
      case "user": return <UserProfile id={current.id} />;
      case "editProfile": return <EditProfile />;
      case "settings": return <Settings />;
      case "notifications": return <Notifications />;
      case "info": return <InfoScreen />;
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

        <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-bg lg:rounded-[32px] lg:border lg:border-line lg:shadow-[0_30px_80px_-40px_rgb(0_0_0/.45)]">
          <NavCtx.Provider value={nav}>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {LIVE && state.auth === "loading" ? <Splash /> : !ready ? (current.name === "legal" ? screen : <Onboarding />) : screen}
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
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted"><Logo size={48} /><span className="text-[13px] font-semibold">Wird geladen …</span></div>
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
