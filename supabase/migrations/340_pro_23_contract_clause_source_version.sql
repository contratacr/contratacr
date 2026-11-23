-- Row 40 (contracts with reusable clauses): every clause inserted from the library records WHICH library version it
-- was taken from (item key "sourceVersion", 1-based, same numbering as pro_contract_library_clause_states).
-- Old items without the key stay valid (the key is optional). Clause text already in a contract never changes.
-- p_version: null = compute the current library version when p_source is set; 0 = unknown (omit the key); n>0 = keep n.
drop function if exists public.pro_contract_clause_item(uuid,text,text,uuid);
create or replace function public.pro_contract_clause_item(p_id uuid,p_title text,p_body text,p_source uuid,p_version integer default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare item jsonb;v integer:=p_version;owner uuid;
begin
 perform public.pro_contract_check_tokens(p_title);perform public.pro_contract_check_tokens(p_body);
 item:=jsonb_build_object('id',p_id,'title',p_title,'body',p_body,'sourceClauseId',p_source);
 if p_source is not null and v is null then
  select owner_id into owner from public.pro_contract_library_clauses where id=p_source;
  if owner is not null then v:=jsonb_array_length(coalesce(public.pro_contract_library_clause_states(owner,p_source),'[]'::jsonb));end if;
 end if;
 if v is not null and v>0 and p_source is not null then item:=item||jsonb_build_object('sourceVersion',v);end if;
 return item;
end $$;
create or replace function public.pro_contract_list_edit(p_owner uuid,p_list jsonb,p_input jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';cid uuid;pos integer;cur integer;lib public.pro_contract_library_clauses;old jsonb;n jsonb;
begin
 cid:=public.pro_contract_uuid(p_input->'clauseId');cur:=public.pro_contract_list_position(p_list,cid);
 if act='clause_put' then
  pos:=public.pro_contract_int(p_input->'position',1,81);
  if cur is not null then old:=p_list->(cur-1);end if;
  n:=public.pro_contract_clause_item(cid,public.pro_contract_text(p_input->'title',160,true),public.pro_contract_text(p_input->'body',4000,true,true),
   case when old is not null then nullif(old->>'sourceClauseId','')::uuid end,
   case when old is not null then coalesce(nullif(old->>'sourceVersion','')::integer,0) end);
  if old is not null and old=n and cur=pos then raise exception 'No clause changes' using errcode='22023';end if;
  return public.pro_contract_list_insert(public.pro_contract_list_without(p_list,cid),n,pos);
 elsif act='clause_remove' then
  if cur is null then raise exception 'Clause not found' using errcode='P0002';end if;
  return public.pro_contract_list_without(p_list,cid);
 elsif act='clause_move' then
  if cur is null then raise exception 'Clause not found' using errcode='P0002';end if;
  pos:=public.pro_contract_int(p_input->'position',1,80);
  if pos=cur then raise exception 'No clause changes' using errcode='22023';end if;
  return public.pro_contract_list_insert(public.pro_contract_list_without(p_list,cid),p_list->(cur-1),pos);
 elsif act='clause_insert_library' then
  if cur is not null then raise exception 'Clause already exists' using errcode='23505';end if;
  pos:=public.pro_contract_int(p_input->'position',1,81);
  select * into lib from public.pro_contract_library_clauses where owner_id=p_owner and id=public.pro_contract_uuid(p_input->'libraryClauseId') and not archived;
  if not found then raise exception 'Library clause not available' using errcode='22023';end if;
  return public.pro_contract_list_insert(p_list,public.pro_contract_clause_item(cid,lib.title,lib.body,lib.id,null),pos);
 end if;
 raise exception 'Invalid clause action' using errcode='22023';
end $$;

do $$
declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('pro_contract_clause_item','pro_contract_list_edit') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
