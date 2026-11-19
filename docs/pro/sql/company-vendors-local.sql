-- LOCAL PRO ONLY. Company > Vendors directory (Houzz-style "Vendors" under Company).
-- Reuses the existing supplier table of Expenses (pro_expense_suppliers), which Purchase
-- orders already reference, and adds a 1:1 profile with kind (supplier/subcontractor),
-- trade, contact person and notes. Totals are read-only aggregates of existing purchase
-- orders and expenses. Nothing is sent, paid or published. Reapplicable.
begin;
create table if not exists public.pro_company_vendor_profiles(
 owner_id uuid not null,supplier_id uuid not null,
 kind text not null default 'supplier' check(kind in('supplier','subcontractor')),
 trade text check(trade is null or length(btrim(trade)) between 1 and 80),
 contact_name text check(contact_name is null or length(btrim(contact_name)) between 1 and 160),
 notes text check(notes is null or length(btrim(notes)) between 1 and 2000),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,supplier_id),
 foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id) on delete cascade
);
-- Round 4B (2026-11-13): optional postal/physical address of the vendor (directory only).
alter table public.pro_company_vendor_profiles add column if not exists address text;
alter table public.pro_company_vendor_profiles drop constraint if exists pro_company_vendor_profiles_address_check;
alter table public.pro_company_vendor_profiles add constraint pro_company_vendor_profiles_address_check check(address is null or length(btrim(address)) between 1 and 300);
create table if not exists public.pro_company_vendor_history(
 owner_id uuid not null,supplier_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','archive','restore')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),
 foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id) on delete cascade
);
create index if not exists pro_company_vendor_history_page on public.pro_company_vendor_history(owner_id,supplier_id,at desc);
create table if not exists public.pro_company_vendor_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(owner_id,action_id)
);
create index if not exists pro_expense_suppliers_name_page on public.pro_expense_suppliers(user_id,archived,lower(name),id);

-- Full vendor view: directory fields plus committed/paid totals from existing modules (CRC cents).
create or replace function public.pro_company_vendor_json(p_owner uuid,p_supplier uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',s.id,'name',s.name,'kind',coalesce(p.kind,'supplier'),'trade',p.trade,'contactName',p.contact_name,
  'address',p.address,'email',s.email,'phone',s.phone,'identification',s.identification,'notes',p.notes,'archived',s.archived,
  'revision',coalesce(p.revision,0),'updatedAt',p.updated_at,
  'purchaseOrders',jsonb_build_object('count',po.n,'committedCents',po.committed,'paidCents',pp.paid),
  'expenses',jsonb_build_object('count',ex.n,'amountCents',ex.amount,'paidCents',ep.paid))
 from public.pro_expense_suppliers s
 left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id
 cross join lateral(select count(distinct o.id)::integer n,coalesce(sum(l.subtotal_cents+l.tax_cents),0)::bigint committed
  from public.pro_purchase_orders o left join public.pro_purchase_order_lines l on l.owner_id=o.owner_id and l.order_id=o.id
  where o.owner_id=s.user_id and o.supplier_id=s.id and o.status<>'cancelled') po
 cross join lateral(select coalesce(sum(case when y.kind='payment' then y.amount_cents else -y.amount_cents end),0)::bigint paid
  from public.pro_purchase_orders o join public.pro_purchase_order_payments y on y.owner_id=o.owner_id and y.order_id=o.id
  where o.owner_id=s.user_id and o.supplier_id=s.id) pp
 cross join lateral(select count(*)::integer n,coalesce(sum(e.amount_cents),0)::bigint amount
  from public.pro_internal_expenses e where e.user_id=s.user_id and e.supplier_id=s.id) ex
 cross join lateral(select coalesce(sum(case when y.kind='payment' then y.amount_cents else -y.amount_cents end),0)::bigint paid
  from public.pro_internal_expenses e join public.pro_expense_payments y on y.user_id=e.user_id and y.expense_id=e.id
  where e.user_id=s.user_id and e.supplier_id=s.id) ep
 where s.user_id=p_owner and s.id=p_supplier;
$$;

