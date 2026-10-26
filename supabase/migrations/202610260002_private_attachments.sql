-- Minimal future AS identity/attachment metadata. No JSON import or file upload here.
begin;
create table public.as_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  created_by_id uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index as_records_creator_idx on public.as_records(created_by_id);
create table public.as_attachments (
  id uuid primary key default gen_random_uuid(),
  as_id uuid not null references public.as_records(id) on delete restrict,
  uploaded_by_id uuid not null references public.staff_profiles(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  size_bytes bigint not null check (size_bytes between 0 and 20971520),
  created_at timestamptz not null default now(),
  check (storage_path = as_id::text || '/' || id::text)
);
create index as_attachments_parent_idx on public.as_attachments(as_id);
create index as_attachments_uploader_idx on public.as_attachments(uploaded_by_id);
alter table public.as_records enable row level security;
alter table public.as_attachments enable row level security;
revoke all on public.as_records, public.as_attachments from public, anon, authenticated;
grant select on public.as_records, public.as_attachments to authenticated;
grant select, insert, update, delete on public.as_records, public.as_attachments to service_role;

-- Non-exposed helpers. Every lookup binds to auth.uid(), never a caller-supplied actor.
create function private.staff_is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles where auth_user_id = (select auth.uid()) and active);
$$;
create function private.staff_can_manage_as(parent_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles p join public.as_records a on a.id = parent_id
    where p.auth_user_id = (select auth.uid()) and p.active
      and (p.role = 'sysadmin' or p.as_review or p.as_approve or a.created_by_id = p.id));
$$;
revoke all on function private.staff_is_active(), private.staff_can_manage_as(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.staff_is_active(), private.staff_can_manage_as(uuid) to authenticated;
create policy as_active_read on public.as_records for select to authenticated using ((select private.staff_is_active()));
create policy attachments_active_read on public.as_attachments for select to authenticated using ((select private.staff_is_active()));

-- New bucket only: deliberately fail rather than silently reuse an existing public bucket.
insert into storage.buckets(id,name,public,file_size_limit)
values ('as-attachments','as-attachments',false,20971520);
create policy as_file_read on storage.objects for select to authenticated using (
  bucket_id = 'as-attachments' and (select private.staff_is_active())
  and exists (select 1 from public.as_attachments a where a.storage_path = name)
);
create policy as_file_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'as-attachments'
  and exists (select 1 from public.as_attachments a where a.storage_path = name and private.staff_can_manage_as(a.as_id))
);
create policy as_file_delete on storage.objects for delete to authenticated using (
  bucket_id = 'as-attachments'
  and exists (select 1 from public.as_attachments a where a.storage_path = name and private.staff_can_manage_as(a.as_id))
);
-- No UPDATE policy: overwrites are intentionally forbidden. Use a new file UUID.
commit;
