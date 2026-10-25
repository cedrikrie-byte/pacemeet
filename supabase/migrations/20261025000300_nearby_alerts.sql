-- PaceMeet: Hinweis bei neuen passenden Aktivitäten in der Nähe
-- Einstellungen liegen in profile_private.settings -> 'alerts':
--   on (bool), radiusKm (Zahl), sports (["run","ride"]), auto (bool: Tempo aus dem Profil ableiten),
--   runPaceMin / runPaceMax (s/km), rideSpeedMin / rideSpeedMax (km/h), runMaxKm / rideMaxKm (km)
-- Ort: Stadtmittelpunkt aus dem Profil (city_lat / city_lng, auf 2 Stellen gerundet).

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('change','cancel','join','chat','reminder','system','nearby'));

-- Passt die Aktivität zu den Einstellungen einer Person? (auch für Tests und die Vorschau nutzbar)
create or replace function public.activity_matches_alert(
  p_settings jsonb, p_pace int, p_speed numeric, p_sports text[],
  p_sport text, p_tempo numeric, p_km numeric, p_dist_km double precision
) returns boolean language plpgsql immutable as $$
declare
  a jsonb := coalesce(p_settings -> 'alerts', '{}'::jsonb);
  v_auto boolean := coalesce((a ->> 'auto')::boolean, true);
  v_radius double precision := least(greatest(coalesce((a ->> 'radiusKm')::double precision, 15), 1), 100);
  v_sports text[];
  lo numeric; hi numeric; maxkm numeric;
begin
  if not coalesce((a ->> 'on')::boolean, true) then return false; end if;
  if p_dist_km is null or p_dist_km > v_radius then return false; end if;
  if jsonb_typeof(a -> 'sports') = 'array' then
    select array_agg(x) into v_sports from jsonb_array_elements_text(a -> 'sports') x;
  else
    v_sports := p_sports;
  end if;
  if v_sports is null or not (p_sport = any (v_sports)) then return false; end if;

  if p_sport = 'run' then
    -- Lauf-Tempo in s/km: kleiner = schneller.
    -- Automatisch: höchstens 30 s/km schneller und höchstens 60 s/km langsamer als das eigene Tempo.
    lo := case when v_auto then p_pace - 30 else coalesce((a ->> 'runPaceMin')::numeric, p_pace - 30) end;
    hi := case when v_auto then p_pace + 60 else coalesce((a ->> 'runPaceMax')::numeric, p_pace + 60) end;
    maxkm := coalesce((a ->> 'runMaxKm')::numeric, 15);
  else
    -- Rad-Tempo in km/h: größer = schneller.
    lo := case when v_auto then p_speed - 4 else coalesce((a ->> 'rideSpeedMin')::numeric, p_speed - 4) end;
    hi := case when v_auto then p_speed + 2 else coalesce((a ->> 'rideSpeedMax')::numeric, p_speed + 2) end;
    maxkm := coalesce((a ->> 'rideMaxKm')::numeric, 80);
  end if;
  if p_tempo < lo or p_tempo > hi then return false; end if;
  if p_km > maxkm then return false; end if;
  return true;
end $$;

create or replace function public.tg_activity_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days text[] := array['Mo','Di','Mi','Do','Fr','Sa','So'];
  v_local timestamp := new.starts_at at time zone 'Europe/Berlin';
  v_when text;
  v_tempo text;
begin
  if new.status <> 'open' or new.starts_at < now() or new.starts_at > now() + interval '21 days' then return new; end if;
  v_when := v_days[extract(isodow from v_local)::int] || ' ' || to_char(v_local, 'DD.MM., HH24:MI');
  v_tempo := case when new.sport = 'run'
    then floor(new.tempo / 60)::int || ':' || lpad((round(new.tempo)::int % 60)::text, 2, '0') || ' /km'
    else round(new.tempo)::int || ' km/h' end;

  insert into notifications (user_id, kind, body, activity_id)
  select p.id, 'nearby',
    case when new.sport = 'run' then 'Neuer Lauf' else 'Neue Radtour' end || ' in deiner Nähe: „' || new.title || '“ · '
      || v_when || ' · ' || (case when new.distance_km = round(new.distance_km) then round(new.distance_km)::int::text else replace(to_char(new.distance_km, 'FM990.0'), '.', ',') end) || ' km · ' || v_tempo
      || ' · ' || round(distance_km(p.city_lat, p.city_lng, new.lat, new.lng))::int || ' km entfernt',
    new.id
  from profiles p
  join profile_private pp on pp.id = p.id
  where p.id <> new.host_id
    and p.suspended_at is null
    and p.city_lat is not null and p.city_lng is not null
    and p.city_lat between new.lat - 1 and new.lat + 1
    and not is_blocked_between(p.id, new.host_id)
    and activity_matches_alert(pp.settings, p.pace, p.speed, p.sports, new.sport, new.tempo, new.distance_km,
                               distance_km(p.city_lat, p.city_lng, new.lat, new.lng))
    -- Nicht zu viele: höchstens 6 solcher Hinweise pro Person und Tag
    and (select count(*) from notifications n where n.user_id = p.id and n.kind = 'nearby' and n.created_at > now() - interval '1 day') < 6;
  return new;
exception when others then
  return new; -- Hinweise dürfen das Anlegen nie verhindern
end $$;

drop trigger if exists activity_nearby on public.activities;
create trigger activity_nearby after insert on public.activities
  for each row execute function public.tg_activity_nearby();

revoke execute on function public.tg_activity_nearby() from public, anon, authenticated;
