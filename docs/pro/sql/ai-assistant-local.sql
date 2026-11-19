-- LOCAL PRO ONLY. Round 6C (2026-11-13): AI assistant and transcription (rows 46, 67, 76, 77).
-- * Two new providers in the Round 6A/6B integration framework: «ai» (Anthropic Claude) and «transcription»
--   (OpenAI-compatible). Same rules: mock by default, sandbox only with every env var, production only with
--   the typed confirmation AND PRO_INTEGRATIONS_ALLOW_PRODUCTION=1.
-- * Per company: data-processing consent (OFF by default; every AI call is refused while it is off) and a
--   monthly usage cap with an atomic counter (one unit per provider call; idempotent by actionId).
-- * pro_ai_suggestions: every AI result is stored APART and is immutable. Nothing here writes quotes, clauses,
--   logs, updates, takeoffs, expenses or tasks: the owner reviews/edits a suggestion and saves it through the
--   existing editor. Only the review outcome (used/discarded) can be recorded, once.
-- * Meeting recordings: only with the all-parties consent confirmation; private to the owner (other owners get
--   P0002, customers 42501); deletable by the owner. Meeting notes exist only after the owner saves them.
-- Tables: RLS on, service_role only (no DELETE grant except recordings); functions security invoker, service_role only.
begin;

create or replace function public.pro_integration_provider_ids() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['hacienda','tilopay','esign','google','microsoft','quickbooks','ai','transcription']::text[] $$;
do $$declare t text;begin foreach t in array array['pro_integration_connections','pro_integration_requests','pro_integration_webhooks'] loop
 execute format('alter table public.%I drop constraint if exists %I',t,t||'_provider_check');
 execute format('alter table public.%I add constraint %I check(provider = any(public.pro_integration_provider_ids()))',t,t||'_provider_check');
end loop;end $$;

create or replace function public.pro_ai_features() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['quote_line','contract_clause','daily_log','client_update','takeoff','expense_receipt','expense_voice','meeting','transcribe_voice','transcribe_meeting']::text[] $$;

create table if not exists public.pro_ai_settings(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 consent boolean not null default false,
 consent_version text check(consent_version is null or consent_version~'^\d{4}-\d{2}-\d{2}$'),
 consent_at timestamptz,
 monthly_limit integer not null default 100 check(monthly_limit between 1 and 5000),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 check(not consent or (consent_version is not null and consent_at is not null))
);
create table if not exists public.pro_ai_settings_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 action text not null check(action in('set_consent','set_limit')),detail jsonb not null check(octet_length(detail::text)<=1024),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_ai_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);
create table if not exists public.pro_ai_usage(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 month date not null check(extract(day from month)=1),
 used integer not null default 0 check(used>=0),
 by_feature jsonb not null default '{}' check(jsonb_typeof(by_feature)='object'),
 updated_at timestamptz not null default now(),primary key(owner_id,month)
);
create table if not exists public.pro_ai_suggestions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,action_id uuid not null,
 feature text not null check(feature=any(public.pro_ai_features())),
 provider text not null check(provider in('ai','transcription')),
 mode text not null check(mode in('mock','sandbox','production')),
 model text not null check(length(model) between 1 and 80),
 work_id text check(work_id is null or length(work_id) between 1 and 160),
 source jsonb not null default '{}' check(jsonb_typeof(source)='object' and octet_length(source::text)<=2048),
 units integer not null check(units between 1 and 3),
 status text not null default 'pending' check(status in('pending','ready','failed')),
 output jsonb check(output is null or (jsonb_typeof(output)='object' and octet_length(output::text)<=131072)),
 error text check(error is null or length(error) between 1 and 120),
 review text check(review is null or review in('used','discarded')),
 reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 primary key(owner_id,id),unique(owner_id,action_id),
 check((status='ready')=(output is not null)),check((status='failed')=(error is not null)),check((status='pending')=(finished_at is null)),
 check((review is null)=(reviewed_at is null)),check(review is null or status='ready')
);
create index if not exists pro_ai_suggestions_recent on public.pro_ai_suggestions(owner_id,created_at desc);

