-- LOCAL PRO ONLY. Vendor portal for bid packages (parity register row 53, "portal de proveedores").
-- The owner creates an invitation link for ONE invited vendor of ONE bid package and copies it
-- (nothing is e-mailed or sent). The link carries a random token (randomBytes(32), never derived
-- from stored data); only its keyed hash (HMAC-SHA256 with PRO_BID_PORTAL_SECRET, hex) is stored.
-- Retrying the same create action returns the link without the token (it cannot be shown again).
--  * Single use: the first visit claims the link and opens a vendor session (its own random
--    token, also stored only as a keyed hash, kept by the vendor's browser in an httpOnly cookie
--    named after the link). A second visit with the same link is refused, except from the same
--    browser (device hash) within 2 minutes of the claim, which rotates the session (lost reply).
--  * Expiry (1-30 days) and revocation. A new link for the same vendor revokes the previous one.
--  * The vendor sees only its invitation: package code, title, scope, due date and lines
--    (description, quantity, unit), and only the offer IT sent from the portal (last row of
--    pro_bid_portal_submissions), never the owner's notes or an offer typed by the owner.
--    Never budget items, internal costs, other vendors, their offers, the comparison or awards.
--  * Submitting or updating the offer is allowed while the package is open and not past its
--    due date (Costa Rica day). It goes through pro_bids_mutate('record_response'), so the
--    owner's comparison, validation, package revision and history are the same as an offer
--    typed by the owner, under an internal action id derived from the link and the vendor's id.
--    Vendor receipts are idempotent per link and action id; the vendor view revision (CAS)
--    prevents overwriting a newer offer from another tab (40001). At most 50 offers per link
--    (SQLSTATE CR429 -> 429).
--  * A vendor with portal offers cannot be removed from the package (uninvite): the immutable
--    record would be lost (hint pro_bid_portal_submissions).
-- Lock order (submit and uninvite): bid work advisory 'pro-bid-work:<owner>:<work>' first, then
-- the link rows. Owner link writers and claim only lock link rows. Reapplicable.
begin;
create table if not exists public.pro_bid_portal_links(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 package_id uuid not null,supplier_id uuid not null,
 token_hash bytea not null check(length(token_hash)=32),
 expires_at timestamptz not null,created_at timestamptz not null default now(),
 claimed_at timestamptz,session_hash bytea check(session_hash is null or length(session_hash)=32),
 revoked_at timestamptz,revoke_reason text check(revoke_reason is null or revoke_reason in('owner','replaced')),
 revision integer not null default 1 check(revision>0),
 primary key(owner_id,id),
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id) on delete cascade deferrable initially deferred,
 check((claimed_at is null)=(session_hash is null)),
 check((revoked_at is null)=(revoke_reason is null)),
 check(expires_at>created_at and expires_at<=created_at+interval '30 days 1 minute')
);
-- Keyed hash of the claiming browser's device id: allows a short re-claim window (lost reply).
alter table public.pro_bid_portal_links add column if not exists claim_device_hash bytea check(claim_device_hash is null or length(claim_device_hash)=32);
create unique index if not exists pro_bid_portal_link_id on public.pro_bid_portal_links(id);
create unique index if not exists pro_bid_portal_token on public.pro_bid_portal_links(token_hash);
create unique index if not exists pro_bid_portal_session on public.pro_bid_portal_links(session_hash) where session_hash is not null;
create unique index if not exists pro_bid_portal_one_active on public.pro_bid_portal_links(owner_id,package_id,supplier_id) where revoked_at is null;
-- Immutable record of every offer the vendor sent from the portal.
create table if not exists public.pro_bid_portal_submissions(
 owner_id uuid not null references public.profiles(id) on delete cascade,link_id uuid not null,action_id uuid not null,
 package_id uuid not null,supplier_id uuid not null,input jsonb not null,result jsonb not null,submitted_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,link_id,action_id),
 foreign key(owner_id,link_id) references public.pro_bid_portal_links(owner_id,id) on delete cascade
);
create index if not exists pro_bid_portal_submissions_vendor on public.pro_bid_portal_submissions(owner_id,package_id,supplier_id,submitted_at desc);
-- Owner receipts for link actions (create/revoke), idempotent per actor and action id.
create table if not exists public.pro_bid_portal_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

create or replace function public.pro_bid_portal_hash(p_value text) returns bytea
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if p_value is null or p_value !~ '^[0-9a-f]{64}$' then raise exception 'Invalid token hash' using errcode='22023';end if;
 return decode(p_value,'hex');
