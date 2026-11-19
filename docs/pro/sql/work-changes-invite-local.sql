-- LOCAL PRO ONLY. Round 4B (2026-11-13): extras/changes for a customer linked by project
-- invitation. work-changes-local.sql authorized the customer only through pro_work."bookingClientId"
-- (a booked appointment). A job linked with work-client-invitations-local.sql has instead one
-- confirmed pro_appointment_requests row with origin='project_invite' and no bookingClientId, so
-- the customer got 404. pro_work_change_client() resolves the job's customer account: the booking
-- customer first, otherwise the confirmed invitation link (enabled account). Supersedes
-- pro_work_changes_page and pro_work_changes_mutate with the same signatures, keys and rules;
-- the only differences are that customer resolution and that a change proposed while no account
-- was linked (client_user_id null) is shown to, and answerable by, the account linked now.
-- No table, row or sent message is changed. Reapplicable.
begin;
create or replace function public.pro_work_change_client(p_owner uuid,p_work text) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(
  (select nullif(w."bookingClientId",'')::uuid from public.pro_work w where w.user_id=p_owner and w.id=p_work and w."bookingClientId" ~ '^[0-9a-fA-F-]{36}$'),
  (select r.client_user_id from public.pro_appointment_requests r join public.profiles c on c.id=r.client_user_id
    where r.owner_id=p_owner and r.work_id=p_work and r.origin='project_invite' and r.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
    order by r.updated_at desc,r.id desc limit 1)) $$;
create or replace function public.pro_work_changes_page(p_actor uuid,p_work text default '',p_request uuid default null,p_after bigint default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w pro_work;a jsonb;owner uuid;side text;result jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 if p_request is not null then
  -- Round 4B: also the customer linked by project invitation (origin 'project_invite', confirmed).
  select x.* into w from pro_appointment_requests r join pro_work x on x.user_id=r.owner_id and x.id=r.work_id
   where r.id=p_request and p_actor in(r.owner_id,r.client_user_id)
    and (x."bookingClientId"=r.client_user_id::text or r.origin='project_invite' and r.status in('confirmed','completed') and r.client_user_id=public.pro_work_change_client(r.owner_id,x.id));
 else select * into w from pro_work where user_id=p_actor and id=p_work;end if;
 if w.id is null then return null;end if;owner:=w.user_id;side:=case when p_actor=owner then 'provider' else 'client' end;
 a:=pro_work_account(owner,w.id);
 with page as(select * from pro_work_changes where owner_id=owner and work_id=w.id and (side='provider' or client_user_id=p_actor or client_user_id is null and p_actor=public.pro_work_change_client(owner,w.id)) and (p_after is null or position<p_after) order by position desc limit 21)
 select jsonb_build_object('side',side,'workId',w.id,'service',w.service,'clientLinked',public.pro_work_change_client(owner,w.id) is not null,'canPropose',side='provider' and pro_work_changes_enabled(owner) and not w.cancelled and a->>'agreedCents' is not null,
 'account',jsonb_build_object('agreedCents',a->'agreedCents','paidCents',a->'paidCents','balanceCents',a->'balanceCents'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position,'reason',reason,'lines',lines,'baseCents',base_cents,'deltaCents',delta_cents,'totalCents',total_cents,'status',status,'stale',status='proposed' and base_position is distinct from (select coalesce(max(e.position),0) from pro_client_entries e where e.user_id=owner and e.work_id=w.id and e.kind='agreement'),'revision',revision,'recordedBy',recorded_by,'acceptanceNote',acceptance_note,'createdAt',created_at,'updatedAt',updated_at) order by position desc) from(select * from page limit 20)t),'[]'),
 'nextCursor',case when(select count(*) from page)>20 then(select position from page offset 19 limit 1) else null end) into result;
 return result;
