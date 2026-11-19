-- LOCAL ONLY. Additive draft storage. No fiscal identifiers, emission, payments or stock writes.
begin;
create table if not exists public.pro_invoice_drafts(
 user_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 client_id text not null,
 source_kind text not null check(source_kind in ('work','quote','legacy_quote')),
 source_id text not null,
 work_id text,
 quote_origin_key text,
 title text not null check(length(title) between 1 and 160),
 notes text not null default '' check(length(notes)<=2000),
 receiver_name text not null check(length(receiver_name) between 1 and 160),
 receiver_identification text not null,receiver_email text not null,receiver_phone text not null,receiver_address text not null,
 total_cents bigint not null check(total_cents between 0 and 10000000000),
 tax_cents bigint,
 agreed_cents bigint,paid_cents bigint,balance_cents bigint,
 material_count integer not null,material_cost numeric not null,
 basis text not null check(basis in ('agreement','quote','manual')),
 source_fingerprint text not null,
 revision integer not null default 1 check(revision>0),
 status text not null default 'draft' check(status='draft'),
 currency text not null default 'CRC' check(currency='CRC'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(user_id,id),unique(user_id,source_kind,source_id),
 foreign key(user_id,client_id) references public.pro_clients(user_id,id),
 foreign key(user_id,work_id) references public.pro_work(user_id,id)
);
create unique index if not exists pro_invoice_draft_quote_origin on public.pro_invoice_drafts(user_id,quote_origin_key) where quote_origin_key is not null;
create index if not exists pro_invoice_draft_client on public.pro_invoice_drafts(user_id,client_id,created_at desc,id);
create table if not exists public.pro_invoice_lines(
 user_id uuid not null,draft_id uuid not null,line_number integer not null check(line_number between 1 and 100),
 description text not null,quantity numeric not null check(quantity>0),unit_amount numeric not null check(unit_amount>=0),tax_rate numeric,
 primary key(user_id,draft_id,line_number),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_materials(
 user_id uuid not null,draft_id uuid not null,entry_id uuid not null,product_id text not null,
 name text not null,quantity numeric not null check(quantity>0),unit_cost numeric not null,
 primary key(user_id,draft_id,entry_id),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade
);
alter table pro_invoice_drafts enable row level security;
alter table pro_invoice_lines enable row level security;
alter table pro_invoice_materials enable row level security;
drop policy if exists pro_invoice_drafts_owner on pro_invoice_drafts;
drop policy if exists pro_invoice_lines_owner on pro_invoice_lines;
drop policy if exists pro_invoice_materials_owner on pro_invoice_materials;
create policy pro_invoice_drafts_owner on pro_invoice_drafts for select to authenticated using(user_id=auth.uid());
create policy pro_invoice_lines_owner on pro_invoice_lines for select to authenticated using(user_id=auth.uid());
create policy pro_invoice_materials_owner on pro_invoice_materials for select to authenticated using(user_id=auth.uid());
revoke all on pro_invoice_drafts,pro_invoice_lines,pro_invoice_materials from public,anon,authenticated;
grant select on pro_invoice_drafts,pro_invoice_lines,pro_invoice_materials to authenticated;
grant all on pro_invoice_drafts,pro_invoice_lines,pro_invoice_materials to service_role;

create or replace function public.pro_invoice_source(p_user uuid,p_kind text,p_id text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w pro_work;c pro_clients;q jsonb;v jsonb;account jsonb;receiver jsonb;lines jsonb:='[]';
 client_id text;v_quote_id text;quote_kind text;v_work_id text;related integer:=0;related_id text;
 source_title text;total bigint;tax bigint;quote_total bigint;materials integer:=0;material_cost numeric:=0;material_digest text:='';quote_origin text;basis text;existing uuid;
begin
 if p_kind='work' then
  select * into w from pro_work where user_id=p_user and id=p_id;
  if w.id is null or w.cancelled then return null;end if;
  client_id:=w."clientId";v_work_id:=w.id;source_title:=w.service;
  if w."externalQuoteId" is not null then v_quote_id:=w."externalQuoteId";quote_kind:='quote';
  elsif w."quoteId" is not null then v_quote_id:=w."quoteId";quote_kind:='legacy_quote';end if;
 elsif p_kind in ('quote','legacy_quote') then v_quote_id:=p_id;quote_kind:=p_kind;
 else return null;end if;
 if quote_kind='quote' then
  select to_jsonb(r) into q from quotes r join professionals p on p.id=r.professional_id and p.profile_id=p_user where r.id::text=v_quote_id and r.deleted_at is null and r.status in ('draft','sent','accepted');
  if q is not null then
   select "clientId" into related_id from pro_quote_links where user_id=p_user and "quoteId"=v_quote_id;
   if p_kind='work' and related_id is distinct from client_id then q:=null;
   else
    client_id:=coalesce(client_id,related_id);
    select coalesce(jsonb_agg(jsonb_build_object('description',r->>'description','quantity',(r->>'quantity')::numeric,'unitAmount',(r->>'unit_price')::numeric,'taxRate',null) order by n),'[]') into lines from jsonb_array_elements(q->'items') with ordinality e(r,n);
    quote_total:=round((q->>'total')::numeric*100);tax:=round((q->>'tax_amount')::numeric*100);
   end if;
  end if;
 elsif quote_kind='legacy_quote' then
  q:=pro_legacy_quote_record(p_user,v_quote_id);
  if q is not null and (q->>'status'='declined' or p_kind='work' and q->>'clientId'<>client_id) then q:=null;end if;
  if q is not null then
   client_id:=coalesce(client_id,q->>'clientId');
   select coalesce(jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,'unitAmount',l.price,'taxRate',l.tax) order by l.line_number),'[]'),
    coalesce(sum(net+floor(net*l.tax::double precision/100+0.5)),0),coalesce(sum(floor(net*l.tax::double precision/100+0.5)),0)
    into lines,quote_total,tax from pro_legacy_quote_lines l cross join lateral (select floor(l.quantity::double precision*l.price::double precision*100+0.5) as net) cents where l.user_id=p_user and l.quote_id=v_quote_id;
  end if;
 end if;
 if p_kind<>'work' then
  if q is null then return null;end if;
  select count(*),min(id) into related,related_id from pro_work where user_id=p_user and not cancelled and (case when quote_kind='quote' then "externalQuoteId"=v_quote_id else "quoteId"=v_quote_id end);
  if related=1 and client_id is not null then return pro_invoice_source(p_user,'work',related_id);end if;
  source_title:=coalesce(nullif(q->>'title',''),'Cotización');
 end if;
 if client_id is not null then
  select * into c from pro_clients where user_id=p_user and id=client_id;
  if c.id is null or c.archived then return null;end if;
  receiver:=jsonb_build_object('name',c.name,'identification',coalesce(c.identification,''),'email',c.email,'phone',c.phone,'address',coalesce(c.address,''));
 else
  receiver:=jsonb_build_object('name',coalesce(q->>'client_name',''),'identification',coalesce(q->>'client_cedula',''),'email',coalesce(q->>'client_email',''),'phone',coalesce(q->>'client_phone',''),'address','');
 end if;
 if v_work_id is not null then
  if q is not null then
   select count(*) into related from pro_work where user_id=p_user and not cancelled and (case when quote_kind='quote' then "externalQuoteId"=v_quote_id else "quoteId"=v_quote_id end);
  end if;
  -- A shared quote is not a per-work allocation. Require an individual agreement
  -- or an explicit manual amount; never duplicate the whole quote automatically.
  if related>1 then quote_total:=null;lines:='[]';tax:=null;end if;
  account:=pro_work_account(p_user,v_work_id);
  if account->>'agreedCents' is not null then
   total:=(account->>'agreedCents')::bigint;basis:='agreement';
   if quote_total is distinct from total then
    lines:=jsonb_build_array(jsonb_build_object('description',source_title,'quantity',1,'unitAmount',total::numeric/100,'taxRate',null));tax:=null;
   end if;
  elsif quote_total is not null then total:=quote_total;basis:='quote';
  else basis:='manual';end if;
  select count(*),coalesce(sum(round(quantity*unit_cost,2)),0),coalesce(md5(string_agg(id::text||':'||quantity::text||':'||unit_cost::text||':'||label,'|' order by id)),'') into materials,material_cost,material_digest
   from pro_client_entries e where e.user_id=p_user and e.work_id=v_work_id and e.kind='material' and not exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id);
  if q is not null then
   select count(*) into related from pro_work where user_id=p_user and not cancelled and (case when quote_kind='quote' then "externalQuoteId"=v_quote_id else "quoteId"=v_quote_id end);
  end if;
 else total:=quote_total;basis:='quote';end if;
 if q is not null and (v_work_id is null or related=1) then quote_origin:=quote_kind||':'||v_quote_id;end if;
 v:=jsonb_build_object('kind',p_kind,'sourceId',p_id,'workId',v_work_id,'quoteId',case when q is not null then v_quote_id else null end,'quoteKind',case when q is not null then quote_kind else null end,'quoteOriginKey',quote_origin,'clientId',client_id,'receiver',receiver,'title',source_title,'lines',lines,'totalCents',total,'taxCents',tax,'agreedCents',account->'agreedCents','paidCents',account->'paidCents','balanceCents',case when account->>'agreedCents' is not null then account->'balanceCents' else null end,'materialCount',materials,'materialCost',material_cost,'materialDigest',material_digest,'basis',basis,'multipleWorks',v_work_id is null and related>1,'sharedQuote',related>1);
 select id into existing from pro_invoice_drafts where user_id=p_user and (source_kind=p_kind and source_id=p_id or quote_origin is not null and quote_origin_key=quote_origin) order by created_at,id limit 1;
 return v||jsonb_build_object('fingerprint',md5(v::text),'existingId',existing);
