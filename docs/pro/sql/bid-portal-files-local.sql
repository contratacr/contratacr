-- LOCAL PRO ONLY. Round 4B (2026-11-13): attachments a vendor sends with its offer from the bid
-- portal, and the award notice the vendor sees there. Builds on bid-vendor-portal-local.sql.
--  * Same file contract as job files (work-files-local.sql): private bucket of its own
--    ('pro-bid-portal-files'), JPG (re-encoded, at most 2 MB) or PDF (at most 3 MB), canonical
--    name, SHA-256 of the raw and of the stored bytes, object path <owner>/<file id>.<ext>; the
--    server reserves the row, uploads, verifies the stored bytes and only then marks it ready.
--    No signed or public URL: every download is reauthorized by the route.
--  * Readable ONLY by the owner of the bid (Pro tools enabled) and by the vendor it belongs to
--    (a valid, unrevoked, unexpired portal session of that same owner, package and vendor). Any
--    other vendor (other invitation or other owner's link) and any other owner get nothing.
--  * The vendor uploads and removes its own files while the bid is open and not past its due
--    date (Costa Rica day). Up to 10 active files per vendor and package; at most 50 reservations
--    per link. A removed file stops being listed or downloadable for both sides.
--  * A vendor with portal attachments cannot be removed from the package (same rule and hint as
--    portal offers: the record is kept; cancel its link instead).
--  * Award notice: once the package is awarded the vendor sees whether it was awarded the whole
--    package, some items (with its own awarded total) or was not selected; cancelled bids say so.
--    Never other vendors, their prices or the comparison. Nothing is e-mailed or sent.
-- Lock order (reserve/remove): bid work advisory 'pro-bid-work:<owner>:<work>' first, then the link
-- row, as pro_bid_portal_submit. Reapplicable.
begin;
create table if not exists public.pro_bid_portal_files(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,
 package_id uuid not null,supplier_id uuid not null,link_id uuid not null,
 source_name text not null check(length(source_name) between 1 and 160 and source_name !~ '[[:cntrl:]/]' and position(chr(92) in source_name)=0),
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 mime_type text not null check(mime_type in('image/jpeg','application/pdf')),
 raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=20971520),object_path text not null unique,
 ready boolean not null default false,ready_at timestamptz,removed_at timestamptz,created_at timestamptz not null default now(),
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id) on delete cascade,
 foreign key(owner_id,link_id) references public.pro_bid_portal_links(owner_id,id) on delete cascade,
 check(mime_type<>'image/jpeg' or size_bytes<=20971520),
 check(object_path=owner_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(right(name,4)=case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(ready=(ready_at is not null)),check(removed_at is null or ready)
);
create index if not exists pro_bid_portal_files_vendor on public.pro_bid_portal_files(owner_id,package_id,supplier_id,created_at,id);
create index if not exists pro_bid_portal_files_link on public.pro_bid_portal_files(owner_id,link_id);

-- Valid vendor session (same checks as pro_bid_portal_view), or a row of nulls.
create or replace function public.pro_bid_portal_session_link(p_session_hash text) returns public.pro_bid_portal_links
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;
begin
 select * into l from public.pro_bid_portal_links where session_hash=public.pro_bid_portal_hash(p_session_hash);
 if not found or l.revoked_at is not null or l.expires_at<=now() or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false)
  or not exists(select 1 from public.pro_bid_invitations i where i.owner_id=l.owner_id and i.package_id=l.package_id and i.supplier_id=l.supplier_id) then
  l:=null;
 end if;
 return l;
end $$;
create or replace function public.pro_bid_portal_file_json(p_row public.pro_bid_portal_files) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'name',p_row.name,'mimeType',p_row.mime_type,'sizeBytes',p_row.size_bytes,'sha256',p_row.sha256,'createdAt',p_row.created_at) $$;
create or replace function public.pro_bid_portal_file_download_json(p_row public.pro_bid_portal_files) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('objectPath',p_row.object_path,'name',p_row.name,'mimeType',p_row.mime_type,'sizeBytes',p_row.size_bytes,'sha256',p_row.sha256) $$;

