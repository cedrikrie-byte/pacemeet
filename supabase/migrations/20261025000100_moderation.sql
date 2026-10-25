-- PaceMeet: Moderation
-- Admins sehen alle Meldungen und können Nutzer sperren.
-- Gesperrte Nutzer können nichts mehr anlegen, beitreten oder schreiben,
-- und sind für andere unsichtbar (Profil und Aktivitäten).

create table if not exists public.admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;   -- keine Regeln: nur über Funktionen erreichbar
revoke all on public.admins from anon, authenticated;

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text check (char_length(suspended_reason) <= 300);
-- Die Spalten stehen bewusst nicht in den Update-Rechten der Nutzer.

create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = p_user)
$$;

create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select suspended_at is not null from profiles where id = p_user), false)
$$;

-- Gesperrte Nutzer: keine neuen Aktivitäten, Teilnahmen oder Nachrichten
create or replace function public.tg_block_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  -- activities: host_id, activity_participants/messages: user_id
  v_user := coalesce(to_jsonb(new) ->> 'host_id', to_jsonb(new) ->> 'user_id')::uuid;
  if v_user is not null and is_suspended(v_user) then
    raise exception 'Dein Konto ist gesperrt. Schreib uns, wenn du glaubst, dass das ein Fehler ist.';
  end if;
  return new;
end $$;

drop trigger if exists block_suspended on public.activities;
create trigger block_suspended before insert on public.activities for each row execute function public.tg_block_suspended();
drop trigger if exists block_suspended on public.activity_participants;
create trigger block_suspended before insert on public.activity_participants for each row execute function public.tg_block_suspended();
drop trigger if exists block_suspended on public.messages;
create trigger block_suspended before insert on public.messages for each row execute function public.tg_block_suspended();

-- Sichtbarkeit: Gesperrte verschwinden für andere
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or (
    suspended_at is null and
    not public.is_blocked_between(auth.uid(), id) and (
      profile_visibility = 'everyone' or kind = 'club'
      or public.shares_activity(auth.uid(), id)
      or exists (select 1 from public.activities a where a.host_id = profiles.id and a.status = 'open' and a.starts_at > now() - interval '1 day')
    )
  )
);

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  host_id = auth.uid() or (not public.is_blocked_between(auth.uid(), host_id) and not public.is_suspended(host_id))
);

-- Eigenen Status abfragen (für Hinweis in der App)
create or replace function public.my_status()
returns table (is_admin boolean, suspended boolean, suspended_reason text)
language sql stable security definer set search_path = public as $$
  select is_admin(auth.uid()), p.suspended_at is not null, p.suspended_reason from profiles p where p.id = auth.uid()
$$;

-------------------------------------------------------------------------------
-- Admin-Funktionen (prüfen selbst, ob die aufrufende Person Admin ist)
-------------------------------------------------------------------------------

create or replace function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, created_at timestamptz, reason text, status text,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_suspended boolean, reports_against int,
  activity_id uuid, activity_title text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Nur für Admins'; end if;
  return query
    select r.id, r.created_at, r.reason, r.status,
      r.reporter_id, rp.name, r.reported_id, tp.name, tp.suspended_at is not null,
      (select count(*)::int from reports x where x.reported_id = r.reported_id),
      r.activity_id, a.title
    from reports r
    left join profiles rp on rp.id = r.reporter_id
    left join profiles tp on tp.id = r.reported_id
    left join activities a on a.id = r.activity_id
    where (p_status = 'all' or (p_status = 'open' and r.status = 'open') or (p_status = 'done' and r.status <> 'open'))
    order by r.created_at desc
    limit 200;
end $$;

create or replace function public.admin_set_report_status(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Nur für Admins'; end if;
  if p_status not in ('open','reviewed','actioned','dismissed') then raise exception 'Unbekannter Status'; end if;
  update reports set status = p_status where id = p_report;
end $$;

create or replace function public.admin_suspend(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Nur für Admins'; end if;
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst sperren'; end if;
  if is_admin(p_user) then raise exception 'Admins können nicht gesperrt werden'; end if;
  update profiles set suspended_at = now(), suspended_reason = left(coalesce(p_reason, ''), 300) where id = p_user;
  -- Kommende Aktivitäten der Person absagen (Teilnehmende werden benachrichtigt)
  update activities set status = 'cancelled' where host_id = p_user and status = 'open' and starts_at > now();
  -- Kommende Teilnahmen beenden
  update activities a set participant_count = greatest(0, participant_count - 1)
    from activity_participants p where p.activity_id = a.id and p.user_id = p_user and a.starts_at > now();
  delete from activity_participants p using activities a where p.activity_id = a.id and p.user_id = p_user and a.starts_at > now();
  update reports set status = 'actioned' where reported_id = p_user and status = 'open';
end $$;

create or replace function public.admin_unsuspend(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Nur für Admins'; end if;
  update profiles set suspended_at = null, suspended_reason = null where id = p_user;
end $$;

revoke execute on function public.admin_reports(text), public.admin_set_report_status(uuid, text),
  public.admin_suspend(uuid, text), public.admin_unsuspend(uuid), public.my_status() from public, anon;
grant execute on function public.admin_reports(text), public.admin_set_report_status(uuid, text),
  public.admin_suspend(uuid, text), public.admin_unsuspend(uuid), public.my_status() to authenticated;
