export type SportId = "run" | "ride";
export type TempoKind = "pace" | "speed";
export type Units = "metric" | "imperial";
export type ThemeMode = "system" | "light" | "dark";

export interface Sport {
  id: SportId;
  label: string;
  /** pace = Sekunden pro km, speed = km/h */
  tempo: TempoKind;
  defaultTempo: number;
  defaultDistance: number;
}

export interface Reliability {
  attended: number;       // bestätigte Teilnahmen
  hosted: number;         // stattgefundene, organisierte Aktivitäten
  lateCancels: number;    // Absagen < 2 h vor Start
  memberSince: string;    // ISO
}

export interface User {
  id: string;
  name: string;           // Vorname + Initial (öffentlich)
  city: string;           // Stadtname bzw. Kürzel (nur ungefähre Region)
  cityPos?: [number, number]; // Stadtmittelpunkt, keine Wohnadresse
  sports: SportId[];
  pace: number;           // sek/km
  speed: number;          // km/h
  bio: string;
  hue: number;            // Avatar-Farbe
  photo?: string;         // data-URL (optional)
  kind?: "person" | "club";
  age?: number;           // optional, freiwillig
  showAge?: boolean;
  bests: Best[];          // Bestzeiten / Bestleistungen (keine Liga-Punkte!)
  reliability: Reliability;
  league?: { optIn: boolean; xp: number; monthXp: number };
}

export interface Best { id: string; sport: SportId; label: string; value: string; }

/** Geplante Route als Liste von [lat, lng]. */
export type BikeType = "road" | "tour";

export interface Route {
  mode: "planned" | "spontaneous";
  points: [number, number][];
  source?: "drawn" | "gpx" | "loop" | "a2b";
  /** Höhenmeter bergauf, falls bekannt */
  ascentM?: number;
  /** Ziel bei Start → Ziel */
  destination?: string;
  bikeType?: BikeType;
  note?: string;
}

export interface AppEvent {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Wie viele Aktivitäten im Zeitraum für die Medaille nötig sind */
  required: number;
  medal: string;      // Kurzname der Medaille
  hue: number;
  description: string;
}

export interface Message { id: string; userId: string; text: string; at: string; system?: boolean; }

export type ActivityStatus = "open" | "cancelled";

export interface Activity {
  id: string;
  title: string;
  sport: SportId;
  city: string;
  meetingPoint: string;
  lat: number;
  lng: number;
  startsAt: string;
  distanceKm: number;
  tempo: number;
  maxParticipants: number;  // inkl. Gastgeber
  description: string;
  beginnerFriendly: boolean;
  breaks: boolean;
  hostId: string;
  participants: string[];   // ohne Gastgeber (im Live-Modus nur sichtbar für Mitglieder)
  /** Anzahl Teilnehmende ohne Gastgeber, vom Server (Live-Modus) */
  participantCount?: number;
  status: ActivityStatus;
  /** Wer selbst bestätigt hat, dabei gewesen zu sein */
  selfConfirmed: string[];
  /** Wen der Gastgeber als anwesend bestätigt hat */
  hostConfirmed: string[];
  messages: Message[];
  route?: Route;
  eventId?: string;
  /** Gemeinsame ID aller Termine einer Serie */
  seriesId?: string;
  /** Rhythmus der Serie (Demo direkt, live per series_info nachgeladen) */
  seriesRule?: SeriesRule;
  /** Gehört zu einer Gruppe */
  groupId?: string;
  /** "group" = nur für Mitglieder der Gruppe sichtbar */
  visibility?: "public" | "group";
  updatedAt?: string;
}

export type NotifKind = "change" | "cancel" | "join" | "chat" | "reminder" | "system" | "nearby" | "group";

/** Wiederholung: Wochentage (1 = Montag … 7 = Sonntag), Rhythmus und Ende */
export interface SeriesRule {
  weekdays: number[];
  intervalWeeks: 1 | 2;
  /** Uhrzeit "HH:MM" (Ortszeit) */
  time: string;
  /** Erster möglicher Tag "YYYY-MM-DD" */
  startDate: string;
  /** Ende als Datum (optional) */
  untilDate?: string;
  /** Ende nach Anzahl Terminen (optional); ohne beides läuft die Serie weiter */
  maxCount?: number;
  active?: boolean;
}

export type GroupKind = "club" | "verein";
export type GroupRole = "owner" | "admin" | "member";
export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  description: string;
  city: string;
  cityPos?: [number, number];
  sports: SportId[];
  joinMode: "open" | "request";
  listed: boolean;
  postMode: "members" | "admins";
  hue: number;
  website?: string;
  memberCount: number;
  ownerId?: string;
  ownerName?: string;
  /** eigene Rolle, falls Mitglied */
  myRole?: GroupRole;
  myStatus?: "active" | "pending";
}
export interface GroupMember { userId: string; name: string; photo?: string; role: GroupRole; status: "active" | "pending"; joinedAt: string; }
export interface Notif { id: string; kind: NotifKind; text: string; activityId?: string; at: string; read: boolean; }

export interface Settings {
  theme: ThemeMode;
  units: Units;
  language: string;
  profileVisibility: "everyone" | "participants";
  showPace: boolean;
  showHistory: boolean;
  showAwards: boolean;
  notify: { changes: boolean; chat: boolean; joins: boolean; reminders: boolean; groups: boolean };
  alerts: AlertPrefs;
}

/** Hinweis bei neuen passenden Aktivitäten in der Nähe (wird auch auf dem Server ausgewertet). */
export interface AlertPrefs {
  on: boolean;
  radiusKm: number;
  /** leer = Sportarten aus dem Profil */
  sports?: SportId[];
  /** true = Tempo passend zum eigenen Profil-Tempo */
  auto: boolean;
  runPaceMin?: number; runPaceMax?: number;   // s/km
  rideSpeedMin?: number; rideSpeedMax?: number; // km/h
  runMaxKm: number; rideMaxKm: number;
}

export interface LeagueSettings { optIn: boolean; visibility: "private" | "friends" | "local"; }

export interface Report { userId: string; reason: string; at: string; }

export type AuthStatus = "demo" | "loading" | "signedOut" | "needsProfile" | "ready" | "error";
export interface LeagueRow { userId: string; name: string; photo?: string; monthXp: number; isMe: boolean; }

export interface AppState {
  version: number;
  auth: AuthStatus;
  email?: string;
  leagueBoard?: { local: LeagueRow[]; friends: LeagueRow[] };
  /** Live-Modus: eigene Rolle und Sperrstatus */
  myStatus?: { isAdmin: boolean; suspended: boolean; reason?: string };
  /** Live-Modus: letzter Ladefehler (für den Ladebildschirm) */
  liveError?: string;
  onboarded: boolean;
  meId: string;
  locationCity: string;      // Name (oder Kürzel aus CITIES) der gewählten Stadt
  locationPos?: [number, number]; // Mittelpunkt der gewählten Stadt
  radiusKm: number;
  users: Record<string, User>;
  activities: Activity[];
  events: AppEvent[];
  notifications: Notif[];
  settings: Settings;
  league: LeagueSettings;
  blocked: string[];
  reports: Report[];
  /** Eigene Gruppen und Gruppen in der Nähe */
  groups: Group[];
  /** Mitgliederlisten (nur geladen, wenn geöffnet) */
  groupMembers: Record<string, GroupMember[]>;
}
