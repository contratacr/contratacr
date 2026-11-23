-- Pro family 51 (purchase orders): delivery address and payment terms per order, a single-use secure link so a vendor WITHOUT a
-- ContrataCR account can confirm, decline or propose a delivery date, combining draft orders of one vendor, and a flat export.
-- Product decision (2026-11-23): the vendor answers through a secure link; an own vendor account is not built. Nothing is e-mailed:
-- the owner copies the link (same model as the bid vendor portal, migration 303/360, and the same secret PRO_BID_PORTAL_SECRET).
-- New objects only; pro_purchase_orders_mutate keeps its exact key contract (terms live in their own table, like tracking in 320).
-- Owner functions: p_actor + pro_private_work_tools_enabled. Vendor functions: session hash only, never an owner id. service_role only,
-- RLS closed, security invoker. Reapplicable.
begin;

-- Delivery address and payment terms, one record per order (revision for optimistic concurrency).
create table if not exists public.pro_purchase_order_terms(
 owner_id uuid not null,order_id uuid not null,
 delivery_address text check(delivery_address is null or length(btrim(delivery_address)) between 1 and 300),
 payment_terms text check(payment_terms is null or length(btrim(payment_terms)) between 1 and 300),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,order_id),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade
);

-- One secure link per order (single use, only the keyed hash of the token is stored, expiry, revocable or replaceable).
create table if not exists public.pro_po_vendor_links(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,order_id uuid not null,
 token_hash bytea not null check(length(token_hash)=32),
 expires_at timestamptz not null,created_at timestamptz not null default now(),
 claimed_at timestamptz,session_hash bytea check(session_hash is null or length(session_hash)=32),
 claim_device_hash bytea check(claim_device_hash is null or length(claim_device_hash)=32),
 revoked_at timestamptz,revoke_reason text check(revoke_reason is null or revoke_reason in('owner','replaced')),
 revision integer not null default 1 check(revision>0),
 primary key(owner_id,id),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 check((claimed_at is null)=(session_hash is null)),
 check((revoked_at is null)=(revoke_reason is null)),
 check(expires_at>created_at and expires_at<=created_at+interval '30 days 1 minute')
);
create unique index if not exists pro_po_vendor_link_id on public.pro_po_vendor_links(id);
create unique index if not exists pro_po_vendor_link_token on public.pro_po_vendor_links(token_hash);
create unique index if not exists pro_po_vendor_link_session on public.pro_po_vendor_links(session_hash) where session_hash is not null;
create unique index if not exists pro_po_vendor_link_one_active on public.pro_po_vendor_links(owner_id,order_id) where revoked_at is null;

-- Immutable history of every answer of the vendor (the order revision it saw is kept).
create table if not exists public.pro_po_vendor_responses(
 owner_id uuid not null references public.profiles(id) on delete cascade,link_id uuid not null,action_id uuid not null,order_id uuid not null,
 order_revision integer not null check(order_revision>0),
 response text not null check(response in('confirm','decline','propose_date')),
 proposed_date date,note text check(note is null or (length(btrim(note)) between 1 and 500 and note !~ '[[:cntrl:]]')),
 responded_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,link_id,action_id),
 foreign key(owner_id,link_id) references public.pro_po_vendor_links(owner_id,id) on delete cascade,
 check((response='propose_date')=(proposed_date is not null))
);
create index if not exists pro_po_vendor_responses_order on public.pro_po_vendor_responses(owner_id,order_id,responded_at desc);
-- Owner receipts for link actions (create/revoke), idempotent per actor and action id.
create table if not exists public.pro_po_vendor_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- Responses and receipts are never edited or deleted by a statement (cascades from the order or the account still work).
create or replace function public.pro_po_vendor_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Vendor responses are immutable' using errcode='23514';end $$;
drop trigger if exists pro_po_vendor_responses_immutable on public.pro_po_vendor_responses;
create trigger pro_po_vendor_responses_immutable before update or delete on public.pro_po_vendor_responses for each row when (pg_trigger_depth()=0) execute function public.pro_po_vendor_immutable();
drop trigger if exists pro_po_vendor_actions_immutable on public.pro_po_vendor_actions;
create trigger pro_po_vendor_actions_immutable before update or delete on public.pro_po_vendor_actions for each row when (pg_trigger_depth()=0) execute function public.pro_po_vendor_immutable();

