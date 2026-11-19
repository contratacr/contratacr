-- LOCAL PRO ONLY. Round 6C (2026-11-13): follow-up of Round 6B — a SIGNED electronic signature request updates
-- the acceptance state of its document AUTOMATICALLY, through the document's existing writer:
-- * contract     → pro_contracts_client_mutate(recipient, accept)   (same path as the customer's own acceptance)
-- * quote        → pro_private_estimate_publication_mutate(recipient, accept)
-- * work_change  → pro_work_changes_mutate(owner, record_acceptance) (owner-recorded external approval)
-- Guards: the frozen hash of the request must still be the document's current hash, and for contracts/quotes
-- the signer e-mail must be the customer's (account e-mail or the customer card e-mail); otherwise nothing is
-- accepted and the reason is kept for review. Exactly once: one immutable row per request in
-- pro_esign_acceptances + a deterministic actionId per request in the writer (its own idempotency receipt);
-- the writers keep their own history/audit. pro_esign_event_apply is re-created with the same body as 6B plus
-- that call (errors inside it never block storing the signature).
begin;

create table if not exists public.pro_esign_acceptances(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 document_kind text not null check(document_kind in('contract','quote','work_change')),
 document_id uuid not null,
 outcome text not null check(outcome in('accepted','already_accepted','review')),
 reason text check(reason is null or length(reason) between 1 and 120),
 action_id uuid not null,
 writer_result jsonb check(writer_result is null or octet_length(writer_result::text)<=65536),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_id),
 foreign key(owner_id,request_id) references public.pro_esign_requests(owner_id,id) on delete cascade,
 check((outcome='review')=(reason is not null))
);
create or replace function public.pro_esign_acceptance_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'E-signature acceptances are immutable' using errcode='23514';end $$;
drop trigger if exists pro_esign_acceptance_immutable on public.pro_esign_acceptances;
create trigger pro_esign_acceptance_immutable before update on public.pro_esign_acceptances for each row execute function public.pro_esign_acceptance_immutable();

-- plpgsql (late binding): the account e-mail lives in auth.users; profiles.email and the customer card are fallbacks.
create or replace function public.pro_esign_signer_is_customer(p_signer text,p_user uuid,p_owner uuid,p_client text) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare signer text:=lower(btrim(coalesce(p_signer,'')));
begin
 if signer='' then return false;end if;
 if p_user is not null and (exists(select 1 from auth.users u where u.id=p_user and lower(btrim(coalesce(u.email,'')))=signer)
  or exists(select 1 from public.profiles pr where pr.id=p_user and lower(btrim(coalesce(pr.email,'')))=signer)) then return true;end if;
 return p_client is not null and exists(select 1 from public.pro_clients c where c.user_id=p_owner and c.id=p_client and lower(btrim(coalesce(c.email,'')))=signer);
end $$;

