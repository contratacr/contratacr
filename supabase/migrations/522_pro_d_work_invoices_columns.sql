-- Pro area D (money): project Invoices table columns "Linked docs" and "Updated". Same read function as migration 480 with two extra fields per invoice:
-- linkedDocs = credits applied to the invoice, updatedAt = latest of creation, delivery, first view and last credit applied. Read only, owner only.
begin;
create or replace function public.pro_work_invoices_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=p_work) then raise exception 'Job unavailable' using errcode='P0002';end if;
 select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]'::jsonb) into v_rows
 from (
  select d.id as id,d.created_at as created_at,
   public.pro_invoice_lifecycle(p_actor,d.id)||jsonb_build_object('id',d.id,'title',d.title,'receiver',d.receiver_name,'createdAt',d.created_at,
    'linkedDocs',(select count(*) from public.pro_credit_applications a where a.owner_id=p_actor and a.draft_id=d.id),
    'updatedAt',greatest(d.created_at,
     (select v.sent_at from public.pro_invoice_deliveries v where v.user_id=p_actor and v.draft_id=d.id),
     (select v.viewed_at from public.pro_invoice_deliveries v where v.user_id=p_actor and v.draft_id=d.id),
     (select max(a.created_at) from public.pro_credit_applications a where a.owner_id=p_actor and a.draft_id=d.id))) as item
  from public.pro_invoice_drafts d
  where d.user_id=p_actor and d.work_id=p_work
  order by d.created_at desc,d.id desc limit 100
 ) x;
 return jsonb_build_object('workId',p_work,'items',v_rows);
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='pro_work_invoices_read' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
