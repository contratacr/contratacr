-- Pro row 24 (2026-11-23): quiet hours, digest frequency and a simulated delivery outbox per person.
-- Nothing is sent: channels (email, WhatsApp, push) are adapters; this migration only stores the schedule and the
-- records of what the sandbox adapter "would have sent". Real delivery needs an authorised provider (env secrets).
begin;

do $$ declare c text;
begin
 for c in select conname from pg_constraint where conrelid='public.pro_ops_actions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%notify_channels%' loop
  execute format('alter table public.pro_ops_actions drop constraint %I',c);
 end loop;
 alter table public.pro_ops_actions add constraint pro_ops_actions_kind_check check(kind in('estimate_schedule','task_view','clock_in','clock_settings','timesheet','notify_channels','crew','custom_role',
  'notify_schedule','notify_digest','task_comment','task_file_link'));
end $$;

create table if not exists public.pro_notification_schedule(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null references public.profiles(id) on delete cascade,
 quiet_enabled boolean not null default false,
 quiet_start text not null default '21:00' check(quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 quiet_end text not null default '07:00' check(quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 quiet_weekends boolean not null default false,
 digest_frequency text not null default 'off' check(digest_frequency in('off','daily','weekly')),
 digest_hour smallint not null default 7 check(digest_hour between 0 and 23),
 digest_weekday smallint not null default 1 check(digest_weekday between 1 and 7),
 revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id));

create table if not exists public.pro_notification_outbox(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,channel text not null check(channel in('email','whatsapp','push')),
 mode text not null default 'sandbox' check(mode='sandbox'),status text not null default 'simulated' check(status='simulated'),
 subject text not null check(length(subject) between 1 and 200),body text not null check(length(body)<=1200),unread_count integer not null check(unread_count>=0),
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,person_id,id));
create index if not exists pro_notification_outbox_page on public.pro_notification_outbox(owner_id,person_id,created_at desc,id desc);

create or replace function public.pro_notification_schedule_read(p_owner uuid,p_person uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_notification_schedule;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into s from public.pro_notification_schedule where owner_id=p_owner and person_id=p_person;
 return jsonb_build_object('revision',coalesce(s.revision,0),'delivery','sandbox',
  'quietEnabled',coalesce(s.quiet_enabled,false),'quietStart',coalesce(s.quiet_start,'21:00'),'quietEnd',coalesce(s.quiet_end,'07:00'),'quietWeekends',coalesce(s.quiet_weekends,false),
  'digestFrequency',coalesce(s.digest_frequency,'off'),'digestHour',coalesce(s.digest_hour,7),'digestWeekday',coalesce(s.digest_weekday,1),
  'outbox',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'channel',o.channel,'status',o.status,'subject',o.subject,'body',o.body,'unreadCount',o.unread_count,'at',o.created_at) order by o.created_at desc,o.id desc)
   from (select * from public.pro_notification_outbox where owner_id=p_owner and person_id=p_person order by created_at desc,id desc limit 10) o),'[]'::jsonb));
end $$;

