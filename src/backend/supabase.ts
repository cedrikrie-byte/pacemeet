import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/backend";
import { CITIES } from "../config/app";
import type { Activity, AppEvent, AppState, LeagueRow, Message, Notif, Settings, SportId, User } from "../types";

/**
 * Verbindung zu Supabase (Live-Modus).
 * Alle Regeln liegen in der Datenbank (supabase/migrations); hier wird nur gelesen,
 * geschrieben und auf Änderungen gehört.
 */

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

// --- Zeilen aus der Datenbank -------------------------------------------------

interface ProfileRow {
  id: string; name: string; city: string; sports: SportId[]; pace: number; speed: number; bio: string;
  public_age: number | null; photo_url: string | null; city_lat: number | null; city_lng: number | null; bests: User["bests"]; kind: "person" | "club";
  profile_visibility: "everyone" | "participants"; league_opt_in: boolean; league_visibility: "private" | "friends" | "local"; created_at: string;
}
interface PrivateRow { id: string; age: number | null; settings: Partial<Settings>; }
interface ActivityRow {
  id: string; host_id: string; title: string; sport: SportId; city: string; meeting_point: string; lat: number; lng: number;
  starts_at: string; distance_km: number; tempo: number; max_participants: number; description: string;
  beginner_friendly: boolean; breaks: boolean; route: Activity["route"] | null; event_id: string | null;
  status: "open" | "cancelled"; participant_count: number; updated_at: string; series_id: string | null;
}
interface PartRow { activity_id: string; user_id: string; self_confirmed: boolean; host_confirmed: boolean; }
interface MsgRow { id: string; activity_id: string; user_id: string | null; body: string; is_system: boolean; created_at: string; }
interface NotifRow { id: string; kind: Notif["kind"]; body: string; activity_id: string | null; read: boolean; created_at: string; }
interface EventRow { id: string; name: string; starts_on: string; ends_on: string; required: number; medal: string; hue: number; description: string; }

function fail(error: { message: string } | null): void {
  if (error) throw new Error(friendly(error.message));
}
/** Technische Fehlermeldungen in verständliche Sätze übersetzen. */
export function friendly(msg: string): string {
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Keine Verbindung. Prüfe deine Internetverbindung und versuche es erneut.";
  if (/Token has expired or is invalid|otp_expired|invalid otp/i.test(msg)) return "Der Code ist falsch oder abgelaufen. Prüfe ihn oder fordere einen neuen an.";
  if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.";
  if (/JWT|invalid claim|session.*expired/i.test(msg)) return "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.";
  if (/violates check constraint/i.test(msg)) return "Einige Angaben sind ungültig. Bitte prüfe das Formular.";
  if (/permission denied|row-level security/i.test(msg)) return "Dafür fehlt dir die Berechtigung.";
  return msg;
}

const hueOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function toUser(p: ProfileRow, rel?: User["reliability"]): User {
  return {
    id: p.id, name: p.name, city: p.city, cityPos: p.city_lat != null && p.city_lng != null ? [p.city_lat, p.city_lng] : undefined, sports: p.sports, pace: p.pace, speed: Number(p.speed), bio: p.bio,
    hue: hueOf(p.id), photo: p.photo_url ?? undefined, kind: p.kind, bests: p.bests ?? [],
    age: p.public_age ?? undefined, showAge: p.public_age != null,
    reliability: rel ?? { attended: 0, hosted: 0, lateCancels: 0, memberSince: p.created_at },
    league: p.league_opt_in ? { optIn: true, xp: 0, monthXp: 0 } : undefined,
  };
}
function placeholder(id: string): User {
  return { id, name: "Mitglied", city: "", sports: ["run"], pace: 400, speed: 24, bio: "", hue: hueOf(id), bests: [], reliability: { attended: 0, hosted: 0, lateCancels: 0, memberSince: new Date().toISOString() } };
}
function toActivity(r: ActivityRow, parts: PartRow[], msgs: MsgRow[]): Activity {
  const mine = parts.filter((p) => p.activity_id === r.id);
  return {
    id: r.id, title: r.title, sport: r.sport, city: r.city, meetingPoint: r.meeting_point, lat: r.lat, lng: r.lng,
    startsAt: r.starts_at, distanceKm: Number(r.distance_km), tempo: Number(r.tempo), maxParticipants: r.max_participants,
    description: r.description, beginnerFriendly: r.beginner_friendly, breaks: r.breaks, hostId: r.host_id,
    participants: mine.map((p) => p.user_id), participantCount: r.participant_count, status: r.status,
    selfConfirmed: mine.filter((p) => p.self_confirmed).map((p) => p.user_id),
    hostConfirmed: mine.filter((p) => p.host_confirmed).map((p) => p.user_id),
    messages: msgs.filter((m) => m.activity_id === r.id).map((m): Message => ({ id: m.id, userId: m.user_id ?? "system", text: m.body, at: m.created_at, system: m.is_system })),
    route: r.route ?? { mode: "spontaneous", points: [] }, eventId: r.event_id ?? undefined, updatedAt: r.updated_at,
    seriesId: r.series_id ?? undefined,
  };
}
const toEvent = (e: EventRow): AppEvent => ({ id: e.id, name: e.name, start: e.starts_on, end: e.ends_on, required: e.required, medal: e.medal, hue: e.hue, description: e.description });

