-- LOCAL PRO ONLY. Round 4A (2026-11-13): job overview with widgets (project overview page).
-- One read-only RPC, one part per widget so each widget loads, fails and retries on its own:
--   client   – customer record contact, linked customer account, pending invitation, job phase
--   schedule – plan range, next open tasks (due date order), upcoming key dates
--   finance  – the ONE customer balance (pro_work_account, client-balance-local.sql), invoiced
--              (non-archived invoice documents of the job), costs and result exactly as
--              «Costs and payments» computes them (pro_work_costs_read summary); Round 7A adds the
--              agreed amount before VAT (agreedNetCents) so the result is shown like with like
--   activity – latest files, daily logs, updates and changes of the job
--   open     – open tasks / overdue, punch list, selections waiting for the customer, proposed
--              change, contracts shared and not answered, quotes shared and not answered,
--              allowances not decided
-- Owner only (pro_private_work_tools_enabled + own pro_work row). No row is written.
begin;
create or replace function public.pro_work_overview_read(p_actor uuid,p_work text,p_part text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;c public.pro_clients;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;facts jsonb;costs jsonb;account jsonb;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_part is null or p_part not in('client','schedule','finance','activity','open') then raise exception 'Invalid overview query' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then return null;end if;
 if p_part='client' then
  select * into c from public.pro_clients where user_id=p_actor and id=w."clientId";
  facts:=public.pro_work_header_facts(p_actor,p_work);
  return jsonb_build_object('workId',w.id,'part','client','phase',facts->'phase',
   'client',case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'email',nullif(c.email,''),'phone',nullif(c.phone,''),'address',nullif(c.address,''),'archived',c.archived) end,
   'linked',public.pro_work_client_link_json(p_actor,p_work),
   'pendingInvitation',exists(select 1 from public.pro_work_client_invitations i where i.owner_id=p_actor and i.work_id=p_work and public.pro_work_client_invitation_state(i)='active'));
 elsif p_part='schedule' then
  facts:=public.pro_work_header_facts(p_actor,p_work);
  return jsonb_build_object('workId',w.id,'part','schedule','planStart',facts->'planStart','planEnd',facts->'planEnd','today',today,
   -- Round 7B: a task planned in the schedule shows its period (not «No date»); order by due date, else planned end.
   'nextTasks',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'dueDate',x.due_date,'plannedStart',x.planned_start,'plannedEnd',x.planned_end,'overdue',coalesce(x.due_date,x.planned_end) is not null and coalesce(x.due_date,x.planned_end)<today,'punch',x.punch) order by coalesce(x.due_date,x.planned_end) asc nulls last,x.id) from (
     select t.id,t.title,t.due_date,sp.planned_start,sp.planned_end,exists(select 1 from public.pro_work_punch_items p where p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id) punch
     from public.pro_work_tasks t left join public.pro_work_schedule_plans sp on sp.owner_id=t.owner_id and sp.work_id=t.work_id and sp.task_id=t.id
     where t.owner_id=p_actor and t.work_id=p_work and t.status='open' and not t.archived order by coalesce(t.due_date,sp.planned_end) asc nulls last,t.id limit 5) x),'[]'::jsonb),
   'openTasks',(select count(*) from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and t.status='open' and not t.archived),
   'keyDates',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'date',m.milestone_date) order by m.milestone_date,m.id) from (
     select id,title,milestone_date from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=p_work and not archived and milestone_date>=today order by milestone_date,id limit 3) m),'[]'::jsonb));
 elsif p_part='finance' then
  account:=public.pro_work_account(p_actor,p_work);
  costs:=public.pro_work_costs_read(p_actor,w."clientId",p_work)->'summary';
  return jsonb_build_object('workId',w.id,'part','finance',
   'agreedCents',account->'agreedCents','agreedSource',account->'agreedSource','paidCents',account->'paidCents','creditNotesCents',account->'creditNotesCents',
   'balanceCents',account->'customerBalanceCents','creditCents',greatest(-(account->>'balanceCents')::bigint,0),
   'invoicedCents',(select coalesce(sum(d.total_cents),0)::bigint from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id where d.user_id=p_actor and d.work_id=p_work and not coalesce(m.archived,false)),
   'invoiceCount',(select count(*) from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id where d.user_id=p_actor and d.work_id=p_work and not coalesce(m.archived,false)),
   'costCents',coalesce((costs->>'totalCostCents')::bigint,0),'committedCents',coalesce((costs->>'committedCents')::bigint,0),
   'resultCents',costs->'resultCents','resultWithCommittedCents',costs->'resultWithCommittedCents','resultBasis',costs->'resultBasis','agreedTaxCents',costs->'agreedTaxCents','agreedNetCents',costs->'agreedNetCents','uncostedCount',coalesce((costs->>'uncostedCount')::bigint,0));
 elsif p_part='activity' then
  select coalesce(jsonb_agg(a.doc order by a.at desc,a.id desc),'[]'::jsonb) into result from (
   select * from (
    (select f.id::text id,f.created_at at,jsonb_build_object('kind','file','id',f.id,'title',f.name,'at',f.created_at,'shared',f.published_at is not null) doc from public.pro_work_files f where f.owner_id=p_actor and f.work_id=p_work and f.ready order by f.created_at desc limit 4)
    union all
    (select l.id::text,l.created_at,jsonb_build_object('kind','daily_log','id',l.id,'title',coalesce(nullif(l.title,''),to_char(l.log_date,'YYYY-MM-DD')),'at',l.created_at,'date',l.log_date,'shared',l.published_revision is not null) from public.pro_daily_logs l where l.owner_id=p_actor and l.work_id=p_work and not l.archived order by l.created_at desc limit 4)
    union all
    (select u.id::text,u.updated_at,jsonb_build_object('kind','update','id',u.id,'title',u.title,'at',u.updated_at,'shared',u.published_revision is not null) from public.pro_work_updates u where u.owner_id=p_actor and u.work_id=p_work order by u.updated_at desc limit 4)
    union all
    (select g.id::text,g.updated_at,jsonb_build_object('kind','change','id',g.id,'title',g.reason,'at',g.updated_at,'status',g.status,'deltaCents',g.delta_cents) from public.pro_work_changes g where g.owner_id=p_actor and g.work_id=p_work order by g.updated_at desc limit 4)
   ) u order by at desc,id desc limit 8) a;
  return jsonb_build_object('workId',w.id,'part','activity','items',result);
 else
  return jsonb_build_object('workId',w.id,'part','open',
   'openTasks',(select count(*) from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and t.status='open' and not t.archived and not exists(select 1 from public.pro_work_punch_items p where p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id)),
   'overdueTasks',(select count(*) from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and t.status='open' and not t.archived and t.due_date<today),
   'punchOpen',(select count(*) from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived where p.owner_id=p_actor and p.work_id=p_work and t.status='open'),
   'punchTotal',(select count(*) from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived where p.owner_id=p_actor and p.work_id=p_work),
   'selectionsPending',(select count(*) from public.pro_work_selection_items s where s.owner_id=p_actor and s.work_id=p_work and public.pro_work_selection_state(s) in('pending_client','changes_requested')),
   'changesProposed',(select count(*) from public.pro_work_changes g where g.owner_id=p_actor and g.work_id=p_work and g.status='proposed'),
   'contractsShared',(select count(*) from public.pro_contracts k where k.owner_id=p_actor and k.work_id=p_work and k.status='shared'),
   'quotesWaiting',(select count(*) from public.pro_project_estimate_rows(p_actor,w) e join public.pro_private_estimate_publications v on v.owner_id=p_actor and v.estimate_id=e.estimate_id join public.pro_private_estimate_publication_states s on s.publication_id=v.id where e.relation='project' and s.status in('awaiting_claim','shared','changes_requested')),
   'allowancesPending',coalesce((public.pro_work_allowance_totals(p_actor,p_work)->>'pendingCount')::bigint,0));
 end if;
end $$;
revoke all on function public.pro_work_overview_read(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pro_work_overview_read(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
