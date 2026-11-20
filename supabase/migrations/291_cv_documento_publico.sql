-- The public CV can be one of the CVs written in the panel (20-nov-2026).
-- The owner picks at most one; contratacr.com/<perfil>/cv then serves that
-- document's design. Drafts not chosen stay owner-only (RLS from 268).
-- The served PDF never carries the owner's email, phone or drawn signature:
-- the server strips them before drawing (src/lib/cv/cv-publico.ts).
alter table public.cv_documents add column if not exists publico boolean not null default false;
alter table public.cv_documents drop constraint if exists cv_documents_publico_solo_cv;
alter table public.cv_documents add constraint cv_documents_publico_solo_cv check (not publico or tipo = 'cv');
create unique index if not exists cv_documents_un_publico on public.cv_documents(user_id) where publico;

-- Choose (or clear, with null) the public CV. Two steps so the unique index
-- never sees two public rows at once.
create or replace function public.set_public_cv_document(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_id is not null and not exists (select 1 from public.cv_documents where id = p_id and user_id = uid and tipo = 'cv') then
    return false;
  end if;
  update public.cv_documents set publico = false where user_id = uid and publico and id is distinct from p_id;
  if p_id is not null then update public.cv_documents set publico = true where id = p_id and user_id = uid; end if;
  return true;
end $$;
revoke all on function public.set_public_cv_document(uuid) from public, anon;
grant execute on function public.set_public_cv_document(uuid) to authenticated;

-- Whether a professional's profile has a chosen panel CV. Only a boolean is
-- exposed; the document itself is read server-side with the service role.
create or replace function public.has_public_cv_document(p_professional uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cv_documents d
    join public.professionals p on p.profile_id = d.user_id
    where p.id = p_professional and d.publico and d.tipo = 'cv'
  );
$$;
revoke all on function public.has_public_cv_document(uuid) from public;
grant execute on function public.has_public_cv_document(uuid) to anon, authenticated;

comment on column public.cv_documents.publico is 'The one CV the owner chose to serve at contratacr.com/<perfil>/cv. Contact details and signature are stripped when served.';
notify pgrst, 'reload schema';
