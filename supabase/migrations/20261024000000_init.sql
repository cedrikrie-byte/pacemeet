-- PaceMeet: Datenbankschema für Supabase (Postgres)
-- Alle Regeln (Sichtbarkeit, Teilnahme, Punkte) liegen hier auf dem Server.
-- Die App darf nur das, was diese Regeln erlauben.

-------------------------------------------------------------------------------
-- Tabellen
-------------------------------------------------------------------------------

create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 2 and 30),
  city               text not null default '',
  sports             text[] not null default '{run}' check (cardinality(sports) > 0 and sports <@ array['run','ride']::text[]),
  pace               int not null default 390 check (pace between 150 and 900),          -- Sekunden pro km
  speed              numeric(4,1) not null default 24 check (speed between 8 and 50),     -- km/h
  bio                text not null default '' check (char_length(bio) <= 200),
  public_age         int check (public_age between 16 and 99),                          -- nur gesetzt, wenn Nutzer das Alter zeigen will
  photo_url          text,
  bests              jsonb not null default '[]'::jsonb,
  kind               text not null default 'person' check (kind in ('person','club')),
  profile_visibility text not null default 'participants' check (profile_visibility in ('everyone','participants')),
  league_opt_in      boolean not null default false,
  league_visibility  text not null default 'private' check (league_visibility in ('private','friends','local')),
  created_at         timestamptz not null default now()
);

-- Nur für den Nutzer selbst lesbar
create table public.profile_private (
  id                 uuid primary key references public.profiles(id) on delete cascade,
  age                int check (age between 16 and 99),
  settings           jsonb not null default '{}'::jsonb,
  accepted_terms_at  timestamptz not null default now()
);

create table public.events (
  id          text primary key,
  name        text not null,
  starts_on   timestamptz not null,
  ends_on     timestamptz not null,
  required    int not null default 1 check (required > 0),
  medal       text not null,
  hue         int not null default 20,
  description text not null default ''
);

create table public.activities (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title             text not null check (char_length(title) between 3 and 60),
  sport             text not null check (sport in ('run','ride')),
  city              text not null,
  meeting_point     text not null check (char_length(meeting_point) between 3 and 120),
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),
  starts_at         timestamptz not null,
  distance_km       numeric(5,1) not null check (distance_km > 0 and distance_km <= 300),
  tempo             numeric(6,1) not null check (tempo > 0),                             -- Lauf: s/km, Rad: km/h
  max_participants  int not null check (max_participants between 2 and 30),            -- inkl. Gastgeber
  description       text not null default '' check (char_length(description) <= 500),
  beginner_friendly boolean not null default false,
  breaks            boolean not null default false,
  route             jsonb,
  event_id          text references public.events(id) on delete set null,
  status            text not null default 'open' check (status in ('open','cancelled')),
  participant_count int not null default 0,                                              -- ohne Gastgeber, nur vom Server gepflegt
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index activities_starts_at_idx on public.activities (starts_at);
create index activities_geo_idx on public.activities (lat, lng);
create index activities_host_idx on public.activities (host_id);

create table public.activity_participants (
  activity_id    uuid not null references public.activities(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  joined_at      timestamptz not null default now(),
  self_confirmed boolean not null default false,
  host_confirmed boolean not null default false,
  primary key (activity_id, user_id)
);
create index activity_participants_user_idx on public.activity_participants (user_id);

create table public.cancellations (
  id          bigint generated always as identity primary key,
  activity_id uuid references public.activities(id) on delete set null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  late        boolean not null,
  created_at  timestamptz not null default now()
);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,                    -- null = Systemnachricht
  body        text not null check (char_length(body) between 1 and 500),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index messages_activity_idx on public.messages (activity_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('change','cancel','join','chat','reminder','system')),
  body        text not null,
  activity_id uuid references public.activities(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles(id) on delete set null,
  reported_id uuid references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  reason      text not null check (char_length(reason) between 3 and 300),
  status      text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at  timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Hilfsfunktionen
-------------------------------------------------------------------------------

create or replace function public.activity_ends_at(p_sport text, p_starts timestamptz, p_km numeric, p_tempo numeric)
returns timestamptz language sql immutable as $$
  select p_starts + case
    when p_sport = 'run' then make_interval(secs => (p_km * p_tempo)::double precision)
    else make_interval(secs => (p_km / nullif(p_tempo, 0) * 3600)::double precision)
  end
$$;

create or replace function public.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function public.is_member(p_activity uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities where id = p_activity and host_id = p_user)
      or exists (select 1 from activity_participants where activity_id = p_activity and user_id = p_user)
$$;

-- Waren zwei Personen schon gemeinsam bei einer Aktivität (oder sind gemeinsam angemeldet)?
create or replace function public.shares_activity(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from activities ac
    where (ac.host_id = a or exists (select 1 from activity_participants p where p.activity_id = ac.id and p.user_id = a))
      and (ac.host_id = b or exists (select 1 from activity_participants p where p.activity_id = ac.id and p.user_id = b))
  )
$$;

create or replace function public.wants_notification(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (settings -> 'notify' ->> p_key)::boolean from profile_private where id = p_user), true)
$$;

create or replace function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from profiles where id = p_user), 'Jemand')
$$;

