-- LOCAL PRO ONLY. Round 8 (2026-11-15): subcontractor access with a limited scope.
-- The owner invites a vendor of the directory (pro_expense_suppliers + kind) by e-mail: the server
-- keeps only the SHA-256 of a one-use code (72 h); nothing is sent (the owner copies the code). A
-- registered account whose verified e-mail matches accepts it. The access is then linked to specific
-- jobs; on each job the owner assigns tasks and shares job files with it.
-- The subcontractor sees ONLY, per linked job: the job service, the customer's name, the job dates,
-- the planned dates of ITS assigned tasks and the key dates (schedule), its assigned tasks (comment,
-- mark done / reopen with CAS) and the files shared with it. Never finances, contact data, other
-- tasks, notes, messages, other jobs or other companies. Everything is enforced here (security
-- invoker functions called with service_role only); the API routes only pass the real identity.
-- Patterns: RLS on, service_role-only, idempotent actionId, CAS 40001, immutable events/comments.
begin;
create table if not exists public.pro_subcontractor_access(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 supplier_id uuid not null,vendor_name text not null check(length(btrim(vendor_name)) between 1 and 160),
 recipient_email text not null check(length(recipient_email) between 3 and 254 and recipient_email=lower(btrim(recipient_email))),
 token_sha256 text not null unique check(token_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','active','revoked')),
 -- Captured identity of the accepting account (no profile FK: deleting that account must not block the owner's history).
 member_user_id uuid,member_name text not null default '' check(length(member_name)<=160),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,accepted_at timestamptz,revoked_at timestamptz,
 primary key(owner_id,id),
 foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id) on delete cascade,
 check(status<>'active' or member_user_id is not null));
create unique index if not exists pro_subcontractor_access_member on public.pro_subcontractor_access(owner_id,member_user_id) where status='active';
create index if not exists pro_subcontractor_access_member_page on public.pro_subcontractor_access(member_user_id) where status='active';
create table if not exists public.pro_subcontractor_jobs(
 owner_id uuid not null,access_id uuid not null,work_id text not null,active boolean not null default true,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,access_id,work_id),
 foreign key(owner_id,access_id) references public.pro_subcontractor_access(owner_id,id) on delete cascade,
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create index if not exists pro_subcontractor_jobs_work on public.pro_subcontractor_jobs(owner_id,work_id) where active;
create table if not exists public.pro_subcontractor_tasks(
 owner_id uuid not null,access_id uuid not null,work_id text not null,task_id uuid not null,active boolean not null default true,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,access_id,task_id),
 foreign key(owner_id,access_id,work_id) references public.pro_subcontractor_jobs(owner_id,access_id,work_id) on delete cascade,
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade);
create table if not exists public.pro_subcontractor_files(
 owner_id uuid not null,access_id uuid not null,work_id text not null,file_id uuid not null,active boolean not null default true,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,access_id,file_id),
 foreign key(owner_id,access_id,work_id) references public.pro_subcontractor_jobs(owner_id,access_id,work_id) on delete cascade,
 foreign key(owner_id,work_id,file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade);
create table if not exists public.pro_subcontractor_comments(
 owner_id uuid not null,id uuid not null,access_id uuid not null,work_id text not null,task_id uuid not null,
 side text not null check(side in('pro','sub')),author_id uuid not null,author_name text not null default '' check(length(author_name)<=160),
 body text not null check(length(body) between 1 and 1000 and body=btrim(body)),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade);
create index if not exists pro_subcontractor_comments_task on public.pro_subcontractor_comments(owner_id,access_id,task_id,created_at,id);
create table if not exists public.pro_subcontractor_events(
 owner_id uuid not null,id uuid not null default gen_random_uuid(),access_id uuid not null,actor_id uuid not null,
 action text not null check(action in('invite','accept','add_job','remove_job','assign_task','unassign_task','share_file','unshare_file','revoke','comment','complete','reopen')),
 work_id text,subject_id text,at timestamptz not null default clock_timestamp(),primary key(owner_id,id));
create index if not exists pro_subcontractor_events_page on public.pro_subcontractor_events(owner_id,access_id,at desc);
create table if not exists public.pro_subcontractor_actions(
 actor_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(actor_id,action_id));

