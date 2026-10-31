-- AS is shared work for active staff. Retain legacy permission columns for rollback.
begin;
create or replace function private.staff_can_manage_as(parent_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_profiles
    where auth_user_id = (select auth.uid()) and active
  ) and exists (
    select 1 from public.as_records where id = parent_id
  );
$$;
revoke all on function private.staff_can_manage_as(uuid) from public, anon;
grant execute on function private.staff_can_manage_as(uuid) to authenticated;
commit;
