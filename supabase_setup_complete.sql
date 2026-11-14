-- ============================================================================
-- GNC Student Cashier Virtual Queue System
-- Supabase / PostgreSQL. Run the FULL script in Supabase SQL Editor.
-- Time zone for daily queue reset: Asia/Manila.
-- This manages queue tickets only; it does not accept or process payments.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. Profiles linked to Supabase Auth
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_number text unique,
  full_name text not null default '',
  email text,
  phone text,
  program text,
  year_level text,
  section text,
  role text not null default 'student' check (role in ('student','cashier','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Cashier services. Replace sample rows with GNC's actual transaction types.
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Physical cashier counters
create table if not exists public.cashier_windows (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  ticket_prefix text,
  name text not null,
  location_description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Upgrade compatibility: the earlier appointment-only prototype did not have
-- ticket prefixes. Backfill those counters before enforcing NOT NULL/UNIQUE.
alter table public.cashier_windows add column if not exists ticket_prefix text;
update public.cashier_windows
set ticket_prefix = case
  when code ~ '^CASHIER-[0-9]+$' then 'C' || substring(code from '[0-9]+$')
  else 'C' || upper(substr(replace(id::text, '-', ''), 1, 6))
end
where ticket_prefix is null or btrim(ticket_prefix) = '';
alter table public.cashier_windows alter column ticket_prefix set not null;
create unique index if not exists idx_cashier_windows_ticket_prefix
  on public.cashier_windows (ticket_prefix);

-- 4. Per-counter, per-day number generator. Not readable from the browser.
create table if not exists public.queue_counters (
  cashier_window_id uuid not null references public.cashier_windows(id) on delete cascade,
  queue_date date not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (cashier_window_id, queue_date)
);

-- 5. Virtual queue tickets
create table if not exists public.queue_tickets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  cashier_window_id uuid not null references public.cashier_windows(id) on delete restrict,
  queue_date date not null default (timezone('Asia/Manila', now()))::date,
  ticket_number integer not null check (ticket_number > 0),
  ticket_code text not null,
  status text not null default 'waiting'
    check (status in ('waiting','serving','completed','cancelled','no_show')),
  student_note text,
  staff_note text,
  called_at timestamptz,
  completed_at timestamptz,
  called_by uuid references public.profiles(id) on delete set null,
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_ticket_number_unique unique (cashier_window_id, queue_date, ticket_number),
  constraint queue_ticket_code_unique unique (cashier_window_id, queue_date, ticket_code)
);

create index if not exists idx_queue_tickets_daily_window_status
  on public.queue_tickets (queue_date, cashier_window_id, status, created_at);
create index if not exists idx_queue_tickets_student_created
  on public.queue_tickets (student_id, created_at desc);
create unique index if not exists idx_one_active_ticket_per_student_per_day
  on public.queue_tickets (student_id, queue_date)
  where status in ('waiting','serving');
create unique index if not exists idx_one_serving_ticket_per_cashier_day
  on public.queue_tickets (cashier_window_id, queue_date)
  where status = 'serving';
alter table public.queue_tickets drop constraint if exists queue_ticket_student_note_length_check;
alter table public.queue_tickets add constraint queue_ticket_student_note_length_check
  check (student_note is null or char_length(student_note) <= 240);
alter table public.queue_tickets drop constraint if exists queue_ticket_staff_note_length_check;
alter table public.queue_tickets add constraint queue_ticket_staff_note_length_check
  check (staff_note is null or char_length(staff_note) <= 500);

-- 6. updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists queue_tickets_set_updated_at on public.queue_tickets;
create trigger queue_tickets_set_updated_at before update on public.queue_tickets
for each row execute function public.set_updated_at();

-- 7. Create student profile on Auth sign-up. Role is never taken from metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, student_number, full_name, email, phone, program, year_level, section, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'student_number',''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(coalesce(new.email,''),'@',1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone',''),
    nullif(new.raw_user_meta_data ->> 'program',''),
    nullif(new.raw_user_meta_data ->> 'year_level',''),
    nullif(new.raw_user_meta_data ->> 'section',''),
    'student'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 8. Role helper used by policies and privileged RPCs
create or replace function public.is_cashier_or_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('cashier','admin')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 9. Student takes a ticket. Output names are result-prefixed to avoid collisions.
-- NULL cashier id means auto-assign to the shorter active line.
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
  v_window public.cashier_windows%rowtype;
  v_last_number integer;
  v_ticket_id uuid;
  v_ticket_code text;
begin
  if v_user_id is null then
    raise exception 'Please sign in before getting a queue number.';
  end if;

  -- Serialize daily assignment so automatic shortest-line selection is consistent.
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

  -- Allocate the next number atomically for the selected cashier and Manila date.
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
    student_id,
    service_id,
    cashier_window_id,
    queue_date,
    ticket_number,
    ticket_code,
    student_note
  )
  values (
    v_user_id,
    p_service_id,
    v_window.id,
    v_queue_date,
    v_last_number,
    v_ticket_code,
    nullif(btrim(p_student_note), '')
  )
  returning id into v_ticket_id;

  return query
  select v_ticket_id, v_ticket_code, v_window.id, v_window.name, v_queue_date;
exception
  when unique_violation then
    raise exception 'You already have an active queue number today, or this ticket could not be issued. Refresh My Queue and try again if needed.'
      using errcode = '23505';
end;
$take_queue_number$;

-- 10. Safe public queue summary API. It exposes no student details.
create or replace function public.get_public_queue_status()
returns table (
  cashier_window_id uuid,
  cashier_code text,
  cashier_name text,
  is_active boolean,
  waiting_count bigint,
  serving_ticket_code text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $public_queue_status$
  select
    cashier_row.id,
    cashier_row.code,
    cashier_row.name,
    cashier_row.is_active,
    count(queue_row.id) filter (where queue_row.status = 'waiting')::bigint,
    max(queue_row.ticket_code) filter (where queue_row.status = 'serving')
  from public.cashier_windows as cashier_row
  left join public.queue_tickets as queue_row
    on queue_row.cashier_window_id = cashier_row.id
   and queue_row.queue_date = (timezone('Asia/Manila', now()))::date
   and queue_row.status in ('waiting', 'serving')
  where cashier_row.is_active is true or queue_row.id is not null
  group by cashier_row.id, cashier_row.code, cashier_row.name, cashier_row.is_active
  order by cashier_row.code;
$public_queue_status$;


-- 11. Student-only position lookup. Position 0 means currently being served.
create or replace function public.get_my_queue_position(p_ticket_id uuid)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ticket public.queue_tickets%rowtype;
  v_position integer;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into v_ticket from public.queue_tickets
  where id = p_ticket_id and student_id = auth.uid();
  if not found then raise exception 'Queue ticket not found.'; end if;
  if v_ticket.status = 'serving' then return 0; end if;
  if v_ticket.status <> 'waiting' then return null; end if;
  select
    (select count(*)::integer
       from public.queue_tickets q
      where q.cashier_window_id = v_ticket.cashier_window_id
        and q.queue_date = v_ticket.queue_date
        and q.status = 'waiting'
        and (q.created_at, q.id) < (v_ticket.created_at, v_ticket.id))
    + (select count(*)::integer
         from public.queue_tickets q
        where q.cashier_window_id = v_ticket.cashier_window_id
          and q.queue_date = v_ticket.queue_date
          and q.status = 'serving')
    + 1
    into v_position;
  return v_position;
end;
$$;

-- 12. Student cancels their own ticket only while it is waiting.
create or replace function public.cancel_my_queue_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows integer;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  update public.queue_tickets
    set status = 'cancelled'
  where id = p_ticket_id and student_id = auth.uid() and status = 'waiting'
    and queue_date = (timezone('Asia/Manila', now()))::date;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'This ticket can no longer be cancelled.'; end if;
end;
$$;

-- 13. Cashier calls the next ticket for their selected counter.
-- The counter row lock prevents two staff clicks from calling two students at once.
create or replace function public.staff_call_next(p_cashier_window_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_date date := (timezone('Asia/Manila', now()))::date;
  v_ticket_id uuid;
begin
  if auth.uid() is null or not public.is_cashier_or_admin() then
    raise exception 'Only cashier or admin accounts can call queue numbers.';
  end if;
  -- Inactive counters cannot receive new tickets, but staff may finish tickets
  -- already issued before the counter was closed.
  perform 1 from public.cashier_windows where id = p_cashier_window_id for update;
  if not found then raise exception 'Cashier counter not found.'; end if;
  if exists (
    select 1 from public.queue_tickets
    where cashier_window_id = p_cashier_window_id and queue_date = v_date and status = 'serving'
  ) then
    raise exception 'Complete or skip the currently serving ticket before calling the next number.';
  end if;
  select id into v_ticket_id
  from public.queue_tickets
  where cashier_window_id = p_cashier_window_id and queue_date = v_date and status = 'waiting'
  order by created_at asc, id asc
  limit 1 for update skip locked;
  if v_ticket_id is null then raise exception 'There are no students waiting in this line.'; end if;
  update public.queue_tickets
    set status = 'serving', called_at = now(), called_by = auth.uid()
  where id = v_ticket_id;
  return v_ticket_id;
end;
$$;

-- 14. Staff completes or skips a ticket currently assigned to their counter.
create or replace function public.staff_update_queue_ticket(
  p_ticket_id uuid,
  p_new_status text,
  p_staff_note text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_current_status text;
begin
  if auth.uid() is null or not public.is_cashier_or_admin() then
    raise exception 'Only cashier or admin accounts can update queue tickets.';
  end if;
  if p_new_status not in ('completed','no_show','cancelled') then
    raise exception 'Invalid ticket status.';
  end if;
  select status into v_current_status from public.queue_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Queue ticket not found.'; end if;
  if not ((v_current_status = 'serving' and p_new_status in ('completed','no_show'))
       or (v_current_status = 'waiting' and p_new_status in ('no_show','cancelled'))) then
    raise exception 'This ticket cannot be changed to that status.';
  end if;
  update public.queue_tickets
    set status = p_new_status,
        staff_note = coalesce(nullif(trim(p_staff_note),''), staff_note),
        handled_by = auth.uid(),
        completed_at = case when p_new_status = 'completed' then now() else completed_at end
  where id = p_ticket_id;
end;
$$;

-- 15. Row Level Security
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.cashier_windows enable row level security;
alter table public.queue_counters enable row level security;
alter table public.queue_tickets enable row level security;

drop policy if exists "Read own profile or staff reads all" on public.profiles;
drop policy if exists "profiles_read_self_or_staff" on public.profiles;
create policy "profiles_read_self_or_staff" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_cashier_or_admin());
drop policy if exists "Update own profile or staff updates profiles" on public.profiles;
drop policy if exists "profiles_update_self_or_staff" on public.profiles;
create policy "profiles_update_self_or_staff" on public.profiles for update to authenticated
using (id = auth.uid() or public.is_cashier_or_admin())
with check (id = auth.uid() or public.is_cashier_or_admin());

drop policy if exists "authenticated_read_services" on public.services;
create policy "authenticated_read_services" on public.services for select to authenticated using (true);
drop policy if exists "Staff manage services" on public.services;
drop policy if exists "staff_manage_services" on public.services;
drop policy if exists "admin_manage_services" on public.services;
create policy "admin_manage_services" on public.services for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated_read_cashier_windows" on public.cashier_windows;
create policy "authenticated_read_cashier_windows" on public.cashier_windows for select to authenticated using (true);
drop policy if exists "Staff manage cashier windows" on public.cashier_windows;
drop policy if exists "staff_manage_cashier_windows" on public.cashier_windows;
drop policy if exists "admin_manage_cashier_windows" on public.cashier_windows;
create policy "admin_manage_cashier_windows" on public.cashier_windows for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Internal ticket counter table is intentionally inaccessible directly.
drop policy if exists "staff_no_direct_queue_counter_access" on public.queue_counters;
create policy "staff_no_direct_queue_counter_access" on public.queue_counters for all to authenticated
using (false) with check (false);

drop policy if exists "students_read_own_tickets_staff_read_all" on public.queue_tickets;
create policy "students_read_own_tickets_staff_read_all" on public.queue_tickets for select to authenticated
using (student_id = auth.uid() or public.is_cashier_or_admin());
-- No direct INSERT/UPDATE/DELETE policies for tickets; use the RPCs above.

-- 16. Grants
-- Remove inherited/default browser table privileges, then grant only the access
-- required by the RLS policies below. The public display uses a safe RPC, not table reads.
revoke all on public.profiles, public.services, public.cashier_windows,
  public.queue_counters, public.queue_tickets from anon, authenticated;
revoke update (student_number, full_name, phone, program, year_level, section)
  on public.profiles from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, program, year_level, section) on public.profiles to authenticated;
grant select on public.services, public.cashier_windows to authenticated;
grant insert, update, delete on public.services, public.cashier_windows to authenticated;
grant select on public.queue_tickets to authenticated;

revoke all on function public.is_cashier_or_admin() from public;
grant execute on function public.is_cashier_or_admin() to authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.take_queue_number(uuid, uuid, text) from public;
grant execute on function public.take_queue_number(uuid, uuid, text) to authenticated;

-- Refresh the Supabase REST schema cache after replacing the RPC return columns.
notify pgrst, 'reload schema';
revoke all on function public.get_public_queue_status() from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.get_public_queue_status() to anon, authenticated;
revoke all on function public.get_my_queue_position(uuid) from public;
grant execute on function public.get_my_queue_position(uuid) to authenticated;
revoke all on function public.cancel_my_queue_ticket(uuid) from public;
grant execute on function public.cancel_my_queue_ticket(uuid) to authenticated;
revoke all on function public.staff_call_next(uuid) from public;
grant execute on function public.staff_call_next(uuid) to authenticated;
revoke all on function public.staff_update_queue_ticket(uuid, text, text) from public;
grant execute on function public.staff_update_queue_ticket(uuid, text, text) to authenticated;

-- 17. Starter records. Confirm actual service names and counter labels with GNC.
insert into public.services (code, name, description) values
  ('SCHOOL-FEES', 'School Fees Payment', 'Sample service label. Confirm this with the GNC cashier office.'),
  ('MISC-FEES', 'Miscellaneous Fees', 'Sample service label. Edit to match the official cashier process.'),
  ('OTHER', 'Other Cashier Transaction', 'For other transactions accepted by the cashier.')
on conflict (code) do nothing;

insert into public.cashier_windows (code, ticket_prefix, name, location_description) values
  ('CASHIER-1', 'C1', 'Cashier 1', 'GNC cashier area'),
  ('CASHIER-2', 'C2', 'Cashier 2', 'GNC cashier area')
on conflict (code) do nothing;

-- 18. Promote the intended staff AFTER they create accounts through the app.
-- Run with the actual email addresses; never expose service_role keys in frontend code.
-- update public.profiles set role = 'admin' where email = 'school-admin@example.com';
-- update public.profiles set role = 'cashier' where email = 'cashier1@example.com';

-- 19. Enable realtime for queue ticket changes (safe to ignore if already present).
do $$
begin
  alter publication supabase_realtime add table public.queue_tickets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- ============================================================================
-- END. In Supabase Auth, configure the school's allowed sign-in method.
-- ============================================================================


-- ============================================================================
-- ADMIN CONTROL PANEL AND PAUSE/RESUME FEATURES
-- ============================================================================

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

-- 6) Least-privilege execution grants.
revoke all on function public.get_queue_system_status() from public;
grant execute on function public.get_queue_system_status() to anon, authenticated;
revoke all on function public.admin_set_queue_access(boolean, text) from public;
grant execute on function public.admin_set_queue_access(boolean, text) to authenticated;
revoke all on function public.take_queue_number(uuid, uuid, text) from public;
grant execute on function public.take_queue_number(uuid, uuid, text) to authenticated;
revoke all on function public.get_admin_auth_email(text) from public;
grant execute on function public.get_admin_auth_email(text) to anon, authenticated;
revoke all on function public.admin_call_queue_ticket(uuid) from public;
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


-- 17. Student opt-in notifications (Web Push and email).
create table if not exists public.queue_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default false,
  device_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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
alter table public.queue_notification_preferences enable row level security;
alter table public.queue_push_subscriptions enable row level security;
revoke all on public.queue_notification_preferences, public.queue_push_subscriptions from public, anon;
grant select, insert, update, delete on public.queue_notification_preferences, public.queue_push_subscriptions to authenticated;
drop policy if exists queue_notification_preferences_owner_all on public.queue_notification_preferences;
create policy queue_notification_preferences_owner_all on public.queue_notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists queue_push_subscriptions_owner_all on public.queue_push_subscriptions;
create policy queue_push_subscriptions_owner_all on public.queue_push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop trigger if exists queue_notification_preferences_set_updated_at on public.queue_notification_preferences;
create trigger queue_notification_preferences_set_updated_at before update on public.queue_notification_preferences for each row execute function public.set_updated_at();
drop trigger if exists queue_push_subscriptions_set_updated_at on public.queue_push_subscriptions;
create trigger queue_push_subscriptions_set_updated_at before update on public.queue_push_subscriptions for each row execute function public.set_updated_at();
