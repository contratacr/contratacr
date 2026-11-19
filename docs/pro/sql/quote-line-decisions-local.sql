-- LOCAL PRO ONLY. Fix 14 — parity register row 39: visual proposal with per-item customer approval.
-- On a quote version shared with a linked customer (pro_private_estimate_publications), the customer
-- approves or declines EACH line («partida»), with an optional note, while the version is open
-- (shared / changes requested). The professional sees every decision and the approved total; the
-- version's own answer (accept / decline / ask for changes) is unchanged and stays the formal reply.
-- A line shows the image of its catalog item (pro_product_details) when the estimate line with the
-- same id is linked to an item that has one. Writer: CAS per line (revision, 40001), idempotent
-- actionId with an immutable receipt, immutable history. Nothing is sent, charged or invoiced.
begin;

create table if not exists public.pro_quote_line_decisions(
 publication_id uuid not null references public.pro_private_estimate_publications(id) on delete cascade,
 line_id uuid not null,decision text check(decision in('approved','declined')),
 note text not null default '' check(length(note)<=300 and note=btrim(note)),
 decided_by uuid not null references public.profiles(id) on delete cascade,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(publication_id,line_id)
);
create table if not exists public.pro_quote_line_decision_history(
 publication_id uuid not null references public.pro_private_estimate_publications(id) on delete cascade,
 line_id uuid not null,revision integer not null,action_id uuid not null,actor_id uuid not null,
 decision text,note text not null default '',at timestamptz not null default clock_timestamp(),
 primary key(publication_id,line_id,revision)
);
create table if not exists public.pro_quote_line_decision_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
create or replace function public.pro_quote_line_decision_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Line decision history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_quote_line_decision_history_immutable on public.pro_quote_line_decision_history;
-- Update only: deleting the publication or the account still cascades (same rule as the other Pro histories).
create trigger pro_quote_line_decision_history_immutable before update on public.pro_quote_line_decision_history for each row execute function public.pro_quote_line_decision_immutable();
drop trigger if exists pro_quote_line_decision_action_immutable on public.pro_quote_line_decision_actions;
create trigger pro_quote_line_decision_action_immutable before update on public.pro_quote_line_decision_actions for each row execute function public.pro_quote_line_decision_immutable();

-- Line total in cents (same order as the document: quantity × price, discount, then tax).
create or replace function public.pro_quote_line_total(p_line jsonb) returns bigint
language sql immutable security invoker set search_path=public,pg_temp as $$
 with b as(select round(coalesce((p_line->>'qtyMilli')::numeric,0)*coalesce((p_line->>'unitPriceCents')::numeric,0)/1000) base),
 d as(select base-round(base*coalesce((p_line->>'discountBps')::numeric,0)/10000) net from b)
 select (net+round(net*coalesce((p_line->>'taxBps')::numeric,0)/10000))::bigint from d;
$$;

create or replace function public.pro_quote_line_decisions_read(p_actor uuid,p_publication uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare side text;v public.pro_private_estimate_publications;s public.pro_private_estimate_publication_states;lines jsonb;open boolean;
begin
 side:=public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 select * into v from public.pro_private_estimate_publications where id=p_publication;
 select * into s from public.pro_private_estimate_publication_states where publication_id=p_publication;
 open:=s.status in('shared','changes_requested') and coalesce(public.pro_private_work_tools_enabled(v.owner_id),false)
  and(v.content->>'validUntil' is null or(v.content->>'validUntil')::date>=(clock_timestamp() at time zone 'America/Costa_Rica')::date);
 select coalesce(jsonb_agg(jsonb_build_object('lineId',l.value->>'id','position',l.ord,'description',l.value->>'description','unit',l.value->>'unit',
   'qtyMilli',(l.value->>'qtyMilli')::bigint,'unitPriceCents',(l.value->>'unitPriceCents')::bigint,'totalCents',public.pro_quote_line_total(l.value),
   'hasImage',exists(select 1 from public.pro_private_estimate_items i join public.pro_product_details pd on pd.user_id=v.owner_id and pd.product_id=i.content->>'catalogProductId' and pd.image_id is not null
     where i.owner_id=v.owner_id and i.estimate_id=v.estimate_id and i.id::text=l.value->>'id'),
   'decision',d.decision,'note',coalesce(d.note,''),'revision',coalesce(d.revision,0),'decidedAt',d.updated_at) order by l.ord),'[]'::jsonb) into lines
  from jsonb_array_elements(coalesce(v.content->'lines','[]'::jsonb)) with ordinality l(value,ord)
  left join public.pro_quote_line_decisions d on d.publication_id=p_publication and d.line_id::text=l.value->>'id';
 return jsonb_build_object('publicationId',p_publication,'side',side,'status',s.status,'version',v.version,'title',v.content->>'title','currency',coalesce(v.content->>'currency','CRC'),
  'canDecide',side='client' and open,'lines',lines,'totalCents',(v.content->>'totalCents')::bigint,
  'approvedCents',(select coalesce(sum((x->>'totalCents')::bigint),0) from jsonb_array_elements(lines) x where x->>'decision'='approved'),
  'declinedCents',(select coalesce(sum((x->>'totalCents')::bigint),0) from jsonb_array_elements(lines) x where x->>'decision'='declined'),
  'approvedCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision'='approved'),
  'declinedCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision'='declined'),
  'pendingCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision' is null));
