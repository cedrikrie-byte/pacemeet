-- Rauchtest für die echte Supabase-Datenbank.
-- Läuft komplett in einem Block und bricht am Ende absichtlich ab:
-- Dadurch werden ALLE Testdaten automatisch zurückgerollt. Das Ergebnis steht in der Fehlermeldung.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  act uuid;
  n int;
  res text := '';
  ok boolean;
  procedure_note text;
begin
  insert into auth.users (id, email, aud, role) values (a, 'rauchtest-a@pacemeet.invalid', 'authenticated', 'authenticated'),
                                                       (b, 'rauchtest-b@pacemeet.invalid', 'authenticated', 'authenticated');

  -- Als A: Profil und Aktivität
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into profiles (id, name, city) values (a, 'Test A', 'essen');
  insert into profile_private (id) values (a);
  insert into activities (title, sport, city, meeting_point, lat, lng, starts_at, distance_km, tempo, max_participants)
    values ('Rauchtest', 'run', 'essen', 'Grugapark', 51.43, 7.0, now() + interval '3 hours', 6, 420, 4) returning id into act;
  execute 'reset role';
  res := res || 'Aktivität anlegen: ok | ';

  -- Als B: Profil, Umkreissuche, Beitritt, Chat
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into profiles (id, name, city) values (b, 'Test B', 'essen');
  insert into profile_private (id) values (b);
  select count(*) into n from activities_near(51.4556, 7.0116, 25) where id = act;
  res := res || 'Umkreissuche: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  select count(*) into n from activity_participants where activity_id = act;
  res := res || 'Teilnehmerliste vor Beitritt verborgen: ' || case when n = 0 then 'ok' else 'FEHLER' end || ' | ';
  perform join_activity(act);
  select participant_count into n from activities where id = act;
  res := res || 'Beitritt: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  insert into messages (activity_id, user_id, body) values (act, b, 'Hallo aus dem Rauchtest');
  begin
    update activities set participant_count = 99 where id = act;
    res := res || 'Zähler geschützt: FEHLER | ';
  exception when others then
    res := res || 'Zähler geschützt: ok | ';
  end;
  begin
    insert into messages (activity_id, user_id, body, is_system) values (act, b, 'Fake', true);
    res := res || 'Systemnachricht fälschen verhindert: FEHLER | ';
  exception when others then
    res := res || 'Systemnachricht fälschen verhindert: ok | ';
  end;
  execute 'reset role';

  -- Als A: Benachrichtigungen und Chat sichtbar
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from notifications where user_id = a and kind in ('join', 'chat');
  res := res || 'Gastgeber benachrichtigt: ' || case when n = 2 then 'ok' else 'FEHLER (' || n || ')' end || ' | ';
  select count(*) into n from messages where activity_id = act;
  res := res || 'Chat sichtbar (inkl. System): ' || case when n = 2 then 'ok' else 'FEHLER (' || n || ')' end || ' | ';
  update activities set starts_at = now() + interval '4 hours' where id = act;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from notifications where user_id = b and kind = 'change';
  res := res || 'Änderung gemeldet: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  perform leave_activity(act);
  select participant_count into n from activities where id = act;
  res := res || 'Absage: ' || case when n = 0 then 'ok' else 'FEHLER' end || ' | ';
  execute 'reset role';

  -- Ohne Anmeldung
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    select count(*) into n from activities;
    res := res || 'Anonym gesperrt: ' || case when n = 0 then 'ok' else 'FEHLER' end || ' | ';
  exception when others then
    res := res || 'Anonym gesperrt: ok | ';
  end;
  execute 'reset role';

  -- Stadtmittelpunkt wird gerundet gespeichert
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update profiles set city = 'Münster', city_lat = 51.962510, city_lng = 7.625188 where id = a;
  select count(*) into n from profiles where id = a and city_lat = 51.96 and city_lng = 7.63;
  res := res || 'Stadt gerundet: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  begin
    update profiles set suspended_at = null where id = a;
    res := res || 'Sperrstatus geschützt: FEHLER | ';
  exception when others then
    res := res || 'Sperrstatus geschützt: ok | ';
  end;
  begin
    perform * from admin_reports('open');
    res := res || 'Meldungen nur für Admins: FEHLER | ';
  exception when others then
    res := res || 'Meldungen nur für Admins: ok | ';
  end;
  execute 'reset role';

  -- Moderation: A wird (nur im Test) Admin, B meldet nichts, A sperrt B
  insert into admins (user_id) values (a);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into reports (reported_id, reason) values (a, 'Rauchtest-Meldung');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from admin_reports('open') r where r.reason = 'Rauchtest-Meldung';
  res := res || 'Admin sieht Meldung: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  perform admin_suspend(b, 'Rauchtest');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform join_activity(act);
    res := res || 'Gesperrte können nicht beitreten: FEHLER | ';
  exception when others then
    res := res || 'Gesperrte können nicht beitreten: ok | ';
  end;
  select count(*) into n from my_status() where suspended;
  res := res || 'Sperre sichtbar für Betroffene: ' || case when n = 1 then 'ok' else 'FEHLER' end || ' | ';
  execute 'reset role';

  raise exception 'RAUCHTEST (alles zurückgerollt): %', res;
end $$;
