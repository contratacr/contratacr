-- LOCAL PRO ONLY. Round 4B (2026-11-13): a manual lead's automatic stage advances to
-- «Cotización enviada» (estimate_sent) once a quote created from that lead
-- (pro_manual_lead_quotes) is shared with the customer (quotes.status sent/accepted/declined,
-- not deleted), the same evidence the request pipeline already uses for public requests.
-- Converting the lead into a job still means «Ganada» (won); with neither it stays «Nueva».
-- A hidden estimate_sent stage follows its reassignment like every other stage. Manual stage
-- mode is unchanged. Supersedes pro_lead_commercial_progress and pro_lead_commercial_sources
-- (lead-commercial-progress-local.sql) with the same signatures and keys; the sources
-- fingerprint also covers the quote evidence so open pages see the change. Read-only.
begin;
create or replace function public.pro_lead_manual_quote_evidence(p_actor uuid,p_lead uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('quoteId',x.id,'status',x.status,'at',x.at) from (
  select q.id::text id,q.status,q.created_at at
  from public.pro_manual_lead_quotes m join public.quotes q on q.id=m.quote_id
  join public.professionals p on p.id=q.professional_id and p.profile_id=p_actor
  where m.owner_id=p_actor and m.lead_kind='manual' and m.lead_id=p_lead and q.deleted_at is null and q.status in('sent','accepted','declined')
  union all
  -- Round 7A: the ONE quote flow is the private estimate; a version created from this lead and
  -- shared with the customer (or already answered) is the same «quote sent» evidence.
  select d.id::text,case s.status when 'accepted' then 'accepted' when 'declined' then 'declined' else 'sent' end,v.created_at
  from public.pro_private_estimates d join public.pro_private_estimate_publications v on v.owner_id=d.owner_id and v.estimate_id=d.id
  join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where d.owner_id=p_actor and d.source->>'kind'='manual' and d.source->>'id'=p_lead::text and not d.archived
   and s.status in('awaiting_claim','shared','changes_requested','accepted','declined')
 ) x order by x.at desc,x.id desc limit 1 $$;
create or replace function public.pro_lead_commercial_progress(p_actor uuid,p_kind text,p_id uuid)returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare l pro_lead_center_records;r jsonb;conv jsonb;automatic_stage text;effective text;current_mode text;begin
 perform pro_lead_origin_owner(p_actor);if p_kind is null or p_kind not in('manual','request')then raise exception'Invalid lead kind'using errcode='22023';end if;
 if p_kind='request'then r:=pro_lead_origin_request(p_actor,p_id);return jsonb_build_object('kind',p_kind,'id',p_id,'mode',r->'state'->'mode','automaticStageId',r->'automaticStageId','effectiveStageId',r->'effectiveStageId','conversion',null);end if;
 select*into l from pro_lead_center_records where owner_id=p_actor and kind='manual'and id=p_id;if not found then raise exception'Opportunity unavailable'using errcode='P0002';end if;
 select jsonb_build_object('actionId',m.action_id,'workId',m.work_id,'at',m.created_at)into conv from pro_manual_lead_works m join pro_work w on w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and w."bookingClientId"is null where m.owner_id=p_actor and m.lead_kind='manual'and m.lead_id=p_id;
 automatic_stage:=case when conv is not null then'won' when public.pro_lead_manual_quote_evidence(p_actor,p_id) is not null then 'estimate_sent' else'new'end;current_mode:=l.stage_mode;effective:=case when current_mode='manual'then l.stage_id else automatic_stage end;
 select coalesce(reassign_to_id,effective)into effective from pro_request_pipeline_stages where owner_id=p_actor and id=effective;effective:=coalesce(effective,case when current_mode='manual'then l.stage_id else automatic_stage end);
 return jsonb_build_object('kind',p_kind,'id',p_id,'mode',current_mode,'automaticStageId',automatic_stage,'effectiveStageId',effective,'conversion',conv);end $$;
create or replace function public.pro_lead_commercial_sources(p_actor uuid,p_archived boolean,p_query text)returns table(kind text,id uuid,created_at timestamptz,effective_stage text,fingerprint text)language plpgsql stable security invoker set search_path=public,pg_temp as $$begin
 perform pro_lead_origin_owner(p_actor);if p_archived is null or p_query is null or length(p_query)>100 then raise exception'Invalid lead sources query'using errcode='22023';end if;
 return query with base as materialized(select*from pro_lead_center_sources(p_actor,p_archived,p_query)),
 rows as(select b.*,l.stage_mode,m.action_id m_action,m.work_id m_work,m.source_client_id m_client,m.created_at m_at,w.id w_id,
   case when b.kind='manual' and l.stage_mode='automatic' and w.id is null then public.pro_lead_manual_quote_evidence(p_actor,b.id) end quote_evidence
  from base b left join pro_lead_center_records l on l.owner_id=p_actor and l.kind='manual'and l.id=b.id and b.kind='manual'
  left join pro_manual_lead_works m on m.owner_id=p_actor and m.lead_kind='manual'and m.lead_id=l.id
  left join pro_work w on w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and w."bookingClientId"is null)
 select r.kind,r.id,r.created_at,
  case when r.kind='manual'and r.stage_mode='automatic'then
   case when r.w_id is not null then'won' when r.quote_evidence is not null then coalesce((select s.reassign_to_id from pro_request_pipeline_stages s where s.owner_id=p_actor and s.id='estimate_sent'),'estimate_sent') else'new'end
  else r.effective_stage end,
  md5(r.fingerprint||jsonb_build_array(r.m_action,r.m_work,r.m_client,r.m_at,r.w_id)::text||coalesce(r.quote_evidence::text,''))
 from rows r;end $$;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and (p.proname like'pro_lead_commercial_%' or p.proname='pro_lead_manual_quote_evidence') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
notify pgrst,'reload schema';
commit;
