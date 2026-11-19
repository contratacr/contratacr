-- LOCAL PRO ONLY. Round 7C (2026-11-13): company team roles (Administrador, Gerente, Miembro,
-- Solo lectura) enforced on the server, email invitations as mock drafts (never sent) and lead
-- assignment («Asignado a»).
--
-- Model. The owner (the Pro account) is Administrator implicitly and is never a row here. A company
-- member is a registered account that accepted an invitation code. While a member works «in» the
-- owner's company, every /api/pro request goes through ONE gate (middleware → pro_team_route_authorize)
-- which maps the request to a capability and asks the single helper pro_role_require(); allowed
-- requests run as the owner's workspace, denied writes get 42501 → 403. The matrix lives only in
-- pro_role_allows(). Allowed writes are recorded (append-only) with the member's identity.
-- Per-job collaborators of team-local.sql (viewer/contributor grants) are unchanged.
--
-- Patterns: RLS on, service_role-only grants, security invoker, CAS revision (40001), idempotent
-- actionId receipts, immutable history, America/Costa_Rica dates. No email is sent; the invitation
-- email is stored as a draft for the owner to copy.
begin;

create table if not exists public.pro_company_members(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 member_user_id uuid not null references public.profiles(id) on delete cascade,
 member_name text not null default '' check(length(member_name)<=160),
 member_email text not null default '' check(length(member_email)<=254),
 role text not null check(role in('admin','manager','member','read_only')),
 active boolean not null default true,
 revision integer not null default 1 check(revision>0),
 source_invite_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,member_user_id),check(owner_id<>member_user_id));
create index if not exists pro_company_members_member_idx on public.pro_company_members(member_user_id) where active;

create table if not exists public.pro_company_invites(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 email text not null check(length(email) between 3 and 254 and email=lower(btrim(email))),
 role text not null check(role in('admin','manager','member','read_only')),
 token_sha256 text not null unique check(token_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','accepted','cancelled')),
 revision integer not null default 1 check(revision>0),
 expires_at timestamptz not null,
 -- Mock delivery: the email is only drafted here; nothing is sent.
 delivery text not null default 'draft_not_sent' check(delivery='draft_not_sent'),
 draft_subject text not null check(length(draft_subject) between 1 and 200),
 draft_body text not null check(length(draft_body) between 1 and 4000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id));

create table if not exists public.pro_company_team_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{32}$'),result jsonb not null,
 at timestamptz not null default now(),primary key(actor_id,action_id));

create table if not exists public.pro_company_team_events(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null,actor_name text not null default '',action_id uuid not null,
 action text not null check(action in('invite','cancel_invite','accept','set_role','remove','leave')),
 member_id uuid,invite_id uuid,before_state jsonb,after_state jsonb,at timestamptz not null default now());
create index if not exists pro_company_team_events_owner_idx on public.pro_company_team_events(owner_id,at desc,id desc);

-- Writes a member made in the owner's company (who, what, when). Append-only.
create table if not exists public.pro_company_team_activity(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 member_user_id uuid not null,member_name text not null default '',role text not null,
 capability text not null,method text not null,path text not null check(length(path)<=200),
 at timestamptz not null default now());
create index if not exists pro_company_team_activity_owner_idx on public.pro_company_team_activity(owner_id,at desc);

create table if not exists public.pro_lead_assignments(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('manual','request')),lead_id uuid not null,
 assignee_id uuid references public.profiles(id) on delete set null,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(owner_id,kind,lead_id));
create index if not exists pro_lead_assignments_assignee_idx on public.pro_lead_assignments(owner_id,assignee_id);
create table if not exists public.pro_lead_assignment_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null,lead_id uuid not null,action_id uuid not null,
 before_assignee uuid,after_assignee uuid,revision integer not null,at timestamptz not null default now(),
 primary key(owner_id,action_id));
create table if not exists public.pro_lead_assignment_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id));