create or replace function public.pro_notification_schedule_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;cur integer;answer jsonb;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['actionId','digestFrequency','digestHour','digestWeekday','quietEnabled','quietEnd','quietStart','quietWeekends','revision']
  or jsonb_typeof(p_input->'quietEnabled')<>'boolean' or jsonb_typeof(p_input->'quietWeekends')<>'boolean'
  or p_input->>'digestFrequency' not in('off','daily','weekly')
  or not coalesce(p_input->>'quietStart'~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false) or not coalesce(p_input->>'quietEnd'~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false)
  or jsonb_typeof(p_input->'digestHour')<>'number' or jsonb_typeof(p_input->'digestWeekday')<>'number' or jsonb_typeof(p_input->'revision')<>'number'
  or (p_input->>'digestHour')::numeric not between 0 and 23 or (p_input->>'digestHour')::numeric<>trunc((p_input->>'digestHour')::numeric)
  or (p_input->>'digestWeekday')::numeric not between 1 and 7 or (p_input->>'digestWeekday')::numeric<>trunc((p_input->>'digestWeekday')::numeric)
  or (p_input->>'revision')::numeric<0 or (p_input->>'revision')::numeric<>trunc((p_input->>'revision')::numeric) then raise exception 'Invalid schedule' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid schedule' using errcode='22023';end;
 if p_input->>'quietEnabled'='true' and p_input->>'quietStart'=p_input->>'quietEnd' then raise exception 'Invalid quiet hours' using errcode='22023';end if;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-notify-schedule:'||p_owner::text||':'||p_person::text,0));
 select revision into cur from public.pro_notification_schedule where owner_id=p_owner and person_id=p_person for update;cur:=coalesce(cur,0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Schedule changed' using errcode='40001';end if;
 insert into public.pro_notification_schedule(owner_id,person_id,quiet_enabled,quiet_start,quiet_end,quiet_weekends,digest_frequency,digest_hour,digest_weekday,revision)
  values(p_owner,p_person,(p_input->>'quietEnabled')::boolean,p_input->>'quietStart',p_input->>'quietEnd',(p_input->>'quietWeekends')::boolean,p_input->>'digestFrequency',(p_input->>'digestHour')::smallint,(p_input->>'digestWeekday')::smallint,cur+1)
  on conflict(owner_id,person_id) do update set quiet_enabled=excluded.quiet_enabled,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,quiet_weekends=excluded.quiet_weekends,
   digest_frequency=excluded.digest_frequency,digest_hour=excluded.digest_hour,digest_weekday=excluded.digest_weekday,revision=excluded.revision,updated_at=clock_timestamp();
 answer:=public.pro_notification_schedule_read(p_owner,p_person);
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'notify_schedule',hash,answer);
 return answer;
end $$;

-- Sandbox adapter in SQL form: builds the digest of the person's unread notices and records what each requested channel
-- would have sent. No provider is called; the record is the evidence.
create or replace function public.pro_notification_digest_simulate(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;ch text;unread integer;lines text;subj text;answer jsonb;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['actionId','channels'] or jsonb_typeof(p_input->'channels')<>'array' or jsonb_array_length(p_input->'channels') not between 1 and 3 then raise exception 'Invalid digest' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid digest' using errcode='22023';end;
 if exists(select 1 from jsonb_array_elements(p_input->'channels') c where jsonb_typeof(c)<>'string' or c#>>'{}' not in('email','whatsapp','push'))
  or (select count(distinct c#>>'{}') from jsonb_array_elements(p_input->'channels') c)<>jsonb_array_length(p_input->'channels') then raise exception 'Invalid channel' using errcode='22023';end if;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 select count(*) into unread from public.pro_notifications where owner_id=p_owner and person_id=p_person and read_at is null;
 select coalesce(string_agg('- '||left(title,120),E'\n' order by created_at desc),'') into lines from (select title,created_at from public.pro_notifications where owner_id=p_owner and person_id=p_person and read_at is null order by created_at desc,id desc limit 5) n;
 subj:='ContrataCR: '||unread||' unread';
 for ch in select c#>>'{}' from jsonb_array_elements(p_input->'channels') c loop
  insert into public.pro_notification_outbox(owner_id,person_id,id,channel,subject,body,unread_count)
   values(p_owner,p_person,pro_ops_uuid(aid::text||':'||ch),ch,subj,left(lines,1200),unread) on conflict do nothing;
 end loop;
 delete from public.pro_notification_outbox o where o.owner_id=p_owner and o.person_id=p_person and (o.owner_id,o.person_id,o.id) not in
  (select owner_id,person_id,id from public.pro_notification_outbox where owner_id=p_owner and person_id=p_person order by created_at desc,id desc limit 50);
 answer:=public.pro_notification_schedule_read(p_owner,p_person)||jsonb_build_object('simulated',jsonb_array_length(p_input->'channels'));
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'notify_digest',hash,answer);
 return answer;
end $$;

do $$ declare t text;f record;
begin
 foreach t in array array['pro_notification_schedule','pro_notification_outbox'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_notification_schedule_read','pro_notification_schedule_save','pro_notification_digest_simulate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
