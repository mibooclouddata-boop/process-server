-- Review/test only. Deploy with the login RPC runtime; older direct-insert logins fail closed.
begin;
create function public.server_create_staff_session(
  input_staff uuid, input_auth uuid, input_version integer, input_role text,
  input_token_hash text, input_access_token text, input_expires timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.staff_profiles;
begin
  -- Reset/change RPCs lock this same row before changing the epoch and deleting sessions.
  select * into p from public.staff_profiles where id = input_staff for update;
  if not found or p.active is not true or p.admin_operation_id is not null
    or p.role not in ('sysadmin','admin','worker') or p.role is distinct from input_role
    or p.auth_user_id is distinct from input_auth or p.session_version is distinct from input_version
    or input_expires is null or input_expires <= clock_timestamp() then
    return false;
  end if;
  insert into public.app_sessions(token_hash,staff_id,session_version,encrypted_access_token,expires_at)
    values(input_token_hash,p.id,p.session_version,input_access_token,input_expires);
  return true;
end;
$$;
revoke all on function public.server_create_staff_session(uuid,uuid,integer,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.server_create_staff_session(uuid,uuid,integer,text,text,text,timestamptz) to service_role;
revoke insert on public.app_sessions from service_role;
commit;
