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
for (const f of fs.readdirSync(MIG).sort().filter((f) => !f.includes("schedules"))) { // Zeitpläne brauchen pg_cron/pg_net (nur Supabase)
  await db.exec(fs.readFileSync(`${MIG}/${f}`, "utf8")); console.log("Migration geladen:", f); }

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

// --- Neue Funktionen: Teilen, Serien, Erinnerungen, Push ---
await db.exec("reset role");
const pub = (await db.query(`insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ($1, 'Geteilt', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '90 minutes', 5, 400, 6) returning id`, [U.A])).rows[0].id;
const prev = (await as(null, "select * from public_activity($1)", [pub])).rows;
ok(prev.length === 1 && prev[0].host_name === "Nutzer A" && !("host_id" in prev[0]), "Öffentliche Vorschau ohne Konto: Titel und Vorname, keine Nutzer-ID");
ok((await as(null, "select * from public_activity($1)", [past])).rows.length === 0, "Vergangene Aktivitäten haben keine öffentliche Vorschau");

const series = "11111111-2222-3333-4444-555555555555";
for (let i = 0; i < 3; i++) {
  await as(U.E, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants, series_id)
    values ('Wöchentlich', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '${i * 7 + 1} days', 5, 400, 10, $1)`, [series]);
}
ok((await fails(U.A, "select cancel_series($1)", [series])) === null && (await as(U.E, "select count(*)::int c from activities where series_id=$1 and status='open'", [series])).rows[0].c === 3, "Fremde können eine Serie nicht absagen");
ok((await as(U.E, "select cancel_series($1) as n", [series])).rows[0].n === 3, "Gastgeber sagt alle 3 kommenden Termine der Serie ab");

// Erinnerungen: C tritt der in 90 Minuten startenden Aktivität bei
await as(U.C, "select join_activity($1)", [pub]);
await db.exec("reset role");
const r1 = (await db.query("select send_reminders() as n")).rows[0].n;
const r2 = (await db.query("select send_reminders() as n")).rows[0].n;
ok(r2 === 0, `Erinnerungen werden nicht doppelt verschickt (1. Lauf: ${r1}, 2. Lauf: ${r2})`);
ok((await as(U.C, "select body from notifications where kind='reminder' and activity_id=$1", [pub])).rows.some((r) => r.body.includes("Gleich geht")), "Start-Erinnerung an Teilnehmende");
ok((await as(U.A, "select body from notifications where kind='reminder' and activity_id=$1", [pub])).rows.length === 1, "Start-Erinnerung an Gastgeber");
// Bestätigungs-Erinnerung für eine gerade beendete Aktivität
await db.exec("reset role");
const done = (await db.query(`insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants, participant_count)
  values ($1, 'Eben vorbei', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() - interval '2 hours', 5, 400, 6, 1) returning id`, [U.A])).rows[0].id;
await db.query("insert into activity_participants (activity_id, user_id) values ($1, $2)", [done, U.C]);
await db.query("select send_reminders()");
ok((await as(U.C, "select body from notifications where activity_id=$1", [done])).rows.some((r) => r.body.includes("Warst du")), "Nach dem Ende: Teilnehmende werden um Bestätigung gebeten");
ok((await as(U.A, "select body from notifications where activity_id=$1", [done])).rows.some((r) => r.body.includes("Wer war")), "Nach dem Ende: Gastgeber wird gebeten abzuhaken");
ok((await fails(U.C, "select send_reminders()")) !== null, "Erinnerungen kann nur der Server auslösen");

// Push-Abos
await as(U.C, "insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/c1', 'k', 'a')");
ok((await as(U.C, "select user_id from push_subscriptions")).rows[0]?.user_id === U.C, "Push-Abo wird dem eigenen Konto zugeordnet");
ok((await as(U.D, "select * from push_subscriptions")).rows.length === 0, "Fremde Push-Abos sind unsichtbar");
ok((await fails(U.D, "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/x', 'k', 'a')", [U.C])) !== null, "Push-Abo für fremdes Konto wird verweigert");
ok((await fails(U.C, "select * from app_secrets")) !== null || (await as(U.C, "select * from app_secrets")).rows.length === 0, "Geheime Server-Einstellungen sind gesperrt");
ok((await fails(U.C, "update notifications set pushed_at = now()")) !== null, "Versandstatus von Benachrichtigungen ist nicht änderbar");

// Moderation
await db.exec("reset role");
await db.query("delete from blocks");
await db.query("insert into admins (user_id) values ($1)", [U.A]);
await as(U.C, "insert into reports (reported_id, reason) values ($1, 'Spam im Chat')", [U.D]);
ok((await fails(U.C, "select * from admin_reports('open')"))?.includes("Nur für Admins"), "Meldungen sehen nur Admins");
ok((await fails(U.C, "select * from admins")) !== null || (await as(U.C, "select * from admins")).rows.length === 0, "Admin-Liste ist nicht lesbar");
const rep = (await as(U.A, "select * from admin_reports('open')")).rows;
ok(rep.some((r) => r.reported_name === "Nutzer D" && r.reporter_name === "Nutzer C" && r.reason === "Spam im Chat"), "Admin sieht Meldung mit Namen und Grund");
ok((await as(U.A, "select is_admin from my_status()")).rows[0].is_admin === true && (await as(U.C, "select is_admin from my_status()")).rows[0].is_admin === false, "Admin-Status abfragbar");
ok((await fails(U.D, "update profiles set suspended_at = null where id = $1", [U.D])) !== null, "Nutzer können ihre Sperre nicht selbst ändern");
// D hat eine kommende Aktivität mit Teilnehmer E
await db.exec("reset role");
const dAct = (await db.query(`insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants, participant_count)
  values ($1, 'Ds Runde', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '1 day', 5, 400, 6, 1) returning id`, [U.D])).rows[0].id;
await db.query("insert into activity_participants (activity_id, user_id) values ($1, $2)", [dAct, U.E]);
ok((await fails(U.C, "select admin_suspend($1, 'Test')", [U.D]))?.includes("Nur für Admins"), "Nur Admins können sperren");
ok((await fails(U.A, "select admin_suspend($1, 'Test')", [U.A]))?.includes("selbst"), "Admin kann sich nicht selbst sperren");
await as(U.A, "select admin_suspend($1, 'Spam')", [U.D]);
ok((await as(U.E, "select status from activities where id=$1", [dAct])).rows.length === 0, "Aktivitäten gesperrter Nutzer sind für andere unsichtbar");
await db.exec("reset role");
ok((await db.query("select status from activities where id=$1", [dAct])).rows[0].status === "cancelled", "Kommende Aktivitäten gesperrter Nutzer werden abgesagt");
ok((await db.query("select count(*)::int c from notifications where user_id=$1 and activity_id=$2 and kind='cancel'", [U.E, dAct])).rows[0].c === 1, "Teilnehmende werden über die Absage informiert");
ok((await as(U.C, "select id from profiles where id=$1", [U.D])).rows.length === 0, "Profil gesperrter Nutzer ist unsichtbar");
ok((await as(U.D, "select suspended, suspended_reason from my_status()")).rows[0].suspended === true, "Gesperrte Person sieht ihren Status");
ok((await fails(U.D, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ('Neu', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '2 days', 5, 400, 6)`))?.includes("gesperrt"), "Gesperrte können keine Aktivität anlegen");
const openAct = (await as(U.A, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ('Offen für alle', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '2 days', 5, 400, 6) returning id`)).rows[0].id;
ok((await fails(U.D, "select join_activity($1)", [openAct]))?.includes("gesperrt"), "Gesperrte können nicht beitreten");
ok((await as(U.A, "select status from admin_reports('done')")).rows.some((r) => r.status === "actioned"), "Offene Meldungen werden beim Sperren erledigt");
await as(U.A, "select admin_unsuspend($1)", [U.D]);
ok((await fails(U.D, "select join_activity($1)", [openAct])) === null, "Nach dem Entsperren ist Teilnahme wieder möglich");
await as(U.A, "select admin_set_report_status(id, 'dismissed') from admin_reports('all')");
ok((await as(U.A, "select count(*)::int c from admin_reports('open')")).rows[0].c === 0, "Meldungen können als erledigt markiert werden");

// Events durch Admins
ok((await fails(U.C, "insert into events (id, name, starts_on, ends_on, required, medal) values ('x1', 'Fake-Event', now(), now() + interval '3 days', 1, 'Fake')")) !== null, "Nur Admins können Events anlegen");
await as(U.A, "insert into events (id, name, starts_on, ends_on, required, medal, description) values ('winter', 'Winterlauf-Woche', now(), now() + interval '7 days', 2, 'Winterläufer', 'Zwei gemeinsame Läufe')");
ok((await as(U.C, "select name from events where id = 'winter'")).rows[0]?.name === "Winterlauf-Woche", "Admin-Event ist für alle sichtbar");
ok((await fails(U.A, "insert into events (id, name, starts_on, ends_on, required, medal) values ('bad', 'Falsch', now(), now() - interval '1 day', 1, 'X1')")) !== null, "Event-Ende vor Beginn wird verweigert");
ok((await fails(U.C, "delete from events where id = 'winter'")) === null && (await as(U.C, "select count(*)::int c from events where id = 'winter'")).rows[0].c === 1, "Nicht-Admins können Events nicht löschen");
await as(U.A, "delete from events where id = 'winter'");
ok((await as(U.C, "select count(*)::int c from events where id = 'winter'")).rows[0].c === 0, "Admin kann Event löschen");

// Hinweise bei neuen passenden Aktivitäten in der Nähe
await db.exec("reset role");
await db.query("update profiles set city='essen', city_lat=51.46, city_lng=7.01, pace=330, speed=26, sports='{run,ride}' where id=$1", [U.C]);
await db.query("update profiles set city='essen', city_lat=51.46, city_lng=7.01, pace=420, sports='{run}' where id=$1", [U.E]);
await db.query("update profile_private set settings = jsonb_set(settings, '{alerts}', '{\"on\": true, \"radiusKm\": 15, \"auto\": true, \"runMaxKm\": 12, \"rideMaxKm\": 80}') where id=$1", [U.C]);
await db.query("update profile_private set settings = jsonb_set(settings, '{alerts}', '{\"on\": false}') where id=$1", [U.E]);
const nearCount = async (u) => { await db.exec("reset role"); return (await db.query("select count(*)::int c from notifications where user_id=$1 and kind='nearby'", [u])).rows[0].c; };
const mk = (title, tempo, km, lat = 51.43, sport = 'run') => as(U.A, `insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
  values ($1, $5, 'essen', 'Grugapark', $4, 7.0, now() + interval '2 days', $3, $2, 6) returning id`, [title, tempo, km, lat, sport]);
const c0 = await nearCount(U.C);
await mk("Passt genau", 340, 8);
ok(await nearCount(U.C) === c0 + 1, "Passende Aktivität in der Nähe löst einen Hinweis aus");
const nb = (await db.query("select body from notifications where user_id=$1 and kind='nearby' order by created_at desc limit 1", [U.C])).rows[0].body;
ok(nb.includes("Passt genau") && nb.includes("5:40 /km") && nb.includes("km entfernt"), "Hinweistext nennt Titel, Tempo und Entfernung: " + nb);
await mk("Viel zu schnell", 270, 8);
ok(await nearCount(U.C) === c0 + 1, "Zu schnelle Läufe lösen keinen Hinweis aus");
await mk("Viel zu lang", 340, 21);
ok(await nearCount(U.C) === c0 + 1, "Zu lange Läufe lösen keinen Hinweis aus");
await mk("Zu weit weg", 340, 8, 51.8);
ok(await nearCount(U.C) === c0 + 1, "Aktivitäten außerhalb des Umkreises lösen keinen Hinweis aus");
await mk("Radrunde", 25, 50, 51.43, 'ride');
ok(await nearCount(U.C) === c0 + 2, "Passende Radtour löst einen Hinweis aus");
ok(await nearCount(U.E) === 0, "Ausgeschaltete Hinweise bleiben aus");
ok(await nearCount(U.A) === 0, "Gastgeber bekommt keinen Hinweis zur eigenen Aktivität");
await db.query("update profile_private set settings = jsonb_set(settings, '{alerts}', '{\"on\": true, \"radiusKm\": 15, \"auto\": false, \"runPaceMin\": 260, \"runPaceMax\": 300, \"runMaxKm\": 12}') where id=$1", [U.C]);
await mk("Tempo selbst gewählt", 280, 8);
ok(await nearCount(U.C) === c0 + 3, "Eigene Tempo-Spanne wird beachtet");

// Konto löschen
await as(U.B, "select delete_my_account()");
await db.exec("reset role");
ok((await db.query("select * from profiles where id=$1", [U.B])).rows.length === 0, "Konto löschen entfernt Profil und Daten");
ok((await db.query("select * from messages where user_id=$1", [U.B])).rows.length === 0, "Konto löschen entfernt eigene Nachrichten");
console.log(process.exitCode ? "\nEs gibt Fehler." : "\nAlle Tests bestanden.");
