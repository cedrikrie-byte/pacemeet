import type { Activity, AppState, Message, Route, User } from "../types";
import { buildEvents } from "./events";
import { placeByName } from "./places";

const ME = "me";

const u = (id: string, name: string, city: string, hue: number, extra: Partial<User>): User => ({
  id, name, city, hue, sports: ["run"], pace: 390, speed: 24, bio: "", kind: "person", bests: [],
  reliability: { attended: 10, hosted: 2, lateCancels: 0, memberSince: "2025-04-01" },
  ...extra,
});

export const DEMO_USERS: User[] = [
  u(ME, "Alex R.", "essen", 18, {
    sports: ["run", "ride"], pace: 400, speed: 25,
    bio: "Laufe nach Feierabend, am Wochenende gern Rad an der Ruhr.",
    reliability: { attended: 4, hosted: 1, lateCancels: 0, memberSince: "2026-08-12" },
    league: { optIn: false, xp: 0, monthXp: 0 },
    age: 27, showAge: false,
    bests: [
      { id: "b1", sport: "run", label: "10 km", value: "52:40" },
      { id: "b2", sport: "run", label: "Halbmarathon", value: "1:58:15" },
      { id: "b3", sport: "ride", label: "Längste Tour", value: "112 km" },
    ],
  }),
  u("jonas", "Jonas K.", "essen", 200, { pace: 450, bio: "Feierabendläufer, Tempo eher gemütlich.", reliability: { attended: 41, hosted: 18, lateCancels: 1, memberSince: "2025-03-02" }, league: { optIn: true, xp: 4150, monthXp: 820 } }),
  u("lena", "Lena M.", "essen", 330, { pace: 345, bests: [{ id: "l1", sport: "run", label: "10 km", value: "44:10" }, { id: "l2", sport: "run", label: "Marathon", value: "3:41:02" }], age: 31, showAge: true, sports: ["run"], bio: "Halbmarathon im Frühjahr geplant. Suche Leute für lange Läufe.", reliability: { attended: 27, hosted: 9, lateCancels: 0, memberSince: "2025-06-20" }, league: { optIn: true, xp: 3020, monthXp: 640 } }),
  u("aylin", "Aylin D.", "bochum", 160, { pace: 480, bio: "Wieder eingestiegen nach zwei Jahren Pause.", reliability: { attended: 12, hosted: 3, lateCancels: 0, memberSince: "2026-01-10" }, league: { optIn: true, xp: 1450, monthXp: 525 } }),
  u("marco", "Marco B.", "bochum", 220, { sports: ["ride"], speed: 29, bio: "Rennrad, meist Ruhrtal und Elfringhauser Schweiz.", reliability: { attended: 33, hosted: 14, lateCancels: 2, memberSince: "2025-05-15" }, league: { optIn: true, xp: 3790, monthXp: 700 } }),
  u("sophie", "Sophie W.", "essen", 280, { sports: ["run", "ride"], pace: 375, speed: 22, bio: "Morgens vor der Arbeit unterwegs.", reliability: { attended: 19, hosted: 4, lateCancels: 0, memberSince: "2025-11-03" }, league: { optIn: false, xp: 0, monthXp: 0 } }),
  u("tim", "Tim R.", "hattingen", 40, { sports: ["ride"], speed: 24, bio: "Gravel und Touren, Kaffeepause ist Pflicht.", reliability: { attended: 15, hosted: 6, lateCancels: 1, memberSince: "2025-09-09" }, league: { optIn: true, xp: 1980, monthXp: 410 } }),
  u("fatma", "Fatma Y.", "essen", 120, { pace: 420, bio: "Laufe seit einem Jahr, am liebsten im Grugapark.", reliability: { attended: 22, hosted: 2, lateCancels: 0, memberSince: "2025-10-01" }, league: { optIn: true, xp: 2310, monthXp: 590 } }),
  u("niklas", "Niklas H.", "bochum", 260, { pace: 315, bio: "Bahntraining dienstags, sonst lockere Runden.", reliability: { attended: 30, hosted: 11, lateCancels: 0, memberSince: "2025-02-11" }, league: { optIn: false, xp: 0, monthXp: 0 } }),
  u("julia", "Julia S.", "hattingen", 300, { sports: ["run", "ride"], pace: 440, speed: 21, bio: "Anfängerin mit Ausdauer.", reliability: { attended: 8, hosted: 0, lateCancels: 0, memberSince: "2026-05-30" }, league: { optIn: true, xp: 980, monthXp: 350 } }),
  u("lth", "Lauftreff Hattingen", "hattingen", 10, { kind: "club", pace: 420, bio: "Offener Lauftreff seit 2009. Jede Woche, jedes Tempo.", reliability: { attended: 0, hosted: 212, lateCancels: 0, memberSince: "2025-01-15" } }),
];

