-- ContrataCR Pro, database part 28 (row 33): before/after photo comparisons of a job, shown to the linked customer.
--  * The owner picks two photos (JPG) from the job files (before and after), with an optional title and caption (up to 20
--    active comparisons per job), edits them, archives and restores them; every change is an immutable history event.
--  * "Visible to the customer" is PRESENTATION only (like shared folders): it respects the "Files and photos" switch and
--    revokes no access. The customer (and the owner's "as customer" preview, which runs as the linked customer) sees it only
--    while both photos are ready, not in the trash and not individually hidden; every image read is reauthorized.
-- Owner writes are CAS (revision) with idempotent receipts. PRO_ENABLED stays false in production. Nothing is sent.
begin;
create table if not exists public.pro_work_file_comparisons(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,id uuid not null,
 before_file_id uuid not null,after_file_id uuid not null,
 title text check(title is null or (length(btrim(title)) between 1 and 120 and title !~ '[[:cntrl:]]')),
 caption text check(caption is null or (length(btrim(caption)) between 1 and 300 and caption !~ '[[:cntrl:]]')),
 client_visible boolean not null default false,archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),check(before_file_id<>after_file_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,work_id,before_file_id) references public.pro_work_files(owner_id,work_id,id),
 foreign key(owner_id,work_id,after_file_id) references public.pro_work_files(owner_id,work_id,id));
create index if not exists pro_work_file_comparisons_work on public.pro_work_file_comparisons(owner_id,work_id,archived,created_at,id);
create table if not exists public.pro_work_file_comparison_events(
 owner_id uuid not null,action_id uuid not null,comparison_id uuid not null,action text not null check(action in('create','update','visibility','archive','restore')),
 before_row jsonb,after_row jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create index if not exists pro_work_file_comparison_events_cmp on public.pro_work_file_comparison_events(owner_id,comparison_id,at);
create table if not exists public.pro_work_file_comparison_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_work_file_comparisons','pro_work_file_comparison_events','pro_work_file_comparison_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
-- The history is immutable: events are never changed or removed.
create or replace function public.pro_work_file_comparison_events_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Comparison history is immutable' using errcode='22023';end $$;
drop trigger if exists pro_work_file_comparison_events_guard on public.pro_work_file_comparison_events;
create trigger pro_work_file_comparison_events_guard before update or delete on public.pro_work_file_comparison_events for each row execute function public.pro_work_file_comparison_events_guard();

create or replace function public.pro_work_file_comparison_json(c public.pro_work_file_comparisons) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',c.id,'workId',c.work_id,'beforeFileId',c.before_file_id,'afterFileId',c.after_file_id,'title',c.title,'caption',c.caption,
  'clientVisible',c.client_visible,'archived',c.archived,'revision',c.revision,'createdAt',c.created_at,'updatedAt',c.updated_at,
  'beforeName',(select coalesce(m.display_name,w.name) from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id where w.owner_id=c.owner_id and w.id=c.before_file_id),
  'afterName',(select coalesce(m.display_name,w.name) from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id where w.owner_id=c.owner_id and w.id=c.after_file_id),
  'available',(select count(*)=2 from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
    where w.owner_id=c.owner_id and w.id in(c.before_file_id,c.after_file_id) and w.ready and w.mime_type='image/jpeg' and m.trashed_at is null)) $$;

-- Owner side: comparisons (active and archived), the job photos that can be chosen and the latest history.
create or replace function public.pro_work_file_comparisons_read(p_actor uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid comparison query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,'max',20,
  'items',coalesce((select jsonb_agg(public.pro_work_file_comparison_json(c) order by c.archived,c.created_at,c.id) from public.pro_work_file_comparisons c where c.owner_id=p_actor and c.work_id=p_work),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by lower(x.name),x.id) from(
    select w.id,coalesce(m.display_name,w.name) as name from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
    where w.owner_id=p_actor and w.work_id=p_work and w.ready and w.mime_type='image/jpeg' and m.trashed_at is null order by lower(coalesce(m.display_name,w.name)),w.id limit 300) x),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('comparisonId',e.comparison_id,'action',e.action,'at',e.at,'title',e.after_row->>'title') order by e.at desc,e.action_id) from(
    select * from public.pro_work_file_comparison_events ev where ev.owner_id=p_actor and ev.comparison_id in(select id from public.pro_work_file_comparisons where owner_id=p_actor and work_id=p_work) order by ev.at desc,ev.action_id limit 40) e),'[]'::jsonb));
