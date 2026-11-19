-- LOCAL PRO ONLY. Append-only discussion; never changes quotes or sends messages.
begin;
create table if not exists public.pro_quote_change_state(
 quote_id uuid primary key references public.quotes(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,
 revision integer not null default 0,pending boolean not null default false
);
create table if not exists public.pro_quote_change_events(
 position bigint generated always as identity primary key,quote_id uuid not null references public.pro_quote_change_state(quote_id) on delete cascade,
 actor_id uuid not null,action text not null check(action in ('request','respond','cancel')),note text not null check(length(btrim(note)) between 1 and 1000),
 snapshot jsonb not null,at timestamptz not null default now()
);
create index if not exists pro_quote_change_events_page on public.pro_quote_change_events(quote_id,position desc);
create table if not exists public.pro_quote_change_actions(actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,action_id));
create or replace function public.pro_quote_change_snapshot(p_quote uuid) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('title',q.title,'items',q.items,'taxMode',q.tax_mode,'subtotal',q.subtotal,'taxAmount',q.tax_amount,'total',q.total,'notes',q.notes,'validUntil',q.valid_until,'status',q.status,'choices',(select jsonb_build_object('version',c.version,'baseItems',c.base_items,'extras',c.extras,'selected',c.selected) from pro_quote_choices c where c.quote_id=q.id)) from quotes q where q.id=p_quote and q.deleted_at is null;
$$;
create or replace function public.pro_quote_change_read(p_actor uuid,p_quote uuid,p_after bigint default null) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare q quotes;s pro_quote_change_state;owner uuid;recipient uuid;events jsonb;snapshot jsonb;enabled boolean;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into q from quotes where id=p_quote and deleted_at is null;if not found then return null;end if;
 select profile_id into owner from professionals where id=q.professional_id;recipient:=pro_quote_choice_client(owner,p_quote);
 if p_actor is distinct from owner and p_actor is distinct from recipient then return null;end if;
 select * into s from pro_quote_change_state where quote_id=p_quote;
 if s.quote_id is not null and (s.owner_id is distinct from owner or s.client_id is distinct from recipient) then raise exception 'Changed recipient' using errcode='42501';end if;
 enabled:=pro_appointment_enabled(owner) and recipient is not null and recipient<>owner;
 if p_after is not null and p_after<1 then raise exception 'Bad cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'action',action,'note',note,'snapshot',e.snapshot,'at',at) order by position desc),'[]') into events from(select * from pro_quote_change_events where quote_id=p_quote and (p_after is null or position<p_after) order by position desc limit 21) e;
 snapshot:=pro_quote_change_snapshot(p_quote);
 return jsonb_build_object('quoteId',p_quote,'enabled',enabled or s.quote_id is not null,'side',case when p_actor=owner then 'provider' else 'client' end,'revision',coalesce(s.revision,0),'pending',coalesce(s.pending,false),'canWrite',enabled and q.status='sent' and (q.valid_until is null or q.valid_until>=(now() at time zone 'America/Costa_Rica')::date),'fingerprint',md5(snapshot::text),'events',(select coalesce(jsonb_agg(e order by n),'[]') from jsonb_array_elements(events) with ordinality t(e,n) where n<=20),'nextCursor',case when jsonb_array_length(events)>20 then (events->19->>'position')::bigint else null end);
