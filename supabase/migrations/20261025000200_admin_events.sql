-- Admins legen Community-Events direkt in der App an
create policy events_admin_insert on public.events for insert to authenticated with check (public.is_admin(auth.uid()));
create policy events_admin_update on public.events for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy events_admin_delete on public.events for delete to authenticated using (public.is_admin(auth.uid()));
grant insert, update, delete on public.events to authenticated;

alter table public.events
  add constraint events_dates_check check (ends_on >= starts_on),
  add constraint events_name_check check (char_length(name) between 3 and 60),
  add constraint events_medal_check check (char_length(medal) between 2 and 30),
  add constraint events_required_max check (required <= 50);
