-- LOCAL ONLY. Direct drafts, no artificial work/quote, stock writes or fiscal issuance.
begin;
alter table pro_invoice_drafts drop constraint if exists pro_invoice_drafts_source_kind_check;
alter table pro_invoice_drafts add constraint pro_invoice_drafts_source_kind_check check(source_kind in ('work','quote','legacy_quote','direct'));
alter table pro_invoice_drafts drop constraint if exists pro_invoice_drafts_direct_check;
alter table pro_invoice_drafts add constraint pro_invoice_drafts_direct_check check(source_kind<>'direct' or (source_id=id::text and work_id is null and quote_origin_key is null and basis='manual' and agreed_cents is null and paid_cents is null and balance_cents is null and material_count=0 and material_cost=0));
create or replace function public.pro_invoice_direct_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select pro_invoice_editable_read(p_user,p_id,p_after)||case when exists(select 1 from pro_invoice_drafts where user_id=p_user and id=p_id and source_kind='direct') then jsonb_build_object('sourceAvailable',false,'sourceChanged',false,'sourceNeedsAmount',false,'currentFingerprint',null) else '{}'::jsonb end;
$$;
create or replace function public.pro_invoice_direct_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;c pro_clients;v_id uuid;v_hash text;v_saved uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create_direct' then
  v_id:=(p_input->>'requestId')::uuid;
  v_hash:=md5((p_input-'requestId')::text);
  select * into d from pro_invoice_drafts where user_id=p_user and id=v_id;
  if d.id is not null then
   if d.source_kind<>'direct' or d.source_fingerprint<>v_hash then raise exception 'Request already used; recover saved draft' using errcode='40001';end if;
   return d.id;
  end if;
  select * into c from pro_clients where user_id=p_user and id=p_input->>'clientId' and not archived for share;
  if c.id is null then raise exception 'Choose an active owned client' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_input->'lines') e where e->>'productId' is not null and not exists(select 1 from pro_products p where p.user_id=p_user and p.id=e->>'productId' and not p.archived)) then raise exception 'Invalid catalog item' using errcode='22023';end if;
  insert into pro_invoice_drafts(user_id,id,client_id,source_kind,source_id,title,notes,receiver_name,receiver_identification,receiver_email,receiver_phone,receiver_address,total_cents,tax_cents,material_count,material_cost,basis,source_fingerprint)
  values(p_user,v_id,c.id,'direct',v_id::text,p_input->>'title',p_input->>'notes',c.name,coalesce(c.identification,''),c.email,c.phone,coalesce(c.address,''),0,0,0,0,'manual',v_hash);
  -- Reuse the exact same monetary writer in this transaction. Failure rolls back the header too.
  v_saved:=pro_invoice_editable_save(p_user,jsonb_build_object('action','detail','id',v_id,'revision',1,'lines',p_input->'lines'));
  return v_saved;
 end if;
 if p_input->>'action' in ('refresh','reset_detail') and exists(select 1 from pro_invoice_drafts where user_id=p_user and id=(p_input->>'id')::uuid and source_kind='direct') then raise exception 'Direct drafts have no source to restore' using errcode='22023';end if;
 return pro_invoice_editable_save(p_user,p_input);
end $$;
revoke all on function pro_invoice_direct_read(uuid,uuid,jsonb),pro_invoice_direct_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_direct_read(uuid,uuid,jsonb),pro_invoice_direct_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
