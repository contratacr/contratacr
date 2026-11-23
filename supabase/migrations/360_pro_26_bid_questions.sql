-- Pro (parity register row 53): questions and answers between an invited vendor and the owner of a bid.
-- The vendor (no ContrataCR account, portal session) asks questions about the package until the bid
-- closes; the owner answers each one once. A question and its answer are visible only to the owner
-- and to that vendor's invitation (never to other vendors, never public). Nothing is e-mailed.
-- New objects plus a re-definition of pro_bid_portal_vendor_extras that adds two keys
-- (canAsk, questions); every other key and rule of that function is unchanged. Reapplicable.
begin;
create table if not exists public.pro_bid_questions(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,
 package_id uuid not null,supplier_id uuid not null,link_id uuid not null,
 question text not null check(length(btrim(question)) between 1 and 1000 and question !~ '[[:cntrl:]]'),
 asked_at timestamptz not null default now(),
 answer text check(answer is null or (length(btrim(answer)) between 1 and 2000 and answer !~ '[[:cntrl:]]')),
 answered_at timestamptz,
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id) on delete cascade,
 foreign key(owner_id,link_id) references public.pro_bid_portal_links(owner_id,id) on delete cascade,
 check((answer is null)=(answered_at is null))
);
create index if not exists pro_bid_questions_vendor on public.pro_bid_questions(owner_id,package_id,supplier_id,asked_at,id);
create index if not exists pro_bid_questions_link on public.pro_bid_questions(owner_id,link_id);

-- Identity, text and time of a question never change; an answer is written once.
create or replace function public.pro_bid_question_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.id,new.owner_id,new.package_id,new.supplier_id,new.link_id,new.question,new.asked_at)
  is distinct from (old.id,old.owner_id,old.package_id,old.supplier_id,old.link_id,old.question,old.asked_at)
  or old.answer is not null then
  raise exception 'Bid questions only move forward' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists pro_bid_question_guard on public.pro_bid_questions;
create trigger pro_bid_question_guard before update on public.pro_bid_questions for each row execute function public.pro_bid_question_guard();

create or replace function public.pro_bid_question_json(p_row public.pro_bid_questions) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'question',p_row.question,'askedAt',p_row.asked_at,'answer',p_row.answer,'answeredAt',p_row.answered_at)
$$;

-- Vendor: asks a question (idempotent by questionId). Only while the bid is open.
create or replace function public.pro_bid_portal_question_ask(p_session_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_bid_portal_links;r public.pro_bid_packages;q public.pro_bid_questions;keys text[];qid uuid;txt text;today date:=public.pro_bid_today();
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid question' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['questionId','text'] or jsonb_typeof(p_input->'text') is distinct from 'string' then raise exception 'Invalid question fields' using errcode='22023';end if;
 qid:=public.pro_bid_uuid_value(p_input->'questionId');
 txt:=btrim(p_input->>'text');
 if length(txt) not between 1 and 1000 or txt ~ '[[:cntrl:]]' then raise exception 'Invalid question text' using errcode='22023';end if;
 l:=public.pro_bid_portal_session_link(p_session_hash);
 if l.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if not found then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||l.owner_id::text||':'||r.work_id,0));
 select * into l from public.pro_bid_portal_links where owner_id=l.owner_id and id=l.id for update;
 if not found or l.session_hash is distinct from public.pro_bid_portal_hash(p_session_hash) or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Forbidden' using errcode='42501';end if;
 select * into q from public.pro_bid_questions where id=qid;
 if found then
  -- Same request retried (lost reply): same link and same text return the same question.
  if q.owner_id<>l.owner_id or q.link_id<>l.id or q.question<>txt then raise exception 'Question identity reused' using errcode='22023';end if;
  return jsonb_build_object('question',public.pro_bid_question_json(q));
 end if;
 select * into r from public.pro_bid_packages where owner_id=l.owner_id and id=l.package_id;
 if r.status<>'open' or r.due_date<today then raise exception 'The bid is closed' using errcode='22023',hint='pro_bid_portal_closed';end if;
 if (select count(*) from public.pro_bid_questions where owner_id=l.owner_id and package_id=l.package_id and supplier_id=l.supplier_id)>=20 then
  raise exception 'Question limit' using errcode='CR429',hint='pro_bid_portal_question_limit';end if;
 insert into public.pro_bid_questions(id,owner_id,package_id,supplier_id,link_id,question) values(qid,l.owner_id,l.package_id,l.supplier_id,l.id,txt) returning * into q;
 return jsonb_build_object('question',public.pro_bid_question_json(q));