end $$;
-- Internal action id for pro_bids_mutate, derived from the link and the vendor's action id.
-- md5 alone is not an RFC 9562 UUID (version/variant bits are random) and the owner's API
-- schemas (z.uuid(): history, receipts) reject it, so set version 8 (custom) and variant 10.
create or replace function public.pro_bid_portal_action_id(p_link uuid,p_action uuid) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select overlay(overlay(h placing '8' from 13 for 1) placing substr('89ab',(('x'||substr(h,17,1))::bit(4)::integer&3)+1,1) from 17 for 1)::uuid
 from (select md5('bid-portal:'||p_link::text||':'||p_action::text) h) d $$;
create or replace function public.pro_bid_portal_status(p_row public.pro_bid_portal_links) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_row.revoked_at is not null then 'revoked' when p_row.expires_at<=now() then 'expired' when p_row.claimed_at is not null then 'claimed' else 'active' end $$;
create or replace function public.pro_bid_portal_link_json(p_row public.pro_bid_portal_links) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'packageId',p_row.package_id,'supplierId',p_row.supplier_id,'status',public.pro_bid_portal_status(p_row),
  'createdAt',p_row.created_at,'expiresAt',p_row.expires_at,'claimedAt',p_row.claimed_at,'revokedAt',p_row.revoked_at,'revokeReason',p_row.revoke_reason,'revision',p_row.revision,
  'submissionCount',(select count(*)::integer from public.pro_bid_portal_submissions s where s.owner_id=p_row.owner_id and s.link_id=p_row.id),
  'lastSubmittedAt',(select max(s.submitted_at) from public.pro_bid_portal_submissions s where s.owner_id=p_row.owner_id and s.link_id=p_row.id)) $$;

-- Owner: current link and last portal offer for every invited vendor of one package.
create or replace function public.pro_bid_portal_owner_read(p_actor uuid,p_query jsonb) returns jsonb
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
 return jsonb_build_object('packageId',r.id,'status',r.status,'dueDate',r.due_date,'today',public.pro_bid_today(),
  'vendors',coalesce((select jsonb_agg(jsonb_build_object('supplierId',i.supplier_id,
    'link',(select public.pro_bid_portal_link_json(l) from public.pro_bid_portal_links l where l.owner_id=i.owner_id and l.package_id=i.package_id and l.supplier_id=i.supplier_id order by l.created_at desc,l.id limit 1),
    'portalSubmissions',(select count(*)::integer from public.pro_bid_portal_submissions s where s.owner_id=i.owner_id and s.package_id=i.package_id and s.supplier_id=i.supplier_id),
    'lastPortalSubmissionAt',(select max(s.submitted_at) from public.pro_bid_portal_submissions s where s.owner_id=i.owner_id and s.package_id=i.package_id and s.supplier_id=i.supplier_id))
   order by i.supplier_id) from public.pro_bid_invitations i where i.owner_id=p_actor and i.package_id=pid),'[]'::jsonb));
end $$;

