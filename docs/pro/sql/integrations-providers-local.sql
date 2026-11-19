-- LOCAL PRO ONLY. Round 6B (2026-11-13): new providers in the Round 6A integration framework.
-- * esign      = electronic signature (mock provider; DocuSign eSignature sandbox adapter, inactive)
-- * google     = Gmail / Google Calendar / Google Drive (OAuth 2.0 + PKCE)
-- * microsoft  = Outlook mail / Outlook calendar / OneDrive (Microsoft identity platform, OAuth 2.0 + PKCE)
-- * quickbooks = QuickBooks Online accounting (Intuit OAuth 2.0)
-- Same rules as 6A: mock by default, sandbox only with every env var, production only with the typed
-- confirmation AND PRO_INTEGRATIONS_ALLOW_PRODUCTION=1. This module only widens the provider lists and
-- re-creates the two framework functions that enumerate providers; no row is changed.
begin;

create or replace function public.pro_integration_provider_ids() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['hacienda','tilopay','esign','google','microsoft','quickbooks']::text[] $$;

do $$declare t text;begin foreach t in array array['pro_integration_connections','pro_integration_requests','pro_integration_webhooks'] loop
 execute format('alter table public.%I drop constraint if exists %I',t,t||'_provider_check');
 execute format('alter table public.%I add constraint %I check(provider = any(public.pro_integration_provider_ids()))',t,t||'_provider_check');
end loop;end $$;

create or replace function public.pro_integration_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare out jsonb:='[]';p text;r public.pro_integration_connections;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 foreach p in array public.pro_integration_provider_ids() loop
  select * into r from public.pro_integration_connections where owner_id=p_actor and provider=p;
  if not found then r:=null;end if;
  out:=out||jsonb_build_array(public.pro_integration_connection_json(r,p));
 end loop;
 return jsonb_build_object('connections',out,
  'history',coalesce((select jsonb_agg(jsonb_build_object('provider',h.provider,'action',h.action,'fromMode',h.from_mode,'toMode',h.to_mode,'detail',h.detail,'at',h.created_at) order by h.created_at desc) from (select * from public.pro_integration_history where owner_id=p_actor order by created_at desc limit 20) h),'[]'),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'provider',q.provider,'mode',q.mode,'operation',q.operation,'target',q.target,'summary',q.summary,'statusCode',q.status_code,'outcome',q.outcome,'durationMs',q.duration_ms,'attempt',q.attempt,'correlation',q.correlation,'at',q.created_at) order by q.created_at desc) from (select * from public.pro_integration_requests where owner_id=p_actor order by created_at desc limit 30) q),'[]'),
  'webhooks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'provider',w.provider,'mode',w.mode,'eventId',w.event_id,'eventType',w.event_type,'status',w.status,'attempts',w.attempts,'nextAttemptAt',w.next_attempt_at,'lastError',w.last_error,'receivedAt',w.received_at,'processedAt',w.processed_at) order by w.received_at desc) from (select * from public.pro_integration_webhooks where owner_id=p_actor order by received_at desc limit 30) w),'[]'));
end $$;

-- Same body as 6A; only the provider whitelist now comes from pro_integration_provider_ids().
create or replace function public.pro_integration_mutate(p_actor uuid,p_input jsonb,p_production_allowed boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';prov text:=p_input->>'provider';aid uuid;receipt public.pro_integration_actions;r public.pro_integration_connections;
 next_mode text;rev integer;result jsonb;old_mode text;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or not coalesce(prov=any(public.pro_integration_provider_ids()),false) or act not in('set_mode','save_config','enable','disable','test') then raise exception 'Invalid integration action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-integration:'||p_actor::text,0));
 select * into receipt from public.pro_integration_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 insert into public.pro_integration_connections(owner_id,provider,revision) values(p_actor,prov,0) on conflict do nothing;
 select * into r from public.pro_integration_connections where owner_id=p_actor and provider=prov for update;
 old_mode:=r.mode;
 if act<>'test' then
  if jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid revision' using errcode='22023';end if;
  rev:=(p_input->>'revision')::integer;
  if rev is distinct from r.revision then raise exception 'Integration changed' using errcode='40001';end if;
 end if;
 if act='set_mode' then
  next_mode:=p_input->>'mode';
  if next_mode not in('mock','sandbox','production') then raise exception 'Invalid mode' using errcode='22023';end if;
  if next_mode='production' then
   if not coalesce(p_production_allowed,false) then raise exception 'Production integrations are not allowed on this server' using errcode='42501',hint='pro_integration_production_refused';end if;
   if p_input->>'confirm' is distinct from 'ACTIVAR PRODUCCION' then raise exception 'Production needs explicit confirmation' using errcode='22023',hint='pro_integration_production_confirm';end if;
  end if;
  update public.pro_integration_connections set mode=next_mode,production_confirmed_at=case when next_mode='production' then now() else null end,revision=revision+1,updated_at=now()
   where owner_id=p_actor and provider=prov returning * into r;
 elsif act='save_config' then
  if jsonb_typeof(p_input->'config')<>'object' or not public.pro_integration_config_safe(p_input->'config') then raise exception 'Config must be non-secret' using errcode='22023',hint='pro_integration_secret_config';end if;
  update public.pro_integration_connections set config=p_input->'config',revision=revision+1,updated_at=now() where owner_id=p_actor and provider=prov returning * into r;
 elsif act in('enable','disable') then
  update public.pro_integration_connections set enabled=(act='enable'),revision=revision+1,updated_at=now() where owner_id=p_actor and provider=prov returning * into r;
 else
  if jsonb_typeof(p_input->'ok')<>'boolean' or p_input->>'testMode' not in('mock','sandbox','production') or length(coalesce(p_input->>'message',''))>300 then raise exception 'Invalid test result' using errcode='22023';end if;
  update public.pro_integration_connections set last_test_at=now(),last_test_ok=(p_input->>'ok')::boolean,last_test_mode=p_input->>'testMode',last_test_message=nullif(p_input->>'message','')
   where owner_id=p_actor and provider=prov returning * into r;
 end if;
 insert into public.pro_integration_history(owner_id,id,provider,action,from_mode,to_mode,detail) values(p_actor,aid,prov,act,old_mode,r.mode,
  case when act='save_config' then jsonb_build_object('keys',(select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_input->'config') k)) when act='test' then jsonb_build_object('ok',p_input->'ok','mode',p_input->>'testMode') else '{}'::jsonb end);
 result:=public.pro_integration_connection_json(r,prov);
 insert into public.pro_integration_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

revoke all on function public.pro_integration_provider_ids() from public,anon,authenticated;
grant execute on function public.pro_integration_provider_ids() to service_role;
revoke all on function public.pro_integration_read(uuid) from public,anon,authenticated;
grant execute on function public.pro_integration_read(uuid) to service_role;
revoke all on function public.pro_integration_mutate(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pro_integration_mutate(uuid,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
