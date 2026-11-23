-- Rows 35 and 39: a quote becomes the ACCEPTED AGREEMENT of a job without the customer pressing "Accept" in the platform, in two explicit ways:
--  * 'external': the professional records an acceptance that happened outside the platform (signed paper, e-mail, WhatsApp, phone, in person):
--    who accepted (typed name), when (date), how, and an evidence note. Nothing is presumed: the record is the professional's statement.
--  * 'partial_response': the customer's FORMAL partial response (pro_quote_line_responses) is converted directly: a new quote with only the lines the
--    customer approved is created from the shared version (pro_quote_line_decisions_convert) and becomes the agreement, with that response as evidence.
-- Either way a new immutable version of the quote is stored and linked as the job's agreement through the same ledger the customer's own acceptance uses
-- (pro_private_estimate_work_agreements), under the same continuation rules (pro_private_estimate_work_reason). CRC only: the finance readers of the job
-- (agreed amount, balance, lines to invoice) are CRC; a USD quote is refused instead of showing an agreed amount of zero. Nothing is sent or charged.
begin;

create table if not exists public.pro_quote_recorded_acceptances(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 publication_id uuid primary key references public.pro_private_estimate_publications(id) on delete cascade,
 action_id uuid not null,kind text not null check(kind in('external','partial_response')),
 work_id text not null,method text not null check(method in('signed_paper','email','whatsapp','phone','in_person','partial_response')),
 accepted_on date not null,accepted_by_name text not null check(length(accepted_by_name) between 2 and 120),
 evidence_note text not null default '' check(length(evidence_note)<=500),
 source_publication_id uuid references public.pro_private_estimate_publications(id) on delete set null,
 input jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(owner_id,action_id),
 check((kind='external' and length(evidence_note)>=10 and source_publication_id is null) or (kind='partial_response' and method='partial_response')));
create unique index if not exists pro_quote_recorded_acceptances_source on public.pro_quote_recorded_acceptances(source_publication_id) where source_publication_id is not null;
create or replace function public.pro_quote_recorded_acceptance_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Recorded acceptances are immutable' using errcode='23514';end $$;
drop trigger if exists pro_quote_recorded_acceptance_immutable on public.pro_quote_recorded_acceptances;
create trigger pro_quote_recorded_acceptance_immutable before update on public.pro_quote_recorded_acceptances for each row execute function public.pro_quote_recorded_acceptance_immutable();

-- The agreed content of a recorded acceptance cannot be edited afterwards (a new revision of the draft would diverge from the agreement).
create or replace function public.pro_quote_recorded_acceptance_estimate_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.revision is distinct from old.revision and exists(select 1 from public.pro_quote_recorded_acceptances r join public.pro_private_estimate_publications v on v.id=r.publication_id where v.owner_id=old.owner_id and v.estimate_id=old.id)
  then raise exception 'Accepted version is immutable' using errcode='40001';end if;
 return new;
end $$;
drop trigger if exists pro_quote_recorded_acceptance_estimate_guard on public.pro_private_estimates;
create trigger pro_quote_recorded_acceptance_estimate_guard before update on public.pro_private_estimates for each row execute function public.pro_quote_recorded_acceptance_estimate_guard();