-- Owner: create (replacing the active link) or revoke a link. The route generates the token
-- and passes only its SHA-256 (hex). CAS: create names the link it replaces (or null), revoke
-- names the link and its revision.
create or replace function public.pro_bid_portal_owner_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;pid uuid;sid uuid;lid uuid;wid text;receipt public.pro_bid_portal_actions;r public.pro_bid_packages;cur public.pro_bid_portal_links;l public.pro_bid_portal_links;
 days integer;hash bytea;result jsonb;replaces uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid link' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from (case act when 'create_link' then array['action','actionId','expiresInDays','id','packageId','replacesLinkId','supplierId','tokenHash','workId']
   when 'revoke_link' then array['action','actionId','id','packageId','revision','supplierId','workId'] end)
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid link fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_bid_uuid_value(p_input->'actionId');lid:=public.pro_bid_uuid_value(p_input->'id');pid:=public.pro_bid_uuid_value(p_input->'packageId');sid:=public.pro_bid_uuid_value(p_input->'supplierId');
 if act='create_link' then
  hash:=public.pro_bid_portal_hash(p_input->>'tokenHash');
  if jsonb_typeof(p_input->'expiresInDays') is distinct from 'number' or not coalesce((p_input->>'expiresInDays')~'^[0-9]{1,2}$',false) or (p_input->>'expiresInDays')::integer not between 1 and 30 then raise exception 'Invalid expiry' using errcode='22023';end if;
  days:=(p_input->>'expiresInDays')::integer;
  if jsonb_typeof(p_input->'replacesLinkId')='null' then replaces:=null;else replaces:=public.pro_bid_uuid_value(p_input->'replacesLinkId');end if;
 elsif jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid revision' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-portal-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_bid_portal_actions where actor_id=p_actor and action_id=aid;
 if found then
  -- The token is random per request: a retried create (same action, same fields) replays the
  -- receipt without any token; the owner replaces the link to get a new one.
  if (case when act='create_link' then receipt.input-'tokenHash' else receipt.input end) is distinct from (case when act='create_link' then p_input-'tokenHash' else p_input end) then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 select * into r from public.pro_bid_packages where owner_id=p_actor and work_id=wid and id=pid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_bid_invitations where owner_id=p_actor and package_id=pid and supplier_id=sid) then raise exception 'Vendor not invited' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-portal-vendor:'||p_actor::text||':'||pid::text||':'||sid::text,0));
 select * into cur from public.pro_bid_portal_links where owner_id=p_actor and package_id=pid and supplier_id=sid and revoked_at is null for update;
 if act='create_link' then
  if r.status not in('draft','open') then raise exception 'Links are created before the bid closes' using errcode='22023';end if;
  if (cur.id is null)<>(replaces is null) or cur.id is distinct from replaces then raise exception 'Link changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_bid_portal_links where id=lid) then raise exception 'Link id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_bid_portal_links where owner_id=p_actor and package_id=pid)>=200 then raise exception 'Link limit' using errcode='54000';end if;
  if cur.id is not null then update public.pro_bid_portal_links set revoked_at=now(),revoke_reason='replaced',revision=revision+1 where owner_id=p_actor and id=cur.id;end if;
  insert into public.pro_bid_portal_links(owner_id,id,package_id,supplier_id,token_hash,expires_at) values(p_actor,lid,pid,sid,hash,now()+make_interval(days=>days)) returning * into l;
 else
  if cur.id is distinct from lid then raise exception 'Link changed' using errcode='40001';end if;
  if cur.revision<>(p_input->>'revision')::integer then raise exception 'Link changed' using errcode='40001';end if;
  update public.pro_bid_portal_links set revoked_at=now(),revoke_reason='owner',revision=revision+1 where owner_id=p_actor and id=lid returning * into l;
 end if;
 result:=jsonb_build_object('link',public.pro_bid_portal_link_json(l));
 insert into public.pro_bid_portal_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Vendor: claim a link once. Returns ok=false (no detail beyond the reason) for unknown, used,
-- revoked or expired links. 'link' is returned for 'used' only so the route can reopen this
-- browser's own session cookie; the route drops it otherwise. The same device may claim again
-- within 2 minutes (its reply was lost): the session is rotated, never shared.
drop function if exists public.pro_bid_portal_claim(text,text);
create or replace function public.pro_bid_portal_claim(p_token_hash text,p_session_hash text,p_device_hash text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare token bytea:=public.pro_bid_portal_hash(p_token_hash);session bytea:=public.pro_bid_portal_hash(p_session_hash);
 device bytea:=case when p_device_hash is null then null else public.pro_bid_portal_hash(p_device_hash) end;l public.pro_bid_portal_links;r public.pro_bid_packages;regrant boolean:=false;
begin
 select * into l from public.pro_bid_portal_links where token_hash=token for update;
 if not found then return jsonb_build_object('ok',false,'reason','unknown');end if;
 if l.revoked_at is not null then return jsonb_build_object('ok',false,'reason','revoked');end if;
 if l.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired');end if;
 if l.claimed_at is not null then
  if device is null or l.claim_device_hash is distinct from device or l.claimed_at<=now()-interval '2 minutes' then return jsonb_build_object('ok',false,'reason','used','link',l.id);end if;
  regrant:=true;
 end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found or r.status in('cancelled','awarded') or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false) then return jsonb_build_object('ok',false,'reason','unavailable');end if;
 if regrant then update public.pro_bid_portal_links set session_hash=session,revision=revision+1 where owner_id=l.owner_id and id=l.id returning * into l;
 else update public.pro_bid_portal_links set claimed_at=now(),session_hash=session,claim_device_hash=device,revision=revision+1 where owner_id=l.owner_id and id=l.id returning * into l;end if;
 return jsonb_build_object('ok',true,'link',l.id,'expiresAt',l.expires_at,'regranted',regrant);
end $$;