end $$;

create or replace function public.pro_work_file_comparisons_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;receipt public.pro_work_file_comparison_actions;wid text;cid uuid;c public.pro_work_file_comparisons;prev jsonb;answer jsonb;
 bf uuid;af uuid;ttl text;cap text;active integer;ev text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid comparison' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from(case act
  when 'create' then array['action','actionId','afterFileId','beforeFileId','caption','title','workId']
  when 'update' then array['action','actionId','afterFileId','beforeFileId','caption','comparisonId','revision','title','workId']
  when 'visibility' then array['action','actionId','comparisonId','revision','visible','workId']
  when 'archive' then array['action','actionId','comparisonId','revision','workId']
  when 'restore' then array['action','actionId','comparisonId','revision','workId'] end) then raise exception 'Unexpected comparison fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 wid:=p_input->>'workId';if wid is null or length(wid) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Work unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-file-comparisons:'||p_actor::text||':'||wid,0));
 select * into receipt from public.pro_work_file_comparison_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 select count(*) into active from public.pro_work_file_comparisons where owner_id=p_actor and work_id=wid and not archived;
 if act in('create','update') then
  begin bf:=(p_input->>'beforeFileId')::uuid;af:=(p_input->>'afterFileId')::uuid;exception when others then raise exception 'Invalid photo' using errcode='22023';end;
  if bf=af then raise exception 'Choose two different photos' using errcode='22023',hint='pro_comparison_same';end if;
  ttl:=nullif(btrim(coalesce(p_input->>'title','')),'');cap:=nullif(btrim(coalesce(p_input->>'caption','')),'');
  if length(ttl)>120 or length(cap)>300 or ttl~'[[:cntrl:]]' or cap~'[[:cntrl:]]' then raise exception 'Invalid text' using errcode='22023';end if;
  if (select count(*) from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
   where w.owner_id=p_actor and w.work_id=wid and w.id in(bf,af) and w.ready and w.mime_type='image/jpeg' and m.trashed_at is null)<>2 then raise exception 'Photo unavailable' using errcode='22023',hint='pro_comparison_photo';end if;
 end if;
 if act='create' then
  if active>=20 then raise exception 'Comparison limit' using errcode='22023',hint='pro_comparison_limit';end if;
  cid:=gen_random_uuid();
  insert into public.pro_work_file_comparisons(owner_id,work_id,id,before_file_id,after_file_id,title,caption) values(p_actor,wid,cid,bf,af,ttl,cap) returning * into c;
  prev:=null;ev:='create';
 else
  begin cid:=(p_input->>'comparisonId')::uuid;exception when others then raise exception 'Invalid comparison' using errcode='22023';end;
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) then raise exception 'Invalid revision' using errcode='22023';end if;
  select * into c from public.pro_work_file_comparisons where owner_id=p_actor and work_id=wid and id=cid for update;
  if not found then raise exception 'Comparison unavailable' using errcode='P0002';end if;
  if c.revision<>(p_input->>'revision')::integer then raise exception 'Comparison changed' using errcode='40001';end if;
  prev:=public.pro_work_file_comparison_json(c);
  if act='update' then
   if c.archived then raise exception 'Comparison archived' using errcode='22023';end if;
   update public.pro_work_file_comparisons set before_file_id=bf,after_file_id=af,title=ttl,caption=cap,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;ev:='update';
  elsif act='visibility' then
   if jsonb_typeof(p_input->'visible') is distinct from 'boolean' then raise exception 'Invalid visibility' using errcode='22023';end if;
   if c.archived and (p_input->>'visible')::boolean then raise exception 'Comparison archived' using errcode='22023';end if;
   update public.pro_work_file_comparisons set client_visible=(p_input->>'visible')::boolean,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;ev:='visibility';
  elsif act='archive' then
   if c.archived then raise exception 'Comparison archived' using errcode='22023';end if;
   update public.pro_work_file_comparisons set archived=true,client_visible=false,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;ev:='archive';
  else
   if not c.archived then raise exception 'Comparison not archived' using errcode='22023';end if;
   if active>=20 then raise exception 'Comparison limit' using errcode='22023',hint='pro_comparison_limit';end if;
   update public.pro_work_file_comparisons set archived=false,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;ev:='restore';
  end if;
 end if;
 answer:=jsonb_build_object('action',act,'item',public.pro_work_file_comparison_json(c));
 insert into public.pro_work_file_comparison_events(owner_id,action_id,comparison_id,action,before_row,after_row) values(p_actor,aid,c.id,ev,prev,answer->'item');
 insert into public.pro_work_file_comparison_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,answer);
 return answer;
