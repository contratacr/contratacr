-- LOCAL ONLY. Reusable issuer, copied only to newly created drafts. No historical backfill.
begin;
create table if not exists public.pro_invoice_issuer_settings(
 user_id uuid primary key references profiles(id) on delete cascade,
 issuer_name text not null check(length(trim(issuer_name)) between 1 and 160),
 issuer_id_type text not null check(issuer_id_type in ('','individual','company','dimex','nite','foreign')),
 issuer_id text not null check(length(issuer_id)<=40),issuer_email text not null check(length(issuer_email)<=254),
 issuer_phone text not null check(length(issuer_phone)<=30),issuer_address text not null check(length(issuer_address)<=500),
 issuer_activity text not null check(issuer_activity='' or issuer_activity ~ '^[0-9.]{1,12}$'),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
alter table pro_invoice_issuer_settings enable row level security;
drop policy if exists pro_invoice_issuer_owner on pro_invoice_issuer_settings;
create policy pro_invoice_issuer_owner on pro_invoice_issuer_settings for select to authenticated using(user_id=auth.uid());
revoke all on pro_invoice_issuer_settings from public,anon,authenticated;
grant select on pro_invoice_issuer_settings to authenticated;
grant all on pro_invoice_issuer_settings to service_role;
create or replace function public.pro_invoice_issuer_read(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('revision',revision,'issuer',jsonb_build_object('issuerName',issuer_name,'issuerIdType',issuer_id_type,'issuerId',issuer_id,'issuerEmail',issuer_email,'issuerPhone',issuer_phone,'issuerAddress',issuer_address,'issuerActivity',issuer_activity)) from pro_invoice_issuer_settings where user_id=p_user),jsonb_build_object('revision',0,'issuer',jsonb_build_object('issuerName','','issuerIdType','','issuerId','','issuerEmail','','issuerPhone','','issuerAddress','','issuerActivity','')));
$$;
create or replace function public.pro_invoice_issuer_save(p_user uuid,p_revision integer,p_issuer jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into current_revision from pro_invoice_issuer_settings where user_id=p_user for update;
 if p_revision is null or p_revision<0 or coalesce(current_revision,0)<>p_revision then raise exception 'Issuer settings changed' using errcode='40001';end if;
 insert into pro_invoice_issuer_settings(user_id,issuer_name,issuer_id_type,issuer_id,issuer_email,issuer_phone,issuer_address,issuer_activity)
 values(p_user,p_issuer->>'issuerName',p_issuer->>'issuerIdType',p_issuer->>'issuerId',p_issuer->>'issuerEmail',p_issuer->>'issuerPhone',p_issuer->>'issuerAddress',p_issuer->>'issuerActivity')
 on conflict(user_id) do update set issuer_name=excluded.issuer_name,issuer_id_type=excluded.issuer_id_type,issuer_id=excluded.issuer_id,issuer_email=excluded.issuer_email,issuer_phone=excluded.issuer_phone,issuer_address=excluded.issuer_address,issuer_activity=excluded.issuer_activity,revision=pro_invoice_issuer_settings.revision+1,updated_at=now();
 return pro_invoice_issuer_read(p_user);
end $$;
create or replace function public.pro_invoice_configured_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing uuid;saved uuid;config jsonb;d pro_invoice_drafts;prep jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create_direct' then select id into existing from pro_invoice_drafts where user_id=p_user and id=(p_input->>'requestId')::uuid;
 elsif p_input->>'action'='create' then existing:=(pro_invoice_source(p_user,p_input->>'kind',p_input->>'sourceId')->>'existingId')::uuid;end if;
 saved:=pro_invoice_direct_save(p_user,p_input);
 -- Never overwrite snapshots on retries, normal edits, detail edits or source refresh.
 if existing is not null or p_input->>'action' not in ('create','create_direct') or p_input ? 'preparation' then return saved;end if;
 config:=pro_invoice_issuer_read(p_user);
 if (config->>'revision')::integer=0 then return saved;end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=saved;
 prep:=(config->'issuer')||jsonb_build_object('plannedDate','','saleCondition','','creditDays',0,'paymentMethod','','orderReference','');
 perform pro_invoice_full_save(p_user,jsonb_build_object('action','update','id',saved,'revision',d.revision,'title',d.title,'notes',d.notes,'receiver',jsonb_build_object('name',d.receiver_name,'identification',d.receiver_identification,'email',d.receiver_email,'phone',d.receiver_phone,'address',d.receiver_address),'preparation',prep));
 return saved;
end $$;
revoke all on function pro_invoice_issuer_read(uuid),pro_invoice_issuer_save(uuid,integer,jsonb),pro_invoice_configured_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_issuer_read(uuid),pro_invoice_issuer_save(uuid,integer,jsonb),pro_invoice_configured_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