create or replace function public.pro_sub_access_json(a public.pro_subcontractor_access) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',a.id,'supplierId',a.supplier_id,'vendorName',a.vendor_name,'email',a.recipient_email,'status',
  case when a.status='pending' and a.expires_at<=clock_timestamp() then 'expired' else a.status end,
  'memberName',nullif(a.member_name,''),'revision',a.revision,'createdAt',a.created_at,'expiresAt',a.expires_at,'acceptedAt',a.accepted_at)
$$;

-- Owner view of one job: accesses linked to it (with assigned tasks / shared files) and the others that can be added.
create or replace function public.pro_sub_owner_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,
  'linked',coalesce((select jsonb_agg(public.pro_sub_access_json(a)||jsonb_build_object(
     'taskIds',coalesce((select jsonb_agg(t.task_id) from public.pro_subcontractor_tasks t where t.owner_id=a.owner_id and t.access_id=a.id and t.work_id=p_work and t.active),'[]'::jsonb),
     'fileIds',coalesce((select jsonb_agg(f.file_id) from public.pro_subcontractor_files f where f.owner_id=a.owner_id and f.access_id=a.id and f.work_id=p_work and f.active),'[]'::jsonb),
     'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'taskId',c.task_id,'side',c.side,'authorName',c.author_name,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
       from public.pro_subcontractor_comments c where c.owner_id=a.owner_id and c.access_id=a.id and c.work_id=p_work),'[]'::jsonb)) order by a.vendor_name,a.id)
   from public.pro_subcontractor_access a join public.pro_subcontractor_jobs j on j.owner_id=a.owner_id and j.access_id=a.id and j.work_id=p_work and j.active
   where a.owner_id=p_actor and a.status<>'revoked'),'[]'::jsonb),
  'available',coalesce((select jsonb_agg(public.pro_sub_access_json(a) order by a.vendor_name,a.id) from public.pro_subcontractor_access a
   where a.owner_id=p_actor and a.status<>'revoked' and not exists(select 1 from public.pro_subcontractor_jobs j where j.owner_id=a.owner_id and j.access_id=a.id and j.work_id=p_work and j.active)),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',coalesce(p.kind,'supplier'),'trade',p.trade) order by (coalesce(p.kind,'supplier')<>'subcontractor'),s.name,s.id)
   from public.pro_expense_suppliers s left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id where s.user_id=p_actor),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'dueDate',t.due_date) order by t.created_at,t.id)
   from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and not t.archived),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mimeType',f.mime_type) order by f.created_at desc,f.id)
   from public.pro_work_files f where f.owner_id=p_actor and f.work_id=p_work and f.ready),'[]'::jsonb));
end $$;