-- Vendor: reserve one upload (route checks and normalizes the bytes first).
create or replace function public.pro_bid_portal_file_reserve(p_session_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;r public.pro_bid_packages;f public.pro_bid_portal_files;keys text[];fid uuid;ext text;today date:=public.pro_bid_today();
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid file' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['fileId','mimeType','name','rawSha256','sha256','sizeBytes','sourceName'] or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number'
  or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'sourceName') is distinct from 'string' or jsonb_typeof(p_input->'mimeType') is distinct from 'string'
  or jsonb_typeof(p_input->'sha256') is distinct from 'string' or jsonb_typeof(p_input->'rawSha256') is distinct from 'string' then raise exception 'Invalid file fields' using errcode='22023';end if;
 fid:=public.pro_bid_uuid_value(p_input->'fileId');
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||l.owner_id::text||':'||r.work_id,0));
 select * into l from public.pro_bid_portal_links where owner_id=l.owner_id and id=l.id for update;
 if not found or l.session_hash is distinct from public.pro_bid_portal_hash(p_session_hash) or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from public.pro_bid_portal_files where id=fid;
 if found then
  -- Same request retried (lost reply): same link and same bytes return the same reservation.
  if f.owner_id<>l.owner_id or f.link_id<>l.id or f.sha256<>p_input->>'sha256' or f.raw_sha256<>p_input->>'rawSha256' or f.name<>p_input->>'name' or f.mime_type<>p_input->>'mimeType' or f.size_bytes<>(p_input->>'sizeBytes')::integer then
   raise exception 'File identity reused' using errcode='22023';end if;
  return jsonb_build_object('file',public.pro_bid_portal_file_json(f)||jsonb_build_object('ready',f.ready),'objectPath',f.object_path);
 end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if r.status<>'open' or r.due_date<today then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 if (select count(*) from public.pro_bid_portal_files where owner_id=l.owner_id and package_id=l.package_id and supplier_id=l.supplier_id and removed_at is null)>=10 then raise exception 'Attachment limit' using errcode='CR429',hint='pro_bid_portal_file_limit';end if;
 if (select count(*) from public.pro_bid_portal_files where owner_id=l.owner_id and link_id=l.id)>=50 then raise exception 'Attachment limit for this link' using errcode='CR429',hint='pro_bid_portal_file_limit';end if;
 ext:=case p_input->>'mimeType' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' end;
 if ext is null then raise exception 'Invalid file type' using errcode='22023';end if;
 insert into public.pro_bid_portal_files(id,owner_id,package_id,supplier_id,link_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path)
 values(fid,l.owner_id,l.package_id,l.supplier_id,l.id,p_input->>'sourceName',p_input->>'name',p_input->>'mimeType',p_input->>'rawSha256',p_input->>'sha256',(p_input->>'sizeBytes')::integer,l.owner_id::text||'/'||fid::text||ext) returning * into f;
 return jsonb_build_object('file',public.pro_bid_portal_file_json(f)||jsonb_build_object('ready',f.ready),'objectPath',f.object_path);
end $$;
-- Vendor: the stored bytes were verified by the route; mark the reservation ready (idempotent).
create or replace function public.pro_bid_portal_file_ready(p_session_hash text,p_file uuid,p_sha256 text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;f public.pro_bid_portal_files;
begin
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from public.pro_bid_portal_files where id=p_file and owner_id=l.owner_id and link_id=l.id for update;
 if not found or f.sha256 is distinct from p_sha256 then raise exception 'Invalid file' using errcode='22023';end if;
 if not f.ready then update public.pro_bid_portal_files set ready=true,ready_at=now() where id=f.id returning * into f;end if;
 return jsonb_build_object('file',public.pro_bid_portal_file_json(f));
end $$;
-- Vendor: remove one of its own files while the bid is open.
create or replace function public.pro_bid_portal_file_remove(p_session_hash text,p_file uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;r public.pro_bid_packages;f public.pro_bid_portal_files;today date:=public.pro_bid_today();
begin
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||l.owner_id::text||':'||r.work_id,0));
 select * into f from public.pro_bid_portal_files where id=p_file and owner_id=l.owner_id and package_id=l.package_id and supplier_id=l.supplier_id and ready for update;
 if not found then raise exception 'Invalid file' using errcode='22023';end if;
 if f.removed_at is not null then return jsonb_build_object('removed',true,'replayed',true);end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if r.status<>'open' or r.due_date<today then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 update public.pro_bid_portal_files set removed_at=now() where id=f.id;
 return jsonb_build_object('removed',true);
