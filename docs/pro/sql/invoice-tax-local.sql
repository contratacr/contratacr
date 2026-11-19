-- LOCAL ONLY. Explicit ordinary IVA and documentary exoneration snapshots; no fiscal emission/backfill.
-- Install after client-fiscal-local.sql. Raw direct-create inputs retain their original request hashes.
begin;
alter table public.pro_invoice_edited_detail drop constraint if exists pro_invoice_edited_detail_calculation_version_check;
alter table public.pro_invoice_edited_detail add constraint pro_invoice_edited_detail_calculation_version_check check(calculation_version in ('crc-draft-v1','crc-draft-tax-v2','crc-draft-extras-v3','crc-draft-extras-v4'));
create table if not exists public.pro_invoice_line_tax(
 user_id uuid not null,draft_id uuid not null,line_number integer not null,
 vat_code text not null check(vat_code in ('01','02','03','04','08','09','10','11')),
 exemption_document_type text check(exemption_document_type in ('02','03','04','08','09','10','99')),
 exemption_document_other text,exemption_document_number text,exemption_article text,exemption_paragraph text,
 exemption_institution text,exemption_institution_other text,exemption_issued_on date,exemption_rate numeric,
 primary key(user_id,draft_id,line_number),
 foreign key(user_id,draft_id,line_number) references public.pro_invoice_edited_lines(user_id,draft_id,line_number) on delete cascade,
 check((exemption_document_type is null and num_nonnulls(exemption_document_other,exemption_document_number,exemption_article,exemption_paragraph,exemption_institution,exemption_institution_other,exemption_issued_on,exemption_rate)=0)
 or (exemption_document_type is not null and num_nulls(exemption_document_other,exemption_document_number,exemption_article,exemption_paragraph,exemption_institution,exemption_institution_other,exemption_issued_on,exemption_rate)=0)),
 check(exemption_document_type is null or length(trim(exemption_document_number)) between 3 and 40),
 check(exemption_document_type is null or case when exemption_document_type='99' then length(trim(exemption_document_other)) between 5 and 100 else exemption_document_other='' end),
 check(exemption_document_type is null or exemption_institution in ('01','02','03','04','05','06','07','08','09','10','11','12','99')),
 check(exemption_document_type is null or case when exemption_institution='99' then length(trim(exemption_institution_other)) between 5 and 160 else exemption_institution_other='' end),
 check(exemption_document_type is null or ((exemption_article='' and exemption_document_type not in ('02','03','08')) or (exemption_article ~ '^[0-9]{1,6}$' and exemption_article::integer>0))),
 check(exemption_document_type is null or exemption_paragraph='' or (exemption_article<>'' and exemption_paragraph ~ '^[0-9]{1,6}$')),
 check(exemption_document_type is null or (exemption_rate>0 and exemption_rate<=13 and exemption_rate=round(exemption_rate,2)))
);
-- Validate the ordinary code against the actual saved line, including zero-rate distinctions.
create or replace function public.pro_invoice_line_tax_validate() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare line pro_invoice_edited_lines;expected_rate numeric;
begin
 select * into line from pro_invoice_edited_lines where user_id=new.user_id and draft_id=new.draft_id and line_number=new.line_number;
 expected_rate:=case new.vat_code when '01' then 0 when '02' then 1 when '03' then 2 when '04' then 4 when '08' then 13 when '09' then 0.5 when '10' then 0 when '11' then 0 end;
 if line.draft_id is null or line.tax_rate is distinct from expected_rate or line.tax_treatment is distinct from (case new.vat_code when '10' then 'exempt' when '11' then 'not_subject' else 'vat' end) then raise exception 'Ordinary IVA code does not match line treatment/rate' using errcode='22023';end if;
 if new.exemption_document_type is not null and (line.tax_treatment<>'vat' or line.tax_rate<=0 or new.exemption_rate>line.tax_rate) then raise exception 'Exoneration exceeds positive IVA rate' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_invoice_line_tax_validate on public.pro_invoice_line_tax;
create trigger pro_invoice_line_tax_validate before insert or update on public.pro_invoice_line_tax for each row execute function public.pro_invoice_line_tax_validate();
alter table public.pro_invoice_line_tax enable row level security;
drop policy if exists pro_invoice_line_tax_owner on public.pro_invoice_line_tax;
create policy pro_invoice_line_tax_owner on public.pro_invoice_line_tax for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pro_invoice_line_tax from public,anon,authenticated;
grant select on public.pro_invoice_line_tax to authenticated;
grant all on public.pro_invoice_line_tax to service_role;
create or replace function public.pro_invoice_tax_totals(p_user uuid,p_id uuid) returns table(gross_tax numeric,exonerated numeric)
language sql stable security invoker set search_path=public,pg_temp as $$
 with bases as (
 select l.*,t.exemption_rate,round(l.quantity*l.unit_price,5) as gross from pro_invoice_edited_lines l left join pro_invoice_line_tax t using(user_id,draft_id,line_number) where l.user_id=p_user and l.draft_id=p_id
 ), priced as (select *,gross-case when discount_type='percent' then round(gross*discount/100,5) else discount end as base from bases)
 select coalesce(sum(case when tax_treatment='vat' then round(base*tax_rate/100,5) else 0 end),0),coalesce(sum(case when exemption_rate is not null then round(base*exemption_rate/100,5) else 0 end),0) from priced;
