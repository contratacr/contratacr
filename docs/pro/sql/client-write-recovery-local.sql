-- LOCAL PRO ONLY. Additive, opt-in receipts for one customer create/edit form.
-- No backfill or changes to the existing catalog/import/stock mutation contract.
begin;
create table if not exists public.pro_client_write_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input jsonb not null,result jsonb not null,
 primary key(actor_id,action_id)
);
alter table public.pro_client_write_actions enable row level security;
revoke all on public.pro_client_write_actions from public,anon,authenticated;
grant all on public.pro_client_write_actions to service_role;
create or replace function public.pro_client_write_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior pro_client_write_actions;aid uuid;r jsonb;field text;v integer;result jsonb;mode text;
begin
 if p_actor is null then raise exception 'Missing actor' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
 or (p_input-array['kind','revision','rows','movements','importing','clientActionId','clientWriteMode'])<>'{}'::jsonb
 or not(p_input ?& array['kind','revision','rows','movements','importing','clientActionId','clientWriteMode'])
 or p_input->'kind' is distinct from '"clients"'::jsonb or p_input->'importing' is distinct from 'false'::jsonb
 or p_input->'movements' is distinct from '[]'::jsonb
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,10}$'
 or jsonb_typeof(p_input->'rows') is distinct from 'array' then raise exception 'Invalid customer write' using errcode='22023';end if;
 if (p_input->>'revision')::bigint>2147483646 or jsonb_array_length(p_input->'rows')<>1
 or jsonb_typeof(p_input->'clientActionId') is distinct from 'string'
 or jsonb_typeof(p_input->'clientWriteMode') is distinct from 'string'
 or p_input->>'clientWriteMode' not in ('create','edit') then raise exception 'Invalid customer write' using errcode='22023';end if;
 aid:=(p_input->>'clientActionId')::uuid;
 if aid is null then raise exception 'Missing action' using errcode='22023';end if;
 r:=p_input->'rows'->0;mode:=p_input->>'clientWriteMode';
 if jsonb_typeof(r) is distinct from 'object' or (r-array['id','name','email','phone','notes','archived','identification','tradeName','group','address'])<>'{}'::jsonb
 or not(r ?& array['id','name','email','phone','notes','archived']) or jsonb_typeof(r->'archived') is distinct from 'boolean' then raise exception 'Invalid customer row' using errcode='22023';end if;
 foreach field in array array['id','name','email','phone','notes','identification','tradeName','group','address'] loop
  if (field=any(array['id','name','email','phone','notes']) or r ? field) and
  (jsonb_typeof(r->field) is distinct from 'string' or length(r->>field)>(case field when 'phone' then 30 when 'notes' then 2000 when 'identification' then 12 when 'group' then 80 when 'address' then 500 when 'email' then 16000 else 160 end)) then raise exception 'Invalid customer field' using errcode='22023';end if;
 end loop;
 if length(btrim(r->>'id'))=0 or btrim(r->>'id')<>r->>'id' or length(btrim(r->>'name'))=0 or btrim(r->>'name')<>r->>'name'
 or r ? 'identification' and (r->>'identification')!~'^[0-9]{0,12}$'
 or mode='create' and ((r->>'id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or r->'archived'<>'false'::jsonb)
 then raise exception 'Invalid customer identity' using errcode='22023';end if;
 -- Same owner advisory and row-CAS order as pro_mutate_catalog. A replay is
 -- checked BEFORE mutable row existence/revision so a saved edit is never redone.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into prior from pro_client_write_actions where actor_id=p_actor and action_id=aid;
 if found then
  if prior.input is distinct from p_input then raise exception 'Customer action changed' using errcode='40001';end if;
  return prior.result;
 end if;
 if mode='create' and exists(select 1 from pro_clients where user_id=p_actor and id=r->>'id')
 or mode='edit' and not exists(select 1 from pro_clients where user_id=p_actor and id=r->>'id') then raise exception 'Customer changed' using errcode='40001';end if;
 v:=pro_mutate_catalog(p_actor,'clients',p_input->'rows',(p_input->>'revision')::integer,'[]'::jsonb,false);
 result:=jsonb_build_object('id',r->>'id','revision',v);
 insert into pro_client_write_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
revoke all on function public.pro_client_write_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_client_write_record(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
