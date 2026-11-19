-- LOCAL ONLY. Explicit choices; never sends messages, charges or fiscal documents.
begin;
create table if not exists public.pro_quote_choices(
 quote_id uuid primary key references public.quotes(id) on delete cascade,owner_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,revision integer not null default 1,version integer not null default 1,
 base_items jsonb not null,extras jsonb not null,selected jsonb not null default '[]',tax_mode text not null,
 status text not null default 'open' check(status in ('open','accepted','declined')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.pro_quote_choice_versions(
 quote_id uuid not null references public.pro_quote_choices(quote_id) on delete cascade,version integer not null,base_items jsonb not null,extras jsonb not null,tax_mode text not null,at timestamptz not null default now(),primary key(quote_id,version)
);
create table if not exists public.pro_quote_choice_events(
 position bigint generated always as identity primary key,quote_id uuid not null references public.pro_quote_choices(quote_id) on delete cascade,
 actor_id uuid not null,action text not null,version integer not null,selected jsonb not null default '[]',total integer not null,at timestamptz not null default now()
);
create index if not exists pro_quote_choice_events_page on public.pro_quote_choice_events(quote_id,position desc);
create index if not exists pro_quote_choice_client_page on public.pro_quote_choices(client_id,quote_id);
create table if not exists public.pro_quote_choice_actions(actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,action_id));
create or replace function public.pro_quote_choice_totals(p_items jsonb,p_tax text) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare net numeric;tax numeric;begin
 select round(coalesce(sum((r->>'quantity')::numeric*(r->>'unit_price')::numeric),0)) into net from jsonb_array_elements(p_items) e(r);
 if net<0 or net>1000000000 then raise exception 'Quote amount limit' using errcode='22023';end if;
 tax:=case p_tax when 'mas_iva' then round(net*0.13) when 'incluido' then round(net-net/1.13) else 0 end;
 return jsonb_build_object('subtotal',net,'taxAmount',tax,'total',case when p_tax='mas_iva' then net+tax else net end);
end $$;
create or replace function public.pro_quote_choice_client(p_owner uuid,p_quote uuid) returns uuid language sql stable set search_path=public,pg_temp as $$
 select coalesce(q.client_id,(select a.client_user_id from pro_quote_links l join pro_work w on w.user_id=l.user_id and w."clientId"=l."clientId" join pro_appointment_requests a on a.owner_id=w.user_id and a.work_id=w.id and w."bookingClientId"=a.client_user_id::text where l.user_id=p_owner and l."quoteId"=q.id::text order by a.position desc limit 1))
 from quotes q join professionals p on p.id=q.professional_id and p.profile_id=p_owner where q.id=p_quote and q.deleted_at is null;
$$;
create or replace function public.pro_quote_choice_detail(p_actor uuid,p_quote uuid,p_after bigint default null) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare c pro_quote_choices;q quotes;owner uuid;recipient uuid;events jsonb;next_key bigint;totals jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select p.profile_id into owner from quotes r join professionals p on p.id=r.professional_id where r.id=p_quote and r.deleted_at is null;
 select * into q from quotes where id=p_quote and deleted_at is null;
 if owner is null then return null;end if;
 select * into c from pro_quote_choices where quote_id=p_quote;recipient:=coalesce(c.client_id,pro_quote_choice_client(owner,p_quote));
 if p_actor is distinct from owner and (c.quote_id is null or p_actor is distinct from recipient) then return null;end if;
 if p_after is not null and p_after<1 then raise exception 'Bad cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'action',action,'version',version,'at',at,'selected',selected,'total',total) order by position desc),'[]') into events from(select * from pro_quote_choice_events where quote_id=p_quote and (p_after is null or position<p_after) order by position desc limit 20) s;
 if jsonb_array_length(events)=20 and exists(select 1 from pro_quote_choice_events where quote_id=p_quote and position<(events->19->>'position')::bigint) then next_key:=(events->19->>'position')::bigint;end if;
 totals:=pro_quote_choice_totals(q.items,q.tax_mode);
 return jsonb_build_object('quoteId',q.id,'title',coalesce(q.title,'Cotización'),'status',case when c.quote_id is null then q.status when q.status in ('withdrawn','declined') then q.status when c.status='open' and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then 'expired' else c.status end,'revision',coalesce(c.revision,0),'version',coalesce(c.version,0),'side',case when owner=p_actor then 'provider' else 'client' end,
 'canConfigure',q.status='sent' and (q.valid_until is null or q.valid_until>=(now() at time zone 'America/Costa_Rica')::date) and coalesce(c.status,'open')='open' and pro_appointment_enabled(owner) and not exists(select 1 from pro_invoice_drafts where user_id=owner and (quote_origin_key='quote:'||q.id::text or (source_kind='quote' and source_id=q.id::text))),
 'linked',recipient is not null and recipient<>owner,'configured',c.quote_id is not null,'baseItems',coalesce(c.base_items,q.items),'extras',coalesce(c.extras,'[]'),'selected',coalesce(c.selected,'[]'),'taxMode',q.tax_mode,'subtotal',totals->'subtotal','taxAmount',totals->'taxAmount','total',totals->'total','events',events,'nextCursor',next_key);
end $$;
create or replace function public.pro_quote_choice_page(p_actor uuid,p_after uuid default null,p_request uuid default null) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb;next_key uuid;a pro_appointment_requests;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is not null then select * into a from pro_appointment_requests where id=p_request and p_actor in(owner_id,client_user_id);if not found then raise exception 'Forbidden' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(jsonb_build_object('quoteId',id,'title',title,'status',status,'version',version,'total',total,'professionalName',professional_name) order by id desc),'[]') into result from(
 select q.id,coalesce(q.title,'Cotización') title,case when q.status in ('withdrawn','declined') then q.status when c.status='open' and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then 'expired' else c.status end status,c.version,q.total,coalesce(p.business_name,'Profesional') professional_name
 from pro_quote_choices c join quotes q on q.id=c.quote_id join professionals p on p.id=q.professional_id
 where q.deleted_at is null and (p_after is null or q.id<p_after) and ((p_request is null and c.client_id=p_actor) or (p_request is not null and c.owner_id=a.owner_id and c.client_id=a.client_user_id and exists(select 1 from pro_quote_links l join pro_work w on w.user_id=l.user_id and w."clientId"=l."clientId" where l.user_id=a.owner_id and l."quoteId"=q.id::text and w.id=a.work_id and w."bookingClientId"=a.client_user_id::text)))
 order by q.id desc limit 20) s;
 if jsonb_array_length(result)=20 then next_key:=(result->19->>'quoteId')::uuid;end if;
 return jsonb_build_object('items',result,'nextCursor',next_key);