end $$;

-- {actionId, publicationId, lineId, decision:'approved'|'declined'|null, note, revision}. Only the linked customer, only while the version is open.
create or replace function public.pro_quote_line_decide(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;lid uuid;dec text;note_text text;rev integer;side text;receipt public.pro_quote_line_decision_actions;v public.pro_private_estimate_publications;s public.pro_private_estimate_publication_states;d public.pro_quote_line_decisions;result jsonb;next_rev integer;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from array['actionId','decision','lineId','note','publicationId','revision']
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'publicationId') is distinct from 'string' or jsonb_typeof(p_input->'lineId') is distinct from 'string'
  or jsonb_typeof(p_input->'decision') not in('string','null') or jsonb_typeof(p_input->'note') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  then raise exception 'Invalid line decision' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;pid:=(p_input->>'publicationId')::uuid;lid:=(p_input->>'lineId')::uuid;dec:=p_input->>'decision';note_text:=btrim(p_input->>'note');
 if dec is not null and dec not in('approved','declined') or length(note_text)>300 then raise exception 'Invalid line decision' using errcode='22023';end if;
 if (p_input->>'revision')::numeric<>trunc((p_input->>'revision')::numeric) or (p_input->>'revision')::numeric not between 0 and 2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 select * into receipt from public.pro_quote_line_decision_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action reused' using errcode='22023';end if;return receipt.result;end if;
 side:=public.pro_private_estimate_publication_authorize(p_actor,pid,true);
 if side<>'client' then raise exception 'Only the customer decides' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-quote-line:'||pid::text||':'||lid::text,0));
 select * into v from public.pro_private_estimate_publications where id=pid;
 select * into s from public.pro_private_estimate_publication_states where publication_id=pid for share;
 if s.status not in('shared','changes_requested') or (v.content->>'validUntil') is not null and (v.content->>'validUntil')::date<(clock_timestamp() at time zone 'America/Costa_Rica')::date
  then raise exception 'This version is closed' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(v.content->'lines','[]'::jsonb)) l where l->>'id'=lid::text) then raise exception 'Unknown line' using errcode='P0002';end if;
 select * into d from public.pro_quote_line_decisions where publication_id=pid and line_id=lid for update;
 if coalesce(d.revision,0)<>rev then raise exception 'Line decision changed' using errcode='40001';end if;
 next_rev:=rev+1;
 insert into public.pro_quote_line_decisions(publication_id,line_id,decision,note,decided_by,revision,updated_at) values(pid,lid,dec,note_text,p_actor,next_rev,clock_timestamp())
  on conflict(publication_id,line_id) do update set decision=excluded.decision,note=excluded.note,decided_by=excluded.decided_by,revision=excluded.revision,updated_at=excluded.updated_at;
 insert into public.pro_quote_line_decision_history(publication_id,line_id,revision,action_id,actor_id,decision,note) values(pid,lid,next_rev,aid,p_actor,dec,note_text);
 result:=public.pro_quote_line_decisions_read(p_actor,pid);
 insert into public.pro_quote_line_decision_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Image of a line's catalog item, for the owner or the recipient of that version (storage metadata only).
create or replace function public.pro_quote_line_image(p_actor uuid,p_publication uuid,p_line uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.pro_private_estimate_publications;pd public.pro_product_details;
begin
 perform public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 select * into v from public.pro_private_estimate_publications where id=p_publication;
 if not exists(select 1 from jsonb_array_elements(coalesce(v.content->'lines','[]'::jsonb)) l where l->>'id'=p_line::text) then return null;end if;
 select x.* into pd from public.pro_private_estimate_items i join public.pro_product_details x on x.user_id=v.owner_id and x.product_id=i.content->>'catalogProductId'
  where i.owner_id=v.owner_id and i.estimate_id=v.estimate_id and i.id=p_line and x.image_id is not null;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',pd.image_path,'sha256',pd.image_sha256,'sizeBytes',pd.image_size,'imageId',pd.image_id);
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_quote_line_decisions','pro_quote_line_decision_history','pro_quote_line_decision_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
  -- Closing round (security review B1): Supabase grants ALL to service_role by default; server code may
  -- never delete or truncate the customer's decisions, their history or receipts. Deleting the publication
  -- or the account still cascades (referential actions run as the table owner, not as service_role).
  execute format('revoke delete,truncate on public.%I from service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'pro_quote_line_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_quote_line_decision_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
