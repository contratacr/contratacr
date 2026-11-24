-- ContrataCR Pro, leads area (2026-11-24): tasks, files, plans (takeoff uploads) and estimate uploads of a lead.
-- A lead is either a manual opportunity (pro_lead_center_records kind 'manual') or a ContrataCR appointment request
-- (pro_appointment_requests); both are anchored with real foreign keys, so deleting the lead removes these rows.
-- Files live in the private bucket pro-lead-files and are only served by the reauthorized API route.
begin;

create table if not exists public.pro_lead_tasks(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 kind text not null check(kind in('manual','request')),
 manual_kind text not null default 'manual' check(manual_kind='manual'),
 lead_id uuid not null,
 manual_id uuid,
 request_id uuid,
 title text not null check(length(btrim(title)) between 1 and 160),
 due_date date check(due_date is null or due_date between date '1900-01-01' and date '2100-12-31'),
 done boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,manual_kind,manual_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade,
 check(case when kind='manual' then manual_id=lead_id and request_id is null else request_id=lead_id and manual_id is null end));
create index if not exists pro_lead_tasks_by_lead on public.pro_lead_tasks(owner_id,lead_id,created_at,id);

create table if not exists public.pro_lead_files(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 kind text not null check(kind in('manual','request')),
 manual_kind text not null default 'manual' check(manual_kind='manual'),
 lead_id uuid not null,
 manual_id uuid,
 request_id uuid,
 purpose text not null check(purpose in('file','plan','estimate')),
 name text not null check(length(btrim(name)) between 1 and 160),
 mime_type text not null check(length(mime_type) between 3 and 100),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=20971520),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 object_path text not null check(length(object_path) between 10 and 200),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,manual_kind,manual_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade,
 check(case when kind='manual' then manual_id=lead_id and request_id is null else request_id=lead_id and manual_id is null end));
create index if not exists pro_lead_files_by_lead on public.pro_lead_files(owner_id,lead_id,created_at desc,id desc);

alter table public.pro_lead_tasks enable row level security;
alter table public.pro_lead_files enable row level security;
revoke all on public.pro_lead_tasks from public,anon,authenticated;
revoke all on public.pro_lead_files from public,anon,authenticated;
grant select,insert,update,delete on public.pro_lead_tasks to service_role;
grant select,insert,update,delete on public.pro_lead_files to service_role;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit) values('pro-lead-files','pro-lead-files',false,20971520)
   on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-lead-files' and not public) then raise exception 'Lead files bucket configuration';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
