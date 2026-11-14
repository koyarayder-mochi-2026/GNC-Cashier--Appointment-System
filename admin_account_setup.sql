-- Run only AFTER creating the admin user in Supabase Dashboard > Authentication > Users.
-- Use a real school-controlled email and set the password privately in Supabase Auth.
-- Replace the email below before running this script. Do NOT put a password in SQL.

update public.profiles as profile_row
set role = 'admin',
    username = 'GNCICashier2026'
where lower(profile_row.email) = lower('REPLACE_WITH_REAL_ADMIN_EMAIL');

do $verify_admin_account$
begin
  if not exists (
    select 1
    from public.profiles as profile_row
    where profile_row.role = 'admin'
      and profile_row.username = 'GNCICashier2026'
  ) then
    raise exception 'Admin profile was not found. Replace the email placeholder with the exact Supabase Auth email, then run this script again.';
  end if;
end;
$verify_admin_account$;

notify pgrst, 'reload schema';
