-- LOCAL PRO ONLY (2026-11-17). Per-job «Actividad» / «Activity» history.
-- One read-only RPC. No table, column, trigger or row is created or changed: every event is read from the
-- append-only history / event / receipt records the job modules already keep:
--   quote_*            pro_private_estimate_publication_events (immutable trigger) + pro_private_estimate_publications
--                      (immutable content: title, version) of the quotes that belong to the job (pro_project_estimate_rows)
--   change_*           pro_work_change_actions (receipt per action) + pro_work_changes (a decided change is final:
--                      only a 'proposed' row can change, so the decision time updated_at never moves again)
--   payment_*          pro_client_entries kind payment / payment_void (append-only ledger; a void is a new entry)
--   invoice_prepared   pro_invoice_billing_requests (creation receipt of a job invoice draft)
--   invoice_payment_*  pro_invoice_payment_applications / pro_invoice_payment_voids (immutable trigger)
--   einvoice_*         pro_einvoice_events (immutable trigger) of the job's invoice drafts
--   file_added         pro_work_file_upload_actions confirmed receipts (immutable after confirmation)
--   file_shared        pro_work_file_publish_actions (immutable trigger)
--   file_trashed/_restored  pro_work_file_organizer_history
--   task_*             pro_work_task_history (immutable trigger) + pro_work_task_actions (actor)
--   daily_log_published pro_daily_log_history action 'publish'
--   update_published   pro_work_update_history action 'publish'
--   client_invited / client_invitation_accepted  pro_work_client_invitations (created_at / accepted_at are frozen
--                      by pro_work_client_invitation_guard)
-- Not sourced: the job's own stage/status (pro_work.stage is a current value without a history record).
-- Authorization: the owner, or an active company member whose role allows 'read' (pro_role_require). The owner
-- must have Pro work tools. A job that is not the owner's is refused with 42501 (never a partial result).
-- Free text written by other people (change notes, quote change requests, file comments) is never returned;
-- titles are the owner's own record names and are rendered as plain text by the UI.
-- Ordering: newest first by (at, id); keyset cursor (p_before_at, p_before_id), at most 50 per page.
begin;
create or replace function public.pro_work_activity_read(p_actor uuid,p_owner uuid,p_work text,p_before_at timestamptz default null,p_before_id text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;lim integer:=coalesce(p_limit,20);result jsonb;
begin
 if p_actor is null or p_owner is null or not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_actor<>p_owner then perform public.pro_role_require(p_actor,p_owner,'read');end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or lim not between 1 and 50 or (p_before_at is null)<>(p_before_id is null) or length(p_before_id)>120 then raise exception 'Invalid activity query' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_owner and id=p_work;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 with ev(id,at,kind,actor,actor_name,section,ref,data) as(
  -- Quotes of this job: shared, claimed, accepted, declined, changes requested / answered, withdrawn.
  select 'quote:'||e.publication_id||':'||e.revision,e.at,'quote_'||e.action,e.actor_id,null::text,'estimates',
   jsonb_build_object('estimateId',v.estimate_id,'publicationId',v.id),jsonb_build_object('title',left(v.content->>'title',160),'version',v.version)
  from public.pro_private_estimate_publication_events e join public.pro_private_estimate_publications v on v.id=e.publication_id
  where v.owner_id=p_owner and e.action in('publish','claim','accept','decline','request_changes','respond_changes','withdraw')
   and v.estimate_id in(select r.estimate_id from public.pro_project_estimate_rows(p_owner,w) r where r.relation='project')
  union all
  -- Change orders: proposed, accepted (by the customer or recorded by the owner), declined, withdrawn.
  select 'change:'||a.id,case when a.input->>'action'='propose' then c.created_at else c.updated_at end,'change_'||(a.input->>'action'),a.actor_id,null,'changes',
   jsonb_build_object('changeId',c.id),jsonb_build_object('title',c.reason,'amountCents',c.delta_cents)
  from public.pro_work_change_actions a join public.pro_work_changes c on c.owner_id=a.owner_id and c.id=(a.result->>'id')::uuid
  where a.owner_id=p_owner and c.work_id=w.id and a.input->>'action' in('propose','accept','decline','withdraw','record_acceptance')
  union all
  -- Payments recorded on the job's customer account (and their voids).
  select 'entry:'||x.id,x.created_at,case x.kind when 'payment' then 'payment_recorded' else 'payment_voided' end,null::uuid,null,'costs',
   jsonb_build_object('entryId',x.id),jsonb_build_object('amountCents',x.amount_cents)
  from public.pro_client_entries x where x.user_id=p_owner and x.work_id=w.id and x.kind in('payment','payment_void')
  union all
  -- Invoice drafts prepared from the job.
  select 'invoice:'||r.request_id,r.created_at,'invoice_prepared',null::uuid,null,'costs',
   jsonb_build_object('invoiceId',d.id),jsonb_build_object('title',d.title)
  from public.pro_invoice_billing_requests r join public.pro_invoice_drafts d on d.user_id=r.user_id and d.id=r.draft_id
  where r.user_id=p_owner and d.work_id=w.id
  union all
  -- Payments applied to (and removed from) the job's invoices.
  select 'invoice-payment:'||pa.id,pa.created_at,'invoice_payment_applied',null::uuid,null,'costs',
   jsonb_build_object('invoiceId',d.id),jsonb_build_object('title',d.title,'amountCents',pa.amount_cents)
  from public.pro_invoice_payment_applications pa join public.pro_invoice_drafts d on d.user_id=pa.user_id and d.id=pa.draft_id
  where pa.user_id=p_owner and d.work_id=w.id
  union all
  select 'invoice-payment-void:'||pv.id,pv.created_at,'invoice_payment_voided',null::uuid,null,'costs',
   jsonb_build_object('invoiceId',d.id),jsonb_build_object('title',d.title,'amountCents',pa.amount_cents)
  from public.pro_invoice_payment_voids pv join public.pro_invoice_payment_applications pa on pa.user_id=pv.user_id and pa.id=pv.application_id
   join public.pro_invoice_drafts d on d.user_id=pa.user_id and d.id=pa.draft_id
  where pv.user_id=p_owner and d.work_id=w.id
  union all
  -- Electronic invoice status transitions of the job's invoices (no draft 'borrador' noise).
  select 'einvoice:'||ee.document_id||':'||ee.id,ee.created_at,case ee.to_status when 'firmado' then 'einvoice_signed' when 'enviado' then 'einvoice_sent' when 'aceptado' then 'einvoice_accepted' else 'einvoice_rejected' end,null::uuid,null,'costs',
   jsonb_build_object('invoiceId',d.id),jsonb_build_object('title',d.title,'number',doc.consecutivo)
  from public.pro_einvoice_events ee join public.pro_einvoice_documents doc on doc.owner_id=ee.owner_id and doc.id=ee.document_id
   join public.pro_invoice_drafts d on d.user_id=doc.owner_id and d.id=doc.draft_id
  where ee.owner_id=p_owner and d.work_id=w.id and ee.to_status in('firmado','enviado','aceptado','rechazado')
  union all
  -- Files: confirmed uploads, shares with the customer, trash and restore.
  select 'file:'||u.file_id,u.at,'file_added',u.actor_id,null,'files',jsonb_build_object('fileId',f.id),jsonb_build_object('title',f.name)
  from public.pro_work_file_upload_actions u join public.pro_work_files f on f.id=u.file_id
  where f.owner_id=p_owner and f.work_id=w.id and u.result is not null
  union all
  select 'file-share:'||pu.action_id,pu.at,'file_shared',pu.actor_id,null,'files',jsonb_build_object('fileId',f.id),jsonb_build_object('title',f.name)
  from public.pro_work_file_publish_actions pu join public.pro_work_files f on f.id=(pu.input->>'fileId')::uuid
  where pu.actor_id=p_owner and f.owner_id=p_owner and f.work_id=w.id
  union all
  select 'file-organizer:'||h.action_id,h.at,case h.action when 'trash_file' then 'file_trashed' else 'file_restored' end,p_owner,null,'files',
   jsonb_build_object('fileId',f.id),jsonb_build_object('title',f.name)
  from public.pro_work_file_organizer_history h join public.pro_work_files f on f.owner_id=h.owner_id and f.id=h.subject_id
  where h.owner_id=p_owner and h.subject='file' and h.action in('trash_file','restore_file') and f.work_id=w.id
  union all
  -- Tasks: created, completed, reopened, archived.
  select 'task:'||t.action_id,t.at,case t.action when 'create' then 'task_created' when 'complete' then 'task_completed' when 'reopen' then 'task_reopened' else 'task_archived' end,
   (select ta.actor_id from public.pro_work_task_actions ta where ta.action_id=t.action_id limit 1),null,'tasks',
   jsonb_build_object('taskId',t.task_id),jsonb_build_object('title',left(t.after_task->>'title',160))
  from public.pro_work_task_history t where t.owner_id=p_owner and t.work_id=w.id and t.action in('create','complete','reopen','archive')
  union all
  -- Daily logs and job updates published.
  select 'daily-log:'||l.action_id,l.at,'daily_log_published',l.actor_id,l.actor_name,'updates',
   jsonb_build_object('logId',l.log_id),jsonb_build_object('title',left(l.after_log->>'title',160))
  from public.pro_daily_log_history l where l.owner_id=p_owner and l.work_id=w.id and l.action='publish'
  union all
  select 'update:'||uh.action_id,uh.at,'update_published',p_owner,null,'updates',
   jsonb_build_object('updateId',uh.entry_id),jsonb_build_object('title',left(uh.after_entry->>'title',160))
  from public.pro_work_update_history uh where uh.owner_id=p_owner and uh.work_id=w.id and uh.action='publish'
  union all
  -- Customer invitations: created and accepted.
  select 'invite:'||i.id,i.created_at,'client_invited',p_owner,null,'client',jsonb_build_object('invitationId',i.id),'{}'::jsonb
  from public.pro_work_client_invitations i where i.owner_id=p_owner and i.work_id=w.id
  union all
  select 'invite-accepted:'||i.id,i.accepted_at,'client_invitation_accepted',i.accepted_by,null,'client',jsonb_build_object('invitationId',i.id),'{}'::jsonb
  from public.pro_work_client_invitations i where i.owner_id=p_owner and i.work_id=w.id and i.accepted_at is not null
 ),page as(
  select * from ev where p_before_at is null or (ev.at,ev.id)<(p_before_at,p_before_id) order by ev.at desc,ev.id desc limit lim+1
 ),shown as(
  select p.*,row_number() over(order by p.at desc,p.id desc) n from page p
 )
 select jsonb_build_object('workId',w.id,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,
    'at',to_char(s.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actorName',nullif(left(btrim(coalesce(s.actor_name,case when s.actor is null then public.pro_team_name(p_owner) else public.pro_team_name(s.actor) end)),160),''),
    'actorRole',case when s.actor is null or s.actor=p_owner then 'owner' when exists(select 1 from public.pro_company_members m where m.owner_id=p_owner and m.member_user_id=s.actor) then 'team' else 'client' end,
    'section',s.section,'ref',s.ref,'data',jsonb_strip_nulls(s.data)) order by s.at desc,s.id desc) from shown s where s.n<=lim),'[]'::jsonb),
  'nextCursor',(select jsonb_build_object('before',to_char(s.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'beforeId',s.id) from shown s where s.n=lim and exists(select 1 from shown x where x.n>lim))
 ) into result;
 return result;
end $$;
revoke all on function public.pro_work_activity_read(uuid,uuid,text,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.pro_work_activity_read(uuid,uuid,text,timestamptz,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
