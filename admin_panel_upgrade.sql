-- GNC ADMIN PANEL UPGRADE — COMPLETE FILE
-- IMPORTANT: In Supabase SQL Editor, replace the editor contents with this ENTIRE file.
-- Press Ctrl+A, paste the complete file, then click Run. Do not run only a selected section.
-- The unterminated dollar-quoted string error occurs when a closing delimiter is sent
-- without its matching opening function definition. This full file contains all sections.
-- Run from top to bottom; do not start at the ticket issuance function's closing line.

-- ============================================================================
-- GNC Student Cashier Virtual Queue: Admin control panel upgrade
-- Run the ENTIRE file in Supabase SQL Editor on the existing GNC queue schema.
-- Does not delete profiles, tickets, counters, services, or queue history.
-- ============================================================================

-- Admin username is an identifier only; passwords remain exclusively in Supabase Auth.
alter table public.profiles add column if not exists username text;
create unique index if not exists idx_profiles_username_ci
  on public.profiles (lower(username)) where username is not null;

-- 1) Persistent global switch. Pausing student access never deletes queue data
--    and does not disable cashier staff from calling existing tickets.
create table if not exists public.queue_system_settings (
  setting_key text primary key check (setting_key = 'global'),
  student_access_enabled boolean not null default true,
  status_message text not null default 'Online student access is open.',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.queue_system_settings (setting_key, student_access_enabled, status_message)
values ('global', true, 'Online student access is open.')
on conflict (setting_key) do nothing;

-- Audit trail for every pause/resume action.
create table if not exists public.queue_system_events (
  id bigint generated always as identity primary key,
  student_access_enabled boolean not null,
  status_message text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.queue_system_settings enable row level security;
alter table public.queue_system_events enable row level security;

-- Settings are accessed only through narrow security-definer RPC functions.
revoke all on public.queue_system_settings from anon, authenticated;
revoke all on public.queue_system_events from anon, authenticated;
grant select on public.queue_system_events to authenticated;
drop policy if exists queue_system_events_admin_read on public.queue_system_events;
create policy queue_system_events_admin_read
  on public.queue_system_events for select to authenticated
  using (public.is_admin());

-- Keep updated_at consistent with the existing helper from the base schema.
drop trigger if exists queue_system_settings_set_updated_at on public.queue_system_settings;
create trigger queue_system_settings_set_updated_at
  before update on public.queue_system_settings
  for each row execute function public.set_updated_at();

-- 2) Public, privacy-safe read. This never exposes admin identity or audit data.
create or replace function public.get_queue_system_status()
returns table (
  student_access_enabled boolean,
  status_message text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $get_queue_system_status$
  select
    setting_row.student_access_enabled,
    setting_row.status_message,
    setting_row.updated_at
  from public.queue_system_settings as setting_row
  where setting_row.setting_key = 'global';
$get_queue_system_status$;

-- Username sign-in resolver. It returns only the email for the single configured
-- GNC administrator identifier; Supabase Auth still validates the password.
create or replace function public.get_admin_auth_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $get_admin_auth_email$
  select profile_row.email
  from public.profiles as profile_row
  where profile_row.role = 'admin'
    and profile_row.username = 'GNCICashier2026'
    and lower(btrim(coalesce(p_username, ''))) = lower('GNCICashier2026')
  limit 1;
$get_admin_auth_email$;

-- 3) Admin-only pause/resume. Uses the same advisory lock as ticket issuance,
--    so a pause waits for any in-flight ticket transaction to finish first.
drop function if exists public.admin_set_queue_access(boolean, text);
create function public.admin_set_queue_access(
  p_enabled boolean,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $admin_set_queue_access$
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

  perform pg_advisory_xact_lock(
    hashtext('gnc_queue_assignment_' || v_date::text)::bigint
  );

  v_message := case
    when p_enabled then 'Online student access is open.'
    else coalesce(
      nullif(btrim(p_message), ''),
      'Online student access is temporarily paused by the cashier office. Please check again later.'
    )
  end;

  update public.queue_system_settings as setting_row
    set student_access_enabled = p_enabled,
        status_message = v_message,
        updated_by = auth.uid()
  where setting_row.setting_key = 'global';

  if not found then
    raise exception 'System settings are missing. Re-run the admin panel upgrade.';
  end if;

  insert into public.queue_system_events (
    student_access_enabled, status_message, changed_by
  ) values (
    p_enabled, v_message, auth.uid()
  );
end;
$admin_set_queue_access$;

-- 4) Recreate ticket issuance and enforce the system switch in the database.
--    Output fields are result-prefixed to avoid PL/pgSQL column collisions.
drop function if exists public.take_queue_number(uuid, uuid, text);
create function public.take_queue_number(
  p_service_id uuid,
  p_cashier_window_id uuid default null,
  p_student_note text default null
)
returns table (
  result_ticket_id uuid,
  result_ticket_code text,
  result_cashier_window_id uuid,
  result_cashier_window_name text,
  result_queue_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $take_queue_number$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_queue_date date := (timezone('Asia/Manila', now()))::date;
  v_access_enabled boolean;
  v_status_message text;
  v_window public.cashier_windows%rowtype;
  v_last_number integer;
  v_ticket_id uuid;
  v_ticket_code text;
begin
  if v_user_id is null then
    raise exception 'Please sign in before getting a queue number.';
  end if;

  -- Same lock as admin_set_queue_access: pause/resume and ticket creation serialize.
  perform pg_advisory_xact_lock(
    hashtext('gnc_queue_assignment_' || v_queue_date::text)::bigint
  );

  select profile_row.role
    into v_user_role
  from public.profiles as profile_row
  where profile_row.id = v_user_id;

  if v_user_role is distinct from 'student' then
    raise exception 'Only student accounts can get a queue number.';
  end if;

  select setting_row.student_access_enabled, setting_row.status_message
    into v_access_enabled, v_status_message
  from public.queue_system_settings as setting_row
  where setting_row.setting_key = 'global';

  if not found or v_access_enabled is distinct from true then
    raise exception '%', coalesce(
      nullif(v_status_message, ''),
      'Online student access is temporarily unavailable. Please try again later.'
    );
  end if;

  if p_service_id is null or not exists (
    select 1
    from public.services as service_row
    where service_row.id = p_service_id
      and service_row.is_active is true
  ) then
    raise exception 'Please select an active cashier service.';
  end if;

  if p_student_note is not null and char_length(btrim(p_student_note)) > 240 then
    raise exception 'The additional note must be 240 characters or fewer.';
  end if;

  if exists (
    select 1
    from public.queue_tickets as existing_ticket
    where existing_ticket.student_id = v_user_id
      and existing_ticket.queue_date = v_queue_date
      and existing_ticket.status in ('waiting', 'serving')
  ) then
    raise exception 'You already have an active queue number today. Open My Queue to view it.';
  end if;

  if p_cashier_window_id is not null then
    select cashier_row.*
      into v_window
    from public.cashier_windows as cashier_row
    where cashier_row.id = p_cashier_window_id
      and cashier_row.is_active is true
    for share of cashier_row;

    if not found then
      raise exception 'That cashier is currently unavailable.';
    end if;
  else
    select cashier_row.*
      into v_window
    from public.cashier_windows as cashier_row
    left join lateral (
      select count(*)::integer as active_count
      from public.queue_tickets as queue_row
      where queue_row.cashier_window_id = cashier_row.id
        and queue_row.queue_date = v_queue_date
        and queue_row.status in ('waiting', 'serving')
    ) as queue_count on true
    where cashier_row.is_active is true
    order by queue_count.active_count asc, cashier_row.code asc
    limit 1
    for share of cashier_row;

    if not found then
      raise exception 'No cashier counter is open right now.';
    end if;
  end if;

  -- Atomically increment per-cashier, per-Manila-day ticket counter.
  insert into public.queue_counters as counter_row
    (cashier_window_id, queue_date, last_number)
  values
    (v_window.id, v_queue_date, 1)
  on conflict (cashier_window_id, queue_date)
  do update
    set last_number = counter_row.last_number + 1
  returning counter_row.last_number into v_last_number;

  v_ticket_code := v_window.ticket_prefix || '-' || lpad(v_last_number::text, 3, '0');

  insert into public.queue_tickets (
    student_id, service_id, cashier_window_id, queue_date,
    ticket_number, ticket_code, student_note
  ) values (
    v_user_id, p_service_id, v_window.id, v_queue_date,
    v_last_number, v_ticket_code, nullif(btrim(p_student_note), '')
  ) returning id into v_ticket_id;

  return query
  select v_ticket_id, v_ticket_code, v_window.id, v_window.name, v_queue_date;
exception
  when unique_violation then
    raise exception 'You already have an active queue number today, or this ticket could not be issued. Refresh My Queue and try again if needed.'
      using errcode = '23505';
end;
$take_queue_number$;

-- 5) Admin can call a particular waiting ticket from the control panel.
-- Locks the cashier window first (same lock order as staff_call_next), then the ticket.
-- Existing queue service remains available even while student ticket intake is paused.
create or replace function public.admin_call_queue_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $admin_call_queue_ticket$
declare
  v_today date := (timezone('Asia/Manila', now()))::date;
  v_window_id uuid;
  v_ticket record;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only the GNC administrator can call a selected queue number.';
  end if;
  if p_ticket_id is null then
    raise exception 'Select a waiting queue ticket first.';
  end if;

  select queue_row.cashier_window_id
    into v_window_id
  from public.queue_tickets as queue_row
  where queue_row.id = p_ticket_id
    and queue_row.queue_date = v_today
    and queue_row.status = 'waiting';

  if not found then
    raise exception 'That ticket is no longer waiting or is not for today.';
  end if;

  perform 1
  from public.cashier_windows as window_row
  where window_row.id = v_window_id
  for update;

  if not found then
    raise exception 'The ticket cashier counter could not be found.';
  end if;

  select
    queue_row.id,
    queue_row.ticket_code,
    queue_row.cashier_window_id,
    window_row.name as cashier_window_name,
    profile_row.full_name as student_name,
    profile_row.student_number as student_number,
    service_row.name as service_name
  into v_ticket
  from public.queue_tickets as queue_row
  join public.cashier_windows as window_row
    on window_row.id = queue_row.cashier_window_id
  join public.profiles as profile_row
    on profile_row.id = queue_row.student_id
  join public.services as service_row
    on service_row.id = queue_row.service_id
  where queue_row.id = p_ticket_id
    and queue_row.queue_date = v_today
    and queue_row.status = 'waiting'
  for update of queue_row;

  if not found then
    raise exception 'That ticket was already called or changed. Refresh the queue.';
  end if;

  if exists (
    select 1
    from public.queue_tickets as serving_row
    where serving_row.cashier_window_id = v_ticket.cashier_window_id
      and serving_row.queue_date = v_today
      and serving_row.status = 'serving'
  ) then
    raise exception 'Complete or skip the currently serving ticket before calling another number.';
  end if;

  update public.queue_tickets as update_row
    set status = 'serving',
        called_at = now(),
        called_by = auth.uid()
  where update_row.id = p_ticket_id;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'ticket_code', v_ticket.ticket_code,
    'cashier_window_id', v_ticket.cashier_window_id,
    'cashier_window_name', v_ticket.cashier_window_name,
    'student_name', v_ticket.student_name,
    'student_number', v_ticket.student_number,
    'service_name', v_ticket.service_name
  );
