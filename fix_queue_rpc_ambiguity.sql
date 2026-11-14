-- GNC queue RPC ambiguity repair (complete script)
-- Run this WHOLE file in Supabase SQL Editor. Do not paste a partial function body.
-- Existing queue rows and student accounts are not deleted.

-- 1) Recreate ticket issuance with result-prefixed output names. This avoids
-- collisions between PL/pgSQL OUT variables and queue table column names.
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

-- 2) Safe public queue summary. SQL language avoids PL/pgSQL OUT-variable collisions.
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

-- 3) Restore intended RPC permissions and refresh Supabase/PostgREST schema cache.
revoke all on function public.take_queue_number(uuid, uuid, text) from public;
grant execute on function public.take_queue_number(uuid, uuid, text) to authenticated;
revoke all on function public.get_public_queue_status() from public;
grant execute on function public.get_public_queue_status() to anon, authenticated;
notify pgrst, 'reload schema';
