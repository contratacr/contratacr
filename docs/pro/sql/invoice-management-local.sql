-- LOCAL ONLY. Archive flags and exact independent copies; no backfill, deletion or issuance.
-- Install after the complete invoice stack. Header trigger survives writer reinstallation.
begin;
create table if not exists public.pro_invoice_draft_management(
 user_id uuid not null,draft_id uuid not null,archived boolean not null default false,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_draft_copies(
 user_id uuid not null,request_id uuid not null,source_id uuid not null,input_hash text not null,
 primary key(user_id,request_id),foreign key(user_id,request_id) references pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(user_id,source_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
-- Metadata must not block the existing account-deletion cascade. Reinstall also
-- upgrades already-created local tables; no draft or snapshot is deleted here.
alter table public.pro_invoice_draft_copies drop constraint if exists pro_invoice_draft_copies_user_id_source_id_fkey;
alter table public.pro_invoice_draft_copies add constraint pro_invoice_draft_copies_user_id_source_id_fkey foreign key(user_id,source_id) references public.pro_invoice_drafts(user_id,id) on delete cascade;
-- An archive obtains the same owner lock and header row lock as edits. A waiting
-- edit observes the committed archive before its first header update can commit.
create or replace function public.pro_invoice_active_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from pro_invoice_draft_management where user_id=old.user_id and draft_id=old.id and archived) then raise exception 'Restore archived draft before editing' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_invoice_active_guard on pro_invoice_drafts;
create trigger pro_invoice_active_guard before update on pro_invoice_drafts for each row execute function pro_invoice_active_guard();
alter table pro_invoice_draft_management enable row level security;
alter table pro_invoice_draft_copies enable row level security;
drop policy if exists pro_invoice_management_owner on pro_invoice_draft_management;
drop policy if exists pro_invoice_copies_owner on pro_invoice_draft_copies;
create policy pro_invoice_management_owner on pro_invoice_draft_management for select to authenticated using(user_id=(select auth.uid()));
create policy pro_invoice_copies_owner on pro_invoice_draft_copies for select to authenticated using(user_id=(select auth.uid()));
revoke all on pro_invoice_draft_management,pro_invoice_draft_copies from public,anon,authenticated;
grant select on pro_invoice_draft_management,pro_invoice_draft_copies to authenticated;
grant all on pro_invoice_draft_management,pro_invoice_draft_copies to service_role;
create or replace function public.pro_invoice_management_read(p_user uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',d.id,'revision',d.revision,'managementRevision',coalesce(m.revision,0),'archived',coalesce(m.archived,false)) from pro_invoice_drafts d left join pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id where d.user_id=p_user and d.id=p_id;
$$;
create or replace function public.pro_invoice_management_page(p_user uuid,p_search text default '',p_archived boolean default false,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with context as (
 select d.*,c.name as client_name,w.service as work_title,coalesce(l.title,q.title) as quote_title,coalesce(m.revision,0) as management_revision,coalesce(m.archived,false) as archived
 from pro_invoice_drafts d join pro_clients c on c.user_id=d.user_id and c.id=d.client_id
 left join pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
 left join pro_work w on w.user_id=d.user_id and w.id=d.work_id
 left join pro_legacy_quotes l on l.user_id=d.user_id and l.id=coalesce(w."quoteId",case when d.source_kind='legacy_quote' then d.source_id when d.quote_origin_key like 'legacy_quote:%' then substr(d.quote_origin_key,14) end)
 left join quotes q on q.id::text=coalesce(w."externalQuoteId",case when d.source_kind='quote' then d.source_id when d.quote_origin_key like 'quote:%' then substr(d.quote_origin_key,7) end) and exists(select 1 from professionals p where p.id=q.professional_id and p.profile_id=p_user)
 where d.user_id=p_user
 ), matches as (
 select * from context where archived=p_archived and strpos(pro_catalog_search(concat_ws(' ',title,receiver_name,client_name,work_title,quote_title)),pro_catalog_search(trim(p_search)))>0
 and (p_after is null or (created_at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid)) order by created_at desc,id desc limit 21
 ), page as (select * from matches order by created_at desc,id desc limit 20)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'receiver',receiver_name,'client',client_name,'clientId',client_id,'work',work_title,'quote',quote_title,'totalCents',total_cents,'revision',revision,'managementRevision',management_revision,'archived',archived,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc,id desc) from page),'[]'),
 'nextCursor',case when (select count(*) from matches)>20 then (select jsonb_build_object('at',created_at,'id',id) from page order by created_at,id limit 1) else null end);
$$;
create or replace function public.pro_invoice_management_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;m pro_invoice_draft_management;c pro_invoice_draft_copies;target uuid;hash text;relation text;patch jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='duplicate' then
  target:=(p_input->>'requestId')::uuid;hash:=md5((p_input-'requestId')::text);
  select * into c from pro_invoice_draft_copies where user_id=p_user and request_id=target;
  if c.request_id is not null then if c.input_hash<>hash then raise exception 'Copy request already used' using errcode='40001';end if;return target;end if;
  if exists(select 1 from pro_invoice_drafts where user_id=p_user and id=target) then raise exception 'Copy request collision' using errcode='40001';end if;
 end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=(p_input->>'id')::uuid for update;
 if d.id is null then raise exception 'Missing owned draft' using errcode='22023';end if;
 select * into m from pro_invoice_draft_management where user_id=p_user and draft_id=d.id;
 if d.revision is distinct from (p_input->>'revision')::integer or coalesce(m.revision,0) is distinct from (p_input->>'managementRevision')::integer then raise exception 'Draft changed before action' using errcode='40001';end if;
 if p_input->>'action' in ('archive','restore') then
  insert into pro_invoice_draft_management(user_id,draft_id,archived) values(p_user,d.id,p_input->>'action'='archive') on conflict(user_id,draft_id) do update set archived=excluded.archived,revision=pro_invoice_draft_management.revision+1,updated_at=now();
  return d.id;
 elsif p_input->>'action'='duplicate' then
  patch:=jsonb_build_object('user_id',p_user,'id',target,'source_kind','direct','source_id',target::text,'work_id',null,'quote_origin_key',null,'basis','manual','agreed_cents',null,'paid_cents',null,'balance_cents',null,'material_count',0,'material_cost',0,'source_fingerprint',hash,'revision',1,'created_at',now(),'updated_at',now());
  insert into pro_invoice_drafts select (jsonb_populate_record(null::pro_invoice_drafts,to_jsonb(d)||patch)).*;
  patch:=jsonb_build_object('user_id',p_user,'draft_id',target);
  foreach relation in array array['pro_invoice_lines','pro_invoice_preparation','pro_invoice_receiver_fiscal','pro_invoice_edited_detail','pro_invoice_edited_lines','pro_invoice_line_tax','pro_invoice_line_special_tax','pro_invoice_draft_charges'] loop
   execute format('insert into %I select (jsonb_populate_record(null::%I,to_jsonb(r)||$3)).* from %I r where user_id=$1 and draft_id=$2',relation,relation,relation) using p_user,d.id,patch;
  end loop;
  insert into pro_invoice_draft_copies values(p_user,target,d.id,hash);
  return target;
 end if;
 raise exception 'Unsupported management action' using errcode='22023';
end $$;
revoke all on function pro_invoice_active_guard(),pro_invoice_management_read(uuid,uuid),pro_invoice_management_page(uuid,text,boolean,jsonb),pro_invoice_management_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_active_guard(),pro_invoice_management_read(uuid,uuid),pro_invoice_management_page(uuid,text,boolean,jsonb),pro_invoice_management_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
