-- LOCAL PRO ONLY. Ronda F2-B (2026-11-19), visual proposal (Houzz Pro parity row 39).
-- A private estimate gets a proposal design: cover title, introduction, closing words and photos taken from
-- the company's EXISTING files (Archivos de la empresa) or job files (JPEG only): one cover photo, up to six per
-- section and up to six per line. Nothing is uploaded or copied here; the design only references files.
-- The design is applied explicitly to a shared version ("publish"): an immutable snapshot per publication and
-- sequence. The customer sees the last snapshot of the version together with the existing per-line approval
-- (quote-line-decisions); once the version is accepted, declined, withdrawn or superseded the design is frozen.
-- Photos are served only to the owner or the version's recipient and only if listed in that snapshot; the
-- route verifies size and SHA-256 of the stored bytes.
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, idempotent actionId receipts, immutable
-- history and snapshots. Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_estimate_proposals(
 owner_id uuid not null,estimate_id uuid not null,revision integer not null check(revision between 1 and 2147483646),
 cover_title text not null default '' check(length(cover_title)<=120 and cover_title!~'[[:cntrl:]]'),
 intro text not null default '' check(length(intro)<=4000),closing text not null default '' check(length(closing)<=2000),
 updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,estimate_id),
 foreign key(owner_id,estimate_id) references public.pro_private_estimates(owner_id,id) on delete cascade);
create table if not exists public.pro_estimate_proposal_images(
 owner_id uuid not null,estimate_id uuid not null,id uuid not null,target text not null check(target in('cover','section','line')),
 target_key text not null check(length(target_key)<=80),position integer not null check(position between 1 and 1000),
 source text not null check(source in('company','work')),file_id uuid not null,caption text not null default '' check(length(caption)<=160 and caption!~'[[:cntrl:]]'),
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,estimate_id,id),check((target='cover')=(target_key='')),
 foreign key(owner_id,estimate_id) references public.pro_estimate_proposals(owner_id,estimate_id) on delete cascade);
create table if not exists public.pro_estimate_proposal_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_estimate_proposal_history(
 owner_id uuid not null,estimate_id uuid not null,action_id uuid not null,action text not null check(action in('save','add_image','remove_image','move_image','publish')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id),
 foreign key(owner_id,estimate_id) references public.pro_private_estimates(owner_id,id) on delete cascade);
create table if not exists public.pro_estimate_proposal_snapshots(
 publication_id uuid not null references public.pro_private_estimate_publications(id) on delete cascade,seq integer not null check(seq between 1 and 1000),
 owner_id uuid not null,proposal_revision integer not null,content jsonb not null check(jsonb_typeof(content)='object'),
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),at timestamptz not null default clock_timestamp(),primary key(publication_id,seq));

