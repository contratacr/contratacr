-- Each requester has a private support thread; a retry never creates another.
alter table public.service_suggestion_requests
  add column clarification_ticket_id uuid references public.support_tickets(id) on delete set null;
alter table public.support_ticket_messages add column clarification_request_key uuid;
create unique index support_clarification_question_once on public.support_ticket_messages(ticket_id, clarification_request_key)
  where clarification_request_key is not null;

create function public.request_service_clarification(p_suggestion_id text, p_admin_id uuid, p_question text, p_request_key uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare s public.category_suggestions; r record; ticket uuid; message_id uuid; admin_name text; total integer := 0;
begin
  if not exists(select 1 from public.profiles where id = p_admin_id and role = 'admin' and not coalesce(is_disabled,false)) then
    raise exception 'Administrator required';
  end if;
  if length(trim(p_question)) < 3 or length(p_question) > 2000 or p_request_key is null then raise exception 'Invalid question'; end if;
  select * into s from public.category_suggestions where id = p_suggestion_id for update;
  if not found or s.status <> 'pending' then raise exception 'Pending suggestion required'; end if;
  select full_name into admin_name from public.profiles where id = p_admin_id;
  insert into public.service_suggestion_requests(suggestion_id, profile_id)
    select s.id, s.suggested_by where s.suggested_by is not null on conflict do nothing;
  for r in select q.*, p.full_name, p.email from public.service_suggestion_requests q join public.profiles p on p.id=q.profile_id
    where q.suggestion_id=s.id order by q.profile_id
  loop
    ticket := r.clarification_ticket_id;
    if ticket is null then
      insert into public.support_tickets(user_id,name,email,subject,message,status,topic,last_reply_at,last_reply_role)
        values(r.profile_id,r.full_name,coalesce(r.email,''),'Aclaración del servicio: ' || coalesce(s.label,s.id),trim(p_question),'in_progress','service_suggestion',now(),'admin') returning id into ticket;
      update public.service_suggestion_requests set clarification_ticket_id=ticket where suggestion_id=s.id and profile_id=r.profile_id;
    end if;
    insert into public.support_ticket_messages(ticket_id,sender_role,sender_id,sender_name,body,clarification_request_key)
      values(ticket,'admin',p_admin_id,admin_name,trim(p_question),p_request_key)
      on conflict do nothing returning id into message_id;
    if message_id is not null then
      update public.support_tickets set status='in_progress',user_confirmed=false,last_reply_at=now(),last_reply_role='admin',handled_by=p_admin_id,handled_by_name=admin_name,handled_at=now() where id=ticket;
      insert into public.notifications(user_id,type,title,message,data)
        values(r.profile_id,'support_reply','Contanos más sobre tu servicio','Necesitamos una aclaración para revisar «' || coalesce(s.label,s.id) || '». Podés responder en este mismo caso.',
          jsonb_build_object('link','/dashboard/profesional?tab=soporte&ticket=' || ticket,'ticketId',ticket,'ticket_subject','Aclaración del servicio: ' || coalesce(s.label,s.id),'service_clarification',true));
      total := total + 1;
    end if;
    message_id := null;
  end loop;
  if not exists(select 1 from public.service_suggestion_requests where suggestion_id=s.id and clarification_ticket_id is not null) then raise exception 'No registered requester'; end if;
  return total;
end $$;
revoke all on function public.request_service_clarification(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.request_service_clarification(text,uuid,text,uuid) to service_role;