create or replace function public.pro_esign_apply_acceptance(p_owner uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_esign_requests;prior public.pro_esign_acceptances;aid uuid;outcome text;reason text;res jsonb;current_hash text;
 c public.pro_contracts;v public.pro_contract_versions;w public.pro_work;req uuid;pub public.pro_private_estimate_publications;st public.pro_private_estimate_publication_states;ch public.pro_work_changes;input jsonb;
begin
 select * into r from public.pro_esign_requests where owner_id=p_owner and id=p_request;
 if not found then raise exception 'Unknown request' using errcode='P0002';end if;
 select * into prior from public.pro_esign_acceptances where owner_id=p_owner and request_id=p_request;
 if found then return jsonb_build_object('outcome',prior.outcome,'reason',prior.reason,'duplicate',true);end if;
 if r.status<>'signed' then raise exception 'Request not signed' using errcode='22023';end if;
 aid:=md5('ccr-esign-acceptance:'||r.id::text)::uuid;
 begin current_hash:=public.pro_esign_document(p_owner,r.document_kind,r.document_id)->>'contentHash';
 exception when others then current_hash:=null;end;
 if current_hash is null then outcome:='review';reason:='document_not_signable';
 elsif current_hash<>r.document_hash then outcome:='review';reason:='document_changed';
 elsif r.document_kind='contract' then
  select * into c from public.pro_contracts where owner_id=p_owner and id=r.document_id;
  select * into v from public.pro_contract_versions where owner_id=p_owner and contract_id=c.id and version=c.latest_version;
  select * into w from public.pro_work where user_id=p_owner and id=c.work_id;
  if c.status='accepted' then outcome:='already_accepted';
  elsif not public.pro_esign_signer_is_customer(r.signer_email,v.recipient_id,p_owner,w."clientId") then outcome:='review';reason:='signer_not_customer';
  else
   select ar.id into req from public.pro_appointment_requests ar where ar.owner_id=p_owner and ar.work_id=c.work_id and ar.client_user_id=v.recipient_id and ar.status in('confirmed','completed') order by ar.updated_at desc,ar.id desc limit 1;
   if req is null then outcome:='review';reason:='no_customer_link';
   else
    begin
     res:=public.pro_contracts_client_mutate(v.recipient_id,jsonb_build_object('action','accept','actionId',aid,'requestId',req,'contractId',c.id,'version',v.version,'contentHash',v.content_hash,'typedName',left(r.signer_name,160)));
     outcome:='accepted';
    exception when others then outcome:='review';reason:='writer_refused_'||sqlstate;end;
   end if;
  end if;
 elsif r.document_kind='quote' then
  select * into pub from public.pro_private_estimate_publications where owner_id=p_owner and id=r.document_id;
  select * into st from public.pro_private_estimate_publication_states where publication_id=pub.id;
  if st.status='accepted' then outcome:='already_accepted';
  elsif st.recipient_id is null or st.status not in('shared','changes_requested') then outcome:='review';reason:='no_customer_link';
  elsif not public.pro_esign_signer_is_customer(r.signer_email,st.recipient_id,p_owner,pub.client_id) then outcome:='review';reason:='signer_not_customer';
  else
   input:=jsonb_build_object('action','accept','actionId',aid,'contentHash',pub.content_hash,'publicationId',pub.id,'revision',st.revision);
   begin
    res:=public.pro_private_estimate_publication_mutate(st.recipient_id,input,encode(sha256(convert_to(input::text,'UTF8')),'hex'));
    outcome:='accepted';
   exception when others then outcome:='review';reason:='writer_refused_'||sqlstate;end;
  end if;
 else
  select * into ch from public.pro_work_changes where owner_id=p_owner and id=r.document_id;
  if ch.status='accepted' then outcome:='already_accepted';
  else
   begin
    res:=public.pro_work_changes_mutate(p_owner,jsonb_build_object('action','record_acceptance','id',ch.id,'actionId',aid,'revision',ch.revision,
     'note',left(case when r.language='en' then 'Electronically signed by ' else 'Firmado electrónicamente por ' end||r.signer_name||' <'||r.signer_email||'> · '||case when r.language='en' then 'envelope ' else 'sobre ' end||coalesce(r.envelope_id,'-')||' · '||to_char(coalesce(r.completed_at,now()) at time zone 'America/Costa_Rica','YYYY-MM-DD HH24:MI'),500)));
    outcome:='accepted';
   exception when others then outcome:='review';reason:='writer_refused_'||sqlstate;end;
  end if;
 end if;
 insert into public.pro_esign_acceptances(owner_id,request_id,document_kind,document_id,outcome,reason,action_id,writer_result)
 values(p_owner,r.id,r.document_kind,r.document_id,outcome,reason,aid,res);
 return jsonb_build_object('outcome',outcome,'reason',reason,'duplicate',false);
end $$;

-- Owner view of the automatic acceptances of one document (shown next to its signature requests).
create or replace function public.pro_esign_acceptances_read(p_actor uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('requestId',a.request_id,'outcome',a.outcome,'reason',a.reason,'at',a.created_at) order by a.created_at desc)
  from public.pro_esign_acceptances a where a.owner_id=p_actor and a.document_kind=p_kind and a.document_id=p_id),'[]');
