# PaceMeet (Arbeitstitel)

**Gemeinsam statt allein.** Spontane und geplante gemeinsame Läufe und Radtouren organisieren.
Start in Deutschland, Datenmodell vorbereitet für weitere Länder.

## Zwei Modi

| | Demo-Modus | Live-Modus |
|---|---|---|
| Wann | ohne `.env` | mit `.env` (Supabase-Zugangsdaten) |
| Daten | Beispieldaten im Browser | echte Datenbank (Supabase, Frankfurt) |
| Andere Nutzer | simuliert | echte Konten |
| Anmeldung | keine | E-Mail + 6-stelliger Code |

Wie du live gehst, steht Schritt für Schritt in **[LAUNCH.md](LAUNCH.md)**.

## Starten

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build (installierbare Web-App) nach dist/
npm run test:db    # 86 Tests für Datenbankregeln (läuft lokal, ohne Supabase)
SINGLEFILE=1 npx vite build   # eine einzelne HTML-Datei (Demo zum Weitergeben)
```

## Technik

React 18 + TypeScript, Tailwind CSS, lucide-react, MapLibre GL, Vite, vite-plugin-pwa.
Backend: Supabase (Postgres mit Zugriffsregeln, Auth, Realtime, Storage).

## Projektstruktur

```
src/
  config/        app.ts (Name, Länder, Städte, Betreiberangaben), map.ts (Kartendienste), backend.ts (Live/Demo)
  backend/       supabase.ts – Laden, Schreiben, Anmeldung, Echtzeit
  store/         AppStore.tsx (Zustand + Demo-Aktionen), liveApi.ts (Live-Aktionen)
  components/    MapView (echte Karte), RouteMap (Skizze), RoutePlanner, MeetingPointPicker, ActivityCard, ui …
  screens/       Onboarding, Discover, CreateActivity, ActivityDetail, MyActivities, Chat, Profile, EditProfile,
                 League, Settings, Notifications, Legal
  lib/           routing.ts (Rundkurs, Start → Ziel), mapServices.ts (Suche), xp.ts (Liga), geo.ts, format.ts
  content/       legal.ts – Entwürfe für Impressum, Datenschutz, Nutzungsbedingungen
supabase/
  migrations/    Datenbankschema (000 Basis, 100 Fotos, 200 Teilen/Serien/Erinnerungen/Push, 300 Zeitpläne – nur Supabase)
  functions/     send-push – verschickt Push-Nachrichten (Edge Function, erzeugt ihre Schlüssel selbst)
  tests/         db.test.mjs (lokal, PGlite) und live_smoke_test.sql (in Supabase, rollt sich selbst zurück)
  email/         deutsche E-Mail-Vorlagen für den Anmeldecode
public/          App-Icons
LAUNCH.md        Anleitung zum Live-Schalten
```

## Funktionsstand

| Bereich | Stand |
|---|---|
| Entdecken: Liste und Karte, Suche, Filter | fertig |
| Aktivität erstellen/bearbeiten, Treffpunkt per Suche oder Pin auf der Karte | fertig |
| Route: Rundkurs mit Wunschlänge, Start → Ziel (mit Zwischenziel, Rückweg), selbst zeichnen, GPX | fertig |
| Rad- und lauffreundliches Routing mit Höhenmetern (BRouter, Ersatz OSRM) | fertig, braucht Internet |
| Teilnehmen, Absagen, Kapazität, Gruppenchat | fertig (Live: in Echtzeit) |
| Benachrichtigungen | in der App und als Push aufs Gerät (iPhone: nur installierte App) |
| Automatische Erinnerungen (2 h vorher, Bestätigung danach) | fertig (pg_cron alle 10 Min.) |
| Aktivität teilen mit öffentlicher Vorschau (`/#a-<id>`) | fertig |
| Wöchentliche Serien, ganze Serie absagen | fertig |
| Teilnahmebestätigung, Zuverlässigkeit, Community-Liga, Event-Medaillen | fertig (Punkte serverseitig) |
| Profil mit Foto, Alter (optional), Bestzeiten | fertig |
| Stadt frei wählbar in ganz Deutschland (Umkreissuche ab Stadtmittelpunkt) | fertig |
| Melden, Blockieren, Datenschutz-Einstellungen | fertig |
| Moderation in der App: Meldungen prüfen, Nutzer sperren/entsperren (nur Admins) | fertig |
| Community-Events mit Medaille in der App anlegen (nur Admins) | fertig |
| Konto löschen, Daten herunterladen | fertig (Live) |
| Installierbar als App (PWA) | fertig |
| Impressum, Datenschutz, Nutzungsbedingungen | Entwürfe, vor Start prüfen lassen |

### Sicherheit
Alle Regeln liegen in der Datenbank (Row Level Security), nicht in der App: Teilnehmerlisten und Chats sehen nur Mitglieder,
Zähler und Bestätigungen kann nur der Server ändern, Blockierungen gelten in beide Richtungen, Liga-Punkte werden
serverseitig aus doppelten Bestätigungen berechnet (keine Doppelpunkte, Tageslimit, keine Punkte für Tempo).

## Karten- und Routendienste

Konfiguration in `src/config/map.ts`. Alle kostenlos, ohne API-Schlüssel, auf Basis von OpenStreetMap:

| Zweck | Dienst |
|---|---|
| Kartenstil | OpenFreeMap (`positron`) |
| Ortssuche und Rückwärtssuche | Photon (Komoot) |
| Routing mit Höhenmetern | BRouter (`hiking-beta` Laufen, `fastbike-lowtraffic` Rennrad, `trekking` Tour/Gravel) |
| Ersatz-Routing | OSRM der FOSSGIS (`routing.openstreetmap.de`) |

Die öffentlichen Server haben Nutzungsgrenzen. Für viele Nutzer: selbst hosten (alles Open Source) oder einen Anbieter
mit Vertrag nehmen. Ohne erreichbaren Kartendienst zeigt die App automatisch eine Skizze.