end $$;

create or replace function public.pro_invoice_copy_details(p_user uuid,p_draft uuid,p_source jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 delete from pro_invoice_lines where user_id=p_user and draft_id=p_draft;
 insert into pro_invoice_lines(user_id,draft_id,line_number,description,quantity,unit_amount,tax_rate)
 select p_user,p_draft,n,r->>'description',(r->>'quantity')::numeric,(r->>'unitAmount')::numeric,(r->>'taxRate')::numeric from jsonb_array_elements(p_source->'lines') with ordinality e(r,n);
 delete from pro_invoice_materials where user_id=p_user and draft_id=p_draft;
 insert into pro_invoice_materials(user_id,draft_id,entry_id,product_id,name,quantity,unit_cost)
 select p_user,p_draft,e.id,e.product_id,e.label,e.quantity,e.unit_cost from pro_client_entries e where e.user_id=p_user and e.work_id=p_source->>'workId' and e.kind='material' and not exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id);
end $$;
create or replace function public.pro_invoice_draft_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;s jsonb;c pro_clients;receiver jsonb:=p_input->'receiver'; draft_id uuid;v_total bigint;kind text;source_id text;client_id text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create' then kind:=p_input->>'kind';source_id:=p_input->>'sourceId';
 elsif p_input->>'action' in ('update','refresh') then
  select * into d from pro_invoice_drafts where user_id=p_user and id=(p_input->>'id')::uuid for update;
  if d.id is null then raise exception 'Missing draft' using errcode='22023';end if;
  if d.revision<>(p_input->>'revision')::integer then raise exception 'Draft revision changed' using errcode='40001';end if;
  kind:=d.source_kind;source_id:=d.source_id;
 else raise exception 'Only local draft actions are allowed' using errcode='22023';end if;
 if p_input->>'action'='update' then
  update pro_invoice_drafts set title=p_input->>'title',notes=p_input->>'notes',receiver_name=receiver->>'name',receiver_identification=receiver->>'identification',receiver_email=receiver->>'email',receiver_phone=receiver->>'phone',receiver_address=receiver->>'address',revision=revision+1,updated_at=now() where user_id=p_user and id=d.id;
  return d.id;
 end if;
 -- Standard quotes use their own writer: lock that row before taking the source snapshot.
 if kind='quote' then perform 1 from quotes where id::text=source_id for share;
 elsif kind='work' then perform 1 from quotes where id::text=(select "externalQuoteId" from pro_work where user_id=p_user and id=source_id) for share;end if;
 s:=pro_invoice_source(p_user,kind,source_id);
 if s is null or (s->>'multipleWorks')::boolean then raise exception 'Source unavailable or ambiguous' using errcode='22023';end if;
 if p_input->>'action'='create' and s->>'existingId' is not null then return (s->>'existingId')::uuid;end if;
 if s->>'fingerprint' is distinct from p_input->>'fingerprint' then raise exception 'Source changed' using errcode='40001';end if;
 if p_input->>'action'='create' then
  client_id:=p_input->>'clientId';
  if s->>'clientId' is not null and s->>'clientId'<>client_id then raise exception 'Client mismatch' using errcode='22023';end if;
  select * into c from pro_clients where user_id=p_user and id=client_id and not archived;
  if c.id is null then raise exception 'Invalid client' using errcode='22023';end if;
  draft_id:=gen_random_uuid();
 else
  client_id:=d.client_id;draft_id:=d.id;
  if s->>'clientId' is not null and s->>'clientId'<>d.client_id then raise exception 'Client changed; preserve original draft' using errcode='22023';end if;
 end if;
 v_total:=(s->>'totalCents')::bigint;
 if v_total is null then
  if p_input->>'action'='refresh' and d.basis<>'manual' then raise exception 'Define an individual work agreement before refreshing' using errcode='22023';end if;
  v_total:=case when p_input->>'action'='create' then (p_input->>'manualTotalCents')::bigint else d.total_cents end;
  if v_total is null or v_total<0 or v_total>10000000000 then raise exception 'Define draft total' using errcode='22023';end if;
  s:=jsonb_set(s,'{lines}',jsonb_build_array(jsonb_build_object('description',s->>'title','quantity',1,'unitAmount',v_total::numeric/100,'taxRate',null)));
 end if;
 if p_input->>'action'='create' then
  insert into pro_invoice_drafts(user_id,id,client_id,source_kind,source_id,work_id,quote_origin_key,title,notes,receiver_name,receiver_identification,receiver_email,receiver_phone,receiver_address,total_cents,tax_cents,agreed_cents,paid_cents,balance_cents,material_count,material_cost,basis,source_fingerprint)
  values(p_user,draft_id,client_id,s->>'kind',s->>'sourceId',s->>'workId',s->>'quoteOriginKey',p_input->>'title',p_input->>'notes',receiver->>'name',receiver->>'identification',receiver->>'email',receiver->>'phone',receiver->>'address',v_total,(s->>'taxCents')::bigint,(s->>'agreedCents')::bigint,(s->>'paidCents')::bigint,(s->>'balanceCents')::bigint,(s->>'materialCount')::integer,(s->>'materialCost')::numeric,s->>'basis',s->>'fingerprint');
 else
  update pro_invoice_drafts set source_kind=s->>'kind',source_id=s->>'sourceId',work_id=s->>'workId',quote_origin_key=s->>'quoteOriginKey',total_cents=v_total,tax_cents=(s->>'taxCents')::bigint,agreed_cents=(s->>'agreedCents')::bigint,paid_cents=(s->>'paidCents')::bigint,balance_cents=(s->>'balanceCents')::bigint,material_count=(s->>'materialCount')::integer,material_cost=(s->>'materialCost')::numeric,basis=s->>'basis',source_fingerprint=s->>'fingerprint',revision=revision+1,updated_at=now() where user_id=p_user and id=d.id;
 end if;
 perform pro_invoice_copy_details(p_user,draft_id,s);
 return draft_id;