end $$;
create or replace function public.pro_quote_choice_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from pro_quote_choices where quote_id=old.id) and (new.items is distinct from old.items or new.tax_mode is distinct from old.tax_mode or new.subtotal is distinct from old.subtotal or new.tax_amount is distinct from old.tax_amount or new.total is distinct from old.total or new.client_id is distinct from old.client_id or new.professional_id is distinct from old.professional_id or new.project_id is distinct from old.project_id or new.title is distinct from old.title or new.notes is distinct from old.notes or new.valid_until is distinct from old.valid_until or new.status is distinct from old.status and not(old.status='sent' and new.status='withdrawn')) and coalesce(current_setting('contratacr.quote_choice_write',true),'')<>'yes' then raise exception 'Use quote choice approval' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_quote_choice_guard on public.quotes;
create trigger pro_quote_choice_guard before update on public.quotes for each row execute function pro_quote_choice_guard();
create or replace function public.pro_quote_choice_invoice_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from pro_quote_choices c where c.owner_id=new.user_id and c.status='open' and ((new.source_kind='quote' and c.quote_id::text=new.source_id) or new.quote_origin_key='quote:'||c.quote_id::text or (new.source_kind='work' and exists(select 1 from pro_work w where w.user_id=new.user_id and w.id=new.source_id and w."externalQuoteId"=c.quote_id::text)))) then raise exception 'Customer must approve quote choices first' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_quote_choice_invoice_guard on public.pro_invoice_drafts;
create trigger pro_quote_choice_invoice_guard before insert on public.pro_invoice_drafts for each row execute function pro_quote_choice_invoice_guard();
create or replace function public.pro_quote_choice_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare q quotes;c pro_quote_choices;owner uuid;recipient uuid;prior pro_quote_choice_actions;action text;rid uuid;rev integer;extras jsonb;line jsonb;chosen jsonb;v_items jsonb;totals jsonb;result jsonb;v integer;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input?&array['action','quoteId','actionId','revision']) or jsonb_typeof(p_input->'revision') is distinct from 'number' or p_input->>'revision'!~'^[0-9]{1,9}$' then raise exception 'Bad mutation' using errcode='22023';end if;
 action:=p_input->>'action';rid:=(p_input->>'quoteId')::uuid;rev:=(p_input->>'revision')::integer;
 select p.profile_id into owner from quotes r join professionals p on p.id=r.professional_id where r.id=rid and r.deleted_at is null;if owner is null then raise exception 'Not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_quote_choice_actions where actor_id=p_actor and action_id=(p_input->>'actionId')::uuid;
 if found then if prior.input<>p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
 select * into q from quotes where id=rid for update;select * into c from pro_quote_choices where quote_id=rid for update;
 recipient:=coalesce(c.client_id,pro_quote_choice_client(owner,rid));
 if p_actor<>owner and (c.quote_id is null or p_actor is distinct from recipient) then raise exception 'Forbidden' using errcode='42501';end if;
 if rev<>coalesce(c.revision,0) then raise exception 'Changed quote' using errcode='40001';end if;
 if q.status<>'sent' or coalesce(c.status,'open')<>'open' then raise exception 'Closed quote' using errcode='40001';end if;
 if action='configure' then
  if p_actor<>owner or not pro_appointment_enabled(owner) then raise exception 'Forbidden' using errcode='42501';end if;
  if q.valid_until is not null and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then raise exception 'Expired quote' using errcode='40001';end if;
  if recipient is null or recipient=owner then raise exception 'Linked customer required' using errcode='22023';end if;
  if (p_input-array['action','quoteId','actionId','revision','extras'])<>'{}'::jsonb or jsonb_typeof(p_input->'extras') is distinct from 'array' or jsonb_array_length(p_input->'extras') not between 1 and 10 then raise exception 'Bad extras' using errcode='22023';end if;
  extras:=p_input->'extras';
  if (select count(distinct e->>'id') from jsonb_array_elements(extras)e)<>jsonb_array_length(extras) then raise exception 'Repeated extra' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(extras) loop
   if jsonb_typeof(line) is distinct from 'object' or not(line?&array['id','description','quantity','unit_price']) or (line-array['id','description','quantity','unit_price'])<>'{}'::jsonb or jsonb_typeof(line->'description') is distinct from 'string' or length(btrim(line->>'description')) not between 1 and 140 or jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity')!~'^[0-9]{1,4}(\.[0-9]{1,2})?$' or (line->>'quantity')::numeric<=0 or (line->>'quantity')::numeric>9999 or jsonb_typeof(line->'unit_price') is distinct from 'number' or (line->>'unit_price')!~'^[0-9]{1,9}$' or (line->>'unit_price')::numeric>100000000 then raise exception 'Invalid extra' using errcode='22023';end if;
   perform (line->>'id')::uuid;
  end loop;
  if jsonb_array_length(q.items)+jsonb_array_length(extras)>20 or exists(select 1 from pro_invoice_drafts where user_id=owner and (quote_origin_key='quote:'||q.id::text or (source_kind='quote' and source_id=q.id::text))) then raise exception 'Quote already invoiced or too many lines' using errcode='22023';end if;
  perform pro_quote_choice_totals(coalesce(c.base_items,q.items)||extras,q.tax_mode);
  v:=coalesce(c.version,0)+1;
  insert into pro_quote_choices(quote_id,owner_id,client_id,base_items,extras,tax_mode) values(rid,owner,recipient,q.items,extras,q.tax_mode) on conflict(quote_id) do update set extras=excluded.extras,revision=c.revision+1,version=v,updated_at=now();
  insert into pro_quote_choice_versions values(rid,v,coalesce(c.base_items,q.items),extras,q.tax_mode,now());
  totals:=pro_quote_choice_totals(q.items,q.tax_mode);chosen:='[]';
 elsif action in ('accept','decline') then
  if p_actor is distinct from recipient or c.quote_id is null then raise exception 'Only customer may approve' using errcode='42501';end if;
  if (p_input-array['action','quoteId','actionId','revision','selected'])<>'{}'::jsonb or action='decline' and p_input?'selected' then raise exception 'Unexpected fields' using errcode='22023';end if;
  if action='accept' and exists(select 1 from pro_invoice_drafts where user_id=owner and (quote_origin_key='quote:'||q.id::text or (source_kind='quote' and source_id=q.id::text))) then raise exception 'Invoice draft already exists' using errcode='40001';end if;
  if action='accept' and not pro_appointment_enabled(owner) then raise exception 'Provider unavailable' using errcode='42501';end if;
  if action='accept' and q.valid_until is not null and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then raise exception 'Expired quote' using errcode='40001';end if;
  chosen:=case when action='accept' then p_input->'selected' else '[]'::jsonb end;
  if jsonb_typeof(chosen) is distinct from 'array' or jsonb_array_length(chosen)>10 or exists(select 1 from jsonb_array_elements(chosen)e where jsonb_typeof(e)<>'string') or (select count(distinct e) from jsonb_array_elements(chosen)e)<>jsonb_array_length(chosen) or exists(select 1 from jsonb_array_elements_text(chosen)e where not exists(select 1 from jsonb_array_elements(c.extras)x where x->>'id'=e)) then raise exception 'Invalid selection' using errcode='22023';end if;
  select c.base_items||coalesce(jsonb_agg(jsonb_build_object('description',x->>'description','quantity',x->'quantity','unit_price',x->'unit_price') order by n),'[]') into v_items from jsonb_array_elements(c.extras) with ordinality e(x,n) where chosen ? (x->>'id');
  totals:=pro_quote_choice_totals(v_items,c.tax_mode);
  perform set_config('contratacr.quote_choice_write','yes',true);
  if action='accept' then update quotes set items=v_items,subtotal=(totals->>'subtotal')::integer,tax_amount=(totals->>'taxAmount')::integer,total=(totals->>'total')::integer,status='accepted',accepted_at=now(),updated_at=now() where id=rid;
  else update quotes set status='declined',declined_at=now(),updated_at=now() where id=rid;end if;
  perform set_config('contratacr.quote_choice_write','',true);
  update pro_quote_choices set status=case action when 'accept' then 'accepted' else 'declined' end,selected=chosen,revision=revision+1,updated_at=now() where quote_id=rid;v:=c.version;
 else raise exception 'Bad action' using errcode='22023';end if;
 insert into pro_quote_choice_events(quote_id,actor_id,action,version,selected,total) values(rid,p_actor,action,v,chosen,(totals->>'total')::integer);
 select jsonb_build_object('quoteId',rid,'revision',revision,'version',version,'status',status) into result from pro_quote_choices where quote_id=rid;
 insert into pro_quote_choice_actions values(p_actor,(p_input->>'actionId')::uuid,p_input,result);return result;
end $$;
do $$declare n text;begin foreach n in array array['pro_quote_choices','pro_quote_choice_versions','pro_quote_choice_events','pro_quote_choice_actions'] loop execute format('alter table %I enable row level security',n);execute format('revoke all on %I from public,anon,authenticated',n);execute format('grant all on %I to service_role',n);end loop;end $$;
grant usage,select on sequence public.pro_quote_choice_events_position_seq to service_role;
revoke all on function pro_quote_choice_totals(jsonb,text),pro_quote_choice_client(uuid,uuid),pro_quote_choice_detail(uuid,uuid,bigint),pro_quote_choice_page(uuid,uuid,uuid),pro_quote_choice_guard(),pro_quote_choice_invoice_guard(),pro_quote_choice_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_quote_choice_totals(jsonb,text),pro_quote_choice_client(uuid,uuid),pro_quote_choice_detail(uuid,uuid,bigint),pro_quote_choice_page(uuid,uuid,uuid),pro_quote_choice_guard(),pro_quote_choice_invoice_guard(),pro_quote_choice_mutate(uuid,jsonb) to service_role;
commit;
