-- LOCAL ONLY. Read-only received-money overview. No new payment, debt, table or ledger mutation.
begin;
create or replace function public.pro_payment_overview_validate_cursor(p_after jsonb) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if p_after is null then return;end if;
 if jsonb_typeof(p_after)<>'object' or jsonb_typeof(p_after->'at') is distinct from 'string' or jsonb_typeof(p_after->'id') is distinct from 'string'
 or length(p_after->>'at')>40 or (p_after->>'at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Invalid payment cursor' using errcode='22023';end if;
 perform (p_after->>'id')::uuid;
 if not isfinite((p_after->>'at')::timestamptz) then raise exception 'Invalid payment cursor' using errcode='22023';end if;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid payment cursor' using errcode='22023';
end $$;
-- The helper is bounded to a single owned canonical id, never an unpaged list.
create or replace function public.pro_payment_overview_row(p_user uuid,p_id uuid,p_client text default '') returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with source as(
 select e.id,e.id entry_id,p.id payment_id,e.client_id,e.work_id,c.name client_name,w.service work_title,e.amount_cents,(pro_invoice_payment_metadata(p_user,e.id)->>'receivedOn')::date received_on,pro_invoice_payment_metadata(p_user,e.id)->>'method' method,pro_invoice_payment_metadata(p_user,e.id)->>'reference' reference,e.label,e.created_at registered_at,
 exists(select 1 from pro_client_entries v where v.user_id=e.user_id and v.reversal_id=e.id and v.kind='payment_void') reversed
 from pro_client_entries e join pro_clients c on c.user_id=e.user_id and c.id=e.client_id join pro_work w on w.user_id=e.user_id and w.id=e.work_id left join pro_invoice_payments p on p.user_id=e.user_id and p.entry_id=e.id
 where e.user_id=p_user and e.id=p_id and e.kind='payment' and (p_client='' or e.client_id=p_client)
 union all
 select p.id,null::uuid,p.id,p.client_id,null::text,c.name,null::text,p.amount_cents,(pro_invoice_payment_metadata(p_user,p.id)->>'receivedOn')::date,pro_invoice_payment_metadata(p_user,p.id)->>'method',pro_invoice_payment_metadata(p_user,p.id)->>'reference',pro_invoice_payment_metadata(p_user,p.id)->>'reference',p.created_at,false
 from pro_invoice_payments p join pro_clients c on c.user_id=p.user_id and c.id=p.client_id where p.user_id=p_user and p.id=p_id and p.work_id is null and p.entry_id is null and (p_client='' or p.client_id=p_client)
 ), amount as(select s.*,case when s.payment_id is null then 0 else pro_invoice_payment_used(p_user,s.payment_id,null) end applied_cents from source s)
 select jsonb_build_object('id',id,'entryId',entry_id,'paymentId',payment_id,'clientId',client_id,'clientName',client_name,'workId',work_id,'workTitle',work_title,'amountCents',amount_cents,'appliedCents',applied_cents,'availableCents',case when reversed then 0 else amount_cents-applied_cents end,'receivedOn',received_on,'method',method,'reference',reference,'label',label,'registeredAt',registered_at,'reversed',reversed) from amount limit 1;
$$;
-- Replace the earlier five-argument local reader so date filtering stays in the database.
drop function if exists public.pro_payment_overview_page(uuid,text,text,text,jsonb);
create or replace function public.pro_payment_overview_page(p_user uuid,p_query text default '',p_status text default 'all',p_client text default '',p_after jsonb default null,p_from date default null,p_through date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_query is null or length(p_query)>160 then raise exception 'Invalid payment query' using errcode='22023';end if;
 if p_status is null or p_status not in ('all','available','applied','reversed','undated') then raise exception 'Invalid payment status' using errcode='22023';end if;
 if p_client is null or length(p_client)>160 then raise exception 'Invalid payment client' using errcode='22023';end if;
 if p_from is not null and not isfinite(p_from) or p_through is not null and not isfinite(p_through) or p_from is not null and p_through is not null and p_from>p_through then raise exception 'Invalid payment date range' using errcode='22023';end if;
 perform pro_payment_overview_validate_cursor(p_after);
 with source as(
 select e.id,e.id entry_id,p.id payment_id,e.client_id,e.work_id,c.name client_name,w.service work_title,e.amount_cents,(pro_invoice_payment_metadata(p_user,e.id)->>'receivedOn')::date received_on,pro_invoice_payment_metadata(p_user,e.id)->>'method' method,pro_invoice_payment_metadata(p_user,e.id)->>'reference' reference,e.label,e.created_at registered_at,
 exists(select 1 from pro_client_entries v where v.user_id=e.user_id and v.reversal_id=e.id and v.kind='payment_void') reversed
 from pro_client_entries e join pro_clients c on c.user_id=e.user_id and c.id=e.client_id join pro_work w on w.user_id=e.user_id and w.id=e.work_id left join pro_invoice_payments p on p.user_id=e.user_id and p.entry_id=e.id
 where e.user_id=p_user and e.kind='payment' and (p_client='' or e.client_id=p_client)
 union all
 select p.id,null::uuid,p.id,p.client_id,null::text,c.name,null::text,p.amount_cents,(pro_invoice_payment_metadata(p_user,p.id)->>'receivedOn')::date,pro_invoice_payment_metadata(p_user,p.id)->>'method',pro_invoice_payment_metadata(p_user,p.id)->>'reference',pro_invoice_payment_metadata(p_user,p.id)->>'reference',p.created_at,false
 from pro_invoice_payments p join pro_clients c on c.user_id=p.user_id and c.id=p.client_id where p.user_id=p_user and p.work_id is null and p.entry_id is null and (p_client='' or p.client_id=p_client)
 ), allocated as(select s.*,case when s.payment_id is null then 0 else pro_invoice_payment_used(p_user,s.payment_id,null) end applied_cents from source s),amount as(select a.*,case when reversed then 0 else amount_cents-applied_cents end available_cents from allocated a),
 filtered as materialized(
 select * from amount where (p_status='all' or p_status='reversed' and reversed or p_status='available' and not reversed and available_cents>0 or p_status='applied' and not reversed and available_cents=0 or p_status='undated' and not reversed and received_on is null)
 -- Literal matching: %, _ and backslash are ordinary characters, never wildcard patterns.
 and strpos(pro_catalog_search(concat_ws(' ',client_name,work_title,label,reference)),pro_catalog_search(p_query))>0
 and (p_status='undated' or p_from is null and p_through is null or received_on is not null and (p_from is null or received_on>=p_from) and (p_through is null or received_on<=p_through))
 ),matching as(select * from filtered where p_after is null or (registered_at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid) order by registered_at desc,id desc limit 21),page as(select * from matching order by registered_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'entryId',entry_id,'paymentId',payment_id,'clientId',client_id,'clientName',client_name,'workId',work_id,'workTitle',work_title,'amountCents',amount_cents,'appliedCents',applied_cents,'availableCents',available_cents,'receivedOn',received_on,'method',method,'reference',reference,'label',label,'registeredAt',registered_at,'reversed',reversed) order by registered_at desc,id desc) from page),'[]'),
 'nextCursor',case when (select count(*) from matching)>20 then (select jsonb_build_object('at',registered_at,'id',id) from page order by registered_at asc,id asc limit 1) else null end,
 'summary',(select jsonb_build_object('receivedCents',coalesce(sum(amount_cents) filter(where not reversed),0),'appliedCents',coalesce(sum(applied_cents) filter(where not reversed),0),'availableCents',coalesce(sum(available_cents) filter(where not reversed),0),'reversedCents',coalesce(sum(amount_cents) filter(where reversed),0),'count',count(*)) from filtered)) into result;
 return result;