create table if not exists public.pro_ai_recordings(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,work_id text not null check(length(work_id) between 1 and 160),
 title text not null check(length(btrim(title)) between 1 and 160),
 consent_all_parties boolean not null check(consent_all_parties),
 consent_text text not null check(length(consent_text) between 20 and 1000),
 consent_at timestamptz not null default clock_timestamp(),
 mime text not null check(mime in('audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac','audio/x-m4a')),
 size_bytes integer not null check(size_bytes between 1 and 8388608),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 content bytea not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(id),
 check(octet_length(content)=size_bytes and sha256=encode(sha256(content),'hex')),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_ai_recordings_work on public.pro_ai_recordings(owner_id,work_id,created_at desc);
create table if not exists public.pro_ai_meeting_notes(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,work_id text not null,
 recording_id uuid,suggestion_id uuid,
 title text not null check(length(btrim(title)) between 1 and 160),
 transcript text not null default '' check(length(transcript)<=60000),
 summary text not null check(length(btrim(summary)) between 1 and 4000),
 action_items jsonb not null default '[]' check(jsonb_typeof(action_items)='array' and jsonb_array_length(action_items)<=20),
 decisions jsonb not null default '[]' check(jsonb_typeof(decisions)='array' and jsonb_array_length(decisions)<=20),
 ai_generated boolean not null default true,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_ai_meeting_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,meeting_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','link_task')),revision integer not null,snapshot jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);

-- ---------------------------------------------------------------- guards
create or replace function public.pro_ai_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'AI history, receipts and recordings are immutable' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['pro_ai_settings_history','pro_ai_actions','pro_ai_meeting_history','pro_ai_recordings'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.pro_ai_immutable()',t||'_immutable',t);
end loop;end $$;
create or replace function public.pro_ai_suggestion_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.owner_id,new.id,new.action_id,new.feature,new.provider,new.mode,new.model,new.work_id,new.source,new.units,new.created_at) is distinct from
    (old.owner_id,old.id,old.action_id,old.feature,old.provider,old.mode,old.model,old.work_id,old.source,old.units,old.created_at) then
  raise exception 'Suggestion identity is immutable' using errcode='23514';end if;
 if old.status<>'pending' and (new.status,new.output,new.error,new.finished_at) is distinct from (old.status,old.output,old.error,old.finished_at) then
  raise exception 'A finished suggestion is immutable' using errcode='23514';end if;
 if old.review is not null and (new.review,new.reviewed_at) is distinct from (old.review,old.reviewed_at) then
  raise exception 'The review outcome is recorded once' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_ai_suggestion_guard on public.pro_ai_suggestions;
create trigger pro_ai_suggestion_guard before update on public.pro_ai_suggestions for each row execute function public.pro_ai_suggestion_guard();

-- ---------------------------------------------------------------- settings, consent, usage
create or replace function public.pro_ai_month() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select date_trunc('month',now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_ai_settings_json(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_ai_settings;u public.pro_ai_usage;lim integer;
begin
 select * into s from public.pro_ai_settings where owner_id=p_actor;
 select * into u from public.pro_ai_usage where owner_id=p_actor and month=public.pro_ai_month();
 lim:=coalesce(s.monthly_limit,100);
 return jsonb_build_object('consent',coalesce(s.consent,false),'consentVersion',s.consent_version,'consentAt',s.consent_at,'monthlyLimit',lim,'revision',coalesce(s.revision,0),
  'usage',jsonb_build_object('month',to_char(public.pro_ai_month(),'YYYY-MM'),'used',coalesce(u.used,0),'remaining',greatest(lim-coalesce(u.used,0),0),'byFeature',coalesce(u.by_feature,'{}'::jsonb)));
end $$;
create or replace function public.pro_ai_settings_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return public.pro_ai_settings_json(p_actor)||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'detail',h.detail,'at',h.at) order by h.at desc) from (select * from public.pro_ai_settings_history where owner_id=p_actor order by at desc limit 10) h),'[]'));
end $$;
create or replace function public.pro_ai_settings_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_ai_actions;s public.pro_ai_settings;rev integer;lim integer;result jsonb;detail jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or act not in('set_consent','set_limit') or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid AI settings action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ai:'||p_actor::text,0));
 select * into receipt from public.pro_ai_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 select * into s from public.pro_ai_settings where owner_id=p_actor for update;
 rev:=(p_input->>'revision')::integer;
 if rev is distinct from coalesce(s.revision,0) then raise exception 'AI settings changed' using errcode='40001';end if;
 if act='set_consent' then
  if jsonb_typeof(p_input->'consent')<>'boolean' or coalesce(p_input->>'consentVersion','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid consent' using errcode='22023';end if;
  insert into public.pro_ai_settings(owner_id,consent,consent_version,consent_at,revision) values(p_actor,(p_input->>'consent')::boolean,p_input->>'consentVersion',case when (p_input->>'consent')::boolean then now() end,1)
  on conflict(owner_id) do update set consent=excluded.consent,consent_version=excluded.consent_version,consent_at=excluded.consent_at,revision=pro_ai_settings.revision+1,updated_at=now();
  detail:=jsonb_build_object('consent',(p_input->>'consent')::boolean,'version',p_input->>'consentVersion');
 else
  if jsonb_typeof(p_input->'monthlyLimit')<>'number' then raise exception 'Invalid limit' using errcode='22023';end if;
  lim:=(p_input->>'monthlyLimit')::integer;
  if lim is null or lim not between 1 and 5000 then raise exception 'Invalid limit' using errcode='22023';end if;
  insert into public.pro_ai_settings(owner_id,monthly_limit,revision) values(p_actor,lim,1)
  on conflict(owner_id) do update set monthly_limit=excluded.monthly_limit,revision=pro_ai_settings.revision+1,updated_at=now();
  detail:=jsonb_build_object('from',coalesce(s.monthly_limit,100),'to',lim);
 end if;
 insert into public.pro_ai_settings_history(owner_id,action_id,action,detail) values(p_actor,aid,act,detail);
 result:=public.pro_ai_settings_json(p_actor);
 insert into public.pro_ai_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.pro_ai_suggestion_json(r public.pro_ai_suggestions) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'feature',r.feature,'provider',r.provider,'mode',r.mode,'model',r.model,'workId',r.work_id,'status',r.status,'output',r.output,'error',r.error,'review',r.review,'createdAt',r.created_at) $$;
