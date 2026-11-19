-- LOCAL PRO ONLY. Round 6D (2026-11-13): product clipper «Agregar desde enlace» (row 60).
-- * Each pasted link becomes a CLIP with the metadata the reader returned (mock fixture locally; the real adapter
--   reads only public Open Graph / schema.org data and respects robots.txt). The clip is immutable and never
--   writes the catalog: the owner reviews/edits the values and saves the product with the existing catalog
--   writer; only then the clip is marked «saved» with the product id (verified), or «discarded». Once.
-- Tables: RLS on, service_role only; functions security invoker.
begin;
create table if not exists public.pro_catalog_clips(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,action_id uuid not null,
 url text not null check(length(url) between 10 and 2000 and url~'^https://'),
 host text not null check(host~'^[a-z0-9.-]{3,253}$'),
 source text not null check(source in('app','extension')),
 mode text not null check(mode in('mock','sandbox','production')),
 metadata jsonb not null check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
 status text not null default 'review' check(status in('review','saved','discarded')),
 product_id text,reviewed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,action_id),
 check((status='review')=(reviewed_at is null)),check((status='saved')=(product_id is not null))
);
create index if not exists pro_catalog_clips_recent on public.pro_catalog_clips(owner_id,created_at desc);
create or replace function public.pro_clip_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.owner_id,new.id,new.action_id,new.url,new.host,new.source,new.mode,new.metadata,new.created_at) is distinct from (old.owner_id,old.id,old.action_id,old.url,old.host,old.source,old.mode,old.metadata,old.created_at) then
  raise exception 'A clip is immutable' using errcode='23514';end if;
 if old.status<>'review' then raise exception 'The review is recorded once' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_clip_guard on public.pro_catalog_clips;
create trigger pro_clip_guard before update on public.pro_catalog_clips for each row execute function public.pro_clip_guard();
create or replace function public.pro_clip_json(c public.pro_catalog_clips) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',c.id,'url',c.url,'host',c.host,'source',c.source,'mode',c.mode,'metadata',c.metadata,'status',c.status,'productId',c.product_id,'reviewedAt',c.reviewed_at,'createdAt',c.created_at) $$;
create or replace function public.pro_clip_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object('clips',coalesce((select jsonb_agg(public.pro_clip_json(c) order by c.created_at desc) from (select * from public.pro_catalog_clips where owner_id=p_actor order by created_at desc limit 30) c),'[]'));
end $$;
create or replace function public.pro_clip_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_catalog_clips;aid uuid;
begin
 perform public.pro_mkt_owner(p_actor);
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-clip:'||p_actor::text,0));
 select * into c from public.pro_catalog_clips where owner_id=p_actor and action_id=aid;
 if found then if c.url<>p_input->>'url' then raise exception 'Action id reused' using errcode='22023';end if;return public.pro_clip_json(c);end if;
 if (select count(*) from public.pro_catalog_clips where owner_id=p_actor and created_at>now()-interval '1 day')>=200 then raise exception 'Daily clip limit reached' using errcode='54000';end if;
 insert into public.pro_catalog_clips(owner_id,id,action_id,url,host,source,mode,metadata) values(p_actor,(p_input->>'id')::uuid,aid,p_input->>'url',p_input->>'host',coalesce(p_input->>'source','app'),p_input->>'mode',p_input->'metadata') returning * into c;
 return public.pro_clip_json(c);
end $$;
create or replace function public.pro_clip_review(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_catalog_clips;
begin
 perform public.pro_mkt_owner(p_actor);
 select * into c from public.pro_catalog_clips where owner_id=p_actor and id=(p_input->>'id')::uuid for update;
 if not found then raise exception 'Clip unavailable' using errcode='P0002';end if;
 if c.status<>'review' then
  if c.status=p_input->>'decision' and c.product_id is not distinct from p_input->>'productId' then return public.pro_clip_json(c);end if;
  raise exception 'Already reviewed' using errcode='40001';end if;
 if p_input->>'decision'='saved' then
  if not exists(select 1 from public.pro_products where user_id=p_actor and id=p_input->>'productId') then raise exception 'Save the product in the catalog first' using errcode='40001';end if;
  update public.pro_catalog_clips set status='saved',product_id=p_input->>'productId',reviewed_at=clock_timestamp() where owner_id=p_actor and id=c.id returning * into c;
 elsif p_input->>'decision'='discarded' then
  update public.pro_catalog_clips set status='discarded',reviewed_at=clock_timestamp() where owner_id=p_actor and id=c.id returning * into c;
 else raise exception 'Invalid decision' using errcode='22023';end if;
 return public.pro_clip_json(c);
end $$;
alter table public.pro_catalog_clips enable row level security;
revoke all on public.pro_catalog_clips from public,anon,authenticated,service_role;
grant select,insert,update on public.pro_catalog_clips to service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_clip\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_clip_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
