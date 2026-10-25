-- PaceMeet: Gruppen (Running Clubs und Vereine) und laufende Serien
--
-- Gruppen:  groups, group_members; Aktivitäten können zu einer Gruppe gehören
--           und optional nur für Mitglieder sichtbar sein.
-- Serien:   series speichert Vorlage und Rhythmus (Wochentage, wöchentlich / alle 2 Wochen,
--           ohne Ende oder bis Datum / Anzahl). Termine werden für die nächsten Wochen angelegt
--           und täglich automatisch nachgelegt.

-------------------------------------------------------------------------------
-- 1. Gruppen
-------------------------------------------------------------------------------
create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null check (char_length(name) between 3 and 60),
  kind         text not null default 'club' check (kind in ('club','verein')),   -- club = privat organisierter Running Club
  description  text not null default '' check (char_length(description) <= 500),
  city         text not null default '',
  city_lat     double precision,
  city_lng     double precision,
  sports       text[] not null default '{run}' check (sports <@ array['run','ride']::text[] and cardinality(sports) > 0),
  join_mode    text not null default 'open' check (join_mode in ('open','request')),   -- offen oder mit Anfrage
  listed       boolean not null default true,      -- in der Gruppensuche sichtbar (sonst nur per Link)
  post_mode    text not null default 'members' check (post_mode in ('members','admins')), -- wer Termine anlegen darf
  hue          int not null default 20 check (hue between 0 and 360),
  website      text check (website is null or website ~* '^https://[^ ]{3,200}$'),
  member_count int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists groups_geo_idx on public.groups (city_lat, city_lng);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  status     text not null default 'active' check (status in ('active','pending')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.activities
  add column if not exists group_id uuid,   -- bewusst ohne Fremdschlüssel: nach dem Löschen einer Gruppe bleiben Mitglieder-Termine unsichtbar
  add column if not exists visibility text not null default 'public' check (visibility in ('public','group'));
create index if not exists activities_group_idx on public.activities (group_id);
grant insert (group_id, visibility) on public.activities to authenticated;
grant update (visibility) on public.activities to authenticated;

-- Hilfsfunktionen
create or replace function public.group_role(p_group uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select role from group_members where group_id = p_group and user_id = p_user and status = 'active'
$$;
create or replace function public.is_group_member(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_group is not null and exists (select 1 from group_members where group_id = p_group and user_id = p_user and status = 'active')
$$;
create or replace function public.is_group_admin(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = p_user and status = 'active' and role in ('owner','admin'))
$$;
create or replace function public.can_post_in_group(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups g join group_members m on m.group_id = g.id
    where g.id = p_group and m.user_id = p_user and m.status = 'active'
      and (g.post_mode = 'members' or m.role in ('owner','admin'))
  )
$$;
create or replace function public.shares_group(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members x join group_members y on y.group_id = x.group_id
    where x.user_id = a and y.user_id = b and x.status = 'active' and y.status = 'active'
  )
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated using (
  listed or owner_id = auth.uid() or exists (select 1 from public.group_members m where m.group_id = groups.id and m.user_id = auth.uid())
);
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated using (owner_id = auth.uid());

revoke insert, update on public.groups from anon, authenticated;
grant insert (name, kind, description, city, city_lat, city_lng, sports, join_mode, listed, post_mode, hue, website) on public.groups to authenticated;
grant update (name, kind, description, city, city_lat, city_lng, sports, join_mode, listed, post_mode, hue, website) on public.groups to authenticated;

drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated using (
  user_id = auth.uid()
  or (status = 'active' and public.is_group_member(group_id))
  or public.is_group_admin(group_id)
);
revoke insert, update, delete on public.group_members from anon, authenticated;  -- nur über Funktionen

-- Neue Gruppe: Ersteller wird Eigentümer
create or replace function public.tg_group_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_suspended(new.owner_id) then raise exception 'Dein Konto ist gesperrt.'; end if;
  insert into group_members (group_id, user_id, role, status) values (new.id, new.owner_id, 'owner', 'active');
  update groups set member_count = 1 where id = new.id;
  return new;
end $$;
drop trigger if exists group_created on public.groups;
create trigger group_created after insert on public.groups for each row execute function public.tg_group_created();

-- Mitgliederzahl pflegen
create or replace function public.refresh_group_count(p_group uuid)
returns void language sql security definer set search_path = public as $$
  update groups set member_count = (select count(*) from group_members where group_id = p_group and status = 'active') where id = p_group
$$;
revoke execute on function public.refresh_group_count(uuid) from public, anon, authenticated;

-- Beitreten (offen: sofort, mit Anfrage: wartet auf Freigabe). Gibt den Status zurück.
create or replace function public.join_group(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  g groups;
  me uuid := auth.uid();
  v_status text;
begin
  if me is null then raise exception 'Bitte melde dich an'; end if;
  if is_suspended(me) then raise exception 'Dein Konto ist gesperrt.'; end if;
  select * into g from groups where id = p_group;
  if not found then raise exception 'Gruppe nicht gefunden'; end if;
  if is_blocked_between(me, g.owner_id) then raise exception 'Beitritt nicht möglich'; end if;
  select status into v_status from group_members where group_id = p_group and user_id = me;
  if v_status is not null then return v_status; end if;
  v_status := case when g.join_mode = 'open' then 'active' else 'pending' end;
  insert into group_members (group_id, user_id, role, status) values (p_group, me, 'member', v_status);
  perform refresh_group_count(p_group);
  if v_status = 'pending' then
    insert into notifications (user_id, kind, body)
      select m.user_id, 'group', display_name(me) || ' möchte der Gruppe „' || g.name || '“ beitreten.'
      from group_members m where m.group_id = p_group and m.status = 'active' and m.role in ('owner','admin');
  end if;
  return v_status;
end $$;

create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if exists (select 1 from group_members where group_id = p_group and user_id = me and role = 'owner') then
    raise exception 'Als Eigentümer kannst du die Gruppe nicht verlassen. Übertrage sie zuerst oder lösche sie.';
  end if;
  delete from group_members where group_id = p_group and user_id = me;
  perform refresh_group_count(p_group);
end $$;

-- Verwaltung durch Admins: annehmen, ablehnen, entfernen, Rolle ändern
create or replace function public.group_manage(p_group uuid, p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_role text := group_role(p_group, auth.uid());
  their_role text;
  g_name text := (select name from groups where id = p_group);
begin
  if my_role not in ('owner','admin') or my_role is null then raise exception 'Nur für Gruppen-Admins'; end if;
  select role into their_role from group_members where group_id = p_group and user_id = p_user;
  if their_role is null then raise exception 'Person ist nicht in der Gruppe'; end if;
  if p_user = me then raise exception 'Das geht nicht für dich selbst'; end if;
  if their_role = 'owner' then raise exception 'Der Eigentümer kann nicht geändert werden'; end if;
  if their_role = 'admin' and my_role <> 'owner' then raise exception 'Nur der Eigentümer kann Admins ändern'; end if;

  if p_action = 'approve' then
    update group_members set status = 'active' where group_id = p_group and user_id = p_user and status = 'pending';
    insert into notifications (user_id, kind, body) values (p_user, 'group', 'Du bist jetzt Mitglied in „' || g_name || '“.');
  elsif p_action in ('decline','remove') then
    delete from group_members where group_id = p_group and user_id = p_user;
  elsif p_action = 'make_admin' then
    if my_role <> 'owner' then raise exception 'Nur der Eigentümer kann Admins ernennen'; end if;
    update group_members set role = 'admin' where group_id = p_group and user_id = p_user and status = 'active';
  elsif p_action = 'make_member' then
    if my_role <> 'owner' then raise exception 'Nur der Eigentümer kann Admins ändern'; end if;
    update group_members set role = 'member' where group_id = p_group and user_id = p_user;
  else
    raise exception 'Unbekannte Aktion';
  end if;
  perform refresh_group_count(p_group);
end $$;

-- Mitgliederliste (nur für Mitglieder; Admins sehen auch offene Anfragen)
create or replace function public.group_member_list(p_group uuid)
returns table (user_id uuid, name text, photo_url text, role text, status text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_member(p_group) then raise exception 'Nur für Mitglieder'; end if;
  return query
    select m.user_id, p.name, p.photo_url, m.role, m.status, m.created_at
    from group_members m join profiles p on p.id = m.user_id
    where m.group_id = p_group and p.suspended_at is null
      and (m.status = 'active' or is_group_admin(p_group))
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.status desc, p.name;
end $$;

-- Gruppen in der Nähe (gelistete) und eigene Gruppen
create or replace function public.groups_near(p_lat double precision, p_lng double precision, p_radius_km double precision)
returns setof public.groups language sql stable security invoker set search_path = public as $$
  select * from groups
  where listed and city_lat is not null
    and city_lat between p_lat - p_radius_km / 111.0 and p_lat + p_radius_km / 111.0
    and distance_km(p_lat, p_lng, city_lat, city_lng) <= least(p_radius_km, 200)
  order by member_count desc
  limit 50
$$;

-- Vorschau für Einladungslinks (auch nicht gelistete Gruppen)
create or replace function public.group_preview(p_group uuid)
returns table (id uuid, name text, kind text, description text, city text, sports text[], join_mode text, member_count int, hue int, website text, owner_name text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.kind, g.description, g.city, g.sports, g.join_mode, g.member_count, g.hue, g.website, display_name(g.owner_id)
  from groups g where g.id = p_group
$$;

-- Eigentümer löscht Gruppe: kommende Termine nur für Mitglieder werden abgesagt, Serien gestoppt.
-- Termine nur für Mitglieder bleiben danach unsichtbar (außer für Gastgeber und Teilnehmende).
create or replace function public.tg_group_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update activities set status = 'cancelled' where group_id = old.id and visibility = 'group' and status = 'open' and starts_at > now();
  update series set active = false where template ->> 'group_id' = old.id::text;
  return old;
end $$;
drop trigger if exists group_deleted on public.groups;
create trigger group_deleted before delete on public.groups for each row execute function public.tg_group_deleted();

-------------------------------------------------------------------------------
-- 2. Sichtbarkeit von Aktivitäten und Profilen
-------------------------------------------------------------------------------
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  host_id = auth.uid() or (
    not public.is_blocked_between(auth.uid(), host_id) and not public.is_suspended(host_id)
    and (visibility = 'public' or public.is_group_member(group_id) or public.is_member(id, auth.uid()))
  )
);

-- Neue Aktivität in einer Gruppe: nur wer dort Termine anlegen darf
create or replace function public.tg_activity_group_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id) then
    if not can_post_in_group(new.group_id, new.host_id) then
      raise exception 'Du darfst in dieser Gruppe keine Termine anlegen';
    end if;
  end if;
  if tg_op = 'INSERT' and new.group_id is null then new.visibility := 'public'; end if;
  return new;
end $$;
drop trigger if exists activity_group_check on public.activities;
create trigger activity_group_check before insert or update on public.activities for each row execute function public.tg_activity_group_check();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or (
    suspended_at is null and
    not public.is_blocked_between(auth.uid(), id) and (
      profile_visibility = 'everyone' or kind = 'club'
      or public.shares_activity(auth.uid(), id)
      or public.shares_group(auth.uid(), id)
      or exists (select 1 from public.activities a where a.host_id = profiles.id and a.status = 'open' and a.starts_at > now() - interval '1 day')
    )
  )
);

-- Teilnahme: Gruppen-Termine nur für Mitglieder
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
  if a.visibility = 'group' and not is_group_member(a.group_id, me) then raise exception 'Nur für Mitglieder der Gruppe'; end if;
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

-- Geteilte Links: Termine nur für Mitglieder nicht öffentlich zeigen
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
  where a.id = p_id and a.visibility = 'public'
    and activity_ends_at(a.sport, a.starts_at, a.distance_km, a.tempo) > now()
$$;

-------------------------------------------------------------------------------
-- 3. Benachrichtigungen
-------------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('change','cancel','join','chat','reminder','system','nearby','group'));

-- Neuer Gruppen-Termin: Mitglieder informieren (bei Serien nur der erste Termin)
create or replace function public.tg_activity_group_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare g_name text;
begin
  if new.group_id is null or new.status <> 'open' or new.starts_at < now() then return new; end if;
  if new.series_id is not null and exists (select 1 from activities x where x.series_id = new.series_id and x.id <> new.id and x.starts_at < new.starts_at) then return new; end if;
  g_name := (select name from groups where id = new.group_id);
  insert into notifications (user_id, kind, body, activity_id)
    select m.user_id, 'group',
      g_name || ': ' || case when new.series_id is not null then 'neue Serie „' else 'neuer Termin „' end || new.title || '“ am '
        || to_char(new.starts_at at time zone 'Europe/Berlin', 'DD.MM. "um" HH24:MI') || ' Uhr.',
      new.id
    from group_members m
    where m.group_id = new.group_id and m.status = 'active' and m.user_id <> new.host_id
      and wants_notification(m.user_id, 'groups');
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists activity_group_notify on public.activities;
create trigger activity_group_notify after insert on public.activities for each row execute function public.tg_activity_group_notify();

-- Hinweise in der Nähe: keine Termine nur für Mitglieder, bei Serien nur der erste Termin
create or replace function public.tg_activity_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days text[] := array['Mo','Di','Mi','Do','Fr','Sa','So'];
  v_local timestamp := new.starts_at at time zone 'Europe/Berlin';
  v_when text;
  v_tempo text;
begin
  if new.status <> 'open' or new.visibility <> 'public' or new.starts_at < now() or new.starts_at > now() + interval '21 days' then return new; end if;
  if new.series_id is not null and exists (select 1 from activities x where x.series_id = new.series_id and x.id <> new.id and x.starts_at < new.starts_at) then return new; end if;
  v_when := v_days[extract(isodow from v_local)::int] || ' ' || to_char(v_local, 'DD.MM., HH24:MI');
  v_tempo := case when new.sport = 'run'
    then floor(new.tempo / 60)::int || ':' || lpad((round(new.tempo)::int % 60)::text, 2, '0') || ' /km'
    else round(new.tempo)::int || ' km/h' end;

  insert into notifications (user_id, kind, body, activity_id)
  select p.id, 'nearby',
    case when new.sport = 'run' then 'Neuer Lauf' else 'Neue Radtour' end || ' in deiner Nähe: „' || new.title || '“ · '
      || v_when || case when new.series_id is not null then ' (jede Woche)' else '' end
      || ' · ' || (case when new.distance_km = round(new.distance_km) then round(new.distance_km)::int::text else replace(to_char(new.distance_km, 'FM990.0'), '.', ',') end) || ' km · ' || v_tempo
      || ' · ' || round(distance_km(p.city_lat, p.city_lng, new.lat, new.lng))::int || ' km entfernt',
    new.id
  from profiles p
  join profile_private pp on pp.id = p.id
  where p.id <> new.host_id
    and p.suspended_at is null
    and p.city_lat is not null and p.city_lng is not null
    and p.city_lat between new.lat - 1 and new.lat + 1
    and not is_blocked_between(p.id, new.host_id)
    and not (new.group_id is not null and is_group_member(new.group_id, p.id))  -- bekommen schon den Gruppen-Hinweis
    and activity_matches_alert(pp.settings, p.pace, p.speed, p.sports, new.sport, new.tempo, new.distance_km,
                               distance_km(p.city_lat, p.city_lng, new.lat, new.lng))
    and (select count(*) from notifications n where n.user_id = p.id and n.kind = 'nearby' and n.created_at > now() - interval '1 day') < 6;
  return new;
exception when others then
  return new;
end $$;

-------------------------------------------------------------------------------
-- 4. Laufende Serien
-------------------------------------------------------------------------------
create table if not exists public.series (
  id             uuid primary key default gen_random_uuid(),
  host_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  template       jsonb not null,                       -- Felder der Aktivität
  weekdays       int[] not null check (weekdays <@ array[1,2,3,4,5,6,7] and cardinality(weekdays) between 1 and 7), -- 1 = Montag
  interval_weeks int not null default 1 check (interval_weeks in (1,2)),
  local_time     time not null,
  tz             text not null default 'Europe/Berlin',
  start_date     date not null,
  until_date     date,                                 -- leer = ohne Ende
  max_count      int check (max_count between 1 and 104),
  created_count  int not null default 0,
  generated_until date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.series enable row level security;
drop policy if exists series_select on public.series;
create policy series_select on public.series for select to authenticated using (host_id = auth.uid());
revoke insert, update, delete on public.series from anon, authenticated;

-- Termine einer Serie bis zum Horizont anlegen (intern)
create or replace function public.series_generate(p_series uuid, p_horizon_weeks int default 6)
returns int language plpgsql security definer set search_path = public as $$
declare
  s series;
  t jsonb;
  d date;
  anchor date;
  last_day date;
  ts timestamptz;
  n int := 0;
begin
  select * into s from series where id = p_series for update;
  if not found or not s.active then return 0; end if;
  if is_suspended(s.host_id) then return 0; end if;
  t := s.template;
  anchor := s.start_date - (extract(isodow from s.start_date)::int - 1);   -- Montag der Startwoche
  last_day := (now() at time zone s.tz)::date + 7 * p_horizon_weeks;
  if s.until_date is not null then last_day := least(last_day, s.until_date); end if;
  d := greatest(s.start_date, coalesce(s.generated_until + 1, s.start_date));
  while d <= last_day loop
    exit when s.max_count is not null and s.created_count + n >= s.max_count;
    if extract(isodow from d)::int = any (s.weekdays) and ((d - anchor) / 7) % s.interval_weeks = 0 then
      ts := (d + s.local_time) at time zone s.tz;
      if ts > now() + interval '10 minutes'
         and not exists (select 1 from activities x where x.series_id = s.id and x.starts_at = ts) then
        insert into activities (host_id, title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo,
                                max_participants, description, beginner_friendly, breaks, route, event_id, series_id, group_id, visibility)
        values (s.host_id, t->>'title', t->>'sport', t->>'city', t->>'meeting_point', (t->>'lat')::double precision, (t->>'lng')::double precision,
                ts, (t->>'distance_km')::numeric, (t->>'tempo')::numeric, (t->>'max_participants')::int,
                coalesce(t->>'description', ''), coalesce((t->>'beginner_friendly')::boolean, false), coalesce((t->>'breaks')::boolean, false),
                t->'route', nullif(t->>'event_id', ''), s.id, nullif(t->>'group_id', '')::uuid, coalesce(t->>'visibility', 'public'));
        n := n + 1;
      end if;
    end if;
    d := d + 1;
  end loop;
  update series set created_count = created_count + n, generated_until = greatest(coalesce(generated_until, last_day), last_day),
    active = active and not ((max_count is not null and created_count + n >= max_count) or (until_date is not null and last_day >= until_date))
  where id = p_series;
  return n;
end $$;
revoke execute on function public.series_generate(uuid, int) from public, anon, authenticated;

-- Serie anlegen. Gibt die ID des ersten Termins zurück.
create or replace function public.create_series(
  p_template jsonb, p_weekdays int[], p_interval_weeks int, p_local_time time,
  p_start_date date, p_until_date date default null, p_max_count int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_id uuid;
  v_first uuid;
  t jsonb := p_template;
begin
  if me is null then raise exception 'Bitte melde dich an'; end if;
  if is_suspended(me) then raise exception 'Dein Konto ist gesperrt. Schreib uns, wenn du glaubst, dass das ein Fehler ist.'; end if;
  if p_start_date < (now() at time zone 'Europe/Berlin')::date - 1 then raise exception 'Der Start der Serie liegt in der Vergangenheit'; end if;
  if p_until_date is not null and p_until_date < p_start_date then raise exception 'Das Ende liegt vor dem Start'; end if;
  if (select count(*) from series where host_id = me and active) >= 20 then raise exception 'Du hast schon 20 laufende Serien'; end if;
  if nullif(t->>'group_id', '') is not null and not can_post_in_group((t->>'group_id')::uuid, me) then
    raise exception 'Du darfst in dieser Gruppe keine Termine anlegen';
  end if;
  insert into series (host_id, template, weekdays, interval_weeks, local_time, start_date, until_date, max_count)
    values (me, t, p_weekdays, p_interval_weeks, p_local_time, p_start_date, p_until_date, p_max_count)
    returning id into v_id;
  perform series_generate(v_id);
  select id into v_first from activities where series_id = v_id order by starts_at limit 1;
  if v_first is null then raise exception 'Mit diesen Einstellungen entsteht kein Termin in der Zukunft'; end if;
  return v_first;
end $$;
revoke execute on function public.create_series(jsonb, int[], int, time, date, date, int) from public, anon;
grant execute on function public.create_series(jsonb, int[], int, time, date, date, int) to authenticated;

-- Serie beenden: Rhythmus stoppen und alle kommenden Termine absagen
create or replace function public.cancel_series(p_series uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update series set active = false where id = p_series and host_id = auth.uid();
  update activities set status = 'cancelled'
  where series_id = p_series and host_id = auth.uid() and status = 'open' and starts_at > now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Infos zur Serie (für die Anzeige „Jeden Montag, 9:00“)
create or replace function public.series_info(p_series uuid)
returns table (weekdays int[], interval_weeks int, local_time time, until_date date, max_count int, active boolean)
language sql stable security definer set search_path = public as $$
  select s.weekdays, s.interval_weeks, s.local_time, s.until_date, s.max_count, s.active from series s
  where s.id = p_series and exists (select 1 from activities a where a.series_id = s.id)
$$;
grant execute on function public.series_info(uuid) to authenticated;

-- Täglich nachlegen
create or replace function public.extend_all_series()
returns int language plpgsql security definer set search_path = public as $$
declare r record; total int := 0;
begin
  for r in select id from series where active loop
    total := total + series_generate(r.id);
  end loop;
  return total;
end $$;
revoke execute on function public.extend_all_series() from public, anon, authenticated;

grant execute on function public.join_group(uuid), public.leave_group(uuid), public.group_manage(uuid, uuid, text),
  public.group_member_list(uuid), public.groups_near(double precision, double precision, double precision) to authenticated;
revoke execute on function public.join_group(uuid), public.leave_group(uuid), public.group_manage(uuid, uuid, text),
  public.group_member_list(uuid), public.groups_near(double precision, double precision, double precision) from anon;
grant execute on function public.group_preview(uuid) to anon, authenticated;
