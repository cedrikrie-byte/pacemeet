-- Profilstadt mit Mittelpunkt (für die Umkreissuche in ganz Deutschland).
-- Gespeichert wird nur der Stadtmittelpunkt, auf ca. 1 km gerundet, nie eine Wohnadresse.
alter table public.profiles
  add column if not exists city_lat double precision check (city_lat between -90 and 90),
  add column if not exists city_lng double precision check (city_lng between -180 and 180);

create or replace function public.tg_profiles_round_city()
returns trigger language plpgsql as $$
begin
  new.city_lat := round(new.city_lat::numeric, 2)::double precision;
  new.city_lng := round(new.city_lng::numeric, 2)::double precision;
  return new;
end $$;
drop trigger if exists profiles_round_city on public.profiles;
create trigger profiles_round_city before insert or update of city_lat, city_lng on public.profiles
  for each row execute function public.tg_profiles_round_city();

grant update (city_lat, city_lng) on public.profiles to authenticated;