end $$;
create or replace function public.pro_invoice_draft_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with draft as (select d.*,pro_invoice_source(p_user,d.source_kind,d.source_id) as current_source from pro_invoice_drafts d where user_id=p_user and id=p_id),
 materials as (select * from pro_invoice_materials where user_id=p_user and draft_id=p_id and (p_after is null or entry_id>(p_after->>'entryId')::uuid) order by entry_id limit 21)
 select jsonb_build_object('id',id,'clientId',client_id,'kind',source_kind,'sourceId',source_id,'title',title,'notes',notes,'receiver',jsonb_build_object('name',receiver_name,'identification',receiver_identification,'email',receiver_email,'phone',receiver_phone,'address',receiver_address),'revision',revision,'totalCents',total_cents,'taxCents',tax_cents,'agreedCents',agreed_cents,'paidCents',paid_cents,'balanceCents',balance_cents,'materialCount',material_count,'materialCost',material_cost,'basis',basis,'createdAt',created_at,'updatedAt',updated_at,
 'lines',coalesce((select jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unitAmount',unit_amount,'taxRate',tax_rate) order by line_number) from pro_invoice_lines where user_id=p_user and draft_id=p_id),'[]'),
 'materials',coalesce((select jsonb_agg(jsonb_build_object('entryId',entry_id,'productId',product_id,'name',name,'quantity',quantity,'unitCost',unit_cost) order by entry_id) from (select * from materials order by entry_id limit 20) m),'[]'),
 'nextCursor',case when (select count(*) from materials)>20 then (select jsonb_build_object('entryId',entry_id) from materials order by entry_id offset 19 limit 1) else null end,
 'sourceNeedsAmount',current_source is not null and current_source->>'totalCents' is null and basis<>'manual','sourceAvailable',current_source is not null,'sourceChanged',current_source is null or current_source->>'fingerprint'<>source_fingerprint,'currentFingerprint',current_source->>'fingerprint') from draft;
$$;
revoke all on function pro_invoice_source(uuid,text,text),pro_invoice_copy_details(uuid,uuid,jsonb),pro_invoice_draft_save(uuid,jsonb),pro_invoice_draft_read(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_source(uuid,text,text),pro_invoice_copy_details(uuid,uuid,jsonb),pro_invoice_draft_save(uuid,jsonb),pro_invoice_draft_read(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
