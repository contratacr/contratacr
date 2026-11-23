-- Pro family 29 (row 74): Pro support on top of the EXISTING support_tickets thread (topic 'pro', priority, first-response
-- target) and per-account training progress. The first-response time is a TARGET shown to the person, not a commitment,
-- until Isaac approves a service level. Replies reuse the existing support routes and admin panel; nothing parallel is created.
begin;
alter table public.support_tickets
 add column if not exists pro_priority text check(pro_priority is null or pro_priority in('normal','urgent')),
 add column if not exists first_response_due_at timestamptz;
create index if not exists support_tickets_pro_owner on public.support_tickets(user_id,created_at desc) where topic='pro';

create table if not exists public.pro_training_progress(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 lesson_key text not null check(lesson_key~'^[a-z0-9_]{2,60}$'),
 completed_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,lesson_key)
);
alter table public.pro_training_progress enable row level security;
revoke all on public.pro_training_progress from public,anon,authenticated;

create or replace function public.pro_training_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('completed',coalesce((select jsonb_agg(jsonb_build_object('key',lesson_key,'at',completed_at) order by lesson_key)
  from public.pro_training_progress where owner_id=p_actor),'[]'::jsonb));
end $$;

create or replace function public.pro_training_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare k text;done boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_input) key) is distinct from array['completed','lessonKey'] then raise exception 'Invalid input' using errcode='22023';end if;
 if jsonb_typeof(p_input->'lessonKey') is distinct from 'string' or jsonb_typeof(p_input->'completed') is distinct from 'boolean' then raise exception 'Invalid input' using errcode='22023';end if;
 k:=p_input->>'lessonKey';done:=(p_input->>'completed')::boolean;
 if k!~'^[a-z0-9_]{2,60}$' then raise exception 'Invalid lesson' using errcode='22023';end if;
 if done then
  if (select count(*) from public.pro_training_progress where owner_id=p_actor)>=100 then raise exception 'Too many lessons' using errcode='22023';end if;
  insert into public.pro_training_progress(owner_id,lesson_key) values(p_actor,k) on conflict do nothing;
 else delete from public.pro_training_progress where owner_id=p_actor and lesson_key=k;end if;
 return public.pro_training_read(p_actor);
end $$;

-- A Pro support ticket: same table and thread as every other ticket, tagged topic 'pro' with a first-response target
-- (urgent 4 hours, normal 24 hours; calendar time). No automatic "support replied" message is inserted, so the first
-- message from the team is a real answer.
create or replace function public.pro_support_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prof record;t public.support_tickets;v_subject text;v_message text;v_priority text;due timestamptz;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_input) key) is distinct from array['message','priority','subject'] then raise exception 'Invalid input' using errcode='22023';end if;
 v_subject:=btrim(coalesce(p_input->>'subject',''));v_message:=btrim(coalesce(p_input->>'message',''));v_priority:=p_input->>'priority';
 if length(v_subject) not between 3 and 150 or length(v_message) not between 5 and 4000 or v_priority is null or v_priority not in('normal','urgent') then raise exception 'Invalid ticket' using errcode='22023';end if;
 if (select count(*) from public.support_tickets where user_id=p_actor and topic='pro' and status in('open','in_progress'))>=5 then raise exception 'Too many open tickets' using errcode='54000';end if;
 select full_name,email into prof from public.profiles where id=p_actor;
 due:=clock_timestamp()+case when v_priority='urgent' then interval '4 hours' else interval '24 hours' end;
 insert into public.support_tickets(user_id,name,email,subject,message,topic,last_reply_at,last_reply_role,pro_priority,first_response_due_at)
  values(p_actor,prof.full_name,coalesce(prof.email,''),case when v_priority='urgent' then '[Pro urgente] ' else '[Pro] ' end||v_subject,v_message,'pro',clock_timestamp(),'user',v_priority,due) returning * into t;
 insert into public.support_ticket_messages(ticket_id,sender_role,sender_id,sender_name,body) values(t.id,'user',p_actor,prof.full_name,v_message);
 return jsonb_build_object('id',t.id,'caseNumber',t.case_number,'dueAt',due);
end $$;

create or replace function public.pro_support_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('tickets',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'caseNumber',x.case_number,'subject',x.subject,'status',x.status,'priority',x.pro_priority,
   'createdAt',x.created_at,'dueAt',x.first_response_due_at,'firstResponseAt',x.fr,
   'sla',case when x.fr is not null then case when x.fr<=x.first_response_due_at then 'met' else 'late' end when clock_timestamp()>x.first_response_due_at then 'overdue' else 'pending' end,
   'lastReplyRole',x.last_reply_role) order by x.created_at desc)
  from(select t.*,(select min(m.created_at) from public.support_ticket_messages m where m.ticket_id=t.id and m.sender_role='admin') fr
   from public.support_tickets t where t.user_id=p_actor and t.topic='pro' order by t.created_at desc limit 50) x),'[]'::jsonb));
end $$;

revoke all on function public.pro_training_read(uuid),public.pro_training_set(uuid,jsonb),public.pro_support_create(uuid,jsonb),public.pro_support_read(uuid) from public,anon,authenticated;
grant execute on function public.pro_training_read(uuid),public.pro_training_set(uuid,jsonb),public.pro_support_create(uuid,jsonb),public.pro_support_read(uuid) to service_role;
commit;
notify pgrst,'reload schema';