end $$;
create or replace function public.pro_quote_change_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare q quotes;s pro_quote_change_state;owner uuid;recipient uuid;prior pro_quote_change_actions;rid uuid;action text;note text;snapshot jsonb;result jsonb;begin
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input?&array['quoteId','actionId','action','revision','fingerprint','note']) or (p_input-array['quoteId','actionId','action','revision','fingerprint','note'])<>'{}'::jsonb or jsonb_typeof(p_input->'revision') is distinct from 'number' or p_input->>'revision'!~'^[0-9]{1,9}$' or jsonb_typeof(p_input->'note') is distinct from 'string' or length(btrim(p_input->>'note')) not between 1 and 1000 or p_input->>'action' not in ('request','respond','cancel') then raise exception 'Invalid input' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 rid:=(p_input->>'quoteId')::uuid;action:=p_input->>'action';note:=btrim(p_input->>'note');
 select p.profile_id into owner from quotes r join professionals p on p.id=r.professional_id where r.id=rid and r.deleted_at is null;if owner is null then raise exception 'Not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_quote_change_actions where actor_id=p_actor and action_id=(p_input->>'actionId')::uuid;
 if found then if prior.input<>p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
 select * into q from quotes where id=rid and deleted_at is null for update;if not found then raise exception 'Not found' using errcode='P0002';end if;
 select profile_id into owner from professionals where id=q.professional_id;recipient:=pro_quote_choice_client(owner,rid);
 if p_actor is distinct from owner and p_actor is distinct from recipient then raise exception 'Forbidden' using errcode='42501';end if;
 if not pro_appointment_enabled(owner) or recipient is null or recipient=owner then raise exception 'Pro required' using errcode='42501';end if;
 insert into pro_quote_change_state(quote_id,owner_id,client_id) values(rid,owner,recipient) on conflict do nothing;
 select * into s from pro_quote_change_state where quote_id=rid for update;
 if s.owner_id is distinct from owner or s.client_id is distinct from recipient then raise exception 'Changed recipient' using errcode='42501';end if;
 snapshot:=pro_quote_change_snapshot(rid);
 if s.revision<>(p_input->>'revision')::integer or md5(snapshot::text) is distinct from p_input->>'fingerprint' then raise exception 'Changed quote' using errcode='40001';end if;
 if q.status<>'sent' or q.valid_until<(now() at time zone 'America/Costa_Rica')::date then raise exception 'Closed quote' using errcode='40001';end if;
 if action='request' then
  if p_actor<>recipient then raise exception 'Only customer' using errcode='42501';end if;
  if s.pending then raise exception 'Request already pending' using errcode='40001';end if;
 elsif action='respond' then
  if p_actor<>owner then raise exception 'Only professional' using errcode='42501';end if;
  if not s.pending then raise exception 'No pending request' using errcode='40001';end if;
 else
  if p_actor<>recipient then raise exception 'Only customer' using errcode='42501';end if;
  if not s.pending then raise exception 'No pending request' using errcode='40001';end if;
 end if;
 insert into pro_quote_change_events(quote_id,actor_id,action,note,snapshot) values(rid,p_actor,action,note,snapshot);
 update pro_quote_change_state set revision=revision+1,pending=action='request' where quote_id=rid;
 select jsonb_build_object('quoteId',rid,'revision',revision,'pending',pending) into result from pro_quote_change_state where quote_id=rid;
 insert into pro_quote_change_actions values(p_actor,(p_input->>'actionId')::uuid,p_input,result);return result;
end $$;
create or replace function public.pro_quote_change_recipient_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.professional_id is distinct from old.professional_id or new.client_id is distinct from old.client_id) and exists(select 1 from pro_quote_change_state where quote_id=old.id) then raise exception 'Retain quote discussion recipients' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_quote_change_recipient_guard on public.quotes;
create trigger pro_quote_change_recipient_guard before update on public.quotes for each row execute function pro_quote_change_recipient_guard();
do $$declare n text;begin foreach n in array array['pro_quote_change_state','pro_quote_change_events','pro_quote_change_actions'] loop execute format('alter table %I enable row level security',n);execute format('revoke all on %I from public,anon,authenticated',n);execute format('grant all on %I to service_role',n);end loop;end $$;
grant usage,select on sequence public.pro_quote_change_events_position_seq to service_role;
revoke all on function pro_quote_change_snapshot(uuid),pro_quote_change_read(uuid,uuid,bigint),pro_quote_change_mutate(uuid,jsonb),pro_quote_change_recipient_guard() from public,anon,authenticated;
grant execute on function pro_quote_change_snapshot(uuid),pro_quote_change_read(uuid,uuid,bigint),pro_quote_change_mutate(uuid,jsonb),pro_quote_change_recipient_guard() to service_role;
commit;