end;
$admin_call_queue_ticket$;


-- 6) Student opt-in notification preferences and Web Push subscriptions.
create table if not exists public.queue_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default false,
  device_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.queue_notification_preferences add column if not exists device_enabled boolean not null default false;
alter table public.queue_notification_preferences enable row level security;
revoke all on public.queue_notification_preferences from public, anon;
grant select, insert, update, delete on public.queue_notification_preferences to authenticated;
drop policy if exists queue_notification_preferences_owner_all on public.queue_notification_preferences;
create policy queue_notification_preferences_owner_all on public.queue_notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists queue_notification_preferences_set_updated_at on public.queue_notification_preferences;
create trigger queue_notification_preferences_set_updated_at before update on public.queue_notification_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.queue_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_queue_push_subscriptions_user_active on public.queue_push_subscriptions(user_id, is_active);
alter table public.queue_push_subscriptions enable row level security;
revoke all on public.queue_push_subscriptions from public, anon;
grant select, insert, update, delete on public.queue_push_subscriptions to authenticated;
drop policy if exists queue_push_subscriptions_owner_all on public.queue_push_subscriptions;
create policy queue_push_subscriptions_owner_all on public.queue_push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists queue_push_subscriptions_set_updated_at on public.queue_push_subscriptions;
create trigger queue_push_subscriptions_set_updated_at before update on public.queue_push_subscriptions
  for each row execute function public.set_updated_at();

