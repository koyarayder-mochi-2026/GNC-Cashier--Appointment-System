-- GNC pause/resume reliability patch
-- Run once in Supabase SQL Editor on the existing queue project.
-- This does not delete or modify queue tickets.

insert into public.queue_system_settings (setting_key, student_access_enabled, status_message)
values ('global', true, 'Online student access is open.')
on conflict (setting_key) do nothing;

create or replace function public.get_queue_system_status()
returns table (student_access_enabled boolean, status_message text, updated_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $gnc_get_queue_status$
  select setting_row.student_access_enabled, setting_row.status_message, setting_row.updated_at
  from public.queue_system_settings as setting_row
  where setting_row.setting_key = 'global';
$gnc_get_queue_status$;

create or replace function public.admin_set_queue_access(p_enabled boolean, p_message text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $gnc_admin_set_queue_access$
declare
  v_date date := (timezone('Asia/Manila', now()))::date;
  v_message text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only the GNC administrator can change student access.';
  end if;
  if p_enabled is null then
    raise exception 'Choose whether student access should be open or paused.';
  end if;
  if p_message is not null and char_length(btrim(p_message)) > 240 then
    raise exception 'The status message must be 240 characters or fewer.';
  end if;
  perform pg_advisory_xact_lock(hashtext('gnc_queue_assignment_' || v_date::text)::bigint);
  v_message := case when p_enabled then 'Online student access is open.'
    else coalesce(nullif(btrim(p_message), ''), 'Online student access is temporarily paused by the cashier office. Please check again later.') end;
  update public.queue_system_settings as setting_row
    set student_access_enabled = p_enabled, status_message = v_message, updated_by = auth.uid()
    where setting_row.setting_key = 'global';
  if not found then raise exception 'System settings are missing. Re-run the admin panel upgrade.'; end if;
  insert into public.queue_system_events(student_access_enabled, status_message, changed_by)
    values (p_enabled, v_message, auth.uid());
end;
$gnc_admin_set_queue_access$;

revoke all on function public.get_queue_system_status() from public;
grant execute on function public.get_queue_system_status() to anon, authenticated;
revoke all on function public.admin_set_queue_access(boolean, text) from public;
grant execute on function public.admin_set_queue_access(boolean, text) to authenticated;
notify pgrst, 'reload schema';