-------------------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security)
-------------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.profile_private       enable row level security;
alter table public.events                enable row level security;
alter table public.activities            enable row level security;
alter table public.activity_participants enable row level security;
alter table public.cancellations         enable row level security;
alter table public.messages              enable row level security;
alter table public.notifications         enable row level security;
alter table public.blocks                enable row level security;
alter table public.reports               enable row level security;

-- Profile: eigenes immer; andere nur ohne Blockierung und wenn
-- öffentlich, Verein, gemeinsame Aktivität oder Gastgeber einer aktuellen Aktivität.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or (
    not public.is_blocked_between(auth.uid(), id) and (
      profile_visibility = 'everyone' or kind = 'club'
      or public.shares_activity(auth.uid(), id)
      or exists (select 1 from public.activities a where a.host_id = profiles.id and a.status = 'open' and a.starts_at > now() - interval '1 day')
    )
  )
);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid() and kind = 'person');
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy private_all on public.profile_private for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy events_select on public.events for select to anon, authenticated using (true);

create policy activities_select on public.activities for select to authenticated using (not public.is_blocked_between(auth.uid(), host_id));
create policy activities_insert on public.activities for insert to authenticated with check (host_id = auth.uid() and starts_at > now() and status = 'open');
create policy activities_update on public.activities for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy participants_select on public.activity_participants for select to authenticated using (
  user_id = auth.uid() or public.is_member(activity_id, auth.uid())
);

create policy cancellations_select on public.cancellations for select to authenticated using (user_id = auth.uid());

create policy messages_select on public.messages for select to authenticated using (
  public.is_member(activity_id, auth.uid()) and (user_id is null or not public.is_blocked_between(auth.uid(), user_id))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  user_id = auth.uid() and is_system = false and public.is_member(activity_id, auth.uid())
  and exists (select 1 from public.activities a where a.id = activity_id and a.status = 'open')
);

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid());

-- Spaltenrechte: Zähler und Status-Felder pflegt nur der Server
revoke insert, update on public.activities from anon, authenticated;
grant insert (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants,
              description, beginner_friendly, breaks, route, event_id) on public.activities to authenticated;
grant update (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants,
              description, beginner_friendly, breaks, route, event_id, status) on public.activities to authenticated;
revoke insert, update, delete on public.activity_participants from anon, authenticated;
revoke insert, update, delete on public.cancellations from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name, city, sports, pace, speed, bio, public_age, photo_url, bests, profile_visibility, league_opt_in, league_visibility)
  on public.profiles to authenticated;
revoke update, delete on public.reports from anon, authenticated;
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;

-------------------------------------------------------------------------------
-- Trigger: Plausibilität und Benachrichtigungen
-------------------------------------------------------------------------------

create or replace function public.tg_activities_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'cancelled' then
      raise exception 'Abgesagte Aktivitäten können nicht mehr geändert werden';
    end if;
    if new.max_participants < old.participant_count + 1 then
      raise exception 'Es sind bereits % Personen angemeldet', old.participant_count + 1;
    end if;
    if new.starts_at is distinct from old.starts_at and new.starts_at <= now() then
      raise exception 'Der Start muss in der Zukunft liegen';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger activities_guard before update on public.activities for each row execute function public.tg_activities_guard();

-- Änderung oder Absage: Systemnachricht im Chat und Benachrichtigung aller Teilnehmenden
create or replace function public.tg_activities_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed text[] := '{}';
  txt text;