do $$declare t text;begin
 foreach t in array array['pro_estimate_proposals','pro_estimate_proposal_images','pro_estimate_proposal_actions','pro_estimate_proposal_history','pro_estimate_proposal_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
create or replace function public.pro_estimate_proposal_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Immutable record' using errcode='23514';end $$;
do $$declare t text;begin
 foreach t in array array['pro_estimate_proposal_actions','pro_estimate_proposal_history','pro_estimate_proposal_snapshots'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_estimate_proposal_immutable()',t||'_immutable',t);
 end loop;
end $$;

-- ===== Helpers =====
-- File reference of an eligible photo (JPEG, ready, not archived), or null.
create or replace function public.pro_estimate_proposal_file(p_owner uuid,p_source text,p_file uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select case p_source
  when 'company' then(select jsonb_build_object('bucket','pro-company-files','objectPath',f.object_path,'sha256',f.sha256,'sizeBytes',f.size_bytes,'name',f.name,'place',null) from public.pro_company_files f
   where f.owner_id=p_owner and f.id=p_file and f.mime_type='image/jpeg' and f.ready and not f.archived)
  when 'work' then(select jsonb_build_object('bucket','pro-work-files','objectPath',f.object_path,'sha256',f.sha256,'sizeBytes',f.size_bytes,'name',f.name,'place',w.service) from public.pro_work_files f
   left join public.pro_work w on w.user_id=f.owner_id and w.id=f.work_id where f.owner_id=p_owner and f.id=p_file and f.mime_type='image/jpeg' and f.ready)
 end $$;
create or replace function public.pro_estimate_proposal_owner(p_owner uuid,p_estimate uuid) returns void language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_private_estimates where owner_id=p_owner and id=p_estimate) then raise exception 'Estimate unavailable' using errcode='P0002';end if;
end $$;
create or replace function public.pro_estimate_proposal_json(p_owner uuid,p_estimate uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('estimateId',p_estimate,'revision',coalesce(p.revision,0),'coverTitle',coalesce(p.cover_title,''),'intro',coalesce(p.intro,''),'closing',coalesce(p.closing,''),
  'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'target',i.target,'targetKey',i.target_key,'position',i.position,'source',i.source,'fileId',i.file_id,'caption',i.caption,
     'name',coalesce(public.pro_estimate_proposal_file(p_owner,i.source,i.file_id)->>'name',''),'available',public.pro_estimate_proposal_file(p_owner,i.source,i.file_id) is not null)
    order by case i.target when 'cover' then 0 when 'section' then 1 else 2 end,i.target_key,i.position) from public.pro_estimate_proposal_images i where i.owner_id=p_owner and i.estimate_id=p_estimate),'[]'::jsonb))
 from(select 1) one left join public.pro_estimate_proposals p on p.owner_id=p_owner and p.estimate_id=p_estimate $$;

-- ===== Owner reads =====
create or replace function public.pro_estimate_proposal_read(p_owner uuid,p_query jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;keys text[];eid uuid;q text;answer jsonb;
begin
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid proposal query' using errcode='22023';end if;
 v:=p_query->>'view';select array_agg(x order by x) into keys from jsonb_object_keys(p_query) x;
 if keys is distinct from(case v when 'design' then array['estimateId','view'] when 'files' then array['estimateId','query','view'] end) then raise exception 'Unexpected proposal query' using errcode='22023';end if;
 begin eid:=(p_query->>'estimateId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 perform public.pro_estimate_proposal_owner(p_owner,eid);
 if v='files' then
  q:=lower(btrim(coalesce(p_query->>'query','')));if length(q)>80 then raise exception 'Invalid search' using errcode='22023';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(x.j order by x.created desc) from(
   select jsonb_build_object('source','company','fileId',f.id,'name',f.name,'place',null) j,f.created_at as created from public.pro_company_files f where f.owner_id=p_owner and f.mime_type='image/jpeg' and f.ready and not f.archived and(q='' or position(q in lower(f.name))>0)
   union all select jsonb_build_object('source','work','fileId',f.id,'name',f.name,'place',w.service),f.created_at from public.pro_work_files f left join public.pro_work w on w.user_id=f.owner_id and w.id=f.work_id
    where f.owner_id=p_owner and f.mime_type='image/jpeg' and f.ready and(q='' or position(q in lower(f.name||' '||coalesce(w.service,'')))>0)
   order by 2 desc limit 60) x),'[]'::jsonb));
 end if;
 answer:=public.pro_estimate_proposal_json(p_owner,eid)||jsonb_build_object(
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'description',coalesce(i.content->>'description',''),'group',case when jsonb_typeof(i.content->'group')='string' and btrim(i.content->>'group')<>'' then i.content->>'group' end) order by i.position)
   from public.pro_private_estimate_items i where i.owner_id=p_owner and i.estimate_id=eid),'[]'::jsonb),
  'publications',coalesce((select jsonb_agg(jsonb_build_object('publicationId',p.id,'version',p.version,'status',s.status,
    'appliedSeq',(select max(seq) from public.pro_estimate_proposal_snapshots x where x.publication_id=p.id),
    'appliedRevision',(select x.proposal_revision from public.pro_estimate_proposal_snapshots x where x.publication_id=p.id order by x.seq desc limit 1),
    'open',s.status in('awaiting_claim','shared','changes_requested')) order by p.version desc)
   from public.pro_private_estimate_publications p join public.pro_private_estimate_publication_states s on s.publication_id=p.id where p.owner_id=p_owner and p.estimate_id=eid),'[]'::jsonb));
 return answer;
