-- PaceMeet: Serie bearbeiten (alle kommenden Termine) und öffentliche Gruppen-Vorschau für Einladungslinks

-------------------------------------------------------------------------------
-- 1. Serien-Infos mit Startdatum (für die Bearbeitung)
-------------------------------------------------------------------------------
drop function if exists public.series_info(uuid);
create function public.series_info(p_series uuid)
returns table (weekdays int[], interval_weeks int, local_time time, start_date date, until_date date, max_count int, active boolean, is_host boolean)
language sql stable security definer set search_path = public as $$
  select s.weekdays, s.interval_weeks, s.local_time, s.start_date, s.until_date, s.max_count, s.active, s.host_id = auth.uid()
  from series s
  where s.id = p_series and exists (select 1 from activities a where a.series_id = s.id)
$$;
revoke execute on function public.series_info(uuid) from public, anon;
grant execute on function public.series_info(uuid) to authenticated;

-------------------------------------------------------------------------------
-- 2. Serie bearbeiten
--    Übernimmt Vorlage und Rhythmus für alle kommenden offenen Termine:
--    - Termine an Tagen, die weiter passen, bekommen neue Uhrzeit und Angaben
--      (Teilnehmende bleiben angemeldet und werden über Änderungen informiert)
--    - Termine an Tagen, die nicht mehr passen, werden abgesagt
--    - fehlende Termine werden neu angelegt
--    Gibt die ID des nächsten Termins zurück.
-------------------------------------------------------------------------------
create or replace function public.update_series(
  p_series uuid, p_template jsonb, p_weekdays int[], p_interval_weeks int, p_local_time time,
  p_until_date date default null, p_max_count int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  s series;
  t jsonb := p_template;
  o record;
  d date;
  anchor date;
  ts timestamptz;
  v_next uuid;
begin
  select * into s from series where id = p_series for update;
  if not found or s.host_id <> auth.uid() then raise exception 'Nur der Gastgeber kann die Serie bearbeiten'; end if;
  if is_suspended(auth.uid()) then raise exception 'Dein Konto ist gesperrt.'; end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0 or not (p_weekdays <@ array[1,2,3,4,5,6,7]) then raise exception 'Wähle mindestens einen Wochentag'; end if;
  if p_interval_weeks not in (1, 2) then raise exception 'Ungültiger Rhythmus'; end if;
  if p_until_date is not null and p_until_date < (now() at time zone s.tz)::date then raise exception 'Das Ende liegt in der Vergangenheit'; end if;
  -- Gruppe und Sichtbarkeit: Gruppe bleibt, Sichtbarkeit darf sich ändern
  t := jsonb_set(t, '{group_id}', coalesce(s.template -> 'group_id', 'null'::jsonb));
  if nullif(t ->> 'group_id', '') is null then t := jsonb_set(t, '{visibility}', '"public"'); end if;

  update series set template = t, weekdays = p_weekdays, interval_weeks = p_interval_weeks, local_time = p_local_time,
    until_date = p_until_date, max_count = p_max_count, active = true
  where id = p_series;

  anchor := s.start_date - (extract(isodow from s.start_date)::int - 1);
  for o in select * from activities where series_id = p_series and status = 'open' and starts_at > now() order by starts_at loop
    d := (o.starts_at at time zone s.tz)::date;
    if extract(isodow from d)::int = any (p_weekdays) and ((d - anchor) / 7) % p_interval_weeks = 0
       and (p_until_date is null or d <= p_until_date) then
      ts := (d + p_local_time) at time zone s.tz;
      if ts <= now() + interval '10 minutes' then
        update activities set status = 'cancelled' where id = o.id;
      else
        update activities set
          title = t ->> 'title', sport = t ->> 'sport', city = t ->> 'city', meeting_point = t ->> 'meeting_point',
          lat = (t ->> 'lat')::double precision, lng = (t ->> 'lng')::double precision, starts_at = ts,
          distance_km = (t ->> 'distance_km')::numeric, tempo = (t ->> 'tempo')::numeric,
          max_participants = greatest((t ->> 'max_participants')::int, o.participant_count + 1),
          description = coalesce(t ->> 'description', ''), beginner_friendly = coalesce((t ->> 'beginner_friendly')::boolean, false),
          breaks = coalesce((t ->> 'breaks')::boolean, false), route = t -> 'route', event_id = nullif(t ->> 'event_id', ''),
          visibility = coalesce(t ->> 'visibility', 'public')
        where id = o.id;
      end if;
    else
      update activities set status = 'cancelled' where id = o.id;
    end if;
  end loop;

  -- Zähler neu: alle nicht abgesagten plus vergangene Termine
  update series set
    created_count = (select count(*) from activities a where a.series_id = p_series and (a.status = 'open' or a.starts_at <= now())),
    generated_until = (now() at time zone tz)::date - 1
  where id = p_series;
  perform series_generate(p_series);

  select id into v_next from activities where series_id = p_series and status = 'open' and starts_at > now() order by starts_at limit 1;
  if v_next is null then raise exception 'Mit diesen Einstellungen entsteht kein Termin in der Zukunft'; end if;
  return v_next;
end $$;
revoke execute on function public.update_series(uuid, jsonb, int[], int, time, date, int) from public, anon;
grant execute on function public.update_series(uuid, jsonb, int[], int, time, date, int) to authenticated;

-- Doppelte Termine beim Nachlegen verhindern: nur offene Termine zur selben Zeit zählen
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
  anchor := s.start_date - (extract(isodow from s.start_date)::int - 1);
  last_day := (now() at time zone s.tz)::date + 7 * p_horizon_weeks;
  if s.until_date is not null then last_day := least(last_day, s.until_date); end if;
  d := greatest(s.start_date, coalesce(s.generated_until + 1, s.start_date));
  while d <= last_day loop
    exit when s.max_count is not null and s.created_count + n >= s.max_count;
    if extract(isodow from d)::int = any (s.weekdays) and ((d - anchor) / 7) % s.interval_weeks = 0 then
      ts := (d + s.local_time) at time zone s.tz;
      if ts > now() + interval '10 minutes'
         and not exists (select 1 from activities x where x.series_id = s.id and x.starts_at = ts and x.status = 'open') then
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

-- Hinweise bei Serien: nicht erneut melden, wenn ein Termin nachträglich angelegt wird,
-- solange es schon frühere Termine derselben Serie gibt (auch abgesagte)
-- (unverändert: tg_activity_group_notify und tg_activity_nearby prüfen auf frühere Termine)

-------------------------------------------------------------------------------
-- 3. Öffentliche Gruppen-Vorschau (Einladungslink ohne Konto)
-------------------------------------------------------------------------------
create or replace function public.public_group_activities(p_group uuid)
returns table (id uuid, title text, sport text, meeting_point text, starts_at timestamptz, distance_km numeric, tempo numeric, series_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.sport, a.meeting_point, a.starts_at, a.distance_km, a.tempo, a.series_id
  from activities a
  where a.group_id = p_group and a.visibility = 'public' and a.status = 'open' and a.starts_at > now()
  order by a.starts_at
  limit 8
$$;
revoke execute on function public.public_group_activities(uuid) from public;
grant execute on function public.public_group_activities(uuid) to anon, authenticated;
