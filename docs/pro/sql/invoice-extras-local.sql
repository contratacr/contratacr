-- LOCAL ONLY. Explicit line special taxes and independent draft charges; no issuance or historical backfill.
-- Install after invoice-tax-local.sql. All monetary calculations remain five-decimal commercial draft math.
begin;
alter table public.pro_invoice_edited_detail drop constraint if exists pro_invoice_edited_detail_calculation_version_check;
alter table public.pro_invoice_edited_detail add constraint pro_invoice_edited_detail_calculation_version_check check(calculation_version in ('crc-draft-v1','crc-draft-tax-v2','crc-draft-extras-v3','crc-draft-extras-v4'));
create table if not exists public.pro_invoice_line_special_tax(
 user_id uuid not null,draft_id uuid not null,line_number integer not null,tax_number integer not null check(tax_number between 1 and 3),
 code text not null check(code in ('03','06','12')),rate numeric,quantity_per_unit numeric,amount_per_unit numeric,
 primary key(user_id,draft_id,line_number,tax_number),unique(user_id,draft_id,line_number,code),
 foreign key(user_id,draft_id,line_number) references public.pro_invoice_edited_lines(user_id,draft_id,line_number) on delete cascade,
 check((code='12' and rate is not null and rate>0 and rate<=100 and rate=round(rate,2) and quantity_per_unit is null and amount_per_unit is null)
 or (code in ('03','06') and rate is null and quantity_per_unit is not null and quantity_per_unit>0 and quantity_per_unit<=99999.99 and quantity_per_unit=round(quantity_per_unit,2) and amount_per_unit is not null and amount_per_unit>0 and amount_per_unit<=100000000 and amount_per_unit=round(amount_per_unit,5)))
);
create table if not exists public.pro_invoice_draft_charges(
 user_id uuid not null,draft_id uuid not null,charge_number integer not null check(charge_number between 1 and 15),
 code text not null check(code in ('01','02','03','04','05','06','07','08','09','10','99')),
 other_detail text not null check(case when code='99' then length(trim(other_detail)) between 5 and 100 else other_detail='' end),
 description text not null check(length(trim(description)) between 1 and 160),
 mode text not null check(mode in ('amount','percent')),value numeric not null check(value>0 and value<=100000000 and value=round(value,5)),base numeric,
 third_party_id_type text,third_party_id text,third_party_name text,
 primary key(user_id,draft_id,charge_number),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 check((mode='amount' and base is null) or (mode='percent' and value<=100 and base is not null and base>0 and base<=100000000 and base=round(base,5))),
 check(code<>'06' or (mode='percent' and value=10)),
 check(mode<>'percent' or round(base*value/100,5)>0),
 check((num_nonnulls(third_party_id_type,third_party_id,third_party_name)=0 and code<>'04') or (num_nulls(third_party_id_type,third_party_id,third_party_name)=0 and length(trim(third_party_name)) between 5 and 100 and case third_party_id_type when '01' then third_party_id ~ '^[1-9][0-9]{8}$' when '02' then third_party_id ~ '^[A-Za-z0-9]{10}$' when '03' then third_party_id ~ '^[1-9][0-9]{10,11}$' when '04' then third_party_id ~ '^[0-9]{10}$' else false end))
);
alter table public.pro_invoice_line_special_tax enable row level security;
alter table public.pro_invoice_draft_charges enable row level security;
drop policy if exists pro_invoice_line_special_tax_owner on public.pro_invoice_line_special_tax;
drop policy if exists pro_invoice_draft_charges_owner on public.pro_invoice_draft_charges;
create policy pro_invoice_line_special_tax_owner on public.pro_invoice_line_special_tax for select to authenticated using(user_id=(select auth.uid()));
create policy pro_invoice_draft_charges_owner on public.pro_invoice_draft_charges for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pro_invoice_line_special_tax,public.pro_invoice_draft_charges from public,anon,authenticated;
grant select on public.pro_invoice_line_special_tax,public.pro_invoice_draft_charges to authenticated;
grant all on public.pro_invoice_line_special_tax,public.pro_invoice_draft_charges to service_role;
create or replace function public.pro_invoice_extras_totals(p_user uuid,p_id uuid) returns table(gross_tax numeric,exonerated numeric,special_tax numeric,charge_total numeric)
language sql stable security invoker set search_path=public,pg_temp as $$
 with gross_lines as (select l.*,round(quantity*unit_price,5) as gross from pro_invoice_edited_lines l where user_id=p_user and draft_id=p_id),
 bases as (select *,gross-case when discount_type='percent' then round(gross*discount/100,5) else discount end as net from gross_lines),
 specials as (select t.line_number,t.code,case t.code when '12' then round(b.net*t.rate/100,5) when '03' then round(t.quantity_per_unit*t.amount_per_unit,5) when '06' then round(b.quantity*t.quantity_per_unit*t.amount_per_unit,5) end as amount from pro_invoice_line_special_tax t join bases b using(user_id,draft_id,line_number)),
 taxed as (select b.*,t.exemption_rate,b.net+coalesce((select sum(s.amount) from specials s where s.line_number=b.line_number and s.code='12'),0) as vat_base from bases b left join pro_invoice_line_tax t using(user_id,draft_id,line_number))
 select coalesce((select sum(case when tax_treatment='vat' then round(vat_base*tax_rate/100,5) else 0 end) from taxed),0),
 coalesce((select sum(case when exemption_rate is not null then round(vat_base*exemption_rate/100,5) else 0 end) from taxed),0),
 coalesce((select sum(amount) from specials),0),
 coalesce((select sum(case mode when 'amount' then value else round(base*value/100,5) end) from pro_invoice_draft_charges where user_id=p_user and draft_id=p_id),0);
