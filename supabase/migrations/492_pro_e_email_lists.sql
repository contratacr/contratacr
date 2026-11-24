-- Pro area E (email marketing): custom email lists. A list is a named set of the owner's marketing contacts; a campaign can target a
-- list through segment 'list:<uuid>'. Only contacts with granted consent and not suppressed are ever in an audience (pro_mkt_audience).
-- System lists (everyone with consent, customers, leads) keep their segments; this adds the custom ones.
begin;
create table if not exists public.pro_mkt_lists(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(name) between 1 and 80 and name=btrim(name)),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_mkt_lists_name on public.pro_mkt_lists(owner_id,lower(name));
create table if not exists public.pro_mkt_list_members(
 owner_id uuid not null,list_id uuid not null,contact_id uuid not null,
 primary key(owner_id,list_id,contact_id),
 foreign key(owner_id,list_id) references public.pro_mkt_lists(owner_id,id) on delete cascade,
 foreign key(owner_id,contact_id) references public.pro_mkt_contacts(owner_id,id) on delete cascade
);

-- Campaigns may target a custom list.
do $$declare c record;begin
 for c in select con.conname from pg_constraint con where con.contype='c' and con.conrelid='public.pro_mkt_campaigns'::regclass and pg_get_constraintdef(con.oid) like '%segment%' loop
  execute format('alter table public.pro_mkt_campaigns drop constraint %I',c.conname);
 end loop;
 alter table public.pro_mkt_campaigns add constraint pro_mkt_campaigns_segment_chk check(segment in('all','clients','leads') or segment~'^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
end $$;

create or replace function public.pro_mkt_audience(p_owner uuid,p_segment text) returns setof public.pro_mkt_contacts
language sql stable security invoker set search_path=public,pg_temp as $$
 select c.* from public.pro_mkt_contacts c where c.owner_id=p_owner and c.consent='granted'
  and not exists(select 1 from public.pro_mkt_suppressions s where s.owner_id=c.owner_id and s.email_hash=c.email_hash)
  and (p_segment='all' or p_segment='clients' and c.client_id is not null or p_segment='leads' and c.lead_id is not null
   or p_segment like 'list:%' and exists(select 1 from public.pro_mkt_list_members m where m.owner_id=c.owner_id and m.contact_id=c.id and m.list_id::text=substr(p_segment,6)))
  order by c.created_at,c.id $$;

create or replace function public.pro_mkt_lists_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object(
  'system',jsonb_build_object('all',(select count(*) from public.pro_mkt_audience(p_actor,'all')),'clients',(select count(*) from public.pro_mkt_audience(p_actor,'clients')),'leads',(select count(*) from public.pro_mkt_audience(p_actor,'leads'))),
  'lists',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,
    'contactIds',coalesce((select jsonb_agg(m.contact_id order by m.contact_id) from public.pro_mkt_list_members m where m.owner_id=l.owner_id and m.list_id=l.id),'[]'::jsonb),
    'audience',(select count(*) from public.pro_mkt_audience(p_actor,'list:'||l.id::text))) order by l.created_at,l.id)
   from public.pro_mkt_lists l where l.owner_id=p_actor),'[]'::jsonb),
  'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email) order by c.name,c.id)
   from (select * from public.pro_mkt_contacts where owner_id=p_actor and consent='granted' order by name,id limit 500) c),'[]'::jsonb));
end $$;

create or replace function public.pro_mkt_lists_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];lid uuid;v_name text;ids uuid[];n integer;
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid list action' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from (case act when 'create' then array['action','id','name'] when 'rename' then array['action','id','name'] when 'delete' then array['action','id'] when 'set_members' then array['action','contactIds','id'] end) then raise exception 'Invalid list fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not (p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid list id' using errcode='22023';end if;
 lid:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('mkt-lists:'||p_actor::text,0));
 if act in('create','rename') then
  if jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid list name' using errcode='22023';end if;
  v_name:=btrim(p_input->>'name');if length(v_name) not between 1 and 80 then raise exception 'Invalid list name' using errcode='22023';end if;
 end if;
 if act='create' then
  if (select count(*) from public.pro_mkt_lists where owner_id=p_actor)>=30 then raise exception 'List limit' using errcode='54000';end if;
  insert into public.pro_mkt_lists(owner_id,id,name) values(p_actor,lid,v_name);
 elsif act='rename' then
  update public.pro_mkt_lists set name=v_name,updated_at=now() where owner_id=p_actor and id=lid;if not found then raise exception 'List unavailable' using errcode='P0002';end if;
 elsif act='delete' then
  delete from public.pro_mkt_lists where owner_id=p_actor and id=lid;if not found then raise exception 'List unavailable' using errcode='P0002';end if;
 elsif act='set_members' then
  if jsonb_typeof(p_input->'contactIds') is distinct from 'array' or jsonb_array_length(p_input->'contactIds')>2000
   or exists(select 1 from jsonb_array_elements(p_input->'contactIds') v where jsonb_typeof(v) is distinct from 'string' or (v#>>'{}')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid members' using errcode='22023';end if;
  if not exists(select 1 from public.pro_mkt_lists where owner_id=p_actor and id=lid) then raise exception 'List unavailable' using errcode='P0002';end if;
  select coalesce(array_agg(distinct (v#>>'{}')::uuid),array[]::uuid[]) into ids from jsonb_array_elements(p_input->'contactIds') v;
  select count(*) into n from public.pro_mkt_contacts c where c.owner_id=p_actor and c.id=any(ids);
  if n<>cardinality(ids) then raise exception 'Unknown contact' using errcode='22023';end if;
  delete from public.pro_mkt_list_members where owner_id=p_actor and list_id=lid;
  insert into public.pro_mkt_list_members(owner_id,list_id,contact_id) select p_actor,lid,x from unnest(ids) x;
  update public.pro_mkt_lists set updated_at=now() where owner_id=p_actor and id=lid;
 else raise exception 'Invalid list action' using errcode='22023';end if;
 return public.pro_mkt_lists_read(p_actor);
end $$;

do $$declare f record;t text;begin
 foreach t in array array['pro_mkt_lists','pro_mkt_list_members'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_mkt_lists_read','pro_mkt_lists_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