begin
  if new.status = 'cancelled' and old.status = 'open' then
    insert into messages (activity_id, user_id, body, is_system) values (new.id, null, 'Die Aktivität wurde abgesagt', true);
    insert into notifications (user_id, kind, body, activity_id)
      select p.user_id, 'cancel', display_name(new.host_id) || ' hat „' || new.title || '“ abgesagt.', new.id
      from activity_participants p where p.activity_id = new.id and wants_notification(p.user_id, 'changes');
    return new;
  end if;
  if new.starts_at is distinct from old.starts_at then changed := array_append(changed, 'Startzeit'); end if;
  if new.meeting_point is distinct from old.meeting_point or new.lat is distinct from old.lat or new.lng is distinct from old.lng then changed := array_append(changed, 'Treffpunkt'); end if;
  if new.tempo is distinct from old.tempo then changed := array_append(changed, 'Tempo'); end if;
  if new.distance_km is distinct from old.distance_km then changed := array_append(changed, 'Distanz'); end if;
  if new.route is distinct from old.route then changed := array_append(changed, 'Route'); end if;
  if cardinality(changed) > 0 then
    txt := array_to_string(changed, ', ');
    insert into messages (activity_id, user_id, body, is_system) values (new.id, null, 'Geändert: ' || txt, true);
    insert into notifications (user_id, kind, body, activity_id)
      select p.user_id, 'change', '„' || new.title || '“ wurde geändert: ' || txt || '.', new.id
      from activity_participants p where p.activity_id = new.id and wants_notification(p.user_id, 'changes');
  end if;
  return new;
end $$;
create trigger activities_notify after update on public.activities for each row execute function public.tg_activities_notify();

-- Chat: andere Mitglieder benachrichtigen (max. eine ungelesene Chat-Meldung je Aktivität)
create or replace function public.tg_messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare a activities;
begin
  if new.is_system then return new; end if;
  select * into a from activities where id = new.activity_id;
  insert into notifications (user_id, kind, body, activity_id)
    select m.uid, 'chat', display_name(new.user_id) || ' hat in „' || a.title || '“ geschrieben.', a.id
    from (select a.host_id as uid union select user_id from activity_participants where activity_id = a.id) m
    where m.uid <> new.user_id
      and wants_notification(m.uid, 'chat')
      and not is_blocked_between(m.uid, new.user_id)
      and not exists (select 1 from notifications n where n.user_id = m.uid and n.activity_id = a.id and n.kind = 'chat' and not n.read);
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function public.tg_messages_notify();

-------------------------------------------------------------------------------
-- Aktionen (RPC): Teilnahme, Absage, Bestätigung
-------------------------------------------------------------------------------

create or replace function public.join_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a activities;
  me uuid := auth.uid();
  n int;
begin
  if me is null then raise exception 'Bitte melde dich an'; end if;
  select * into a from activities where id = p_activity for update;
  if not found then raise exception 'Aktivität nicht gefunden'; end if;
  if a.status <> 'open' then raise exception 'Diese Aktivität wurde abgesagt'; end if;
  if a.starts_at <= now() then raise exception 'Diese Aktivität hat bereits begonnen'; end if;
  if a.host_id = me then raise exception 'Du organisierst diese Aktivität selbst'; end if;
  if is_blocked_between(me, a.host_id) then raise exception 'Teilnahme nicht möglich'; end if;
  if a.participant_count + 1 >= a.max_participants then raise exception 'Leider schon ausgebucht'; end if;

  insert into activity_participants (activity_id, user_id) values (p_activity, me) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;

  update activities set participant_count = participant_count + 1 where id = p_activity;
  insert into messages (activity_id, user_id, body, is_system) values (p_activity, null, display_name(me) || ' ist dabei', true);
  if wants_notification(a.host_id, 'joins') then
    insert into notifications (user_id, kind, body, activity_id)
      values (a.host_id, 'join', display_name(me) || ' nimmt an „' || a.title || '“ teil.', p_activity);
  end if;
end $$;

create or replace function public.leave_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a activities;
  me uuid := auth.uid();
  n int;