/** Erzeugt Demo-Aktivitäten relativ zum aktuellen Zeitpunkt. */
function at(dayOffset: number, h: number, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function minsAgo(n: number) { return new Date(Date.now() - n * 60000).toISOString(); }

/** Rundkurs durch den Treffpunkt (Demo-Routen). */
function loop(lat: number, lng: number, km: number, seed: number, outAndBack = false): Route {
  const kmLat = 111, kmLng = 111 * Math.cos((lat * Math.PI) / 180);
  const pts: [number, number][] = [];
  if (outAndBack) {
    const half = km / 2, ang = seed;
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * half;
      const wob = Math.sin(i * 1.3 + seed) * 0.35;
      pts.push([lat + (Math.sin(ang) * t + wob * Math.cos(ang)) / kmLat, lng + (Math.cos(ang) * t - wob * Math.sin(ang)) / kmLng]);
    }
    return { mode: "planned", points: [...pts, ...pts.slice(0, -1).reverse()], source: "drawn" };
  }
  const r = km / (2 * Math.PI) / 1.2;
  const cLat = lat + (Math.sin(seed) * r) / kmLat, cLng = lng + (Math.cos(seed) * r) / kmLng;
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = seed + Math.PI + (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.16 * Math.sin(i * 1.7 + seed * 3));
    pts.push([cLat + (Math.sin(a) * rr) / kmLat, cLng + (Math.cos(a) * rr * 1.15) / kmLng]);
  }
  pts[0] = [lat, lng]; pts[pts.length - 1] = [lat, lng];
  return { mode: "planned", points: pts, source: "drawn" };
}

let mid = 0;
const msg = (userId: string, text: string, ago: number, system = false): Message => ({ id: `m${++mid}`, userId, text, at: minsAgo(ago), system });

function act(a: Partial<Activity> & { routeSeed?: number } & Pick<Activity, "id" | "title" | "sport" | "meetingPoint" | "startsAt" | "distanceKm" | "tempo" | "hostId">): Activity {
  const p = placeByName(a.meetingPoint)!;
  const routeSpec = (a as { routeSeed?: number }).routeSeed;
  const route: Route = routeSpec === undefined ? { mode: "spontaneous", points: [] } : { ...loop(p.lat, p.lng, a.distanceKm, routeSpec, a.sport === "ride"), source: "loop", ascentM: Math.round(a.distanceKm * (a.sport === "ride" ? 9 : 4) * (1 + (routeSpec % 1))) };
  delete (a as { routeSeed?: number }).routeSeed;
  return {
    route,
    city: p.city, lat: p.lat, lng: p.lng, maxParticipants: 8, description: "",
    beginnerFriendly: false, breaks: false, participants: [], status: "open",
    selfConfirmed: [], hostConfirmed: [], messages: [], ...a,
  } as Activity;
}

