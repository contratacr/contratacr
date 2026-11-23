-- ContrataCR Pro, database part 25 (row 33): presentation of the customer view of a job.
--  * Cover/header (headline, subtitle, accent colour), a video link (https, allow-listed hosts), a weather widget
--    (a Costa Rican province chosen by the professional) and individually hidden documents (contracts, quotes, shared
--    files). Hiding is PRESENTATION only: like hiding a section, it does not revoke any access.
--  * Opening record: the first and last time the linked customer opened the view and how many times.
-- Owner writes use CAS (revision) and idempotent receipts; the customer reader exposes only what the customer may see.
-- PRO_ENABLED stays false in production. Nothing is sent.
begin;
create table if not exists public.pro_client_presentations(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 headline text check(headline is null or length(btrim(headline)) between 1 and 120),
 subtitle text check(subtitle is null or length(btrim(subtitle)) between 1 and 240),
 accent text not null default 'cyan' check(accent in('cyan','navy','green','amber','rose','slate')),
 video_url text check(video_url is null or (length(video_url)<=300 and video_url~'^https://')),
 show_weather boolean not null default false,
 weather_city text check(weather_city is null or weather_city in('san_jose','alajuela','cartago','heredia','guanacaste','puntarenas','limon')),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(owner_id,work_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create table if not exists public.pro_client_hidden_documents(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 kind text not null check(kind in('contract','quote','file')),item_id text not null check(length(item_id) between 1 and 80),
 created_at timestamptz not null default now(),primary key(owner_id,work_id,kind,item_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create table if not exists public.pro_client_dashboard_opens(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,client_user_id uuid not null references public.profiles(id) on delete cascade,
 first_opened_at timestamptz not null default now(),last_opened_at timestamptz not null default now(),open_count integer not null default 1 check(open_count>0),
 primary key(owner_id,work_id,client_user_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create table if not exists public.pro_client_presentation_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default now(),primary key(actor_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_client_presentations','pro_client_hidden_documents','pro_client_dashboard_opens','pro_client_presentation_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;

create or replace function public.pro_client_presentation_json(p public.pro_client_presentations,p_work text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('workId',p_work,'headline',p.headline,'subtitle',p.subtitle,'accent',coalesce(p.accent,'cyan'),'videoUrl',p.video_url,
  'showWeather',coalesce(p.show_weather,false),'weatherCity',p.weather_city,'revision',coalesce(p.revision,0),'updatedAt',p.updated_at) $$;

-- Owner side: settings, hidden documents, the documents the customer can see (read through the customer readers, so the
-- list is exactly what the customer would see) and the opening record.
create or replace function public.pro_client_presentation_read(p_actor uuid,p_work text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.pro_client_presentations;r public.pro_appointment_requests;docs jsonb:='[]'::jsonb;c jsonb;opens jsonb;hidden jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid presentation query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select * into p from public.pro_client_presentations where owner_id=p_actor and work_id=p_work;
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'itemId',item_id) order by kind,item_id),'[]'::jsonb) into hidden from public.pro_client_hidden_documents where owner_id=p_actor and work_id=p_work;
 select * into r from public.pro_appointment_requests where owner_id=p_actor and work_id=p_work and status in('confirmed','completed') limit 1;
 if found then
  begin c:=public.pro_contracts_client_read(r.client_user_id,r.id);
   if coalesce((c->>'visible')::boolean,false) then docs:=docs||coalesce((select jsonb_agg(jsonb_build_object('kind','contract','id',x->>'id','title',coalesce(nullif(x->'content'->>'title',''),x->>'code','')) ) from jsonb_array_elements(c->'contracts') x),'[]'::jsonb);end if;
  exception when others then null;end;
  begin c:=public.pro_client_project_quotes_read(r.client_user_id,r.id);
   docs:=docs||coalesce((select jsonb_agg(jsonb_build_object('kind','quote','id',x->>'publicationId','title',coalesce(x->>'title',''))) from jsonb_array_elements(coalesce(c->'items','[]'::jsonb)) x where x->>'publicationId' is not null),'[]'::jsonb);
  exception when others then null;end;
  begin c:=public.pro_work_file_folders_client_read(r.client_user_id,r.id);
   docs:=docs||coalesce((select jsonb_agg(jsonb_build_object('kind','file','id',f->>'id','title',coalesce(f->>'name',''))) from jsonb_array_elements(coalesce(c->'folders','[]'::jsonb)) fo,jsonb_array_elements(coalesce(fo->'files','[]'::jsonb)) f),'[]'::jsonb);
  exception when others then null;end;
 end if;
 select jsonb_build_object('count',coalesce(sum(open_count),0),'firstAt',min(first_opened_at),'lastAt',max(last_opened_at)) into opens from public.pro_client_dashboard_opens where owner_id=p_actor and work_id=p_work;
 return public.pro_client_presentation_json(p,p_work)||jsonb_build_object('hidden',hidden,'documents',docs,'opens',opens,'linked',r.id is not null);
end $$;

create or replace function public.pro_client_presentation_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;receipt public.pro_client_presentation_actions;wid text;cur integer;p public.pro_client_presentations;answer jsonb;
 hl text;st text;vu text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid presentation' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from(case act when 'save' then array['accent','action','actionId','headline','revision','showWeather','subtitle','videoUrl','weatherCity','workId'] when 'hide' then array['action','actionId','hidden','itemId','kind','workId'] end) then raise exception 'Unexpected presentation fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 wid:=p_input->>'workId';if wid is null or length(wid) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Work unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-client-presentation:'||p_actor::text||':'||wid,0));
 select * into receipt from public.pro_client_presentation_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 if act='save' then
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) then raise exception 'Invalid revision' using errcode='22023';end if;
  hl:=nullif(btrim(coalesce(p_input->>'headline','')),'');st:=nullif(btrim(coalesce(p_input->>'subtitle','')),'');vu:=nullif(btrim(coalesce(p_input->>'videoUrl','')),'');
  if hl is not null and length(hl)>120 or st is not null and length(st)>240 or hl~'[[:cntrl:]]' or st~'[[:cntrl:]]' then raise exception 'Invalid text' using errcode='22023';end if;
  if vu is not null and not(vu~'^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)/[^[:space:][:cntrl:]]{1,250}$') then raise exception 'Invalid video link' using errcode='22023',hint='pro_presentation_video';end if;
  if jsonb_typeof(p_input->'showWeather') is distinct from 'boolean' or p_input->>'accent' not in('cyan','navy','green','amber','rose','slate') then raise exception 'Invalid presentation' using errcode='22023';end if;
  if (p_input->>'showWeather')::boolean and coalesce(p_input->>'weatherCity','') not in('san_jose','alajuela','cartago','heredia','guanacaste','puntarenas','limon') then raise exception 'Choose a province' using errcode='22023',hint='pro_presentation_city';end if;
  select * into p from public.pro_client_presentations where owner_id=p_actor and work_id=wid;
  cur:=coalesce(p.revision,0);if cur<>(p_input->>'revision')::integer then raise exception 'Presentation changed' using errcode='40001';end if;
  insert into public.pro_client_presentations(owner_id,work_id,headline,subtitle,accent,video_url,show_weather,weather_city,revision)
  values(p_actor,wid,hl,st,p_input->>'accent',vu,(p_input->>'showWeather')::boolean,nullif(p_input->>'weatherCity',''),cur+1)
  on conflict(owner_id,work_id) do update set headline=excluded.headline,subtitle=excluded.subtitle,accent=excluded.accent,video_url=excluded.video_url,show_weather=excluded.show_weather,weather_city=excluded.weather_city,revision=excluded.revision,updated_at=now();
  select * into p from public.pro_client_presentations where owner_id=p_actor and work_id=wid;
  answer:=jsonb_build_object('action','save','settings',public.pro_client_presentation_json(p,wid));
 else
  if p_input->>'kind' not in('contract','quote','file') or jsonb_typeof(p_input->'hidden') is distinct from 'boolean' or jsonb_typeof(p_input->'itemId') is distinct from 'string' or length(p_input->>'itemId') not between 1 and 80 then raise exception 'Invalid document' using errcode='22023';end if;
  if (p_input->>'hidden')::boolean then
   insert into public.pro_client_hidden_documents(owner_id,work_id,kind,item_id) values(p_actor,wid,p_input->>'kind',p_input->>'itemId') on conflict do nothing;
  else delete from public.pro_client_hidden_documents where owner_id=p_actor and work_id=wid and kind=p_input->>'kind' and item_id=p_input->>'itemId';end if;
  answer:=jsonb_build_object('action','hide','kind',p_input->>'kind','itemId',p_input->>'itemId','hidden',(p_input->>'hidden')::boolean);
 end if;
 insert into public.pro_client_presentation_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,answer);
 return answer;
end $$;

-- Customer side (also the owner's preview, which runs as the linked customer): the cover, the widgets and which
-- documents are hidden. Same access rule as the other customer readers.
create or replace function public.pro_client_presentation_client(p_actor uuid,p_request uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;p public.pro_client_presentations;h jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid presentation query' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if r.status not in('confirmed','completed') then return jsonb_build_object('visible',false);end if;
 select * into p from public.pro_client_presentations where owner_id=r.owner_id and work_id=r.work_id;
 select jsonb_build_object('contract',coalesce(jsonb_agg(item_id) filter(where kind='contract'),'[]'::jsonb),'quote',coalesce(jsonb_agg(item_id) filter(where kind='quote'),'[]'::jsonb),'file',coalesce(jsonb_agg(item_id) filter(where kind='file'),'[]'::jsonb))
  into h from public.pro_client_hidden_documents where owner_id=r.owner_id and work_id=r.work_id;
 return jsonb_build_object('visible',true,'headline',p.headline,'subtitle',p.subtitle,'accent',coalesce(p.accent,'cyan'),'videoUrl',p.video_url,
  'showWeather',coalesce(p.show_weather,false),'weatherCity',case when coalesce(p.show_weather,false) then p.weather_city end,'hidden',h);
end $$;

-- The real customer opened the view (the route calls it only when the reader is the customer, never for the preview).
create or replace function public.pro_client_presentation_open(p_actor uuid,p_request uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;
begin
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');
 if not found then return;end if;
 insert into public.pro_client_dashboard_opens(owner_id,work_id,client_user_id) values(r.owner_id,r.work_id,p_actor)
 on conflict(owner_id,work_id,client_user_id) do update set last_opened_at=now(),open_count=public.pro_client_dashboard_opens.open_count+1
  where public.pro_client_dashboard_opens.last_opened_at<now()-interval '30 minutes';
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_client_presentation_json','pro_client_presentation_read','pro_client_presentation_mutate','pro_client_presentation_client','pro_client_presentation_open') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
