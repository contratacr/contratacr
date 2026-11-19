-- LOCAL ONLY. Commercial presets copy values into existing invoice lines.
begin;
create table if not exists public.pro_discount_preset_revisions(user_id uuid primary key references public.profiles(id) on delete cascade,revision integer not null default 0 check(revision>=0));
create table if not exists public.pro_discount_presets(
 user_id uuid references public.profiles(id) on delete cascade,id uuid not null,name text not null check(name=btrim(name) and length(name) between 1 and 80),reason text not null check(reason=btrim(reason) and length(reason) between 1 and 160),method text not null check(method in ('percent','amount')),value text not null check(value~'^[0-9]{1,9}(\.[0-9]{1,5})?$' and value::numeric>0 and value::numeric<=100000000 and (method<>'percent' or value::numeric<=100)),archived boolean not null default false,position bigint generated always as identity,primary key(user_id,id)
);
create unique index if not exists pro_discount_presets_names on public.pro_discount_presets(user_id,lower(name));
create index if not exists pro_discount_presets_page on public.pro_discount_presets(user_id,archived,position);
alter table public.pro_discount_presets enable row level security;
alter table public.pro_discount_preset_revisions enable row level security;
drop policy if exists own_read on public.pro_discount_presets;
create policy own_read on public.pro_discount_presets for select to authenticated using(user_id=auth.uid());
drop policy if exists own_read on public.pro_discount_preset_revisions;
create policy own_read on public.pro_discount_preset_revisions for select to authenticated using(user_id=auth.uid());
revoke all on public.pro_discount_presets,public.pro_discount_preset_revisions from public,anon,authenticated;
grant select on public.pro_discount_presets,public.pro_discount_preset_revisions to authenticated;
grant all on public.pro_discount_presets,public.pro_discount_preset_revisions to service_role;
grant usage,select on sequence public.pro_discount_presets_position_seq to service_role;
create or replace function public.pro_mutate_discount_preset(p_user uuid,p_action text,p_id uuid,p_preset jsonb,p_revision integer) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r integer;n text;why text;m text;v text;
begin
 if p_user is null or p_action is null or p_action not in ('save','archive','restore') or p_id is null or p_revision is null or p_revision<0 then raise exception 'Invalid operation' using errcode='22023';end if;
 if p_action='save' then
  if jsonb_typeof(p_preset) is distinct from 'object' or jsonb_typeof(p_preset->'name') is distinct from 'string' or jsonb_typeof(p_preset->'reason') is distinct from 'string' or jsonb_typeof(p_preset->'method') is distinct from 'string' or jsonb_typeof(p_preset->'value') is distinct from 'string' then raise exception 'Invalid preset' using errcode='22023';end if;
  n=btrim(p_preset->>'name');why=btrim(p_preset->>'reason');m=p_preset->>'method';v=replace(btrim(p_preset->>'value'),',','.');
  if n is null or length(n) not between 1 and 80 or why is null or length(why) not between 1 and 160 or m is null or m not in ('percent','amount') or v is null or v!~'^[0-9]{1,9}(\.[0-9]{1,5})?$' then raise exception 'Invalid preset' using errcode='22023';end if;
  if v::numeric<=0 or v::numeric>100000000 or (m='percent' and v::numeric>100) then raise exception 'Invalid value' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 insert into pro_discount_preset_revisions(user_id) values(p_user) on conflict do nothing;
 select revision into r from pro_discount_preset_revisions where user_id=p_user for update;
 if r<>p_revision then raise exception 'Stale preset revision' using errcode='40001';end if;
 if p_action='save' then
  insert into pro_discount_presets(user_id,id,name,reason,method,value) values(p_user,p_id,n,why,m,v) on conflict(user_id,id) do update set name=excluded.name,reason=excluded.reason,method=excluded.method,value=excluded.value;
 else
  update pro_discount_presets set archived=(p_action='archive') where user_id=p_user and id=p_id;
  if not found then raise exception 'Unknown preset' using errcode='P0002';end if;
 end if;
 update pro_discount_preset_revisions set revision=r+1 where user_id=p_user;return r+1;
end $$;
create or replace function public.pro_discount_preset_page(p_user uuid,p_archived boolean default false,p_search text default '',p_after text default '') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;r integer;
begin
 if p_user is null or p_archived is null or p_search is null or length(p_search)>160 or p_after is null or p_after!~'^[0-9]{0,18}$' then raise exception 'Invalid query' using errcode='22023';end if;
 select coalesce((select revision from pro_discount_preset_revisions where user_id=p_user),0) into r;
 with page as (select * from pro_discount_presets where user_id=p_user and archived=p_archived and position>coalesce(nullif(p_after,''),'0')::bigint and strpos(pro_catalog_search(name||' '||reason),pro_catalog_search(p_search))>0 order by position limit 21),visible as (select * from page order by position limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'reason',reason,'method',method,'value',value,'archived',archived) order by position) from visible),'[]'::jsonb),'nextCursor',case when count(*)>20 then (select position::text from visible order by visible.position desc limit 1) else null end,'revision',r) into result from page;return result;
end $$;
revoke all on function public.pro_mutate_discount_preset(uuid,text,uuid,jsonb,integer),public.pro_discount_preset_page(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.pro_mutate_discount_preset(uuid,text,uuid,jsonb,integer),public.pro_discount_preset_page(uuid,boolean,text,text) to service_role;
commit;
