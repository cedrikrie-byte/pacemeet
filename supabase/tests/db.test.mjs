import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const MIG = process.argv[2] ?? new URL("../migrations", import.meta.url).pathname;
process.on("unhandledRejection", (e) => { console.log("ABBRUCH:", e.message, e.where ?? "", e.internalQuery ?? ""); process.exit(1); });
const db = new PGlite();
const ok = (c, m) => { console.log((c ? "✓ " : "✗ FEHLER: ") + m); if (!c) process.exitCode = 1; };

// --- Supabase-Umgebung nachbilden ---
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create publication supabase_realtime;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;
`);
for (const f of fs.readdirSync(MIG).sort()) { await db.exec(fs.readFileSync(`${MIG}/${f}`, "utf8")); console.log("Migration geladen:", f); }

const U = { A: "00000000-0000-0000-0000-00000000000a", B: "00000000-0000-0000-0000-00000000000b", C: "00000000-0000-0000-0000-00000000000c", D: "00000000-0000-0000-0000-00000000000d", E: "00000000-0000-0000-0000-00000000000e" };
for (const [k, id] of Object.entries(U)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, k + "@test.de"]);

async function as(user, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
async function fails(user, sql, params = []) { try { await as(user, sql, params); return null; } catch (e) { return e.message; } }

// Profile anlegen
for (const [k, id] of Object.entries(U)) {
  await as(id, "insert into profiles (id, name, city, profile_visibility, league_opt_in, league_visibility) values ($1, $2, 'essen', $3, $4, $5)",
    [id, "Nutzer " + k, k === "E" ? "everyone" : "participants", k !== "E", k === "C" ? "private" : "local"]);
  await as(id, "insert into profile_private (id, age) values ($1, 30)", [id]);
}
ok((await fails(U.A, "insert into profiles (id, name) values ($1, 'Fremd')", [U.B])) !== null, "Profil für fremde ID anlegen wird verweigert");
ok((await as(U.B, "select * from profile_private")).rows.length === 1, "Private Profildaten: nur eigene sichtbar");

// Aktivität anlegen
const act = (await as(U.A, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ('Feierabendrunde', 'run', 'essen', 'Baldeneysee', 51.4065, 7.0257, now() + interval '3 hours', 8, 450, 3) returning id, host_id`)).rows[0];
ok(act.host_id === U.A, "Gastgeber wird automatisch gesetzt");
ok((await fails(U.A, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ('Vergangen', 'run', 'essen', 'Baldeneysee', 51.4, 7.0, now() - interval '1 hour', 8, 450, 3)`)) !== null, "Aktivität in der Vergangenheit wird verweigert");
ok((await fails(U.A, "update activities set participant_count = 99 where id = $1", [act.id])) !== null, "Teilnehmerzähler ist nicht direkt änderbar");
ok((await fails(U.B, "update activities set title = 'Gekapert' where id = $1", [act.id])) === null && (await as(U.A, "select title from activities where id=$1", [act.id])).rows[0].title === "Feierabendrunde", "Fremde können die Aktivität nicht ändern");

// Umkreissuche
ok((await as(U.D, "select id from activities_near(51.4556, 7.0116, 25)")).rows.length === 1, "Umkreissuche findet die Aktivität (Essen, 25 km)");
ok((await as(U.D, "select id from activities_near(52.52, 13.40, 25)")).rows.length === 0, "Umkreissuche in Berlin findet nichts");

// Profil des Gastgebers sichtbar (aktueller Gastgeber), anderes privates Profil nicht
ok((await as(U.D, "select id from profiles where id = $1", [U.A])).rows.length === 1, "Gastgeber-Profil ist sichtbar");
ok((await as(U.D, "select id from profiles where id = $1", [U.B])).rows.length === 0, "Profil mit Sichtbarkeit „Nur Mitlaufende“ ist für Fremde verborgen");
ok((await as(U.D, "select id from profiles where id = $1", [U.E])).rows.length === 1, "Profil mit Sichtbarkeit „Alle“ ist sichtbar");

// Teilnehmen
await as(U.B, "select join_activity($1)", [act.id]);
await as(U.B, "select join_activity($1)", [act.id]); // doppelt
let a = (await as(U.D, "select participant_count from activities where id=$1", [act.id])).rows[0];
ok(a.participant_count === 1, "Doppelte Anmeldung zählt nur einmal");
await as(U.C, "select join_activity($1)", [act.id]);
ok((await fails(U.D, "select join_activity($1)", [act.id]))?.includes("ausgebucht"), "Ausgebucht bei max. 3 Personen (inkl. Gastgeber)");
ok((await fails(U.A, "select join_activity($1)", [act.id]))?.includes("organisierst"), "Gastgeber kann nicht teilnehmen");
ok((await as(U.D, "select * from activity_participants where activity_id=$1", [act.id])).rows.length === 0, "Teilnehmerliste ist für Nicht-Mitglieder verborgen");
ok((await as(U.B, "select * from activity_participants where activity_id=$1", [act.id])).rows.length === 2, "Mitglieder sehen die Teilnehmerliste");
ok((await as(U.D, "select id from profiles where id = $1", [U.B])).rows.length === 0 && (await as(U.C, "select id from profiles where id = $1", [U.B])).rows.length === 1, "Mitlaufende sehen sich gegenseitig, Fremde nicht");
ok((await as(U.A, "select * from notifications where kind='join'")).rows.length === 2, "Gastgeber erhält Benachrichtigungen über neue Teilnehmende");

// Chat
await as(U.B, "insert into messages (activity_id, user_id, body) values ($1, $2, 'Hallo zusammen!')", [act.id, U.B]);
ok((await fails(U.D, "insert into messages (activity_id, user_id, body) values ($1, $2, 'Spam')", [act.id, U.D])) !== null, "Nicht-Mitglieder können nicht in den Chat schreiben");
ok((await fails(U.B, "insert into messages (activity_id, user_id, body, is_system) values ($1, $2, 'Fake', true)", [act.id, U.B])) !== null, "Systemnachrichten können nicht gefälscht werden");
ok((await as(U.D, "select * from messages where activity_id=$1", [act.id])).rows.length === 0, "Chat ist für Nicht-Mitglieder unsichtbar");
const msgs = (await as(U.C, "select body, is_system from messages where activity_id=$1 order by created_at", [act.id])).rows;
ok(msgs.length === 3 && msgs.filter((m) => m.is_system).length === 2, "Chat enthält Systemnachrichten zu Beitritten und die Nachricht");
await as(U.B, "insert into messages (activity_id, user_id, body) values ($1, $2, 'Noch was')", [act.id, U.B]);
ok((await as(U.C, "select * from notifications where kind='chat'")).rows.length === 1, "Chat-Benachrichtigungen werden zusammengefasst (nur eine ungelesene)");
ok((await fails(U.C, "update notifications set body='x' where user_id=$1", [U.C])) !== null, "Benachrichtigungstext ist nicht änderbar");
await as(U.C, "update notifications set read = true where user_id=$1", [U.C]);
ok((await as(U.C, "select count(*)::int c from notifications where not read")).rows[0].c === 0, "Benachrichtigungen als gelesen markieren");

// Änderung durch Gastgeber
await as(U.A, "update activities set starts_at = now() + interval '4 hours', meeting_point = 'Regattatribüne' where id=$1", [act.id]);
const ch = (await as(U.B, "select body from notifications where kind='change'")).rows;
ok(ch.length === 1 && ch[0].body.includes("Startzeit") && ch[0].body.includes("Treffpunkt"), "Teilnehmende werden über Änderungen benachrichtigt: " + ch[0]?.body);
ok((await fails(U.A, "update activities set max_participants = 2 where id=$1", [act.id]))?.includes("bereits"), "Max. Teilnehmende kann nicht unter Anmeldezahl sinken");

// Absage durch Teilnehmende (kurzfristig < 2 h?) – hier 4 h vorher, also nicht kurzfristig
await as(U.C, "select leave_activity($1)", [act.id]);
ok((await as(U.D, "select participant_count from activities where id=$1", [act.id])).rows[0].participant_count === 1, "Absage gibt den Platz frei");
ok((await as(U.C, "select late from cancellations")).rows[0].late === false, "Absage 4 h vorher gilt nicht als kurzfristig");

// Blockieren
await as(U.D, "insert into blocks (blocker_id, blocked_id) values ($1, $2)", [U.D, U.A]);
ok((await as(U.D, "select id from activities_near(51.4556, 7.0116, 25)")).rows.length === 0, "Blockierte Gastgeber: Aktivitäten verschwinden");
ok((await as(U.A, "select id from profiles where id=$1", [U.D])).rows.length === 0, "Blockierung wirkt in beide Richtungen");
ok((await fails(U.D, "select join_activity($1)", [act.id])) !== null, "Blockierte können nicht beitreten");

// Vergangene Aktivität für Bestätigung und Liga (als Admin angelegt)
await db.exec("reset role");
const past = (await db.query(`insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants, participant_count)
  values ($1, 'Gestern', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() - interval '1 day', 6, 420, 8, 3) returning id`, [U.A])).rows[0].id;
for (const u of [U.B, U.C, U.E]) await db.query("insert into activity_participants (activity_id, user_id) values ($1, $2)", [past, u]);
await as(U.B, "select confirm_attendance($1)", [past]);
await as(U.C, "select confirm_attendance($1)", [past]);
ok((await fails(U.D, "select confirm_attendance($1)", [past]))?.includes("nicht angemeldet"), "Nur Angemeldete können bestätigen");
ok((await fails(U.B, "select confirm_attendance($1)", [act.id]))?.includes("nach dem Ende"), "Bestätigung erst nach dem Ende");
ok((await fails(U.B, "select host_confirm($1, $2)", [past, [U.B]])) !== null, "Nur der Gastgeber bestätigt die Anwesenheit");
await as(U.A, "select host_confirm($1, $2)", [past, [U.B, U.C, U.E]]);

const lb = (await as(U.B, "select kind, xp from league_entries()")).rows;
ok(lb.length === 2 && lb.some((e) => e.kind === "attend" && e.xp === 100) && lb.some((e) => e.kind === "newGroup" && e.xp === 75), "B: 100 XP Teilnahme + 75 XP neue Gruppe");
const le = (await as(U.E, "select kind, xp from league_entries()")).rows;
ok(le.length === 0, "E hat nicht selbst bestätigt: keine Punkte (Gastgeber allein reicht nicht)");
const la = (await as(U.A, "select kind, xp from league_entries()")).rows;
ok(la.length === 1 && la[0].kind === "host" && la[0].xp === 150, "A: 150 XP fürs Organisieren (2 doppelt bestätigte Teilnehmende)");
ok((await fails(U.B, "select * from _league_entries($1)", [U.A])) !== null, "Interne Punkteberechnung für andere Nutzer gesperrt");

const board = (await as(U.B, "select name, month_xp, is_me from league_board('local')")).rows;
ok(board.length === 3 && board[0].name === "Nutzer B" && board[0].month_xp === 175 && board[1].month_xp === 150 && !board.some((r) => r.name === "Nutzer C" || r.name === "Nutzer E"), "Lokale Rangliste: B 175, A 150, D 0; C (privat) und E (nicht in der Liga) fehlen");
const boardC = (await as(U.C, "select name, is_me from league_board('local')")).rows;
ok(boardC.some((r) => r.is_me), "Private Nutzer sehen sich selbst in der Rangliste");
const rel = (await as(U.D, "select * from reliability($1)", [U.B])).rows[0];
ok(rel.attended === 1, "Zuverlässigkeit: B hat 1 bestätigte Teilnahme");

// Doppelte Punkte: mehrere Aktivitäten am selben Tag
await db.exec("reset role");
for (let i = 0; i < 3; i++) {
  const id = (await db.query(`insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
    values ($1, 'Serie ${i}', 'run', 'essen', 'Grugapark', 51.43, 7.0, date_trunc('day', now() - interval '3 days') + interval '8 hours' + interval '${i} hours', 3, 400, 8) returning id`, [U.E])).rows[0].id;
  await db.query("insert into activity_participants (activity_id, user_id, self_confirmed, host_confirmed) values ($1, $2, true, true)", [id, U.D]);
}
const ld = (await as(U.D, "select xp from league_entries()")).rows;
ok(ld.filter((e) => e.xp > 0).length === 3 && ld.filter((e) => e.xp === 0).length === 1, "Tageslimit: 3. Aktivität am selben Tag bringt 0 XP");

// Absage durch Gastgeber
await db.exec("reset role"); await db.query("delete from blocks");
await as(U.A, "update activities set status='cancelled' where id=$1", [act.id]);
ok((await as(U.B, "select * from notifications where kind='cancel'")).rows.length === 1, "Absage: Teilnehmende werden benachrichtigt");
ok((await fails(U.A, "update activities set status='open' where id=$1", [act.id]))?.includes("Abgesagte"), "Abgesagte Aktivität kann nicht wieder geöffnet werden");

// Melden
await as(U.B, "insert into reports (reported_id, reason) values ($1, 'Unangemessenes Verhalten')", [U.A]);
ok((await as(U.A, "select * from reports")).rows.length === 0, "Gemeldete sehen keine Meldungen");

// Anonym
ok((await fails(null, "select * from activities")) !== null || (await as(null, "select * from activities")).rows.length === 0, "Ohne Anmeldung keine Aktivitäten");

// Konto löschen
await as(U.B, "select delete_my_account()");
await db.exec("reset role");
ok((await db.query("select * from profiles where id=$1", [U.B])).rows.length === 0, "Konto löschen entfernt Profil und Daten");
ok((await db.query("select * from messages where user_id=$1", [U.B])).rows.length === 0, "Konto löschen entfernt eigene Nachrichten");
console.log(process.exitCode ? "\nEs gibt Fehler." : "\nAlle Tests bestanden.");
