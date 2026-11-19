-- LOCAL ONLY. Independent taxonomy; never rewrites catalog text or workspace JSON.
begin;
create table if not exists public.pro_catalog_organization_revisions (
 user_id uuid references public.profiles(id) on delete cascade,kind text check(kind in ('client_group','product_category')),revision integer not null default 0 check(revision>=0),primary key(user_id,kind)
);
create table if not exists public.pro_catalog_organizations (
 user_id uuid references public.profiles(id) on delete cascade,kind text check(kind in ('client_group','product_category')),id uuid not null,name text not null check(name=btrim(name) and length(name) between 1 and 80),archived boolean not null default false,position bigint generated always as identity,primary key(user_id,kind,id)
);
create table if not exists public.pro_catalog_organization_aliases (
 user_id uuid not null,kind text not null,organization_id uuid not null,name text not null check(length(name) between 1 and 80),name_key text generated always as (lower(btrim(name))) stored,primary key(user_id,kind,name_key),foreign key(user_id,kind,organization_id) references public.pro_catalog_organizations(user_id,kind,id) on delete cascade
);
create index if not exists pro_clients_organization_text on public.pro_clients(user_id,lower(btrim("group")));
create index if not exists pro_products_organization_text on public.pro_products(user_id,lower(btrim(category)));
create index if not exists pro_catalog_organizations_page on public.pro_catalog_organizations(user_id,kind,archived,position);
create index if not exists pro_catalog_organization_alias_owner on public.pro_catalog_organization_aliases(user_id,kind,organization_id);
alter table public.pro_catalog_organization_revisions enable row level security;
alter table public.pro_catalog_organizations enable row level security;
alter table public.pro_catalog_organization_aliases enable row level security;
drop policy if exists own_read on public.pro_catalog_organizations;
create policy own_read on public.pro_catalog_organizations for select to authenticated using(user_id=auth.uid());
drop policy if exists own_read on public.pro_catalog_organization_aliases;
create policy own_read on public.pro_catalog_organization_aliases for select to authenticated using(user_id=auth.uid());
drop policy if exists own_read on public.pro_catalog_organization_revisions;
create policy own_read on public.pro_catalog_organization_revisions for select to authenticated using(user_id=auth.uid());
revoke all on public.pro_catalog_organizations,public.pro_catalog_organization_aliases,public.pro_catalog_organization_revisions from public,anon,authenticated;
grant select on public.pro_catalog_organizations,public.pro_catalog_organization_aliases,public.pro_catalog_organization_revisions to authenticated;
grant all on public.pro_catalog_organizations,public.pro_catalog_organization_aliases,public.pro_catalog_organization_revisions to service_role;
grant usage,select on sequence public.pro_catalog_organizations_position_seq to service_role;
create or replace function public.pro_mutate_catalog_organization(p_user uuid,p_kind text,p_action text,p_id uuid,p_name text,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r integer;existing public.pro_catalog_organizations;clean text=btrim(p_name);
begin
 if p_user is null or p_kind is null or p_kind not in ('client_group','product_category') or p_action is null or p_action not in ('create','rename','archive','restore') or p_id is null or p_revision is null or p_revision<0 then raise exception 'Invalid operation' using errcode='22023';end if;
 if p_action in ('create','rename') and (clean is null or length(clean) not between 1 and 80) then raise exception 'Invalid name' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 insert into pro_catalog_organization_revisions(user_id,kind) values(p_user,p_kind) on conflict do nothing;
 select revision into r from pro_catalog_organization_revisions where user_id=p_user and kind=p_kind for update;
 if r<>p_revision then raise exception 'Stale organization revision' using errcode='40001';end if;
 select * into existing from pro_catalog_organizations where user_id=p_user and kind=p_kind and id=p_id;
 if p_action='create' then
  insert into pro_catalog_organizations(user_id,kind,id,name) values(p_user,p_kind,p_id,clean);
 elsif existing.id is null then raise exception 'Unknown organization' using errcode='P0002';
 elsif p_action='rename' then update pro_catalog_organizations set name=clean where user_id=p_user and kind=p_kind and id=p_id;
 else update pro_catalog_organizations set archived=(p_action='archive') where user_id=p_user and kind=p_kind and id=p_id;
 end if;
 if p_action in ('create','rename') then
  if exists(select 1 from pro_catalog_organization_aliases where user_id=p_user and kind=p_kind and name_key=lower(clean) and organization_id<>p_id) then raise exception 'Reserved name' using errcode='23505';end if;
  insert into pro_catalog_organization_aliases(user_id,kind,organization_id,name) values(p_user,p_kind,p_id,clean) on conflict(user_id,kind,name_key) do nothing;
 end if;
 update pro_catalog_organization_revisions set revision=r+1 where user_id=p_user and kind=p_kind;return r+1;
end $$;
create or replace function public.pro_catalog_organization_page(p_user uuid,p_kind text,p_archived boolean default false,p_search text default '',p_after text default '',p_existing boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;r integer;
begin
 if p_kind not in ('client_group','product_category') or p_kind is null or p_user is null or length(p_search)>160 or length(p_after)>160 or (not p_existing and p_after<>'' and p_after!~'^[0-9]{1,18}$') then raise exception 'Invalid query' using errcode='22023';end if;
 select coalesce((select revision from pro_catalog_organization_revisions where user_id=p_user and kind=p_kind),0) into r;
 if p_existing then
  with labels as (select "group" as name from pro_clients where user_id=p_user and p_kind='client_group' union all select category from pro_products where user_id=p_user and p_kind='product_category'),grouped as (
   select lower(btrim(name)) as key,min(name collate "C") as name,count(*) as n from labels where btrim(coalesce(name,''))<>'' and length(name)<=80 group by lower(btrim(name))
  ), page as (select * from grouped g where g.key>p_after collate "C" and not exists(select 1 from pro_catalog_organization_aliases a where a.user_id=p_user and a.kind=p_kind and a.name_key=g.key) and strpos(pro_catalog_search(g.name collate "default"),pro_catalog_search(p_search))>0 order by g.key collate "C" limit 21)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('name',name,'recordCount',n) order by key collate "C") from (select * from page order by key collate "C" limit 20) x),'[]'::jsonb),'nextCursor',case when count(*)>20 then (select key from page order by key collate "C" offset 19 limit 1) else null end,'revision',r) into result from page;
 else
  with page as (select o.* from pro_catalog_organizations o where user_id=p_user and kind=p_kind and archived=p_archived and position>coalesce(nullif(p_after,''),'0')::bigint and (strpos(pro_catalog_search(name),pro_catalog_search(p_search))>0 or exists(select 1 from pro_catalog_organization_aliases a where a.user_id=p_user and a.kind=p_kind and a.organization_id=o.id and strpos(pro_catalog_search(a.name),pro_catalog_search(p_search))>0)) order by position limit 21),rows as (
   select p.*, (select count(*) from pro_catalog_organization_aliases a where a.user_id=p_user and a.kind=p_kind and a.organization_id=p.id) aliases,
   (select count(*) from (select "group" as label from pro_clients where user_id=p_user and p_kind='client_group' union all select category from pro_products where user_id=p_user and p_kind='product_category') c where exists(select 1 from pro_catalog_organization_aliases a where a.user_id=p_user and a.kind=p_kind and a.organization_id=p.id and a.name_key=lower(btrim(c.label)))) records from page p order by position limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'archived',archived,'aliasCount',aliases,'recordCount',records) order by position) from rows),'[]'::jsonb),'nextCursor',case when count(*)>20 then (select position::text from rows order by rows.position desc limit 1) else null end,'revision',r) into result from page;
 end if;return result;
end $$;
revoke all on function public.pro_mutate_catalog_organization(uuid,text,text,uuid,text,integer),public.pro_catalog_organization_page(uuid,text,boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.pro_mutate_catalog_organization(uuid,text,text,uuid,text,integer),public.pro_catalog_organization_page(uuid,text,boolean,text,text,boolean) to service_role;
commit;
