-- PaceMeet: Teilen, Serien, Erinnerungen, Push-Abos

-------------------------------------------------------------------------------
-- 1. Öffentliche Vorschau für geteilte Links (auch ohne Konto)
--    Nur kommende, nicht abgesagte Aktivitäten, nur unkritische Felder,
--    vom Gastgeber nur der Anzeigename.
-------------------------------------------------------------------------------
create or replace function public.public_activity(p_id uuid)
returns table (
  id uuid, title text, sport text, city text, meeting_point text, lat double precision, lng double precision,
  starts_at timestamptz, distance_km numeric, tempo numeric, max_participants int, participant_count int,
  beginner_friendly boolean, breaks boolean, description text, route jsonb, host_name text, status text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.sport, a.city, a.meeting_point, a.lat, a.lng, a.starts_at, a.distance_km, a.tempo,
         a.max_participants, a.participant_count, a.beginner_friendly, a.breaks, a.description, a.route,
         display_name(a.host_id), a.status
  from activities a
  where a.id = p_id
    and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) > now()
$$;
revoke execute on function public.public_activity(uuid) from public;
grant execute on function public.public_activity(uuid) to anon, authenticated;

-------------------------------------------------------------------------------
-- 2. Wiederkehrende Aktivitäten (Serie, z. B. wöchentlicher Lauftreff)
-------------------------------------------------------------------------------
alter table public.activities add column if not exists series_id uuid;
create index if not exists activities_series_idx on public.activities (series_id);
grant insert (series_id) on public.activities to authenticated;

-- Alle kommenden Termine einer Serie absagen (nur Gastgeber)
create or replace function public.cancel_series(p_series uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update activities set status = 'cancelled'
  where series_id = p_series and host_id = auth.uid() and status = 'open' and starts_at > now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cancel_series(uuid) from public, anon;
grant execute on function public.cancel_series(uuid) to authenticated;

-------------------------------------------------------------------------------
-- 3. Automatische Erinnerungen
--    - ca. 2 Stunden vor dem Start an Gastgeber und Teilnehmende
--    - nach dem Ende: Bitte um Bestätigung
--    Jede Erinnerung wird pro Person und Aktivität nur einmal verschickt.
-------------------------------------------------------------------------------
create table if not exists public.reminder_log (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('start','confirm')),
  sent_at     timestamptz not null default now(),
  primary key (activity_id, user_id, kind)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

create or replace function public.send_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; n int;
begin
  -- Start-Erinnerung (Start in den nächsten 2 Stunden)
  with due as (
    select a.id, a.title, a.starts_at, a.meeting_point, m.uid
    from activities a
    cross join lateral (select a.host_id as uid union select p.user_id from activity_participants p where p.activity_id = a.id) m
    where a.status = 'open' and a.starts_at > now() and a.starts_at <= now() + interval '2 hours'
      and not exists (select 1 from reminder_log r where r.activity_id = a.id and r.user_id = m.uid and r.kind = 'start')
  ), logged as (
    insert into reminder_log (activity_id, user_id, kind) select id, uid, 'start' from due
    on conflict do nothing returning activity_id, user_id
  )
  insert into notifications (user_id, kind, body, activity_id)
  select d.uid, 'reminder',
         'Gleich geht''s los: „' || d.title || '“ um ' || to_char(d.starts_at at time zone 'Europe/Berlin', 'HH24:MI') || ' Uhr, Treffpunkt ' || d.meeting_point || '.',
         d.id
  from due d join logged l on l.activity_id = d.id and l.user_id = d.uid
  where wants_notification(d.uid, 'reminders');
  get diagnostics n = row_count; total := total + n;

  -- Bestätigung nach dem Ende (bis 24 Stunden danach)
  with ended as (
    select a.* from activities a
    where a.status = 'open'
      and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) <= now()
      and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) > now() - interval '24 hours'
      and a.participant_count > 0
  ), due as (
    -- Teilnehmende, die noch nicht bestätigt haben
    select e.id, e.title, p.user_id as uid, false as is_host
    from ended e join activity_participants p on p.activity_id = e.id and not p.self_confirmed
    union all
    -- Gastgeber, der noch niemanden bestätigt hat
    select e.id, e.title, e.host_id, true
    from ended e
    where not exists (select 1 from activity_participants p where p.activity_id = e.id and p.host_confirmed)
  ), fresh as (
    select d.* from due d
    where not exists (select 1 from reminder_log r where r.activity_id = d.id and r.user_id = d.uid and r.kind = 'confirm')
  ), logged as (
    insert into reminder_log (activity_id, user_id, kind) select id, uid, 'confirm' from fresh
    on conflict do nothing returning activity_id, user_id
  )
  insert into notifications (user_id, kind, body, activity_id)
  select f.uid, 'reminder',
         case when f.is_host then 'Wer war bei „' || f.title || '“ dabei? Hake kurz die Teilnehmenden ab.'
              else 'Warst du bei „' || f.title || '“ dabei? Bestätige kurz deine Teilnahme.' end,
         f.id
  from fresh f join logged l on l.activity_id = f.id and l.user_id = f.uid
  where wants_notification(f.uid, 'reminders');
  get diagnostics n = row_count; total := total + n;

  return total;
end $$;
revoke execute on function public.send_reminders() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 4. Push-Nachrichten: Abos pro Gerät
-------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke update on public.push_subscriptions from anon, authenticated;

-- Öffentliche App-Einstellungen (z. B. öffentlicher Push-Schlüssel), lesbar für alle
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
create policy app_config_select on public.app_config for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_config from anon, authenticated;

-- Geheime Server-Einstellungen (z. B. privater Push-Schlüssel), nur für den Server lesbar
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Merkt sich, welche Benachrichtigung schon als Push verschickt wurde (verhindert Doppelversand)
alter table public.notifications add column if not exists pushed_at timestamptz;
