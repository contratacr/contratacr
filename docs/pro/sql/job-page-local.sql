-- LOCAL PRO ONLY. Round 8 (2026-11-15): the job as its own page and an editable job overview.
-- 1) pro_work_sidebar_read: right column of the job page (status, location, customer, collaborators,
--    upcoming meetings and key dates, tags) in one read; owner (or a company member working as the
--    owner through the role gate) only.
-- 2) Overview layout per person: the owner, or each company member separately (p_person), keeps an
--    ordered list of widgets and the hidden ones. CAS by revision (40001), idempotent by actionId,
--    immutable history. «Restablecer» stores the default (history keeps the previous layout).
-- 3) pro_role_route_capability: saving one's own overview layout is a personal preference ('read'),
--    so a «Solo lectura» member may arrange their own overview; every other route keeps its class.
--    Subcontractor management (`subcontractors`) is team management.
-- Patterns: RLS on, service_role-only grants, security invoker, America/Costa_Rica dates.
begin;
create table if not exists public.pro_overview_layouts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 person_id uuid not null,
 layout jsonb not null,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id));
create table if not exists public.pro_overview_layout_history(
 owner_id uuid not null,person_id uuid not null,action_id uuid not null,action text not null check(action in('save','reset')),
 before_layout jsonb,after_layout jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,action_id));
create table if not exists public.pro_overview_layout_actions(
 owner_id uuid not null,person_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,action_id));

-- The fixed widget catalogue of the job overview (work-overview.tsx).
create or replace function public.pro_overview_widgets() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['client','next','schedule','finance','activity','open']::text[]
$$;
create or replace function public.pro_overview_default_layout() returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('order',to_jsonb(public.pro_overview_widgets()),'hidden','[]'::jsonb)
$$;
-- The person must be the owner or an active member of the owner's company.
create or replace function public.pro_overview_person_ok(p_owner uuid,p_person uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(public.pro_private_work_tools_enabled(p_owner),false) and p_person is not null and public.pro_role_of(p_person,p_owner) is not null
$$;
create or replace function public.pro_overview_layout_read(p_actor uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare row public.pro_overview_layouts;
begin
 if not public.pro_overview_person_ok(p_actor,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into row from public.pro_overview_layouts where owner_id=p_actor and person_id=p_person;
 if not found then return jsonb_build_object('layout',public.pro_overview_default_layout(),'revision',0,'custom',false,'widgets',to_jsonb(public.pro_overview_widgets()));end if;
 return jsonb_build_object('layout',row.layout,'revision',row.revision,'custom',row.layout<>public.pro_overview_default_layout(),'widgets',to_jsonb(public.pro_overview_widgets()));
end $$;
create or replace function public.pro_overview_layout_save(p_actor uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;rev integer;keys text[];hash text:=md5(p_input::text);prior public.pro_overview_layout_actions;
 cur public.pro_overview_layouts;before_value jsonb;next_layout jsonb;ord text[];hid text[];answer jsonb;w text[]:=public.pro_overview_widgets();
begin
 if not public.pro_overview_person_ok(p_actor,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid layout' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act='save' and keys is distinct from array['action','actionId','layout','revision'] or act='reset' and keys is distinct from array['action','actionId','revision'] or act is null or act not in('save','reset') then raise exception 'Invalid layout' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid layout' using errcode='22023';end;
 if aid is null or rev is null or rev<0 then raise exception 'Invalid layout' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-overview-layout:'||p_actor::text||':'||p_person::text,0));
 select * into prior from public.pro_overview_layout_actions where owner_id=p_actor and person_id=p_person and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into cur from public.pro_overview_layouts where owner_id=p_actor and person_id=p_person for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Layout changed' using errcode='40001';end if;
 before_value:=cur.layout;
 if act='reset' then next_layout:=public.pro_overview_default_layout();
 else
  if jsonb_typeof(p_input->'layout') is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_input->'layout') k) is distinct from array['hidden','order']
   or jsonb_typeof(p_input->'layout'->'order') is distinct from 'array' or jsonb_typeof(p_input->'layout'->'hidden') is distinct from 'array' then raise exception 'Invalid layout' using errcode='22023';end if;
  select array_agg(value order by n) into ord from jsonb_array_elements_text(p_input->'layout'->'order') with ordinality e(value,n);
  select coalesce(array_agg(value order by n),'{}') into hid from jsonb_array_elements_text(p_input->'layout'->'hidden') with ordinality e(value,n);
  -- order: every widget exactly once; hidden: a subset without duplicates; at least one widget stays visible.
  if ord is null or cardinality(ord)<>cardinality(w) or not(ord @> w and w @> ord) or (select count(distinct x) from unnest(ord) x)<>cardinality(w)
   or not(w @> hid) or (select count(distinct x) from unnest(hid) x)<>cardinality(hid) or cardinality(hid)>=cardinality(w) then raise exception 'Invalid layout' using errcode='22023';end if;
  next_layout:=jsonb_build_object('order',to_jsonb(ord),'hidden',to_jsonb((select coalesce(array_agg(x order by array_position(ord,x)),'{}') from unnest(hid) x)));
 end if;
 insert into public.pro_overview_layouts(owner_id,person_id,layout,revision,updated_at) values(p_actor,p_person,next_layout,1,clock_timestamp())
  on conflict(owner_id,person_id) do update set layout=excluded.layout,revision=public.pro_overview_layouts.revision+1,updated_at=clock_timestamp()
  returning * into cur;
 insert into public.pro_overview_layout_history(owner_id,person_id,action_id,action,before_layout,after_layout) values(p_actor,p_person,aid,act,before_value,next_layout);
 answer:=jsonb_build_object('layout',cur.layout,'revision',cur.revision,'custom',cur.layout<>public.pro_overview_default_layout(),'widgets',to_jsonb(w));
 insert into public.pro_overview_layout_actions(owner_id,person_id,action_id,input_hash,result) values(p_actor,p_person,aid,hash,answer);
 return answer;
end $$;

-- Right column of the job page.
create or replace function public.pro_work_sidebar_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;d public.pro_project_details;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then return null;end if;
 select * into d from public.pro_project_details where owner_id=p_actor and work_id=p_work;
 return jsonb_build_object(
  'workId',w.id,
  'status',jsonb_build_object('stage',w.stage,'cancelled',coalesce(w.cancelled,false),'start',nullif(w.start,''),'end',nullif(w."end",''),
    'phase',(public.pro_work_header_facts(p_actor,p_work))->>'phase'),
  'location',jsonb_build_object('address',d.address,
    'visit',(select nullif(btrim(r.location_text),'') from public.pro_appointment_requests r where r.owner_id=p_actor and r.work_id=p_work and nullif(btrim(r.location_text),'') is not null order by r.created_at desc limit 1)),
  'customer',jsonb_build_object('name',coalesce(nullif(btrim(w.client),''),(select nullif(btrim(r.client_name),'') from public.pro_appointment_requests r where r.owner_id=p_actor and r.work_id=p_work order by r.created_at limit 1)),
    'linked',exists(select 1 from public.pro_appointment_requests r where r.owner_id=p_actor and r.work_id=p_work and r.client_user_id is not null and r.status in('confirmed','completed'))),
  'collaborators',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',name,'role',role) order by ord,name) from (
     select 'job' kind,coalesce(nullif(btrim(g.member_name),''),public.pro_team_name(g.member_user_id)) name,g.role role,1 ord from public.pro_team_grants g where g.owner_id=p_actor and g.work_id=p_work and g.active
     union all
     select 'subcontractor',coalesce(nullif(btrim(s.member_name),''),s.vendor_name),'subcontractor',2 from public.pro_subcontractor_jobs j join public.pro_subcontractor_access s on s.owner_id=j.owner_id and s.id=j.access_id
      where j.owner_id=p_actor and j.work_id=p_work and j.active and s.status='active'
   ) c),'[]'::jsonb),
  'meetings',coalesce((select jsonb_agg(m order by m->>'at') from (
     select jsonb_build_object('kind','appointment','id',r.id,'title',r.service,'at',coalesce(r.proposed_start,r.requested_start),'status',r.status) m
      from public.pro_appointment_requests r where r.owner_id=p_actor and r.work_id=p_work and r.status in('requested','proposed','confirmed')
       and coalesce(r.proposed_start,r.requested_start)>=clock_timestamp()-interval '2 hours'
     union all
     select jsonb_build_object('kind','milestone','id',m.id,'title',m.title,'at',m.milestone_date::text,'status','planned')
      from public.pro_work_schedule_milestones m where m.owner_id=p_actor and m.work_id=p_work and not m.archived and m.milestone_date>=today
     order by 1 limit 6) x),'[]'::jsonb),
  'tags',coalesce((select jsonb_agg(t.name order by l.position,t.name) from public.pro_project_tag_links l join public.pro_project_tags t on t.owner_id=l.owner_id and t.id=l.tag_id where l.owner_id=p_actor and l.work_id=p_work),'[]'::jsonb),
  'code',d.code,'color',d.color);
