begin;
alter table public.reports
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists reporter_id uuid,
  add column if not exists subject_user_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists message_id uuid,
  add column if not exists priority text not null default 'normal' check(priority in ('normal','high','urgent')),
  add column if not exists assigned_to uuid,
  add column if not exists decision text,
  add column if not exists decision_reason text,
  add column if not exists decided_by uuid,
  add column if not exists appealed_at timestamptz,
  add column if not exists appeal_reason text;
create index reports_target_idx on public.reports(target_type,target_id);
-- Resolve only unambiguous legacy subjects; never guess a chat from a name/email.
update public.reports r set subject_user_id=p.profile_id,target_type=coalesce(r.target_type,'professional'),target_id=coalesce(r.target_id,r.professional_id)
from public.professionals p where r.professional_id=p.id and r.subject_user_id is null;
update public.reports set subject_user_id=coalesce(reported_client_id,blocked_profile_id),target_type='account',target_id=coalesce(reported_client_id,blocked_profile_id)
where subject_user_id is null and coalesce(reported_client_id,blocked_profile_id) is not null;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null, report_id uuid,
  target_type text not null, target_id uuid not null, action text not null,
  reason text not null check(char_length(reason) between 5 and 1000),
  before_data jsonb, after_data jsonb, created_at timestamptz not null default clock_timestamp()
);
create table public.moderation_holds (
  target_type text not null check(target_type in ('project','job','offer','review','professional')),
  target_id uuid not null, owner_id uuid, previous_state jsonb not null,
  reason text not null, active boolean not null default true, created_at timestamptz not null default now(),
  primary key(target_type,target_id)
);
create table public.moderation_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null, expires_at timestamptz not null, created_at timestamptz not null default now(),
  created_by uuid not null
);
create table public.moderation_photo_holds (
  professional_id uuid not null, url text not null, active boolean not null,
  reason text not null, updated_at timestamptz not null default now(),primary key(professional_id,url)
);
create table public.admin_staff_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  moderation boolean not null default false, support boolean not null default false,
  identity_review boolean not null default false
);
create table public.moderation_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check(bucket in ('direct-message-attachments','support-attachments')),
  path text not null, report_id uuid references public.reports(id),
  status text not null check(status in ('quarantined','released')),
  reason text not null, updated_at timestamptz not null default now(),
  unique(bucket,path)
);
alter table public.moderation_files enable row level security;
revoke all on public.moderation_files from public,anon,authenticated,service_role;
grant select on public.moderation_files to service_role;
create function public.file_is_quarantined(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path=public as $$
select exists(select 1 from moderation_files where bucket=p_bucket and path=p_path and status='quarantined');
$$;
revoke all on function public.file_is_quarantined(text,text) from public;
grant execute on function public.file_is_quarantined(text,text) to anon,authenticated,service_role;
create policy moderation_file_visibility on storage.objects as restrictive for select to anon,authenticated
using(not public.file_is_quarantined(bucket_id,name));
-- Existing active admins keep their existing public moderation capability.
-- New administrators require a separate explicit grant; chat permission is never copied.
insert into public.admin_staff_permissions(user_id,moderation,support,identity_review)
select id,true,true,true from public.profiles where role='admin' and not coalesce(is_disabled,false);

alter table public.moderation_actions enable row level security;
alter table public.moderation_holds enable row level security;
alter table public.moderation_restrictions enable row level security;
alter table public.moderation_photo_holds enable row level security;
alter table public.admin_staff_permissions enable row level security;
revoke all on public.moderation_actions,public.moderation_holds,public.moderation_restrictions,public.admin_staff_permissions from public,anon,authenticated,service_role;
revoke all on public.moderation_photo_holds from public,anon,authenticated,service_role;
grant select on public.moderation_photo_holds to service_role;
grant select on public.moderation_actions,public.moderation_holds,public.moderation_restrictions,public.admin_staff_permissions to service_role;
grant insert,update,delete on public.admin_staff_permissions to service_role;

create function public.admin_can_moderate() returns boolean language sql stable security definer set search_path=public as $$
select public.admin_chat_authorized() and exists(select 1 from admin_staff_permissions where user_id=auth.uid() and moderation);
$$;
-- Preserve migration 170's protection for direct client updates. The sole new
-- exception is the authenticated, scoped, transactional moderation function.
create or replace function public.protect_review_moderation_fields() returns trigger
language plpgsql set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role'
 and not(coalesce(current_setting('contratacr.moderation_action',true),'')='yes' and public.admin_can_moderate())
 and (new.moderation_status is distinct from old.moderation_status or new.moderation_reason is distinct from old.moderation_reason
 or new.moderated_at is distinct from old.moderated_at or new.moderated_by is distinct from old.moderated_by) then
 raise exception 'Review moderation fields are managed by administrators.' using errcode='42501';
 end if;
 return new;
end;
$$;
create index moderation_actions_target_idx on public.moderation_actions(target_type,target_id,created_at desc);
create index moderation_actions_report_idx on public.moderation_actions(report_id,created_at desc);

-- Restrict writes in the database too: service-role routes cannot bypass sanctions.
create function public.enforce_moderation_write() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid; pro uuid; kind text; held boolean;
begin
  if current_setting('contratacr.moderation_action',true)='yes' and public.admin_can_moderate() then return new; end if;
  if tg_table_name='professionals' and tg_op='UPDATE' then
   if exists(
    select 1 from moderation_photo_holds h where h.professional_id=new.id and h.active and h.url=any(coalesce(new.portfolio_urls,'{}'))
   ) then raise exception 'Una imagen fue retirada por moderación; solicita revisión en soporte.' using errcode='42501'; end if;
  end if;
  if tg_table_name='direct_messages' then actor:=new.sender_id;
  elsif tg_table_name='projects' then actor:=new.client_id; kind:='project';
  elsif tg_table_name='job_posts' then pro:=new.employer_id; kind:='job';
  elsif tg_table_name='professional_offers' then pro:=new.professional_id; kind:='offer';
  elsif tg_table_name='reviews' then actor:=new.client_id; kind:='review';
  elsif tg_table_name='professionals' then actor:=new.profile_id; kind:='professional';
  end if;
  if pro is not null then select profile_id into actor from professionals where id=pro; end if;
  if exists(select 1 from moderation_restrictions where user_id=actor and expires_at>now()) then
    raise exception 'Cuenta restringida temporalmente; consulta soporte.' using errcode='42501';
  end if;
  if tg_op='UPDATE' and kind is not null then
    select exists(select 1 from moderation_holds where target_type=kind and target_id=new.id and active) into held;
    if held then raise exception 'Contenido retirado por moderación; solicita revisión en soporte.' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
create trigger moderation_projects before insert or update on public.projects for each row execute function public.enforce_moderation_write();
create trigger moderation_jobs before insert or update on public.job_posts for each row execute function public.enforce_moderation_write();
create trigger moderation_offers before insert or update on public.professional_offers for each row execute function public.enforce_moderation_write();
create trigger moderation_reviews before insert or update on public.reviews for each row execute function public.enforce_moderation_write();
create trigger moderation_professionals before insert or update on public.professionals for each row execute function public.enforce_moderation_write();
create trigger moderation_messages before insert on public.direct_messages for each row execute function public.enforce_moderation_write();

create function public.moderate_content(p_kind text,p_id uuid,p_action text,p_reason text,p_report uuid default null,p_days integer default 7)
returns jsonb language plpgsql security definer set search_path=public as $$
declare before_row jsonb; after_row jsonb; table_name text; owner uuid; hold moderation_holds%rowtype; aid uuid;
begin
  if not public.admin_can_moderate() then raise insufficient_privilege; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise invalid_parameter_value; end if;
  if p_kind not in ('project','job','offer','review','professional','account') or p_action not in ('hide','restore','warn','restrict','unrestrict') then raise invalid_parameter_value; end if;
  if p_report is not null and not exists(select 1 from reports where id=p_report and (
    (target_type=p_kind and target_id=p_id) or (p_kind='professional' and professional_id=p_id)
    or (p_kind='account' and subject_user_id=p_id))) then raise invalid_parameter_value; end if;
  table_name:=case p_kind when 'project' then 'projects' when 'job' then 'job_posts' when 'offer' then 'professional_offers' when 'review' then 'reviews' when 'professional' then 'professionals' else 'profiles' end;
  -- Serialize competing decisions on the same row; never restore a stale saved state.
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',table_name) into before_row using p_id;
  if before_row is null then raise no_data_found; end if;
  owner:=case p_kind when 'project' then (before_row->>'client_id')::uuid when 'review' then (before_row->>'client_id')::uuid when 'professional' then (before_row->>'profile_id')::uuid when 'account' then p_id else null end;
  if p_kind in ('job','offer') then select profile_id into owner from professionals where id=coalesce((before_row->>'employer_id')::uuid,(before_row->>'professional_id')::uuid); end if;
  if p_kind='account' and (before_row->>'role'='admin' or owner=auth.uid()) then raise insufficient_privilege; end if;
  perform set_config('contratacr.moderation_action','yes',true);
  if p_action in ('restrict','unrestrict') then
    if p_kind <> 'account' or p_days not between 1 and 30 then raise invalid_parameter_value; end if;
    if p_action='restrict' then
      insert into moderation_restrictions(user_id,reason,expires_at,created_by) values(owner,btrim(p_reason),now()+make_interval(days=>p_days),auth.uid())
      on conflict(user_id) do update set reason=excluded.reason,expires_at=excluded.expires_at,created_by=excluded.created_by,created_at=now();
    else delete from moderation_restrictions where user_id=owner; end if;
  elsif p_action in ('hide','restore') then
    if p_kind='account' then raise invalid_parameter_value; end if;
    select * into hold from moderation_holds where target_type=p_kind and target_id=p_id;
    if p_action='hide' then
      if hold.active then raise exception 'Ya retirado por moderación'; end if;
      -- Retain only the state needed for restoration; never copy private identity/chat.
      insert into moderation_holds(target_type,target_id,owner_id,previous_state,reason,active)
      values(p_kind,p_id,owner,jsonb_build_object('status',before_row->'status','allow_direct_contact',before_row->'allow_direct_contact','moderation_status',before_row->'moderation_status','is_banned',before_row->'is_banned'),btrim(p_reason),true)
      on conflict(target_type,target_id) do update set previous_state=excluded.previous_state,reason=excluded.reason,active=true,created_at=now();
      if p_kind='project' then update projects set allow_direct_contact=false where id=p_id;
      elsif p_kind='job' then update job_posts set status='paused' where id=p_id;
      elsif p_kind='offer' then update professional_offers set status='paused' where id=p_id;
      elsif p_kind='review' then update reviews set moderation_status='hidden',moderation_reason=btrim(p_reason),moderated_at=now(),moderated_by=auth.uid() where id=p_id;
      else update professionals set is_banned=true,banned_reason=btrim(p_reason),banned_at=now() where id=p_id; end if;
    else
      if not coalesce(hold.active,false) then
        if p_kind='professional' and coalesce((before_row->>'is_banned')::boolean,false) then hold.previous_state:='{"is_banned":false}'::jsonb;
        elsif p_kind='review' and before_row->>'moderation_status'='hidden' then hold.previous_state:='{"moderation_status":"published"}'::jsonb;
        else raise exception 'No hay retiro activo que restaurar'; end if;
      end if;
      if p_kind='project' then update projects set allow_direct_contact=coalesce((hold.previous_state->>'allow_direct_contact')::boolean,false) where id=p_id;
      elsif p_kind='job' then update job_posts set status=hold.previous_state->>'status' where id=p_id;
      elsif p_kind='offer' then update professional_offers set status=hold.previous_state->>'status' where id=p_id;
      elsif p_kind='review' then update reviews set moderation_status=coalesce(hold.previous_state->>'moderation_status','published'),moderation_reason=btrim(p_reason),moderated_at=now(),moderated_by=auth.uid() where id=p_id;
      else update professionals set is_banned=coalesce((hold.previous_state->>'is_banned')::boolean,false),banned_reason=null,banned_at=null where id=p_id; end if;
      update moderation_holds set active=false where target_type=p_kind and target_id=p_id;
    end if;
  end if;
  -- Decision and durable audit commit together. Reasons must not quote private chats.
  after_row:=jsonb_build_object('action',p_action,'days',case when p_action='restrict' then p_days else null end);
  insert into moderation_actions(actor_id,report_id,target_type,target_id,action,reason,before_data,after_data)
    values(auth.uid(),p_report,p_kind,p_id,p_action,btrim(p_reason),jsonb_build_object('status',before_row->'status','is_banned',before_row->'is_banned'),after_row) returning id into aid;
  return jsonb_build_object('ok',true,'auditId',aid);
end;
$$;

create function public.admin_case_update(p_id uuid,p_status text,p_priority text,p_reason text,p_assign boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare r reports%rowtype;
begin
  if not public.admin_can_moderate() then raise insufficient_privilege; end if;
  if p_status not in ('open','resolved') or p_priority not in ('normal','high','urgent') or p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise invalid_parameter_value; end if;
  select * into r from reports where id=p_id for update;
  if not found then raise no_data_found; end if;
  update reports set status=p_status,priority=p_priority,decision=p_status,decision_reason=btrim(p_reason),decided_by=auth.uid(),
    assigned_to=case when p_assign then auth.uid() else assigned_to end,resolved_at=case when p_status='resolved' then now() else null end where id=p_id;
  insert into moderation_actions(actor_id,report_id,target_type,target_id,action,reason,before_data,after_data)
  values(auth.uid(),p_id,'report',p_id,'case_update',btrim(p_reason),jsonb_build_object('status',r.status),jsonb_build_object('status',p_status,'priority',p_priority));
end;
$$;

-- Restrictive policies protect direct SDK consumers as well as application pages.
create function public.content_is_held(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
select exists(select 1 from moderation_holds where target_type=p_kind and target_id=p_id and active);
$$;
revoke all on function public.content_is_held(text,uuid) from public;
grant execute on function public.content_is_held(text,uuid) to anon,authenticated,service_role;
create function public.admin_publication_state(p_kind text,p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare tbl text; old_status text;
begin
 if not public.admin_can_moderate() then raise insufficient_privilege; end if;
 if p_kind not in ('job','offer') or p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise invalid_parameter_value; end if;
 if p_kind='job' and p_status not in ('draft','published','paused','closed') or p_kind='offer' and p_status not in ('draft','published','paused','expired','sold_out') then raise invalid_parameter_value; end if;
 tbl:=case when p_kind='job' then 'job_posts' else 'professional_offers' end;
 execute format('select status from public.%I where id=$1 for update',tbl) into old_status using p_id;
 if old_status is null or public.content_is_held(p_kind,p_id) then raise insufficient_privilege; end if;
 perform set_config('contratacr.moderation_action','yes',true);
 execute format('update public.%I set status=$1,updated_at=now() where id=$2',tbl) using p_status,p_id;
 insert into moderation_actions(actor_id,target_type,target_id,action,reason,before_data,after_data) values(auth.uid(),p_kind,p_id,'publication_state',btrim(p_reason),jsonb_build_object('status',old_status),jsonb_build_object('status',p_status));
end;
$$;
revoke all on function public.admin_publication_state(text,uuid,text,text) from public,anon;
grant execute on function public.admin_publication_state(text,uuid,text,text) to authenticated;
do $$ declare t text; kind text; begin
  for t,kind in select * from (values('projects','project'),('job_posts','job'),('professional_offers','offer'),('reviews','review'),('professionals','professional')) v(t,k) loop
    execute format('create policy moderation_visibility on public.%I as restrictive for select to anon,authenticated using (not public.content_is_held(%L,id))',t,kind);
  end loop;
end $$;

revoke all on function public.admin_can_moderate(),public.moderate_content(text,uuid,text,text,uuid,integer),public.admin_case_update(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.admin_can_moderate(),public.moderate_content(text,uuid,text,text,uuid,integer),public.admin_case_update(uuid,text,text,text,boolean) to authenticated;

create function public.moderate_reported_file(p_report uuid,p_path text,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r reports%rowtype; fid uuid;
begin
 if not public.admin_can_moderate() then raise insufficient_privilege; end if;
 if p_action not in ('quarantine','release') or p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise invalid_parameter_value; end if;
 select * into r from reports where id=p_report and status='open' for update;
 if not found or r.conversation_id is null or not exists(
   select 1 from direct_messages m cross join lateral jsonb_array_elements(m.attachment_urls) a
   where m.conversation_id=r.conversation_id and m.deleted_at is null and (r.message_id is null or m.id=r.message_id) and a->>'path'=p_path
 ) then raise insufficient_privilege; end if;
 insert into moderation_files(bucket,path,report_id,status,reason) values('direct-message-attachments',p_path,p_report,case when p_action='quarantine' then 'quarantined' else 'released' end,btrim(p_reason))
 on conflict(bucket,path) do update set status=excluded.status,reason=excluded.reason,report_id=excluded.report_id,updated_at=now() returning id into fid;
 insert into moderation_actions(actor_id,report_id,target_type,target_id,action,reason) values(auth.uid(),p_report,'file',fid,p_action,btrim(p_reason));
 return jsonb_build_object('ok',true,'id',fid);
end;
$$;
revoke all on function public.moderate_reported_file(uuid,text,text,text) from public,anon;
grant execute on function public.moderate_reported_file(uuid,text,text,text) to authenticated;

create function public.request_moderation_appeal(p_report uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_reason is null or char_length(btrim(p_reason)) not between 15 and 1000 then raise insufficient_privilege; end if;
 update reports set appealed_at=now(),appeal_reason=btrim(p_reason),status='open',resolved_at=null
 where id=p_report and subject_user_id=auth.uid() and status='resolved' and appealed_at is null;
 if not found then raise insufficient_privilege; end if;
end;
$$;
revoke all on function public.request_moderation_appeal(uuid,text) from public,anon;
grant execute on function public.request_moderation_appeal(uuid,text) to authenticated;

-- Participants can see the decision affecting their account/content, never the reporter.
create function public.my_moderation_decisions() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select id,target_type,target_id,decision_reason,status,appealed_at,created_at from reports
 where subject_user_id=auth.uid() and decision_reason is not null order by created_at desc limit 100
 ) t;
$$;
revoke all on function public.my_moderation_decisions() from public,anon;
grant execute on function public.my_moderation_decisions() to authenticated;

create function public.admin_staff_directory() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.admin_chat_authorized() or not exists(select 1 from admin_staff_permissions where user_id=auth.uid() and moderation and support and identity_review) then raise insufficient_privilege; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'moderation',coalesce(s.moderation,false),'support',coalesce(s.support,false),'identity',coalesce(s.identity_review,false),'chat',exists(select 1 from admin_chat_reviewers c where c.user_id=p.id))),'[]'::jsonb)
 from profiles p left join admin_staff_permissions s on s.user_id=p.id where p.role='admin' and not coalesce(p.is_disabled,false));
end;
$$;
create function public.admin_set_staff(p_user uuid,p_moderation boolean,p_support boolean,p_identity boolean,p_chat boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.admin_staff_directory();
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 or p_moderation is null or p_support is null or p_identity is null or p_chat is null then raise invalid_parameter_value; end if;
 if not exists(select 1 from profiles where id=p_user and role='admin' and not coalesce(is_disabled,false)) then raise insufficient_privilege; end if;
 if p_user=auth.uid() and not(p_moderation and p_support and p_identity) then raise exception 'No puedes retirar tus propios permisos de administración completa'; end if;
 insert into admin_staff_permissions(user_id,moderation,support,identity_review) values(p_user,p_moderation,p_support,p_identity)
 on conflict(user_id) do update set moderation=excluded.moderation,support=excluded.support,identity_review=excluded.identity_review;
 if p_chat then insert into admin_chat_reviewers(user_id) values(p_user) on conflict do nothing; else delete from admin_chat_reviewers where user_id=p_user; end if;
 insert into moderation_actions(actor_id,target_type,target_id,action,reason,after_data) values(auth.uid(),'admin',p_user,'permissions',btrim(p_reason),jsonb_build_object('moderation',p_moderation,'support',p_support,'identity',p_identity,'chat',p_chat));
end;
$$;
revoke all on function public.admin_staff_directory(),public.admin_set_staff(uuid,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.admin_staff_directory(),public.admin_set_staff(uuid,boolean,boolean,boolean,boolean,text) to authenticated;
create function public.admin_portfolio_action(p_id uuid,p_url text,p_restore boolean,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare photos text[];
begin
 if not public.admin_can_moderate() then raise insufficient_privilege; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 or p_url is null or length(p_url)>2048 then raise invalid_parameter_value; end if;
 select portfolio_urls into photos from professionals where id=p_id for update;
 if not found then raise no_data_found; end if;
 if p_restore then
  if not exists(select 1 from moderation_photo_holds where professional_id=p_id and url=p_url and active) then raise insufficient_privilege; end if;
  if p_url=any(coalesce(photos,'{}')) then raise exception 'La foto ya está publicada'; end if;
 else
  if not(p_url=any(coalesce(photos,'{}'))) then raise no_data_found; end if;
 end if;
 perform set_config('contratacr.moderation_action','yes',true);
 update professionals set portfolio_urls=case when p_restore then array_append(coalesce(photos,'{}'),p_url) else array_remove(photos,p_url) end where id=p_id;
 insert into moderation_photo_holds(professional_id,url,active,reason) values(p_id,p_url,not p_restore,btrim(p_reason))
 on conflict(professional_id,url) do update set active=excluded.active,reason=excluded.reason,updated_at=now();
 insert into moderation_actions(actor_id,target_type,target_id,action,reason,before_data) values(auth.uid(),'professional',p_id,case when p_restore then 'restore_photo' else 'remove_photo' end,btrim(p_reason),jsonb_build_object('url',p_url));
end;
$$;
revoke all on function public.admin_portfolio_action(uuid,text,boolean,text) from public,anon;
grant execute on function public.admin_portfolio_action(uuid,text,boolean,text) to authenticated;
notify pgrst,'reload schema';
create function public.admin_moderation_signals() returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.admin_can_moderate() then raise insufficient_privilege; end if;
 with publications as (
  select 'project' kind,id,client_id author,title,created_at from projects
  union all select 'job',j.id,p.profile_id,j.title,j.created_at from job_posts j join professionals p on p.id=j.employer_id
  union all select 'offer',o.id,p.profile_id,o.title,o.created_at from professional_offers o join professionals p on p.id=o.professional_id
 ), duplicates as (
  select kind,author,lower(regexp_replace(trim(title),'\s+',' ','g')) label,count(*) total,(array_agg(id order by created_at desc,id))[1] id
  from publications where created_at>now()-interval '24 hours' group by kind,author,lower(regexp_replace(trim(title),'\s+',' ','g')) having count(*)>=3
 ), signals as (
  select kind,id,'Varias publicaciones de la misma cuenta con título equivalente en 24 h' reason,total from duplicates
  union all
  select 'account',subject_user_id,'Cuenta con varios reportes abiertos; comprobar independencia y evidencia',count(*) from reports
  where status='open' and subject_user_id is not null group by subject_user_id having count(distinct coalesce(reporter_id,id))>=3
 ) select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select * from signals order by total desc,id limit 50)t;
 return result;
end;
$$;
revoke all on function public.admin_moderation_signals() from public,anon;
grant execute on function public.admin_moderation_signals() to authenticated;
create function public.admin_chat_case_metadata(p_conversation uuid,p_report uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.admin_chat_authorized() then raise insufficient_privilege; end if;
 select jsonb_build_object('id',c.id,'client_name',cp.full_name,'professional_name',pp.full_name,'waiting_for','unknown','since',c.created_at,'last_message_at',c.created_at,
 'canReview',exists(select 1 from admin_chat_reviewers where user_id=auth.uid())) into result
 from direct_conversations c join profiles cp on cp.id=c.client_id join profiles pp on pp.id=c.professional_profile_id
 where c.id=p_conversation and exists(select 1 from reports where id=p_report and conversation_id=c.id);
 if result is null then raise no_data_found; end if;
 return result;
end;
$$;
revoke all on function public.admin_chat_case_metadata(uuid,uuid) from public,anon;
grant execute on function public.admin_chat_case_metadata(uuid,uuid) to authenticated;
create function public.admin_chat_access_history(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.admin_can_moderate() then raise insufficient_privilege; end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from(
 select a.id,a.actor_id,p.full_name actor_name,a.accessed_at,a.support_ticket_id,a.report_id,a.reason,a.page_offset,a.message_count
 from admin_chat_access_log a left join profiles p on p.id=a.actor_id where a.conversation_id=p_conversation
 order by a.accessed_at desc,a.id limit 100)t);
end;
$$;
revoke all on function public.admin_chat_access_history(uuid) from public,anon;
grant execute on function public.admin_chat_access_history(uuid) to authenticated;
create table public.moderation_retention_state(id boolean primary key default true check(id),scheduled boolean not null default false,last_run_at timestamptz);
alter table public.moderation_retention_state enable row level security;
revoke all on public.moderation_retention_state from public,anon,authenticated,service_role;
grant select on public.moderation_retention_state to service_role;
insert into public.moderation_retention_state(id) values(true);
create function public.purge_closed_moderation_history() returns void
language plpgsql security definer set search_path=public as $$
begin
 delete from admin_chat_access_log a where a.accessed_at<now()-interval '365 days'
 and not exists(select 1 from reports r where r.id=a.report_id and (r.status='open' or r.resolved_at>now()-interval '365 days'))
 and not exists(select 1 from support_tickets s where s.id=a.support_ticket_id and (s.status in ('open','in_progress') or s.reviewed_at>now()-interval '365 days'));
 delete from moderation_actions a where a.created_at<now()-interval '365 days'
 and not exists(select 1 from moderation_photo_holds h where a.target_type='professional' and h.professional_id=a.target_id and h.url=a.before_data->>'url' and h.active)
 and not exists(select 1 from reports r where r.id=a.report_id and (r.status='open' or r.resolved_at>now()-interval '365 days'))
 and not exists(select 1 from moderation_holds h where h.target_type=a.target_type and h.target_id=a.target_id and h.active);
 delete from moderation_restrictions where expires_at<now()-interval '365 days';
 delete from moderation_photo_holds where not active and updated_at<now()-interval '365 days';
 update moderation_retention_state set last_run_at=now() where id=true;
end;
$$;
revoke all on function public.purge_closed_moderation_history() from public,anon,authenticated;
grant execute on function public.purge_closed_moderation_history() to service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('moderation-history-retention','35 8 * * *','select public.purge_closed_moderation_history()');
  update public.moderation_retention_state set scheduled=true;
 end if;
end$$;
commit;