create or replace function public.pro_quote_recorded_acceptance_json(p_publication uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('publicationId',r.publication_id,'kind',r.kind,'workId',r.work_id,'method',r.method,'acceptedOn',r.accepted_on,'acceptedByName',r.accepted_by_name,
  'evidenceNote',r.evidence_note,'sourcePublicationId',r.source_publication_id,'recordedAt',r.recorded_at,'estimateId',v.estimate_id,'version',v.version,'title',v.content->>'title',
  'currency',v.content->>'currency','totalCents',(v.content->>'totalCents')::bigint)
 from public.pro_quote_recorded_acceptances r join public.pro_private_estimate_publications v on v.id=r.publication_id where r.publication_id=p_publication $$;

-- Owner read: what can be recorded for a quote draft, the jobs of its customer, the recorded acceptance and, for a publication,
-- the formal partial response with its conversion. {estimateId} or {publicationId}.
create or replace function public.pro_quote_recorded_acceptance_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare eid uuid;pid uuid;d public.pro_private_estimates;v public.pro_private_estimate_publications;works jsonb;recorded jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid query' using errcode='22023';end if;
 begin eid:=(p_query->>'estimateId')::uuid;pid:=(p_query->>'publicationId')::uuid;exception when others then raise exception 'Invalid query' using errcode='22023';end;
 if (eid is null)=(pid is null) then raise exception 'Invalid query' using errcode='22023';end if;
 if pid is not null then
  select * into v from public.pro_private_estimate_publications where id=pid and owner_id=p_actor;
  if not found then raise exception 'Publication unavailable' using errcode='P0002';end if;
  return jsonb_build_object('publicationId',pid,'response',public.pro_quote_line_response_json(pid),
   'conversion',(select public.pro_quote_recorded_acceptance_json(r.publication_id) from public.pro_quote_recorded_acceptances r where r.owner_id=p_actor and r.source_publication_id=pid),
   'targetWorkId',public.pro_quote_circuit_target_work(p_actor,pid),
   'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'label',coalesce(nullif(btrim(w.service),''),w.id)||' · '||coalesce(w.client,'')) order by w.id)
     from public.pro_work w where w.user_id=p_actor and w."clientId"=v.client_id and not coalesce(w.cancelled,false)
      and not exists(select 1 from public.pro_private_estimate_work_agreements g where g.owner_id=p_actor and g.work_id=w.id)),'[]'::jsonb));
 end if;
 select * into d from public.pro_private_estimates where owner_id=p_actor and id=eid;
 if not found then raise exception 'Estimate unavailable' using errcode='P0002';end if;
 select public.pro_quote_recorded_acceptance_json(r.publication_id) into recorded from public.pro_quote_recorded_acceptances r join public.pro_private_estimate_publications v2 on v2.id=r.publication_id where v2.owner_id=p_actor and v2.estimate_id=eid;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'label',coalesce(nullif(btrim(w.service),''),w.id)||' · '||coalesce(w.client,'')) order by w.id),'[]'::jsonb) into works
  from public.pro_work w where w.user_id=p_actor and w."clientId"=d.client_id and not coalesce(w.cancelled,false)
   and not exists(select 1 from public.pro_private_estimate_work_agreements g where g.owner_id=p_actor and g.work_id=w.id);
 return jsonb_build_object('estimateId',eid,'revision',d.revision,'currency',d.currency,'totalCents',d.total_cents,'archived',d.archived,'recorded',recorded,'works',works,
  'accepted',exists(select 1 from public.pro_private_estimate_publications pv join public.pro_private_estimate_publication_states ps on ps.publication_id=pv.id where pv.owner_id=p_actor and pv.estimate_id=eid and ps.status='accepted'));
end $$;

