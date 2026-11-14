-- GNC Cashier Queue: repair admin-call RPC and enable student call notifications.
-- Run the ENTIRE file in Supabase SQL Editor. Safe for an existing queue database.
-- Does not delete or reset profiles, cashier windows, tickets, counters, or history.

begin;

-- 1. Ensure the admin selected-ticket RPC exists with the exact PostgREST signature.
create or replace function public.admin_call_queue_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $gnc_admin_call_ticket$
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

  -- Read its counter, then lock the counter before locking the ticket.
  select ticket_row.cashier_window_id
    into v_window_id
  from public.queue_tickets as ticket_row
  where ticket_row.id = p_ticket_id
    and ticket_row.queue_date = v_today
    and ticket_row.status = 'waiting';

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
    ticket_row.id,
    ticket_row.ticket_code,
    ticket_row.cashier_window_id,
    window_row.name as cashier_window_name,
    profile_row.full_name as student_name,
    profile_row.student_number as student_number,
    service_row.name as service_name
  into v_ticket
  from public.queue_tickets as ticket_row
  join public.cashier_windows as window_row
    on window_row.id = ticket_row.cashier_window_id
  join public.profiles as profile_row
    on profile_row.id = ticket_row.student_id
  join public.services as service_row
    on service_row.id = ticket_row.service_id
  where ticket_row.id = p_ticket_id
    and ticket_row.queue_date = v_today
    and ticket_row.status = 'waiting'
  for update of ticket_row;

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
$gnc_admin_call_ticket$;

revoke all on function public.admin_call_queue_ticket(uuid) from public, anon;
grant execute on function public.admin_call_queue_ticket(uuid) to authenticated;

-- 1a. Reassert least-privilege browser table grants. Students must not be able
--     to self-promote by changing profiles.role/username or directly mutate tickets.
revoke all on public.profiles, public.queue_tickets from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.queue_tickets to authenticated;
grant update (full_name, phone, program, year_level, section)
  on public.profiles to authenticated;

-- 2. Email preference is opt-in. No email is sent unless a student enables it.
create table if not exists public.queue_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default false,
  device_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.queue_notification_preferences enable row level security;
revoke all on public.queue_notification_preferences from public, anon;
grant select, insert, update, delete on public.queue_notification_preferences to authenticated;
drop policy if exists queue_notification_preferences_owner_all on public.queue_notification_preferences;
create policy queue_notification_preferences_owner_all
  on public.queue_notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists queue_notification_preferences_set_updated_at on public.queue_notification_preferences;
create trigger queue_notification_preferences_set_updated_at
  before update on public.queue_notification_preferences
  for each row execute function public.set_updated_at();

-- 3. Browser push endpoints are private to each student. Service-role Edge Function
--    reads them to deliver notifications; students can only manage their own rows.
alter table public.queue_notification_preferences
  add column if not exists device_enabled boolean not null default false;

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

create index if not exists idx_queue_push_subscriptions_user_active
  on public.queue_push_subscriptions(user_id, is_active);

alter table public.queue_push_subscriptions enable row level security;
revoke all on public.queue_push_subscriptions from public, anon;
grant select, insert, update, delete on public.queue_push_subscriptions to authenticated;
drop policy if exists queue_push_subscriptions_owner_all on public.queue_push_subscriptions;
create policy queue_push_subscriptions_owner_all
  on public.queue_push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists queue_push_subscriptions_set_updated_at on public.queue_push_subscriptions;
create trigger queue_push_subscriptions_set_updated_at
  before update on public.queue_push_subscriptions
  for each row execute function public.set_updated_at();

commit;

-- Refresh the PostgREST schema cache so admin_call_queue_ticket(p_ticket_id uuid)
-- becomes available to supabase.rpc() without waiting for a periodic reload.
notify pgrst, 'reload schema';

-- Verify the RPC signature and both notification tables exist.
do $gnc_verify_notification_upgrade$
begin
  if to_regprocedure('public.admin_call_queue_ticket(uuid)') is null then
    raise exception 'admin_call_queue_ticket(uuid) was not created.';
  end if;
  if to_regclass('public.queue_notification_preferences') is null then
    raise exception 'queue_notification_preferences was not created.';
  end if;
  if to_regclass('public.queue_push_subscriptions') is null then
    raise exception 'queue_push_subscriptions was not created.';
  end if;
end;
$gnc_verify_notification_upgrade$;