-- UUID with version 8 and variant bits, derived from a seed (valid for z.string().uuid()).
create or replace function public.pro_po_derived_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select overlay(overlay(h placing '8' from 13 for 1) placing substr('89ab',(('x'||substr(h,17,1))::bit(4)::integer&3)+1,1) from 17 for 1)::uuid
 from (select md5('po-derived:'||p_seed) h) d $$;

create or replace function public.pro_po_uuid_value(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or (p_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid id' using errcode='22023';end if;
 return (p_value #>> '{}')::uuid;
end $$;

-- ===== Delivery address and payment terms =====
create or replace function public.pro_purchase_order_terms_read(p_actor uuid,p_work text,p_order uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_purchase_order_terms;o public.pro_purchase_orders;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_order is null then raise exception 'Invalid terms query' using errcode='22023';end if;
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=p_work and id=p_order;
 if not found then return null;end if;
 select * into t from public.pro_purchase_order_terms where owner_id=p_actor and order_id=p_order;
 if not found then return jsonb_build_object('orderId',p_order,'revision',0,'deliveryAddress',null,'paymentTerms',null);end if;
 return jsonb_build_object('orderId',p_order,'revision',t.revision,'deliveryAddress',t.delivery_address,'paymentTerms',t.payment_terms,'updatedAt',t.updated_at);
end $$;

-- Saving the terms also moves the order revision, so an answer the vendor gave to the previous terms shows as an older version.
create or replace function public.pro_purchase_order_terms_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;oid uuid;rev integer;o public.pro_purchase_orders;cur public.pro_purchase_order_terms;w record;v_addr text;v_terms text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid terms' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['deliveryAddress','id','paymentTerms','revision','workId']
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid terms fields' using errcode='22023';end if;
 wid:=p_input->>'workId';oid:=public.pro_po_uuid_value(p_input->'id');rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid terms identity' using errcode='22023';end if;
 v_addr:=public.pro_purchase_order_text(p_input->'deliveryAddress',300,false);v_terms:=public.pro_purchase_order_text(p_input->'paymentTerms',300,false);
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-work:'||p_actor::text||':'||wid,0));
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=oid for update;
 if not found then raise exception 'Order not found' using errcode='22023';end if;
 select cancelled into w from public.pro_work where user_id=p_actor and id=wid;
 if coalesce(w.cancelled,false) then raise exception 'Cancelled work' using errcode='22023';end if;
 if o.status not in('draft','issued','partial') then raise exception 'Terms can no longer change' using errcode='22023';end if;
 select * into cur from public.pro_purchase_order_terms where owner_id=p_actor and order_id=oid for update;
 if not found then
  if rev<>0 then raise exception 'Stale terms' using errcode='40001';end if;
  insert into public.pro_purchase_order_terms(owner_id,order_id,delivery_address,payment_terms) values(p_actor,oid,v_addr,v_terms);
 else
  if cur.revision<>rev then raise exception 'Stale terms' using errcode='40001';end if;
  update public.pro_purchase_order_terms set delivery_address=v_addr,payment_terms=v_terms,revision=revision+1,updated_at=now() where owner_id=p_actor and order_id=oid;
 end if;
 update public.pro_purchase_orders set revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid;
 return public.pro_purchase_order_terms_read(p_actor,wid,oid);
end $$;

-- ===== Secure vendor link: owner side =====
create or replace function public.pro_po_vendor_link_status(p_row public.pro_po_vendor_links) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_row.revoked_at is not null then 'revoked' when p_row.expires_at<=now() then 'expired' when p_row.claimed_at is not null then 'claimed' else 'active' end $$;
create or replace function public.pro_po_vendor_link_json(p_row public.pro_po_vendor_links) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'orderId',p_row.order_id,'status',public.pro_po_vendor_link_status(p_row),'createdAt',p_row.created_at,'expiresAt',p_row.expires_at,
  'claimedAt',p_row.claimed_at,'revokedAt',p_row.revoked_at,'revokeReason',p_row.revoke_reason,'revision',p_row.revision,
  'responseCount',(select count(*)::integer from public.pro_po_vendor_responses r where r.owner_id=p_row.owner_id and r.link_id=p_row.id),
  'lastRespondedAt',(select max(r.responded_at) from public.pro_po_vendor_responses r where r.owner_id=p_row.owner_id and r.link_id=p_row.id)) $$;

-- Owner: current link and every answer of the vendor (newest first). 'stale' = answered an older version of the order.
create or replace function public.pro_po_vendor_owner_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare keys text[];oid uuid;o public.pro_purchase_orders;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid query' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if keys is distinct from array['id','workId'] or jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160 then raise exception 'Invalid query' using errcode='22023';end if;
 oid:=public.pro_po_uuid_value(p_query->'id');
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=p_query->>'workId' and id=oid;
 if not found then return null;end if;
 return jsonb_build_object('orderId',o.id,'status',o.status,'revision',o.revision,
  'link',(select public.pro_po_vendor_link_json(l) from public.pro_po_vendor_links l where l.owner_id=p_actor and l.order_id=o.id order by l.created_at desc,l.id limit 1),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('id',x.action_id,'response',x.response,'proposedDate',x.proposed_date,'note',x.note,'respondedAt',x.responded_at,
    'orderRevision',x.order_revision,'stale',x.order_revision<>o.revision) order by x.responded_at desc,x.action_id)
   from (select * from public.pro_po_vendor_responses r where r.owner_id=p_actor and r.order_id=o.id order by r.responded_at desc,r.action_id limit 50) x),'[]'::jsonb));
