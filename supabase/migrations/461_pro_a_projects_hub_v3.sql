-- Pro area A (Projects list): multi-status filter, sortable columns (created, viewed, location, managers), pinned rows,
-- project managers and custom statuses for the Kanban view. New objects only; the v1/v2 readers stay unchanged.
--  * pro_project_hub_state: per-project hub data (created_at is stamped by a trigger on new projects only; projects that
--    existed before keep it null and the UI shows a dash, nothing is invented), last_viewed_at, pinned, custom status.
--  * pro_project_statuses: owner-defined Kanban statuses (name, colour, position). Deleting one clears the assignments first.
--  * pro_project_managers: team members (active collaborators of the owner) in charge of a project.
-- Owner only, service_role only, bounds in SQL.
begin;
create table if not exists public.pro_project_statuses(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 40),
 color text not null default 'gray' check(color in('blue','teal','green','olive','amber','orange','red','magenta','purple','gray')),
 position integer not null default 0 check(position between 0 and 1000),
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_project_statuses_name on public.pro_project_statuses(owner_id,lower(btrim(name)));
create table if not exists public.pro_project_hub_state(
 owner_id uuid not null,
 work_id text not null,
 created_at timestamptz,
 last_viewed_at timestamptz,
 pinned boolean not null default false,
 status_id uuid,
 primary key(owner_id,work_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,status_id) references public.pro_project_statuses(owner_id,id)
);
create table if not exists public.pro_project_managers(
 owner_id uuid not null,
 work_id text not null,
 member_user_id uuid not null,
 member_name text not null default '' check(length(member_name)<=160),
 created_at timestamptz not null default now(),
 primary key(owner_id,work_id,member_user_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_project_managers_member on public.pro_project_managers(owner_id,member_user_id);

create or replace function public.pro_project_hub_seed() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.pro_project_hub_state(owner_id,work_id,created_at) values(new.user_id,new.id,now()) on conflict(owner_id,work_id) do nothing;
 return new;
end $$;
drop trigger if exists pro_project_hub_seed on public.pro_work;
create trigger pro_project_hub_seed after insert on public.pro_work for each row execute function public.pro_project_hub_seed();

create or replace function public.pro_projects_page_v3(p_actor uuid,p_statuses text[] default null,p_search text default '',p_offset integer default 0,p_type uuid default null,p_tag uuid default null,p_manager uuid default null,p_sort text default 'default',p_dir text default 'desc') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;more boolean;counts jsonb;needle text;catalog jsonb;statuses jsonb;managers jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_search is null or length(p_search)>160 or p_offset is null or p_offset<0 or p_offset>100000
  or p_sort is null or p_sort not in('default','name','client','status','created','viewed','location')
  or p_dir is null or p_dir not in('asc','desc')
  or p_statuses is not null and not (p_statuses <@ array['open','in_progress','completed','cancelled']::text[]) then
  raise exception 'Invalid project query' using errcode='22023';end if;
 needle:=nullif(btrim(p_search),'');
 select jsonb_build_object('open',count(*) filter(where x.s='open'),'in_progress',count(*) filter(where x.s='in_progress'),'completed',count(*) filter(where x.s='completed'),'cancelled',count(*) filter(where x.s='cancelled'),'all',count(*))
  into counts from (select public.pro_project_status(w) as s from public.pro_work w where w.user_id=p_actor) x;
 with base as (
  select row_number() over (order by coalesce(s.pinned,false) desc,
    case when p_sort='name' and p_dir='asc' then lower(w.service) end asc,
    case when p_sort='name' and p_dir='desc' then lower(w.service) end desc,
    case when p_sort='client' and p_dir='asc' then lower(w.client) end asc,
    case when p_sort='client' and p_dir='desc' then lower(w.client) end desc,
    case when p_sort='status' and p_dir='asc' then public.pro_project_status(w) end asc,
    case when p_sort='status' and p_dir='desc' then public.pro_project_status(w) end desc,
    case when p_sort='location' and p_dir='asc' then lower(coalesce(d.address,'')) end asc,
    case when p_sort='location' and p_dir='desc' then lower(coalesce(d.address,'')) end desc,
    case when p_sort='created' and p_dir='asc' then s.created_at end asc nulls last,
    case when p_sort='created' and p_dir='desc' then s.created_at end desc nulls last,
    case when p_sort='viewed' and p_dir='asc' then s.last_viewed_at end asc nulls last,
    case when p_sort='viewed' and p_dir='desc' then s.last_viewed_at end desc nulls last,
    w.position desc) as ord,
   jsonb_build_object('id',w.id,'name',w.service,'client',w.client,'clientId',w."clientId",'status',public.pro_project_status(w),
    'start',nullif(w."start",''),'end',nullif(w."end",''),'hasQuote',w."quoteId" is not null or w."externalQuoteId" is not null,
    'linkedCustomer',exists(select 1 from public.pro_appointment_requests r join public.profiles c on c.id=r.client_user_id
      where r.owner_id=w.user_id and r.work_id=w.id and r.status in('confirmed','completed') and not coalesce(c.is_disabled,false)),
    'customView',exists(select 1 from public.pro_client_dashboards cd where cd.owner_id=w.user_id and cd.work_id=w.id),
    'color',d.color,'code',d.code,
    'type',case when t.id is null then null else jsonb_build_object('id',t.id,'systemKey',t.system_key,'name',t.name) end,
    'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by l.position),'[]'::jsonb)
      from public.pro_project_tag_links l join public.pro_project_tags g on g.owner_id=l.owner_id and g.id=l.tag_id where l.owner_id=w.user_id and l.work_id=w.id),
    'created',s.created_at,'viewed',s.last_viewed_at,'pinned',coalesce(s.pinned,false),'location',d.address,'customStatusId',s.status_id,
    'managers',(select coalesce(jsonb_agg(jsonb_build_object('id',m.member_user_id,'name',m.member_name) order by m.member_name,m.member_user_id),'[]'::jsonb)
      from public.pro_project_managers m where m.owner_id=w.user_id and m.work_id=w.id)) as content
  from public.pro_work w
  left join public.pro_project_details d on d.owner_id=w.user_id and d.work_id=w.id
  left join public.pro_project_types t on t.owner_id=d.owner_id and t.id=d.type_id
  left join public.pro_project_hub_state s on s.owner_id=w.user_id and s.work_id=w.id
  where w.user_id=p_actor
   and (p_statuses is null or cardinality(p_statuses)=0 or public.pro_project_status(w)=any(p_statuses))
   and (needle is null or strpos(lower(w.service),lower(needle))>0 or strpos(lower(w.client),lower(needle))>0 or strpos(lower(coalesce(d.code,'')),lower(needle))>0)
   and (p_type is null or d.type_id=p_type)
   and (p_tag is null or exists(select 1 from public.pro_project_tag_links l where l.owner_id=w.user_id and l.work_id=w.id and l.tag_id=p_tag))
   and (p_manager is null or exists(select 1 from public.pro_project_managers m where m.owner_id=w.user_id and m.work_id=w.id and m.member_user_id=p_manager))
 )
 select coalesce(jsonb_agg(b.content order by b.ord) filter(where b.ord<=p_offset+20),'[]'::jsonb),coalesce(bool_or(b.ord=p_offset+21),false)
  into items,more from base b where b.ord>p_offset and b.ord<=p_offset+21;
 catalog:=public.pro_pnd_catalog_json(p_actor);
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'color',u.color) order by u.position,u.created_at,u.id),'[]'::jsonb) into statuses from public.pro_project_statuses u where u.owner_id=p_actor;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.member_user_id,'name',m.name) order by m.name,m.member_user_id),'[]'::jsonb) into managers
  from (select g.member_user_id,max(g.member_name) as name from public.pro_team_grants g where g.owner_id=p_actor and g.active group by g.member_user_id) m;
 return jsonb_build_object('items',items,'nextCursor',case when more then p_offset+20 else null end,'counts',counts,
  'filters',jsonb_build_object('types',catalog->'types','tags',catalog->'tags','managers',managers,'statuses',statuses));