begin
  select * into a from activities where id = p_activity for update;
  if not found then raise exception 'Aktivität nicht gefunden'; end if;
  if a.starts_at <= now() then raise exception 'Die Aktivität hat bereits begonnen'; end if;
  delete from activity_participants where activity_id = p_activity and user_id = me;
  get diagnostics n = row_count;
  if n = 0 then return; end if;

  update activities set participant_count = greatest(0, participant_count - 1) where id = p_activity;
  insert into cancellations (activity_id, user_id, late) values (p_activity, me, a.starts_at - now() < interval '2 hours');
  insert into messages (activity_id, user_id, body, is_system) values (p_activity, null, display_name(me) || ' hat abgesagt', true);
  if wants_notification(a.host_id, 'joins') then
    insert into notifications (user_id, kind, body, activity_id)
      values (a.host_id, 'change', display_name(me) || ' hat für „' || a.title || '“ abgesagt.', p_activity);
  end if;
end $$;

-- Teilnehmende bestätigen nach dem Ende selbst, dass sie dabei waren
create or replace function public.confirm_attendance(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a activities; n int;
begin
  select * into a from activities where id = p_activity;
  if not found or a.status <> 'open' then raise exception 'Aktivität nicht gefunden'; end if;
  if activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) > now() then raise exception 'Bestätigen ist erst nach dem Ende möglich'; end if;
  if a.starts_at < now() - interval '14 days' then raise exception 'Bestätigung nur bis 14 Tage danach möglich'; end if;
  update activity_participants set self_confirmed = true where activity_id = p_activity and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Du warst nicht angemeldet'; end if;
end $$;

-- Gastgeber hakt ab, wer tatsächlich dabei war
create or replace function public.host_confirm(p_activity uuid, p_present uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare a activities;
begin
  select * into a from activities where id = p_activity;
  if not found or a.host_id <> auth.uid() then raise exception 'Nur der Gastgeber kann die Anwesenheit bestätigen'; end if;
  if a.status <> 'open' then raise exception 'Aktivität wurde abgesagt'; end if;
  if activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) > now() then raise exception 'Bestätigen ist erst nach dem Ende möglich'; end if;
  if a.starts_at < now() - interval '14 days' then raise exception 'Bestätigung nur bis 14 Tage danach möglich'; end if;
  update activity_participants set host_confirmed = (user_id = any(coalesce(p_present, '{}'))) where activity_id = p_activity;
end $$;

-------------------------------------------------------------------------------
-- Abfragen
-------------------------------------------------------------------------------

-- Kommende Aktivitäten im Umkreis
create or replace function public.activities_near(p_lat double precision, p_lng double precision, p_radius_km double precision)
returns setof public.activities language sql stable security invoker set search_path = public as $$
  select * from activities
  where status = 'open'
    and activity_ends_at(sport, starts_at, distance_km, tempo) > now()
    and starts_at < now() + interval '60 days'
    and lat between p_lat - p_radius_km / 111.0 and p_lat + p_radius_km / 111.0
    and distance_km(p_lat, p_lng, lat, lng) <= least(p_radius_km, 200)
  order by starts_at
  limit 300
$$;

-- Eigene und gebuchte Aktivitäten (inkl. der letzten 90 Tage)
create or replace function public.my_activities()
returns setof public.activities language sql stable security invoker set search_path = public as $$
  select a.* from activities a
  where (a.host_id = auth.uid() or exists (select 1 from activity_participants p where p.activity_id = a.id and p.user_id = auth.uid()))
    and a.starts_at > now() - interval '90 days'
  order by a.starts_at desc
$$;

-- Zuverlässigkeit: nur überprüfbare Zahlen
create or replace function public.reliability(p_user uuid)
returns table (attended int, hosted int, late_cancels int, member_since timestamptz)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from activity_participants p join activities a on a.id = p.activity_id
       where p.user_id = p_user and p.self_confirmed and p.host_confirmed and a.status = 'open'),
    (select count(*)::int from activities a where a.host_id = p_user and a.status = 'open'
       and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) < now()
       and exists (select 1 from activity_participants p where p.activity_id = a.id and p.host_confirmed)),
    (select count(*)::int from cancellations c where c.user_id = p_user and c.late),
    (select created_at from profiles where id = p_user)
  where public.is_blocked_between(auth.uid(), p_user) = false
$$;

-------------------------------------------------------------------------------
-- Community-Liga (freiwillig)
-- Punkte werden nie gespeichert, sondern aus Bestätigungen berechnet:
--  +100 Teilnahme (selbst UND vom Gastgeber bestätigt)
--  + 75 erstes Mal mit diesem Gastgeber
--  +150 organisiert, mit mind. 2 bestätigten Teilnehmenden
--  max. 2 punktende Aktivitäten pro Tag; keine Punkte für Tempo oder Distanz
-------------------------------------------------------------------------------