end $$;
-- Vendor download: only files of its own invitation (any of its links), ready and not removed.
create or replace function public.pro_bid_portal_file_vendor_download(p_session_hash text,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;f public.pro_bid_portal_files;
begin
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then return null;end if;
 select * into f from public.pro_bid_portal_files where id=p_file and owner_id=l.owner_id and package_id=l.package_id and supplier_id=l.supplier_id and ready and removed_at is null;
 if not found then return null;end if;
 return public.pro_bid_portal_file_download_json(f);
end $$;
-- Owner download: only files of the owner's own bids.
create or replace function public.pro_bid_portal_file_owner_download(p_actor uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_bid_portal_files;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from public.pro_bid_portal_files where id=p_file and owner_id=p_actor and ready and removed_at is null;
 if not found then return null;end if;
 return public.pro_bid_portal_file_download_json(f);
end $$;
-- Owner: attachments of every vendor of one package (comparison view).
create or replace function public.pro_bid_portal_files_owner_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare keys text[];pid uuid;r public.pro_bid_packages;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid query' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if keys is distinct from array['id','workId'] or jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160 then raise exception 'Invalid query' using errcode='22023';end if;
 pid:=public.pro_bid_uuid_value(p_query->'id');
 select * into r from public.pro_bid_packages where owner_id=p_actor and work_id=p_query->>'workId' and id=pid;
 if not found then return null;end if;
 return jsonb_build_object('packageId',r.id,'files',coalesce((select jsonb_agg(public.pro_bid_portal_file_json(f)||jsonb_build_object('supplierId',f.supplier_id) order by f.created_at,f.id)
  from public.pro_bid_portal_files f where f.owner_id=p_actor and f.package_id=r.id and f.ready and f.removed_at is null),'[]'::jsonb));
end $$;
-- Vendor: its own attachments and the award notice of its invitation.
create or replace function public.pro_bid_portal_vendor_extras(p_session_hash text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;r public.pro_bid_packages;outcome jsonb:=null;won integer;total_lines integer;won_cents bigint;today date:=public.pro_bid_today();
begin
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then return null;end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found then return null;end if;
 if r.status='awarded' then
  select count(*)::integer into total_lines from public.pro_bid_lines x where x.owner_id=r.owner_id and x.package_id=r.id;
  select count(*)::integer,coalesce(sum(round(x.quantity*a.unit_cents)),0)::bigint into won,won_cents from public.pro_bid_awards a join public.pro_bid_lines x on x.owner_id=a.owner_id and x.id=a.line_id
   where a.owner_id=r.owner_id and a.package_id=r.id and a.supplier_id=l.supplier_id;
  outcome:=jsonb_build_object('status',case when won=0 then 'not_selected' when won>=total_lines then 'won' else 'partial' end,'decidedAt',r.awarded_at,'lineCount',won,'totalLineCount',total_lines,'wonCents',case when won>0 then won_cents end,
   'lines',coalesce((select jsonb_agg(jsonb_build_object('lineId',x.id,'position',x.position,'description',x.description,'totalCents',round(x.quantity*a.unit_cents)::bigint) order by x.position)
    from public.pro_bid_awards a join public.pro_bid_lines x on x.owner_id=a.owner_id and x.id=a.line_id where a.owner_id=r.owner_id and a.package_id=r.id and a.supplier_id=l.supplier_id),'[]'::jsonb));
 elsif r.status='cancelled' then
  outcome:=jsonb_build_object('status','cancelled','decidedAt',r.cancelled_at,'lineCount',0,'totalLineCount',0,'wonCents',null,'lines','[]'::jsonb);
 end if;
 return jsonb_build_object('canAttach',r.status='open' and r.due_date>=today,
  'files',coalesce((select jsonb_agg(public.pro_bid_portal_file_json(f) order by f.created_at,f.id) from public.pro_bid_portal_files f
   where f.owner_id=l.owner_id and f.package_id=l.package_id and f.supplier_id=l.supplier_id and f.ready and f.removed_at is null),'[]'::jsonb),
  -- Key named «outcome» (not «award»): before a decision the vendor view carries no award wording.
  'outcome',outcome);
end $$;
-- uninvite keeps the vendor's portal attachments (same hint as portal offers). Cascades from a
-- removed account or package (trigger depth > 1) are not blocked.
create or replace function public.pro_bid_portal_file_invitation_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if pg_trigger_depth()=1 and exists(select 1 from public.pro_bid_portal_files where owner_id=old.owner_id and package_id=old.package_id and supplier_id=old.supplier_id and ready and removed_at is null) then
  raise exception 'The vendor sent attachments from the portal' using errcode='22023',hint='pro_bid_portal_submissions';
 end if;
 return old;
end $$;
drop trigger if exists pro_bid_portal_file_invitation_guard on public.pro_bid_invitations;
create trigger pro_bid_portal_file_invitation_guard before delete on public.pro_bid_invitations for each row execute function public.pro_bid_portal_file_invitation_guard();
-- Identity and bytes never change; only ready and removal move forward.
create or replace function public.pro_bid_portal_file_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.id,new.owner_id,new.package_id,new.supplier_id,new.link_id,new.source_name,new.name,new.mime_type,new.raw_sha256,new.sha256,new.size_bytes,new.object_path,new.created_at)
  is distinct from (old.id,old.owner_id,old.package_id,old.supplier_id,old.link_id,old.source_name,old.name,old.mime_type,old.raw_sha256,old.sha256,old.size_bytes,old.object_path,old.created_at)
  or old.ready and (not new.ready or new.ready_at is distinct from old.ready_at) or old.removed_at is not null and new.removed_at is distinct from old.removed_at then
  raise exception 'Portal files only move forward' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists pro_bid_portal_file_guard on public.pro_bid_portal_files;
create trigger pro_bid_portal_file_guard before update on public.pro_bid_portal_files for each row execute function public.pro_bid_portal_file_guard();

alter table public.pro_bid_portal_files enable row level security;
revoke all on public.pro_bid_portal_files from public,anon,authenticated;
grant select,insert,update,delete on public.pro_bid_portal_files to service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('pro_bid_portal_session_link','pro_bid_portal_file_json','pro_bid_portal_file_download_json','pro_bid_portal_file_reserve','pro_bid_portal_file_ready','pro_bid_portal_file_remove','pro_bid_portal_file_vendor_download','pro_bid_portal_file_owner_download','pro_bid_portal_files_owner_read','pro_bid_portal_vendor_extras','pro_bid_portal_file_invitation_guard','pro_bid_portal_file_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in('pro_bid_portal_file_invitation_guard','pro_bid_portal_file_guard') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-bid-portal-files','pro-bid-portal-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-bid-portal-files' and not public and file_size_limit=20971520 and cardinality(allowed_mime_types)=2 and allowed_mime_types @> array['image/jpeg','application/pdf']) then raise exception 'Bid portal files bucket configuration must match the private contract';end if;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists pro_bid_portal_files_no_direct on storage.objects';
  execute 'create policy pro_bid_portal_files_no_direct on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''pro-bid-portal-files'') with check (bucket_id <> ''pro-bid-portal-files'')';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
