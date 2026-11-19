-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): local events published by CLAIMED places.
-- Depends on directory-core-local.sql, directory-claims-local.sql, directory-moderation-local.sql (dir_mod_log,
-- dir_mod_reason_ok) and directory-place-tools-local.sql (dir_tool_authorize, moderation kind 'event').
-- * Owner/team (Pro; a company member needs listing.publish because events are public) creates, edits and cancels
--   events: title 3..120, start (and optional end, same or later, at most 14 days long), optional price TEXT (0..60,
--   e.g. «Entrada ₡5 000» or «Gratis»; never a payment), description 0..1000, no links. Starts from now−1 day to +1 year.
--   CAS by revision, idempotent actionId, every version in the immutable dir_event_history.
-- * Not for banks/ATMs (map points). Limits: 10 new events per place a day, 60 upcoming per place.
-- * Public /eventos: published (not cancelled, not hidden) events of public places, ending today or later, ordered by
--   start time then id — never by payment or popularity; filters: from date, province (admin_area_1), section.
-- * Moderation: every new/edited event enters the staff queue (tab «Eventos»); staff hide/restore with reason and CAS
--   (expectedStatus) -> immutable dir_moderation_log. A hidden event stays hidden after owner edits.
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
begin;

create table if not exists public.dir_events(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 title text not null check(length(btrim(title)) between 3 and 120 and title!~*'(https?://|www\.)'),
 starts_at timestamptz not null,
 ends_at timestamptz,
 price_text text check(length(btrim(price_text)) between 1 and 60 and price_text!~*'(https?://|www\.)'),
 description text check(length(btrim(description)) between 1 and 1000 and description!~*'(https?://|www\.)'),
 status text not null default 'published' check(status in('published','cancelled')),
 moderation_status text not null default 'published' check(moderation_status in('published','hidden')),
 moderation_reason text check(length(moderation_reason) between 3 and 1000),
 moderated_by uuid,moderated_at timestamptz,
 reviewed boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_by uuid not null,member_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(ends_at is null or (ends_at>=starts_at and ends_at<=starts_at+interval '14 days')),
 check(moderation_status='published' or moderation_reason is not null),
 check((moderated_by is null)=(moderated_at is null))
);
create index if not exists dir_events_public on public.dir_events(starts_at,id) where status='published' and moderation_status='published';
create index if not exists dir_events_place on public.dir_events(place_id,starts_at);
create index if not exists dir_events_unreviewed on public.dir_events(updated_at) where not reviewed;
create table if not exists public.dir_event_history(
 id bigint generated always as identity primary key,
 event_id uuid not null references public.dir_events(id),
 revision integer not null,
 action text not null check(action in('create','update','cancel','hide','restore','dismiss')),
 actor_id uuid not null,member_id uuid,action_id uuid not null,
 snapshot jsonb not null,
 at timestamptz not null default clock_timestamp()
);
create index if not exists dir_event_history_event on public.dir_event_history(event_id,id);
do $$declare t text;begin
 drop trigger if exists dir_event_history_immutable on public.dir_event_history;
 create trigger dir_event_history_immutable before update or delete on public.dir_event_history for each row execute function public.dir_immutable();
 foreach t in array array['dir_events','dir_event_history'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
end $$;
create or replace function public.dir_events_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare moderating boolean:=coalesce(current_setting('dir.event_moderation',true),'')='on';
begin
 if tg_op='DELETE' then raise exception 'Events are cancelled or hidden, never deleted' using errcode='23514';end if;
 if tg_op='INSERT' then
  if new.moderation_status<>'published' or new.moderated_by is not null or new.reviewed then raise exception 'Moderation fields are managed by staff' using errcode='42501';end if;
  return new;
 end if;
 if new.id<>old.id or new.place_id<>old.place_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Event identity is immutable' using errcode='23514';end if;
 if not moderating and (new.moderation_status is distinct from old.moderation_status or new.moderation_reason is distinct from old.moderation_reason
  or new.moderated_by is distinct from old.moderated_by or new.moderated_at is distinct from old.moderated_at or (new.reviewed and not old.reviewed)) then
  raise exception 'Moderation fields are managed by staff' using errcode='42501';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
drop trigger if exists dir_events_guard on public.dir_events;
create trigger dir_events_guard before insert or update or delete on public.dir_events for each row execute function public.dir_events_guard();

create or replace function public.dir_event_json(e public.dir_events) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'priceText',e.price_text,'description',e.description,
  'status',e.status,'moderationStatus',e.moderation_status,'moderationReason',e.moderation_reason,'revision',e.revision,'updatedAt',e.updated_at) $$;

