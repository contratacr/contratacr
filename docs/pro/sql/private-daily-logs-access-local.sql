-- LOCAL Pro only. Three allowlisted owner-only access substitutions.
-- Team current-generation and historical client publication rules unchanged.
begin;
create or replace function public.pro_daily_log_defaults_read(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare d pro_daily_log_defaults;begin if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;select * into d from pro_daily_log_defaults where owner_id=p_actor;if not found then return jsonb_build_object('revision',0,'summary','','sections',jsonb_build_object('weather',false,'plan',false,'tasks',false,'time',false));end if;return jsonb_build_object('revision',d.revision,'summary',d.summary,'sections',d.sections);end $$;
create or replace function public.pro_daily_logs_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;lid uuid;target uuid;wid text;gid uuid;own uuid;rev integer;ctx jsonb;receipt pro_daily_log_actions;l pro_daily_logs;d pro_daily_log_defaults;g pro_team_grants;r pro_appointment_requests;keys text[];expected text[];is_owner boolean;before_json jsonb;after_json jsonb;answer jsonb;snapshot_json jsonb;weather_json jsonb;day date;task_ids uuid[];plan_ids uuid[];sections_json jsonb;ref jsonb;team_ids uuid[]:='{}';version_no integer;version_json jsonb;service_name text;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric not between 0 and 2147483646 then raise exception 'Invalid identity' using errcode='22023';end if;
 act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 if act in('create','update') then expected:=array['action','actionId','date','grantId','logId','revision','sections','source','summary','title','weather','workId'];
 elsif act='duplicate' then expected:=array['action','actionId','grantId','logId','revision','targetLogId','workId'];
 elsif act in('archive','restore') then expected:=array['action','actionId','grantId','logId','revision','workId'];
 elsif act='publish' then expected:=array['action','actionId','client','grantId','logId','revision','team','workId'];
 elsif act='defaults_save' then expected:=array['action','actionId','revision','sections','summary'];else raise exception 'Unknown daily log action' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;if keys is distinct from expected then raise exception 'Unexpected daily log fields' using errcode='22023';end if;
 if act='defaults_save' then if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;own:=p_actor;is_owner:=true;
 else
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'grantId') not in('string','null') or jsonb_typeof(p_input->'logId') is distinct from 'string' then raise exception 'Invalid scope' using errcode='22023';end if;
  wid:=p_input->>'workId';gid:=(p_input->>'grantId')::uuid;lid:=(p_input->>'logId')::uuid;ctx:=pro_daily_log_context(p_actor,wid,gid,true);own:=(ctx->>'ownerId')::uuid;is_owner:=(ctx->>'isOwner')::boolean;
  if act='publish' and not is_owner then raise exception 'Forbidden' using errcode='42501';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-action:'||p_actor::text||':'||aid::text,0));
 if act='defaults_save' then perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-defaults:'||own::text,0));if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 else
  -- Same owner/work advisory as Team role/revoke and task/plan writers. Team
  -- takes grant rows after this advisory. Appointment writes request before work.
  perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||own::text||':'||wid,0));
  if gid is not null then perform 1 from pro_team_grants where id=gid for share;end if;
  ctx:=pro_daily_log_context(p_actor,wid,gid,true);if (ctx->>'ownerId')::uuid<>own then raise exception 'Forbidden' using errcode='42501';end if;
 end if;
 select * into receipt from pro_daily_log_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.work_id is distinct from wid or receipt.owner_id<>own or receipt.grant_id is distinct from(gid) or receipt.source_invite_id is distinct from(ctx->>'sourceInviteId')::uuid then raise exception 'Forbidden' using errcode='42501';end if;
  if receipt.input is distinct from p_input then raise exception 'Action identity reused' using errcode='22023';end if;return receipt.result;
 end if;
 if act='defaults_save' then
  if jsonb_typeof(p_input->'summary') is distinct from 'string' or length(p_input->>'summary')>2000 or jsonb_typeof(p_input->'sections') is distinct from 'object' or not pro_daily_log_sections_valid(p_input->'sections') then raise exception 'Invalid defaults' using errcode='22023';end if;
  select * into d from pro_daily_log_defaults where owner_id=own for update;if coalesce(d.revision,0)<>rev then raise exception 'Defaults changed' using errcode='40001';end if;
  before_json:=pro_daily_log_defaults_read(p_actor);insert into pro_daily_log_defaults(owner_id,revision,summary,sections) values(own,rev+1,btrim(p_input->>'summary'),p_input->'sections') on conflict(owner_id) do update set revision=excluded.revision,summary=excluded.summary,sections=excluded.sections;
  answer:=jsonb_build_object('action',act,'defaults',pro_daily_log_defaults_read(p_actor));after_json:=answer->'defaults';
 else
  if act='publish' then
   if jsonb_typeof(p_input->'client') not in('null','object') or jsonb_typeof(p_input->'team') is distinct from 'array' or jsonb_array_length(p_input->'team')>100 or p_input->'client'='null'::jsonb and jsonb_array_length(p_input->'team')=0 then raise exception 'Choose a bounded audience' using errcode='22023';end if;
   if p_input->'client'<>'null'::jsonb then
    if(select array_agg(key order by key) from jsonb_object_keys(p_input->'client')key) is distinct from array['recipientId','requestId'] then raise exception 'Invalid client audience' using errcode='22023';end if;
    select * into r from pro_appointment_requests where id=(p_input->'client'->>'requestId')::uuid and owner_id=own and work_id=wid for share;if not found then raise exception 'Client changed' using errcode='40001';end if;
   end if;
   for ref in select value from jsonb_array_elements(p_input->'team') order by value->>'grantId' loop
    if jsonb_typeof(ref) is distinct from 'object' or(select array_agg(key order by key) from jsonb_object_keys(ref)key) is distinct from array['grantId','sourceInviteId'] or jsonb_typeof(ref->'grantId') is distinct from 'string' or jsonb_typeof(ref->'sourceInviteId') is distinct from 'string' then raise exception 'Invalid team audience' using errcode='22023';end if;
    if(ref->>'grantId')::uuid=any(team_ids) then raise exception 'Duplicate team audience' using errcode='22023';end if;team_ids:=array_append(team_ids,(ref->>'grantId')::uuid);
    select * into g from pro_team_grants where id=(ref->>'grantId')::uuid and owner_id=own and work_id=wid for share;
    if not found or not g.active or g.member_user_id=own or g.source_invite_id<>(ref->>'sourceInviteId')::uuid or not exists(select 1 from profiles where id=g.member_user_id and not coalesce(is_disabled,false)) then raise exception 'Team audience changed' using errcode='40001';end if;
   end loop;
  end if;
  -- Do not take a work row lock: existing appointment work guards acquire the
  -- request row while holding work UPDATE. Sources are one coherent MVCC read,
  -- captured with fingerprint CAS; cost commits afterward cannot rewrite it.
  perform 1 from pro_work where user_id=own and id=wid;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  select * into l from pro_daily_logs where owner_id=own and work_id=wid and id=lid for update;
  if act='create' then if found or rev<>0 then raise exception 'Daily log identity changed' using errcode='40001';end if;
  else if not found or not pro_daily_log_visible(p_actor,ctx,l) then raise exception 'Forbidden' using errcode='42501';end if;if l.revision<>rev then raise exception 'Daily log changed' using errcode='40001';end if;before_json:=pro_daily_log_json(l);end if;
  if act in('create','duplicate') and(select count(*) from pro_daily_logs where owner_id=own and work_id=wid)>=500 then raise exception 'Daily log capacity exceeded' using errcode='40001';end if;
  if act in('create','update') then
   if act='update' and l.archived then raise exception 'Restore before editing' using errcode='40001';end if;
   if jsonb_typeof(p_input->'date') is distinct from 'string' or not coalesce((p_input->>'date')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) or jsonb_typeof(p_input->'title') is distinct from 'string' or length(btrim(p_input->>'title')) not between 1 and 160 or jsonb_typeof(p_input->'summary') is distinct from 'string' or length(p_input->>'summary')>2000 or jsonb_typeof(p_input->'sections') is distinct from 'object' or not pro_daily_log_sections_valid(p_input->'sections') or jsonb_typeof(p_input->'weather') not in('object','null') or jsonb_typeof(p_input->'source') is distinct from 'object' then raise exception 'Invalid daily log content' using errcode='22023';end if;
   day:=(p_input->>'date')::date;if day not between date'1900-01-01' and date'2100-12-31' then raise exception 'Invalid daily log date' using errcode='22023';end if;sections_json:=p_input->'sections';weather_json:=nullif(p_input->'weather','null'::jsonb);
   if not(sections_json->>'weather')::boolean and weather_json is not null then raise exception 'Weather section disabled' using errcode='22023';end if;
   if weather_json is not null then
    if(select array_agg(key order by key) from jsonb_object_keys(weather_json)key) is distinct from array['condition','note','temperatureC'] or weather_json->>'condition' not in('clear','cloudy','rain','other') or jsonb_typeof(weather_json->'condition') is distinct from 'string' or jsonb_typeof(weather_json->'note') is distinct from 'string' or length(weather_json->>'note')>300 or jsonb_typeof(weather_json->'temperatureC') not in('number','null') or(weather_json->>'temperatureC')::numeric not between -20 and 60 then raise exception 'Invalid manual weather' using errcode='22023';end if;
   end if;
   if p_input->'source'->>'mode'='keep' then
    if act='create' or p_input->'source'<>jsonb_build_object('mode','keep') or l.log_date<>day or l.sections<>sections_json then raise exception 'Refresh sources after changing date or sections' using errcode='22023';end if;snapshot_json:=l.snapshot;
   elsif p_input->'source'->>'mode'='capture' then
    if(select array_agg(key order by key) from jsonb_object_keys(p_input->'source')key) is distinct from array['fingerprint','mode','planTaskIds','taskIds'] or jsonb_typeof(p_input->'source'->'taskIds') is distinct from 'array' or jsonb_typeof(p_input->'source'->'planTaskIds') is distinct from 'array' or not coalesce((p_input->'source'->>'fingerprint')~'^[a-f0-9]{32}$',false) then raise exception 'Invalid source capture' using errcode='22023';end if;
    select coalesce(array_agg(value::uuid),'{}') into task_ids from jsonb_array_elements_text(p_input->'source'->'taskIds');select coalesce(array_agg(value::uuid),'{}') into plan_ids from jsonb_array_elements_text(p_input->'source'->'planTaskIds');
    if not(sections_json->>'tasks')::boolean and cardinality(task_ids)>0 or not(sections_json->>'plan')::boolean and cardinality(plan_ids)>0 then raise exception 'Disabled source section' using errcode='22023';end if;
    snapshot_json:=pro_daily_log_snapshot(p_actor,wid,gid,p_input->>'date',task_ids,plan_ids,(sections_json->>'time')::boolean);if snapshot_json->>'fingerprint'<>p_input->'source'->>'fingerprint' then raise exception 'Sources changed; refresh before saving' using errcode='40001';end if;
   else raise exception 'Invalid source mode' using errcode='22023';end if;
   if act='create' then
    insert into pro_daily_logs(owner_id,work_id,id,log_date,title,summary,sections,weather,snapshot,revision,created_by,created_by_name,created_grant_id,source_invite_id) values(own,wid,lid,day,btrim(p_input->>'title'),btrim(p_input->>'summary'),sections_json,weather_json,snapshot_json,1,p_actor,pro_team_name(p_actor),(ctx->>'grantId')::uuid,(ctx->>'sourceInviteId')::uuid) returning * into l;
   else update pro_daily_logs set log_date=day,title=btrim(p_input->>'title'),summary=btrim(p_input->>'summary'),sections=sections_json,weather=weather_json,snapshot=snapshot_json,revision=revision+1,updated_at=now() where owner_id=own and work_id=wid and id=lid returning * into l;end if;
  elsif act='duplicate' then
   if jsonb_typeof(p_input->'targetLogId') is distinct from 'string' then raise exception 'Invalid duplicate identity' using errcode='22023';end if;target:=(p_input->>'targetLogId')::uuid;
   if exists(select 1 from pro_daily_logs where owner_id=own and work_id=wid and id=target) then raise exception 'Duplicate identity used' using errcode='40001';end if;
   insert into pro_daily_logs(owner_id,work_id,id,log_date,title,summary,sections,weather,snapshot,revision,created_by,created_by_name,created_grant_id,source_invite_id) values(own,wid,target,l.log_date,l.title,l.summary,l.sections,l.weather,l.snapshot,1,p_actor,pro_team_name(p_actor),(ctx->>'grantId')::uuid,(ctx->>'sourceInviteId')::uuid) returning * into l;
  elsif act in('archive','restore') then
   if l.archived=(act='archive') then raise exception 'Daily log status changed' using errcode='40001';end if;update pro_daily_logs set archived=(act='archive'),revision=revision+1,updated_at=now() where owner_id=own and work_id=wid and id=lid returning * into l;
  else
   if l.archived then raise exception 'Restore before publishing' using errcode='40001';end if;
   if p_input->'client'<>'null'::jsonb and(r.client_user_id is distinct from(p_input->'client'->>'recipientId')::uuid or r.status not in('confirmed','completed') or not exists(select 1 from profiles where id=r.client_user_id and not coalesce(is_disabled,false)) or exists(select 1 from pro_work where user_id=own and id=wid and coalesce(cancelled,false))) then raise exception 'Client audience changed' using errcode='40001';end if;
   if exists(select 1 from pro_team_grants target_grant where target_grant.id=any(team_ids) and(not target_grant.active or not exists(select 1 from profiles p where p.id=target_grant.member_user_id and not coalesce(p.is_disabled,false)))) then raise exception 'Team audience changed' using errcode='40001';end if;
   update pro_daily_logs set revision=revision+1,published_revision=revision+1,updated_at=now() where owner_id=own and work_id=wid and id=lid returning * into l;
   select coalesce(max(version),0)+1 into version_no from pro_daily_log_versions where owner_id=own and work_id=wid and log_id=lid;select service into service_name from pro_work where user_id=own and id=wid;
   version_json:=jsonb_build_object('id',lid,'version',version_no,'date',to_char(l.log_date,'YYYY-MM-DD'),'title',l.title,'summary',l.summary,'sections',l.sections,'weather',l.weather,'snapshot',l.snapshot,'service',service_name,'authorName',l.created_by_name,'publishedAt',now());
   insert into pro_daily_log_versions values(own,wid,lid,version_no,l.revision,version_json);
   if p_input->'client'<>'null'::jsonb then insert into pro_daily_log_audiences(owner_id,work_id,log_id,version,kind,recipient_id,request_id) values(own,wid,lid,version_no,'client',r.client_user_id,r.id);end if;
   insert into pro_daily_log_audiences(owner_id,work_id,log_id,version,kind,recipient_id,grant_id,source_invite_id) select own,wid,lid,version_no,'team',target_grant.member_user_id,target_grant.id,target_grant.source_invite_id from pro_team_grants target_grant where target_grant.id=any(team_ids);
  end if;
  ctx:=pro_daily_log_context(p_actor,wid,gid,true);after_json:=pro_daily_log_json(l);answer:=jsonb_build_object('action',act,'log',after_json);if act='publish' then answer:=answer||jsonb_build_object('version',version_json);end if;
  insert into pro_daily_log_history(owner_id,work_id,log_id,action_id,actor_id,actor_name,action,before_log,after_log) values(own,wid,l.id,aid,p_actor,pro_team_name(p_actor),act,before_json,after_json);
 end if;
 if not coalesce(case when is_owner then pro_private_work_tools_enabled(own) else pro_appointment_enabled(own) end,false) or not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into pro_daily_log_actions(actor_id,action_id,owner_id,work_id,grant_id,source_invite_id,input,result,before_state,after_state) values(p_actor,aid,own,wid,gid,case when ctx is null then null else(ctx->>'sourceInviteId')::uuid end,p_input,answer,before_json,after_json);return answer;
end $$;
create or replace function public.pro_daily_log_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r pro_daily_log_actions;ctx jsonb;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from pro_daily_log_actions where actor_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('receipt',null);end if;
 if r.work_id is null then if r.owner_id<>p_actor or not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 else ctx:=pro_daily_log_context(p_actor,r.work_id,r.grant_id,true);if(ctx->>'ownerId')::uuid<>r.owner_id or(ctx->>'sourceInviteId')::uuid is distinct from r.source_invite_id then raise exception 'Forbidden' using errcode='42501';end if;end if;
 return jsonb_build_object('receipt',jsonb_build_object('input',r.input,'result',r.result));
end $$;
revoke all on function public.pro_daily_log_defaults_read(uuid) from public,anon,authenticated;
grant execute on function public.pro_daily_log_defaults_read(uuid) to service_role;
revoke all on function public.pro_daily_logs_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_daily_logs_mutate(uuid,jsonb) to service_role;
revoke all on function public.pro_daily_log_action_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_daily_log_action_read(uuid,uuid) to service_role;
commit;
notify pgrst, 'reload schema';
