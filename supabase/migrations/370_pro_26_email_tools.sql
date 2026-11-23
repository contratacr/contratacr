-- Pro family 10 (email): reusable email templates and a synced inbox of the owner's mailbox.
-- Templates: owner-only, optimistic concurrency (revision), archive instead of delete, name unique among active templates.
-- Inbox: messages read from the connected Google/Microsoft mailbox (mock mode: deterministic samples), stored as a read-only copy
-- (sender, subject, short snippet, date) that the owner can link to a job. Nothing here sends mail. service_role only.
begin;
create table if not exists public.pro_email_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 subject text not null check(length(btrim(subject)) between 1 and 200),
 body text not null check(length(btrim(body)) between 1 and 20000),
 locale text not null default 'es' check(locale in('es','en')),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_email_templates_active_name on public.pro_email_templates(owner_id,lower(btrim(name))) where not archived;

create table if not exists public.pro_inbox_messages(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft')),
 remote_id text not null check(length(remote_id) between 1 and 200),
 mode text not null check(mode in('mock','sandbox','production')),
 from_email text not null check(length(from_email) between 3 and 254),
 from_name text check(from_name is null or length(from_name) between 1 and 120),
 subject text not null check(length(subject) between 1 and 300),
 snippet text not null default '' check(length(snippet)<=400),
 received_at timestamptz not null,
 work_id text,
 synced_at timestamptz not null default now(),
 primary key(owner_id,provider,remote_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete set null(work_id)
);
create index if not exists pro_inbox_messages_recent on public.pro_inbox_messages(owner_id,received_at desc);

create or replace function public.pro_email_templates_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'subject',t.subject,'body',t.body,
   'locale',t.locale,'archived',t.archived,'revision',t.revision,'updatedAt',t.updated_at) order by t.archived,lower(t.name))
  from public.pro_email_templates t where t.owner_id=p_actor),'[]'::jsonb));
end $$;

create or replace function public.pro_email_template_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];act text;tid uuid;rev integer;cur public.pro_email_templates;v_name text;v_subject text;v_body text;v_locale text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid template' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act='save' then
  if keys is distinct from array['action','body','id','locale','name','revision','subject'] then raise exception 'Invalid template fields' using errcode='22023';end if;
 elsif act='archive' then
  if keys is distinct from array['action','id','revision'] then raise exception 'Invalid template fields' using errcode='22023';end if;
 else raise exception 'Invalid action' using errcode='22023';end if;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid revision' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 if jsonb_typeof(p_input->'id')='string' then
  if not coalesce((p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid id' using errcode='22023';end if;
  tid:=(p_input->>'id')::uuid;
 elsif jsonb_typeof(p_input->'id')='null' and act='save' and rev=0 then tid:=gen_random_uuid();
 else raise exception 'Invalid id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-email-template:'||p_actor::text||':'||tid::text,0));
 select * into cur from public.pro_email_templates where owner_id=p_actor and id=tid for update;
 if act='archive' then
  if not found then raise exception 'Template unavailable' using errcode='P0002';end if;
  if cur.revision<>rev then raise exception 'Stale template' using errcode='40001';end if;
  update public.pro_email_templates set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid;
 else
  v_name:=public.pro_purchase_order_text(p_input->'name',80,true);v_subject:=public.pro_purchase_order_text(p_input->'subject',200,true);
  v_body:=public.pro_purchase_order_text(p_input->'body',20000,true);v_locale:=p_input->>'locale';
  if v_locale is null or v_locale not in('es','en') then raise exception 'Invalid locale' using errcode='22023';end if;
  if not found then
   if rev<>0 then raise exception 'Stale template' using errcode='40001';end if;
   if (select count(*) from public.pro_email_templates where owner_id=p_actor and not archived)>=100 then raise exception 'Too many templates' using errcode='54000';end if;
   insert into public.pro_email_templates(owner_id,id,name,subject,body,locale) values(p_actor,tid,v_name,v_subject,v_body,v_locale);
  else
   if cur.revision<>rev then raise exception 'Stale template' using errcode='40001';end if;
   if cur.archived then raise exception 'Template archived' using errcode='22023';end if;
   update public.pro_email_templates set name=v_name,subject=v_subject,body=v_body,locale=v_locale,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid;
  end if;
 end if;
 return (select jsonb_build_object('id',t.id,'name',t.name,'subject',t.subject,'body',t.body,'locale',t.locale,'archived',t.archived,'revision',t.revision,'updatedAt',t.updated_at)
  from public.pro_email_templates t where t.owner_id=p_actor and t.id=tid);
end $$;

create or replace function public.pro_inbox_store(p_actor uuid,p_provider text,p_mode text,p_messages jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare m jsonb;n integer:=0;c integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_provider not in('google','microsoft') or p_mode not in('mock','sandbox','production') then raise exception 'Invalid provider' using errcode='22023';end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>50 then raise exception 'Invalid messages' using errcode='22023';end if;
 for m in select value from jsonb_array_elements(p_messages) loop
  if jsonb_typeof(m) is distinct from 'object' then raise exception 'Invalid message' using errcode='22023';end if;
  insert into public.pro_inbox_messages(owner_id,provider,remote_id,mode,from_email,from_name,subject,snippet,received_at)
  values(p_actor,p_provider,public.pro_purchase_order_text(m->'remoteId',200,true),p_mode,lower(public.pro_purchase_order_text(m->'fromEmail',254,true)),
   public.pro_purchase_order_text(m->'fromName',120,false),left(coalesce(public.pro_purchase_order_text(m->'subject',300,false),'(sin asunto)'),300),
   left(coalesce(public.pro_purchase_order_text(m->'snippet',400,false),''),400),(m->>'receivedAt')::timestamptz)
  on conflict(owner_id,provider,remote_id) do nothing;
  get diagnostics c=row_count;n:=n+c;
 end loop;
 return jsonb_build_object('inserted',n,'received',jsonb_array_length(p_messages));
end $$;

create or replace function public.pro_inbox_read(p_actor uuid,p_limit integer) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid limit' using errcode='22023';end if;
 return jsonb_build_object('messages',coalesce((select jsonb_agg(x order by x->>'receivedAt' desc) from (
   select jsonb_build_object('provider',i.provider,'remoteId',i.remote_id,'mode',i.mode,'fromEmail',i.from_email,'fromName',i.from_name,'subject',i.subject,
    'snippet',i.snippet,'receivedAt',i.received_at,'workId',i.work_id) x
   from public.pro_inbox_messages i where i.owner_id=p_actor order by i.received_at desc limit p_limit) q),'[]'::jsonb));
end $$;

create or replace function public.pro_inbox_link(p_actor uuid,p_provider text,p_remote text,p_work text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_provider not in('google','microsoft') or p_remote is null or length(p_remote) not between 1 and 200 then raise exception 'Invalid message' using errcode='22023';end if;
 if p_work is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Job unavailable' using errcode='P0002';end if;
 update public.pro_inbox_messages set work_id=p_work where owner_id=p_actor and provider=p_provider and remote_id=p_remote;
 if not found then raise exception 'Message unavailable' using errcode='P0002';end if;
 return jsonb_build_object('provider',p_provider,'remoteId',p_remote,'workId',p_work);
end $$;

do $$declare f record;begin
 alter table public.pro_email_templates enable row level security;
 alter table public.pro_inbox_messages enable row level security;
 revoke all on public.pro_email_templates,public.pro_inbox_messages from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_email_templates,public.pro_inbox_messages to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_email_templates_read','pro_email_template_set','pro_inbox_store','pro_inbox_read','pro_inbox_link') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
