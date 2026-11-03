-- A catalog decision never publishes services on a professional profile.
alter table public.category_suggestions add column if not exists resolved_category_id text references public.categories(id);
create table public.service_suggestion_requests (
  suggestion_id text not null references public.category_suggestions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, profile_id)
);
alter table public.service_suggestion_requests enable row level security;
revoke all on public.service_suggestion_requests from anon, authenticated;
grant all on public.service_suggestion_requests to service_role;
create index service_suggestion_requests_profile on public.service_suggestion_requests(profile_id);
insert into public.service_suggestion_requests(suggestion_id, profile_id)
select s.id, s.suggested_by from public.category_suggestions s
join public.profiles p on p.id = s.suggested_by
on conflict do nothing;