// --- Anmeldung -----------------------------------------------------------------

export async function sendCode(email: string) {
  // Funktioniert mit Code-Vorlage ({{ .Token }}) und mit der Standard-Vorlage (Anmeldelink zurück in die App)
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
  fail(error);
}
export async function verifyCode(email: string, token: string) {
  const { error } = await sb().auth.verifyOtp({ email, token, type: "email" });
  fail(error);
}
export async function signOut() { await sb().auth.signOut(); }
export async function currentUser() {
  const { data } = await sb().auth.getSession();
  return data.session?.user ?? null;
}
export async function hasProfile(uid: string): Promise<boolean> {
  const { data, error } = await sb().from("profiles").select("id").eq("id", uid).maybeSingle();
  fail(error);
  return !!data;
}
export async function createProfile(uid: string, p: Partial<User>, settings: Settings) {
  const { error } = await sb().from("profiles").insert({
    id: uid, name: p.name, city: p.city, city_lat: p.cityPos?.[0] ?? null, city_lng: p.cityPos?.[1] ?? null, sports: p.sports, pace: p.pace, speed: p.speed, bio: p.bio ?? "",
    profile_visibility: settings.profileVisibility,
  });
  fail(error);
  const { error: e2 } = await sb().from("profile_private").insert({ id: uid, settings: settingsToStore(settings) });
  fail(e2);
}
const settingsToStore = (s: Settings) => ({ theme: s.theme, units: s.units, language: s.language, showPace: s.showPace, showHistory: s.showHistory, showAwards: s.showAwards, notify: s.notify });

// --- Laden ----------------------------------------------------------------------

export type Snapshot = Pick<AppState, "users" | "activities" | "events" | "notifications" | "blocked" | "league" | "settings" | "locationPos"> & { meId: string; locationCity: string; profileVisibility: Settings["profileVisibility"] };