create or replace function public.pro_quote_record_acceptance(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 act text;aid uuid;keys text[];prior public.pro_quote_recorded_acceptances;src public.pro_private_estimate_publications;resp public.pro_quote_line_responses;d public.pro_private_estimates;w public.pro_work;
 wid text;recipient uuid;actor_name text;acc_on date;method_text text;note_text text;eid uuid;pid uuid;reason text;m public.pro_manual_lead_works;hist jsonb;doc jsonb;lines jsonb;content jsonb;num integer;
 acc_at timestamptz;converted jsonb;result jsonb;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid acceptance' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act='external' then
  if keys is distinct from array['acceptedByName','acceptedOn','action','actionId','estimateId','estimateRevision','evidenceNote','method','workId'] then raise exception 'Invalid acceptance fields' using errcode='22023';end if;
 elsif act='partial_response' then
  if keys is distinct from array['action','actionId','publicationId','workId'] then raise exception 'Invalid acceptance fields' using errcode='22023';end if;
 else raise exception 'Invalid acceptance' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 if jsonb_typeof(p_input->'workId') not in('string','null') or length(coalesce(p_input->>'workId',''))>80 then raise exception 'Invalid job' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into prior from public.pro_quote_recorded_acceptances where owner_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Action reused' using errcode='22023';end if;return prior.result;end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 wid:=nullif(btrim(coalesce(p_input->>'workId','')),'');

 if act='external' then
  if jsonb_typeof(p_input->'estimateId') is distinct from 'string' or jsonb_typeof(p_input->'estimateRevision') is distinct from 'number' or not coalesce((p_input->>'estimateRevision')~'^[0-9]{1,9}$',false)
   or jsonb_typeof(p_input->'method') is distinct from 'string' or jsonb_typeof(p_input->'acceptedOn') is distinct from 'string' or jsonb_typeof(p_input->'acceptedByName') is distinct from 'string' or jsonb_typeof(p_input->'evidenceNote') is distinct from 'string'
   then raise exception 'Invalid acceptance fields' using errcode='22023';end if;
  begin eid:=(p_input->>'estimateId')::uuid;acc_on:=(p_input->>'acceptedOn')::date;exception when others then raise exception 'Invalid acceptance fields' using errcode='22023';end;
  method_text:=p_input->>'method';actor_name:=btrim(p_input->>'acceptedByName');note_text:=btrim(p_input->>'evidenceNote');
  if method_text not in('signed_paper','email','whatsapp','phone','in_person') or length(actor_name) not between 2 and 120 or actor_name~'[[:cntrl:]]' or length(note_text) not between 10 and 500 or note_text~'[\x00-\x08\x0b\x0c\x0e-\x1f]'
   or acc_on>today or acc_on<today-365 then raise exception 'Invalid acceptance fields' using errcode='22023';end if;
  if wid is null then raise exception 'Choose the job' using errcode='22023';end if;
  select * into d from public.pro_private_estimates where owner_id=p_actor and id=eid for update;
  if not found then raise exception 'Estimate unavailable' using errcode='P0002';end if;
  if d.archived or d.revision<>(p_input->>'estimateRevision')::integer then raise exception 'Saved draft changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_private_estimate_publications pv join public.pro_private_estimate_publication_states ps on ps.publication_id=pv.id where pv.owner_id=p_actor and pv.estimate_id=eid and ps.status='accepted') then raise exception 'Accepted version is immutable' using errcode='40001';end if;
  recipient:=p_actor;
 else
  begin pid:=(p_input->>'publicationId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
  select * into src from public.pro_private_estimate_publications where id=pid and owner_id=p_actor;
  if not found then raise exception 'Publication unavailable' using errcode='P0002';end if;
  select * into resp from public.pro_quote_line_responses where publication_id=pid;
  if not found then raise exception 'The customer has not sent a formal partial response' using errcode='40001';end if;
  if exists(select 1 from public.pro_quote_recorded_acceptances where source_publication_id=pid) then raise exception 'Already converted' using errcode='40001';end if;
  if wid is null then wid:=public.pro_quote_circuit_target_work(p_actor,pid);end if;
  if wid is null then raise exception 'Choose the job' using errcode='22023';end if;
  recipient:=resp.responded_by;actor_name:=left(coalesce(nullif(btrim((select full_name from public.profiles where id=resp.responded_by)),''),'Cliente'),120);
  acc_on:=(resp.responded_at at time zone 'America/Costa_Rica')::date;method_text:='partial_response';note_text:='';
  converted:=public.pro_quote_line_decisions_convert(p_actor,jsonb_build_object('action','convert_approved','actionId',public.pro_quote_circuit_uuid(aid::text||':convert'),'publicationId',pid,'targetEstimateId',public.pro_quote_circuit_uuid(aid::text||':estimate')));
  eid:=public.pro_quote_circuit_uuid(aid::text||':estimate');
  select * into d from public.pro_private_estimates where owner_id=p_actor and id=eid for update;
  if not found then raise exception 'Estimate unavailable' using errcode='P0002';end if;
 end if;

 if d.currency<>'CRC' then raise exception 'Only quotes in colones can become the agreement of a job' using errcode='22023';end if;
 if d.total_cents<=0 or not exists(select 1 from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=d.id) then raise exception 'The quote has no amount to agree' using errcode='22023';end if;
 if not exists(select 1 from public.pro_clients where user_id=p_actor and id=d.client_id and not coalesce(archived,false)) then raise exception 'Restore the customer first' using errcode='40001';end if;
 -- The job must belong to the same customer, follow the continuation rules and match the quote's origin.
 begin select * into w from public.pro_work where user_id=p_actor and id=wid for update nowait;exception when lock_not_available then raise exception 'Work is being changed' using errcode='40001';end;
 if not found then raise exception 'Job unavailable' using errcode='P0002';end if;
 pid:=public.pro_quote_circuit_uuid(aid::text||':publication');
 reason:=public.pro_private_estimate_work_reason(p_actor,wid,d.client_id,case when act='partial_response' then recipient else null end,pid);
 if reason is not null then raise exception 'Work continuation unavailable: %',reason using errcode='40001';end if;
 if d.source->>'kind'='work' and d.source->>'id'<>wid then raise exception 'The quote belongs to another job' using errcode='40001';end if;
 if d.source->>'kind'='manual' then
  select * into m from public.pro_manual_lead_works where owner_id=p_actor and lead_id=(d.source->>'id')::uuid;
  if not found then raise exception 'Convert the opportunity to a job first' using errcode='40001';end if;
  if m.work_id_text<>wid then raise exception 'The opportunity was converted into another job' using errcode='40001';end if;
 end if;

 -- New immutable version of the quote (same projection the publish writer stores).
 doc:=public.pro_private_estimate_json(d);
 select jsonb_agg(jsonb_build_object('id',value->'id','description',value->'description','unit',value->'unit','qtyMilli',value->'qtyMilli','unitPriceCents',value->'unitPriceCents','discountBps',value->'discountBps','taxBps',value->'taxBps')||jsonb_strip_nulls(jsonb_build_object('group',value->'group')) order by ord)
  into lines from jsonb_array_elements(doc->'lines') with ordinality e(value,ord);
 content:=jsonb_build_object('title',d.title,'currency',d.currency,'validUntil',d.valid_until,'notes',d.notes,'issuer',jsonb_build_object('issuerName',d.issuer->'issuerName','issuerIdType',d.issuer->'issuerIdType','issuerId',d.issuer->'issuerId','issuerEmail',d.issuer->'issuerEmail','issuerPhone',d.issuer->'issuerPhone','issuerAddress',d.issuer->'issuerAddress'),
  'customer',jsonb_build_object('name',d.client_snapshot->'name','tradeName',d.client_snapshot->'tradeName','identification',d.client_snapshot->'identification','address',d.client_snapshot->'address'),'lines',lines,
  'subtotalCents',d.subtotal_cents,'discountCents',d.discount_cents,'taxCents',d.tax_cents,'totalCents',d.total_cents);
 select coalesce(max(version),0)+1 into num from public.pro_private_estimate_publications where owner_id=p_actor and estimate_id=d.id;
 select jsonb_agg(h.after_estimate) into hist from public.pro_private_estimate_history h where h.owner_id=p_actor and h.estimate_id=d.id and (h.after_estimate->>'revision')::integer=d.revision;
 if jsonb_array_length(coalesce(hist,'[]'::jsonb))<>1 then raise exception 'Historical source unavailable' using errcode='40001';end if;
 insert into public.pro_private_estimate_publications(owner_id,id,estimate_id,client_id,version,estimate_revision,content,content_hash,created_at)
 values(p_actor,pid,d.id,d.client_id,num,d.revision,content,encode(sha256(convert_to(content::text,'UTF8')),'hex'),
  greatest(clock_timestamp(),coalesce((select max(created_at)+interval '1 microsecond' from public.pro_private_estimate_publications where owner_id=p_actor and estimate_id=d.id),clock_timestamp())));
 insert into public.pro_private_estimate_publication_states(publication_id,revision,status,recipient_id) values(pid,2,'accepted',recipient);
 insert into public.pro_private_estimate_publication_events(publication_id,action_id,action,revision,actor_id,note) values(pid,aid,'publish',1,p_actor,''),(pid,aid,'record_acceptance',2,p_actor,left(note_text,1000));
 acc_at:=case when act='partial_response' then resp.responded_at else ((acc_on::text||' 12:00')::timestamp at time zone 'America/Costa_Rica') end;
 insert into public.pro_private_estimate_work_agreements(owner_id,work_id,publication_id,estimate_id,version,estimate_revision,client_id,title,currency,total_cents,content_hash,accepted_action_id,accepted_actor_id,accepted_at,source_snapshot,work_snapshot)
 select p_actor,w.id,pid,d.id,num,d.revision,d.client_id,d.title,d.currency,d.total_cents,v.content_hash,aid,recipient,acc_at,hist->0,public.pro_private_estimate_work_json(w) from public.pro_private_estimate_publications v where v.id=pid;
 result:=jsonb_build_object('action',act,'publicationId',pid,'estimateId',d.id,'workId',wid,'version',num,'currency',d.currency,'totalCents',d.total_cents,'acceptedOn',acc_on,'acceptedByName',actor_name,'method',method_text,
  'lineCount',(select count(*) from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=d.id));
 insert into public.pro_quote_recorded_acceptances(owner_id,publication_id,action_id,kind,work_id,method,accepted_on,accepted_by_name,evidence_note,source_publication_id,input,result)
 values(p_actor,pid,aid,act,wid,method_text,acc_on,actor_name,note_text,case when act='partial_response' then (p_input->>'publicationId')::uuid end,p_input,result);
 return result;
end $$;

do $$declare t text;f record;begin
 execute 'alter table public.pro_quote_recorded_acceptances enable row level security';
 execute 'revoke all on public.pro_quote_recorded_acceptances from public,anon,authenticated';
 execute 'grant select,insert,update on public.pro_quote_recorded_acceptances to service_role';
 execute 'revoke delete,truncate on public.pro_quote_recorded_acceptances from service_role';
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_quote_recorded_acceptance_immutable','pro_quote_recorded_acceptance_estimate_guard','pro_quote_recorded_acceptance_json','pro_quote_recorded_acceptance_read','pro_quote_record_acceptance') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
notify pgrst,'reload schema';
commit;