$$;
create or replace function public.pro_invoice_tax_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare document jsonb;lines jsonb;gross_tax numeric;exonerated numeric;
begin
 document:=pro_invoice_fiscal_read(p_user,p_id,p_after);
 if document is null or not exists(select 1 from pro_invoice_line_tax where user_id=p_user and draft_id=p_id) then return document;end if;
 select jsonb_agg(e.value||case when t.line_number is null then jsonb_build_object('tax',null) else jsonb_build_object('tax',jsonb_build_object('vatCode',t.vat_code,'exemption',case when t.exemption_document_type is null then null else jsonb_build_object('documentType',t.exemption_document_type,'documentOther',t.exemption_document_other,'documentNumber',t.exemption_document_number,'article',t.exemption_article,'paragraph',t.exemption_paragraph,'institution',t.exemption_institution,'institutionOther',t.exemption_institution_other,'issuedOn',t.exemption_issued_on::text,'rate',t.exemption_rate::text) end)) end order by e.n)
 into lines from jsonb_array_elements(document->'editedDetail'->'lines') with ordinality e(value,n) left join pro_invoice_line_tax t on t.user_id=p_user and t.draft_id=p_id and t.line_number=e.n;
 select * into gross_tax,exonerated from pro_invoice_tax_totals(p_user,p_id);
 return jsonb_set(document,'{editedDetail}',document->'editedDetail'||jsonb_build_object('lines',lines,'grossTax',round(gross_tax,5)::text,'exonerated',round(exonerated,5)::text,'version','crc-draft-tax-v2'));
end $$;
create or replace function public.pro_invoice_tax_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved uuid;target uuid;action text:=p_input->>'action';entry record;tax jsonb;exemption jsonb;gross_tax numeric;exonerated numeric;has_tax boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if action='create_direct' then
  target:=(p_input->>'requestId')::uuid;
  -- Delegate unchanged so the existing direct writer validates both owner and exact request fingerprint.
  if exists(select 1 from pro_invoice_drafts where user_id=p_user and id=target) then return pro_invoice_fiscal_save(p_user,p_input);end if;
 elsif action='detail' then target:=(p_input->>'id')::uuid;end if;
 if action='detail' and exists(select 1 from pro_invoice_line_tax where user_id=p_user and draft_id=target) and exists(select 1 from jsonb_array_elements(p_input->'lines') line where not(line ? 'tax')) then raise exception 'This editor cannot preserve saved exonerations; reload before replacing detail' using errcode='40001';end if;
 saved:=pro_invoice_fiscal_save(p_user,p_input);
 if action in ('detail','create_direct') then
  -- The underlying detail writer replaced lines and cascaded their former tax snapshots atomically.
  for entry in select value,n from jsonb_array_elements(p_input->'lines') with ordinality e(value,n) loop
   tax:=entry.value->'tax';
   if tax is null or tax='null'::jsonb then continue;end if;
   if jsonb_typeof(tax) is distinct from 'object' or not(tax ? 'exemption') then raise exception 'Invalid tax snapshot' using errcode='22023';end if;
   exemption:=tax->'exemption';
   if exemption<>'null'::jsonb and (jsonb_typeof(exemption) is distinct from 'object' or coalesce(exemption->>'issuedOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(exemption->>'rate','') !~ '^[0-9]{1,2}([.,][0-9]{1,2})?$') then raise exception 'Invalid exoneration date/rate' using errcode='22023';end if;
   insert into pro_invoice_line_tax(user_id,draft_id,line_number,vat_code,exemption_document_type,exemption_document_other,exemption_document_number,exemption_article,exemption_paragraph,exemption_institution,exemption_institution_other,exemption_issued_on,exemption_rate)
   values(p_user,saved,entry.n,tax->>'vatCode',exemption->>'documentType',exemption->>'documentOther',exemption->>'documentNumber',exemption->>'article',exemption->>'paragraph',exemption->>'institution',exemption->>'institutionOther',nullif(exemption->>'issuedOn','')::date,replace(exemption->>'rate',',','.')::numeric);
  end loop;
  select exists(select 1 from pro_invoice_line_tax where user_id=p_user and draft_id=saved) into has_tax;
  select * into gross_tax,exonerated from pro_invoice_tax_totals(p_user,saved);
  update pro_invoice_edited_detail set tax=gross_tax-exonerated,total=net+gross_tax-exonerated,calculation_version=case when has_tax then 'crc-draft-tax-v2' else 'crc-draft-v1' end where user_id=p_user and draft_id=saved;
  update pro_invoice_drafts d set tax_cents=round(h.tax*100),total_cents=round(h.total*100) from pro_invoice_edited_detail h where h.user_id=p_user and h.draft_id=saved and d.user_id=h.user_id and d.id=h.draft_id;
 end if;
 return saved;
end $$;
revoke all on function public.pro_invoice_line_tax_validate(),public.pro_invoice_tax_totals(uuid,uuid),public.pro_invoice_tax_read(uuid,uuid,jsonb),public.pro_invoice_tax_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_invoice_line_tax_validate(),public.pro_invoice_tax_totals(uuid,uuid),public.pro_invoice_tax_read(uuid,uuid,jsonb),public.pro_invoice_tax_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