export async function loadSnapshot(uid: string, cityId: string | null, cityPos: [number, number] | null, radiusKm: number, base: Settings): Promise<Snapshot> {
  const db = sb();
  const [{ data: me, error: e1 }, { data: priv }] = await Promise.all([
    db.from("profiles").select("*").eq("id", uid).single<ProfileRow>(),
    db.from("profile_private").select("*").eq("id", uid).maybeSingle<PrivateRow>(),
  ]);
  fail(e1);
  // Bezugspunkt: gewählte Stadt, sonst Profilstadt, sonst Startgebiet
  const cityName = cityId || me!.city || CITIES[0].name;
  const known = CITIES.find((c) => c.id === cityName || c.name.toLowerCase() === cityName.toLowerCase());
  const center: [number, number] = cityPos ?? ((!cityId || cityId === me!.city) && me!.city_lat != null && me!.city_lng != null ? [me!.city_lat, me!.city_lng] : null) ?? (known ? [known.lat, known.lng] : [CITIES[0].lat, CITIES[0].lng]);
  const city = { id: cityName, lat: center[0], lng: center[1] };

  const [near, mine, notifs, blocks, events, rel] = await Promise.all([
    db.rpc("activities_near", { p_lat: city.lat, p_lng: city.lng, p_radius_km: radiusKm }),
    db.rpc("my_activities"),
    db.from("notifications").select("*").order("created_at", { ascending: false }).limit(60),
    db.from("blocks").select("blocked_id"),
    db.from("events").select("*"),
    db.rpc("reliability", { p_user: uid }),
  ]);
  [near, mine, notifs, blocks, events].forEach((r) => fail(r.error));

  const rows = new Map<string, ActivityRow>();
  [...(near.data as ActivityRow[]), ...(mine.data as ActivityRow[])].forEach((r) => rows.set(r.id, r));
  const memberIds = (mine.data as ActivityRow[]).map((r) => r.id);

  const [parts, msgs] = memberIds.length
    ? await Promise.all([
        db.from("activity_participants").select("activity_id,user_id,self_confirmed,host_confirmed").in("activity_id", memberIds),
        db.from("messages").select("*").in("activity_id", memberIds).order("created_at").limit(2000),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  fail(parts.error); fail(msgs.error);

  const ids = new Set<string>([uid]);
  rows.forEach((r) => ids.add(r.host_id));
  (parts.data as PartRow[]).forEach((p) => ids.add(p.user_id));
  (msgs.data as MsgRow[]).forEach((m) => m.user_id && ids.add(m.user_id));
  const { data: profs, error: e3 } = await db.from("profiles").select("*").in("id", [...ids]);
  fail(e3);

  const users: Record<string, User> = {};
  ids.forEach((id) => (users[id] = placeholder(id)));
  (profs as ProfileRow[]).forEach((p) => (users[p.id] = toUser(p)));
  const r0 = (rel.data as { attended: number; hosted: number; late_cancels: number; member_since: string }[] | null)?.[0];
  users[uid] = { ...toUser(me!, r0 ? { attended: r0.attended, hosted: r0.hosted, lateCancels: r0.late_cancels, memberSince: r0.member_since } : undefined), age: priv?.age ?? undefined, showAge: me!.public_age != null };

  return {
    meId: uid,
    locationCity: city.id,
    locationPos: center,
    users,
    activities: [...rows.values()].map((r) => toActivity(r, parts.data as PartRow[], msgs.data as MsgRow[])),
    events: (events.data as EventRow[]).map(toEvent),
    notifications: (notifs.data as NotifRow[]).map((n) => ({ id: n.id, kind: n.kind, text: n.body, activityId: n.activity_id ?? undefined, at: n.created_at, read: n.read })),
    blocked: (blocks.data as { blocked_id: string }[]).map((b) => b.blocked_id),
    league: { optIn: me!.league_opt_in, visibility: me!.league_visibility },
    settings: { ...base, ...(priv?.settings ?? {}), profileVisibility: me!.profile_visibility, notify: { ...base.notify, ...(priv?.settings?.notify ?? {}) } },
    profileVisibility: me!.profile_visibility,
  };
}

/** Einzelne Aktivität nachladen (z. B. aus einem geteilten Link, außerhalb des Umkreises). */
export async function loadActivity(id: string): Promise<{ activity: Activity; users: Record<string, User> } | null> {
  const db = sb();
  const { data: row, error } = await db.from("activities").select("*").eq("id", id).maybeSingle<ActivityRow>();
  fail(error);
  if (!row) return null;
  const [parts, msgs] = await Promise.all([
    db.from("activity_participants").select("activity_id,user_id,self_confirmed,host_confirmed").eq("activity_id", id),
    db.from("messages").select("*").eq("activity_id", id).order("created_at").limit(500),
  ]);
  const ids = new Set<string>([row.host_id, ...((parts.data as PartRow[]) ?? []).map((p) => p.user_id)]);
  const { data: profs } = await db.from("profiles").select("*").in("id", [...ids]);
  const users: Record<string, User> = {};
  ids.forEach((u) => (users[u] = placeholder(u)));
  ((profs as ProfileRow[]) ?? []).forEach((p) => (users[p.id] = toUser(p)));
  return { activity: toActivity(row, (parts.data as PartRow[]) ?? [], (msgs.data as MsgRow[]) ?? []), users };
}

export async function loadReliability(uid: string): Promise<User["reliability"] | null> {
  const { data } = await sb().rpc("reliability", { p_user: uid });
  const r = (data as { attended: number; hosted: number; late_cancels: number; member_since: string }[] | null)?.[0];
  return r ? { attended: r.attended, hosted: r.hosted, lateCancels: r.late_cancels, memberSince: r.member_since } : null;
}

export async function loadLeagueBoard(): Promise<{ local: LeagueRow[]; friends: LeagueRow[] }> {
  const map = (rows: { user_id: string; name: string; photo_url: string | null; month_xp: number; is_me: boolean }[] | null) =>
    (rows ?? []).map((r) => ({ userId: r.user_id, name: r.name, photo: r.photo_url ?? undefined, monthXp: r.month_xp, isMe: r.is_me }));
  const [l, f] = await Promise.all([sb().rpc("league_board", { p_scope: "local" }), sb().rpc("league_board", { p_scope: "friends" })]);
  fail(l.error); fail(f.error);
  return { local: map(l.data), friends: map(f.data) };
}

// --- Schreiben ------------------------------------------------------------------

const toRow = (a: Partial<Activity>) => ({
  title: a.title, sport: a.sport, city: a.city, meeting_point: a.meetingPoint, lat: a.lat, lng: a.lng, starts_at: a.startsAt,
  distance_km: a.distanceKm, tempo: a.tempo, max_participants: a.maxParticipants, description: a.description,
  beginner_friendly: a.beginnerFriendly, breaks: a.breaks, route: a.route ?? null, event_id: a.eventId ?? null,
});

export async function createActivity(a: Activity): Promise<string> {
  const { data, error } = await sb().from("activities").insert(toRow(a)).select("id").single();
  fail(error);
  return (data as { id: string }).id;
}
/** Mehrere Termine auf einmal (Serie). Gibt die ID des ersten Termins zurück. */
export async function createActivities(list: Activity[]): Promise<string> {
  const rows = list.map((a) => ({ ...toRow(a), series_id: a.seriesId ?? null }));
  const { data, error } = await sb().from("activities").insert(rows).select("id,starts_at").order("starts_at");
  fail(error);
  return (data as { id: string }[])[0].id;
}
export async function cancelSeries(seriesId: string): Promise<number> {
  const { data, error } = await sb().rpc("cancel_series", { p_series: seriesId });
  fail(error);
  return data as number;
}

// --- Teilen: öffentliche Vorschau ----------------------------------------------

export interface PublicActivity {
  id: string; title: string; sport: SportId; city: string; meeting_point: string; lat: number; lng: number;
  starts_at: string; distance_km: number; tempo: number; max_participants: number; participant_count: number;
  beginner_friendly: boolean; breaks: boolean; description: string; route: Activity["route"] | null; host_name: string; status: "open" | "cancelled";
}
export async function fetchPublicActivity(id: string): Promise<PublicActivity | null> {
  const { data, error } = await sb().rpc("public_activity", { p_id: id });
  fail(error);
  return ((data as PublicActivity[]) ?? [])[0] ?? null;
}

// --- Push-Nachrichten -----------------------------------------------------------

export async function vapidPublicKey(): Promise<string> {
  const { data } = await sb().from("app_config").select("value").eq("key", "vapid_public_key").maybeSingle();
  if (data?.value) return data.value as string;
  // Beim allerersten Mal erzeugt die Server-Funktion das Schlüsselpaar
  const { data: r, error } = await sb().functions.invoke("send-push", { body: { setup: true } });
  if (error) throw new Error("Push ist auf dem Server noch nicht eingerichtet.");
  return (r as { publicKey: string }).publicKey;
}
export async function savePushSubscription(sub: PushSubscriptionJSON) {
  const { error } = await sb().from("push_subscriptions").insert({
    endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth, user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error && !/duplicate key/i.test(error.message)) fail(error);
}
export async function deletePushSubscription(endpoint: string) {
  fail((await sb().from("push_subscriptions").delete().eq("endpoint", endpoint)).error);
}
export async function updateActivity(id: string, a: Partial<Activity>) {
  const { error } = await sb().from("activities").update(toRow(a)).eq("id", id);
  fail(error);
}
export async function cancelActivity(id: string) {
  const { error } = await sb().from("activities").update({ status: "cancelled" }).eq("id", id);
  fail(error);
}
export async function joinActivity(id: string) { fail((await sb().rpc("join_activity", { p_activity: id })).error); }
export async function leaveActivity(id: string) { fail((await sb().rpc("leave_activity", { p_activity: id })).error); }
export async function confirmAttendance(id: string) { fail((await sb().rpc("confirm_attendance", { p_activity: id })).error); }
export async function hostConfirm(id: string, present: string[]) { fail((await sb().rpc("host_confirm", { p_activity: id, p_present: present })).error); }
export async function sendMessage(activityId: string, uid: string, text: string) {
  fail((await sb().from("messages").insert({ activity_id: activityId, user_id: uid, body: text })).error);
}
export async function markRead(ids: string[]) {
  if (!ids.length) return;
  fail((await sb().from("notifications").update({ read: true }).in("id", ids)).error);
}
export async function block(uid: string, other: string) { fail((await sb().from("blocks").insert({ blocker_id: uid, blocked_id: other })).error); }
export async function unblock(uid: string, other: string) { fail((await sb().from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", other)).error); }
export async function report(uid: string, other: string, reason: string) { fail((await sb().from("reports").insert({ reporter_id: uid, reported_id: other, reason })).error); }

async function uploadPhoto(uid: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  const { error } = await sb().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  fail(error);
  return sb().storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export async function updateProfile(uid: string, p: Partial<User>) {
  let photo = p.photo;
  if (photo && photo.startsWith("data:")) photo = await uploadPhoto(uid, photo);
  const { error } = await sb().from("profiles").update({
    name: p.name, city: p.city, city_lat: p.cityPos?.[0] ?? null, city_lng: p.cityPos?.[1] ?? null, sports: p.sports, pace: p.pace, speed: p.speed, bio: p.bio, bests: p.bests,
    photo_url: photo ?? null, public_age: p.showAge && p.age ? p.age : null,
  }).eq("id", uid);
  fail(error);
  fail((await sb().from("profile_private").update({ age: p.age ?? null }).eq("id", uid)).error);
  return photo;
}
export async function saveSettings(uid: string, s: Settings) {
  fail((await sb().from("profile_private").update({ settings: settingsToStore(s) }).eq("id", uid)).error);
  fail((await sb().from("profiles").update({ profile_visibility: s.profileVisibility }).eq("id", uid)).error);
}
export async function saveLeague(uid: string, optIn: boolean, visibility: string) {
  fail((await sb().from("profiles").update({ league_opt_in: optIn, league_visibility: visibility }).eq("id", uid)).error);
}
export async function deleteAccount() {
  fail((await sb().rpc("delete_my_account")).error);
  await sb().auth.signOut();
}

/** Alle eigenen Daten als JSON (DSGVO Art. 15/20). */
export async function exportMyData(uid: string) {
  const db = sb();
  const [profile, priv, acts, parts, msgs, notifs, blocks, reports] = await Promise.all([
    db.from("profiles").select("*").eq("id", uid).single(),
    db.from("profile_private").select("*").eq("id", uid).maybeSingle(),
    db.from("activities").select("*").eq("host_id", uid),
    db.from("activity_participants").select("*").eq("user_id", uid),
    db.from("messages").select("*").eq("user_id", uid),
    db.from("notifications").select("*"),
    db.from("blocks").select("*"),
    db.from("reports").select("*"),
  ]);
  return {
    exportiert_am: new Date().toISOString(), profil: profile.data, privat: priv.data, eigene_aktivitaeten: acts.data,
    teilnahmen: parts.data, nachrichten: msgs.data, benachrichtigungen: notifs.data, blockiert: blocks.data, meldungen: reports.data,
  };
}

// --- Echtzeit -------------------------------------------------------------------

export function subscribe(onChange: (table: string) => void): () => void {
  const ch: RealtimeChannel = sb().channel("pacemeet-live");
  ["activities", "activity_participants", "messages", "notifications"].forEach((table) =>
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange(table)));
  ch.subscribe();
  return () => { sb().removeChannel(ch); };
}
