-- Beispiel: ein Community-Event anlegen (im Supabase SQL-Editor ausführen und anpassen)
insert into public.events (id, name, starts_on, ends_on, required, medal, hue, description) values
  ('ruhr-herbst-2026', 'Ruhr Herbstwoche 2026', '2026-10-26', '2026-11-01', 3, 'Herbstwoche', 22,
   'Mach in dieser Woche bei 3 gemeinsamen Aktivitäten mit, egal welches Tempo.')
on conflict (id) do nothing;
