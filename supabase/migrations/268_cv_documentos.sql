-- CVs and cover letters written in the panel, saved to the owner's account
-- (19-nov-2026). Before, they lived only in the browser of one device.
-- Owner-only: they carry the person's own email and phone. Nothing here is
-- public; the public CV keeps going through professional_cv_files.
-- Deleting the account deletes auth.users (166_complete_scoped_account_deletion),
-- which cascades to these rows.
create table if not exists public.cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('cv','carta')),
  titulo text not null default '' check (length(titulo) <= 120),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 300000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cv_documents_user_idx on public.cv_documents(user_id, updated_at desc);

alter table public.cv_documents enable row level security;
revoke all on public.cv_documents from public, anon, authenticated;
grant select, insert, update, delete on public.cv_documents to authenticated;
grant all on public.cv_documents to service_role;

drop policy if exists "Own CV documents: read" on public.cv_documents;
create policy "Own CV documents: read" on public.cv_documents for select to authenticated using (user_id = auth.uid());
drop policy if exists "Own CV documents: insert" on public.cv_documents;
create policy "Own CV documents: insert" on public.cv_documents for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Own CV documents: update" on public.cv_documents;
create policy "Own CV documents: update" on public.cv_documents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Own CV documents: delete" on public.cv_documents;
create policy "Own CV documents: delete" on public.cv_documents for delete to authenticated using (user_id = auth.uid());

-- updated_at on every change; the owner and creation date never move.
create or replace function public.cv_documents_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists cv_documents_touch on public.cv_documents;
create trigger cv_documents_touch before update on public.cv_documents
for each row execute function public.cv_documents_touch();

-- Ten resumes and ten letters per account, the same limit as the panel.
create or replace function public.cv_documents_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('cv_documents:' || new.user_id::text));
  -- An upsert of a document that already exists is an update, not a new one.
  if exists (select 1 from public.cv_documents where id = new.id) then return new; end if;
  if (select count(*) from public.cv_documents where user_id = new.user_id) >= 20 then
    raise exception 'cv_documents_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.cv_documents_limit() from public, anon, authenticated;
drop trigger if exists cv_documents_limit on public.cv_documents;
create trigger cv_documents_limit before insert on public.cv_documents
for each row execute function public.cv_documents_limit();

comment on table public.cv_documents is 'Owner-only CV and cover letter drafts written in the panel. Never public; contains the owner''s own contact details.';
notify pgrst, 'reload schema';
