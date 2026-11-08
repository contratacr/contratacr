-- Private objects. Public access always goes through a visibility-checking handler.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('professional-cvs','professional-cvs',false,5242880,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.professional_cv_files (
 professional_id uuid primary key references public.professionals(id) on delete cascade,
 path text not null unique check(length(path)<300),
 mime text not null check(mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size integer not null check(size>0 and size<=5242880),
 visible boolean not null default false,
 version uuid not null default gen_random_uuid()
);
alter table public.professional_cv_files enable row level security;
revoke all on public.professional_cv_files from public,anon,authenticated;
grant select(professional_id,visible) on public.professional_cv_files to anon,authenticated;
grant all on public.professional_cv_files to service_role;
drop policy if exists "Public CV availability only" on public.professional_cv_files;
create policy "Public CV availability only" on public.professional_cv_files for select to anon,authenticated using(visible);
-- Restrictive guard also defeats unrelated permissive storage policies.
drop policy if exists "CV objects require server access" on storage.objects;
create policy "CV objects require server access" on storage.objects as restrictive
for all to anon,authenticated using(bucket_id <> 'professional-cvs')
with check(bucket_id <> 'professional-cvs');
-- Object paths include the exact owner UUID; existing account deletion cleanup
-- (166_complete_scoped_account_deletion.sql) collects them before deleting accounts.
notify pgrst,'reload schema';