end $$;
create or replace function public.pro_payment_overview_read(p_user uuid,p_id uuid,p_client text default '',p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare payment jsonb;result jsonb;
begin
 if p_client is null or length(p_client)>160 then raise exception 'Invalid payment client' using errcode='22023';end if;
 perform pro_payment_overview_validate_cursor(p_after);
 payment:=pro_payment_overview_row(p_user,p_id,p_client);if payment is null then return null;end if;
 with matching as(
 select a.id,a.draft_id,a.amount_cents,a.created_at,d.title,v.id is not null voided,v.reason void_reason,coalesce(m.archived,false) draft_archived
 from pro_invoice_payment_applications a join pro_invoice_drafts d on d.user_id=a.user_id and d.id=a.draft_id left join pro_invoice_payment_voids v on v.user_id=a.user_id and v.application_id=a.id left join pro_invoice_draft_management m on m.user_id=a.user_id and m.draft_id=a.draft_id
 where a.user_id=p_user and a.payment_id=(payment->>'paymentId')::uuid and (p_after is null or (a.created_at,a.id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid)) order by a.created_at desc,a.id desc limit 21
 ),page as(select * from matching order by created_at desc,id desc limit 20)
 select jsonb_build_object('payment',payment,'applications',coalesce((select jsonb_agg(jsonb_build_object('id',id,'draftId',draft_id,'title',title,'amountCents',amount_cents,'voided',voided,'voidReason',void_reason,'draftArchived',draft_archived) order by created_at desc,id desc) from page),'[]'),'nextCursor',case when (select count(*) from matching)>20 then (select jsonb_build_object('at',created_at,'id',id) from page order by created_at asc,id asc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function pro_payment_overview_validate_cursor(jsonb),pro_payment_overview_row(uuid,uuid,text),pro_payment_overview_page(uuid,text,text,text,jsonb,date,date),pro_payment_overview_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function pro_payment_overview_validate_cursor(jsonb),pro_payment_overview_row(uuid,uuid,text),pro_payment_overview_page(uuid,text,text,text,jsonb,date,date),pro_payment_overview_read(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