end $$;

-- Owner: create (replacing the active link) or revoke the link. The route generates the token and passes only its keyed hash (hex).
create or replace function public.pro_po_vendor_owner_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;oid uuid;lid uuid;wid text;receipt public.pro_po_vendor_actions;o public.pro_purchase_orders;cur public.pro_po_vendor_links;l public.pro_po_vendor_links;
 days integer;hash bytea;result jsonb;replaces uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid link' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from (case act when 'create_link' then array['action','actionId','expiresInDays','id','orderId','replacesLinkId','tokenHash','workId']
   when 'revoke_link' then array['action','actionId','id','orderId','revision','workId'] end)
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid link fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_po_uuid_value(p_input->'actionId');lid:=public.pro_po_uuid_value(p_input->'id');oid:=public.pro_po_uuid_value(p_input->'orderId');
 if act='create_link' then
  hash:=public.pro_bid_portal_hash(p_input->>'tokenHash');
  if jsonb_typeof(p_input->'expiresInDays') is distinct from 'number' or not coalesce((p_input->>'expiresInDays')~'^[0-9]{1,2}$',false) or (p_input->>'expiresInDays')::integer not between 1 and 30 then raise exception 'Invalid expiry' using errcode='22023';end if;
  days:=(p_input->>'expiresInDays')::integer;
  if jsonb_typeof(p_input->'replacesLinkId')='null' then replaces:=null;else replaces:=public.pro_po_uuid_value(p_input->'replacesLinkId');end if;
 elsif jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid revision' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-po-vendor-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_po_vendor_actions where actor_id=p_actor and action_id=aid;
 if found then
  -- The token is random per request: a retried create replays the receipt without any token; the owner replaces the link to get a new one.
  if (case when act='create_link' then receipt.input-'tokenHash' else receipt.input end) is distinct from (case when act='create_link' then p_input-'tokenHash' else p_input end) then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=oid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-po-vendor-order:'||p_actor::text||':'||oid::text,0));
 select * into cur from public.pro_po_vendor_links where owner_id=p_actor and order_id=oid and revoked_at is null for update;
 if act='create_link' then
  if o.status not in('issued','partial') then raise exception 'Links are created for issued orders' using errcode='22023';end if;
  if (cur.id is null)<>(replaces is null) or cur.id is distinct from replaces then raise exception 'Link changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_po_vendor_links where id=lid) then raise exception 'Link id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_po_vendor_links where owner_id=p_actor and order_id=oid)>=50 then raise exception 'Link limit' using errcode='54000';end if;
  if cur.id is not null then update public.pro_po_vendor_links set revoked_at=now(),revoke_reason='replaced',revision=revision+1 where owner_id=p_actor and id=cur.id;end if;
  insert into public.pro_po_vendor_links(owner_id,id,order_id,token_hash,expires_at) values(p_actor,lid,oid,hash,now()+make_interval(days=>days)) returning * into l;
 else
  if cur.id is distinct from lid or cur.revision<>(p_input->>'revision')::integer then raise exception 'Link changed' using errcode='40001';end if;
  update public.pro_po_vendor_links set revoked_at=now(),revoke_reason='owner',revision=revision+1 where owner_id=p_actor and id=lid returning * into l;
 end if;
 result:=jsonb_build_object('link',public.pro_po_vendor_link_json(l));
 insert into public.pro_po_vendor_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===== Secure vendor link: vendor side (no ContrataCR account) =====
