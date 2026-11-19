-- LOCAL DRAFT: never applied to remote projects. Fresh migration number required before deployment.
create table public.pro_memberships (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 status text not null check (status in ('active','inactive')), expires_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.pro_workspaces (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 document jsonb not null, revision integer not null check(revision>0), updated_at timestamptz not null default now()
);
create table public.pro_social_requests (
 id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 month text not null, title text not null, link text not null, description text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','published')),
 note text not null default '', published_url text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index pro_one_social_month on public.pro_social_requests(user_id,month) where status<>'rejected';
create table public.pro_audit (
 id bigint generated always as identity primary key, actor uuid references public.profiles(id) on delete set null,
 subject uuid references public.profiles(id) on delete set null, action text not null, detail jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.pro_memberships enable row level security;
alter table public.pro_workspaces enable row level security;
alter table public.pro_social_requests enable row level security;
alter table public.pro_audit enable row level security;
revoke all on public.pro_memberships,public.pro_workspaces,public.pro_social_requests,public.pro_audit from anon,authenticated;
grant select on public.pro_memberships,public.pro_workspaces,public.pro_social_requests to authenticated;
grant all on public.pro_memberships,public.pro_workspaces,public.pro_social_requests,public.pro_audit to service_role;
grant usage,select on sequence public.pro_audit_id_seq to service_role;
create policy pro_membership_owner on public.pro_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy pro_workspace_owner on public.pro_workspaces for select to authenticated using(user_id=(select auth.uid()));
create policy pro_social_owner on public.pro_social_requests for select to authenticated using(user_id=(select auth.uid()));

create function public.pro_save_workspace(p_user uuid,p_document jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspaces where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 v:=coalesce(v,0)+1;
 insert into pro_workspaces(user_id,document,revision) values(p_user,p_document,v)
 on conflict(user_id) do update set document=excluded.document,revision=excluded.revision,updated_at=now();
 return v;
end $$;
create function public.pro_request_social(p_user uuid,p_id uuid,p_title text,p_link text,p_description text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_social_requests;
begin
 insert into pro_social_requests(id,user_id,month,title,link,description)
 values(p_id,p_user,to_char(now() at time zone 'America/Costa_Rica','YYYY-MM'),p_title,p_link,p_description) returning * into r;
 insert into pro_audit(actor,subject,action,detail) values(p_user,p_user,'social.request',jsonb_build_object('id',p_id));
 return to_jsonb(r);
end $$;
create function public.pro_review_social(p_actor uuid,p_id uuid,p_status text,p_note text,p_url text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_social_requests;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and coalesce(is_disabled,false)=false) then raise exception 'admin required'; end if;
 select * into strict r from pro_social_requests where id=p_id for update;
 if not ((r.status='pending' and p_status in ('approved','rejected')) or (r.status='approved' and p_status='published')) then raise exception 'invalid transition'; end if;
 if (p_status='rejected' and length(trim(p_note))=0) or (p_status='published' and p_url not like 'https://%') then raise exception 'missing reason or url'; end if;
 update pro_social_requests set status=p_status,note=p_note,published_url=p_url,updated_at=now() where id=p_id;
 insert into pro_audit(actor,subject,action,detail) values(p_actor,r.user_id,'social.'||p_status,jsonb_build_object('id',p_id,'note',p_note,'url',p_url));
end $$;
create function public.pro_set_membership(p_actor uuid,p_user uuid,p_status text,p_expires timestamptz,p_reason text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and coalesce(is_disabled,false)=false) then raise exception 'admin required'; end if;
 if length(trim(p_reason))=0 then raise exception 'reason required'; end if;
 insert into pro_memberships(user_id,status,expires_at) values(p_user,p_status,p_expires)
 on conflict(user_id) do update set status=excluded.status,expires_at=excluded.expires_at,updated_at=now();
 insert into pro_audit(actor,subject,action,detail) values(p_actor,p_user,'membership.'||p_status,jsonb_build_object('expiresAt',p_expires,'reason',p_reason));
end $$;
revoke all on function public.pro_save_workspace(uuid,jsonb,integer),public.pro_request_social(uuid,uuid,text,text,text),public.pro_review_social(uuid,uuid,text,text,text),public.pro_set_membership(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.pro_save_workspace(uuid,jsonb,integer),public.pro_request_social(uuid,uuid,text,text,text),public.pro_review_social(uuid,uuid,text,text,text),public.pro_set_membership(uuid,uuid,text,timestamptz,text) to service_role;