end $$;

create or replace function public.pro_project_hub_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare act text;wid text;sid uuid;nm text;col text;ids uuid[];n integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid input' using errcode='22023';end if;
 act:=p_input->>'action';
 if act in('viewed','pin','managers','status_set') then
  wid:=p_input->>'workId';
  if wid is null or not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=wid) then raise exception 'Project not found' using errcode='P0002';end if;
 end if;
 if act='viewed' then
  insert into public.pro_project_hub_state(owner_id,work_id,last_viewed_at) values(p_actor,wid,now())
   on conflict(owner_id,work_id) do update set last_viewed_at=excluded.last_viewed_at;
 elsif act='pin' then
  if jsonb_typeof(p_input->'pinned')<>'boolean' then raise exception 'Invalid input' using errcode='22023';end if;
  insert into public.pro_project_hub_state(owner_id,work_id,pinned) values(p_actor,wid,(p_input->>'pinned')::boolean)
   on conflict(owner_id,work_id) do update set pinned=excluded.pinned;
 elsif act='managers' then
  if jsonb_typeof(p_input->'memberIds')<>'array' or jsonb_array_length(p_input->'memberIds')>10 then raise exception 'Invalid input' using errcode='22023';end if;
  select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_input->'memberIds') as t(v);
  select count(*) into n from (select g.member_user_id from public.pro_team_grants g where g.owner_id=p_actor and g.active and g.member_user_id=any(ids) group by g.member_user_id) q;
  if n<>coalesce(cardinality(ids),0) then raise exception 'Invalid manager' using errcode='22023';end if;
  delete from public.pro_project_managers m where m.owner_id=p_actor and m.work_id=wid;
  insert into public.pro_project_managers(owner_id,work_id,member_user_id,member_name)
   select p_actor,wid,g.member_user_id,left(max(g.member_name),160) from public.pro_team_grants g where g.owner_id=p_actor and g.active and g.member_user_id=any(ids) group by g.member_user_id;
 elsif act='status_set' then
  sid:=nullif(p_input->>'statusId','')::uuid;
  if sid is not null and not exists(select 1 from public.pro_project_statuses u where u.owner_id=p_actor and u.id=sid) then raise exception 'Status not found' using errcode='P0002';end if;
  insert into public.pro_project_hub_state(owner_id,work_id,status_id) values(p_actor,wid,sid)
   on conflict(owner_id,work_id) do update set status_id=excluded.status_id;
 elsif act in('status_create','status_rename') then
  sid:=(p_input->>'id')::uuid;nm:=btrim(coalesce(p_input->>'name',''));col:=coalesce(p_input->>'color','gray');
  if length(nm) not between 1 and 40 or col not in('blue','teal','green','olive','amber','orange','red','magenta','purple','gray') then raise exception 'Invalid input' using errcode='22023';end if;
  if act='status_create' then
   select count(*) into n from public.pro_project_statuses u where u.owner_id=p_actor;
   if n>=20 and not exists(select 1 from public.pro_project_statuses u where u.owner_id=p_actor and u.id=sid) then raise exception 'Too many statuses' using errcode='54000';end if;
   insert into public.pro_project_statuses(owner_id,id,name,color,position) values(p_actor,sid,nm,col,n)
    on conflict(owner_id,id) do nothing;
  else
   update public.pro_project_statuses u set name=nm,color=col where u.owner_id=p_actor and u.id=sid;
   if not found then raise exception 'Status not found' using errcode='P0002';end if;
  end if;
 elsif act='status_delete' then
  sid:=(p_input->>'id')::uuid;
  update public.pro_project_hub_state s set status_id=null where s.owner_id=p_actor and s.status_id=sid;
  delete from public.pro_project_statuses u where u.owner_id=p_actor and u.id=sid;
 elsif act='status_reorder' then
  if jsonb_typeof(p_input->'ids')<>'array' or jsonb_array_length(p_input->'ids')>20 then raise exception 'Invalid input' using errcode='22023';end if;
  update public.pro_project_statuses u set position=o.ord-1
   from (select (e.v)::uuid as id,e.ord::integer as ord from jsonb_array_elements_text(p_input->'ids') with ordinality as e(v,ord)) o
   where u.owner_id=p_actor and u.id=o.id;
 else
  raise exception 'Invalid action' using errcode='22023';
 end if;
 return jsonb_build_object('ok',true,'statuses',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'color',u.color) order by u.position,u.created_at,u.id),'[]'::jsonb) from public.pro_project_statuses u where u.owner_id=p_actor));
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_project_statuses','pro_project_hub_state','pro_project_managers'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_projects_page_v3','pro_project_hub_mutate','pro_project_hub_seed') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
