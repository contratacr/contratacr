-- 548 (2026-11-27, owner: «¿Sabe si este lugar…?», Google Maps model; research ~/dl/research/contribuciones-fotos.md):
-- customers answer short questions about a place (Sí / No / No sé); an attribute becomes «confirmado por la comunidad»
-- after at least 3 matching yes/no answers with at least 75 % agreement ("No sé" does not count). The value the business
-- or staff stored in dir_places.attributes always wins: a key the place already has is never asked nor overridden.
-- * dir_attr_question_keys(vertical): the keys asked per section (mirrored in src/lib/directory/place-questions.ts).
-- * dir_place_attribute_answers: one answer per person per place and key (changing it updates the row). RLS on,
--   service_role only, like every directory table.
-- * dir_place_attribute_answer(actor, {slug,key,answer}): signed-in people, not the place's managers; 60 answers a day.
-- * dir_place_attribute_state(slug, actor): {confirmed:{key:bool}, answered:[keys of actor]} for the page.
-- Community values are NOT written into dir_places.attributes and do not feed dir_search filters (that would need a
-- per-place aggregate column in the search path; left for later).
begin;

create table if not exists public.dir_place_attribute_answers(
 place_id uuid not null references public.dir_places(id),
 key text not null check(key ~ '^[a-zA-Z]{2,40}$'),
 user_id uuid not null,
 answer text not null check(answer in('yes','no','unsure')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(place_id,key,user_id)
);
create index if not exists dir_place_attribute_answers_user on public.dir_place_attribute_answers(user_id,updated_at);
alter table public.dir_place_attribute_answers enable row level security;
revoke all on public.dir_place_attribute_answers from public,anon,authenticated;
grant select,insert,update on public.dir_place_attribute_answers to service_role;

create or replace function public.dir_attr_question_keys(p_vertical text) returns text[]
language sql immutable parallel safe set search_path=public,pg_temp as $$
 select case
  when p_vertical in('restaurant','cafe_bar') then array['reservations','delivery','takeaway','sinpe','parking','wifi','terrace','vegetarianOptions','petFriendly','accessible']
  when p_vertical='lodging' then array['wifi','parking','pool','breakfast','petFriendly','sinpe','accessible']
  when p_vertical='beauty' then array['byAppointment','sinpe','parking','accessible']
  when p_vertical in('convenience','grocery','hardware','pharmacy','vet_pets','food_shop') then array['sinpe','delivery','parking','accessible']
  when p_vertical in('retail','auto_services','car_wash','fitness','tours') then array['sinpe','parking','accessible']
  when p_vertical='fuel' then array['sinpe','accessible']
  when p_vertical in('banking','government','health','education','mall','transport','attraction') then array['parking','accessible']
  else array[]::text[] end $$;

-- Whether the place itself already says something about the key (business/staff/import value wins).
create or replace function public.dir_attr_known(p_attributes jsonb,p_key text) returns boolean
language sql immutable parallel safe set search_path=public,pg_temp as $$
 select coalesce(case when p_key='sinpe' then jsonb_typeof(p_attributes->'paymentMethods')='array'
  else jsonb_typeof(p_attributes->p_key)='boolean' end,false) $$;

create or replace function public.dir_place_attribute_answer(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;k text:=p_input->>'key';a text:=p_input->>'answer';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) x where x not in('slug','key','answer'))
  or coalesce(a,'') not in('yes','no','unsure') then raise exception 'Invalid answer' using errcode='22023';end if;
 select * into p from public.dir_places where slug=p_input->>'slug';
 if not found or public.dir_place_public(p.slug) is null then raise exception 'Place not found' using errcode='P0002';end if;
 if not k=any(public.dir_attr_question_keys(p.vertical_id)) or public.dir_attr_known(p.attributes,k) then
  raise exception 'Not asked here' using errcode='22023',hint='dir_attr_not_asked';end if;
 if exists(select 1 from public.dir_place_managers g where g.place_id=p.id and g.user_id=p_actor and g.status='active') then
  raise exception 'The business edits its own details' using errcode='42501',hint='dir_attr_own_place';end if;
 if (select count(*) from public.dir_place_attribute_answers x where x.user_id=p_actor and x.updated_at>clock_timestamp()-interval '1 day')>=60
  and not exists(select 1 from public.dir_place_attribute_answers x where x.place_id=p.id and x.key=k and x.user_id=p_actor) then
  raise exception 'Too many answers today' using errcode='54000',hint='dir_attr_cap';end if;
 insert into public.dir_place_attribute_answers(place_id,key,user_id,answer) values(p.id,k,p_actor,a)
  on conflict(place_id,key,user_id) do update set answer=excluded.answer,updated_at=clock_timestamp();
 return jsonb_build_object('ok',true,'state',public.dir_place_attribute_state(p.slug,p_actor));
end $$;

create or replace function public.dir_place_attribute_state(p_slug text,p_actor uuid default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with p as (select * from public.dir_places where slug=p_slug and public.dir_place_public(slug) is not null),
 agg as (select a.key,count(*) filter(where a.answer='yes') y,count(*) filter(where a.answer='no') n
  from public.dir_place_attribute_answers a join p on p.id=a.place_id
  where a.key=any(public.dir_attr_question_keys(p.vertical_id)) and not public.dir_attr_known(p.attributes,a.key) group by a.key)
 select case when not exists(select 1 from p) then null else jsonb_build_object(
  'confirmed',coalesce((select jsonb_object_agg(key,y>n) from agg where y+n>=3 and greatest(y,n)::numeric/(y+n)>=0.75),'{}'::jsonb),
  'answered',coalesce((select jsonb_agg(a.key order by a.key) from public.dir_place_attribute_answers a join p on p.id=a.place_id where p_actor is not null and a.user_id=p_actor),'[]'::jsonb)) end $$;

revoke all on function public.dir_attr_question_keys(text) from public,anon,authenticated;
revoke all on function public.dir_attr_known(jsonb,text) from public,anon,authenticated;
revoke all on function public.dir_place_attribute_answer(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.dir_place_attribute_state(text,uuid) from public,anon,authenticated;
grant execute on function public.dir_attr_question_keys(text) to service_role;
grant execute on function public.dir_attr_known(jsonb,text) to service_role;
grant execute on function public.dir_place_attribute_answer(uuid,jsonb) to service_role;
grant execute on function public.dir_place_attribute_state(text,uuid) to service_role;

commit;
