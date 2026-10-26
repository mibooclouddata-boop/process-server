-- REVIEW/TEST ONLY: do not apply to an existing production project without a backup.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  login_id text not null unique check (length(login_id) between 1 and 100 and login_id = btrim(login_id)),
  name text not null check (length(name) between 1 and 100),
  role text not null default 'worker' check (role in ('sysadmin','admin','worker')),
  active boolean not null default false,
  session_version integer not null default 1 check (session_version > 0),
  allowed_steps text[] not null default '{}' check (allowed_steps <@ array['incoming','inspect_wait','inspect_done','paint_wait','paint_done','deliver_wait','deliver_done']::text[]),
  as_review boolean not null default false,
  as_approve boolean not null default false,
  department text not null default '',
  position text not null default '',
  icon text not null default '',
  created_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;
revoke all on public.staff_profiles from public, anon, authenticated;
grant select on public.staff_profiles to authenticated;
grant select, insert, update on public.staff_profiles to service_role;
create policy staff_own_profile on public.staff_profiles for select to authenticated
  using (auth_user_id = (select auth.uid()) and active);

create function private.staff_security_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'staff id is immutable'; end if;
  if row(new.auth_user_id,new.active,new.role,new.allowed_steps,new.as_review,new.as_approve)
     is distinct from row(old.auth_user_id,old.active,old.role,old.allowed_steps,old.as_review,old.as_approve) then
    new.session_version := old.session_version + 1;
  elsif new.session_version < old.session_version then
    raise exception 'session version cannot decrease';
  end if;
  return new;
end;
$$;
revoke all on function private.staff_security_version() from public, anon, authenticated;
create trigger staff_security_version before update on public.staff_profiles
for each row execute function private.staff_security_version();

create table private.staff_login_identifiers (
  staff_id uuid primary key references public.staff_profiles(id) on delete restrict,
  internal_email text not null unique check (internal_email ~ '^[0-9a-f-]{36}@staff[.]invalid$')
);
alter table private.staff_login_identifiers enable row level security;
revoke all on private.staff_login_identifiers from public, anon, authenticated;
-- No direct Data API access to this schema. Only the service-only RPC can resolve a login.
create function public.server_resolve_staff_login(input_login text)
returns table(staff_id uuid, auth_user_id uuid, internal_email text)
language sql security definer set search_path = '' as $$
  select p.id, p.auth_user_id, m.internal_email
  from public.staff_profiles p join private.staff_login_identifiers m on m.staff_id = p.id
  where p.login_id = input_login;
$$;
revoke all on function public.server_resolve_staff_login(text) from public, anon, authenticated;
grant execute on function public.server_resolve_staff_login(text) to service_role;

create table public.app_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  session_version integer not null,
  encrypted_access_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_sessions_staff_idx on public.app_sessions(staff_id);
create index app_sessions_expiry_idx on public.app_sessions(expires_at);
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from public, anon, authenticated;
grant select, insert, delete on public.app_sessions to service_role;

create table private.login_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  count integer not null,
  expires_at timestamptz not null
);
create index login_rate_limits_expiry_idx on private.login_rate_limits(expires_at);
alter table private.login_rate_limits enable row level security;
revoke all on private.login_rate_limits from public, anon, authenticated;
create function public.server_take_login_attempt(input_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempts integer;
begin
  insert into private.login_rate_limits as limits (key_hash, count, expires_at)
  values (input_key, 1, now() + interval '15 minutes')
  on conflict (key_hash) do update set
    count = case when limits.expires_at <= now() then 1 else least(limits.count + 1, 21) end,
    expires_at = case when limits.expires_at <= now() then now() + interval '15 minutes' else limits.expires_at end
  returning count into attempts;
  return attempts <= 20;
end;
$$;
revoke all on function public.server_take_login_attempt(text) from public, anon, authenticated;
grant execute on function public.server_take_login_attempt(text) to service_role;
-- Arrange a bounded maintenance job for expired sessions/rate limits before deployment.
commit;
