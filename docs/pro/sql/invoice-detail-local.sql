-- LOCAL ONLY. Editable commercial draft detail, separate from source snapshots and operational ledgers.
begin;
create table if not exists public.pro_invoice_edited_detail(
 user_id uuid not null,draft_id uuid not null,source_total_cents bigint not null,source_tax_cents bigint,
 gross numeric not null,discount numeric not null,net numeric not null,tax numeric not null,total numeric not null,
 calculation_version text not null default 'crc-draft-v1' check(calculation_version='crc-draft-v1'),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_edited_lines(
 user_id uuid not null,draft_id uuid not null,line_number integer not null check(line_number between 1 and 100),
 kind text not null check(kind in ('pending','product','service')),product_id text,sku text not null check(length(sku)<=160),
 description text not null check(length(trim(description)) between 1 and 200),unit text not null check(length(unit)<=30),cabys text not null check(cabys='' or cabys ~ '^[0-9]{13}$'),
 quantity numeric not null check(quantity>0 and quantity<=1000000 and quantity=round(quantity,5)),
 unit_price numeric not null check(unit_price between 0 and 100000000 and unit_price=round(unit_price,5)),
 discount_type text not null check(discount_type in ('percent','amount')),discount numeric not null check(discount>=0 and discount<=100000000 and discount=round(discount,5)),discount_reason text not null check(length(discount_reason)<=160),
 tax_treatment text not null check(tax_treatment in ('pending','vat','exempt','not_subject')),tax_rate numeric not null check(tax_rate between 0 and 100 and tax_rate=round(tax_rate,5)),
 primary key(user_id,draft_id,line_number),foreign key(user_id,draft_id) references pro_invoice_edited_detail(user_id,draft_id) on delete cascade,
 foreign key(user_id,product_id) references pro_products(user_id,id) on delete set null (product_id),
 check(product_id is null or kind='product'),check(discount_type<>'percent' or discount<=100),check(tax_treatment='vat' or tax_rate=0),
 check(discount_type<>'amount' or discount<=round(quantity*unit_price,5))
);
-- Retain the invoice snapshot if a catalog item is hard-deleted, including owner cascades.
alter table pro_invoice_edited_lines drop constraint if exists pro_invoice_edited_lines_user_id_product_id_fkey;
alter table pro_invoice_edited_lines add constraint pro_invoice_edited_lines_user_id_product_id_fkey foreign key(user_id,product_id) references pro_products(user_id,id) on delete set null (product_id);
alter table pro_invoice_edited_detail enable row level security;
alter table pro_invoice_edited_lines enable row level security;
drop policy if exists pro_invoice_edited_detail_owner on pro_invoice_edited_detail;
drop policy if exists pro_invoice_edited_lines_owner on pro_invoice_edited_lines;
create policy pro_invoice_edited_detail_owner on pro_invoice_edited_detail for select to authenticated using(user_id=auth.uid());
create policy pro_invoice_edited_lines_owner on pro_invoice_edited_lines for select to authenticated using(user_id=auth.uid());
revoke all on pro_invoice_edited_detail,pro_invoice_edited_lines from public,anon,authenticated;
grant select on pro_invoice_edited_detail,pro_invoice_edited_lines to authenticated;
grant all on pro_invoice_edited_detail,pro_invoice_edited_lines to service_role;
create or replace function public.pro_invoice_editable_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select pro_invoice_full_read(p_user,p_id,p_after)||jsonb_build_object('editedDetail',(
 select jsonb_build_object('sourceTotalCents',source_total_cents,'sourceTaxCents',source_tax_cents,'gross',gross::text,'discount',discount::text,'net',net::text,'tax',tax::text,'total',total::text,'version',calculation_version,
 'lines',(select jsonb_agg(jsonb_build_object('kind',kind,'productId',product_id,'sku',sku,'description',description,'unit',unit,'cabys',cabys,'quantity',quantity::text,'unitPrice',unit_price::text,'discountType',discount_type,'discount',discount::text,'discountReason',discount_reason,'taxTreatment',tax_treatment,'taxRate',tax_rate::text) order by line_number) from pro_invoice_edited_lines where user_id=p_user and draft_id=p_id))
 from pro_invoice_edited_detail where user_id=p_user and draft_id=p_id));
$$;
create or replace function public.pro_invoice_editable_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;h pro_invoice_edited_detail;saved uuid;v_gross numeric;v_discount numeric;v_net numeric;v_tax numeric;v_total numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action' in ('detail','reset_detail') then
  select * into d from pro_invoice_drafts where user_id=p_user and id=(p_input->>'id')::uuid for update;
  if d.id is null then raise exception 'Missing draft' using errcode='22023';end if;
  if d.revision<>(p_input->>'revision')::integer then raise exception 'Draft changed' using errcode='40001';end if;
  select * into h from pro_invoice_edited_detail where user_id=p_user and draft_id=d.id;
  if p_input->>'action'='reset_detail' then
   if h.draft_id is null then return d.id;end if;
   update pro_invoice_drafts set total_cents=h.source_total_cents,tax_cents=h.source_tax_cents,revision=revision+1,updated_at=now() where user_id=p_user and id=d.id;
   delete from pro_invoice_edited_detail where user_id=p_user and draft_id=d.id;
   return d.id;
  end if;
  if jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then raise exception 'Invalid detail' using errcode='22023';end if;
  insert into pro_invoice_edited_detail(user_id,draft_id,source_total_cents,source_tax_cents,gross,discount,net,tax,total)
   values(p_user,d.id,d.total_cents,d.tax_cents,0,0,0,0,0) on conflict(user_id,draft_id) do nothing;
  delete from pro_invoice_edited_lines where user_id=p_user and draft_id=d.id;
  insert into pro_invoice_edited_lines(user_id,draft_id,line_number,kind,product_id,sku,description,unit,cabys,quantity,unit_price,discount_type,discount,discount_reason,tax_treatment,tax_rate)
  select p_user,d.id,n,r->>'kind',r->>'productId',r->>'sku',r->>'description',r->>'unit',r->>'cabys',replace(r->>'quantity',',','.')::numeric,replace(r->>'unitPrice',',','.')::numeric,r->>'discountType',replace(r->>'discount',',','.')::numeric,r->>'discountReason',r->>'taxTreatment',replace(r->>'taxRate',',','.')::numeric from jsonb_array_elements(p_input->'lines') with ordinality e(r,n);
  with gross_lines as (select *,round(quantity*unit_price,5) as gross from pro_invoice_edited_lines where user_id=p_user and draft_id=d.id),
  discounted as (select *,case when discount_type='percent' then round(gross*discount/100,5) else discount end as reduction from gross_lines),
  priced as (select *,gross-reduction as base,case when tax_treatment='vat' then round((gross-reduction)*tax_rate/100,5) else 0 end as iva from discounted)
  select sum(gross),sum(reduction),sum(base),sum(iva),sum(base+iva) into v_gross,v_discount,v_net,v_tax,v_total from priced;
  update pro_invoice_edited_detail set gross=v_gross,discount=v_discount,net=v_net,tax=v_tax,total=v_total where user_id=p_user and draft_id=d.id;
  update pro_invoice_drafts set total_cents=round(v_total*100),tax_cents=round(v_tax*100),revision=revision+1,updated_at=now() where user_id=p_user and id=d.id;
  return d.id;
 end if;
 if p_input->>'action'='refresh' then
  select * into h from pro_invoice_edited_detail where user_id=p_user and draft_id=(p_input->>'id')::uuid;
  -- The legacy refresher retains the saved amount for an unpriced/manual job.
  -- Give it the source amount, never the edited invoice amount, for that rule.
  if h.draft_id is not null then update pro_invoice_drafts set total_cents=h.source_total_cents,tax_cents=h.source_tax_cents where user_id=p_user and id=h.draft_id;end if;
 end if;
 saved:=pro_invoice_full_save(p_user,p_input);
 if p_input->>'action'='refresh' then
  select * into h from pro_invoice_edited_detail where user_id=p_user and draft_id=saved;
  if h.draft_id is not null then
   update pro_invoice_edited_detail set source_total_cents=draft.total_cents,source_tax_cents=draft.tax_cents from pro_invoice_drafts draft where pro_invoice_edited_detail.user_id=p_user and pro_invoice_edited_detail.draft_id=saved and draft.user_id=p_user and draft.id=saved;
   update pro_invoice_drafts set total_cents=round(h.total*100),tax_cents=round(h.tax*100) where user_id=p_user and id=saved;
  end if;
 end if;
 return saved;
end $$;
revoke all on function pro_invoice_editable_read(uuid,uuid,jsonb),pro_invoice_editable_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_editable_read(uuid,uuid,jsonb),pro_invoice_editable_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