end $$;

-- Customer side (also the owner's preview, which runs as the linked customer). Same access rule as the shared folders:
-- the "Files and photos" switch must be on; a file hidden individually, in the trash or not ready removes the comparison.
create or replace function public.pro_work_file_comparisons_client_ok(p_owner uuid,p_work text,c public.pro_work_file_comparisons) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select c.client_visible and not c.archived and public.pro_wfv_client_files_visible(p_owner,p_work)
  and (select count(*)=2 from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
    where w.owner_id=c.owner_id and w.work_id=c.work_id and w.id in(c.before_file_id,c.after_file_id) and w.ready and w.mime_type='image/jpeg' and m.trashed_at is null)
  and not exists(select 1 from public.pro_client_hidden_documents h where h.owner_id=c.owner_id and h.work_id=c.work_id and h.kind='file' and h.item_id in(c.before_file_id::text,c.after_file_id::text)) $$;
create or replace function public.pro_work_file_comparisons_client_read(p_actor uuid,p_request uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'caption',c.caption,'updatedAt',c.updated_at,
   'before',(select jsonb_build_object('name',coalesce(m.display_name,w.name),'sizeBytes',w.size_bytes) from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id where w.owner_id=owner and w.id=c.before_file_id),
   'after',(select jsonb_build_object('name',coalesce(m.display_name,w.name),'sizeBytes',w.size_bytes) from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id where w.owner_id=owner and w.id=c.after_file_id)
  ) order by c.created_at,c.id) from public.pro_work_file_comparisons c where c.owner_id=owner and c.work_id=wid and public.pro_work_file_comparisons_client_ok(owner,wid,c)),'[]'::jsonb));
end $$;
create or replace function public.pro_work_file_comparison_client_download(p_actor uuid,p_request uuid,p_comparison uuid,p_side text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;c public.pro_work_file_comparisons;w public.pro_work_files;m public.pro_work_file_meta;fid uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_side not in('before','after') then raise exception 'Invalid side' using errcode='22023';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select * into c from public.pro_work_file_comparisons where owner_id=owner and work_id=wid and id=p_comparison;
 if not found or not public.pro_work_file_comparisons_client_ok(owner,wid,c) then return null;end if;
 fid:=case p_side when 'before' then c.before_file_id else c.after_file_id end;
 select * into w from public.pro_work_files where owner_id=owner and work_id=wid and id=fid and ready;if not found then return null;end if;
 select * into m from public.pro_work_file_meta where owner_id=owner and file_id=fid;
 return jsonb_build_object('objectPath',w.object_path,'name',w.name,'displayName',coalesce(m.display_name,w.name),'mimeType',w.mime_type,'sizeBytes',w.size_bytes,'sha256',w.sha256);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_file_comparison_events_guard','pro_work_file_comparison_json','pro_work_file_comparisons_read','pro_work_file_comparisons_mutate','pro_work_file_comparisons_client_ok','pro_work_file_comparisons_client_read','pro_work_file_comparison_client_download') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
