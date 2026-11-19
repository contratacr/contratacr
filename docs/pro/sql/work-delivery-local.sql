-- Pro local only. Additive private draft + immutable explicitly shared work report.
begin;
create table if not exists public.pro_work_delivery_drafts(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 revision integer not null default 0 check(revision>=0),content jsonb not null default '{"summary":"","checklist":[],"recommendations":"","photoIds":[]}',
 internal_note text not null default '' check(length(internal_note)<=2000),updated_at timestamptz not null default now(),
 primary key(owner_id,work_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_delivery_photos(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 object_path text not null unique,name text not null check(length(name) between 1 and 160),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes between 1 and 2097152),ready boolean not null default false,created_at timestamptz not null default now(),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_delivery_versions(
 owner_id uuid not null,work_id text not null,version integer not null check(version>0),client_user_id uuid not null references public.profiles(id) on delete cascade,
 content jsonb not null,service text not null,completed_at text not null,published_at timestamptz not null default now(),acknowledged_at timestamptz,
 primary key(owner_id,work_id,version),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_delivery_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create index if not exists pro_work_delivery_client on public.pro_work_delivery_versions(client_user_id,owner_id,work_id,version desc);
create or replace function public.pro_work_delivery_read(p_actor uuid,p_work text default null,p_request uuid default null,p_after integer default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;d pro_work_delivery_drafts;items jsonb;photos jsonb;next_key integer;is_owner boolean;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is not null then select owner_id,work_id into owner,wid from pro_appointment_requests where id=p_request and p_actor in(owner_id,client_user_id) and work_id is not null;
 else owner:=p_actor;wid:=p_work;end if;
 if owner is null or wid is null or not exists(select 1 from pro_work where user_id=owner and id=wid) then return null;end if;
 is_owner:=owner=p_actor;
 select * into d from pro_work_delivery_drafts where owner_id=owner and work_id=wid;
 select coalesce(jsonb_agg(to_jsonb(v)-'owner_id'-'work_id'-'client_user_id' order by version desc),'[]') into items from (
 select version,content,service,completed_at as "completedAt",published_at as "publishedAt",acknowledged_at as "acknowledgedAt"
 from pro_work_delivery_versions where owner_id=owner and work_id=wid and (is_owner or client_user_id=p_actor) and (p_after is null or version<p_after) order by version desc limit 20) v;
 if jsonb_array_length(items)=20 and exists(select 1 from pro_work_delivery_versions where owner_id=owner and work_id=wid and (is_owner or client_user_id=p_actor) and version<(items->19->>'version')::integer) then next_key:=(items->19->>'version')::integer;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'ready',p.ready) order by p.created_at),'[]') into photos from pro_work_delivery_photos p where p.owner_id=owner and p.work_id=wid and (is_owner or p.ready and exists(select 1 from pro_work_delivery_versions v where v.owner_id=owner and v.work_id=wid and v.client_user_id=p_actor and v.content->'photoIds' ? p.id::text));
 return jsonb_build_object('side',case when is_owner then 'provider' else 'client' end,'workId',wid,'canPublish',is_owner and exists(select 1 from pro_work w join pro_appointment_requests r on r.owner_id=w.user_id and r.work_id=w.id where w.user_id=owner and w.id=wid and w.stage='completed' and not w.cancelled),'revision',case when is_owner then coalesce(d.revision,0) else 0 end,'draft',case when is_owner then coalesce(d.content,'{"summary":"","checklist":[],"recommendations":"","photoIds":[]}') else null end,'internalNote',case when is_owner then coalesce(d.internal_note,'') else null end,'photos',photos,'versions',items,'nextCursor',next_key);
end $$;
create or replace function public.pro_work_delivery_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid:=(p_input->>'actionId')::uuid;wid text:=p_input->>'workId';owner uuid:=p_actor;prior pro_work_delivery_actions;d pro_work_delivery_drafts;w pro_work;client uuid;v integer;result jsonb;c jsonb;keys text[];photo pro_work_delivery_photos;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or aid is null or act is null then raise exception 'Invalid input' using errcode='22023';end if;
 if act='acknowledge' then select owner_id,work_id into owner,wid from pro_appointment_requests where id=(p_input->>'requestId')::uuid and client_user_id=p_actor and work_id is not null;end if;
 if owner is null or wid is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_work_delivery_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
 select * into w from pro_work where user_id=owner and id=wid;if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if act='acknowledge' then
  select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;if keys<>array['action','actionId','requestId','version'] then raise exception 'Invalid input' using errcode='22023';end if;
  update pro_work_delivery_versions set acknowledged_at=coalesce(acknowledged_at,now()) where owner_id=owner and work_id=wid and version=(p_input->>'version')::integer and client_user_id=p_actor;
  if not found then raise exception 'Version unavailable' using errcode='42501';end if;result:=jsonb_build_object('workId',wid,'version',(p_input->>'version')::integer,'acknowledged',true);
 else
  if not pro_appointment_enabled(owner) then raise exception 'Pro required' using errcode='42501';end if;
  insert into pro_work_delivery_drafts(owner_id,work_id) values(owner,wid) on conflict do nothing;
  select * into d from pro_work_delivery_drafts where owner_id=owner and work_id=wid for update;
  if act='photo' then
   select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;if keys<>array['action','actionId','name','sha256','sizeBytes','workId'] then raise exception 'Invalid photo' using errcode='22023';end if;
   if (select count(*) from pro_work_delivery_photos where owner_id=owner and work_id=wid)>=6 then raise exception 'Photo limit' using errcode='54000';end if;
   insert into pro_work_delivery_photos(id,owner_id,work_id,object_path,name,sha256,size_bytes) values(aid,owner,wid,owner::text||'/'||aid::text||'.jpg',p_input->>'name',p_input->>'sha256',(p_input->>'sizeBytes')::integer) returning * into photo;
   result:=jsonb_build_object('id',photo.id,'path',photo.object_path,'ready',photo.ready);
  else
   if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]+$' then raise exception 'Invalid revision' using errcode='22023';end if;
   if d.revision<>(p_input->>'revision')::integer then raise exception 'Changed revision' using errcode='40001';end if;
   if act='save' then
    select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;if keys<>array['action','actionId','content','internalNote','revision','workId'] then raise exception 'Invalid save' using errcode='22023';end if;
    c:=p_input->'content';if jsonb_typeof(c)<>'object' or (select count(*) from jsonb_object_keys(c))<>4 or not(c ?& array['summary','checklist','recommendations','photoIds']) or jsonb_typeof(c->'summary')<>'string' or length(c->>'summary')>2000 or jsonb_typeof(c->'recommendations')<>'string' or length(c->>'recommendations')>2000 or jsonb_typeof(c->'checklist')<>'array' or jsonb_array_length(c->'checklist')>20 or jsonb_typeof(c->'photoIds')<>'array' or jsonb_array_length(c->'photoIds')>6 or jsonb_typeof(p_input->'internalNote')<>'string' or length(p_input->>'internalNote')>2000 then raise exception 'Invalid content' using errcode='22023';end if;
    if exists(select 1 from jsonb_array_elements(c->'checklist') e where jsonb_typeof(e)<>'object' or (select count(*) from jsonb_object_keys(e))<>2 or not(e ?& array['label','done']) or jsonb_typeof(e->'label') is distinct from 'string' or length(btrim(e->>'label')) not between 1 and 160 or jsonb_typeof(e->'done')<>'boolean') then raise exception 'Invalid checklist' using errcode='22023';end if;
    if exists(select 1 from jsonb_array_elements_text(c->'photoIds') x(value) where not exists(select 1 from pro_work_delivery_photos p where p.id::text=x.value and p.owner_id=owner and p.work_id=wid and p.ready)) or (select count(distinct x.value) from jsonb_array_elements_text(c->'photoIds') x(value))<>jsonb_array_length(c->'photoIds') then raise exception 'Invalid photos' using errcode='42501';end if;
    update pro_work_delivery_drafts set content=c,internal_note=p_input->>'internalNote',revision=revision+1,updated_at=now() where owner_id=owner and work_id=wid returning revision into v;
   elsif act='publish' then
    select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;if keys<>array['action','actionId','revision','workId'] then raise exception 'Invalid publish' using errcode='22023';end if;
    if w.stage<>'completed' or w.cancelled or length(btrim(d.content->>'summary'))=0 then raise exception 'Complete the job and report first' using errcode='22023';end if;
    select client_user_id into client from pro_appointment_requests where owner_id=owner and work_id=wid;
    if client is null then raise exception 'No linked client account' using errcode='42501';end if;
    select coalesce(max(version),0)+1 into v from pro_work_delivery_versions where owner_id=owner and work_id=wid;
    if v>100 then raise exception 'Version limit' using errcode='54000';end if;
    insert into pro_work_delivery_versions(owner_id,work_id,version,client_user_id,content,service,completed_at) values(owner,wid,v,client,d.content,w.service,w."end");
    update pro_work_delivery_drafts set revision=revision+1,updated_at=now() where owner_id=owner and work_id=wid returning revision into v;
   else raise exception 'Invalid operation' using errcode='22023';end if;
   result:=jsonb_build_object('workId',wid,'revision',v);
  end if;
 end if;
 insert into pro_work_delivery_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);return result;