end $$;

-- ===== Owner writes =====
create or replace function public.pro_estimate_proposal_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;eid uuid;receipt public.pro_estimate_proposal_actions;cur integer;before_json jsonb;answer jsonb;img uuid;tgt text;tkey text;src text;fid uuid;pid uuid;
 pub public.pro_private_estimate_publications;st public.pro_private_estimate_publication_states;content jsonb;seqn integer;mv record;other record;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid proposal action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from(case act when 'save' then array['action','actionId','closing','coverTitle','estimateId','intro','revision']
  when 'add_image' then array['action','actionId','caption','estimateId','fileId','imageId','revision','source','target','targetKey']
  when 'remove_image' then array['action','actionId','estimateId','imageId','revision']
  when 'move_image' then array['action','actionId','direction','estimateId','imageId','revision']
  when 'publish' then array['action','actionId','estimateId','publicationId','revision'] end)
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483645 then raise exception 'Unexpected proposal fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;eid:=(p_input->>'estimateId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 perform public.pro_estimate_proposal_owner(p_owner,eid);
 perform pg_advisory_xact_lock(hashtextextended('pro-estimate-proposal:'||p_owner::text||':'||eid::text,0));
 select * into receipt from public.pro_estimate_proposal_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 cur:=coalesce((select revision from public.pro_estimate_proposals where owner_id=p_owner and estimate_id=eid),0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Proposal changed' using errcode='40001';end if;
 before_json:=public.pro_estimate_proposal_json(p_owner,eid);
 if act='save' then
  if jsonb_typeof(p_input->'coverTitle') is distinct from 'string' or jsonb_typeof(p_input->'intro') is distinct from 'string' or jsonb_typeof(p_input->'closing') is distinct from 'string'
   or length(btrim(p_input->>'coverTitle'))>120 or btrim(p_input->>'coverTitle')~'[[:cntrl:]]' or length(p_input->>'intro')>4000 or length(p_input->>'closing')>2000
   or(p_input->>'intro')~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' or(p_input->>'closing')~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid proposal text' using errcode='22023';end if;
  insert into public.pro_estimate_proposals(owner_id,estimate_id,revision,cover_title,intro,closing) values(p_owner,eid,cur+1,btrim(p_input->>'coverTitle'),btrim(p_input->>'intro'),btrim(p_input->>'closing'))
  on conflict(owner_id,estimate_id) do update set revision=excluded.revision,cover_title=excluded.cover_title,intro=excluded.intro,closing=excluded.closing,updated_at=clock_timestamp();
 elsif act='add_image' then
  begin img:=(p_input->>'imageId')::uuid;fid:=(p_input->>'fileId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
  tgt:=p_input->>'target';tkey:=coalesce(p_input->>'targetKey','');src:=p_input->>'source';
  if tgt not in('cover','section','line') or src not in('company','work') or jsonb_typeof(p_input->'targetKey') is distinct from 'string' or jsonb_typeof(p_input->'caption') is distinct from 'string'
   or length(btrim(p_input->>'caption'))>160 or btrim(p_input->>'caption')~'[[:cntrl:]]' or(tgt='cover')<>(tkey='') then raise exception 'Invalid proposal photo' using errcode='22023';end if;
  if tgt='line' and not exists(select 1 from public.pro_private_estimate_items i where i.owner_id=p_owner and i.estimate_id=eid and i.id::text=tkey) then raise exception 'Line unavailable' using errcode='P0002';end if;
  if tgt='section' and not exists(select 1 from public.pro_private_estimate_items i where i.owner_id=p_owner and i.estimate_id=eid and btrim(i.content->>'group')<>'' and i.content->>'group'=tkey) then raise exception 'Section unavailable' using errcode='P0002';end if;
  if public.pro_estimate_proposal_file(p_owner,src,fid) is null then raise exception 'Photo unavailable' using errcode='P0002';end if;
  if exists(select 1 from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and id=img) then raise exception 'Photo already added' using errcode='23505';end if;
  if(select count(*) from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and target=tgt and target_key=tkey)>=(case when tgt='cover' then 1 else 6 end)
   or(select count(*) from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid)>=60 then raise exception 'Too many photos' using errcode='22023',hint='pro_proposal_photo_limit';end if;
  insert into public.pro_estimate_proposals(owner_id,estimate_id,revision) values(p_owner,eid,cur+1) on conflict(owner_id,estimate_id) do update set revision=excluded.revision,updated_at=clock_timestamp();
  insert into public.pro_estimate_proposal_images(owner_id,estimate_id,id,target,target_key,position,source,file_id,caption)
  values(p_owner,eid,img,tgt,tkey,coalesce((select max(position) from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and target=tgt and target_key=tkey),0)+1,src,fid,btrim(p_input->>'caption'));
 elsif act in('remove_image','move_image') then
  begin img:=(p_input->>'imageId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
  select * into mv from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and id=img;if mv.id is null then raise exception 'Photo unavailable' using errcode='P0002';end if;
  if act='remove_image' then delete from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and id=img;
  else
   if jsonb_typeof(p_input->'direction') is distinct from 'number' or(p_input->>'direction') not in('-1','1') then raise exception 'Invalid direction' using errcode='22023';end if;
   select * into other from public.pro_estimate_proposal_images where owner_id=p_owner and estimate_id=eid and target=mv.target and target_key=mv.target_key
    and case when p_input->>'direction'='1' then position>mv.position else position<mv.position end order by case when p_input->>'direction'='1' then position else -position end limit 1;
   if other.id is null then raise exception 'Nothing to move' using errcode='22023';end if;
   update public.pro_estimate_proposal_images set position=1000 where owner_id=p_owner and estimate_id=eid and id=mv.id;
   update public.pro_estimate_proposal_images set position=mv.position where owner_id=p_owner and estimate_id=eid and id=other.id;
   update public.pro_estimate_proposal_images set position=other.position where owner_id=p_owner and estimate_id=eid and id=mv.id;
  end if;
  update public.pro_estimate_proposals set revision=cur+1,updated_at=clock_timestamp() where owner_id=p_owner and estimate_id=eid;
 else -- publish: freeze the current design on an open shared version of this estimate
  begin pid:=(p_input->>'publicationId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
  select * into pub from public.pro_private_estimate_publications where id=pid and owner_id=p_owner and estimate_id=eid;if pub.id is null then raise exception 'Version unavailable' using errcode='P0002';end if;
  select * into st from public.pro_private_estimate_publication_states where publication_id=pid for update;
  if st.status not in('awaiting_claim','shared','changes_requested') then raise exception 'Version closed' using errcode='40001';end if;
  if cur=0 then raise exception 'Design the proposal first' using errcode='22023';end if;
  content:=jsonb_build_object('coverTitle',(select cover_title from public.pro_estimate_proposals where owner_id=p_owner and estimate_id=eid),
   'intro',(select intro from public.pro_estimate_proposals where owner_id=p_owner and estimate_id=eid),'closing',(select closing from public.pro_estimate_proposals where owner_id=p_owner and estimate_id=eid),
   'images',coalesce((select jsonb_agg(jsonb_build_object('imageId',i.id,'target',i.target,'targetKey',i.target_key,'caption',i.caption,'source',i.source,'fileId',i.file_id)||public.pro_estimate_proposal_file(p_owner,i.source,i.file_id)
     order by case i.target when 'cover' then 0 when 'section' then 1 else 2 end,i.target_key,i.position)
    from public.pro_estimate_proposal_images i where i.owner_id=p_owner and i.estimate_id=eid and public.pro_estimate_proposal_file(p_owner,i.source,i.file_id) is not null
     and(i.target='cover' or i.target='line' and exists(select 1 from jsonb_array_elements(coalesce(pub.content->'lines','[]'::jsonb)) l where l->>'id'=i.target_key)
      or i.target='section' and exists(select 1 from jsonb_array_elements(coalesce(pub.content->'lines','[]'::jsonb)) l where l->>'group'=i.target_key))),'[]'::jsonb));
  seqn:=coalesce((select max(seq) from public.pro_estimate_proposal_snapshots where publication_id=pid),0)+1;
  insert into public.pro_estimate_proposal_snapshots(publication_id,seq,owner_id,proposal_revision,content,content_hash) values(pid,seqn,p_owner,cur,content,encode(sha256(convert_to(content::text,'UTF8')),'hex'));
  answer:=jsonb_build_object('action','publish','revision',cur,'publicationId',pid,'seq',seqn,'proposal',public.pro_estimate_proposal_json(p_owner,eid));
 end if;
 answer:=coalesce(answer,jsonb_build_object('action',act,'revision',cur+1,'proposal',public.pro_estimate_proposal_json(p_owner,eid)));
 insert into public.pro_estimate_proposal_history(owner_id,estimate_id,action_id,action,before_value,after_value) values(p_owner,eid,aid,act,before_json,answer->'proposal'||case when act='publish' then jsonb_build_object('publicationId',pid,'seq',seqn) else '{}'::jsonb end);
 insert into public.pro_estimate_proposal_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- ===== Shared version (owner or recipient) =====
create or replace function public.pro_estimate_proposal_publication_read(p_actor uuid,p_publication uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare side text;snap public.pro_estimate_proposal_snapshots;
begin
 side:=public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 select * into snap from public.pro_estimate_proposal_snapshots where publication_id=p_publication order by seq desc limit 1;
 if snap.publication_id is null then return jsonb_build_object('publicationId',p_publication,'side',side,'proposal',null);end if;
 return jsonb_build_object('publicationId',p_publication,'side',side,'proposal',jsonb_build_object('seq',snap.seq,'at',snap.at,'coverTitle',snap.content->>'coverTitle','intro',snap.content->>'intro','closing',snap.content->>'closing',
  'images',coalesce((select jsonb_agg(jsonb_build_object('imageId',x->>'imageId','target',x->>'target','targetKey',x->>'targetKey','caption',x->>'caption')) from jsonb_array_elements(snap.content->'images') x),'[]'::jsonb)));
end $$;
create or replace function public.pro_estimate_proposal_image(p_actor uuid,p_publication uuid,p_image uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare snap public.pro_estimate_proposal_snapshots;x jsonb;
begin
 perform public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 select * into snap from public.pro_estimate_proposal_snapshots where publication_id=p_publication order by seq desc limit 1;
 select e into x from jsonb_array_elements(coalesce(snap.content->'images','[]'::jsonb)) e where e->>'imageId'=p_image::text;
 if x is null then return null;end if;
 return jsonb_build_object('bucket',x->>'bucket','objectPath',x->>'objectPath','sha256',x->>'sha256','sizeBytes',(x->>'sizeBytes')::bigint);
end $$;
-- Owner thumbnails while designing (current file, not a snapshot).
create or replace function public.pro_estimate_proposal_draft_image(p_owner uuid,p_estimate uuid,p_source text,p_file uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ref jsonb;
begin
 perform public.pro_estimate_proposal_owner(p_owner,p_estimate);
 if p_source not in('company','work') then raise exception 'Invalid source' using errcode='22023';end if;
 ref:=public.pro_estimate_proposal_file(p_owner,p_source,p_file);if ref is null then return null;end if;
 return jsonb_build_object('bucket',ref->>'bucket','objectPath',ref->>'objectPath','sha256',ref->>'sha256','sizeBytes',(ref->>'sizeBytes')::bigint);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_estimate_proposal_immutable','pro_estimate_proposal_file','pro_estimate_proposal_owner','pro_estimate_proposal_json','pro_estimate_proposal_read','pro_estimate_proposal_mutate',
  'pro_estimate_proposal_publication_read','pro_estimate_proposal_image','pro_estimate_proposal_draft_image') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