export function buildDemoActivities(): Activity[] {
  // „Heute“-Termine: zur Wunschzeit, sonst später am Abend, sonst morgen.
  const soon = (h: number, m: number): string => {
    const t = new Date(); t.setHours(h, m, 0, 0);
    if (t.getTime() - Date.now() > 45 * 60000) return t.toISOString();
    const later = new Date(Date.now() + 90 * 60000); later.setMinutes(later.getMinutes() < 30 ? 30 : 60, 0, 0);
    if (later.getHours() >= 7 && later.getHours() <= 20 && later.getDate() === new Date().getDate()) return later.toISOString();
    return at(1, h, m);
  };
  return [
    act({ id: "a1", routeSeed: 2.1, eventId: "ruhr-herbst", title: "Feierabendrunde am Baldeneysee", sport: "run", meetingPoint: "Baldeneysee, Regattatribüne", startsAt: soon(18, 0), distanceKm: 8, tempo: 450, hostId: "jonas", maxParticipants: 8, participants: ["fatma", "aylin"], beginnerFriendly: true, description: "Entspannte Runde am Nordufer entlang. Wir laufen zusammen, niemand wird zurückgelassen. Danach optional ein Getränk am Seaside Beach.", messages: [msg("jonas", "Treffpunkt ist direkt unten an der Tribüne, ich trage eine orange Jacke.", 95), msg("fatma", "Super, bin dabei!", 80)] }),
    act({ id: "a2", routeSeed: 0.4, eventId: "ruhr-herbst", title: "Lockerer Lauf Grugapark", sport: "run", meetingPoint: "Grugapark, Haupteingang Messe", startsAt: soon(19, 15), distanceKm: 6, tempo: 420, hostId: "fatma", maxParticipants: 6, participants: ["sophie", ME], beginnerFriendly: true, breaks: true, description: "Zwei Runden durch den Park. Kurze Gehpause nach 3 km für alle, die das brauchen.", messages: [msg("fatma", "Eintritt am Messe-Eingang ist abends frei.", 300), msg("sophie", "Ich komme mit dem Rad, ab wann seid ihr da?", 200), msg("fatma", "Ab 19:05 stehe ich am Tor.", 190)] }),
    act({ id: "a3", routeSeed: 4.0, title: "Tempodauerlauf Zollverein", sport: "run", meetingPoint: "Zeche Zollverein, Vorplatz Schacht XII", startsAt: at(1, 7, 0), distanceKm: 10, tempo: 330, hostId: "lena", maxParticipants: 5, participants: ["niklas", "sophie"], description: "Zügiger Dauerlauf vor der Arbeit über das Gelände und die Halde. Gleichmäßiges Tempo, keine Pausen." }),
    act({ id: "a4", routeSeed: 0.3, eventId: "ruhr-herbst", title: "Ruhrtalradweg nach Kemnade", sport: "ride", meetingPoint: "Ruhrbrücke Hattingen (Ruhrtalradweg)", startsAt: at(1, 10, 30), distanceKm: 42, tempo: 22, hostId: "tim", maxParticipants: 10, participants: ["julia", "marco"], beginnerFriendly: true, breaks: true, description: "Flache Tour auf dem Ruhrtalradweg bis zum Kemnader See und zurück. Kaffeepause am See. Trekkingrad reicht völlig." }),
    act({ id: "a5", routeSeed: 5.2, title: "Rennradrunde Elfringhauser Schweiz", sport: "ride", meetingPoint: "Henrichshütte, Museumseingang", startsAt: at(2, 9, 0), distanceKm: 68, tempo: 28, hostId: "marco", maxParticipants: 6, participants: ["tim", "niklas", "lena", "jonas", "julia"], description: "Hügelige Runde mit ca. 850 Höhenmetern. Helm Pflicht, Gruppe fährt geschlossen, an Anstiegen wird oben gewartet." }),
    act({ id: "a6", eventId: "ruhr-herbst", title: "Einsteigerlauf mit Gehpausen", sport: "run", meetingPoint: "Stadtpark Bochum, Bismarckturm", startsAt: at(2, 11, 0), distanceKm: 4, tempo: 510, hostId: "aylin", maxParticipants: 10, participants: ["julia"], beginnerFriendly: true, breaks: true, description: "4 Minuten laufen, 1 Minute gehen. Perfekt für den Wiedereinstieg oder die allerersten Kilometer. Keine Uhr nötig." }),
    act({ id: "a7", routeSeed: 1.0, title: "Sonntagslauf am Kemnader See", sport: "run", meetingPoint: "Kemnader See, Parkplatz Haus Kemnade", startsAt: at(3, 9, 30), distanceKm: 12, tempo: 400, hostId: "niklas", maxParticipants: 8, participants: ["lena", "fatma", "jonas"], description: "Eine Runde um den See plus Abstecher an der Ruhr. Gleichmäßig, Gesprächstempo am Ende." }),
    act({ id: "a8", routeSeed: 3.3, eventId: "ruhr-herbst", title: "Offener Lauftreff Altstadt", sport: "run", meetingPoint: "Altstadt Hattingen, Untermarkt", startsAt: at(4, 18, 30), distanceKm: 7, tempo: 420, hostId: "lth", maxParticipants: 25, participants: ["julia", "tim", "aylin", "fatma"], beginnerFriendly: true, breaks: true, description: "Unser wöchentlicher Treff. Wir teilen uns in zwei Tempogruppen auf. Neue Gesichter sind immer willkommen." }),
    act({ id: "a9", title: "Uni-Runde nach der Vorlesung", sport: "run", meetingPoint: "Ruhr-Universität, Forumsplatz", startsAt: at(4, 17, 15), distanceKm: 5, tempo: 375, hostId: "niklas", maxParticipants: 4, participants: ["aylin", "lena", "sophie"], description: "Kurze Runde durch den Botanischen Garten und zurück." }),
    act({ id: "a10", routeSeed: 2.6, title: "Gravel-Runde Ruhrhöhen", sport: "ride", meetingPoint: "Haus Scheppen, Baldeneysee Süd", startsAt: at(5, 14, 0), distanceKm: 38, tempo: 20, hostId: "tim", maxParticipants: 8, participants: ["sophie"], breaks: true, description: "Waldwege und Schotter rund um den Baldeneysee. Gravelbike oder MTB empfohlen." }),
    act({ id: "a11", routeSeed: 1.2, title: "Mein Samstagslauf Rü", sport: "run", meetingPoint: "Rüttenscheider Stern", startsAt: at(1, 9, 0), distanceKm: 9, tempo: 400, hostId: ME, maxParticipants: 6, participants: ["fatma"], beginnerFriendly: true, description: "Vom Stern über den Grugapark zum See und zurück. Gemütliches Tempo." }),
    act({ id: "a12", title: "Bahn-Intervalle (abgesagt)", sport: "run", meetingPoint: "Bochum Hbf, Vorplatz Ost", startsAt: at(1, 19, 0), distanceKm: 8, tempo: 300, hostId: "lena", maxParticipants: 6, participants: [ME, "niklas"], status: "cancelled", description: "Leider abgesagt.", messages: [msg("lena", "Ich muss leider absagen, die Bahn ist gesperrt. Sorry!", 60, false)] }),
    // Vergangene Aktivitäten (für Bestätigung und Liga)
    act({ id: "p1", routeSeed: 2.1, eventId: "ruhr-herbst", title: "Feierabendrunde am Baldeneysee", sport: "run", meetingPoint: "Baldeneysee, Regattatribüne", startsAt: at(-1, 18, 0), distanceKm: 8, tempo: 450, hostId: "jonas", participants: [ME, "fatma", "aylin"], selfConfirmed: ["fatma", "aylin"], hostConfirmed: [ME, "fatma", "aylin"], description: "Entspannte Runde am Nordufer." }),
    act({ id: "p2", routeSeed: 0.3, title: "Kaffeerunde Ruhrtal", sport: "ride", meetingPoint: "Ruhrbrücke Hattingen (Ruhrtalradweg)", startsAt: at(-4, 10, 0), distanceKm: 40, tempo: 22, hostId: "tim", participants: [ME, "julia"], selfConfirmed: [ME, "julia"], hostConfirmed: [ME, "julia"], description: "Ruhrtalradweg mit Pause." }),
    act({ id: "p3", routeSeed: 0.4, title: "Mein Grugapark-Lauf", sport: "run", meetingPoint: "Grugapark, Haupteingang Messe", startsAt: at(-6, 18, 30), distanceKm: 7, tempo: 410, hostId: ME, participants: ["fatma", "sophie", "jonas"], selfConfirmed: ["fatma", "sophie", "jonas"], hostConfirmed: [], description: "Zwei Runden Grugapark." }),
    act({ id: "p4", routeSeed: 3.3, eventId: "lth-jubi", title: "Offener Lauftreff Altstadt", sport: "run", meetingPoint: "Altstadt Hattingen, Untermarkt", startsAt: at(-10, 18, 30), distanceKm: 7, tempo: 420, hostId: "lth", participants: [ME, "julia", "tim"], selfConfirmed: [ME, "julia", "tim"], hostConfirmed: [ME, "julia", "tim"], description: "Wöchentlicher Treff." }),
  ];
}

