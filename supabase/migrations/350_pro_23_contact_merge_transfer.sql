-- ContrataCR Pro, database part 23 (row 05): merging customers moves what can move.
-- Jobs, draft quotes and manual opportunities of the archived customer pass to the kept one unless a database guard
-- refuses (account entries, cost history, appointment agreements...); then the whole merge is refused and the blockers
-- are listed. Custom field values and additional channels are carried over. PRO_ENABLED stays false in production.
begin;

-- Everything that still points at a customer and is NOT moved by a merge (contact data and the records handled by
-- pro_contact_merge_transfer are excluded): [{"kind":"table","table":"pro_invoice_drafts","count":2}, ...].
create or replace function public.pro_contact_merge_blockers(p_owner uuid,p_client text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f record;n bigint;res jsonb:='[]'::jsonb;
begin
 for f in select c.conrelid::regclass rel,c.conrelid::regclass::text relname,(select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1]) owner_col,(select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[2]) client_col
  from pg_constraint c where c.contype='f' and c.confrelid='public.pro_clients'::regclass and cardinality(c.conkey)=2
   and c.conrelid::regclass::text not in('pro_contact_tags','public.pro_contact_tags','pro_contact_channels','public.pro_contact_channels','pro_contact_field_values','public.pro_contact_field_values','pro_contact_extra_heads','public.pro_contact_extra_heads','pro_work','public.pro_work','pro_legacy_quotes','public.pro_legacy_quotes','pro_quote_links','public.pro_quote_links','pro_lead_center_records','public.pro_lead_center_records')
  order by 2 loop
  execute format('select count(*) from %s where %I=$1 and %I=$2',f.rel,f.owner_col,f.client_col) into n using p_owner,p_client;
  if n>0 then res:=res||jsonb_build_array(jsonb_build_object('kind','table','table',regexp_replace(f.relname,'^public\.',''),'count',n));end if;
 end loop;
 return res;
end $$;

