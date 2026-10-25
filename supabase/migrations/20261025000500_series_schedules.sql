-- PaceMeet: Laufende Serien täglich um 3:15 Uhr (UTC) für die nächsten Wochen nachlegen.
-- Nur auf Supabase (braucht pg_cron); in lokalen Tests übersprungen.
select cron.unschedule('pacemeet-series') where exists (select 1 from cron.job where jobname = 'pacemeet-series');
select cron.schedule('pacemeet-series', '15 3 * * *', $$select public.extend_all_series()$$);