-- ── The permission matrix (single source) ──────────────────────────────────────────────────────
create or replace function public.pro_role_allows(p_role text,p_capability text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_role
  when 'admin' then p_capability in('read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage')
  when 'manager' then p_capability in('read','work.write','lead.write','sales.write','finance.write','company.write')
  when 'member' then p_capability in('read','work.write','lead.write')
  when 'read_only' then p_capability='read'
  else false end
$$;
create or replace function public.pro_role_matrix_read() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_object_agg(r,(select jsonb_agg(c order by o) from unnest(array['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage']) with ordinality x(c,o) where public.pro_role_allows(r,c)))
 from unnest(array['admin','manager','member','read_only']) r
$$;

-- Role of p_actor in p_owner's company: the owner is admin; an active member has its row's role.
create or replace function public.pro_role_of(p_actor uuid,p_owner uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_actor is null or p_owner is null then null when p_actor=p_owner then 'admin'
  else (select m.role from public.pro_company_members m join public.profiles p on p.id=m.member_user_id
        where m.owner_id=p_owner and m.member_user_id=p_actor and m.active and not coalesce(p.is_disabled,false)) end
$$;

-- THE helper: raises 42501 unless the actor's role in the owner's company allows the capability.
create or replace function public.pro_role_require(p_actor uuid,p_owner uuid,p_capability text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;
begin
 if p_capability is null or p_capability not in('read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage') then raise exception 'Unknown capability' using errcode='22023';end if;
 r:=public.pro_role_of(p_actor,p_owner);
 if r is null or not public.pro_role_allows(r,p_capability) then raise exception 'Role does not allow %',p_capability using errcode='42501';end if;
 return r;
end $$;

-- Capability of one /api/pro request (method + path). Reads are 'read'; writes by module.
create or replace function public.pro_role_route_capability(p_method text,p_path text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare seg text:=split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1);
begin
 if upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then return 'read';end if;
 if seg in('team','team-roles') then return 'team.manage';end if;
 if seg ~ '^(integrations|connectors|oauth|site|site-public|marketing|marketing-confirm|ads-tracking|social|social-content|promotions|invoice-document-settings|invoice-issuer|accounting|accounting-export|einvoice|einvoice-file)$' then return 'settings.write';end if;
 if seg ~ '^(invoice-|payment-|pay$|client-operations|client-balance|client-statement|client-finances|credits-retainers|work-billing|work-budget|work-costs|expenses|expense-receipts|purchase-order|online-payments)' then return 'finance.write';end if;
 if seg ~ '^(lead-|request-pipeline|request-followups|manual-lead-)' then return 'lead.write';end if;
 if seg ~ '^(private-estimate|quote|quotes|contract|esign|appointment-|reservations|bids|bid-portal-links|work-changes|selections|allowances|project-quote-context|visit-preparation|work-client-invitations|client-dashboard|client-pending|client-fiscal|request-quotes|direct-project|workspace|projects|work-header|identity-lookup)' then return 'sales.write';end if;
 if seg ~ '^(catalog|company-|service-packages|discount-presets|task-templates|schedule-templates|ai|ai-meetings)' then return 'company.write';end if;
 return 'work.write';
end $$;

-- Workspace a member may enter (null when not an active member or the owner lost Pro).
create or replace function public.pro_team_workspace_resolve(p_member uuid,p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;
begin
 if p_member is null or p_owner is null or p_member=p_owner then return null;end if;
 r:=public.pro_role_of(p_member,p_owner);
 if r is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then return null;end if;
 return jsonb_build_object('ownerId',p_owner,'ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_owner),public.pro_team_name(p_owner)),
  'role',r,'capabilities',(select jsonb_agg(c) from unnest(array['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage']) c where public.pro_role_allows(r,c)));
end $$;

-- The gate called once per /api/pro request of a member working in another company.
create or replace function public.pro_team_route_authorize(p_member uuid,p_owner uuid,p_method text,p_path text) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare ws jsonb;cap text;
begin
 if p_path is null or length(p_path)>200 or p_path !~ '^/api/pro(/|$)' then raise exception 'Invalid route' using errcode='22023';end if;
 ws:=public.pro_team_workspace_resolve(p_member,p_owner);
 if ws is null then return jsonb_build_object('allowed',false,'reason','not_member');end if;
 cap:=public.pro_role_route_capability(p_method,p_path);
 begin perform public.pro_role_require(p_member,p_owner,cap);
 exception when insufficient_privilege then return jsonb_build_object('allowed',false,'reason','role','role',ws->>'role','capability',cap);end;
 if cap<>'read' then
  insert into public.pro_company_team_activity(owner_id,member_user_id,member_name,role,capability,method,path)
  values(p_owner,p_member,public.pro_team_name(p_member),ws->>'role',cap,upper(p_method),left(p_path,200));
 end if;
 return jsonb_build_object('allowed',true,'role',ws->>'role','capability',cap);
end $$;

create or replace function public.pro_company_member_json(m public.pro_company_members) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'userId',m.member_user_id,'name',m.member_name,'email',m.member_email,'role',m.role,'active',m.active,'revision',m.revision,'since',m.created_at)
$$;
create or replace function public.pro_company_invite_json(i public.pro_company_invites) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'revision',i.revision,'expiresAt',i.expires_at,'delivery',i.delivery,'draft',jsonb_build_object('subject',i.draft_subject,'body',i.draft_body),'createdAt',i.created_at)
$$;

-- Owner view (or an admin member, through the gate as the owner) + the companies the actor belongs to.
create or replace function public.pro_company_team_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare members jsonb;invites jsonb;events jsonb;memberships jsonb;activity jsonb;owner boolean:=coalesce(public.pro_private_work_tools_enabled(p_actor),false);
begin
 select coalesce(jsonb_agg(jsonb_build_object('ownerId',m.owner_id,'memberId',m.id,'revision',m.revision,'role',m.role,'ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=m.owner_id),public.pro_team_name(m.owner_id))) order by m.created_at),'[]'::jsonb)
  into memberships from public.pro_company_members m where m.member_user_id=p_actor and m.active and coalesce(public.pro_private_work_tools_enabled(m.owner_id),false);
 if not owner then return jsonb_build_object('isOwner',false,'members','[]'::jsonb,'invites','[]'::jsonb,'events','[]'::jsonb,'activity','[]'::jsonb,'memberships',memberships,'matrix',public.pro_role_matrix_read());end if;
 select coalesce(jsonb_agg(public.pro_company_member_json(m) order by m.active desc,lower(m.member_name),m.id),'[]'::jsonb) into members from public.pro_company_members m where m.owner_id=p_actor;
 select coalesce(jsonb_agg(public.pro_company_invite_json(i) order by i.created_at desc),'[]'::jsonb) into invites from (select * from public.pro_company_invites where owner_id=p_actor order by created_at desc limit 50) i;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actorName',e.actor_name,'at',e.at,'after',e.after_state) order by e.at desc,e.id desc),'[]'::jsonb) into events from (select * from public.pro_company_team_events where owner_id=p_actor order by at desc,id desc limit 30) e;
 select coalesce(jsonb_agg(jsonb_build_object('memberName',a.member_name,'role',a.role,'capability',a.capability,'path',a.path,'at',a.at) order by a.at desc),'[]'::jsonb) into activity from (select * from public.pro_company_team_activity where owner_id=p_actor order by at desc limit 30) a;
 return jsonb_build_object('isOwner',true,'ownerId',p_actor,'members',members,'invites',invites,'events',events,'activity',activity,'memberships',memberships,'matrix',public.pro_role_matrix_read());
end $$;

-- Options of «Asignado a»: the owner plus active company members.
create or replace function public.pro_lead_assignees_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_array(jsonb_build_object('userId',p_actor,'name',coalesce(nullif(public.pro_team_name(p_actor),''),'Administrador'),'role','admin'))||
  coalesce((select jsonb_agg(jsonb_build_object('userId',m.member_user_id,'name',coalesce(nullif(m.member_name,''),m.member_email),'role',m.role) order by lower(m.member_name)) from public.pro_company_members m where m.owner_id=p_actor and m.active),'[]'::jsonb);
end $$;

create or replace function public.pro_company_team_mutate(p_actor uuid,p_input jsonb,p_verified_email text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;owner uuid;keys text[];hash text;prior public.pro_company_team_actions;m public.pro_company_members;i public.pro_company_invites;
 role_wanted text;email text;answer jsonb;before_state jsonb;after_state jsonb;en boolean:=coalesce(p_input->>'locale','es')='en';company text;
begin
 if act is null or act not in('invite','cancel_invite','accept','set_role','remove','leave') or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid team action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 hash:=md5(p_input::text);
 select * into prior from public.pro_company_team_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if act='invite' then
  if keys<>array['action','actionId','codeHash','email','locale','role'] then raise exception 'Invalid invitation fields' using errcode='22023';end if;
  owner:=p_actor;perform public.pro_role_require(p_actor,owner,'team.manage');
  if not coalesce(public.pro_private_work_tools_enabled(owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
  email:=p_input->>'email';role_wanted:=p_input->>'role';
  if email is null or email<>lower(btrim(email)) or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or role_wanted not in('admin','manager','member','read_only') or coalesce(p_input->>'codeHash','') !~ '^[a-f0-9]{64}$' or p_input->>'locale' not in('es','en') then raise exception 'Invalid invitation' using errcode='22023';end if;
  if (select count(*) from public.pro_company_invites where owner_id=owner and status='pending' and expires_at>now())>=50 then raise exception 'Too many invitations' using errcode='54000';end if;
  company:=coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=owner),nullif(public.pro_team_name(owner),''),'ContrataCR Pro');
  insert into public.pro_company_invites(owner_id,id,email,role,token_sha256,expires_at,draft_subject,draft_body)
  values(owner,aid,email,role_wanted,p_input->>'codeHash',now()+interval '72 hours',
   case when en then 'Invitation to join '||company||' on ContrataCR Pro' else 'Invitación para unirse a '||company||' en ContrataCR Pro' end,
   case when en then 'Hello,'||chr(10)||chr(10)||company||' invites you to its team on ContrataCR Pro as '||(case role_wanted when 'admin' then 'Administrator' when 'manager' then 'Manager' when 'member' then 'Member' else 'Read-only' end)||'.'||chr(10)||'Sign in with this email, open Pro › Team › «Join a company» and enter the code you will receive separately. The code expires in 72 hours.'
    else 'Hola:'||chr(10)||chr(10)||company||' le invita a su equipo en ContrataCR Pro como '||(case role_wanted when 'admin' then 'Administrador' when 'manager' then 'Gerente' when 'member' then 'Miembro' else 'Solo lectura' end)||'.'||chr(10)||'Inicie sesión con este correo, abra Pro › Equipo › «Unirse a una empresa» e ingrese el código que recibirá por separado. El código vence en 72 horas.' end)
  returning * into i;
  after_state:=public.pro_company_invite_json(i);answer:=jsonb_build_object('invite',after_state);
 elsif act='cancel_invite' then
  if keys<>array['action','actionId','inviteId','revision'] then raise exception 'Invalid fields' using errcode='22023';end if;
  owner:=p_actor;perform public.pro_role_require(p_actor,owner,'team.manage');
  select * into i from public.pro_company_invites where owner_id=owner and id=(p_input->>'inviteId')::uuid for update;
  if not found then raise exception 'Invitation unavailable' using errcode='P0002';end if;
  if i.revision<>(p_input->>'revision')::integer or i.status<>'pending' then raise exception 'Invitation changed' using errcode='40001';end if;
  before_state:=public.pro_company_invite_json(i);
  update public.pro_company_invites set status='cancelled',revision=revision+1,updated_at=now() where owner_id=owner and id=i.id returning * into i;
  after_state:=public.pro_company_invite_json(i);answer:=jsonb_build_object('invite',after_state);
 elsif act='accept' then
  if keys<>array['action','actionId','codeHash'] or coalesce(p_input->>'codeHash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid code' using errcode='22023';end if;
  select * into i from public.pro_company_invites where token_sha256=p_input->>'codeHash' for update;
  if not found or i.status<>'pending' or i.expires_at<=now() then raise exception 'Invitation unavailable' using errcode='P0002';end if;
  if p_verified_email is null or lower(btrim(p_verified_email))<>i.email then raise exception 'Invitation is for another email' using errcode='42501';end if;
  if i.owner_id=p_actor then raise exception 'Owner cannot join own company' using errcode='22023';end if;
  owner:=i.owner_id;
  select * into m from public.pro_company_members where owner_id=owner and member_user_id=p_actor for update;
  if found then before_state:=public.pro_company_member_json(m);
   update public.pro_company_members set role=i.role,active=true,revision=revision+1,source_invite_id=i.id,member_name=public.pro_team_name(p_actor),member_email=i.email,updated_at=now() where owner_id=owner and id=m.id returning * into m;
  else insert into public.pro_company_members(owner_id,member_user_id,member_name,member_email,role,source_invite_id) values(owner,p_actor,public.pro_team_name(p_actor),i.email,i.role,i.id) returning * into m;end if;
  update public.pro_company_invites set status='accepted',revision=revision+1,updated_at=now() where owner_id=owner and id=i.id;
  after_state:=public.pro_company_member_json(m);answer:=jsonb_build_object('member',after_state,'ownerId',owner);
 else
  if act='leave' and keys<>array['action','actionId','memberId','ownerId','revision'] or act='remove' and keys<>array['action','actionId','memberId','revision'] or act='set_role' and keys<>array['action','actionId','memberId','revision','role'] then raise exception 'Invalid fields' using errcode='22023';end if;
  if act='leave' then owner:=(p_input->>'ownerId')::uuid;else owner:=p_actor;perform public.pro_role_require(p_actor,owner,'team.manage');end if;
  select * into m from public.pro_company_members where owner_id=owner and id=(p_input->>'memberId')::uuid for update;
  if not found or act='leave' and m.member_user_id<>p_actor then raise exception 'Member unavailable' using errcode='P0002';end if;
  if m.revision<>(p_input->>'revision')::integer then raise exception 'Member changed' using errcode='40001';end if;
  if act='set_role' then role_wanted:=p_input->>'role';if role_wanted is null or role_wanted not in('admin','manager','member','read_only') or not m.active then raise exception 'Invalid role' using errcode='22023';end if;end if;
  before_state:=public.pro_company_member_json(m);
  update public.pro_company_members set role=coalesce(role_wanted,role),active=act='set_role',revision=revision+1,updated_at=now() where owner_id=owner and id=m.id returning * into m;
  after_state:=public.pro_company_member_json(m);answer:=jsonb_build_object('member',after_state);
 end if;
 insert into public.pro_company_team_events(owner_id,actor_id,actor_name,action_id,action,member_id,invite_id,before_state,after_state)
 values(owner,p_actor,public.pro_team_name(p_actor),aid,act,case when act in('invite','cancel_invite') then null else (after_state->>'id')::uuid end,case when act in('invite','cancel_invite') then i.id when act='accept' then i.id end,before_state,after_state);
 insert into public.pro_company_team_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- ── Lead assignment ────────────────────────────────────────────────────────────────────────────
create or replace function public.pro_lead_assign(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;k text:=p_input->>'kind';lid uuid;who uuid;before_who uuid;rev integer;cur public.pro_lead_assignments;prior public.pro_lead_assignment_actions;hash text:=md5(p_input::text);keys text[];answer jsonb;
begin
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys<>array['actionId','assigneeId','id','kind','revision'] or k not in('manual','request') or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid assignment' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'id')::uuid;who:=nullif(p_input->>'assigneeId','')::uuid;exception when others then raise exception 'Invalid assignment' using errcode='22023';end;
 rev:=(p_input->>'revision')::integer;
 select * into prior from public.pro_lead_assignment_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.pro_lead_center_item(p_actor,k,lid);
 if who is not null and who<>p_actor and not exists(select 1 from public.pro_company_members where owner_id=p_actor and member_user_id=who and active) then raise exception 'Assignee is not on the team' using errcode='22023';end if;
 select * into cur from public.pro_lead_assignments where owner_id=p_actor and kind=k and lead_id=lid for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Assignment changed' using errcode='40001';end if;
 before_who:=cur.assignee_id;
 if found then update public.pro_lead_assignments set assignee_id=who,revision=revision+1,updated_at=now() where owner_id=p_actor and kind=k and lead_id=lid returning * into cur;
 else insert into public.pro_lead_assignments(owner_id,kind,lead_id,assignee_id) values(p_actor,k,lid,who) returning * into cur;end if;
 insert into public.pro_lead_assignment_history(owner_id,kind,lead_id,action_id,before_assignee,after_assignee,revision) values(p_actor,k,lid,aid,before_who,who,cur.revision);
 answer:=jsonb_build_object('kind',k,'id',lid,'assigneeId',cur.assignee_id,'revision',cur.revision);
 insert into public.pro_lead_assignment_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- Leads list (the inbox reader of lead-inboxes-local.sql, same contract: cursor + snapshot token)
-- filtered by assignee BEFORE paging ('unassigned' or an account id), plus each listed lead's
-- assignment. A separate name so the original reader keeps its exact signature.
create or replace function public.pro_lead_inbox_read_assigned(p_actor uuid,p_box text default 'active',p_stage text default null,p_query text default '',p_service text default null,p_channel text default null,p_from date default null,p_to date default null,p_after text default null,p_snapshot text default null,p_assignee text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;answer jsonb;actual_token text;cursor_valid boolean;service_key text:=lower(btrim(coalesce(p_service,'')));who uuid;begin
 if p_assignee is not null and p_assignee<>'unassigned' then begin who:=p_assignee::uuid;exception when others then raise exception 'Invalid assignee' using errcode='22023';end;end if;
 perform pro_lead_origin_owner(p_actor);catalog:=pro_lead_origin_stage_catalog(p_actor);
 if p_box is null or p_box not in('active','snoozed','archived') or p_query is null or length(p_query)>100 or length(coalesce(p_service,''))>160 or p_stage is not null and not exists(select 1 from jsonb_array_elements(catalog->'stages')s where s->>'id'=p_stage) or p_after is not null and p_after!~'^(manual|request):[a-f0-9-]{36}$' or (p_after is null)<>(p_snapshot is null) or p_from is not null and p_from not between date'1900-01-01' and date'2100-12-31' or p_to is not null and p_to not between date'1900-01-01' and date'2100-12-31' or p_from>p_to then raise exception 'Invalid inbox query' using errcode='22023';end if;
 if p_channel is not null and p_channel<>'unspecified' and pro_lead_origin_channel_json(p_actor,p_channel) is null then raise exception 'Invalid attribution filter' using errcode='22023';end if;
 with base as materialized(select * from pro_lead_inbox_sources(p_actor,p_query)),
 filtered as materialized(select b.*,case when b.archived then 'archived' when b.snoozed then 'snoozed' else 'active' end box from base b where(service_key='' or lower(b.service_label)=service_key) and(p_channel is null or p_channel='unspecified' and b.channel_id is null or b.channel_id=p_channel) and(p_from is null or b.created_day>=p_from) and(p_to is null or b.created_day<=p_to)
   and(p_assignee is null or (select a.assignee_id from pro_lead_assignments a where a.owner_id=p_actor and a.kind=b.kind and a.lead_id=b.id) is not distinct from who)),
 sources as materialized(select * from filtered where box=p_box),
 metadata as(select md5(p_actor::text||coalesce(p_assignee,'any')||p_box||coalesce(p_stage,'all')||p_query||service_key||coalesce(p_channel,'all')||coalesce(p_from::text,'')||coalesce(p_to::text,'')||pro_lead_inbox_today()::text||catalog::text||(select coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]') from pro_lead_origin_catalog(p_actor)c)||coalesce(string_agg(jsonb_build_array(kind,id,created_at,effective_stage,fingerprint,channel_id,origin_revision,private_client_archived,snooze_revision)::text,',' order by created_at desc,kind,id desc),''))token from sources),
 anchor as(select * from sources where kind=split_part(p_after,':',1) and id=split_part(p_after,':',2)::uuid and(p_stage is null or effective_stage=p_stage)),
 selected as materialized(select * from sources where(p_stage is null or effective_stage=p_stage) and(p_after is null or created_at<(select created_at from anchor) or created_at=(select created_at from anchor) and(kind>(select kind from anchor) or kind=(select kind from anchor) and id<(select id from anchor))) order by created_at desc,kind,id desc limit 21),
 page as(select coalesce(jsonb_agg(pro_lead_origin_item(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)items,
  coalesce(jsonb_agg(pro_lead_commercial_progress(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)stages,
  coalesce(jsonb_agg(pro_lead_origin_get(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)context,
  coalesce(jsonb_agg(pro_lead_snooze_json(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)snoozes,
  coalesce(jsonb_object_agg(kind||':'||id::text,jsonb_build_object('assigneeId',(select a.assignee_id from pro_lead_assignments a where a.owner_id=p_actor and a.kind=v.kind and a.lead_id=v.id),'revision',coalesce((select a.revision from pro_lead_assignments a where a.owner_id=p_actor and a.kind=v.kind and a.lead_id=v.id),0))),'{}'::jsonb)assignments
  from(select * from selected order by created_at desc,kind,id desc limit 20)v),
 counts as(select jsonb_agg(jsonb_build_object('stageId',s->>'id','count',(select count(*) from sources where effective_stage=s->>'id')) order by(s->>'position')::integer)items from jsonb_array_elements(catalog->'stages')s),
 inbox as(select jsonb_build_object('active',(select count(*) from filtered where box='active'),'snoozed',(select count(*) from filtered where box='snoozed'),'archived',(select count(*) from filtered where box='archived'),'imports',(select count(*) from pro_lead_imports where owner_id=p_actor),
  'stages',(select jsonb_agg(jsonb_build_object('stageId',s->>'id','count',(select count(*) from filtered f where f.box='active' and f.effective_stage=s->>'id')) order by(s->>'position')::integer) from jsonb_array_elements(catalog->'stages')s))v),
 services as(select coalesce(jsonb_agg(label order by lower(label),label),'[]'::jsonb)v from(select min(service_label)label from base where service_label<>'' group by lower(service_label) order by lower(min(service_label)) limit 100)x)
 select jsonb_build_object('page',jsonb_build_object('catalog',catalog,'items',page.items,'counts',counts.items,'nextCursor',case when(select count(*) from selected)>20 then(select kind||':'||id::text from selected order by created_at desc,kind,id desc offset 19 limit 1)else null end,'snapshotToken',metadata.token),
  'stages',page.stages,'context',page.context,'snoozes',page.snoozes,'assignments',page.assignments,'inboxes',inbox.v,'services',services.v),metadata.token,(p_after is null or exists(select 1 from anchor))
 into answer,actual_token,cursor_valid from page cross join counts cross join metadata cross join inbox cross join services;
 if p_after is not null and(p_snapshot is null or p_snapshot<>actual_token or not cursor_valid) then raise exception 'Leads changed; refresh before continuing' using errcode='40001';end if;return answer;end $$;

create or replace function public.pro_company_team_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Immutable team history' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_company_members','pro_company_invites','pro_company_team_actions','pro_company_team_events','pro_company_team_activity','pro_lead_assignments','pro_lead_assignment_history','pro_lead_assignment_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_company_team_actions','pro_company_team_events','pro_company_team_activity','pro_lead_assignment_history','pro_lead_assignment_actions'] loop
  execute format('drop trigger if exists pro_company_team_immutable on public.%I',t);execute format('create trigger pro_company_team_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_company_team_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_role_allows','pro_role_matrix_read','pro_role_of','pro_role_require','pro_role_route_capability','pro_team_workspace_resolve','pro_team_route_authorize','pro_company_member_json','pro_company_invite_json','pro_company_team_read','pro_lead_assignees_read','pro_company_team_mutate','pro_lead_assign','pro_lead_inbox_read_assigned','pro_company_team_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
