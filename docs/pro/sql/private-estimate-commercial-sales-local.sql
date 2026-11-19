-- LOCAL Pro only. Commercial sales projection; no document/state/ledger writes.
-- Single allowlisted replacement, same signature/cursor and untouched legacy arms.
begin;
create or replace function pro_private_estimate_sales_page(p_actor uuid,p_status text default 'all',p_query text default '',p_client text default null,p_after jsonb default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor jsonb;anchor_valid boolean;
begin
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status not in('all','draft','sent','accepted','declined','withdrawn','archived') or length(p_query)>100 or p_after is not null and(jsonb_typeof(p_after)<>'object' or(select array_agg(key order by key) from jsonb_object_keys(p_after)key) is distinct from array['at','key'] or jsonb_typeof(p_after->'at')<>'string' or jsonb_typeof(p_after->'key')<>'string') then raise exception 'Invalid sales query' using errcode='22023';end if;
 -- Choose only immutable identity/version before joining its lightweight content
 -- header. No per-document RPC, line aggregation or serialized contact/document JSON.
 with latest as(
  select distinct on(v.estimate_id)v.estimate_id,v.id
  from pro_private_estimate_publications v where v.owner_id=p_actor
  order by v.estimate_id,v.version desc
 ),rows as(
  select 'private_estimate' kind,d.id::text id,'private_estimate:'||d.id::text key,
   case when p_query='' then null::text when v.id is null then d.title else v.content->>'title' end title,
   case when p_query='' then null::text when v.id is null then d.client_snapshot->>'name' else v.content->'customer'->>'name' end client,
   case when v.id is null then d.client_id else v.client_id end client_id,
   case when d.archived then 'archived' when v.id is null then 'draft'
    when s.status in('awaiting_claim','shared','changes_requested') then 'sent'
    when s.status in('withdrawn','superseded') then 'withdrawn' else s.status end status,
   null::text currency,null::numeric total_cents,
   to_char(coalesce(v.created_at,d.created_at)at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at,
   case when v.id is null then null::jsonb else jsonb_build_object('publicationId',v.id,'version',v.version,'estimateRevision',v.estimate_revision,'revision',s.revision,'status',s.status,'contentHash',v.content_hash,'createdAt',v.created_at)end publication,
   jsonb_build_object('revision',d.revision,'status',case when d.archived then 'archived' else 'draft' end)draft,d.id private_estimate_id,v.id private_publication_id
  from pro_private_estimates d left join latest chosen on chosen.estimate_id=d.id
  left join pro_private_estimate_publications v on v.id=chosen.id and v.owner_id=d.owner_id
  left join pro_private_estimate_publication_states s on s.publication_id=v.id
  where d.owner_id=p_actor and(not d.archived or p_status='archived')
  union all
  select 'standard',q.id::text,'standard:'||q.id::text,coalesce(q.title,''),coalesce(q.client_name,''),l."clientId",q.status,'CRC',q.total::numeric*100,to_char(q.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),null::jsonb,null::jsonb,null::uuid,null::uuid
  from quotes q left join pro_quote_links l on l.user_id=p_actor and l."quoteId"=q.id::text where q.deleted_at is null and(q.client_id=p_actor or exists(select 1 from professionals p where p.id=q.professional_id and p.profile_id=p_actor))
  union all
  select 'legacy',q.id,'legacy:'||q.id,q.title,coalesce(c.name,''),q."clientId",q.status,'CRC',(select coalesce(sum(net+floor(net*l.tax::double precision/100+0.5)),0) from pro_legacy_quote_lines l cross join lateral(select floor(l.quantity::double precision*l.price::double precision*100+0.5)net)n where l.user_id=q.user_id and l.quote_id=q.id),'',null::jsonb,null::jsonb,null::uuid,null::uuid
  from pro_legacy_quotes q left join pro_clients c on c.user_id=q.user_id and c.id=q."clientId" where q.user_id=p_actor
 ),filtered as(
  select * from rows where(p_status='all' or status=p_status)and(p_client is null or client_id=p_client)and(p_query=''or position(lower(p_query)in lower(title||' '||client))>0)
 ),page as(
  select * from filtered where p_after is null or at<p_after->>'at' or at=p_after->>'at'and key>p_after->>'key'order by at desc,key asc limit 21
 )
 -- Resolve private display headers only for the selected twenty-plus-one rows.
 select coalesce(jsonb_agg(jsonb_build_object('kind',p.kind,'id',p.id,'key',p.key,
   'title',case when p.kind<>'private_estimate'then p.title when v.id is null then d.title else v.content->>'title'end,
   'client',case when p.kind<>'private_estimate'then p.client when v.id is null then d.client_snapshot->>'name'else v.content->'customer'->>'name'end,
   'clientId',p.client_id,'status',p.status,
   'currency',case when p.kind<>'private_estimate'then p.currency when v.id is null then d.currency else v.content->>'currency'end,
   'totalCents',case when p.kind<>'private_estimate'then p.total_cents when v.id is null then d.total_cents::numeric else(v.content->>'totalCents')::numeric end,
   'at',p.at)||case when p.kind='private_estimate'then jsonb_build_object('publication',p.publication,'draft',p.draft)else '{}'::jsonb end order by p.at desc,p.key asc),'[]'::jsonb),
  (p_after is null or exists(select 1 from filtered where at=p_after->>'at'and key=p_after->>'key'))into items,anchor_valid
 from page p left join pro_private_estimates d on p.kind='private_estimate'and d.owner_id=p_actor and d.id=p.private_estimate_id
 left join pro_private_estimate_publications v on v.id=p.private_publication_id and v.owner_id=p_actor;
 if not anchor_valid then raise exception 'Sales cursor changed'using errcode='40001';end if;
 if jsonb_array_length(items)>20 then cursor:=jsonb_build_object('at',items->19->>'at','key',items->19->>'key');items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor);
end $$;
revoke all on function pro_private_estimate_sales_page(uuid,text,text,text,jsonb)from public,anon,authenticated;
grant execute on function pro_private_estimate_sales_page(uuid,text,text,text,jsonb)to service_role;
commit;
notify pgrst, 'reload schema';
