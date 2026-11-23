-- Row 39 (proposal with approval per line): the customer's per-line approval becomes the FORMAL partial response of the shared
-- version. When every line is decided (at least one approved and at least one not approved) the linked customer sends it once:
-- an immutable record (who, when, which lines, amounts, the version's content hash) that freezes the line decisions of that version.
-- The version's own answer (accept / decline / ask for changes) is not replaced; nothing is sent, charged or invoiced.
-- Same patterns as the line decisions: idempotent actionId receipt, owner/customer authorization, immutable rows, service_role only.
begin;

create table if not exists public.pro_quote_line_responses(
 publication_id uuid primary key references public.pro_private_estimate_publications(id) on delete cascade,
 responded_by uuid not null references public.profiles(id) on delete cascade,
 responded_at timestamptz not null default clock_timestamp(),
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 currency text not null check(currency in('CRC','USD')),
 approved_line_ids jsonb not null check(jsonb_typeof(approved_line_ids)='array' and jsonb_array_length(approved_line_ids)>=1),
 declined_line_ids jsonb not null check(jsonb_typeof(declined_line_ids)='array' and jsonb_array_length(declined_line_ids)>=1),
 approved_cents bigint not null check(approved_cents>=0),declined_cents bigint not null check(declined_cents>=0),
 note text not null default '' check(length(note)<=300 and note=btrim(note))
);
create table if not exists public.pro_quote_line_response_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
-- Responses and receipts never change (deleting the publication or the account still cascades).
drop trigger if exists pro_quote_line_response_immutable on public.pro_quote_line_responses;
create trigger pro_quote_line_response_immutable before update on public.pro_quote_line_responses for each row execute function public.pro_quote_line_decision_immutable();
drop trigger if exists pro_quote_line_response_action_immutable on public.pro_quote_line_response_actions;
create trigger pro_quote_line_response_action_immutable before update on public.pro_quote_line_response_actions for each row execute function public.pro_quote_line_decision_immutable();

-- After the formal response the line decisions of that version are frozen (decide/clear raise "closed").
create or replace function public.pro_quote_line_decision_frozen() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.pro_quote_line_responses where publication_id=new.publication_id) then raise exception 'This version is closed' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_quote_line_decision_frozen on public.pro_quote_line_decisions;
create trigger pro_quote_line_decision_frozen before insert or update on public.pro_quote_line_decisions for each row execute function public.pro_quote_line_decision_frozen();

create or replace function public.pro_quote_line_response_json(p_publication uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('publicationId',r.publication_id,'respondedAt',r.responded_at,'respondedByName',coalesce(nullif(btrim(p.full_name),''),''),'contentHash',r.content_hash,'currency',r.currency,
  'approvedLineIds',r.approved_line_ids,'declinedLineIds',r.declined_line_ids,'approvedCount',jsonb_array_length(r.approved_line_ids),'declinedCount',jsonb_array_length(r.declined_line_ids),
  'approvedCents',r.approved_cents,'declinedCents',r.declined_cents,'note',r.note)
 from public.pro_quote_line_responses r left join public.profiles p on p.id=r.responded_by where r.publication_id=p_publication $$;

-- Either side of the version may read it; null while there is no formal response.
create or replace function public.pro_quote_line_response_read(p_actor uuid,p_publication uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 return public.pro_quote_line_response_json(p_publication);
end $$;

-- {actionId, publicationId, note}. Only the linked customer, only while the version is open, only with every line decided.
create or replace function public.pro_quote_line_respond(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;note_text text;receipt public.pro_quote_line_response_actions;side text;v public.pro_private_estimate_publications;s public.pro_private_estimate_publication_states;view jsonb;result jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from array['actionId','note','publicationId']
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'publicationId') is distinct from 'string' or jsonb_typeof(p_input->'note') is distinct from 'string'
  then raise exception 'Invalid response' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;pid:=(p_input->>'publicationId')::uuid;exception when others then raise exception 'Invalid response' using errcode='22023';end;
 note_text:=btrim(p_input->>'note');if length(note_text)>300 then raise exception 'Invalid response' using errcode='22023';end if;
 select * into receipt from public.pro_quote_line_response_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action reused' using errcode='22023';end if;return receipt.result;end if;
 side:=public.pro_private_estimate_publication_authorize(p_actor,pid,true);
 if side<>'client' then raise exception 'Only the customer responds' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-quote-line-response:'||pid::text,0));
 select * into v from public.pro_private_estimate_publications where id=pid;
 select * into s from public.pro_private_estimate_publication_states where publication_id=pid for share;
 if s.status not in('shared','changes_requested') or (v.content->>'validUntil') is not null and (v.content->>'validUntil')::date<(clock_timestamp() at time zone 'America/Costa_Rica')::date
  then raise exception 'This version is closed' using errcode='22023';end if;
 if exists(select 1 from public.pro_quote_line_responses where publication_id=pid) then raise exception 'Already responded' using errcode='40001';end if;
 view:=public.pro_quote_line_decisions_read(p_actor,pid);
 if (view->>'pendingCount')::integer>0 or (view->>'approvedCount')::integer<1 or (view->>'declinedCount')::integer<1 then raise exception 'Partial response needs every line decided' using errcode='22023';end if;
 insert into public.pro_quote_line_responses(publication_id,responded_by,content_hash,currency,approved_line_ids,declined_line_ids,approved_cents,declined_cents,note)
 select pid,p_actor,v.content_hash,coalesce(v.content->>'currency','CRC'),
  (select jsonb_agg(x->'lineId' order by ord) from jsonb_array_elements(view->'lines') with ordinality t(x,ord) where x->>'decision'='approved'),
  (select jsonb_agg(x->'lineId' order by ord) from jsonb_array_elements(view->'lines') with ordinality t(x,ord) where x->>'decision'='declined'),
  (view->>'approvedCents')::bigint,(view->>'declinedCents')::bigint,note_text;
 result:=public.pro_quote_line_response_json(pid);
 insert into public.pro_quote_line_response_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_quote_line_responses','pro_quote_line_response_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
  execute format('revoke delete,truncate on public.%I from service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_quote_line_decision_frozen','pro_quote_line_response_json','pro_quote_line_response_read','pro_quote_line_respond') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
