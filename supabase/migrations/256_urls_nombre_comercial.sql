begin;
-- Commercial profiles use their business name. Keep historical full and short
-- links; aliases cannot write professionals or bypass their public RLS.
create table public.professional_slug_aliases (
  slug text not null,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  primary key (slug, professional_id)
);
alter table public.professional_slug_aliases enable row level security;
revoke all on public.professional_slug_aliases from public, anon, authenticated;
grant select on public.professional_slug_aliases to anon, authenticated;
create policy "Visible professional aliases" on public.professional_slug_aliases
  for select to anon, authenticated using (
    exists (select 1 from public.professionals p
      where p.id = professional_id and not coalesce(p.is_banned, false))
  );

-- Capture before backfill, including ambiguous short names. The reader must
-- resolve a short alias only when exactly one visible professional owns it.
insert into public.professional_slug_aliases(slug, professional_id)
select slug, id from public.professionals where slug is not null
union
select regexp_replace(slug, '-[a-z0-9]{8}$', ''), id
from public.professionals where slug is not null
on conflict do nothing;

create function public.assign_business_profile_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_base text;
  v_candidate text;
  v_identity text := replace(new.id::text, '-', '');
begin
  if tg_op = 'UPDATE' then
    if new.business_name is not distinct from old.business_name
      and new.slug is not distinct from old.slug then return new; end if;
  end if;
  if nullif(btrim(new.business_name), '') is not null then
    v_base := lower(translate(btrim(new.business_name),
      'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
    v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
    if v_base = '' then v_base := 'negocio'; end if;
    -- Ten hex characters are stable, distinguish equal trade names, avoid
    -- reserved root routes, and are not stripped as the legacy 8-char suffix.
    v_candidate := left(v_base, 60) || '-' || left(v_identity, 10);
    if exists (select 1 from public.professionals where slug = v_candidate and id <> new.id)
      or exists (select 1 from public.professional_slug_aliases
        where slug = v_candidate and professional_id <> new.id) then
      v_candidate := left(v_base, 40) || '-' || v_identity;
    end if;
    new.slug := v_candidate;
  end if;
  if exists (select 1 from public.professional_slug_aliases
      where slug = new.slug and professional_id <> new.id) then
    raise unique_violation using message = 'Profile URL belongs to another professional';
  end if;
  return new;
end;
$$;
revoke all on function public.assign_business_profile_slug() from public, anon, authenticated;

create function public.remember_professional_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    insert into public.professional_slug_aliases(slug, professional_id)
      values (old.slug, new.id),
        (regexp_replace(old.slug, '-[a-z0-9]{8}$', ''), new.id)
      on conflict do nothing;
  end if;
  insert into public.professional_slug_aliases(slug, professional_id)
    values (new.slug, new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.remember_professional_slug() from public, anon, authenticated;
create trigger assign_business_profile_slug before insert or update of business_name, slug
  on public.professionals for each row execute function public.assign_business_profile_slug();
create trigger remember_professional_slug after insert or update of business_name, slug
  on public.professionals for each row execute function public.remember_professional_slug();

-- Force the assignment once for existing businesses, without changing names,
-- ownership, verification or any other profile field.
update public.professionals set slug = slug || '-business-url'
where nullif(btrim(business_name), '') is not null;

notify pgrst, 'reload schema';
commit;
