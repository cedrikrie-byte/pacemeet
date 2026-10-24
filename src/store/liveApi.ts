import type { Action, Api, ToastFn } from "./AppStore";
import type { Activity, AppState, LeagueSettings, Settings, User } from "../types";
import * as be from "../backend/supabase";

/** Leerer Zustand für den Live-Modus (vor der Anmeldung). */
export function buildLiveState(): AppState {
  let radius = 25, city = "essen";
  try { const r = JSON.parse(localStorage.getItem("pacemeet-live-prefs") || "{}"); radius = r.radiusKm ?? radius; city = r.locationCity ?? city; } catch { /* ignorieren */ }
  return {
    version: 6, auth: "loading", onboarded: false, meId: "", locationCity: city, radiusKm: radius,
    users: {}, activities: [], events: [], notifications: [], blocked: [], reports: [],
    settings: {
      theme: "system", units: "metric", language: "de-DE", profileVisibility: "participants",
      showPace: true, showHistory: false, showAwards: true,
      notify: { changes: true, chat: true, joins: true, reminders: true },
    },
    league: { optIn: false, visibility: "private" },
  };
}

function savePrefs(s: AppState) {
  try { localStorage.setItem("pacemeet-live-prefs", JSON.stringify({ radiusKm: s.radiusKm, locationCity: s.locationCity })); } catch { /* ignorieren */ }
}

/** Wird von startLive gesetzt: nach dem Anlegen des Profils Echtzeit starten. */
let afterProfile: (() => void) | null = null;

/** Live-Modus: jede Aktion geht an Supabase, danach wird neu geladen. */
export function makeLiveApi(dispatch: React.Dispatch<Action>, get: () => AppState, toast: ToastFn): Api {
  const set = (fn: (s: AppState) => AppState) => dispatch({ type: "set", fn });
  let loading: Promise<void> | null = null;
  let again = false;

  async function reload() {
    if (loading) { again = true; return loading; }
    loading = (async () => {
      const s = get();
      if (!s.meId) return;
      try {
        const snap = await be.loadSnapshot(s.meId, s.locationCity, s.radiusKm, s.settings);
        const before = new Set(get().notifications.map((n) => n.id));
        set((cur) => ({ ...cur, ...snap, auth: "ready", onboarded: true }));
        // Neue Benachrichtigung kurz anzeigen (nicht beim ersten Laden)
        const fresh = snap.notifications.find((n) => !n.read && !before.has(n.id));
        if (before.size && fresh) toast(fresh.text);
      } catch (e) {
        toast((e as Error).message, "bad");
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
        set((cur) => ({ ...cur, locationCity: profile.city ?? cur.locationCity, auth: "loading" }));
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
    async createSeries(list: Activity[]) { return run(() => be.createActivities(list), `${list.length} Termine veröffentlicht`); },
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
      set((s) => ({ ...s, settings: { ...s.settings, ...p, notify: { ...s.settings.notify, ...(p.notify || {}) } } }));
      window.clearTimeout(settingsTimer);
      settingsTimer = window.setTimeout(() => { const s = get(); if (s.meId) void be.saveSettings(s.meId, s.settings).catch((e) => toast(be.friendly(e.message), "bad")); }, 600);
    },
    setLeague(p: Partial<LeagueSettings>) {
      set((s) => ({ ...s, league: { ...s.league, ...p } }));
      const s = get();
      void run(() => be.saveLeague(s.meId, s.league.optIn, s.league.visibility)).then(() => api.loadLeague());
    },
    setLocation(city: string) { set((s) => ({ ...s, locationCity: city })); savePrefs(get()); void reload(); },
    setRadius(km: number) { set((s) => ({ ...s, radiusKm: km })); savePrefs(get()); window.clearTimeout(radiusTimer); radiusTimer = window.setTimeout(() => void reload(), 400); },
    reset() { void reload(); },
    reload,
    async sendCode(email: string) { await be.sendCode(email); set((s) => ({ ...s, email })); },
    async verifyCode(email: string, code: string) { await be.verifyCode(email, code); },
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
export function startLive(api: Api, dispatch: React.Dispatch<Action>, get: () => AppState, toast: ToastFn): () => void {
  const set = (fn: (s: AppState) => AppState) => dispatch({ type: "set", fn });
  let unsub: (() => void) | null = null;
  let timer = 0;

  const listen = () => { unsub?.(); unsub = be.subscribe(() => { window.clearTimeout(timer); timer = window.setTimeout(() => void api.reload(), 400); }); };
  afterProfile = listen;

  async function enter(uid: string, email?: string) {
    try {
      const exists = await be.hasProfile(uid);
      set((s) => ({ ...s, meId: uid, email: email ?? s.email, auth: exists ? "loading" : "needsProfile" }));
      if (!exists) return;
      await api.reload();
      listen();
    } catch (e) {
      toast(be.friendly((e as Error).message), "bad");
      set((s) => ({ ...s, auth: "signedOut" }));
    }
  }

  void be.currentUser().then((u) => (u ? enter(u.id, u.email) : set((s) => ({ ...s, auth: "signedOut" }))));
  const { data } = be.sb().auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session && session.user.id !== get().meId) void enter(session.user.id, session.user.email);
    if (event === "SIGNED_OUT") { unsub?.(); unsub = null; }
  });
  const onFocus = () => { if (get().auth === "ready") void api.reload(); };
  window.addEventListener("focus", onFocus);
  return () => { data.subscription.unsubscribe(); unsub?.(); window.removeEventListener("focus", onFocus); };
}