-- Directory-only snapshot for the immutable history (no totals).
create or replace function public.pro_company_vendor_snapshot(p_owner uuid,p_supplier uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('name',s.name,'kind',coalesce(p.kind,'supplier'),'trade',p.trade,'contactName',p.contact_name,'address',p.address,'email',s.email,
  'phone',s.phone,'identification',s.identification,'notes',p.notes,'archived',s.archived,'revision',coalesce(p.revision,0))
 from public.pro_expense_suppliers s left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id
 where s.user_id=p_owner and s.id=p_supplier;
$$;

create or replace function public.pro_company_vendors_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;st text;knd text;q text;after_id uuid;after_name text;rows jsonb;next_id uuid;sid uuid;hist jsonb;receipt public.pro_company_vendor_actions;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid query' using errcode='22023';end if;
 v:=p_query->>'view';
 if v='list' then
  st:=coalesce(p_query->>'status','active');knd:=coalesce(p_query->>'kind','all');q:=lower(btrim(coalesce(p_query->>'q','')));
  if st not in('active','archived') or knd not in('all','supplier','subcontractor') or length(q)>100 then raise exception 'Invalid query' using errcode='22023';end if;
  if nullif(p_query->>'after','') is not null then
   after_id:=(p_query->>'after')::uuid;
   select lower(name) into after_name from public.pro_expense_suppliers where user_id=p_actor and id=after_id;
   if not found then raise exception 'Invalid cursor' using errcode='22023';end if;
  end if;
  select coalesce(jsonb_agg(public.pro_company_vendor_json(p_actor,x.id) order by x.k,x.id),'[]'::jsonb),
   (array_agg(x.id order by x.k desc,x.id desc))[1]
   into rows,next_id from(
   select s.id,lower(s.name) k from public.pro_expense_suppliers s
   left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id
   where s.user_id=p_actor and s.archived=(st='archived') and (knd='all' or coalesce(p.kind,'supplier')=knd)
    and (q='' or strpos(lower(concat_ws(' ',s.name,s.identification,s.email,s.phone,p.contact_name,p.trade,p.address)),q)>0)
    and (after_id is null or (lower(s.name),s.id)>(after_name,after_id))
   order by lower(s.name),s.id limit 20) x;
  -- One extra probe decides whether a next page exists without returning it.
  if next_id is not null and not exists(select 1 from public.pro_expense_suppliers s
   left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id
   where s.user_id=p_actor and s.archived=(st='archived') and (knd='all' or coalesce(p.kind,'supplier')=knd)
    and (q='' or strpos(lower(concat_ws(' ',s.name,s.identification,s.email,s.phone,p.contact_name,p.trade,p.address)),q)>0)
    and (lower(s.name),s.id)>((select lower(name) from public.pro_expense_suppliers where user_id=p_actor and id=next_id),next_id)) then next_id:=null;end if;
  return jsonb_build_object('items',rows,'nextCursor',next_id,'counts',(select jsonb_build_object('active',count(*) filter(where not archived),'archived',count(*) filter(where archived)) from public.pro_expense_suppliers where user_id=p_actor));
 elsif v='detail' then
  sid:=(p_query->>'id')::uuid;
  if not exists(select 1 from public.pro_expense_suppliers where user_id=p_actor and id=sid) then return null;end if;
  select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc),'[]'::jsonb) into hist
   from(select * from public.pro_company_vendor_history where owner_id=p_actor and supplier_id=sid order by at desc limit 20) h;
  return jsonb_build_object('vendor',public.pro_company_vendor_json(p_actor,sid),'history',hist);
 elsif v='action' then
  select * into receipt from public.pro_company_vendor_actions where owner_id=p_actor and action_id=(p_query->>'actionId')::uuid;
  return jsonb_build_object('receipt',case when found then jsonb_build_object('input',receipt.input,'result',receipt.result) end);
 end if;
 raise exception 'Invalid query' using errcode='22023';
end $$;