-- Reserve usage and register a pending suggestion. Same actionId = the same suggestion (no second unit).
create or replace function public.pro_ai_begin(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;sid uuid;r public.pro_ai_suggestions;s public.pro_ai_settings;u public.pro_ai_usage;n integer;feat text:=p_input->>'feature';wid text:=nullif(p_input->>'workId','');
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or not coalesce(feat=any(public.pro_ai_features()),false) or p_input->>'provider' not in('ai','transcription') or p_input->>'mode' not in('mock','sandbox','production')
  or jsonb_typeof(p_input->'units')<>'number' or jsonb_typeof(coalesce(p_input->'source','{}'))<>'object' then raise exception 'Invalid AI request' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;sid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null or sid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 n:=(p_input->>'units')::integer;if n not between 1 and 3 then raise exception 'Invalid units' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ai:'||p_actor::text,0));
 select * into r from public.pro_ai_suggestions where owner_id=p_actor and action_id=aid;
 if found then
  if r.feature<>feat or r.work_id is distinct from wid or r.provider<>p_input->>'provider' then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return public.pro_ai_suggestion_json(r)||jsonb_build_object('duplicate',true);
 end if;
 select * into s from public.pro_ai_settings where owner_id=p_actor;
 if not coalesce(s.consent,false) then raise exception 'AI data-processing consent is off' using errcode='42501',hint='pro_ai_consent_required';end if;
 if wid is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Unknown work' using errcode='P0002';end if;
 insert into public.pro_ai_usage(owner_id,month) values(p_actor,public.pro_ai_month()) on conflict do nothing;
 select * into u from public.pro_ai_usage where owner_id=p_actor and month=public.pro_ai_month() for update;
 if u.used+n>s.monthly_limit then raise exception 'Monthly AI usage limit reached' using errcode='54000',hint='pro_ai_cap_reached';end if;
 update public.pro_ai_usage set used=used+n,by_feature=jsonb_set(by_feature,array[feat],to_jsonb(coalesce((by_feature->>feat)::integer,0)+n)),updated_at=now() where owner_id=p_actor and month=u.month;
 insert into public.pro_ai_suggestions(owner_id,id,action_id,feature,provider,mode,model,work_id,source,units)
 values(p_actor,sid,aid,feat,p_input->>'provider',p_input->>'mode',left(coalesce(nullif(p_input->>'model',''),'unknown'),80),wid,coalesce(p_input->'source','{}'),n) returning * into r;
 return public.pro_ai_suggestion_json(r)||jsonb_build_object('duplicate',false);
end $$;
create or replace function public.pro_ai_finish(p_actor uuid,p_id uuid,p_ok boolean,p_output jsonb,p_error text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_ai_suggestions;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_ai_suggestions where owner_id=p_actor and id=p_id for update;
 if not found then raise exception 'Unknown suggestion' using errcode='P0002';end if;
 if r.status<>'pending' then return public.pro_ai_suggestion_json(r);end if;
 if p_ok and (p_output is null or jsonb_typeof(p_output)<>'object') then raise exception 'Invalid output' using errcode='22023';end if;
 update public.pro_ai_suggestions set status=case when p_ok then 'ready' else 'failed' end,output=case when p_ok then p_output end,
  error=case when p_ok then null else left(coalesce(nullif(p_error,''),'provider_failed'),120) end,finished_at=clock_timestamp()
  where owner_id=p_actor and id=p_id returning * into r;
 return public.pro_ai_suggestion_json(r);
end $$;
create or replace function public.pro_ai_review(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_ai_suggestions;sid uuid;outcome text:=p_input->>'outcome';
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 begin sid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid id' using errcode='22023';end;
 if outcome not in('used','discarded') then raise exception 'Invalid outcome' using errcode='22023';end if;
 select * into r from public.pro_ai_suggestions where owner_id=p_actor and id=sid for update;
 if not found then raise exception 'Unknown suggestion' using errcode='P0002';end if;
 if r.status<>'ready' then raise exception 'Suggestion not ready' using errcode='22023';end if;
 if r.review is not null then if r.review<>outcome then raise exception 'Already reviewed' using errcode='22023';end if;return public.pro_ai_suggestion_json(r);end if;
 update public.pro_ai_suggestions set review=outcome,reviewed_at=clock_timestamp() where owner_id=p_actor and id=sid returning * into r;
 return public.pro_ai_suggestion_json(r);
end $$;
create or replace function public.pro_ai_suggestion_read(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_ai_suggestions;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_ai_suggestions where owner_id=p_actor and id=p_id;
 if not found then raise exception 'Unknown suggestion' using errcode='P0002';end if;
 return public.pro_ai_suggestion_json(r);
end $$;
-- Minimal job data for prompts (no contact details: only the customer's first name).
create or replace function public.pro_ai_job_context(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then raise exception 'Unknown work' using errcode='P0002';end if;
 return jsonb_build_object('service',coalesce(w.service,''),'stage',coalesce(w.stage,''),'start',nullif(w.start,''),'end',nullif(w."end",''),
  'clientFirstName',coalesce(split_part(btrim(coalesce(w.client,'')),' ',1),''),
  'recentLogs',coalesce((select jsonb_agg(left(to_char(l.log_date,'YYYY-MM-DD')||' · '||l.title||': '||l.summary,400) order by l.log_date desc) from (select * from public.pro_daily_logs where owner_id=p_actor and work_id=p_work and not archived order by log_date desc,id limit 5) l),'[]'),
  'openTasks',coalesce((select jsonb_agg(left(t.title||coalesce(' (vence '||to_char(t.due_date,'YYYY-MM-DD')||')',''),200) order by t.due_date nulls last) from (select * from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and status='open' and not archived order by due_date nulls last,id limit 10) t),'[]'),
  'recentUpdates',coalesce((select jsonb_agg(left(u.text,400) order by u.created_at desc) from (select * from public.pro_work_updates where owner_id=p_actor and work_id=p_work order by created_at desc limit 3) u),'[]'));
end $$;

-- ---------------------------------------------------------------- meeting recordings and notes
create or replace function public.pro_ai_recording_json(r public.pro_ai_recordings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'workId',r.work_id,'title',r.title,'mime',r.mime,'sizeBytes',r.size_bytes,'sha256',r.sha256,'consentAllParties',r.consent_all_parties,'consentAt',r.consent_at,'createdAt',r.created_at) $$;
create or replace function public.pro_ai_recording_create(p_actor uuid,p_input jsonb,p_content bytea) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;wid text:=p_input->>'workId';r public.pro_ai_recordings;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 begin rid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid id' using errcode='22023';end;
 if rid is null or p_content is null then raise exception 'Invalid recording' using errcode='22023';end if;
 if (p_input->>'consentAllParties') is distinct from 'true' or length(coalesce(p_input->>'consentText',''))<20 then raise exception 'All parties must consent' using errcode='22023',hint='pro_ai_meeting_consent';end if;
 if not coalesce((select consent from public.pro_ai_settings where owner_id=p_actor),false) then raise exception 'AI data-processing consent is off' using errcode='42501',hint='pro_ai_consent_required';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Unknown work' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ai-recording:'||p_actor::text,0));
 select * into r from public.pro_ai_recordings where owner_id=p_actor and id=rid;
 if found then if r.sha256<>encode(sha256(p_content),'hex') or r.work_id<>wid then raise exception 'Recording id reused' using errcode='22023';end if;return public.pro_ai_recording_json(r);end if;
 if exists(select 1 from public.pro_ai_recordings where id=rid) then raise exception 'Recording id reused' using errcode='22023';end if;
 if (select count(*) from public.pro_ai_recordings where owner_id=p_actor and work_id=wid)>=100 then raise exception 'Too many recordings' using errcode='54000';end if;
 insert into public.pro_ai_recordings(owner_id,id,work_id,title,consent_all_parties,consent_text,mime,size_bytes,sha256,content)
 values(p_actor,rid,wid,left(btrim(coalesce(nullif(p_input->>'title',''),'Reunión')),160),true,left(p_input->>'consentText',1000),p_input->>'mime',octet_length(p_content),encode(sha256(p_content),'hex'),p_content) returning * into r;
 return public.pro_ai_recording_json(r);
end $$;
create or replace function public.pro_ai_meeting_json(m public.pro_ai_meeting_notes) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'workId',m.work_id,'recordingId',m.recording_id,'suggestionId',m.suggestion_id,'title',m.title,'transcript',m.transcript,'summary',m.summary,
  'actionItems',m.action_items,'decisions',m.decisions,'aiGenerated',m.ai_generated,'revision',m.revision,'createdAt',m.created_at,'updatedAt',m.updated_at) $$;
create or replace function public.pro_ai_meetings_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Unknown work' using errcode='P0002';end if;
 return jsonb_build_object('workId',p_work,
  'recordings',coalesce((select jsonb_agg(public.pro_ai_recording_json(r) order by r.created_at desc) from public.pro_ai_recordings r where r.owner_id=p_actor and r.work_id=p_work),'[]'),
  'meetings',coalesce((select jsonb_agg(public.pro_ai_meeting_json(m) order by m.created_at desc) from public.pro_ai_meeting_notes m where m.owner_id=p_actor and m.work_id=p_work),'[]'));
end $$;
create or replace function public.pro_ai_recording_audio(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_ai_recordings;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_ai_recordings where owner_id=p_actor and id=p_id;
 if not found then raise exception 'Unknown recording' using errcode='P0002';end if;
 return public.pro_ai_recording_json(r)||jsonb_build_object('base64',encode(r.content,'base64'));
end $$;
create or replace function public.pro_ai_recording_delete(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 delete from public.pro_ai_recordings where owner_id=p_actor and id=p_id;
 if not found then raise exception 'Unknown recording' using errcode='P0002';end if;
 return jsonb_build_object('deleted',p_id);
end $$;
create or replace function public.pro_ai_meeting_items(p_items jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare item jsonb;out jsonb:='[]';
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20 then raise exception 'Invalid action items' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'id','')!~'^[0-9a-f-]{36}$' or length(btrim(coalesce(item->>'text','')))not between 1 and 160
   or (item->'dueDate' is not null and jsonb_typeof(item->'dueDate')<>'null' and coalesce(item->>'dueDate','')!~'^\d{4}-\d{2}-\d{2}$')
   or (item->'taskId' is not null and jsonb_typeof(item->'taskId')<>'null' and coalesce(item->>'taskId','')!~'^[0-9a-f-]{36}$') then raise exception 'Invalid action item' using errcode='22023';end if;
  out:=out||jsonb_build_array(jsonb_build_object('id',item->>'id','text',btrim(item->>'text'),'dueDate',nullif(item->>'dueDate',''),'taskId',nullif(item->>'taskId','')));
 end loop;
 return out;
end $$;
create or replace function public.pro_ai_meeting_decisions(p_value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>20 or exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 300) then raise exception 'Invalid decisions' using errcode='22023';end if;
 return p_value;
end $$;
create or replace function public.pro_ai_meeting_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;mid uuid;receipt public.pro_ai_actions;m public.pro_ai_meeting_notes;sg public.pro_ai_suggestions;items jsonb;dec jsonb;result jsonb;item jsonb;tid uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or act not in('create','update','link_task') then raise exception 'Invalid meeting action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;mid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid id' using errcode='22023';end;
 if aid is null or mid is null then raise exception 'Invalid id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ai-meeting:'||p_actor::text,0));
 select * into receipt from public.pro_ai_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 if act='create' then
  if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_input->>'workId') then raise exception 'Unknown work' using errcode='P0002';end if;
  if nullif(p_input->>'suggestionId','') is not null then
   select * into sg from public.pro_ai_suggestions where owner_id=p_actor and id=(p_input->>'suggestionId')::uuid;
   if not found or sg.feature<>'meeting' or sg.status<>'ready' or sg.work_id is distinct from p_input->>'workId' then raise exception 'Unknown suggestion' using errcode='P0002';end if;
  end if;
  if nullif(p_input->>'recordingId','') is not null and not exists(select 1 from public.pro_ai_recordings where owner_id=p_actor and id=(p_input->>'recordingId')::uuid and work_id=p_input->>'workId') then raise exception 'Unknown recording' using errcode='P0002';end if;
  if exists(select 1 from public.pro_ai_meeting_notes where owner_id=p_actor and id=mid) then raise exception 'Meeting exists' using errcode='23505';end if;
  items:=public.pro_ai_meeting_items(coalesce(p_input->'actionItems','[]'));dec:=public.pro_ai_meeting_decisions(coalesce(p_input->'decisions','[]'));
  insert into public.pro_ai_meeting_notes(owner_id,id,work_id,recording_id,suggestion_id,title,transcript,summary,action_items,decisions,ai_generated)
  values(p_actor,mid,p_input->>'workId',nullif(p_input->>'recordingId','')::uuid,nullif(p_input->>'suggestionId','')::uuid,left(btrim(coalesce(p_input->>'title','')),160),coalesce(p_input->>'transcript',''),btrim(coalesce(p_input->>'summary','')),items,dec,nullif(p_input->>'suggestionId','') is not null) returning * into m;
 else
  select * into m from public.pro_ai_meeting_notes where owner_id=p_actor and id=mid for update;
  if not found then raise exception 'Unknown meeting' using errcode='P0002';end if;
  if jsonb_typeof(p_input->'revision')<>'number' or (p_input->>'revision')::integer<>m.revision then raise exception 'Meeting changed' using errcode='40001';end if;
  if act='update' then
   items:=public.pro_ai_meeting_items(coalesce(p_input->'actionItems','[]'));
   update public.pro_ai_meeting_notes set title=left(btrim(coalesce(p_input->>'title','')),160),transcript=coalesce(p_input->>'transcript',''),summary=btrim(coalesce(p_input->>'summary','')),
    action_items=items,decisions=public.pro_ai_meeting_decisions(coalesce(p_input->'decisions',decisions)),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=mid returning * into m;
  else
   begin tid:=(p_input->>'taskId')::uuid;exception when others then raise exception 'Invalid task' using errcode='22023';end;
   if not exists(select 1 from public.pro_work_tasks where owner_id=p_actor and work_id=m.work_id and id=tid) then raise exception 'Unknown task' using errcode='P0002';end if;
   if not exists(select 1 from jsonb_array_elements(m.action_items) x where x->>'id'=p_input->>'itemId') then raise exception 'Unknown item' using errcode='P0002';end if;
   select coalesce(jsonb_agg(case when x->>'id'=p_input->>'itemId' then x||jsonb_build_object('taskId',tid) else x end),'[]') into items from jsonb_array_elements(m.action_items) x;
   update public.pro_ai_meeting_notes set action_items=items,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=mid returning * into m;
  end if;
 end if;
 result:=public.pro_ai_meeting_json(m);
 insert into public.pro_ai_meeting_history(owner_id,meeting_id,action_id,action,revision,snapshot) values(p_actor,mid,aid,act,m.revision,result);
 insert into public.pro_ai_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- posture
do $$declare n text;begin foreach n in array array['pro_ai_settings','pro_ai_settings_history','pro_ai_actions','pro_ai_usage','pro_ai_suggestions','pro_ai_recordings','pro_ai_meeting_notes','pro_ai_meeting_history'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
grant delete on public.pro_ai_recordings to service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro\_ai\_%' or p.proname='pro_integration_provider_ids') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_ai_immutable(%' and f::text not like 'pro_ai_suggestion_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
