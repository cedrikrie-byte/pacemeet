-- PaceMeet: Zeitpläne und Push-Auslöser (nur auf Supabase, braucht pg_cron und pg_net)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Erinnerungen alle 10 Minuten prüfen
select cron.schedule('pacemeet-reminders', '*/10 * * * *', $$select public.send_reminders()$$);

-- Öffentliche Angaben für den Push-Versand (der anon-Schlüssel ist ohnehin öffentlich)
insert into public.app_config (key, value) values
  ('push_function_url', 'https://hzlrpthsptmsjatmrmaq.supabase.co/functions/v1/send-push'),
  ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bHJwdGhzcHRtc2phdG1ybWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NjA1NzksImV4cCI6MjEwODQzNjU3OX0._VMSSpHlLrW9JDGPR9ZklI7LPzTu6m8bnW2iElV0dZY')
on conflict (key) do update set value = excluded.value;

-- Jede neue Benachrichtigung an die Push-Funktion melden (asynchron, blockiert nichts)
create or replace function public.tg_notifications_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text := (select value from app_config where key = 'push_function_url');
  v_key text := (select value from app_config where key = 'anon_key');
begin
  if v_url is null or v_key is null then return new; end if;
  -- Nur senden, wenn die Person überhaupt ein Gerät für Push angemeldet hat
  if not exists (select 1 from push_subscriptions s where s.user_id = new.user_id) then return new; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  return new; -- Push darf nie das Speichern der Benachrichtigung verhindern
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.tg_notifications_push();
