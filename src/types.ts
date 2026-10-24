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
  city: string;           // City-ID (nur ungefähre Region)
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
  /** Gemeinsame ID aller Termine einer wöchentlichen Serie */
  seriesId?: string;
  updatedAt?: string;
}

export type NotifKind = "change" | "cancel" | "join" | "chat" | "reminder" | "system";
export interface Notif { id: string; kind: NotifKind; text: string; activityId?: string; at: string; read: boolean; }

export interface Settings {
  theme: ThemeMode;
  units: Units;
  language: string;
  profileVisibility: "everyone" | "participants";
  showPace: boolean;
  showHistory: boolean;
  showAwards: boolean;
  notify: { changes: boolean; chat: boolean; joins: boolean; reminders: boolean };
}

export interface LeagueSettings { optIn: boolean; visibility: "private" | "friends" | "local"; }

export interface Report { userId: string; reason: string; at: string; }

export type AuthStatus = "demo" | "loading" | "signedOut" | "needsProfile" | "ready";
export interface LeagueRow { userId: string; name: string; photo?: string; monthXp: number; isMe: boolean; }

export interface AppState {
  version: number;
  auth: AuthStatus;
  email?: string;
  leagueBoard?: { local: LeagueRow[]; friends: LeagueRow[] };
  onboarded: boolean;
  meId: string;
  locationCity: string;
  radiusKm: number;
  users: Record<string, User>;
  activities: Activity[];
  events: AppEvent[];
  notifications: Notif[];
  settings: Settings;
  league: LeagueSettings;
  blocked: string[];
  reports: Report[];
}