export function buildDemoState(): AppState {
  const users: Record<string, User> = {};
  DEMO_USERS.forEach((x) => (users[x.id] = structuredClone(x)));
  return {
    version: 6,
    auth: "demo",
    onboarded: false,
    meId: ME,
    locationCity: "essen",
    radiusKm: 25,
    users,
    activities: buildDemoActivities(),
    events: buildEvents(),
    notifications: [
      { id: "n1", kind: "cancel", text: "Lena M. hat „Bahn-Intervalle“ abgesagt.", activityId: "a12", at: minsAgo(60), read: false },
      { id: "n2", kind: "join", text: "Fatma Y. nimmt an „Mein Samstagslauf Rü“ teil.", activityId: "a11", at: minsAgo(140), read: false },
      { id: "n3", kind: "reminder", text: "Hat „Feierabendrunde am Baldeneysee“ gestern stattgefunden? Bestätige deine Teilnahme.", activityId: "p1", at: minsAgo(400), read: true },
    ],
    settings: {
      theme: "system", units: "metric", language: "de-DE",
      profileVisibility: "participants", showPace: true, showHistory: false, showAwards: true,
      notify: { changes: true, chat: true, joins: true, reminders: true },
    },
    league: { optIn: false, visibility: "private" },
    blocked: [],
    reports: [],
  };
}