end $$;

-- Owner: every question of a package (all vendors) with the vendor that asked.
create or replace function public.pro_bid_questions_owner_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare keys text[];pid uuid;r public.pro_bid_packages;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid query' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if keys is distinct from array['id','view','workId'] or p_query->>'view' is distinct from 'questions' or jsonb_typeof(p_query->'workId') is distinct from 'string'
  or length(p_query->>'workId') not between 1 and 160 then raise exception 'Invalid query' using errcode='22023';end if;
 pid:=public.pro_bid_uuid_value(p_query->'id');
 select * into r from public.pro_bid_packages where owner_id=p_actor and work_id=p_query->>'workId' and id=pid;
 if not found then return null;end if;
 return jsonb_build_object('packageId',r.id,'questions',coalesce((select jsonb_agg(public.pro_bid_question_json(q)||jsonb_build_object('supplierId',q.supplier_id) order by q.asked_at,q.id)
  from public.pro_bid_questions q where q.owner_id=p_actor and q.package_id=r.id),'[]'::jsonb));
end $$;

-- Owner: answers a question once (idempotent when the same answer is replayed).
create or replace function public.pro_bid_question_answer(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];qid uuid;wid text;txt text;q public.pro_bid_questions;r public.pro_bid_packages;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid answer' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','answer','questionId','workId'] or p_input->>'action' is distinct from 'answer_question'
  or jsonb_typeof(p_input->'answer') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then
  raise exception 'Invalid answer fields' using errcode='22023';end if;
 qid:=public.pro_bid_uuid_value(p_input->'questionId');wid:=p_input->>'workId';txt:=btrim(p_input->>'answer');
 if length(txt) not between 1 and 2000 or txt ~ '[[:cntrl:]]' then raise exception 'Invalid answer text' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||p_actor::text||':'||wid,0));
 select * into q from public.pro_bid_questions where id=qid and owner_id=p_actor for update;
 if not found then raise exception 'Question not found' using errcode='40001';end if;
 select * into r from public.pro_bid_packages where owner_id=p_actor and id=q.package_id and work_id=wid;
 if not found then raise exception 'Question not found' using errcode='40001';end if;
 if q.answer is not null then
  if q.answer<>txt then raise exception 'Question already answered' using errcode='40001';end if;
  return jsonb_build_object('question',public.pro_bid_question_json(q)||jsonb_build_object('supplierId',q.supplier_id),'replayed',true);
 end if;
 if r.status='cancelled' then raise exception 'The bid was cancelled' using errcode='40001';end if;
 update public.pro_bid_questions set answer=txt,answered_at=now() where id=q.id returning * into q;
 return jsonb_build_object('question',public.pro_bid_question_json(q)||jsonb_build_object('supplierId',q.supplier_id),'replayed',false);
end $$;

-- Vendor view extras: the vendor's own attachments and award notice (unchanged) plus its own questions.
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
  'outcome',outcome,
  'canAsk',r.status='open' and r.due_date>=today,
  'questions',coalesce((select jsonb_agg(public.pro_bid_question_json(q) order by q.asked_at,q.id) from public.pro_bid_questions q
   where q.owner_id=l.owner_id and q.package_id=l.package_id and q.supplier_id=l.supplier_id),'[]'::jsonb));
end $$;

alter table public.pro_bid_questions enable row level security;
revoke all on public.pro_bid_questions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_bid_questions to service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('pro_bid_question_guard','pro_bid_question_json','pro_bid_portal_question_ask','pro_bid_questions_owner_read','pro_bid_question_answer','pro_bid_portal_vendor_extras') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_bid_question_guard' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