-- Input: {actionId, action: create|update|cancel, eventId, placeId (create), revision (update/cancel),
--         event:{title, startsAt, endsAt?, priceText?, description?} (create/update)}.
create or replace function public.dir_event_mutate(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;eid uuid;pid uuid;rev integer;act text:=p_input->>'action';who uuid:=coalesce(p_member,p_actor);prior jsonb;p public.dir_places;e public.dir_events;
 ev jsonb:=p_input->'event';t text;st timestamptz;en timestamptz;pr text;ds text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or act is null or act not in('create','update','cancel')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','action','eventId','placeId','revision','event'))
  or (act='create')<>(p_input ? 'placeId') or (act<>'cancel')<>(jsonb_typeof(ev)='object') or (act<>'create')<>(jsonb_typeof(p_input->'revision')='number') then
  raise exception 'Invalid event' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');eid:=public.dir_try_uuid(p_input->>'eventId');
 if aid is null or eid is null then raise exception 'Invalid event' using errcode='22023';end if;
 if act<>'create' then begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid event' using errcode='22023';end;end if;
 if ev is not null then
  if exists(select 1 from jsonb_object_keys(ev) k where k not in('title','startsAt','endsAt','priceText','description')) then raise exception 'Invalid event' using errcode='22023';end if;
  t:=btrim(regexp_replace(coalesce(ev->>'title',''),'\s+',' ','g'));pr:=nullif(btrim(coalesce(ev->>'priceText','')),'');ds:=nullif(btrim(coalesce(ev->>'description','')),'');
  begin st:=(ev->>'startsAt')::timestamptz;en:=(ev->>'endsAt')::timestamptz;exception when others then raise exception 'Invalid event' using errcode='22023';end;
  if length(t) not between 3 and 120 or st is null or (en is not null and (en<st or en>st+interval '14 days')) or length(coalesce(pr,'x')) not between 1 and 60 or length(coalesce(ds,'x')) not between 1 and 1000
   or concat_ws(' ',t,pr,ds)~*'(https?://|www\.)' then raise exception 'Invalid event' using errcode='22023',hint='dir_event_fields';end if;
  if st<clock_timestamp()-interval '1 day' or st>clock_timestamp()+interval '366 days' then raise exception 'Invalid date' using errcode='22023',hint='dir_event_date';end if;
 end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 if act='create' then pid:=public.dir_try_uuid(p_input->>'placeId');if pid is null then raise exception 'Invalid event' using errcode='22023';end if;
 else select place_id into pid from public.dir_events where id=eid;if pid is null then raise exception 'Event not found' using errcode='P0002';end if;end if;
 p:=public.dir_tool_authorize(p_actor,p_member,pid,'listing.publish');
 if p.vertical_id='banking' then raise exception 'No events in this section' using errcode='22023',hint='dir_event_section_off';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-events:'||pid::text,0));
 if act='create' then
  if exists(select 1 from public.dir_events where id=eid) then raise exception 'Event id reused' using errcode='22023';end if;
  if (select count(*) from public.dir_events where place_id=pid and created_at>clock_timestamp()-interval '1 day')>=10
   or (select count(*) from public.dir_events where place_id=pid and status='published' and coalesce(ends_at,starts_at)>=clock_timestamp())>=60 then
   raise exception 'Too many events' using errcode='54000',hint='dir_event_cap';end if;
  insert into public.dir_events(id,place_id,title,starts_at,ends_at,price_text,description,created_by,member_id) values(eid,pid,t,st,en,pr,ds,p_actor,p_member) returning * into e;
 else
  select * into e from public.dir_events where id=eid for update;
  if e.revision<>rev then raise exception 'Event changed' using errcode='40001';end if;
  if e.status='cancelled' then raise exception 'A cancelled event is final' using errcode='22023',hint='dir_event_cancelled';end if;
  perform set_config('dir.event_moderation','on',true);
  if act='update' then
   update public.dir_events set title=t,starts_at=st,ends_at=en,price_text=pr,description=ds,reviewed=false,revision=revision+1,member_id=p_member where id=eid returning * into e;
  else
   update public.dir_events set status='cancelled',revision=revision+1,member_id=p_member where id=eid returning * into e;
  end if;
  perform set_config('dir.event_moderation','off',true);
 end if;
 insert into public.dir_event_history(event_id,revision,action,actor_id,member_id,action_id,snapshot) values(e.id,e.revision,act,p_actor,p_member,aid,public.dir_event_json(e));
 result:=public.dir_event_json(e)-'moderationReason';
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- Owner list of a place (including cancelled and hidden ones, with the staff reason).
create or replace function public.dir_events_owner_list(p_actor uuid,p_member uuid,p_place uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;
begin
 p:=public.dir_tool_authorize(p_actor,p_member,p_place,'read');
 return jsonb_build_object('placeId',p.id,'slug',p.slug,'name',p.name,'allowed',p.vertical_id<>'banking',
  'items',coalesce((select jsonb_agg(public.dir_event_json(e) order by e.starts_at desc,e.id) from public.dir_events e where e.place_id=p.id),'[]'));
end $$;

-- Public listing. p_from = Costa Rica calendar day (default today); p_province = admin_area_1 (exact); p_vertical.
create or replace function public.dir_events_public(p_from date default null,p_province text default null,p_vertical text default null,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d date:=coalesce(p_from,(clock_timestamp() at time zone 'America/Costa_Rica')::date);lim integer:=least(greatest(coalesce(p_limit,30),1),60);off integer:=least(greatest(coalesce(p_offset,0),0),5000);
begin
 return jsonb_build_object('from',d,
  'total',(select count(*) from public.dir_events e join public.dir_places p on p.id=e.place_id
   where e.status='published' and e.moderation_status='published' and coalesce(e.ends_at,e.starts_at)>=(d::timestamp at time zone 'America/Costa_Rica')
    and p.status='published' and (p_province is null or p.admin_area_1=p_province) and (p_vertical is null or p.vertical_id=p_vertical) and public.dir_place_public(p.slug) is not null),
  'provinces',(select coalesce(jsonb_agg(distinct p.admin_area_1),'[]') from public.dir_events e join public.dir_places p on p.id=e.place_id
   where e.status='published' and e.moderation_status='published' and coalesce(e.ends_at,e.starts_at)>=(d::timestamp at time zone 'America/Costa_Rica') and p.status='published' and p.admin_area_1 is not null),
  'items',coalesce((select jsonb_agg(x.j order by x.starts_at,x.id) from(
   select e.starts_at,e.id,jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'priceText',e.price_text,'description',e.description,
    'place',jsonb_build_object('slug',p.slug,'name',p.name,'vertical',p.vertical_id,'province',p.admin_area_1,'area',concat_ws(', ',p.locality,p.admin_area_1))) j
   from public.dir_events e join public.dir_places p on p.id=e.place_id
   where e.status='published' and e.moderation_status='published' and coalesce(e.ends_at,e.starts_at)>=(d::timestamp at time zone 'America/Costa_Rica')
    and p.status='published' and (p_province is null or p.admin_area_1=p_province) and (p_vertical is null or p.vertical_id=p_vertical) and public.dir_place_public(p.slug) is not null
   order by e.starts_at,e.id limit lim offset off) x),'[]'));
end $$;

-- Upcoming events of one place (place page).
create or replace function public.dir_place_events_public(p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when public.dir_place_public(p_slug) is null then null else coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,
  'priceText',e.price_text,'description',e.description) order by e.starts_at,e.id)
  from public.dir_events e join public.dir_places p on p.id=e.place_id where p.slug=p_slug and e.status='published' and e.moderation_status='published' and coalesce(e.ends_at,e.starts_at)>=clock_timestamp()),'[]') end $$;

