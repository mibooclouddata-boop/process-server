begin;
alter table public.staff_profiles add column admin_operation_id uuid;
create table private.staff_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.staff_profiles(id),
  staff_id uuid not null references public.staff_profiles(id),
  action text not null,
  outcome text not null default 'complete' check(outcome in ('pending','complete','failed')),
  resume_active boolean,
  created_at timestamptz not null default now()
);
create index staff_admin_audit_actor_idx on private.staff_admin_audit(actor_id);
create index staff_admin_audit_staff_idx on private.staff_admin_audit(staff_id);
alter table private.staff_admin_audit enable row level security;
revoke all on private.staff_admin_audit from public, anon, authenticated;

create function private.protect_last_staff_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(710260003);
  if old.role='sysadmin' and old.active and (not new.active or new.role <> 'sysadmin')
    and not exists(select 1 from public.staff_profiles where role='sysadmin' and active and id<>old.id) then
    raise exception using errcode='23514', message='last_admin';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_last_staff_admin() from public, anon, authenticated;
create trigger protect_last_staff_admin before update on public.staff_profiles
for each row execute function private.protect_last_staff_admin();

create function public.server_staff_create(input_actor uuid,input_auth uuid,input_email text,input_profile jsonb)
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
  insert into public.staff_profiles(auth_user_id,login_id,name,role,active,allowed_steps,as_review,as_approve,department,position,icon)
  values(input_auth,input_profile->>'id',input_profile->>'name',coalesce(input_profile->>'role','worker'),coalesce((input_profile->>'active')::boolean,true),
    array(select jsonb_array_elements_text(coalesce(input_profile->'allowedSteps','[]'))),
    coalesce((input_profile->>'asReview')::boolean,false),coalesce((input_profile->>'asApprove')::boolean,false),
    coalesce(input_profile->>'department',''),coalesce(input_profile->>'position',''),coalesce(input_profile->>'icon',''))
  returning id into staff;
  insert into private.staff_login_identifiers values(staff,input_email);
  insert into private.staff_admin_audit(actor_id,staff_id,action) values(input_actor,staff,'create');
  return staff;
end;
$$;

create function public.server_staff_change(input_actor uuid,input_staff uuid,input_changes jsonb,input_reset boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.staff_profiles; op uuid; resume boolean;
begin
  perform pg_advisory_xact_lock(710260003);
  if not exists(select 1 from public.staff_profiles where id=input_actor and active and role='sysadmin') then
    raise exception using errcode='42501',message='forbidden';
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

create function public.server_staff_finish_reset(input_operation uuid,input_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare op private.staff_admin_audit;
begin
  perform pg_advisory_xact_lock(710260003);
  select * into op from private.staff_admin_audit where id=input_operation and outcome='pending' for update;
  if not found then raise exception using errcode='23514',message='operation_missing'; end if;
  update public.staff_profiles set active=case when input_success then op.resume_active else false end,
    admin_operation_id=null,session_version=session_version+1
    where id=op.staff_id and admin_operation_id=input_operation;
  if not found then raise exception using errcode='23514',message='operation_mismatch'; end if;
  update private.staff_admin_audit set outcome=case when input_success then 'complete' else 'failed' end where id=input_operation;
end;
$$;
revoke all on function public.server_staff_create(uuid,uuid,text,jsonb),public.server_staff_change(uuid,uuid,jsonb,boolean),public.server_staff_finish_reset(uuid,boolean) from public,anon,authenticated;
grant execute on function public.server_staff_create(uuid,uuid,text,jsonb),public.server_staff_change(uuid,uuid,jsonb,boolean),public.server_staff_finish_reset(uuid,boolean) to service_role;
commit;
