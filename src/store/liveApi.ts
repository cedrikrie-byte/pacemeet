import { DEFAULT_ALERTS } from "../lib/alerts";
import type { Action, Api, ToastFn } from "./AppStore";
import type { Activity, AppState, Group, LeagueSettings, SeriesRule, Settings, User } from "../types";
import * as be from "../backend/supabase";
import { knownCityPos } from "../lib/location";

/** Leerer Zustand für den Live-Modus (vor der Anmeldung). */
export function buildLiveState(): AppState {
  let radius = 25, city = "", pos: [number, number] | undefined;
  try { const r = JSON.parse(localStorage.getItem("pacemeet-live-prefs") || "{}"); radius = r.radiusKm ?? radius; city = r.locationCity ?? city; pos = r.locationPos; } catch { /* ignorieren */ }
  return {
    version: 7, auth: "loading", onboarded: false, meId: "", locationCity: city, locationPos: pos, radiusKm: radius,
    users: {}, activities: [], events: [], notifications: [], blocked: [], reports: [], groups: [], groupMembers: {},
    settings: {
      theme: "system", units: "metric", language: "de-DE", profileVisibility: "participants",
      showPace: true, showHistory: false, showAwards: true,
      notify: { changes: true, chat: true, joins: true, reminders: true, groups: true },
      alerts: { ...DEFAULT_ALERTS },
    },
    league: { optIn: false, visibility: "private" },
  };
}

function savePrefs(s: AppState) {
  try { localStorage.setItem("pacemeet-live-prefs", JSON.stringify({ radiusKm: s.radiusKm, locationCity: s.locationCity, locationPos: s.locationPos })); } catch { /* ignorieren */ }
}

/** Wird von startLive gesetzt: nach der Code-Bestätigung direkt anmelden. */
let enterHook: ((uid: string, email?: string) => Promise<void>) | null = null;

/** Wird von startLive gesetzt: nach dem Anlegen des Profils Echtzeit starten. */
let afterProfile: (() => void) | null = null;

