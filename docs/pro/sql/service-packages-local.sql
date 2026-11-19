-- LOCAL PRO ONLY. Commercial snapshots shared by quote and invoice editors.
-- No workspace rewrite, stock movement, payment, debt or fiscal emission.
begin;
create table if not exists public.pro_service_package_revisions(user_id uuid primary key references public.profiles(id) on delete cascade,revision integer not null default 0 check(revision>=0));
create table if not exists public.pro_service_packages(
 user_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,name text not null check(name=btrim(name) and length(name) between 1 and 80),notes text not null default '' check(notes=btrim(notes) and length(notes)<=1000),archived boolean not null default false,position bigint generated always as identity,primary key(user_id,id)
);
create unique index if not exists pro_service_packages_names on public.pro_service_packages(user_id,lower(name));
create index if not exists pro_service_packages_page on public.pro_service_packages(user_id,archived,position);
create table if not exists public.pro_service_package_lines(
 user_id uuid not null,package_id uuid not null,line_number integer not null check(line_number between 1 and 20),kind text not null check(kind in ('product','service')),description text not null check(description=btrim(description) and length(description) between 1 and 140),quantity text not null check(quantity~'^[0-9]{1,4}(\.[0-9]{1,2})?$' and quantity::numeric>0 and quantity::numeric<=9999),unit_price text not null check(unit_price~'^[0-9]{1,9}$' and unit_price::numeric<=100000000),sku text not null check(length(sku)<=160 and sku=btrim(sku)),unit text not null check(length(unit)<=30 and unit=btrim(unit)),cabys text not null check(cabys~'^([0-9]{13})?$'),primary key(user_id,package_id,line_number),foreign key(user_id,package_id) references public.pro_service_packages(user_id,id) on delete cascade
);
create table if not exists public.pro_service_package_requests(user_id uuid not null references profiles(id) on delete cascade,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
do $$declare n text;begin foreach n in array array['pro_service_packages','pro_service_package_lines','pro_service_package_revisions','pro_service_package_requests'] loop
 execute format('alter table %I enable row level security',n);
 execute format('revoke all on %I from public,anon,authenticated',n);
 execute format('grant select on %I to authenticated',n);
 execute format('grant all on %I to service_role',n);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=n and policyname=n||'_owner') then execute format('create policy %I on %I for select to authenticated using(user_id=(select auth.uid()))',n||'_owner',n);end if;
 end loop;end $$;
