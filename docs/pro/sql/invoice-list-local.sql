-- LOCAL ONLY. Bounded, owner-scoped draft discovery; no operational mutations.
begin;
create index if not exists pro_invoice_draft_recent on public.pro_invoice_drafts(user_id,created_at desc,id desc);
create or replace function public.pro_invoice_draft_page(p_user uuid,p_search text default '',p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with context as (
  select d.*,c.name as client_name,w.service as work_title,
   coalesce(l.title,q.title) as quote_title
  from pro_invoice_drafts d
  join pro_clients c on c.user_id=d.user_id and c.id=d.client_id
  left join pro_work w on w.user_id=d.user_id and w.id=d.work_id
  left join pro_legacy_quotes l on l.user_id=d.user_id and l.id=coalesce(w."quoteId",case when d.source_kind='legacy_quote' then d.source_id when d.quote_origin_key like 'legacy_quote:%' then substr(d.quote_origin_key,14) end)
  left join quotes q on q.id::text=coalesce(w."externalQuoteId",case when d.source_kind='quote' then d.source_id when d.quote_origin_key like 'quote:%' then substr(d.quote_origin_key,7) end)
   and exists(select 1 from professionals p where p.id=q.professional_id and p.profile_id=p_user)
  where d.user_id=p_user
 ), matches as (
  select * from context
  where strpos(pro_catalog_search(concat_ws(' ',title,receiver_name,client_name,work_title,quote_title)),pro_catalog_search(trim(p_search)))>0
   and (p_after is null or (created_at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid))
  order by created_at desc,id desc limit 21
 ), page as (select * from matches order by created_at desc,id desc limit 20)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'receiver',receiver_name,'client',client_name,'clientId',client_id,'work',work_title,'quote',quote_title,'totalCents',total_cents,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc,id desc) from page),'[]'),
 'nextCursor',case when (select count(*) from matches)>20 then (select jsonb_build_object('at',created_at,'id',id) from page order by created_at,id limit 1) else null end);
$$;
revoke all on function pro_invoice_draft_page(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_draft_page(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