end $$;

create or replace function public.pro_esign_event_apply(p_webhook uuid,p_pdf bytea default null,p_certificate bytea default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wh public.pro_integration_webhooks;r public.pro_esign_requests;target text;ps text;acc jsonb;
begin
 select * into wh from public.pro_integration_webhooks where id=p_webhook and provider='esign' for update;
 if not found then raise exception 'Unknown webhook' using errcode='22023';end if;
 if wh.status in('processed','ignored') then return jsonb_build_object('status',wh.status,'duplicate',true,'review',wh.last_error);end if;
 select * into r from public.pro_esign_requests where mode=wh.mode and envelope_id=wh.payload->>'envelopeId' for update;
 if not found then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_envelope' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_envelope');
 end if;
 if wh.owner_id is null then update public.pro_integration_webhooks set owner_id=r.owner_id where id=wh.id;end if;
 ps:=wh.payload->>'status';
 target:=case ps when 'delivered' then 'viewed' when 'completed' then 'signed' when 'declined' then 'declined' when 'voided' then 'cancelled' when 'expired' then 'expired' when 'sent' then 'sent' else null end;
 if target is null then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_status' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_status');
 end if;
 if r.status=target then
  update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error='already_applied' where id=wh.id;
  return jsonb_build_object('status','processed','duplicate',true,'review',null,'request',r.id);
 end if;
 if not public.pro_esign_transition_ok(r.status,target) then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error=left('out_of_order_'||r.status||'_'||target,300) where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','out_of_order','request',r.id);
 end if;
 if target='signed' then
  if p_pdf is null or p_certificate is null then raise exception 'Completed envelope without documents' using errcode='22023',hint='pro_esign_documents_missing';end if;
  insert into public.pro_esign_artifacts(owner_id,request_id,kind,content,sha256) values
   (r.owner_id,r.id,'signed_pdf',p_pdf,encode(sha256(p_pdf),'hex')),(r.owner_id,r.id,'certificate',p_certificate,encode(sha256(p_certificate),'hex'));
 end if;
 update public.pro_esign_requests set status=target,
  viewed_at=case when target='viewed' then coalesce(viewed_at,now()) else viewed_at end,
  completed_at=case when target in('signed','declined','expired','cancelled') then now() else completed_at end,
  decline_reason=case when target='declined' then left(coalesce(nullif(btrim(wh.payload->>'reason'),''),'Sin motivo'),500) else decline_reason end,
  revision=revision+1,updated_at=now() where owner_id=r.owner_id and id=r.id returning * into r;
 perform public.pro_esign_log(r.owner_id,r.id,target,'provider',wh.id,jsonb_build_object('event',wh.event_id,'providerStatus',ps));
 -- Round 6C: a signed envelope updates the acceptance of the document through its own writer (exactly once).
 if target='signed' then
  begin acc:=public.pro_esign_apply_acceptance(r.owner_id,r.id);
  exception when others then acc:=jsonb_build_object('outcome','review','reason','error_'||sqlstate);end;
 end if;
 update public.pro_integration_webhooks set status='processed',processed_at=now() where id=wh.id;
 return jsonb_build_object('status','processed','duplicate',false,'review',null,'request',r.id,'requestStatus',r.status)||case when acc is null then '{}'::jsonb else jsonb_build_object('acceptance',acc) end;
end $$;


alter table public.pro_esign_acceptances enable row level security;
revoke all on public.pro_esign_acceptances from public,anon,authenticated,service_role;
grant select,insert on public.pro_esign_acceptances to service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_esign_apply_acceptance','pro_esign_acceptances_read','pro_esign_signer_is_customer','pro_esign_event_apply','pro_esign_acceptance_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_esign_acceptance_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
