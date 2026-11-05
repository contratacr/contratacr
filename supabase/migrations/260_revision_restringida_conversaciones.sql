begin;

-- Explicit grants only. Being an admin does not automatically allow reading chat.
create table public.admin_chat_reviewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table public.admin_chat_access_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  conversation_id uuid not null,
  support_ticket_id uuid,
  report_id uuid,
  reason text not null check (char_length(reason) between 15 and 500),
  accessed_at timestamptz not null default now(),
  page_offset integer not null,
  message_count integer not null
);
alter table public.admin_chat_reviewers enable row level security;
alter table public.admin_chat_access_log enable row level security;
revoke all on public.admin_chat_reviewers, public.admin_chat_access_log from public, anon, authenticated, service_role;
grant select, insert, delete on public.admin_chat_reviewers to service_role;
grant select on public.admin_chat_access_log to service_role;
create index admin_chat_access_log_conversation_idx on public.admin_chat_access_log(conversation_id,accessed_at desc);

create function public.admin_chat_authorized() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal' = 'aal2', false) and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) entry
    where entry->>'method' in ('totp','mfa/totp') and jsonb_typeof(entry->'timestamp')='number'
      and (entry->>'timestamp')::numeric>0 and (entry->>'timestamp')::numeric<=extract(epoch from now())+30
  ) and exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and not coalesce(is_disabled, false)
  );
$$;

-- Only metadata leaves the database. Consecutive messages from the same sender
-- wait from the FIRST unanswered message, not from the most recent reminder.
create function public.admin_chat_waiting(p_offset integer default 0, p_side text default 'all', p_hours integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.admin_chat_authorized() then raise insufficient_privilege; end if;
  if p_offset < 0 or p_offset > 100000 or p_side not in ('all','professional','client') or p_hours not in (0,24,48) then
    raise invalid_parameter_value;
  end if;
  with waiting as (
    select c.id, cp.full_name client_name, pp.full_name professional_name,
      case when last_msg.sender_id = c.client_id then 'professional' else 'client' end waiting_for,
      first_msg.since, last_msg.created_at last_message_at
    from direct_conversations c
    join profiles cp on cp.id = c.client_id
    join profiles pp on pp.id = c.professional_profile_id
    cross join lateral (
      select m.id,m.sender_id,m.created_at from direct_messages m
      where m.conversation_id = c.id and m.deleted_at is null
      order by m.created_at desc,m.id desc limit 1
    ) last_msg
    cross join lateral (
      select min(m.created_at) since from direct_messages m
      where m.conversation_id = c.id and m.deleted_at is null and m.sender_id = last_msg.sender_id
      and not exists (
        select 1 from direct_messages reply where reply.conversation_id = c.id and reply.deleted_at is null
        and reply.sender_id <> last_msg.sender_id and (reply.created_at,reply.id) > (m.created_at,m.id)
      )
    ) first_msg
    where c.status = 'open' and last_msg.sender_id in (c.client_id,c.professional_profile_id)
      and not coalesce(cp.is_disabled,false) and not coalesce(pp.is_disabled,false)
  ), filtered as (
    select * from waiting where (p_side = 'all' or waiting_for = p_side)
      and since <= now() - make_interval(hours => p_hours)
  )
  select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(page)) from (
    select * from filtered order by since,id limit 50 offset p_offset
  ) page),'[]'::jsonb), 'total',(select count(*) from filtered),
    'canReview',exists(select 1 from admin_chat_reviewers where user_id = auth.uid())) into result;
  return result;
end;
$$;

-- Audit insertion and content retrieval share a transaction. No best-effort log.
-- Attachments are deliberately excluded: no signed URLs or document previews.
create function public.admin_chat_review(p_conversation uuid, p_ticket uuid, p_reason text, p_offset integer default 0, p_report uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.direct_conversations%rowtype; result jsonb; audit_id uuid;
begin
  if not public.admin_chat_authorized() or not exists(select 1 from admin_chat_reviewers where user_id = auth.uid()) then
    raise insufficient_privilege;
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 15 and 500 or p_offset < 0 or p_offset > 100000 or ((p_ticket is null)=(p_report is null)) then
    raise invalid_parameter_value;
  end if;
  select * into c from direct_conversations where id = p_conversation;
  if not found or not (exists (
    select 1 from support_tickets t where t.id = p_ticket and t.status in ('open','in_progress')
      and t.user_id in (c.client_id,c.professional_profile_id)
  ) or exists(select 1 from reports r where r.id=p_report and r.status='open' and r.conversation_id=p_conversation
    and r.reporter_id in (c.client_id,c.professional_profile_id))) then raise insufficient_privilege; end if;
  select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) into result from (
    select id, sender_id = c.client_id as from_client, created_at, edited_at,
      case when deleted_at is null then body else null end body,
      deleted_at is not null as deleted
    from direct_messages where conversation_id = p_conversation
    order by created_at,id limit 50 offset p_offset
  ) page;
  insert into admin_chat_access_log(actor_id,conversation_id,support_ticket_id,report_id,reason,page_offset,message_count)
    values(auth.uid(),p_conversation,p_ticket,p_report,btrim(p_reason),p_offset,jsonb_array_length(result)) returning id into audit_id;
  return jsonb_build_object('messages',result,'auditId',audit_id);
end;
$$;
revoke all on function public.admin_chat_authorized(), public.admin_chat_waiting(integer,text,integer), public.admin_chat_review(uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function public.admin_chat_authorized(), public.admin_chat_waiting(integer,text,integer), public.admin_chat_review(uuid,uuid,text,integer,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