end $$;
create or replace function public.pro_work_delivery_photo_ready(p_actor uuid,p_id uuid) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not pro_appointment_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 update pro_work_delivery_photos set ready=true where id=p_id and owner_id=p_actor;return found;
end $$;
create or replace function public.pro_work_delivery_photo_path(p_actor uuid,p_id uuid) returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select p.object_path from pro_work_delivery_photos p where p.id=p_id and p.ready and exists(select 1 from profiles a where a.id=p_actor and not coalesce(a.is_disabled,false)) and (p.owner_id=p_actor or exists(select 1 from pro_work_delivery_versions v where v.owner_id=p.owner_id and v.work_id=p.work_id and v.client_user_id=p_actor and v.content->'photoIds' ? p.id::text));
$$;
create or replace function public.pro_work_delivery_version_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-'acknowledged_at') is distinct from (to_jsonb(old)-'acknowledged_at') or old.acknowledged_at is not null and new.acknowledged_at is distinct from old.acknowledged_at then raise exception 'Published report is immutable' using errcode='23514';end if;return new;
end $$;
drop trigger if exists pro_work_delivery_version_guard on public.pro_work_delivery_versions;
create trigger pro_work_delivery_version_guard before update on public.pro_work_delivery_versions for each row execute function public.pro_work_delivery_version_guard();
revoke all on function public.pro_work_delivery_version_guard() from public,anon,authenticated;
alter table public.pro_work_delivery_drafts enable row level security;alter table public.pro_work_delivery_photos enable row level security;alter table public.pro_work_delivery_versions enable row level security;alter table public.pro_work_delivery_actions enable row level security;
revoke all on public.pro_work_delivery_drafts,public.pro_work_delivery_photos,public.pro_work_delivery_versions,public.pro_work_delivery_actions from anon,authenticated;
grant all on public.pro_work_delivery_drafts,public.pro_work_delivery_photos,public.pro_work_delivery_versions,public.pro_work_delivery_actions to service_role;
revoke all on function public.pro_work_delivery_read(uuid,text,uuid,integer),public.pro_work_delivery_mutate(uuid,jsonb),public.pro_work_delivery_photo_ready(uuid,uuid),public.pro_work_delivery_photo_path(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_work_delivery_read(uuid,text,uuid,integer),public.pro_work_delivery_mutate(uuid,jsonb),public.pro_work_delivery_photo_ready(uuid,uuid),public.pro_work_delivery_photo_path(uuid,uuid) to service_role;
do $$begin if to_regclass('storage.buckets') is not null then insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-work-delivery','pro-work-delivery',false,2097152,array['image/jpeg']) on conflict(id) do nothing;if exists(select 1 from storage.buckets where id='pro-work-delivery' and public) then raise exception 'Work delivery bucket must be private';end if;end if;end $$;
-- Restrictive policy protects this bucket even if another permissive storage policy is broad.
do $$begin if to_regclass('storage.objects') is not null then
 execute 'drop policy if exists pro_work_delivery_no_direct on storage.objects';
 execute 'create policy pro_work_delivery_no_direct on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''pro-work-delivery'') with check (bucket_id <> ''pro-work-delivery'')';
end if;end $$;
commit;