-- Vendor view of its own invitation (no internal data). Null when the session is not valid.
create or replace function public.pro_bid_portal_view(p_session_hash text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare session bytea:=public.pro_bid_portal_hash(p_session_hash);l public.pro_bid_portal_links;r public.pro_bid_packages;s public.pro_expense_suppliers;sub public.pro_bid_portal_submissions;today date:=public.pro_bid_today();
begin
 select * into l from public.pro_bid_portal_links where session_hash=session;
 if not found or l.revoked_at is not null or l.expires_at<=now() or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false) then return null;end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found or not exists(select 1 from public.pro_bid_invitations i where i.owner_id=l.owner_id and i.package_id=l.package_id and i.supplier_id=l.supplier_id) then return null;end if;
 select * into s from public.pro_expense_suppliers where user_id=l.owner_id and id=l.supplier_id;
 -- Only what this vendor sent from the portal (any of its links), while the offer is on record.
 -- Never pro_bid_responses: the owner may have typed notes or an offer there by hand.
 select x.* into sub from public.pro_bid_portal_submissions x where x.owner_id=l.owner_id and x.package_id=l.package_id and x.supplier_id=l.supplier_id
  and exists(select 1 from public.pro_bid_responses resp where resp.owner_id=x.owner_id and resp.package_id=x.package_id and resp.supplier_id=x.supplier_id)
  order by x.submitted_at desc,x.action_id desc limit 1;
 return jsonb_build_object(
  'revision',l.revision,'expiresAt',l.expires_at,'today',today,
  'business',coalesce((select nullif(btrim(p.business_name),'') from public.professionals p where p.profile_id=l.owner_id limit 1),(select nullif(btrim(f.full_name),'') from public.profiles f where f.id=l.owner_id)),
  'vendor',s.name,
  'package',jsonb_build_object('code','LIC-'||lpad(r.number::text,4,'0'),'title',r.title,'scope',r.scope,'dueDate',r.due_date,
    'status',case when r.status='open' and r.due_date>=today then 'open' when r.status in('open','closed') then 'closed' else r.status end,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'position',x.position,'description',x.description,'quantity',x.quantity,'unit',x.unit) order by x.position)
      from public.pro_bid_lines x where x.owner_id=r.owner_id and x.package_id=r.id),'[]'::jsonb)),
  'offer',case when sub.link_id is null then null else jsonb_build_object('receivedOn',sub.result->>'submittedOn','leadDays',sub.input->'leadDays','validUntil',sub.input->'validUntil','notes',sub.input->'notes','recordedAt',sub.submitted_at,
    'prices',coalesce((select jsonb_agg(jsonb_build_object('lineId',x.id,'unitCents',(p->>'unitCents')::bigint,'totalCents',round(x.quantity*(p->>'unitCents')::bigint)::bigint) order by x.position)
      from jsonb_array_elements(sub.input->'prices') p join public.pro_bid_lines x on x.owner_id=l.owner_id and x.package_id=l.package_id and x.id=(p->>'lineId')::uuid),'[]'::jsonb)) end,
  'submissions',(select count(*)::integer from public.pro_bid_portal_submissions x where x.owner_id=l.owner_id and x.link_id=l.id));
end $$;