-- 7) Least-privilege execution grants.
revoke all on function public.get_queue_system_status() from public;
grant execute on function public.get_queue_system_status() to anon, authenticated;
revoke all on function public.admin_set_queue_access(boolean, text) from public;
grant execute on function public.admin_set_queue_access(boolean, text) to authenticated;
revoke all on function public.take_queue_number(uuid, uuid, text) from public;
grant execute on function public.take_queue_number(uuid, uuid, text) to authenticated;
revoke all on function public.get_admin_auth_email(text) from public;
grant execute on function public.get_admin_auth_email(text) to anon, authenticated;
revoke all on function public.admin_call_queue_ticket(uuid) from public, anon;
grant execute on function public.admin_call_queue_ticket(uuid) to authenticated;

-- Existing cashiers/admins must remain able to call and complete already-issued
-- tickets while student access is paused. No pause check is added to staff RPCs.
notify pgrst, 'reload schema';

-- Verify the singleton row is present before exiting.
do $verify_queue_settings$
begin
  if not exists (
    select 1 from public.queue_system_settings as setting_row
    where setting_row.setting_key = 'global'
  ) then
    raise exception 'GNC queue system settings were not initialized.';
  end if;
end;
$verify_queue_settings$;

-- ============================================================================
-- END OF ADMIN PANEL UPGRADE
-- ============================================================================