-- Claim a link once. Same device may re-claim within 2 minutes (lost reply); the session is rotated, never shared.
create or replace function public.pro_po_vendor_claim(p_token_hash text,p_session_hash text,p_device_hash text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare token bytea:=public.pro_bid_portal_hash(p_token_hash);session bytea:=public.pro_bid_portal_hash(p_session_hash);
 device bytea:=case when p_device_hash is null then null else public.pro_bid_portal_hash(p_device_hash) end;l public.pro_po_vendor_links;o public.pro_purchase_orders;regrant boolean:=false;
begin
 select * into l from public.pro_po_vendor_links where token_hash=token for update;
 if not found then return jsonb_build_object('ok',false,'reason','unknown');end if;
 if l.revoked_at is not null then return jsonb_build_object('ok',false,'reason','revoked');end if;
 if l.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired');end if;
 if l.claimed_at is not null then
  if device is null or l.claim_device_hash is distinct from device or l.claimed_at<=now()-interval '2 minutes' then return jsonb_build_object('ok',false,'reason','used','link',l.id);end if;
  regrant:=true;
 end if;
 select * into o from public.pro_purchase_orders where owner_id=l.owner_id and id=l.order_id;
 if not found or o.status in('draft','cancelled') or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false) then return jsonb_build_object('ok',false,'reason','unavailable');end if;
 if regrant then update public.pro_po_vendor_links set session_hash=session,revision=revision+1 where owner_id=l.owner_id and id=l.id returning * into l;
 else update public.pro_po_vendor_links set claimed_at=now(),session_hash=session,claim_device_hash=device,revision=revision+1 where owner_id=l.owner_id and id=l.id returning * into l;end if;
 return jsonb_build_object('ok',true,'link',l.id,'expiresAt',l.expires_at,'regranted',regrant);
end $$;

-- The link of a valid session, or an all-null row.
create or replace function public.pro_po_vendor_session_link(p_session_hash text) returns public.pro_po_vendor_links
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_po_vendor_links;
begin
 select * into l from public.pro_po_vendor_links where session_hash=public.pro_bid_portal_hash(p_session_hash);
 if not found or l.revoked_at is not null or l.expires_at<=now() or not coalesce(public.pro_private_work_tools_enabled(l.owner_id),false)
  or not exists(select 1 from public.pro_purchase_orders o where o.owner_id=l.owner_id and o.id=l.order_id and o.status not in('draft','cancelled')) then
  l:=null;
 end if;
 return l;
end $$;