-- Staff queue: 'new' = created or edited and not yet reviewed; 'hidden'; 'recent' (30 days).
create or replace function public.dir_admin_event_queue(p_filter text default 'new',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.updated_at desc),'[]') from(
  select e.updated_at,public.dir_event_json(e)||jsonb_build_object('slug',p.slug,'placeName',p.name,'reviewed',e.reviewed) j
  from public.dir_events e join public.dir_places p on p.id=e.place_id
  where case coalesce(p_filter,'new') when 'new' then not e.reviewed and e.moderation_status='published' when 'hidden' then e.moderation_status='hidden' else e.updated_at>clock_timestamp()-interval '30 days' end
  order by e.updated_at desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- Input: {actionId, eventId, decision: approve|hide|restore, reason (required to hide/restore), expectedRevision}.
create or replace function public.dir_admin_event_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;eid uuid;dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');prior jsonb;e public.dir_events;before jsonb;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'expectedRevision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','eventId','decision','reason','expectedRevision')) then raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');eid:=public.dir_try_uuid(p_input->>'eventId');
 if aid is null or eid is null or dec is null or dec not in('approve','hide','restore') or not public.dir_mod_reason_ok(why,dec='approve') then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into e from public.dir_events where id=eid for update;
 if not found then raise exception 'Event not found' using errcode='P0002';end if;
 if e.created_by=p_actor or e.member_id=p_actor then raise exception 'Cannot moderate your own event' using errcode='42501',hint='dir_review_self_moderation';end if;
 if e.revision<>(p_input->>'expectedRevision')::integer then raise exception 'Event changed' using errcode='40001';end if;
 if (dec='hide' and e.moderation_status='hidden') or (dec='restore' and e.moderation_status='published') or (dec='approve' and (e.reviewed or e.moderation_status='hidden')) then
  raise exception 'Nothing to change' using errcode='22023';end if;
 before:=public.dir_event_json(e);
 perform set_config('dir.event_moderation','on',true);
 update public.dir_events set reviewed=true,moderation_status=case dec when 'hide' then 'hidden' when 'restore' then 'published' else moderation_status end,
  moderation_reason=case when dec in('hide','restore') then why else moderation_reason end,moderated_by=p_actor,moderated_at=clock_timestamp() where id=eid returning * into e;
 perform set_config('dir.event_moderation','off',true);
 insert into public.dir_event_history(event_id,revision,action,actor_id,action_id,snapshot) values(e.id,e.revision,case dec when 'approve' then 'dismiss' else dec end,p_actor,aid,public.dir_event_json(e));
 perform public.dir_mod_log(p_actor,aid,'event',eid,e.place_id,dec,why,before,public.dir_event_json(e));
 result:=jsonb_build_object('eventId',eid,'moderationStatus',e.moderation_status,'reviewed',e.reviewed);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare n text;begin foreach n in array array['dir_events','dir_event_history'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_event_history' then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in('dir_events_guard','dir_event_json','dir_event_mutate','dir_events_owner_list','dir_events_public','dir_place_events_public','dir_admin_event_queue','dir_admin_event_moderate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
