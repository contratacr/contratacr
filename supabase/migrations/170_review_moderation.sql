-- Reversible review moderation. Reviews remain public by default; admins can
-- hide and restore them without destroying evidence or audit context.
alter table public.reviews
  add column if not exists moderation_status text not null default 'published',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.reviews
  drop constraint if exists reviews_moderation_status_check;

alter table public.reviews
  add constraint reviews_moderation_status_check
  check (moderation_status in ('published', 'hidden'));

create index if not exists reviews_moderation_status_created_idx
  on public.reviews (moderation_status, created_at desc);

create or replace function public.protect_review_moderation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' and (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at is distinct from old.moderated_at
    or new.moderated_by is distinct from old.moderated_by
  ) then
    raise exception 'Review moderation fields are managed by administrators.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_review_moderation_fields on public.reviews;
create trigger protect_review_moderation_fields
  before update on public.reviews
  for each row execute function public.protect_review_moderation_fields();

drop policy if exists "Reviews are publicly viewable" on public.reviews;
drop policy if exists "Published reviews are publicly viewable" on public.reviews;

create policy "Published reviews are publicly viewable" on public.reviews
  for select using (moderation_status = 'published' or auth.uid() = client_id);

create or replace function public.update_professional_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_professional_id uuid := coalesce(new.professional_id, old.professional_id);
begin
  update public.professionals
  set
    rating_avg = coalesce((
      select round(avg(r.rating)::numeric, 2)
      from public.reviews r
      where r.professional_id = target_professional_id
        and r.moderation_status = 'published'
    ), 0),
    review_count = (
      select count(*)
      from public.reviews r
      where r.professional_id = target_professional_id
        and r.moderation_status = 'published'
    )
  where id = target_professional_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Recalculate current aggregates once so previously hidden rows (if this
-- migration is replayed after a restore) cannot leave stale counters.
update public.professionals p
set
  rating_avg = coalesce(stats.rating_avg, 0),
  review_count = coalesce(stats.review_count, 0)
from (
  select
    p2.id as professional_id,
    round((avg(r.rating) filter (where r.moderation_status = 'published'))::numeric, 2) as rating_avg,
    count(r.id) filter (where r.moderation_status = 'published')::int as review_count
  from public.professionals p2
  left join public.reviews r on r.professional_id = p2.id
  group by p2.id
) stats
where stats.professional_id = p.id;

notify pgrst, 'reload schema';