-- The vendor sees only its own order: lines with quantity, unit, its price and tax, dates, address and terms. Never budget codes, selection or
-- allowance links, payments, the owner's notes, the end client or any other order.
create or replace function public.pro_po_vendor_view(p_session_hash text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_po_vendor_links;o public.pro_purchase_orders;t public.pro_purchase_order_terms;fig record;today date:=public.pro_purchase_order_today();
begin
 l:=public.pro_po_vendor_session_link(p_session_hash);
 if l.id is null then return null;end if;
 select * into o from public.pro_purchase_orders where owner_id=l.owner_id and id=l.order_id;
 if not found then return null;end if;
 select * into t from public.pro_purchase_order_terms where owner_id=l.owner_id and order_id=o.id;
 select * into fig from public.pro_purchase_order_figures(o.owner_id,o.id);
 return jsonb_build_object('revision',l.revision,'expiresAt',l.expires_at,'today',today,
  'business',coalesce((select nullif(btrim(p.business_name),'') from public.professionals p where p.profile_id=l.owner_id limit 1),(select nullif(btrim(f.full_name),'') from public.profiles f where f.id=l.owner_id)),
  'vendor',o.supplier_name,
  'order',jsonb_build_object('code','OC-'||lpad(o.number::text,4,'0'),'title',o.title,'status',o.status,'revision',o.revision,'issueDate',o.issue_date,'expectedDate',o.expected_date,
   'deliveryAddress',t.delivery_address,'paymentTerms',t.payment_terms,
   'subtotalCents',fig.subtotal_cents,'taxCents',fig.tax_cents,'totalCents',fig.total_cents,
   'lines',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'position',x.position,'description',x.description,'quantity',x.quantity,'unit',x.unit,'unitCents',x.unit_cents,
     'taxRate',x.tax_rate,'subtotalCents',x.subtotal_cents,'taxCents',x.tax_cents,'totalCents',x.subtotal_cents+x.tax_cents) order by x.position)
    from public.pro_purchase_order_lines x where x.owner_id=o.owner_id and x.order_id=o.id),'[]'::jsonb)),
  'canRespond',o.status in('issued','partial'),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.action_id,'response',r.response,'proposedDate',r.proposed_date,'note',r.note,'respondedAt',r.responded_at,
    'current',r.order_revision=o.revision) order by r.responded_at,r.action_id)
   from public.pro_po_vendor_responses r where r.owner_id=l.owner_id and r.link_id=l.id),'[]'::jsonb));
end $$;

