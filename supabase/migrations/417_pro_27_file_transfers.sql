-- ContrataCR Pro, rows 28 and 31: receipts of the two file adapters.
--  * Import from an external drive (row 31): one receipt per imported file, tied to the batch (action id) and the external id,
--    so a retry of the same batch never imports the same file twice and the owner can see what came from where.
--  * Office to PDF conversion (row 28): one receipt per conversion, with the mode that produced the PDF
--    ('simulated' = placeholder PDF, no real conversion; 'service' = an external conversion service answered).
--  * Append only (no update, no delete except the cascade of the account removal). Never holds bytes: name, size and the SHA-256
--    prefix of the stored result. Secrets of the adapters live in environment variables, never here.
-- Writers are service_role only; the routes decide owner-only. PRO_ENABLED stays false in production.
-- Reapplicable: create if not exists / or replace.
begin;

create table if not exists public.pro_file_transfers(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,
 item_key text not null check(length(item_key) between 1 and 200 and item_key !~ '[[:cntrl:]]'),
 kind text not null check(kind in('import','convert')),
 provider text not null check(provider in('drive','office')),
 mode text not null check(mode in('sandbox','live','simulated','service')),
 scope text not null check(scope in('company','work')),
 work_id text,
 source_file_id uuid,
 target_file_id uuid,
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]]'),
 size_bytes integer check(size_bytes is null or size_bytes>=0),
 sha256 text check(sha256 is null or sha256~'^[a-f0-9]{12,64}$'),
 status text not null check(status in('done','failed')),
 reason text check(reason is null or reason in('type','size','empty','macro','not_found','not_configured','unavailable','invalid')),
 at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id,item_key),
 check((kind='import' and provider='drive' and mode in('sandbox','live')) or (kind='convert' and provider='office' and mode in('simulated','service'))),
 check((scope='work' and work_id is not null) or (scope='company' and work_id is null)),
 check((status='done' and reason is null and target_file_id is not null) or (status='failed' and reason is not null)));
create index if not exists pro_file_transfers_recent on public.pro_file_transfers(owner_id,kind,at desc);

create or replace function public.pro_file_transfer_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'File transfer receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_file_transfer_guard on public.pro_file_transfers;
create trigger pro_file_transfer_guard before update or delete on public.pro_file_transfers for each row when (pg_trigger_depth()=0) execute function public.pro_file_transfer_guard();

create or replace function public.pro_file_transfer_json(r public.pro_file_transfers) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('actionId',r.action_id,'itemKey',r.item_key,'kind',r.kind,'provider',r.provider,'mode',r.mode,'scope',r.scope,'workId',r.work_id,'sourceFileId',r.source_file_id,'targetFileId',r.target_file_id,
  'name',r.name,'sizeBytes',r.size_bytes,'sha256',r.sha256,'status',r.status,'reason',r.reason,'at',r.at)
$$;

-- Idempotent: the first receipt of (action, item) wins and is returned again on a retry (replayed=true).
create or replace function public.pro_file_transfer_record(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];want text[]:=array['actionId','itemKey','kind','mode','name','provider','reason','scope','sha256','sizeBytes','sourceFileId','status','targetFileId','workId'];
 r public.pro_file_transfers;aid uuid;src uuid;dst uuid;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid receipt' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from want then raise exception 'Invalid receipt' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;src:=nullif(p_input->>'sourceFileId','')::uuid;dst:=nullif(p_input->>'targetFileId','')::uuid;exception when others then raise exception 'Invalid receipt' using errcode='22023';end;
 if p_input->>'scope' not in('company','work') or (p_input->>'scope'='work')=(nullif(p_input->>'workId','') is null) then raise exception 'Invalid receipt' using errcode='22023';end if;
 select * into r from public.pro_file_transfers where owner_id=p_actor and action_id=aid and item_key=p_input->>'itemKey';
 if found then return jsonb_build_object('receipt',public.pro_file_transfer_json(r),'replayed',true);end if;
 if p_input->>'scope'='company' then
  if dst is not null and not exists(select 1 from public.pro_company_files where owner_id=p_actor and id=dst) then raise exception 'Target file not found' using errcode='42501';end if;
 elsif p_input->>'scope'='work' then
  if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_input->>'workId') then raise exception 'Job not found' using errcode='42501';end if;
  if dst is not null and not exists(select 1 from public.pro_work_files where owner_id=p_actor and id=dst) then raise exception 'Target file not found' using errcode='42501';end if;
 end if;
 insert into public.pro_file_transfers(owner_id,action_id,item_key,kind,provider,mode,scope,work_id,source_file_id,target_file_id,name,size_bytes,sha256,status,reason)
  values(p_actor,aid,p_input->>'itemKey',p_input->>'kind',p_input->>'provider',p_input->>'mode',p_input->>'scope',nullif(p_input->>'workId',''),src,dst,p_input->>'name',nullif(p_input->>'sizeBytes','')::integer,nullif(p_input->>'sha256',''),p_input->>'status',nullif(p_input->>'reason',''))
  returning * into r;
 return jsonb_build_object('receipt',public.pro_file_transfer_json(r),'replayed',false);
end $$;

create or replace function public.pro_file_transfers_read(p_actor uuid,p_kind text,p_limit integer default 20) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind not in('import','convert') then raise exception 'Invalid kind' using errcode='22023';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_file_transfer_json(t) order by t.at desc,t.item_key) from (select * from public.pro_file_transfers where owner_id=p_actor and kind=p_kind order by at desc,item_key limit least(greatest(coalesce(p_limit,20),1),50)) t),'[]'::jsonb));
end $$;

do $$declare f record;begin
 alter table public.pro_file_transfers enable row level security;
 revoke all on public.pro_file_transfers from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_file_transfers to service_role;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_file_transfer_guard','pro_file_transfer_json','pro_file_transfer_record','pro_file_transfers_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