create or replace function public.pro_company_vendors_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;sid uuid;rev integer;keys text[];expected text[];receipt public.pro_company_vendor_actions;
 supplier public.pro_expense_suppliers;profile public.pro_company_vendor_profiles;before_json jsonb;after_json jsonb;result jsonb;
 v_name text;v_kind text;v_trade text;v_contact text;v_email text;v_phone text;v_ident text;v_notes text;v_address text;has_address boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid vendor' using errcode='22023';end if;
 act:=p_input->>'action';
 -- 'address' is optional (Round 4B): an older client without it keeps the saved address.
 has_address:=p_input ? 'address';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input-'address') key;
 expected:=case act
  when 'create' then array['action','actionId','contactName','email','id','identification','kind','name','notes','phone','trade']
  when 'update' then array['action','actionId','contactName','email','id','identification','kind','name','notes','phone','revision','trade']
  when 'archive' then array['action','actionId','id','revision']
  when 'restore' then array['action','actionId','id','revision'] end;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or (act<>'create' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false))) then
  raise exception 'Invalid vendor fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;sid:=(p_input->>'id')::uuid;rev:=case when act='create' then 0 else (p_input->>'revision')::integer end;
 if act in('create','update') then
  if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string'
   or jsonb_typeof(p_input->'email') is distinct from 'string' or jsonb_typeof(p_input->'phone') is distinct from 'string' or jsonb_typeof(p_input->'identification') is distinct from 'string'
   or jsonb_typeof(p_input->'trade') not in('string','null') or jsonb_typeof(p_input->'contactName') not in('string','null') or jsonb_typeof(p_input->'notes') not in('string','null')
   or has_address and jsonb_typeof(p_input->'address') not in('string','null') then
   raise exception 'Invalid vendor fields' using errcode='22023';end if;
  v_name:=btrim(p_input->>'name');v_kind:=p_input->>'kind';v_email:=btrim(p_input->>'email');v_phone:=btrim(p_input->>'phone');v_ident:=btrim(p_input->>'identification');
  v_trade:=nullif(btrim(coalesce(p_input->>'trade','')),'');v_contact:=nullif(btrim(coalesce(p_input->>'contactName','')),'');v_notes:=nullif(btrim(coalesce(p_input->>'notes','')),'');v_address:=nullif(btrim(coalesce(p_input->>'address','')),'');
  if length(v_name) not between 1 and 160 or v_kind not in('supplier','subcontractor') or length(v_email)>254 or length(v_phone)>40 or length(v_ident)>40
   or length(v_trade)>80 or length(v_contact)>160 or length(v_notes)>2000 or length(v_address)>300 or (v_email<>'' and v_email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$') then
   raise exception 'Invalid vendor values' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-vendor-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_company_vendor_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 -- Same serialization point and revision counter as Expenses, so its open forms see the change.
 insert into public.pro_expense_state(user_id) values(p_actor) on conflict do nothing;
 perform 1 from public.pro_expense_state where user_id=p_actor for update;
 perform set_config('pro.company_vendor_write','1',true);
 -- No key change: purchase orders and expenses keep taking their FK key-share lock without waiting.
 select * into supplier from public.pro_expense_suppliers where user_id=p_actor and id=sid for no key update;
 if act='create' then
  if found then raise exception 'Vendor id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_expense_suppliers where user_id=p_actor)>=2000 then raise exception 'Vendor limit' using errcode='23514';end if;
  insert into public.pro_expense_suppliers(user_id,id,name,identification,email,phone,archived) values(p_actor,sid,v_name,v_ident,v_email,v_phone,false);
  insert into public.pro_company_vendor_profiles(owner_id,supplier_id,kind,trade,contact_name,notes,address) values(p_actor,sid,v_kind,v_trade,v_contact,v_notes,v_address);
  before_json:=null;
 else
  if not found then raise exception 'Vendor not found' using errcode='P0002';end if;
  select * into profile from public.pro_company_vendor_profiles where owner_id=p_actor and supplier_id=sid for update;
  if coalesce(profile.revision,0)<>rev then raise exception 'Vendor changed' using errcode='40001';end if;
  before_json:=public.pro_company_vendor_snapshot(p_actor,sid);
  if act='update' then
   if not has_address then v_address:=profile.address;end if;
   if supplier.name=v_name and supplier.email=v_email and supplier.phone=v_phone and supplier.identification=v_ident
    and coalesce(profile.kind,'supplier')=v_kind and profile.trade is not distinct from v_trade and profile.contact_name is not distinct from v_contact and profile.notes is not distinct from v_notes and profile.address is not distinct from v_address then
    raise exception 'No vendor changes' using errcode='22023';end if;
   update public.pro_expense_suppliers set name=v_name,email=v_email,phone=v_phone,identification=v_ident where user_id=p_actor and id=sid;
  else
   if supplier.archived=(act='archive') then raise exception 'Vendor already in that state' using errcode='22023';end if;
   update public.pro_expense_suppliers set archived=(act='archive') where user_id=p_actor and id=sid;
  end if;
  if profile.supplier_id is null then
   insert into public.pro_company_vendor_profiles(owner_id,supplier_id,kind,trade,contact_name,notes,address)
    values(p_actor,sid,coalesce(v_kind,'supplier'),v_trade,v_contact,v_notes,v_address);
  else
   update public.pro_company_vendor_profiles set kind=coalesce(v_kind,kind),trade=case when act='update' then v_trade else trade end,
    contact_name=case when act='update' then v_contact else contact_name end,notes=case when act='update' then v_notes else notes end,address=case when act='update' then v_address else address end,
    revision=revision+1,updated_at=now() where owner_id=p_actor and supplier_id=sid;
  end if;
 end if;
 perform set_config('pro.company_vendor_write','',true);
 update public.pro_expense_state set revision=revision+1 where user_id=p_actor;
 after_json:=public.pro_company_vendor_snapshot(p_actor,sid);
 result:=jsonb_build_object('vendor',public.pro_company_vendor_json(p_actor,sid));
 insert into public.pro_company_vendor_history(owner_id,supplier_id,action_id,action,before_value,after_value) values(p_actor,sid,aid,act,before_json,after_json);
 insert into public.pro_company_vendor_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- When Expenses edits a supplier directly, the directory revision moves too, so a stale
-- directory form receives 409 instead of overwriting that change.
create or replace function public.pro_company_vendor_supplier_touch() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(current_setting('pro.company_vendor_write',true),'')='1' then return new;end if;
 if (old.name,old.identification,old.email,old.phone,old.archived) is not distinct from (new.name,new.identification,new.email,new.phone,new.archived) then return new;end if;
 insert into public.pro_company_vendor_profiles(owner_id,supplier_id) values(new.user_id,new.id)
  on conflict(owner_id,supplier_id) do update set revision=public.pro_company_vendor_profiles.revision+1,updated_at=now();
 return new;
end $$;
drop trigger if exists pro_company_vendor_supplier_touch on public.pro_expense_suppliers;
create trigger pro_company_vendor_supplier_touch after update on public.pro_expense_suppliers for each row execute function public.pro_company_vendor_supplier_touch();

create or replace function public.pro_company_vendor_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Vendor history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_company_vendor_history_immutable on public.pro_company_vendor_history;
create trigger pro_company_vendor_history_immutable before update on public.pro_company_vendor_history for each row execute function public.pro_company_vendor_immutable();
drop trigger if exists pro_company_vendor_action_immutable on public.pro_company_vendor_actions;
create trigger pro_company_vendor_action_immutable before update on public.pro_company_vendor_actions for each row execute function public.pro_company_vendor_immutable();

alter table public.pro_company_vendor_profiles enable row level security;
alter table public.pro_company_vendor_history enable row level security;
alter table public.pro_company_vendor_actions enable row level security;
revoke all on public.pro_company_vendor_profiles,public.pro_company_vendor_history,public.pro_company_vendor_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_company_vendor_profiles,public.pro_company_vendor_history,public.pro_company_vendor_actions to service_role;
revoke all on function public.pro_company_vendor_json(uuid,uuid),public.pro_company_vendor_snapshot(uuid,uuid),public.pro_company_vendors_read(uuid,jsonb),public.pro_company_vendors_mutate(uuid,jsonb),public.pro_company_vendor_supplier_touch(),public.pro_company_vendor_immutable() from public,anon,authenticated;
grant execute on function public.pro_company_vendor_json(uuid,uuid),public.pro_company_vendor_snapshot(uuid,uuid),public.pro_company_vendors_read(uuid,jsonb),public.pro_company_vendors_mutate(uuid,jsonb) to service_role;
commit;