end $$;

-- Route capability for the role gate (same as team-roles-local.sql, plus the Round 8 routes).
create or replace function public.pro_role_route_capability(p_method text,p_path text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare seg text:=split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1);
begin
 if upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then return 'read';end if;
 -- Round 8: one's own overview arrangement is a personal preference, not a change to company data.
 if seg='overview-layout' then return 'read';end if;
 if seg in('team','team-roles','subcontractors') then return 'team.manage';end if;
 if seg ~ '^(integrations|connectors|oauth|site|site-public|marketing|marketing-confirm|ads-tracking|social|social-content|promotions|invoice-document-settings|invoice-issuer|accounting|accounting-export|einvoice|einvoice-file)$' then return 'settings.write';end if;
 if seg ~ '^(invoice-|payment-|pay$|client-operations|client-balance|client-statement|client-finances|credits-retainers|work-billing|work-budget|work-costs|expenses|expense-receipts|purchase-order|online-payments)' then return 'finance.write';end if;
 if seg ~ '^(lead-|request-pipeline|request-followups|manual-lead-)' then return 'lead.write';end if;
 if seg ~ '^(private-estimate|quote|quotes|contract|esign|appointment-|reservations|bids|bid-portal-links|work-changes|selections|allowances|project-quote-context|visit-preparation|work-client-invitations|client-dashboard|client-pending|client-fiscal|request-quotes|direct-project|workspace|projects|work-header|identity-lookup)' then return 'sales.write';end if;
 if seg ~ '^(catalog|company-|service-packages|discount-presets|task-templates|schedule-templates|ai|ai-meetings)' then return 'company.write';end if;
 return 'work.write';
end $$;

create or replace function public.pro_overview_layout_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Overview layout history is immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_overview_layouts','pro_overview_layout_history','pro_overview_layout_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_overview_layout_history','pro_overview_layout_actions'] loop
  execute format('drop trigger if exists pro_overview_layout_immutable on public.%I',t);execute format('create trigger pro_overview_layout_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_overview_layout_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_overview_widgets','pro_overview_default_layout','pro_overview_person_ok','pro_overview_layout_read','pro_overview_layout_save','pro_work_sidebar_read','pro_role_route_capability','pro_overview_layout_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
