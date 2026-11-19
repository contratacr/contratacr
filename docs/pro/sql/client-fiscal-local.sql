-- LOCAL ONLY. Reusable client fiscal data and immutable-by-default draft snapshots.
-- Install after invoice-issuer-local.sql. No backfill, fiscal emission or base-source fingerprint changes.
begin;
create table if not exists public.pro_client_fiscal_settings(
 user_id uuid not null,client_id text not null,
 name text not null check(length(trim(name)) between 1 and 160),identification text not null check(length(identification)<=40),email text not null check(length(email)<=254),phone text not null check(length(phone)<=30),address text not null check(length(address)<=500),
 identification_type text not null check(identification_type in ('','individual','company','dimex','nite','foreign')),
 activity text not null check(activity='' or activity ~ '^[0-9.]{1,12}$'),
 province text not null check(length(province)<=80),
 canton text not null check(length(canton)<=80),
 district text not null check(length(district)<=80),
 neighborhood text not null check(length(neighborhood)<=100),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(user_id,client_id),foreign key(user_id,client_id) references public.pro_clients(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_receiver_fiscal(
 user_id uuid not null,draft_id uuid not null,
 identification_type text not null check(identification_type in ('','individual','company','dimex','nite','foreign')),
 activity text not null check(activity='' or activity ~ '^[0-9.]{1,12}$'),
 province text not null check(length(province)<=80),
 canton text not null check(length(canton)<=80),
 district text not null check(length(district)<=80),
 neighborhood text not null check(length(neighborhood)<=100),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade
);
alter table public.pro_client_fiscal_settings enable row level security;
drop policy if exists pro_client_fiscal_settings_owner on public.pro_client_fiscal_settings;
create policy pro_client_fiscal_settings_owner on public.pro_client_fiscal_settings for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pro_client_fiscal_settings from public,anon,authenticated;
grant select on public.pro_client_fiscal_settings to authenticated;
grant all on public.pro_client_fiscal_settings to service_role;
alter table public.pro_invoice_receiver_fiscal enable row level security;
drop policy if exists pro_invoice_receiver_fiscal_owner on public.pro_invoice_receiver_fiscal;
create policy pro_invoice_receiver_fiscal_owner on public.pro_invoice_receiver_fiscal for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pro_invoice_receiver_fiscal from public,anon,authenticated;
grant select on public.pro_invoice_receiver_fiscal to authenticated;
grant all on public.pro_invoice_receiver_fiscal to service_role;
create or replace function public.pro_client_fiscal_read(p_user uuid,p_client text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce(f.revision,0),'receiver',
 case when f.client_id is not null then jsonb_build_object('name',f.name,'identification',f.identification,'email',f.email,'phone',f.phone,'address',f.address,'identificationType',f.identification_type,'activity',f.activity,'province',f.province,'canton',f.canton,'district',f.district,'neighborhood',f.neighborhood)
 else jsonb_build_object('name',c.name,'identification',coalesce(c.identification,''),'email',c.email,'phone',c.phone,'address',coalesce(c.address,''),'identificationType','','activity','','province','','canton','','district','','neighborhood','') end)
 from pro_clients c left join pro_client_fiscal_settings f on f.user_id=c.user_id and f.client_id=c.id where c.user_id=p_user and c.id=p_client;
$$;
create or replace function public.pro_client_fiscal_save(p_user uuid,p_client text,p_revision integer,p_receiver jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from pro_clients where user_id=p_user and id=p_client and not archived) then raise exception 'Choose an active owned client' using errcode='22023';end if;
 select revision into current_revision from pro_client_fiscal_settings where user_id=p_user and client_id=p_client for update;
 if p_revision is null or p_revision<0 or coalesce(current_revision,0)<>p_revision then raise exception 'Client fiscal settings changed' using errcode='40001';end if;
 if jsonb_typeof(p_receiver) is distinct from 'object' then raise exception 'Invalid fiscal receiver' using errcode='22023';end if;
 insert into pro_client_fiscal_settings(user_id,client_id,name,identification,email,phone,address,identification_type,activity,province,canton,district,neighborhood) values(p_user,p_client,p_receiver->>'name',p_receiver->>'identification',p_receiver->>'email',p_receiver->>'phone',p_receiver->>'address',p_receiver->>'identificationType',p_receiver->>'activity',p_receiver->>'province',p_receiver->>'canton',p_receiver->>'district',p_receiver->>'neighborhood')
 on conflict(user_id,client_id) do update set name=excluded.name,identification=excluded.identification,email=excluded.email,phone=excluded.phone,address=excluded.address,identification_type=excluded.identification_type,activity=excluded.activity,province=excluded.province,canton=excluded.canton,district=excluded.district,neighborhood=excluded.neighborhood,revision=pro_client_fiscal_settings.revision+1,updated_at=now();
 return pro_client_fiscal_read(p_user,p_client);
end $$;
create or replace function public.pro_invoice_fiscal_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when b.document is null then null else b.document||case when f.draft_id is null then '{}'::jsonb else jsonb_build_object('receiver',b.document->'receiver'||jsonb_build_object('identificationType',f.identification_type,'activity',f.activity,'province',f.province,'canton',f.canton,'district',f.district,'neighborhood',f.neighborhood)) end end
 from (select pro_invoice_direct_read(p_user,p_id,p_after) as document) b left join pro_invoice_receiver_fiscal f on f.user_id=p_user and f.draft_id=p_id;
$$;
create or replace function public.pro_invoice_fiscal_source(p_user uuid,p_kind text,p_id text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare source jsonb;config jsonb;
begin
 source:=pro_invoice_source(p_user,p_kind,p_id);
 if source is null then return null;end if;
 if source->>'clientId' is not null then config:=pro_client_fiscal_read(p_user,source->>'clientId');end if;
 -- Keep the base fingerprint: the original writer independently verifies that exact source.
 -- The receiver shown in this preview must be sent explicitly on create and is snapshotted.
 if config is not null then source:=jsonb_set(source,'{receiver}',config->'receiver');end if;
 return source;
end $$;
create or replace function public.pro_invoice_fiscal_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing uuid;saved uuid;receiver jsonb;config jsonb;d pro_invoice_drafts;action text:=p_input->>'action';
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if action='create_direct' then select id into existing from pro_invoice_drafts where user_id=p_user and id=(p_input->>'requestId')::uuid;
 elsif action='create' then existing:=(pro_invoice_source(p_user,p_input->>'kind',p_input->>'sourceId')->>'existingId')::uuid;end if;
 -- Pass raw input unchanged. Direct request fingerprints include every input property.
 saved:=pro_invoice_configured_save(p_user,p_input);
 if existing is not null then return saved;end if;
 if action='create_direct' then
  select * into d from pro_invoice_drafts where user_id=p_user and id=saved;
  config:=pro_client_fiscal_read(p_user,d.client_id);
  if (config->>'revision')::integer=0 then return saved;end if;
  receiver:=config->'receiver';
  if receiver is null then raise exception 'Missing client receiver' using errcode='22023';end if;
  -- The original direct creator already incremented the revision; this remains one atomic creation.
  update pro_invoice_drafts set receiver_name=receiver->>'name',receiver_identification=receiver->>'identification',receiver_email=receiver->>'email',receiver_phone=receiver->>'phone',receiver_address=receiver->>'address' where user_id=p_user and id=saved;
 elsif action in ('create','update') and (p_input->'receiver') ? 'identificationType' then receiver:=p_input->'receiver';
 else return saved;end if;
 -- New fields only; old callers and source refresh cannot erase an existing snapshot.
 insert into pro_invoice_receiver_fiscal(user_id,draft_id,identification_type,activity,province,canton,district,neighborhood) values(p_user,saved,receiver->>'identificationType',receiver->>'activity',receiver->>'province',receiver->>'canton',receiver->>'district',receiver->>'neighborhood')
 on conflict(user_id,draft_id) do update set identification_type=excluded.identification_type,activity=excluded.activity,province=excluded.province,canton=excluded.canton,district=excluded.district,neighborhood=excluded.neighborhood;
 return saved;
end $$;
revoke all on function public.pro_client_fiscal_read(uuid,text),public.pro_client_fiscal_save(uuid,text,integer,jsonb),public.pro_invoice_fiscal_read(uuid,uuid,jsonb),public.pro_invoice_fiscal_source(uuid,text,text),public.pro_invoice_fiscal_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_client_fiscal_read(uuid,text),public.pro_client_fiscal_save(uuid,text,integer,jsonb),public.pro_invoice_fiscal_read(uuid,uuid,jsonb),public.pro_invoice_fiscal_source(uuid,text,text),public.pro_invoice_fiscal_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