-- Moves the jobs, draft quotes and manual opportunities of p_dup to p_keep. Each job is tried on its own sub-transaction:
-- the database guards (account entries, cost history, appointment agreements…) stay the authority, so what they refuse is
-- reported, never forced. Raises 22023 / hint pro_contact_merge_records with the blockers as DETAIL; the raise undoes every move.
create or replace function public.pro_contact_merge_transfer(p_owner uuid,p_keep text,p_dup text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare k public.pro_clients;w record;l record;blockers jsonb;n integer;
begin
 select * into k from public.pro_clients where user_id=p_owner and id=p_keep;
 if k.id is null then raise exception 'Customer unavailable' using errcode='P0002';end if;
 blockers:=public.pro_contact_merge_blockers(p_owner,p_dup);
 for w in select id,"client" from public.pro_work where user_id=p_owner and "clientId"=p_dup order by position loop
  begin
   update public.pro_work set "clientId"=p_keep,"client"=k.name where user_id=p_owner and id=w.id;
  exception when others then
   blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','work','id',w.id,'name',w."client",'reason',case when sqlerrm like 'Work with entries%' then 'entries' else 'locked' end));
  end;
 end loop;
 select count(*) into n from public.pro_quote_links where user_id=p_owner and "clientId"=p_dup;
 if n>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','quote_links','count',n));end if;
 begin
  update public.pro_legacy_quotes set "clientId"=p_keep where user_id=p_owner and "clientId"=p_dup and status='draft';
 exception when others then null;end;
 select count(*) into n from public.pro_legacy_quotes where user_id=p_owner and "clientId"=p_dup;
 if n>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','quotes','count',n));end if;
 for l in select id,kind from public.pro_lead_center_records where owner_id=p_owner and client_id=p_dup and kind='manual' loop
  begin
   update public.pro_lead_center_records set client_id=p_keep where owner_id=p_owner and kind=l.kind and id=l.id;
  exception when others then
   blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','lead','id',l.id));
  end;
 end loop;
 select count(*) into n from public.pro_lead_center_records where owner_id=p_owner and client_id=p_dup;
 if n>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','lead_other','count',n));end if;
 if jsonb_array_length(blockers)>0 then raise exception 'Customer to archive has records' using errcode='22023',hint='pro_contact_merge_records',detail=blockers::text;end if;
end $$;

-- Custom field values and additional channels of the archived customer reach the kept one (nothing is overwritten):
-- a value the kept customer lacks is copied; every e-mail / phone of the archived customer that the kept one does not
-- already have becomes an additional channel of the kept customer (at most 10).
create or replace function public.pro_contact_merge_extras(p_owner uuid,p_keep text,p_dup text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare k public.pro_clients;d public.pro_clients;c record;n integer;ck text;moved boolean:=false;
begin
 select * into k from public.pro_clients where user_id=p_owner and id=p_keep;select * into d from public.pro_clients where user_id=p_owner and id=p_dup;
 insert into public.pro_contact_field_values(owner_id,client_id,field_id,value) select p_owner,p_keep,field_id,value from public.pro_contact_field_values where owner_id=p_owner and client_id=p_dup on conflict do nothing;
 if found then moved:=true;end if;
 select count(*) into n from public.pro_contact_channels where owner_id=p_owner and client_id=p_keep;
 for c in select kind,value,value_key,label,ord from(
   select 'email'::text kind,d.email value,public.pro_contact_channel_key('email',d.email) value_key,''::text label,0 ord where btrim(coalesce(d.email,''))<>''
   union all select 'phone',d.phone,public.pro_contact_channel_key('phone',d.phone),'',1 where btrim(coalesce(d.phone,''))<>''
   union all select ch.kind,ch.value,ch.value_key,ch.label,10+ch.position from public.pro_contact_channels ch where ch.owner_id=p_owner and ch.client_id=p_dup) x
   where value_key is not null order by ord loop
  exit when n>=10;
  ck:=case c.kind when 'email' then public.pro_contact_channel_key('email',k.email) else public.pro_contact_channel_key('phone',k.phone) end;
  continue when ck is not distinct from c.value_key;
  if exists(select 1 from public.pro_contact_channels where owner_id=p_owner and client_id=p_keep and kind=c.kind and value_key=c.value_key) then continue;end if;
  insert into public.pro_contact_channels(owner_id,client_id,id,kind,value,value_key,label,position) values(p_owner,p_keep,gen_random_uuid(),c.kind,c.value,c.value_key,c.label,n);
  n:=n+1;moved:=true;
 end loop;
 if moved then insert into public.pro_contact_extra_heads(owner_id,client_id,revision) values(p_owner,p_keep,1) on conflict(owner_id,client_id) do update set revision=public.pro_contact_extra_heads.revision+1,updated_at=clock_timestamp();end if;
end $$;

create or replace function public.pro_contacts_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;keys text[];receipt public.pro_contact_actions;answer jsonb;preview jsonb;r jsonb;rows_json jsonb:='[]';ids text[]:='{}';cid text;v integer;tags text[];t text;
 keep public.pro_clients;dup public.pro_clients;kept jsonb;merged jsonb;before_tags jsonb;
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid contact action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from (case act when 'import' then array['action','actionId','fileName','format','revision','rows'] when 'tags' then array['action','actionId','clientId','tags'] when 'merge' then array['action','actionId','keepId','mergeId','revision'] end) then raise exception 'Unexpected contact fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if act in('import','merge') and(jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contacts:'||p_owner::text,0));
 select * into receipt from public.pro_contact_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 if act='import' then
  if jsonb_typeof(p_input->'fileName') is distinct from 'string' or length(btrim(p_input->>'fileName')) not between 1 and 160 or p_input->>'format' not in('csv','vcard') then raise exception 'Invalid import file' using errcode='22023';end if;
  preview:=public.pro_contacts_preview(p_owner,p_input->'rows');
  for r in select value from jsonb_array_elements(preview->'rows') loop
   if r->>'status'='new' then
    cid:=public.pro_lead_import_uuid('pro-contacts:'||aid::text||':'||(r->>'index'))::text;ids:=ids||cid;
    rows_json:=rows_json||jsonb_build_array(jsonb_build_object('id',cid,'name',r->'row'->>'name','email',r->'row'->>'email','phone',r->'row'->>'phone','notes',r->'row'->>'notes','archived',false,
     'identification',nullif(r->'row'->>'identification',''),'tradeName',nullif(r->'row'->>'tradeName',''),'group',nullif(r->'row'->>'group',''),'address',nullif(r->'row'->>'address','')));
   end if;
  end loop;
  if cardinality(ids)>0 then v:=public.pro_mutate_catalog(p_owner,'clients',rows_json,(p_input->>'revision')::integer,'[]'::jsonb,true);
  else v:=coalesce((select revision from public.pro_workspace_core where user_id=p_owner),0);if v<>(p_input->>'revision')::integer then raise exception 'Customers changed' using errcode='40001';end if;end if;
  for r in select value from jsonb_array_elements(preview->'rows') where value->>'status'='new' loop
   cid:=public.pro_lead_import_uuid('pro-contacts:'||aid::text||':'||(r->>'index'))::text;
   insert into public.pro_contact_tags(owner_id,client_id,tag) select p_owner,cid,x from jsonb_array_elements_text(r->'row'->'tags') x on conflict do nothing;
   insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values(p_owner,aid,cid,'import',null,r->'row');
  end loop;
  insert into public.pro_contact_imports(owner_id,action_id,file_name,format,total,created,skipped,created_ids) values(p_owner,aid,btrim(p_input->>'fileName'),p_input->>'format',(preview->'counts'->>'total')::integer,cardinality(ids),(preview->'counts'->>'total')::integer-cardinality(ids),ids);
  answer:=jsonb_build_object('action','import','revision',v,'created',cardinality(ids),'createdIds',to_jsonb(ids),'counts',preview->'counts');
 elsif act='tags' then
  if jsonb_typeof(p_input->'clientId') is distinct from 'string' or not exists(select 1 from public.pro_clients where user_id=p_owner and id=p_input->>'clientId') then raise exception 'Customer unavailable' using errcode='P0002';end if;
  tags:=public.pro_contact_tag_list(p_input->'tags');if tags is null then raise exception 'Invalid tags' using errcode='22023';end if;
  cid:=p_input->>'clientId';before_tags:=public.pro_contact_tags_of(p_owner,cid);
  delete from public.pro_contact_tags where owner_id=p_owner and client_id=cid;
  foreach t in array tags loop insert into public.pro_contact_tags(owner_id,client_id,tag) values(p_owner,cid,t);end loop;
  insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values(p_owner,aid,cid,'tags',before_tags,public.pro_contact_tags_of(p_owner,cid));
  answer:=jsonb_build_object('action','tags','clientId',cid,'tags',public.pro_contact_tags_of(p_owner,cid));
 else
  if jsonb_typeof(p_input->'keepId') is distinct from 'string' or jsonb_typeof(p_input->'mergeId') is distinct from 'string' or p_input->>'keepId'=p_input->>'mergeId' then raise exception 'Choose two customers' using errcode='22023';end if;
  select * into keep from public.pro_clients where user_id=p_owner and id=p_input->>'keepId';select * into dup from public.pro_clients where user_id=p_owner and id=p_input->>'mergeId';
  if keep.id is null or dup.id is null then raise exception 'Customer unavailable' using errcode='P0002';end if;
  if keep.archived or dup.archived or exists(select 1 from public.pro_contact_merges where owner_id=p_owner and merged_id in(keep.id,dup.id)) then raise exception 'Customers changed' using errcode='40001';end if;
  -- Row 05 (2026-11-22): jobs, draft quotes and manual opportunities WITHOUT account movements move to the kept customer;
  -- anything that cannot move (account entries, invoices, resolved quotes…) refuses the whole merge listing what blocked it.
  perform public.pro_contact_merge_transfer(p_owner,keep.id,dup.id);
  kept:=to_jsonb(keep)-'position'-'user_id';merged:=to_jsonb(dup)-'position'-'user_id';
  kept:=kept||jsonb_build_object(
   'email',case when btrim(keep.email)='' then dup.email else keep.email end,'phone',case when btrim(keep.phone)='' then dup.phone else keep.phone end,
   'identification',coalesce(nullif(keep.identification,''),nullif(dup.identification,'')),'tradeName',coalesce(nullif(keep."tradeName",''),nullif(dup."tradeName",'')),
   'group',coalesce(nullif(keep."group",''),nullif(dup."group",'')),'address',coalesce(nullif(keep.address,''),nullif(dup.address,'')),
   'notes',left(case when btrim(dup.notes)='' or position(btrim(dup.notes) in keep.notes)>0 then keep.notes when btrim(keep.notes)='' then dup.notes else keep.notes||E'\n'||dup.notes end,2000));
  v:=public.pro_mutate_catalog(p_owner,'clients',jsonb_build_array(kept,merged||jsonb_build_object('archived',true)),(p_input->>'revision')::integer,'[]'::jsonb,false);
  before_tags:=public.pro_contact_tags_of(p_owner,keep.id);
  insert into public.pro_contact_tags(owner_id,client_id,tag) select p_owner,keep.id,tag from public.pro_contact_tags where owner_id=p_owner and client_id=dup.id
   and(select count(*) from public.pro_contact_tags where owner_id=p_owner and client_id=keep.id)<10 on conflict do nothing;
  perform public.pro_contact_merge_extras(p_owner,keep.id,dup.id);
  insert into public.pro_contact_merges(owner_id,merged_id,kept_id,action_id,merged_name) values(p_owner,dup.id,keep.id,aid,dup.name);
  insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values
   (p_owner,aid,keep.id,'merge_keep',to_jsonb(keep)-'position'||jsonb_build_object('tags',before_tags),kept||jsonb_build_object('tags',public.pro_contact_tags_of(p_owner,keep.id),'mergedFrom',dup.id)),
   (p_owner,aid,dup.id,'merge_archive',to_jsonb(dup)-'position',merged||jsonb_build_object('archived',true,'mergedInto',keep.id));
  answer:=jsonb_build_object('action','merge','revision',v,'keepId',keep.id,'mergeId',dup.id);
 end if;
 insert into public.pro_contact_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- An additional channel becomes the main e-mail / phone of the customer; the previous main one takes its place as an