create or replace function public.pro_sub_owner_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;acc uuid;wid text;subject uuid;keys text[];hash text:=md5(p_input::text);prior public.pro_subcontractor_actions;
 a public.pro_subcontractor_access;sup record;email text;answer jsonb;on_flag boolean;rev integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid subcontractor action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act is null or not(
   act='invite' and keys=array['action','actionId','email','supplierId','tokenSha256','workId']
   or act in('add_job','remove_job') and keys=array['accessId','action','actionId','workId']
   or act in('assign_task','share_file') and keys=array['accessId','action','actionId','on','subjectId','workId']
   or act='revoke' and keys=array['accessId','action','actionId','revision']
   or act='comment' and keys=array['accessId','action','actionId','body','subjectId','workId']) then raise exception 'Invalid subcontractor action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;acc:=nullif(p_input->>'accessId','')::uuid;subject:=nullif(p_input->>'subjectId','')::uuid;
  exception when others then raise exception 'Invalid subcontractor action' using errcode='22023';end;
 wid:=p_input->>'workId';
 perform pg_advisory_xact_lock(hashtextextended('pro-sub:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_subcontractor_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if wid is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 if act='invite' then
  email:=lower(btrim(coalesce(p_input->>'email','')));
  if email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(email)>254 or coalesce(p_input->>'tokenSha256','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid subcontractor invite' using errcode='22023';end if;
  begin select s.id,s.name into sup from public.pro_expense_suppliers s where s.user_id=p_actor and s.id=(p_input->>'supplierId')::uuid;exception when others then raise exception 'Invalid subcontractor invite' using errcode='22023';end;
  if sup.id is null then raise exception 'Forbidden' using errcode='42501';end if;
  if (select count(*) from public.pro_subcontractor_access where owner_id=p_actor and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Too many invites' using errcode='54000';end if;
  insert into public.pro_subcontractor_access(owner_id,id,supplier_id,vendor_name,recipient_email,token_sha256,expires_at)
   values(p_actor,aid,sup.id,left(btrim(sup.name),160),email,p_input->>'tokenSha256',clock_timestamp()+interval '72 hours') returning * into a;
  insert into public.pro_subcontractor_jobs(owner_id,access_id,work_id) values(p_actor,a.id,wid);
  insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id) values(p_actor,a.id,p_actor,'invite',wid);
  answer:=jsonb_build_object('action',act,'access',public.pro_sub_access_json(a));
 else
  select * into a from public.pro_subcontractor_access where owner_id=p_actor and id=acc for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if a.status='revoked' then raise exception 'Access revoked' using errcode='22023';end if;
  if act='revoke' then
   begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid subcontractor action' using errcode='22023';end;
   if rev<>a.revision then raise exception 'Access changed' using errcode='40001';end if;
   update public.pro_subcontractor_access set status='revoked',revoked_at=clock_timestamp(),revision=revision+1 where owner_id=p_actor and id=acc returning * into a;
   update public.pro_subcontractor_jobs set active=false,updated_at=clock_timestamp() where owner_id=p_actor and access_id=acc and active;
   insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action) values(p_actor,acc,p_actor,'revoke');
  elsif act='add_job' then
   insert into public.pro_subcontractor_jobs(owner_id,access_id,work_id) values(p_actor,acc,wid) on conflict(owner_id,access_id,work_id) do update set active=true,updated_at=clock_timestamp();
   insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id) values(p_actor,acc,p_actor,'add_job',wid);
  elsif act='remove_job' then
   -- Assignments and shares stay recorded but stop applying while the job is not linked.
   update public.pro_subcontractor_jobs set active=false,updated_at=clock_timestamp() where owner_id=p_actor and access_id=acc and work_id=wid;
   insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id) values(p_actor,acc,p_actor,'remove_job',wid);
  else
   if not exists(select 1 from public.pro_subcontractor_jobs where owner_id=p_actor and access_id=acc and work_id=wid and active) then raise exception 'Job not linked' using errcode='42501';end if;
   if act='comment' then
    if a.status<>'active' then raise exception 'Access not active' using errcode='22023';end if;
    if not exists(select 1 from public.pro_subcontractor_tasks where owner_id=p_actor and access_id=acc and task_id=subject and work_id=wid and active) then raise exception 'Forbidden' using errcode='42501';end if;
    if jsonb_typeof(p_input->'body') is distinct from 'string' or length(btrim(p_input->>'body')) not between 1 and 1000 then raise exception 'Invalid comment' using errcode='22023';end if;
    insert into public.pro_subcontractor_comments(owner_id,id,access_id,work_id,task_id,side,author_id,author_name,body)
     values(p_actor,aid,acc,wid,subject,'pro',p_actor,left(coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_actor),public.pro_team_name(p_actor)),160),btrim(p_input->>'body'));
    insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id,subject_id) values(p_actor,acc,p_actor,'comment',wid,subject::text);
   else
    if jsonb_typeof(p_input->'on') is distinct from 'boolean' then raise exception 'Invalid subcontractor action' using errcode='22023';end if;
    on_flag:=(p_input->>'on')::boolean;
    if act='assign_task' then
     if not exists(select 1 from public.pro_work_tasks where owner_id=p_actor and work_id=wid and id=subject and not archived) then raise exception 'Forbidden' using errcode='42501';end if;
     insert into public.pro_subcontractor_tasks(owner_id,access_id,work_id,task_id,active) values(p_actor,acc,wid,subject,on_flag) on conflict(owner_id,access_id,task_id) do update set active=excluded.active,updated_at=clock_timestamp();
     insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id,subject_id) values(p_actor,acc,p_actor,case when on_flag then 'assign_task' else 'unassign_task' end,wid,subject::text);
    else
     if not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=subject and ready) then raise exception 'Forbidden' using errcode='42501';end if;
     insert into public.pro_subcontractor_files(owner_id,access_id,work_id,file_id,active) values(p_actor,acc,wid,subject,on_flag) on conflict(owner_id,access_id,file_id) do update set active=excluded.active,updated_at=clock_timestamp();
     insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id,subject_id) values(p_actor,acc,p_actor,case when on_flag then 'share_file' else 'unshare_file' end,wid,subject::text);
    end if;
   end if;
  end if;
  answer:=jsonb_build_object('action',act,'access',public.pro_sub_access_json(a));
 end if;
 insert into public.pro_subcontractor_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- The invited account accepts with its verified e-mail and the code hash.