grant usage,select on sequence public.pro_service_packages_position_seq to service_role;
create or replace function public.pro_mutate_service_package(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare action text;pid uuid;request uuid;rev integer;current_rev integer;prior pro_service_package_requests;body jsonb;line jsonb;n text;note text;qty text;price text;total numeric:=0;result jsonb;
begin
 if p_user is null or jsonb_typeof(p_input) is distinct from 'object' or (p_input-array['action','id','revision','requestId','package'])<>'{}'::jsonb or jsonb_typeof(p_input->'action') is distinct from 'string' or (p_input->>'action') not in ('save','archive','restore') or jsonb_typeof(p_input->'id') is distinct from 'string' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,10}$' then raise exception 'Invalid operation' using errcode='22023';end if;
 action:=p_input->>'action';pid:=(p_input->>'id')::uuid;request:=(p_input->>'requestId')::uuid;rev:=(p_input->>'revision')::integer;
 if action='save' then
  body:=p_input->'package';
  if jsonb_typeof(body) is distinct from 'object' or (body-array['name','notes','lines'])<>'{}'::jsonb or jsonb_typeof(body->'name') is distinct from 'string' or jsonb_typeof(body->'notes') is distinct from 'string' or jsonb_typeof(body->'lines') is distinct from 'array' then raise exception 'Invalid package' using errcode='22023';end if;
  n:=btrim(body->>'name');note:=btrim(body->>'notes');
  if length(n) not between 1 and 80 or length(note)>1000 or jsonb_array_length(body->'lines') not between 1 and 20 then raise exception 'Invalid package' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(body->'lines') loop
   if jsonb_typeof(line) is distinct from 'object' or not(line ?& array['kind','description','quantity','unitPrice','sku','unit','cabys']) or (line-array['kind','description','quantity','unitPrice','sku','unit','cabys'])<>'{}'::jsonb or exists(select 1 from jsonb_each(line) where jsonb_typeof(value)<>'string') then raise exception 'Invalid line' using errcode='22023';end if;
   qty:=replace(btrim(line->>'quantity'),',','.');price:=btrim(line->>'unitPrice');
   if line->>'kind' not in ('product','service') or length(btrim(line->>'description')) not between 1 and 140 or length(btrim(line->>'sku'))>160 or length(btrim(line->>'unit'))>30 or (line->>'cabys')!~'^([0-9]{13})?$' or qty!~'^[0-9]{1,4}(\.[0-9]{1,2})?$' or price!~'^[0-9]{1,9}$' then raise exception 'Invalid line' using errcode='22023';end if;
   if qty::numeric<=0 or qty::numeric>9999 or price::numeric>100000000 then raise exception 'Invalid amount' using errcode='22023';end if;
   total:=total+qty::numeric*price::numeric;
  end loop;
  if total>100000000 then raise exception 'Package total exceeds limit' using errcode='22023';end if;
 elsif p_input ? 'package' then raise exception 'Unexpected package body' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into prior from pro_service_package_requests where user_id=p_user and request_id=request;
 if found then
  if prior.input<>p_input then raise exception 'Request reuse with different content' using errcode='22023';end if;
  return prior.result;
 end if;
 insert into pro_service_package_revisions(user_id) values(p_user) on conflict do nothing;
 select revision into current_rev from pro_service_package_revisions where user_id=p_user for update;
 if current_rev<>rev then raise exception 'Stale package revision' using errcode='40001';end if;
 if action='save' then
  insert into pro_service_packages(user_id,id,name,notes) values(p_user,pid,n,note) on conflict(user_id,id) do update set name=excluded.name,notes=excluded.notes;
  delete from pro_service_package_lines where user_id=p_user and package_id=pid;
  insert into pro_service_package_lines(user_id,package_id,line_number,kind,description,quantity,unit_price,sku,unit,cabys)
  select p_user,pid,ordinality::integer,value->>'kind',btrim(value->>'description'),replace(btrim(value->>'quantity'),',','.'),btrim(value->>'unitPrice'),btrim(value->>'sku'),btrim(value->>'unit'),value->>'cabys' from jsonb_array_elements(body->'lines') with ordinality;
 else
  update pro_service_packages set archived=(action='archive') where user_id=p_user and id=pid;
  if not found then raise exception 'Unknown package' using errcode='P0002';end if;
 end if;
 update pro_service_package_revisions set revision=current_rev+1 where user_id=p_user;
 result:=jsonb_build_object('revision',current_rev+1,'id',pid);
 insert into pro_service_package_requests(user_id,request_id,input,result) values(p_user,request,p_input,result);
 return result;
end $$;
create or replace function public.pro_service_package_page(p_user uuid,p_archived boolean default false,p_search text default '',p_after text default '',p_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_user is null or p_archived is null or p_search is null or length(p_search)>160 or p_after is null or p_after!~'^[0-9]{0,18}$' then raise exception 'Invalid query' using errcode='22023';end if;
 with matches as(select * from pro_service_packages where user_id=p_user and archived=p_archived and (p_id is null or id=p_id) and position>coalesce(nullif(p_after,''),'0')::bigint and strpos(pro_catalog_search(name||' '||notes),pro_catalog_search(p_search))>0 order by position limit 21),page as(select * from matches order by position limit 20)
 select jsonb_build_object('revision',coalesce((select revision from pro_service_package_revisions where user_id=p_user),0),'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'notes',p.notes,'archived',p.archived,'lines',(select jsonb_agg(jsonb_build_object('kind',l.kind,'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price,'sku',l.sku,'unit',l.unit,'cabys',l.cabys) order by line_number) from pro_service_package_lines l where l.user_id=p.user_id and l.package_id=p.id)) order by position) from page p),'[]'::jsonb),'nextCursor',case when(select count(*) from matches)>20 then(select p.position::text from page p order by p.position desc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.pro_mutate_service_package(uuid,jsonb),public.pro_service_package_page(uuid,boolean,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pro_mutate_service_package(uuid,jsonb),public.pro_service_package_page(uuid,boolean,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