-- additional channel (nothing is lost). One transaction, idempotent by action id, written through the catalog writer.
create or replace function public.pro_contact_channel_promote(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid text;chid uuid;receipt public.pro_contact_field_actions;c public.pro_clients;ch public.pro_contact_channels;old_value text;old_key text;rev integer;v integer;answer jsonb;keys text[];
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid channel action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['action','actionId','channelId','clientId'] or p_input->>'action'<>'channel_promote' then raise exception 'Unexpected channel fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;chid:=(p_input->>'channelId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 cid:=p_input->>'clientId';
 perform pg_advisory_xact_lock(hashtextextended('pro-contacts:'||p_owner::text,0));
 select * into receipt from public.pro_contact_field_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 select * into c from public.pro_clients where user_id=p_owner and id=cid;
 select * into ch from public.pro_contact_channels where owner_id=p_owner and client_id=cid and id=chid;
 if c.id is null or ch.id is null then raise exception 'Channel unavailable' using errcode='P0002';end if;
 if c.archived then raise exception 'Customer changed' using errcode='40001';end if;
 old_value:=case ch.kind when 'email' then c.email else c.phone end;old_key:=public.pro_contact_channel_key(ch.kind,old_value);
 select revision into rev from public.pro_workspace_core where user_id=p_owner;
 v:=public.pro_mutate_catalog(p_owner,'clients',jsonb_build_array((to_jsonb(c)-'position'-'user_id')||jsonb_build_object(case ch.kind when 'email' then 'email' else 'phone' end,ch.value)),coalesce(rev,0),'[]'::jsonb,false);
 delete from public.pro_contact_channels where owner_id=p_owner and client_id=cid and id=chid;
 if btrim(coalesce(old_value,''))<>'' and old_key is not null then
  insert into public.pro_contact_channels(owner_id,client_id,id,kind,value,value_key,label,position) values(p_owner,cid,gen_random_uuid(),ch.kind,btrim(old_value),old_key,ch.label,ch.position);
 end if;
 insert into public.pro_contact_extra_heads(owner_id,client_id,revision) values(p_owner,cid,1) on conflict(owner_id,client_id) do update set revision=public.pro_contact_extra_heads.revision+1,updated_at=clock_timestamp();
 answer:=jsonb_build_object('action','channel_promote','clientId',cid,'kind',ch.kind,'revision',v);
 insert into public.pro_contact_field_history(owner_id,action_id,subject,action,before_value,after_value) values(p_owner,aid,cid,'extras_save',jsonb_build_object('kind',ch.kind,'main',old_value),jsonb_build_object('kind',ch.kind,'main',ch.value));
 insert into public.pro_contact_field_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_contact_merge_blockers','pro_contact_merge_transfer','pro_contact_merge_extras','pro_contact_channel_promote','pro_contacts_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