/** Live-Modus: jede Aktion geht an Supabase, danach wird neu geladen. */
export function makeLiveApi(dispatch: React.Dispatch<Action>, get: () => AppState, toast: ToastFn): Api {
  const set = (fn: (s: AppState) => AppState) => dispatch({ type: "set", fn });
  let loading: Promise<void> | null = null;
  let again = false;

  async function reload() {
    if (loading) { be.dlog("reload queued"); again = true; return loading; }
    loading = (async () => {
      const s = get();
      be.dlog("reload start", s.meId, s.auth);
      if (!s.meId) return;
      try {
        const snap = await be.loadSnapshot(s.meId, s.locationCity, s.locationPos ?? null, s.radiusKm, s.settings);
        const before = new Set(get().notifications.map((n) => n.id));
        set((cur) => ({ ...cur, ...snap, auth: "ready", onboarded: true, liveError: undefined }));
        // Neue Benachrichtigung kurz anzeigen (nicht beim ersten Laden)
        const fresh = snap.notifications.find((n) => !n.read && !before.has(n.id));
        if (before.size && fresh) toast(fresh.text);
      } catch (e) {
        const msg = be.friendly((e as Error).message);
        // Beim ersten Laden: Fehlerbildschirm mit "Erneut versuchen" statt endlosem Laden
        if (get().auth === "loading") set((cur) => ({ ...cur, auth: "error", liveError: msg }));
        else toast(msg, "bad");
      }
    })();
    try { await loading; } finally {
      loading = null;
      if (again) { again = false; await reload(); }
    }
  }

  /** Führt eine Aktion aus, zeigt Fehler verständlich an und lädt danach neu. */
  async function run<T>(fn: () => Promise<T>, ok?: string, tone: "good" | "warn" | undefined = "good"): Promise<T | null> {
    try {
      const r = await fn();
      if (ok) toast(ok, tone);
      await reload();
      return r;
    } catch (e) {
      toast(be.friendly((e as Error).message), "bad");
      return null;
    }
  }

  let settingsTimer = 0;

  const api: Api = {
    notify() { /* Benachrichtigungen erzeugt der Server */ },
    async onboard(profile: Partial<User>) {
      const s = get();
      try {
        await be.createProfile(s.meId, { ...profile, city: profile.city ?? s.locationCity }, s.settings);
        set((cur) => ({ ...cur, locationCity: profile.city ?? cur.locationCity, locationPos: profile.cityPos ?? cur.locationPos, auth: "loading" }));
        savePrefs(get());
        await reload();
        afterProfile?.();
        toast("Willkommen! Dein Profil ist angelegt.", "good");
      } catch (e) { toast(be.friendly((e as Error).message), "bad"); }
    },
    updateProfile(p: Partial<User>) {
      const s = get();
      void run(() => be.updateProfile(s.meId, { ...s.users[s.meId], ...p }), "Profil gespeichert");
    },
    join(id: string) { void run(() => be.joinActivity(id), "Du bist dabei! Der Gruppenchat ist jetzt offen."); },
    leave(id: string) { void run(() => be.leaveActivity(id), "Teilnahme abgesagt. Die Gruppe wurde informiert.", undefined); },
    async create(a: Activity) { return run(() => be.createActivity(a), "Aktivität veröffentlicht"); },
    async createSeries(template: Activity, rule: SeriesRule) {
      return run(() => be.createSeries(template, rule), rule.maxCount || rule.untilDate ? "Serie veröffentlicht" : "Serie veröffentlicht. Neue Termine kommen automatisch dazu.");
    },
    async updateSeries(seriesId: string, template: Partial<Activity>, rule: SeriesRule) {
      const id = await run(() => be.updateSeries(seriesId, template, rule), "Serie gespeichert. Teilnehmende wurden informiert.");
      if (id) set((s) => ({ ...s, activities: s.activities.map((a) => (a.seriesId === seriesId ? { ...a, seriesRule: { ...rule, active: true } } : a)) }));
      return id;
    },
    async seriesInfo(seriesId: string): Promise<SeriesRule | null> {
      try {
        const r = await be.seriesInfo(seriesId);
        if (r) set((s) => ({ ...s, activities: s.activities.map((a) => (a.seriesId === seriesId ? { ...a, seriesRule: r } : a)) }));
        return r;
      } catch { return null; }
    },

    // --- Gruppen ---
    async createGroup(g: Partial<Group>) { return run(() => be.createGroup(g), "Gruppe gegründet"); },
    async updateGroup(id: string, g: Partial<Group>) { return !!(await run(() => be.updateGroup(id, g).then(() => true), "Gruppe gespeichert")); },
    async deleteGroup(id: string) {
      const ok = !!(await run(() => be.deleteGroup(id).then(() => true), "Gruppe gelöscht", "warn"));
      if (ok) set((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }));
      return ok;
    },
    async joinGroup(id: string) {
      const status = await run(() => be.joinGroup(id));
      if (status === "pending") toast("Anfrage gesendet. Die Admins entscheiden.", "good");
      else if (status === "active") { toast("Willkommen in der Gruppe!", "good"); void api.loadGroup(id); }
    },
    async leaveGroup(id: string) { await run(() => be.leaveGroup(id), "Du hast die Gruppe verlassen."); },
    /** Mitglieder und Termine einer Gruppe laden */
    async loadGroup(id: string) {
      const g = get().groups.find((x) => x.id === id);
      try {
        const [members, acts] = await Promise.all([
          g?.myStatus === "active" ? be.loadGroupMembers(id) : Promise.resolve(null),
          be.loadGroupActivitiesFull(id),
        ]);
        set((s) => {
          const known = new Set(s.activities.map((a) => a.id));
          return {
            ...s,
            groupMembers: members ? { ...s.groupMembers, [id]: members } : s.groupMembers,
            activities: [...s.activities, ...acts.activities.filter((a) => !known.has(a.id))],
            users: { ...acts.users, ...s.users },
          };
        });
      } catch (e) { toast(be.friendly((e as Error).message), "bad"); }
    },
    async ensureGroup(id: string) {
      if (get().groups.some((g) => g.id === id)) return true;
      try {
        const g = await be.groupPreview(id);
        if (!g) return false;
        set((s) => ({ ...s, groups: [...s.groups.filter((x) => x.id !== id), g] }));
        return true;
      } catch { return false; }
    },
    async manageMember(groupId: string, userId: string, action: "approve" | "decline" | "remove" | "make_admin" | "make_member") {
      const msg = action === "approve" ? "Aufgenommen" : action === "make_admin" ? "Ist jetzt Admin" : action === "make_member" ? "Ist jetzt Mitglied" : action === "decline" ? "Anfrage abgelehnt" : "Entfernt";
      await run(() => be.manageMember(groupId, userId, action), msg);
      await api.loadGroup(groupId);
    },
    cancelSeries(seriesId: string) { void run(() => be.cancelSeries(seriesId), "Alle kommenden Termine der Serie wurden abgesagt.", "warn"); },
    async ensureActivity(id: string) {
      if (get().activities.some((a) => a.id === id)) return true;
      try {
        const extra = await be.loadActivity(id);
        if (!extra) return false;
        set((s) => ({ ...s, activities: [...s.activities.filter((a) => a.id !== id), extra.activity], users: { ...extra.users, ...s.users } }));
        return true;
      } catch { return false; }
    },
    toast,
    async update(id: string, patch: Partial<Activity>, summary: string) {
      const r = await run(() => be.updateActivity(id, patch).then(() => true), summary ? "Gespeichert. Alle Teilnehmenden wurden benachrichtigt." : "Gespeichert");
      return !!r;
    },
    cancelActivity(id: string) { void run(() => be.cancelActivity(id), "Aktivität abgesagt. Alle Teilnehmenden wurden benachrichtigt.", "warn"); },
    sendMessage(id: string, text: string) { void run(() => be.sendMessage(id, get().meId, text)); },
    confirmSelf(id: string) { void run(() => be.confirmAttendance(id), "Teilnahme bestätigt. Danke!"); },
    hostConfirm(id: string, ids: string[]) { void run(() => be.hostConfirm(id, ids), "Anwesenheit gespeichert"); },
    markAllRead() {
      const ids = get().notifications.filter((n) => !n.read).map((n) => n.id);
      set((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
      void be.markRead(ids).catch(() => undefined);
    },
    markRead(nid: string) {
      set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === nid ? { ...n, read: true } : n)) }));
      void be.markRead([nid]).catch(() => undefined);
    },
    block(userId: string) { void run(() => be.block(get().meId, userId), "Blockiert. Du siehst diese Person nicht mehr."); },
    unblock(userId: string) { void run(() => be.unblock(get().meId, userId), "Blockierung aufgehoben"); },
    report(userId: string, reason: string) { void run(() => be.report(get().meId, userId, reason), "Meldung gesendet. Wir prüfen sie."); },
    setSettings(p: Partial<Settings>) {
      set((s) => ({ ...s, settings: { ...s.settings, ...p, notify: { ...s.settings.notify, ...(p.notify || {}) }, alerts: { ...s.settings.alerts, ...(p.alerts || {}) } } }));
      window.clearTimeout(settingsTimer);
      settingsTimer = window.setTimeout(() => { const s = get(); if (s.meId) void be.saveSettings(s.meId, s.settings).catch((e) => toast(be.friendly(e.message), "bad")); }, 600);
    },
    setLeague(p: Partial<LeagueSettings>) {
      set((s) => ({ ...s, league: { ...s.league, ...p } }));
      const s = get();
      void run(() => be.saveLeague(s.meId, s.league.optIn, s.league.visibility)).then(() => api.loadLeague());
    },
    setLocation(city: string, pos?: [number, number]) { set((s) => ({ ...s, locationCity: city, locationPos: pos ?? knownCityPos(city) ?? undefined })); savePrefs(get()); void reload(); },
    setRadius(km: number) { set((s) => ({ ...s, radiusKm: km })); savePrefs(get()); window.clearTimeout(radiusTimer); radiusTimer = window.setTimeout(() => void reload(), 400); },
    reset() { void reload(); },
    reload,
    async sendCode(email: string) { await be.sendCode(email); set((s) => ({ ...s, email })); },
    async verifyCode(email: string, code: string) {
      const u = await be.verifyCode(email, code);
      // Direkt weitermachen, nicht nur auf das Anmelde-Ereignis warten
      if (u) await enterHook?.(u.id, u.email);
    },
    async signOut() { await be.signOut(); dispatch({ type: "replace", state: { ...buildLiveState(), auth: "signedOut" } }); },
    async deleteAccount() {
      try { await be.deleteAccount(); dispatch({ type: "replace", state: { ...buildLiveState(), auth: "signedOut" } }); toast("Dein Konto und deine Daten wurden gelöscht."); }
      catch (e) { toast(be.friendly((e as Error).message), "bad"); }
    },
    async exportData() { return be.exportMyData(get().meId); },
    async loadLeague() {
      if (!get().league.optIn) return;
      try { const board = await be.loadLeagueBoard(); set((s) => ({ ...s, leagueBoard: board })); }
      catch (e) { toast(be.friendly((e as Error).message), "bad"); }
    },
    async loadUser(id: string) {
      const r = await be.loadReliability(id);
      if (r) set((s) => (s.users[id] ? { ...s, users: { ...s.users, [id]: { ...s.users[id], reliability: r } } } : s));
    },
  };
  let radiusTimer = 0;
  return api;
}