$$;
create or replace function public.pro_invoice_extras_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare document jsonb;lines jsonb;charges jsonb;totals record;
begin
 document:=pro_invoice_tax_read(p_user,p_id,p_after);
 if document is null or not(exists(select 1 from pro_invoice_line_special_tax where user_id=p_user and draft_id=p_id) or exists(select 1 from pro_invoice_draft_charges where user_id=p_user and draft_id=p_id)) then return document;end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'otherDetail',other_detail,'description',description,'mode',mode,'value',value::text,'base',coalesce(base::text,''),'thirdParty',case when third_party_id_type is null then null else jsonb_build_object('idType',third_party_id_type,'id',third_party_id,'name',third_party_name) end) order by charge_number),'[]'::jsonb) into charges from pro_invoice_draft_charges where user_id=p_user and draft_id=p_id;
 document:=document||jsonb_build_object('charges',charges);
 if document->'editedDetail' is null or document->'editedDetail'='null'::jsonb then return document;end if;
 select jsonb_agg(e.value||case when e.value ? 'tax' then '{}'::jsonb else jsonb_build_object('tax',null) end||jsonb_build_object('specialTaxes',coalesce((select jsonb_agg(jsonb_build_object('code',s.code,'rate',coalesce(s.rate::text,''),'quantityPerUnit',coalesce(s.quantity_per_unit::text,''),'amountPerUnit',coalesce(s.amount_per_unit::text,'')) order by tax_number) from pro_invoice_line_special_tax s where s.user_id=p_user and s.draft_id=p_id and s.line_number=e.n),'[]'::jsonb)) order by e.n) into lines from jsonb_array_elements(document->'editedDetail'->'lines') with ordinality e(value,n);
 select * into totals from pro_invoice_extras_totals(p_user,p_id);
 return jsonb_set(document,'{editedDetail}',document->'editedDetail'||jsonb_build_object('lines',lines,'grossTax',round(totals.gross_tax,5)::text,'exonerated',round(totals.exonerated,5)::text,'specialTax',round(totals.special_tax,5)::text,'chargeTotal',round(totals.charge_total,5)::text,'version','crc-draft-extras-v3'));