-- Vendor: send or update its offer while the package is open and not past its due date.
create or replace function public.pro_bid_portal_submit(p_session_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare session bytea:=public.pro_bid_portal_hash(p_session_hash);l public.pro_bid_portal_links;r public.pro_bid_packages;keys text[];aid uuid;prior public.pro_bid_portal_submissions;answer jsonb;result jsonb;today date:=public.pro_bid_today();
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid offer' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['actionId','leadDays','notes','prices','revision','validUntil'] then raise exception 'Invalid offer fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 aid:=public.pro_bid_uuid_value(p_input->'actionId');
 select * into l from public.pro_bid_portal_links where session_hash=session;
 if not found or l.revoked_at is not null or l.expires_at<=now() or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 -- Same lock order as pro_bids_mutate (uninvite, record_response): work advisory, then the link row.
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||l.owner_id::text||':'||r.work_id,0));
 select * into l from public.pro_bid_portal_links where owner_id=l.owner_id and id=l.id for update;
 if not found or l.session_hash is distinct from session or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Forbidden' using errcode='42501';end if;
 select * into prior from public.pro_bid_portal_submissions where owner_id=l.owner_id and link_id=l.id and action_id=aid;
 if found then
  if prior.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if l.revision<>(p_input->>'revision')::integer then raise exception 'Offer changed' using errcode='40001';end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found or r.status<>'open' or r.due_date<today then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 if (select count(*) from public.pro_bid_portal_submissions where owner_id=l.owner_id and link_id=l.id)>=50 then raise exception 'Submission limit for this link' using errcode='CR429',hint='pro_bid_portal_submission_limit';end if;
 -- Same writer, validation and history as an offer recorded by the owner. Internal action id
 -- derived from the link: the vendor's id never enters the owner's receipt space.
 answer:=public.pro_bids_mutate(l.owner_id,jsonb_build_object('action','record_response','actionId',public.pro_bid_portal_action_id(l.id,aid),'id',r.id,'workId',r.work_id,'revision',r.revision,'supplierId',l.supplier_id,
  'receivedOn',to_char(today,'YYYY-MM-DD'),'validUntil',p_input->'validUntil','leadDays',p_input->'leadDays','notes',p_input->'notes','prices',p_input->'prices'));
 if answer is null then raise exception 'Offer not recorded' using errcode='22023';end if;
 update public.pro_bid_portal_links set revision=revision+1 where owner_id=l.owner_id and id=l.id returning * into l;
 result:=jsonb_build_object('ok',true,'revision',l.revision,'submittedOn',to_char(today,'YYYY-MM-DD'));
 insert into public.pro_bid_portal_submissions(owner_id,link_id,action_id,package_id,supplier_id,input,result) values(l.owner_id,l.id,aid,l.package_id,l.supplier_id,p_input,result);
 return result;
end $$;

create or replace function public.pro_bid_portal_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Portal submissions and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_bid_portal_submission_immutable on public.pro_bid_portal_submissions;
create trigger pro_bid_portal_submission_immutable before update on public.pro_bid_portal_submissions for each row execute function public.pro_bid_portal_immutable();
drop trigger if exists pro_bid_portal_action_immutable on public.pro_bid_portal_actions;
create trigger pro_bid_portal_action_immutable before update on public.pro_bid_portal_actions for each row execute function public.pro_bid_portal_immutable();
-- A link never changes target, token or creation; only claim/revoke fields move forward.
create or replace function public.pro_bid_portal_link_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id or new.package_id<>old.package_id or new.supplier_id<>old.supplier_id or new.token_hash<>old.token_hash or new.expires_at<>old.expires_at or new.created_at<>old.created_at
  or old.claimed_at is null and new.claimed_at is null and new.claim_device_hash is not null
  or old.claimed_at is not null and (new.claimed_at is distinct from old.claimed_at or new.claim_device_hash is distinct from old.claim_device_hash
   -- The session only rotates in the claiming device's 2-minute re-claim window.
   or new.session_hash is distinct from old.session_hash and (old.claim_device_hash is null or old.claimed_at<=now()-interval '2 minutes'))
  or old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoke_reason is distinct from old.revoke_reason) then
  raise exception 'Portal links only move forward' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists pro_bid_portal_link_guard on public.pro_bid_portal_links;
create trigger pro_bid_portal_link_guard before update on public.pro_bid_portal_links for each row execute function public.pro_bid_portal_link_guard();
-- uninvite (a direct delete of the invitation, inside pro_bids_mutate after its work advisory):
-- lock the vendor's link rows in the shared order and keep the immutable portal record. Deletes
-- cascaded from a removed account or package (trigger depth > 1) are not blocked.
create or replace function public.pro_bid_portal_invitation_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if pg_trigger_depth()=1 then
  perform 1 from public.pro_bid_portal_links where owner_id=old.owner_id and package_id=old.package_id and supplier_id=old.supplier_id for update;
  if exists(select 1 from public.pro_bid_portal_submissions where owner_id=old.owner_id and package_id=old.package_id and supplier_id=old.supplier_id) then
   raise exception 'The vendor sent offers from the portal' using errcode='22023',hint='pro_bid_portal_submissions';
  end if;
 end if;
 return old;
end $$;
drop trigger if exists pro_bid_portal_invitation_guard on public.pro_bid_invitations;
create trigger pro_bid_portal_invitation_guard before delete on public.pro_bid_invitations for each row execute function public.pro_bid_portal_invitation_guard();

do $$declare t text;f record;begin
 foreach t in array array['pro_bid_portal_links','pro_bid_portal_submissions','pro_bid_portal_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_bid\_portal\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in('pro_bid_portal_immutable','pro_bid_portal_link_guard','pro_bid_portal_invitation_guard') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