/** Anmeldung prüfen, auf Anmeldewechsel und Echtzeit-Änderungen hören. */
export function startLive(api: Api, dispatch: React.Dispatch<Action>, get: () => AppState, _toast: ToastFn): () => void {
  const set = (fn: (s: AppState) => AppState) => dispatch({ type: "set", fn });
  let unsub: (() => void) | null = null;
  let timer = 0;

  const listen = () => { unsub?.(); unsub = be.subscribe(() => { window.clearTimeout(timer); timer = window.setTimeout(() => void api.reload(), 400); }); };
  afterProfile = listen;

  let entering: string | null = null;
  async function enter(uid: string, email?: string) {
    if (entering === uid || (get().meId === uid && get().auth === "ready")) return;
    entering = uid;
    try {
      be.dlog("enter", uid);
      const exists = await be.hasProfile(uid);
      be.dlog("hasProfile", exists);
      set((s) => ({ ...s, meId: uid, email: email ?? s.email, auth: exists ? "loading" : "needsProfile" }));
      if (!exists) return;
      await api.reload();
      listen();
    } catch (e) {
      const msg = be.friendly((e as Error).message);
      set((s) => ({ ...s, meId: uid, auth: "error", liveError: msg }));
    } finally {
      entering = null;
    }
  }
  enterHook = enter;

  void be.currentUser()
    .then((u) => (u ? enter(u.id, u.email) : set((s) => ({ ...s, auth: "signedOut" }))))
    .catch((e) => set((s) => ({ ...s, auth: "error", liveError: be.friendly((e as Error).message) })));
  const { data } = be.sb().auth.onAuthStateChange((event, session) => {
    // Laut Supabase keine weiteren Aufrufe direkt im Ereignis: kurz entkoppeln
    if (event === "SIGNED_IN" && session && session.user.id !== get().meId) { const u = session.user; window.setTimeout(() => void enter(u.id, u.email), 0); }
    if (event === "SIGNED_OUT") { unsub?.(); unsub = null; }
  });
  const onFocus = () => { if (get().auth === "ready") void api.reload(); };
  window.addEventListener("focus", onFocus);
  return () => { data.subscription.unsubscribe(); unsub?.(); window.removeEventListener("focus", onFocus); };
}
