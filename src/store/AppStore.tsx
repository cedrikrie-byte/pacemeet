import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Activity, AppState, LeagueSettings, Notif, NotifKind, Settings, User } from "../types";
import { clearState, loadState, saveState } from "../lib/storage";
import { buildDemoState } from "../data/demo";
import { uid } from "../lib/format";
import { LIVE } from "../config/backend";
import { buildLiveState, makeLiveApi, startLive } from "./liveApi";

export type Action =
  | { type: "set"; fn: (s: AppState) => AppState }
  | { type: "replace"; state: AppState };

function reducer(s: AppState, a: Action): AppState {
  if (a.type === "replace") return a.state;
  return a.fn(s);
}

const mapAct = (s: AppState, id: string, fn: (a: Activity) => Activity): AppState => ({
  ...s, activities: s.activities.map((a) => (a.id === id ? fn(a) : a)),
});
const now = () => new Date().toISOString();

const REPLIES = [
  "Super, dann bis gleich!",
  "Klingt gut 👍",
  "Ich bin etwa 5 Minuten vorher da.",
  "Perfekt, freue mich!",
  "Gute Frage. Ich denke, wir starten pünktlich.",
];

export interface Toast { id: string; text: string; tone?: "good" | "warn" | "bad" }

export type ToastFn = (t: string, tone?: Toast["tone"]) => void;

