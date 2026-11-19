-- LOCAL PRO ONLY. Project "Planning" -> estimates of one job (pro_work).
-- Read-only: no new tables, no writes and no inferred links. An estimate belongs
-- to the project only through an EXISTING stored link:
--   1. its immutable source is this job (source.kind='work', source.id=job id);
--   2. one of its accepted publications is this job's agreement
--      (pro_private_estimate_work_agreements.work_id);
--   3. its source is a manual lead that was converted into this job
--      (pro_manual_lead_works.work_id).
-- "client" lists active estimates of the job's customer that have none of those
-- links to ANY job, so another project's estimate never appears here.
-- Archived estimates are excluded, as in the commercial list.
begin;
create or replace function public.pro_project_estimate_rows(p_actor uuid,p_work public.pro_work)
returns table(estimate_id uuid,relation text,created_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
 select x.id,x.relation,x.created_at from (
  select d.id,d.created_at,case
   when (d.source->>'kind'='work' and d.source->>'id'=p_work.id)
    or exists(select 1 from public.pro_private_estimate_work_agreements a where a.owner_id=p_actor and a.estimate_id=d.id and a.work_id=p_work.id)
    or (d.source->>'kind'='manual' and exists(select 1 from public.pro_manual_lead_works m where m.owner_id=p_actor and m.lead_id::text=d.source->>'id' and m.work_id_text=p_work.id))
    -- Launch fix I1 (2026-11-17): a quote shared to the customer account linked to THIS job belongs to the job
    -- (its acceptance continues into it, quote-circuit-local.sql), so it counts in the job's quotes and next steps.
    or exists(select 1 from public.pro_private_estimate_publication_recipients b join public.pro_appointment_requests r on r.owner_id=b.owner_id and r.id::text=b.proof->>'requestId' and r.client_user_id=b.recipient_id
     where b.owner_id=p_actor and b.estimate_id=d.id and b.proof->>'kind'='linked' and r.work_id=p_work.id)
   then 'project'
   when d.client_id=p_work."clientId"
    and coalesce(d.source->>'kind','')<>'work'
    and not exists(select 1 from public.pro_private_estimate_work_agreements a where a.owner_id=p_actor and a.estimate_id=d.id)
    and not (d.source->>'kind'='manual' and exists(select 1 from public.pro_manual_lead_works m where m.owner_id=p_actor and m.lead_id::text=d.source->>'id'))
   then 'client' end relation
  from public.pro_private_estimates d where d.owner_id=p_actor and not d.archived
 ) x where x.relation is not null;
$$;
create or replace function public.pro_project_estimates_page(p_actor uuid,p_work text,p_scope text default 'project',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;items jsonb;next_cursor uuid;counts jsonb;cursor_time timestamptz;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_scope is null or p_scope not in('project','client') then raise exception 'Invalid project estimate query' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then raise exception 'Project not found' using errcode='P0002';end if;
 select jsonb_build_object('project',count(*) filter(where r.relation='project'),'client',count(*) filter(where r.relation='client')) into counts from public.pro_project_estimate_rows(p_actor,w) r;
 if p_after is not null then
  select r.created_at into cursor_time from public.pro_project_estimate_rows(p_actor,w) r where r.estimate_id=p_after and r.relation=p_scope;
  if not found then raise exception 'Project estimate cursor changed' using errcode='40001';end if;
 end if;
 with picked as(
  select r.estimate_id,r.created_at from public.pro_project_estimate_rows(p_actor,w) r
  where r.relation=p_scope and (p_after is null or (r.created_at,r.estimate_id)<(cursor_time,p_after))
  order by r.created_at desc,r.estimate_id desc limit 21
 ),latest as(
  select distinct on(v.estimate_id) v.estimate_id,v.id,v.version,v.estimate_revision,v.content
  from public.pro_private_estimate_publications v join picked p on p.estimate_id=v.estimate_id
  where v.owner_id=p_actor order by v.estimate_id,v.version desc
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'relation',p_scope,'title',coalesce(v.content->>'title',d.title),
   'clientId',d.client_id,'clientName',coalesce(v.content->'customer'->>'name',d.client_snapshot->>'name',''),
   'status',case when v.id is null then 'draft' when s.status in('awaiting_claim','shared','changes_requested') then 'sent' when s.status in('withdrawn','superseded') then 'withdrawn' else s.status end,
   'publicationStatus',s.status,
   'currency',coalesce(v.content->>'currency',d.currency),
   'totalCents',coalesce((v.content->>'totalCents')::bigint,d.total_cents),
   'revision',d.revision,'unpublishedChanges',v.id is not null and v.estimate_revision<d.revision,
   'agreement',exists(select 1 from public.pro_private_estimate_work_agreements a where a.owner_id=p_actor and a.estimate_id=d.id and a.work_id=w.id),
   'sourceKind',d.source->>'kind','createdAt',d.created_at,'updatedAt',d.updated_at
  ) order by p.created_at desc,p.estimate_id desc),'[]'::jsonb) into items
 from picked p join public.pro_private_estimates d on d.owner_id=p_actor and d.id=p.estimate_id
 left join latest v on v.estimate_id=d.id
 left join public.pro_private_estimate_publication_states s on s.publication_id=v.id;
 if jsonb_array_length(items)>20 then next_cursor:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',w.id,'clientId',w."clientId",'scope',p_scope,'items',items,'nextCursor',next_cursor,'counts',counts);
end $$;
revoke all on function public.pro_project_estimate_rows(uuid,public.pro_work),public.pro_project_estimates_page(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pro_project_estimate_rows(uuid,public.pro_work),public.pro_project_estimates_page(uuid,text,text,uuid) to service_role;
commit;
notify pgrst, 'reload schema';