-- Vendor: confirm, decline or propose a delivery date, with an optional note. Idempotent by actionId; answers the revision of the order it saw.
create or replace function public.pro_po_vendor_respond(p_session_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_po_vendor_links;o public.pro_purchase_orders;r public.pro_po_vendor_responses;keys text[];aid uuid;rev integer;v_resp text;v_date date;v_note text;today date:=public.pro_purchase_order_today();
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid response' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['actionId','note','proposedDate','response','revision'] or jsonb_typeof(p_input->'response') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid response fields' using errcode='22023';end if;
 aid:=public.pro_po_uuid_value(p_input->'actionId');rev:=(p_input->>'revision')::integer;v_resp:=p_input->>'response';
 if v_resp not in('confirm','decline','propose_date') then raise exception 'Invalid response kind' using errcode='22023';end if;
 v_note:=public.pro_purchase_order_text(p_input->'note',500,false);
 if v_note is not null and v_note ~ '[[:cntrl:]]' then raise exception 'Invalid note' using errcode='22023';end if;
 v_date:=public.pro_purchase_order_day(p_input->'proposedDate',v_resp='propose_date');
 if v_resp<>'propose_date' and v_date is not null then raise exception 'A date goes with a proposal only' using errcode='22023';end if;
 if v_date is not null and (v_date<today or v_date>today+365) then raise exception 'Invalid proposed date' using errcode='22023';end if;
 l:=public.pro_po_vendor_session_link(p_session_hash);
 if l.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into o from public.pro_purchase_orders where owner_id=l.owner_id and id=l.order_id;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-work:'||l.owner_id::text||':'||o.work_id,0));
 select * into l from public.pro_po_vendor_links where owner_id=l.owner_id and id=l.id for update;
 if not found or l.session_hash is distinct from public.pro_bid_portal_hash(p_session_hash) or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_po_vendor_responses where owner_id=l.owner_id and link_id=l.id and action_id=aid;
 if found then
  -- Same request retried (lost reply): the same answer returns the same record.
  if r.response<>v_resp or r.proposed_date is distinct from v_date or r.note is distinct from v_note then raise exception 'Action identity reused' using errcode='22023';end if;
  return jsonb_build_object('response',jsonb_build_object('id',r.action_id,'response',r.response,'proposedDate',r.proposed_date,'note',r.note,'respondedAt',r.responded_at),'replayed',true);
 end if;
 select * into o from public.pro_purchase_orders where owner_id=l.owner_id and id=l.order_id for share;
 if o.status not in('issued','partial') then raise exception 'The order no longer accepts answers' using errcode='22023',hint='pro_po_closed';end if;
 if o.revision<>rev then raise exception 'The order changed' using errcode='40001';end if;
 if (select count(*) from public.pro_po_vendor_responses where owner_id=l.owner_id and link_id=l.id)>=20 then raise exception 'Response limit' using errcode='CR429',hint='pro_po_response_limit';end if;
 insert into public.pro_po_vendor_responses(owner_id,link_id,action_id,order_id,order_revision,response,proposed_date,note) values(l.owner_id,l.id,aid,o.id,o.revision,v_resp,v_date,v_note) returning * into r;
 return jsonb_build_object('response',jsonb_build_object('id',r.action_id,'response',r.response,'proposedDate',r.proposed_date,'note',r.note,'respondedAt',r.responded_at),'replayed',false);
end $$;

-- ===== Combine draft orders of the same vendor and job =====
-- Creates one new draft with the lines of 2..10 drafts (same vendor, same job) and cancels the sources, all through the existing writer
-- pro_purchase_orders_mutate with ids derived from the action id, so a retry replays. At most 100 lines in total.
create or replace function public.pro_purchase_orders_merge(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;aid uuid;nid uuid;v_title text;srcs jsonb;src jsonb;sid uuid;srev integer;o public.pro_purchase_orders;first_o public.pro_purchase_orders;receipt public.pro_purchase_order_actions;
 ids uuid[]:=array[]::uuid[];lines jsonb:='[]'::jsonb;n integer:=0;ln record;answer jsonb;created jsonb;max_expected date;t public.pro_purchase_order_terms;t_first public.pro_purchase_order_terms;cancelled jsonb:='[]'::jsonb;
 code text;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid merge' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','id','sources','title','workId'] or p_input->>'action' is distinct from 'merge'
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 or jsonb_typeof(p_input->'sources') is distinct from 'array'
  or jsonb_array_length(p_input->'sources') not between 2 and 10 then raise exception 'Invalid merge fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_po_uuid_value(p_input->'actionId');nid:=public.pro_po_uuid_value(p_input->'id');srcs:=p_input->'sources';
 v_title:=public.pro_purchase_order_text(p_input->'title',160,true);
 for src in select value from jsonb_array_elements(srcs) loop
  select array_agg(key order by key) into keys from jsonb_object_keys(src) key;
  if jsonb_typeof(src) is distinct from 'object' or keys is distinct from array['id','revision'] or jsonb_typeof(src->'revision') is distinct from 'number'
   or not coalesce((src->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid merge source' using errcode='22023';end if;
  sid:=public.pro_po_uuid_value(src->'id');
  if sid=any(ids) then raise exception 'Duplicated source' using errcode='22023';end if;
  ids:=ids||sid;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_purchase_order_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-work:'||p_actor::text||':'||wid,0));
 -- Lock the sources in id order (no deadlock between two merges) and validate them.
 for sid in select x from unnest(ids) x order by x loop
  select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=sid for update;
  if not found then raise exception 'Order not found' using errcode='22023';end if;
 end loop;
 for src in select value from jsonb_array_elements(srcs) loop
  select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=(src->>'id')::uuid;
  if o.revision<>(src->>'revision')::integer then raise exception 'Purchase order changed' using errcode='40001';end if;
  if o.status<>'draft' then raise exception 'Only drafts can be combined' using errcode='22023';end if;
  if first_o.id is null then first_o:=o;
  elsif o.supplier_id is distinct from first_o.supplier_id or (o.supplier_id is null and lower(btrim(o.supplier_name))<>lower(btrim(first_o.supplier_name))) then raise exception 'Drafts must share the vendor' using errcode='22023';end if;
  if o.expected_date is not null and (max_expected is null or o.expected_date>max_expected) then max_expected:=o.expected_date;end if;
 end loop;
 for src in select value from jsonb_array_elements(srcs) order by (select number from public.pro_purchase_orders where owner_id=p_actor and id=(value->>'id')::uuid) loop
  for ln in select * from public.pro_purchase_order_lines where owner_id=p_actor and order_id=(src->>'id')::uuid order by position loop
   n:=n+1;
   if n>100 then raise exception 'Too many lines' using errcode='22023';end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('id',public.pro_po_derived_uuid('merge-line:'||aid::text||':'||ln.id::text),'description',ln.description,'quantity',ln.quantity,'unit',ln.unit,
    'unitCents',ln.unit_cents,'taxRate',ln.tax_rate,'budgetCodeId',ln.budget_code_id,'selectionOptionId',ln.selection_option_id,'allowanceId',ln.allowance_id));
  end loop;
 end loop;
 answer:=public.pro_purchase_orders_mutate(p_actor,jsonb_build_object('action','create','actionId',public.pro_po_derived_uuid('merge-create:'||aid::text),'workId',wid,'id',nid,
  'supplierId',first_o.supplier_id,'supplierName',case when first_o.supplier_id is null then first_o.supplier_name end,'supplierContact',first_o.supplier_contact,'title',v_title,
  'issueDate',public.pro_purchase_order_today(),'expectedDate',case when max_expected>=public.pro_purchase_order_today() then max_expected end,'notes',null,'lines',lines));
 created:=answer->'order';code:=created->>'code';
 -- The new draft keeps the delivery address and payment terms of the first source that has them.
 select * into t_first from public.pro_purchase_order_terms x where x.owner_id=p_actor and x.order_id=any(ids) order by (select number from public.pro_purchase_orders where owner_id=p_actor and id=x.order_id) limit 1;
 if t_first.order_id is not null then
  insert into public.pro_purchase_order_terms(owner_id,order_id,delivery_address,payment_terms) values(p_actor,nid,t_first.delivery_address,t_first.payment_terms) on conflict do nothing;
 end if;
 for src in select value from jsonb_array_elements(srcs) loop
  perform public.pro_purchase_orders_mutate(p_actor,jsonb_build_object('action','cancel','actionId',public.pro_po_derived_uuid('merge-cancel:'||aid::text||':'||(src->>'id')),'workId',wid,'id',(src->>'id')::uuid,
   'revision',(src->>'revision')::integer,'reason','Combinada en '||code));
  cancelled:=cancelled||jsonb_build_array(src->>'id');
 end loop;
 select public.pro_purchase_order_json(x) into created from public.pro_purchase_orders x where owner_id=p_actor and id=nid;
 result:=jsonb_build_object('order',created,'cancelled',cancelled);
 insert into public.pro_purchase_order_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===== Flat export: one row per order line (all orders of the job, at most 20000 rows) =====
create or replace function public.pro_purchase_order_export(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,'rows',coalesce((select jsonb_agg(row_json order by ord) from (
  select jsonb_build_object('code','OC-'||lpad(o.number::text,4,'0'),'status',o.status,'supplier',o.supplier_name,'title',o.title,'issueDate',o.issue_date,'expectedDate',o.expected_date,
    'deliveryAddress',t.delivery_address,'paymentTerms',t.payment_terms,'position',l.position,'description',l.description,'quantity',l.quantity,'unit',l.unit,'unitCents',l.unit_cents,
    'taxRate',l.tax_rate,'subtotalCents',l.subtotal_cents,'taxCents',l.tax_cents,'totalCents',l.subtotal_cents+l.tax_cents,
    'receivedQuantity',coalesce((select sum(r.quantity) from public.pro_purchase_order_receipts r where r.owner_id=l.owner_id and r.line_id=l.id),0),
    'vendorResponse',(select r.response from public.pro_po_vendor_responses r where r.owner_id=o.owner_id and r.order_id=o.id order by r.responded_at desc,r.action_id limit 1)) row_json,
   o.number*1000+l.position ord
  from public.pro_purchase_orders o join public.pro_purchase_order_lines l on l.owner_id=o.owner_id and l.order_id=o.id
  left join public.pro_purchase_order_terms t on t.owner_id=o.owner_id and t.order_id=o.id
  where o.owner_id=p_actor and o.work_id=p_work order by o.number,l.position limit 20000) q),'[]'::jsonb));
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_purchase_order_terms','pro_po_vendor_links','pro_po_vendor_responses','pro_po_vendor_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro_po_vendor%' or p.proname in('pro_po_derived_uuid','pro_po_uuid_value','pro_purchase_order_terms_read','pro_purchase_order_terms_set','pro_purchase_orders_merge','pro_purchase_order_export')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_po_vendor_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