end $$;
create or replace function public.pro_invoice_extras_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved uuid;target uuid;action text:=p_input->>'action';line record;special record;charge record;third jsonb;totals record;old_charges numeric;has_extras boolean;has_vat boolean;had_detail boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if action='create_direct' then
  target:=(p_input->>'requestId')::uuid;
  if exists(select 1 from pro_invoice_drafts where user_id=p_user and id=target) then return pro_invoice_tax_save(p_user,p_input);end if;
 elsif action in ('detail','refresh','reset_detail','update') then target:=(p_input->>'id')::uuid;end if;
 if action='detail' then
  if exists(select 1 from pro_invoice_line_special_tax where user_id=p_user and draft_id=target) and exists(select 1 from jsonb_array_elements(p_input->'lines') e where not(e ? 'specialTaxes')) then raise exception 'This editor cannot preserve saved special taxes; reload' using errcode='40001';end if;
  if exists(select 1 from pro_invoice_draft_charges where user_id=p_user and draft_id=target) and not(p_input ? 'charges') then raise exception 'This editor cannot preserve saved charges; reload' using errcode='40001';end if;
 end if;
 -- A reset leaves charges independent of the edited detail. Never feed them back into a source snapshot.
 if action in ('detail','refresh') and not exists(select 1 from pro_invoice_edited_detail where user_id=p_user and draft_id=target) then
  select charge_total into old_charges from pro_invoice_extras_totals(p_user,target);
  if old_charges>0 then update pro_invoice_drafts set total_cents=total_cents-round(old_charges*100) where user_id=p_user and id=target;end if;
 end if;
 select exists(select 1 from pro_invoice_edited_detail where user_id=p_user and draft_id=target) into had_detail;
 saved:=pro_invoice_tax_save(p_user,p_input);
 if action='reset_detail' and not had_detail then return saved;end if;
 if action in ('detail','create_direct') then
  for line in select value,n from jsonb_array_elements(p_input->'lines') with ordinality e(value,n) loop
   if not(line.value ? 'specialTaxes') then continue;end if;
   if jsonb_typeof(line.value->'specialTaxes') is distinct from 'array' or jsonb_array_length(line.value->'specialTaxes')>3 then raise exception 'Invalid special taxes' using errcode='22023';end if;
   for special in select value,n from jsonb_array_elements(line.value->'specialTaxes') with ordinality e(value,n) loop
    insert into pro_invoice_line_special_tax(user_id,draft_id,line_number,tax_number,code,rate,quantity_per_unit,amount_per_unit) values(p_user,saved,line.n,special.n,special.value->>'code',replace(nullif(special.value->>'rate',''),',','.')::numeric,replace(nullif(special.value->>'quantityPerUnit',''),',','.')::numeric,replace(nullif(special.value->>'amountPerUnit',''),',','.')::numeric);
   end loop;
  end loop;
  if p_input ? 'charges' then
   if jsonb_typeof(p_input->'charges') is distinct from 'array' or jsonb_array_length(p_input->'charges')>15 then raise exception 'Invalid charges' using errcode='22023';end if;
   delete from pro_invoice_draft_charges where user_id=p_user and draft_id=saved;
   for charge in select value,n from jsonb_array_elements(p_input->'charges') with ordinality e(value,n) loop
    third:=charge.value->'thirdParty';
    if third is null or (third<>'null'::jsonb and jsonb_typeof(third)<>'object') then raise exception 'Invalid third party' using errcode='22023';end if;
    insert into pro_invoice_draft_charges(user_id,draft_id,charge_number,code,other_detail,description,mode,value,base,third_party_id_type,third_party_id,third_party_name) values(p_user,saved,charge.n,charge.value->>'code',charge.value->>'otherDetail',charge.value->>'description',charge.value->>'mode',replace(charge.value->>'value',',','.')::numeric,replace(nullif(charge.value->>'base',''),',','.')::numeric,third->>'idType',third->>'id',third->>'name');
   end loop;
  end if;
 end if;
 -- Updates only change receiver/preparation/title; their already adjusted totals remain untouched.
 if action in ('detail','create_direct','refresh','reset_detail') then
  select * into totals from pro_invoice_extras_totals(p_user,saved);
  select exists(select 1 from pro_invoice_line_special_tax where user_id=p_user and draft_id=saved) or exists(select 1 from pro_invoice_draft_charges where user_id=p_user and draft_id=saved) into has_extras;
  select exists(select 1 from pro_invoice_line_tax where user_id=p_user and draft_id=saved) into has_vat;
  if exists(select 1 from pro_invoice_edited_detail where user_id=p_user and draft_id=saved) then
   if exists(select 1 from pro_invoice_edited_detail where user_id=p_user and draft_id=saved and round((net+totals.gross_tax+totals.special_tax+totals.charge_total)*100)>10000000000) then raise exception 'Draft before-exoneration total exceeds limit' using errcode='22023';end if;
   update pro_invoice_edited_detail set tax=totals.gross_tax-totals.exonerated,total=net+totals.gross_tax-totals.exonerated+totals.special_tax+totals.charge_total,calculation_version=case when has_extras then 'crc-draft-extras-v3' when has_vat then 'crc-draft-tax-v2' else 'crc-draft-v1' end where user_id=p_user and draft_id=saved;
   update pro_invoice_drafts d set total_cents=round(h.total*100),tax_cents=round((h.tax+totals.special_tax)*100) from pro_invoice_edited_detail h where h.user_id=p_user and h.draft_id=saved and d.user_id=h.user_id and d.id=h.draft_id;
  elsif totals.charge_total>0 then
   -- The legacy refresh/reset restored the source amount. Its tax NULL remains unknown, not invented zero.
   update pro_invoice_drafts set total_cents=total_cents+round(totals.charge_total*100) where user_id=p_user and id=saved;
  end if;
 end if;
 return saved;
end $$;
revoke all on function public.pro_invoice_extras_totals(uuid,uuid),public.pro_invoice_extras_read(uuid,uuid,jsonb),public.pro_invoice_extras_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_invoice_extras_totals(uuid,uuid),public.pro_invoice_extras_read(uuid,uuid,jsonb),public.pro_invoice_extras_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
