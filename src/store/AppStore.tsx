import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Activity, AppState, Group, GroupMember, LeagueSettings, Notif, NotifKind, SeriesRule, Settings, User } from "../types";
import { seriesDates } from "../lib/series";
import { clearState, loadState, saveState } from "../lib/storage";
import { buildDemoState } from "../data/demo";
import { uid } from "../lib/format";
import { LIVE } from "../config/backend";
import { buildLiveState, makeLiveApi, startLive } from "./liveApi";
import { knownCityPos } from "../lib/location";

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
  const notifyKey: Record<NotifKind, keyof Settings["notify"] | null> = { change: "changes", cancel: "changes", join: "joins", chat: "chat", reminder: "reminders", system: null, nearby: null, group: "groups" };
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
      set((s) => ({ ...s, onboarded: true, users: { ...s.users, [s.meId]: { ...s.users[s.meId], ...profile } }, locationCity: profile.city ?? s.locationCity, locationPos: profile.cityPos ?? s.locationPos }));
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
    setSettings(p: Partial<Settings>) { set((s) => ({ ...s, settings: { ...s.settings, ...p, notify: { ...s.settings.notify, ...(p.notify || {}) }, alerts: { ...s.settings.alerts, ...(p.alerts || {}) } } })); },
    setLeague(p: Partial<LeagueSettings>) { set((s) => ({ ...s, league: { ...s.league, ...p } })); },
    setLocation(city: string, pos?: [number, number]) { set((s) => ({ ...s, locationCity: city, locationPos: pos ?? knownCityPos(city) ?? undefined })); },
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
    /** Serie anlegen (Vorlage + Rhythmus); gibt die ID des ersten Termins zurück. */
    async createSeries(template: Activity, rule: SeriesRule): Promise<string | null> {
      const seriesId = uid();
      const dates = seriesDates(rule, rule.maxCount || rule.untilDate ? 60 : 6);
      const list: Activity[] = dates.map((d) => ({ ...template, id: uid(), seriesId, seriesRule: { ...rule, active: true }, startsAt: d.toISOString(), messages: [] }));
      set((s) => ({ ...s, activities: [...list, ...s.activities] }));
      toast(rule.maxCount || rule.untilDate ? `Serie mit ${list.length} Terminen veröffentlicht` : "Serie veröffentlicht. Neue Termine kommen automatisch dazu.", "good");
      return list[0]?.id ?? null;
    },
    async seriesInfo(_seriesId: string): Promise<SeriesRule | null> { return null; },
    /** Alle kommenden Termine einer Serie ändern (Demo: wie auf dem Server) */
    async updateSeries(seriesId: string, template: Partial<Activity>, rule: SeriesRule): Promise<string | null> {
      const s0 = get(); const t = Date.now();
      const sample = s0.activities.find((a) => a.seriesId === seriesId);
      if (!sample) return null;
      const dates = seriesDates(rule, rule.maxCount || rule.untilDate ? 60 : 6);
      const key = (d: Date) => d.toDateString();
      const wanted = new Map(dates.map((d) => [key(d), d]));
      const upcoming = s0.activities.filter((a) => a.seriesId === seriesId && a.status === "open" && new Date(a.startsAt).getTime() > t);
      const kept = new Set<string>();
      const changed = upcoming.map((a) => {
        const d = wanted.get(new Date(a.startsAt).toDateString());
        if (!d) return { ...a, status: "cancelled" as const, messages: [...a.messages, sysMsg("Die Aktivität wurde abgesagt")] };
        kept.add(key(d));
        return { ...a, ...template, id: a.id, startsAt: d.toISOString(), seriesRule: { ...rule, active: true }, maxParticipants: Math.max(template.maxParticipants ?? a.maxParticipants, a.participants.length + 1), messages: [...a.messages, sysMsg("Geändert: Serie aktualisiert")] };
      });
      const fresh: Activity[] = dates.filter((d) => !kept.has(key(d))).map((d) => ({ ...sample, ...template, id: uid(), seriesId, seriesRule: { ...rule, active: true }, startsAt: d.toISOString(), participants: [], selfConfirmed: [], hostConfirmed: [], messages: [], status: "open" }));
      const byId = new Map(changed.map((a) => [a.id, a]));
      set((s) => ({ ...s, activities: [...s.activities.map((a) => byId.get(a.id) ?? (a.seriesId === seriesId ? { ...a, seriesRule: { ...rule, active: true } } : a)), ...fresh] }));
      toast("Serie gespeichert. Teilnehmende wurden informiert.", "good");
      const next = [...changed.filter((a) => a.status === "open"), ...fresh].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return next?.id ?? null;
    },

    // --- Gruppen (Demo) ---
    async createGroup(g: Partial<Group>): Promise<string | null> {
      const s0 = get(); const me = s0.users[s0.meId];
      const id = uid();
      const group: Group = { id, name: g.name ?? "", kind: g.kind ?? "club", description: g.description ?? "", city: g.city ?? me.city, cityPos: g.cityPos, sports: g.sports ?? me.sports, joinMode: g.joinMode ?? "open", listed: g.listed ?? true, postMode: g.postMode ?? "members", hue: g.hue ?? 20, website: g.website, memberCount: 1, ownerId: s0.meId, ownerName: me.name, myRole: "owner", myStatus: "active" };
      set((s) => ({ ...s, groups: [group, ...s.groups], groupMembers: { ...s.groupMembers, [id]: [{ userId: s.meId, name: me.name, photo: me.photo, role: "owner", status: "active", joinedAt: now() }] } }));
      toast("Gruppe gegründet", "good");
      return id;
    },
    async updateGroup(id: string, patch: Partial<Group>): Promise<boolean> {
      set((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
      toast("Gruppe gespeichert", "good");
      return true;
    },
    async deleteGroup(id: string): Promise<boolean> {
      const t = Date.now();
      set((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id), activities: s.activities.map((a) => a.groupId === id && a.visibility === "group" && a.status === "open" && new Date(a.startsAt).getTime() > t ? { ...a, status: "cancelled" as const } : a) }));
      toast("Gruppe gelöscht", "warn");
      return true;
    },
    async joinGroup(id: string): Promise<void> {
      const s0 = get(); const me = s0.users[s0.meId]; const g = s0.groups.find((x) => x.id === id); if (!g) return;
      const status = g.joinMode === "open" ? "active" as const : "pending" as const;
      const m: GroupMember = { userId: s0.meId, name: me.name, photo: me.photo, role: "member", status, joinedAt: now() };
      set((s) => ({ ...s, groups: s.groups.map((x) => x.id === id ? { ...x, myRole: "member", myStatus: status, memberCount: x.memberCount + (status === "active" ? 1 : 0) } : x), groupMembers: { ...s.groupMembers, [id]: [...(s.groupMembers[id] ?? []).filter((y) => y.userId !== s.meId), m] } }));
      if (status === "active") { toast(`Willkommen bei ${g.name}!`, "good"); return; }
      toast("Anfrage gesendet. Die Admins entscheiden.", "good");
      later(3000, () => {
        set((s) => ({ ...s, groups: s.groups.map((x) => x.id === id && x.myStatus === "pending" ? { ...x, myStatus: "active", memberCount: x.memberCount + 1 } : x), groupMembers: { ...s.groupMembers, [id]: (s.groupMembers[id] ?? []).map((y) => y.userId === s.meId ? { ...y, status: "active" } : y) } }));
        notify("group", `Du bist jetzt Mitglied in „${g.name}“.`);
      });
    },
    async leaveGroup(id: string): Promise<void> {
      set((s) => ({ ...s, groups: s.groups.map((x) => x.id === id ? { ...x, myRole: undefined, myStatus: undefined, memberCount: Math.max(0, x.memberCount - (x.myStatus === "active" ? 1 : 0)) } : x), groupMembers: { ...s.groupMembers, [id]: (s.groupMembers[id] ?? []).filter((y) => y.userId !== s.meId) } }));
      toast("Du hast die Gruppe verlassen.");
    },
    async loadGroup(_id: string): Promise<void> {},
    async ensureGroup(id: string): Promise<boolean> { return get().groups.some((g) => g.id === id); },
    async manageMember(groupId: string, userId: string, action: "approve" | "decline" | "remove" | "make_admin" | "make_member"): Promise<void> {
      set((s) => {
        let list = s.groupMembers[groupId] ?? [];
        if (action === "approve") list = list.map((m) => m.userId === userId ? { ...m, status: "active" } : m);
        else if (action === "decline" || action === "remove") list = list.filter((m) => m.userId !== userId);
        else list = list.map((m) => m.userId === userId ? { ...m, role: action === "make_admin" ? "admin" : "member" } : m);
        const count = list.filter((m) => m.status === "active").length;
        return { ...s, groupMembers: { ...s.groupMembers, [groupId]: list }, groups: s.groups.map((g) => g.id === groupId ? { ...g, memberCount: count } : g) };
      });
      toast(action === "approve" ? "Aufgenommen" : action === "make_admin" ? "Ist jetzt Admin" : action === "make_member" ? "Ist jetzt Mitglied" : "Entfernt", "good");
    },
    cancelSeries(seriesId: string) {
      const t = Date.now();
      set((s) => ({ ...s, activities: s.activities.map((a) => a.seriesId === seriesId && a.hostId === s.meId && a.status === "open" && new Date(a.startsAt).getTime() > t
        ? { ...a, status: "cancelled" as const, messages: [...a.messages, sysMsg("Die Aktivität wurde abgesagt")] } : a) }));
      toast("Alle kommenden Termine der Serie wurden abgesagt.", "warn");
    },
    /** Stellt sicher, dass eine (z. B. geteilte) Aktivität geladen ist. */
    async ensureActivity(id: string): Promise<boolean> { return get().activities.some((a) => a.id === id); },
    toast,
  };
}
export type Api = ReturnType<typeof makeDemoApi>;

interface Ctx { state: AppState; api: Api; me: User; toasts: Toast[]; }
export { reducer };
const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => (LIVE ? buildLiveState() : loadState()));
  const ref = useRef(state); ref.current = state;
  // Änderungen sofort im Ref sichtbar machen, damit get() direkt danach den neuen Stand liefert
  // (sonst sieht z. B. das Laden nach der Anmeldung noch keine Nutzer-ID).
  const dispatch = useCallback((a: Action) => { ref.current = reducer(ref.current, a); rawDispatch(a); }, []);
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
