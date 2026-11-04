-- Review only: deploy with matching server enforcement after backup.
begin;
alter table public.staff_profiles add column as_permissions text[] not null default '{}'
  constraint staff_as_permissions_valid check (
    as_permissions <@ array['create','production','painting','delivery']::text[]
    and array_position(as_permissions,null) is null
  );

create or replace function private.staff_security_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'staff id is immutable'; end if;
  if row(new.auth_user_id,new.active,new.role,new.allowed_steps,new.as_review,new.as_approve,new.as_permissions)
     is distinct from row(old.auth_user_id,old.active,old.role,old.allowed_steps,old.as_review,old.as_approve,old.as_permissions) then
    new.session_version := old.session_version + 1;
  elsif new.session_version < old.session_version then
    raise exception 'session version cannot decrease';
  end if;
  return new;
end;
$$;

create or replace function public.server_staff_create(input_actor uuid,input_auth uuid,input_email text,input_profile jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare staff uuid;
begin
  perform pg_advisory_xact_lock(710260003);
  if input_actor is null then
    if exists(select 1 from public.staff_profiles) or input_profile->>'role' is distinct from 'sysadmin'
      or coalesce((input_profile->>'active')::boolean,true) = false then
      raise exception using errcode='42501',message='forbidden';
    end if;
  elsif not exists(select 1 from public.staff_profiles where id=input_actor and active and role='sysadmin') then
    raise exception using errcode='42501',message='forbidden';
  end if;
  if input_profile ? 'asPermissions' and jsonb_typeof(input_profile->'asPermissions') is distinct from 'array' then
    raise exception using errcode='23514',message='invalid_as_permissions';
  end if;
  insert into public.staff_profiles(auth_user_id,login_id,name,role,active,allowed_steps,as_permissions,as_review,as_approve,department,position,icon)
  values(input_auth,input_profile->>'id',input_profile->>'name',coalesce(input_profile->>'role','worker'),coalesce((input_profile->>'active')::boolean,true),
    array(select jsonb_array_elements_text(coalesce(input_profile->'allowedSteps','[]'))),
    array(select jsonb_array_elements_text(coalesce(input_profile->'asPermissions','[]'))),
    coalesce((input_profile->>'asReview')::boolean,false),coalesce((input_profile->>'asApprove')::boolean,false),
    coalesce(input_profile->>'department',''),coalesce(input_profile->>'position',''),coalesce(input_profile->>'icon',''))
  returning id into staff;
  insert into private.staff_login_identifiers values(staff,input_email);
  insert into private.staff_admin_audit(actor_id,staff_id,action) values(input_actor,staff,'create');
  return staff;
end;
$$;

create or replace function public.server_staff_change(input_actor uuid,input_staff uuid,input_changes jsonb,input_reset boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.staff_profiles; op uuid; resume boolean;
begin
  perform pg_advisory_xact_lock(710260003);
  if not exists(select 1 from public.staff_profiles where id=input_actor and active and role='sysadmin') then
    raise exception using errcode='42501',message='forbidden';
  end if;
  if input_changes ? 'asPermissions' and jsonb_typeof(input_changes->'asPermissions') is distinct from 'array' then
    raise exception using errcode='23514',message='invalid_as_permissions';
  end if;
  select * into p from public.staff_profiles where id=input_staff for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  if p.admin_operation_id is not null then raise exception using errcode='23514',message='operation_pending'; end if;
  resume:=coalesce((input_changes->>'active')::boolean,p.active);
  if input_reset then op:=gen_random_uuid(); end if;
  update public.staff_profiles set
    name=coalesce(input_changes->>'name',name),role=coalesce(input_changes->>'role',role),
    department=coalesce(input_changes->>'department',department),position=coalesce(input_changes->>'position',position),
    icon=coalesce(input_changes->>'icon',icon),
    allowed_steps=case when input_changes ? 'allowedSteps' then array(select jsonb_array_elements_text(input_changes->'allowedSteps')) else allowed_steps end,
    as_permissions=case when input_changes ? 'asPermissions' then array(select jsonb_array_elements_text(input_changes->'asPermissions')) else as_permissions end,
    as_review=coalesce((input_changes->>'asReview')::boolean,as_review),
    as_approve=coalesce((input_changes->>'asApprove')::boolean,as_approve),
    active=case when input_reset then false else resume end,
    session_version=session_version+1,admin_operation_id=op
  where id=input_staff;
  delete from public.app_sessions where staff_id=input_staff;
  insert into private.staff_admin_audit(id,actor_id,staff_id,action,outcome,resume_active)
    values(coalesce(op,gen_random_uuid()),input_actor,input_staff,case when input_reset then 'password_reset' else 'update' end,
    case when input_reset then 'pending' else 'complete' end,resume);
  return jsonb_build_object('operation',op,'authId',p.auth_user_id);
end;
$$;


-- CREATE OR REPLACE preserves ACLs; explicitly retain the service-only boundary.
revoke all on function public.server_staff_create(uuid,uuid,text,jsonb),public.server_staff_change(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.server_staff_create(uuid,uuid,text,jsonb),public.server_staff_change(uuid,uuid,jsonb,boolean) to service_role;

-- This future metadata schema has no workflow stage. Only the server AS store
-- can enforce the current-stage permission and transaction/replay checks.
revoke insert,update,delete on public.as_records,public.as_attachments from anon,authenticated;
drop policy as_file_insert on storage.objects;
drop policy as_file_delete on storage.objects;
-- Restrictive policies also prevent a different permissive bucket policy bypass.
create policy as_file_no_direct_insert on storage.objects as restrictive for insert to anon,authenticated
  with check (bucket_id <> 'as-attachments');
create policy as_file_no_direct_update on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id <> 'as-attachments') with check (bucket_id <> 'as-attachments');
create policy as_file_no_direct_delete on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id <> 'as-attachments');
create or replace function private.staff_can_manage_as(parent_id uuid)
returns boolean language sql stable security definer set search_path='' as $$ select false; $$;
-- Active-user metadata and linked attachment SELECT policies remain unchanged.
commit;