create or replace function public._league_entries(p_user uuid)
returns table (activity_id uuid, title text, kind text, xp int, at timestamptz)
language sql stable security definer set search_path = public as $$
  with done as (
    select a.* from activities a
    where a.status = 'open' and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) < now()
  ),
  att as (
    select d.id, d.title, d.starts_at, d.host_id from done d
    join activity_participants p on p.activity_id = d.id
    where p.user_id = p_user and p.self_confirmed and p.host_confirmed
  ),
  hosted as (
    select d.id, d.title, d.starts_at from done d
    where d.host_id = p_user
      and (select count(*) from activity_participants p where p.activity_id = d.id and p.self_confirmed and p.host_confirmed) >= 2
  ),
  raw as (
    select id, title, starts_at, 'attend'::text as kind, 100 as xp from att
    union all
    select id, title, starts_at, 'newGroup', 75 from (
      select att.*, row_number() over (partition by host_id order by starts_at, id) as rn from att) x where rn = 1
    union all
    select id, title, starts_at, 'host', 150 from hosted
  ),
  ranked as (
    select id, dense_rank() over (partition by (starts_at at time zone 'Europe/Berlin')::date order by starts_at, id) as day_rank
    from (select distinct id, starts_at from raw) x
  )
  select r.id, r.title, r.kind, case when k.day_rank > 2 then 0 else r.xp end, r.starts_at
  from raw r join ranked k on k.id = r.id
  order by r.starts_at desc
$$;
revoke execute on function public._league_entries(uuid) from public, anon, authenticated;

create or replace function public.league_entries()
returns table (activity_id uuid, title text, kind text, xp int, at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from _league_entries(auth.uid())
$$;

-- Rangliste des aktuellen Monats. scope = 'local' (gleiche Stadt) oder 'friends' (Trainingspartner).
create or replace function public.league_board(p_scope text default 'local')
returns table (user_id uuid, name text, photo_url text, month_xp int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid() and league_opt_in),
  cand as (
    select p.* from profiles p, me
    where p.league_opt_in and (
      p.id = me.id or (
        not is_blocked_between(me.id, p.id) and (
          (p_scope = 'local' and p.league_visibility = 'local' and p.city = me.city)
          or (p_scope = 'friends' and p.league_visibility in ('friends','local') and shares_activity(me.id, p.id))
        )
      )
    )
  )
  select c.id, c.name, c.photo_url,
    coalesce((select sum(e.xp) from _league_entries(c.id) e
      where date_trunc('month', e.at at time zone 'Europe/Berlin') = date_trunc('month', now() at time zone 'Europe/Berlin')), 0)::int,
    c.id = auth.uid()
  from cand c
  order by 4 desc, 2
  limit 100
$$;

-------------------------------------------------------------------------------
-- Konto löschen (DSGVO Art. 17)
-------------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Nicht angemeldet'; end if;
  -- Kommende eigene Aktivitäten absagen, damit Teilnehmende informiert werden
  update activities set status = 'cancelled' where host_id = me and status = 'open' and starts_at > now();
  delete from auth.users where id = me;
end $$;

-------------------------------------------------------------------------------
-- Rechte für Funktionen
-------------------------------------------------------------------------------

revoke execute on function public.join_activity(uuid), public.leave_activity(uuid), public.confirm_attendance(uuid),
  public.host_confirm(uuid, uuid[]), public.activities_near(double precision, double precision, double precision),
  public.my_activities(), public.reliability(uuid), public.league_entries(), public.league_board(text),
  public.delete_my_account() from public, anon;
grant execute on function public.join_activity(uuid), public.leave_activity(uuid), public.confirm_attendance(uuid),
  public.host_confirm(uuid, uuid[]), public.activities_near(double precision, double precision, double precision),
  public.my_activities(), public.reliability(uuid), public.league_entries(), public.league_board(text),
  public.delete_my_account() to authenticated;

-------------------------------------------------------------------------------
-- Echtzeit: Änderungen an diese Tabellen werden an die App gesendet (RLS gilt weiter)
-------------------------------------------------------------------------------

alter publication supabase_realtime add table public.activities, public.activity_participants, public.messages, public.notifications;