create or replace function public.pro_sub_accept(p_actor uuid,p_verified_email text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text:=md5(p_input::text);prior public.pro_subcontractor_actions;a public.pro_subcontractor_access;keys text[];answer jsonb;
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['actionId','tokenSha256'] or coalesce(p_input->>'tokenSha256','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid code' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid code' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-sub:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_subcontractor_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into a from public.pro_subcontractor_access where token_sha256=p_input->>'tokenSha256' for update;
 if not found or a.status<>'pending' or a.expires_at<=clock_timestamp() then raise exception 'Code not available' using errcode='P0002';end if;
 if a.owner_id=p_actor then raise exception 'Forbidden' using errcode='42501';end if;
 if p_verified_email is null or lower(btrim(p_verified_email))<>a.recipient_email then raise exception 'Forbidden' using errcode='42501';end if;
 if exists(select 1 from public.pro_subcontractor_access where owner_id=a.owner_id and member_user_id=p_actor and status='active') then raise exception 'Already linked' using errcode='23505';end if;
 update public.pro_subcontractor_access set status='active',member_user_id=p_actor,member_name=left(public.pro_team_name(p_actor),160),accepted_at=clock_timestamp(),revision=revision+1
  where owner_id=a.owner_id and id=a.id returning * into a;
 insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action) values(a.owner_id,a.id,p_actor,'accept');
 answer:=jsonb_build_object('action','accept','ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=a.owner_id),public.pro_team_name(a.owner_id)));
 insert into public.pro_subcontractor_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- Subcontractor portal: only its linked jobs (every company), projected.
create or replace function public.pro_sub_portal_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('jobs',coalesce((select jsonb_agg(jsonb_build_object(
   'ownerId',a.owner_id,'accessId',a.id,'workId',w.id,
   'company',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=a.owner_id),public.pro_team_name(a.owner_id)),
   'service',w.service,'customerName',coalesce(nullif(btrim(w.client),''),''),'start',nullif(w.start,''),'end',nullif(w."end",''),'cancelled',coalesce(w.cancelled,false),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'details',t.details,'status',t.status,'dueDate',t.due_date,'revision',t.revision,
       'plannedStart',p.planned_start,'plannedEnd',p.planned_end,
       'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'side',c.side,'authorName',c.author_name,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
         from public.pro_subcontractor_comments c where c.owner_id=a.owner_id and c.access_id=a.id and c.task_id=t.id),'[]'::jsonb)) order by coalesce(p.planned_start,t.due_date),t.created_at,t.id)
     from public.pro_subcontractor_tasks st join public.pro_work_tasks t on t.owner_id=st.owner_id and t.work_id=st.work_id and t.id=st.task_id and not t.archived
     left join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id
     where st.owner_id=a.owner_id and st.access_id=a.id and st.work_id=w.id and st.active),'[]'::jsonb),
   'keyDates',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'date',m.milestone_date) order by m.milestone_date,m.id)
     from public.pro_work_schedule_milestones m where m.owner_id=a.owner_id and m.work_id=w.id and not m.archived),'[]'::jsonb),
   'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes) order by f.created_at desc,f.id)
     from public.pro_subcontractor_files sf join public.pro_work_files f on f.owner_id=sf.owner_id and f.work_id=sf.work_id and f.id=sf.file_id and f.ready
     where sf.owner_id=a.owner_id and sf.access_id=a.id and sf.work_id=w.id and sf.active),'[]'::jsonb)) order by w.service,w.id)
  from public.pro_subcontractor_access a join public.pro_subcontractor_jobs j on j.owner_id=a.owner_id and j.access_id=a.id and j.active
  join public.pro_work w on w.user_id=j.owner_id and w.id=j.work_id
  where a.member_user_id=p_actor and a.status='active' and coalesce(public.pro_private_work_tools_enabled(a.owner_id),false)),'[]'::jsonb));
end $$;