/** Demo-Modus: alles lokal im Browser, andere Nutzer werden simuliert. */
function makeDemoApi(dispatch: React.Dispatch<Action>, get: () => AppState, toast: ToastFn) {
  const set = (fn: (s: AppState) => AppState) => dispatch({ type: "set", fn });
  const notifyKey: Record<NotifKind, keyof Settings["notify"] | null> = { change: "changes", cancel: "changes", join: "joins", chat: "chat", reminder: "reminders", system: null };
  const notify = (kind: NotifKind, text: string, activityId?: string) => set((s) => {
    const k = notifyKey[kind];
    if (k && !s.settings.notify[k]) return s;
    const n: Notif = { id: uid(), kind, text, activityId, at: now(), read: false };
    return { ...s, notifications: [n, ...s.notifications].slice(0, 60) };
  });
  const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
  const sysMsg = (text: string) => ({ id: uid(), userId: "system", text, at: now(), system: true });

  return {
    notify,
    onboard(profile: Partial<User>) {
      set((s) => ({ ...s, onboarded: true, users: { ...s.users, [s.meId]: { ...s.users[s.meId], ...profile } }, locationCity: profile.city ?? s.locationCity }));
    },
    updateProfile(p: Partial<User>) {
      set((s) => ({ ...s, users: { ...s.users, [s.meId]: { ...s.users[s.meId], ...p } } }));
      toast("Profil gespeichert", "good");
    },
    join(id: string) {
      const s0 = get(); const me = s0.users[s0.meId];
      const act = s0.activities.find((a) => a.id === id); if (!act) return;
      set((s) => mapAct(s, id, (a) => ({ ...a, participants: [...a.participants, s.meId], messages: [...a.messages, sysMsg(`${me.name} ist dabei`)] })));
      toast("Du bist dabei! Der Gruppenchat ist jetzt offen.", "good");
      later(2600, () => {
        const host = get().users[act.hostId];
        set((s) => mapAct(s, id, (a) => a.participants.includes(s.meId) ? { ...a, messages: [...a.messages, { id: uid(), userId: act.hostId, text: `Willkommen, ${me.name.split(" ")[0]}! Schön, dass du mitkommst.`, at: now() }] } : a));
        notify("chat", `${host.name} hat in „${act.title}“ geschrieben.`, id);
      });
    },
    leave(id: string, late: boolean) {
      const s0 = get(); const me = s0.users[s0.meId];
      set((s) => {
        let next = mapAct(s, id, (a) => ({ ...a, participants: a.participants.filter((p) => p !== s.meId), messages: [...a.messages, sysMsg(`${me.name} hat abgesagt`)] }));
        if (late) next = { ...next, users: { ...next.users, [s.meId]: { ...me, reliability: { ...me.reliability, lateCancels: me.reliability.lateCancels + 1 } } } };
        return next;
      });
      toast("Teilnahme abgesagt. Die Gruppe wurde informiert.");
    },
    async create(a: Activity): Promise<string | null> {
      set((s) => ({ ...s, activities: [a, ...s.activities] }));
      toast("Aktivität veröffentlicht", "good");
      later(6000, () => {
        const s = get(); const exists = s.activities.find((x) => x.id === a.id);
        if (!exists || exists.status !== "open") return;
        const cand = Object.values(s.users).find((u) => u.id !== s.meId && u.kind !== "club" && u.sports.includes(a.sport) && !s.blocked.includes(u.id) && !exists.participants.includes(u.id));
        if (!cand) return;
        set((st) => mapAct(st, a.id, (x) => x.participants.length + 1 < x.maxParticipants ? { ...x, participants: [...x.participants, cand.id], messages: [...x.messages, sysMsg(`${cand.name} ist dabei`)] } : x));
        notify("join", `${cand.name} nimmt an „${a.title}“ teil.`, a.id);
      });
      return a.id;
    },
    async update(id: string, patch: Partial<Activity>, summary: string): Promise<boolean> {
      set((s) => mapAct(s, id, (a) => ({ ...a, ...patch, updatedAt: now(), messages: summary ? [...a.messages, sysMsg(`Geändert: ${summary}`)] : a.messages })));
      toast(summary ? "Gespeichert. Alle Teilnehmenden wurden benachrichtigt." : "Gespeichert", "good");
      return true;
    },
    cancelActivity(id: string) {
      set((s) => mapAct(s, id, (a) => ({ ...a, status: "cancelled", messages: [...a.messages, sysMsg("Die Aktivität wurde abgesagt")] })));
      toast("Aktivität abgesagt. Alle Teilnehmenden wurden benachrichtigt.", "warn");
    },
    sendMessage(id: string, text: string) {
      const s0 = get();
      set((s) => mapAct(s, id, (a) => ({ ...a, messages: [...a.messages, { id: uid(), userId: s.meId, text, at: now() }] })));
      const act = s0.activities.find((a) => a.id === id); if (!act) return;
      const others = [act.hostId, ...act.participants].filter((p) => p !== s0.meId && !s0.blocked.includes(p) && s0.users[p]?.kind !== "club");
      if (!others.length) return;
      const who = others[Math.floor(Math.random() * others.length)];
      const reply = text.includes("?") ? REPLIES[4] : REPLIES[Math.floor(Math.random() * 4)];
      later(2200, () => set((s) => mapAct(s, id, (a) => ({ ...a, messages: [...a.messages, { id: uid(), userId: who, text: reply, at: now() }] }))));
    },
    confirmSelf(id: string) {
      set((s) => mapAct(s, id, (a) => ({ ...a, selfConfirmed: [...new Set([...a.selfConfirmed, s.meId])] })));
      toast("Teilnahme bestätigt. Danke!", "good");
      const act = get().activities.find((a) => a.id === id);
      if (act && !act.hostConfirmed.includes(get().meId)) {
        later(1800, () => set((s) => mapAct(s, id, (a) => ({ ...a, hostConfirmed: [...new Set([...a.hostConfirmed, s.meId])] }))));
      }
    },
    hostConfirm(id: string, ids: string[]) {
      set((s) => mapAct(s, id, (a) => ({ ...a, hostConfirmed: ids })));
      toast("Anwesenheit gespeichert", "good");
    },
    markAllRead() { set((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) })); },
    markRead(nid: string) { set((s) => ({ ...s, notifications: s.notifications.map((n) => n.id === nid ? { ...n, read: true } : n) })); },
    block(userId: string) { set((s) => ({ ...s, blocked: [...new Set([...s.blocked, userId])] })); toast("Blockiert. Du siehst diese Person nicht mehr."); },
    unblock(userId: string) { set((s) => ({ ...s, blocked: s.blocked.filter((b) => b !== userId) })); toast("Blockierung aufgehoben"); },
    report(userId: string, reason: string) { set((s) => ({ ...s, reports: [...s.reports, { userId, reason, at: now() }] })); toast("Meldung gesendet. Unser Team prüft sie.", "good"); },
    setSettings(p: Partial<Settings>) { set((s) => ({ ...s, settings: { ...s.settings, ...p, notify: { ...s.settings.notify, ...(p.notify || {}) } } })); },
    setLeague(p: Partial<LeagueSettings>) { set((s) => ({ ...s, league: { ...s.league, ...p } })); },
    setLocation(city: string) { set((s) => ({ ...s, locationCity: city })); },
    setRadius(km: number) { set((s) => ({ ...s, radiusKm: km })); },
    reset() { clearState(); dispatch({ type: "replace", state: buildDemoState() }); toast("Demo zurückgesetzt"); },
    // Im Demo-Modus ohne Funktion (nur Live-Modus)
    async reload() {},
    async sendCode(_email: string) {},
    async verifyCode(_email: string, _code: string) {},
    async signOut() {},
    async deleteAccount() { this.reset(); },
    async exportData(): Promise<unknown> { const s = get(); return { hinweis: "Demo-Daten", profil: s.users[s.meId], aktivitaeten: s.activities.filter((a) => a.hostId === s.meId || a.participants.includes(s.meId)) }; },
    async loadLeague() {},
    async loadUser(_id: string) {},
  };
}
export type Api = ReturnType<typeof makeDemoApi>;

interface Ctx { state: AppState; api: Api; me: User; toasts: Toast[]; }
export { reducer };
const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => (LIVE ? buildLiveState() : loadState()));
  const ref = useRef(state); ref.current = state;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((text: string, tone?: Toast["tone"]) => {
    const t = { id: uid(), text, tone };
    setToasts((x) => [...x, t]);
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 3200);
  }, []);
  const api: Api = useMemo(() => (LIVE ? makeLiveApi(dispatch, () => ref.current, toast) : makeDemoApi(dispatch, () => ref.current, toast)), [toast]);
  useEffect(() => { if (!LIVE) saveState(state); }, [state]);
  useEffect(() => (LIVE ? startLive(api, dispatch, () => ref.current, toast) : undefined), [api, toast]);
  const value = useMemo(() => ({ state, api, me: state.users[state.meId], toasts }), [state, api, toasts]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("useApp außerhalb des Providers");
  return c;
}