end $$;
create or replace function public.pro_work_changes_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner uuid;w pro_work;c pro_clients;r pro_work_changes;prior pro_work_change_actions;act text:=p_input->>'action';rid uuid:=(p_input->>'id')::uuid;aid uuid:=(p_input->>'actionId')::uuid;a jsonb;delta bigint:=0;v bigint;entry jsonb;amount numeric;latest bigint;result jsonb;is_owner boolean;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if act='propose' then owner:=p_actor;else select owner_id into owner from pro_work_changes where id=rid and (p_actor in(owner_id,client_user_id) or client_user_id is null and p_actor=public.pro_work_change_client(owner_id,work_id));end if;
 if owner is null or rid is null or aid is null or act not in('propose','accept','decline','withdraw','record_acceptance') then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_work_change_actions where owner_id=owner and actor_id=p_actor and id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Request changed' using errcode='22023';end if;return prior.result;end if;
 is_owner:=p_actor=owner;
 if act not in('decline','withdraw') and not pro_work_changes_enabled(owner) then raise exception 'Pro required' using errcode='42501';end if;
 if act='propose' then select * into w from pro_work where user_id=owner and id=p_input->>'workId' for update;
 else select * into r from pro_work_changes where owner_id=owner and id=rid for update;select * into w from pro_work where user_id=owner and id=r.work_id for update;
  if r.revision<>(p_input->>'revision')::integer or r.status<>'proposed' then raise exception 'Changed' using errcode='40001';end if;
  if not is_owner and public.pro_work_change_client(owner,w.id) is distinct from p_actor or not is_owner and r.client_user_id is distinct from p_actor and r.client_user_id is not null then raise exception 'Forbidden' using errcode='42501';end if;
 end if;
 if w.id is null then raise exception 'Unavailable work' using errcode='42501';end if;
 select * into c from pro_clients where user_id=owner and id=w."clientId";
 a:=pro_work_account(owner,w.id);
 select coalesce(max(position),0) into latest from pro_client_entries where user_id=owner and work_id=w.id and kind='agreement';
 if act='propose' then
  if not is_owner or w.cancelled or c.archived or a->>'agreedCents' is null then raise exception 'Set an active agreement first' using errcode='22023';end if;
  if (a->>'agreedCents')::bigint<>(p_input->>'baseCents')::bigint then raise exception 'Agreement changed' using errcode='40001';end if;
  if jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 20 or length(btrim(p_input->>'reason')) not between 1 and 500 then raise exception 'Invalid change' using errcode='22023';end if;
  if (select count(*) from pro_work_changes where owner_id=owner and work_id=w.id)>=500 then raise exception 'History limit' using errcode='54000';end if;
  for entry in select value from jsonb_array_elements(p_input->'lines') loop
   amount:=(entry->>'amountCents')::numeric;
   if jsonb_typeof(entry->'description') is distinct from 'string' or length(btrim(entry->>'description')) not between 1 and 160 or amount is null or amount<>round(amount) or amount=0 or abs(amount)>10000000000 then raise exception 'Invalid line' using errcode='22023';end if;
   delta:=delta+amount::bigint;
  end loop;
  amount:=(a->>'agreedCents')::bigint+delta;
  if amount<0 or amount>10000000000 or amount<(a->>'paidCents')::bigint then raise exception 'Invalid total or below received payments' using errcode='22023';end if;
  insert into pro_work_changes(owner_id,id,work_id,client_user_id,reason,lines,base_cents,base_position,delta_cents,total_cents)
  values(owner,rid,w.id,public.pro_work_change_client(owner,w.id),btrim(p_input->>'reason'),p_input->'lines',(a->>'agreedCents')::bigint,latest,delta,amount::bigint) returning * into r;
 else
  if act='withdraw' and not is_owner or act in('accept','decline') and is_owner or act='record_acceptance' and not is_owner then raise exception 'Forbidden' using errcode='42501';end if;
  if act in('accept','record_acceptance') then
   if w.cancelled or c.archived or latest<>r.base_position or (a->>'agreedCents')::bigint is distinct from r.base_cents or r.total_cents<(a->>'paidCents')::bigint then raise exception 'Agreement or balance changed' using errcode='40001';end if;
   if act='record_acceptance' and length(btrim(p_input->>'note')) not between 10 and 500 then raise exception 'Explain external approval' using errcode='22023';end if;
   select revision into v from pro_workspace_core where user_id=owner;
   perform pro_record_client_operation(owner,jsonb_build_object('actionId',aid,'clientId',w."clientId",'workId',w.id,'kind','agreement','amountCents',r.total_cents,'note',left('Cambio aprobado: '||r.reason,160)),v::integer);
  end if;
  update pro_work_changes set status=case when act in('accept','record_acceptance') then 'accepted' when act='decline' then 'declined' else 'withdrawn' end,
   revision=revision+1,recorded_by=case when act in('accept','record_acceptance') then case when is_owner then 'provider' else 'client' end end,
   acceptance_note=case when act='record_acceptance' then btrim(p_input->>'note') else '' end,updated_at=now() where owner_id=owner and id=rid returning * into r;
 end if;
 result:=jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status);
 insert into pro_work_change_actions(owner_id,actor_id,id,input,result) values(owner,p_actor,aid,p_input,result);
 return result;
end $$;
revoke all on function public.pro_work_change_client(uuid,text),public.pro_work_changes_page(uuid,text,uuid,bigint),public.pro_work_changes_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_change_client(uuid,text),public.pro_work_changes_page(uuid,text,uuid,bigint),public.pro_work_changes_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