-- Subcontractor writes: comment on / complete / reopen ITS assigned tasks.
create or replace function public.pro_sub_portal_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;acc uuid;tid uuid;own uuid;keys text[];hash text:=md5(p_input::text);prior public.pro_subcontractor_actions;
 a public.pro_subcontractor_access;t public.pro_work_tasks;answer jsonb;rev integer;full_before jsonb;
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act is null or not(act='comment' and keys=array['accessId','action','actionId','body','ownerId','taskId'] or act in('complete','reopen') and keys=array['accessId','action','actionId','ownerId','revision','taskId']) then raise exception 'Invalid action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;acc:=(p_input->>'accessId')::uuid;tid:=(p_input->>'taskId')::uuid;own:=(p_input->>'ownerId')::uuid;exception when others then raise exception 'Invalid action' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-sub:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_subcontractor_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into a from public.pro_subcontractor_access where owner_id=own and id=acc and member_user_id=p_actor and status='active';
 if not found or not coalesce(public.pro_private_work_tools_enabled(own),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select t2.* into t from public.pro_subcontractor_tasks st join public.pro_subcontractor_jobs j on j.owner_id=st.owner_id and j.access_id=st.access_id and j.work_id=st.work_id and j.active
  join public.pro_work_tasks t2 on t2.owner_id=st.owner_id and t2.work_id=st.work_id and t2.id=st.task_id and not t2.archived
  where st.owner_id=own and st.access_id=acc and st.task_id=tid and st.active for update of t2;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if act='comment' then
  if jsonb_typeof(p_input->'body') is distinct from 'string' or length(btrim(p_input->>'body')) not between 1 and 1000 then raise exception 'Invalid comment' using errcode='22023';end if;
  if (select count(*) from public.pro_subcontractor_comments where author_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=20 then raise exception 'Too many comments' using errcode='54000';end if;
  insert into public.pro_subcontractor_comments(owner_id,id,access_id,work_id,task_id,side,author_id,author_name,body) values(own,aid,acc,t.work_id,tid,'sub',p_actor,left(coalesce(nullif(a.member_name,''),a.vendor_name),160),btrim(p_input->>'body'));
  insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id,subject_id) values(own,acc,p_actor,'comment',t.work_id,tid::text);
  answer:=jsonb_build_object('action',act,'taskId',tid);
 else
  begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid action' using errcode='22023';end;
  if rev<>t.revision then raise exception 'Task changed' using errcode='40001';end if;
  if act='complete' and t.status<>'open' or act='reopen' and t.status<>'done' then raise exception 'Invalid task transition' using errcode='22023';end if;
  full_before:=public.pro_work_task_json(t);
  update public.pro_work_tasks set status=case when act='complete' then 'done' else 'open' end,revision=revision+1,updated_at=now() where owner_id=own and work_id=t.work_id and id=tid returning * into t;
  -- owner_id is storage scope; the real actor is recorded in pro_subcontractor_events/actions.
  insert into public.pro_work_task_history(owner_id,work_id,task_id,action_id,action,before_task,after_task) values(own,t.work_id,tid,aid,act,full_before,public.pro_work_task_json(t));
  insert into public.pro_subcontractor_events(owner_id,access_id,actor_id,action,work_id,subject_id) values(own,acc,p_actor,act,t.work_id,tid::text);
  answer:=jsonb_build_object('action',act,'taskId',tid,'status',t.status,'revision',t.revision);
 end if;
 insert into public.pro_subcontractor_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- Download of a shared file (object path for the server; null when not shared with this account).
create or replace function public.pro_sub_file_download(p_actor uuid,p_owner uuid,p_file uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type)
 from public.pro_subcontractor_files sf
 join public.pro_subcontractor_access a on a.owner_id=sf.owner_id and a.id=sf.access_id and a.member_user_id=p_actor and a.status='active'
 join public.pro_subcontractor_jobs j on j.owner_id=sf.owner_id and j.access_id=sf.access_id and j.work_id=sf.work_id and j.active
 join public.pro_work_files f on f.owner_id=sf.owner_id and f.work_id=sf.work_id and f.id=sf.file_id and f.ready
 where sf.owner_id=p_owner and sf.file_id=p_file and sf.active and coalesce(public.pro_private_work_tools_enabled(p_owner),false)
 limit 1
$$;

create or replace function public.pro_subcontractor_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Subcontractor history is immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_subcontractor_access','pro_subcontractor_jobs','pro_subcontractor_tasks','pro_subcontractor_files','pro_subcontractor_comments','pro_subcontractor_events','pro_subcontractor_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_subcontractor_comments','pro_subcontractor_events','pro_subcontractor_actions'] loop
  execute format('drop trigger if exists pro_subcontractor_immutable on public.%I',t);execute format('create trigger pro_subcontractor_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_subcontractor_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_sub_access_json','pro_sub_owner_read','pro_sub_owner_mutate','pro_sub_accept','pro_sub_portal_read','pro_sub_portal_mutate','pro_sub_file_download','pro_subcontractor_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
