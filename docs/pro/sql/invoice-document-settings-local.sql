-- LOCAL ONLY. Future-draft defaults; no historical updates, numbering or fiscal issuance.
begin;
create table if not exists public.pro_invoice_document_settings(
 user_id uuid primary key references profiles(id) on delete cascade,
 sale_condition text not null check(sale_condition in ('','cash','credit')),
 credit_days integer not null check(credit_days between 0 and 3650),
 payment_method text not null check(payment_method in ('','cash','card','transfer','sinpe','other')),
 date_mode text not null check(date_mode in ('blank','today')),
 notes text not null check(length(notes)<=2000),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 check((sale_condition='credit' and credit_days>=1 and date_mode='today') or (sale_condition<>'credit' and credit_days=0))
);
alter table pro_invoice_document_settings enable row level security;
drop policy if exists pro_invoice_document_settings_owner on pro_invoice_document_settings;
create policy pro_invoice_document_settings_owner on pro_invoice_document_settings for select to authenticated using(user_id=auth.uid());
revoke all on pro_invoice_document_settings from public,anon,authenticated;
grant select on pro_invoice_document_settings to authenticated;
grant all on pro_invoice_document_settings to service_role;
create or replace function public.pro_invoice_document_settings_read(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('revision',revision,'defaults',jsonb_build_object('saleCondition',sale_condition,'creditDays',credit_days,'paymentMethod',payment_method,'dateMode',date_mode,'notes',notes)) from pro_invoice_document_settings where user_id=p_user),jsonb_build_object('revision',0,'defaults',jsonb_build_object('saleCondition','','creditDays',0,'paymentMethod','','dateMode','blank','notes','')));
$$;
create or replace function public.pro_invoice_document_settings_save(p_user uuid,p_revision integer,p_defaults jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_revision integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v_revision from pro_invoice_document_settings where user_id=p_user for update;
 if p_revision is null or p_revision<0 or coalesce(v_revision,0)<>p_revision then raise exception 'Document settings changed' using errcode='40001';end if;
 insert into pro_invoice_document_settings(user_id,sale_condition,credit_days,payment_method,date_mode,notes)
 values(p_user,p_defaults->>'saleCondition',(p_defaults->>'creditDays')::integer,p_defaults->>'paymentMethod',p_defaults->>'dateMode',p_defaults->>'notes')
 on conflict(user_id) do update set sale_condition=excluded.sale_condition,credit_days=excluded.credit_days,payment_method=excluded.payment_method,date_mode=excluded.date_mode,notes=excluded.notes,revision=pro_invoice_document_settings.revision+1,updated_at=now();
 return pro_invoice_document_settings_read(p_user);
end $$;
-- Replaces the existing issuer hook without renaming/stacking wrappers. Reinstall is deterministic.
create or replace function public.pro_invoice_configured_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing uuid;saved uuid;config jsonb;defaults jsonb;d pro_invoice_drafts;prep jsonb;v_today text;fallback_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create_direct' then select id into existing from pro_invoice_drafts where user_id=p_user and id=(p_input->>'requestId')::uuid;
 elsif p_input->>'action'='create' then existing:=(pro_invoice_source(p_user,p_input->>'kind',p_input->>'sourceId')->>'existingId')::uuid;end if;
 saved:=pro_invoice_direct_save(p_user,p_input);
 if existing is not null or p_input->>'action' not in ('create','create_direct') or p_input ? 'preparation' then return saved;end if;
 config:=pro_invoice_issuer_read(p_user);defaults:=pro_invoice_document_settings_read(p_user);
 -- Round 7A: without saved issuer settings a new DIRECT draft (also «Bill from job») starts with the company
 -- (business) name, then the account name, like «prepare from source» already proposes in its form; editable.
 if (config->>'revision')::integer=0 and p_input->>'action'='create_direct' then
  select left(coalesce(nullif(btrim(p.business_name),''),nullif(btrim(f.full_name),''),''),160) into fallback_name
   from profiles f left join professionals p on p.profile_id=f.id where f.id=p_user order by p.id limit 1;
  if coalesce(fallback_name,'')<>'' then config:=jsonb_set(config,'{issuer,issuerName}',to_jsonb(fallback_name));end if;
 end if;
 if (config->>'revision')::integer=0 and coalesce(config->'issuer'->>'issuerName','')='' and (defaults->>'revision')::integer=0 then return saved;end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=saved;
 v_today:=((now() at time zone 'America/Costa_Rica')::date)::text;
 prep:=(config->'issuer')||jsonb_build_object('plannedDate',case when defaults->'defaults'->>'dateMode'='today' then v_today else '' end,'saleCondition',defaults->'defaults'->>'saleCondition','creditDays',(defaults->'defaults'->>'creditDays')::integer,'paymentMethod',defaults->'defaults'->>'paymentMethod','orderReference','');
 -- Notes are entered/previewed by the client. An explicitly cleared note stays cleared.
 perform pro_invoice_full_save(p_user,jsonb_build_object('action','update','id',saved,'revision',d.revision,'title',d.title,'notes',d.notes,'receiver',jsonb_build_object('name',d.receiver_name,'identification',d.receiver_identification,'email',d.receiver_email,'phone',d.receiver_phone,'address',d.receiver_address),'preparation',prep));
 return saved;
end $$;
revoke all on function pro_invoice_document_settings_read(uuid),pro_invoice_document_settings_save(uuid,integer,jsonb),pro_invoice_configured_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_document_settings_read(uuid),pro_invoice_document_settings_save(uuid,integer,jsonb),pro_invoice_configured_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
