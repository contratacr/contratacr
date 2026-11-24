-- Pro area C (Messages): "Cc" on project emails. The recipients in copy are stored with the outbox row and sent as a Cc header.
-- pro_email_record is the 306 function with one more column; the old rows get an empty list.
begin;
alter table public.pro_email_outbox add column if not exists cc_emails text[] not null default '{}'::text[];
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_email_outbox_cc_size') then
  alter table public.pro_email_outbox add constraint pro_email_outbox_cc_size check(cardinality(cc_emails)<=10);
 end if;
end $$;
create or replace function public.pro_email_record(p_actor uuid,p_input jsonb,p_mode text,p_from text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior jsonb;c public.pro_oauth_connections;oid uuid:=gen_random_uuid();o public.pro_email_outbox;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 prior:=public.pro_connector_receipt(p_actor,p_input,'email');if prior is not null then return prior||jsonb_build_object('duplicate',true);end if;
 if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'Each send needs explicit confirmation' using errcode='22023',hint='pro_email_confirm';end if;
 select * into c from public.pro_oauth_connections where owner_id=p_actor and provider=p_input->>'provider' and status='connected';
 if not found then raise exception 'Mailbox not connected' using errcode='22023',hint='pro_oauth_not_connected';end if;
 if c.mode<>p_mode then raise exception 'Connection mode differs' using errcode='22023',hint='pro_oauth_mode';end if;
 if p_input->>'workId' is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=p_input->>'workId') then raise exception 'Unknown project' using errcode='22023';end if;
 insert into public.pro_email_outbox(owner_id,id,provider,mode,from_email,to_emails,cc_emails,subject,body,work_id,attachments,status,confirmed_at)
 values(p_actor,oid,c.provider,p_mode,coalesce(p_from,c.account_email,'buzon@desconocido.local'),(select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p_input->'to') x),coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(case when jsonb_typeof(p_input->'cc')='array' then p_input->'cc' else '[]'::jsonb end) x),'{}'::text[]),
  p_input->>'subject',p_input->>'body',p_input->>'workId',coalesce(p_input->'attachments','[]'),case when p_mode='mock' then 'simulated' else 'queued' end,now()) returning * into o;
 result:=jsonb_build_object('id',o.id,'status',o.status,'mode',o.mode);
 insert into public.pro_connector_actions(owner_id,action_id,scope,input,result) values(p_actor,(p_input->>'actionId')::uuid,'email',p_input,result);
 return result;
exception when check_violation or not_null_violation then raise exception 'Invalid email' using errcode='22023';
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_email_record' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
