begin;
-- A durable ledger is independent of dismissible notifications. Legacy mail is
-- NOT replayed: an old notification proves an attempt, not an email delivery.
create table public.email_delivery_rollout(id boolean primary key default true check(id), started_at timestamptz not null default now());
-- One-hour transition guard: accounts created while old application instances
-- may still send legacy notices are also held rather than replayed.
insert into public.email_delivery_rollout(id,started_at) values(true,now()+interval '1 hour');
create table public.verification_email_history(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 historical_count integer not null default 0, historical_last_at timestamptz,
 history_confirmed boolean not null default false
);
insert into public.verification_email_history(user_id,historical_count,historical_last_at)
 select p.profile_id,count(n.id)::integer,max(n.created_at) from professionals p
 left join notifications n on n.user_id=p.profile_id and n.type='verification_outreach'
 where p.profile_id is not null group by p.profile_id;
create table public.email_deliveries(
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 recipient text not null check(recipient=lower(trim(recipient))), subject text not null,
 purpose text not null check(purpose in ('security','support','activity','campaign','verification')),
 level text not null check(level in ('critico','normal','masivo')),
 user_id uuid references profiles(id) on delete cascade,
 professional_id uuid references professionals(id) on delete cascade,
 verification_sequence integer check(verification_sequence in (1,2)),
 campaign text, payload jsonb,
 status text not null default 'queued' check(status in ('queued','sending','retry','accepted','uncertain','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 attempt_token uuid, lease_until timestamptz, reserved_day date,
 provider_id text, accepted_at timestamptz, delivered_at timestamptz,
 bounced_at timestamptz, opened_at timestamptz, clicked_at timestamptz, last_error text,
 unique(user_id,verification_sequence)
);
create index email_delivery_due on email_deliveries(status,available_at);
create index email_delivery_recipient on email_deliveries(recipient,accepted_at);
create table public.email_delivery_suppressions(recipient text primary key, reason text not null, created_at timestamptz not null default now());
alter table email_delivery_rollout enable row level security;
alter table verification_email_history enable row level security;
alter table email_deliveries enable row level security;
alter table email_delivery_suppressions enable row level security;
revoke all on email_delivery_rollout,verification_email_history,email_deliveries,email_delivery_suppressions from public,anon,authenticated;
grant all on email_delivery_rollout,verification_email_history,email_deliveries,email_delivery_suppressions to service_role;

create function public.verification_email_candidate(p_professional uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pro record; hist record; previous record; seq integer;
begin
 select p.*,a.email,a.created_at account_created,a.is_disabled,a.role into pro
 from professionals p join profiles a on a.id=p.profile_id where p.id=p_professional;
 if not found or pro.is_verified is true or coalesce(pro.verification_status,'') not in ('pending','under_appeal') or pro.is_banned is not false or pro.is_disabled is not false or pro.role='admin' or pro.email is null then
  return jsonb_build_object('reason','ineligible'); end if;
 insert into verification_email_history(user_id,history_confirmed,historical_count,historical_last_at)
 select pro.profile_id,pro.account_created >= (select started_at from email_delivery_rollout where id) and count(n.id)=0,
 count(n.id)::integer,max(n.created_at) from notifications n where n.user_id=pro.profile_id and n.type='verification_outreach'
 on conflict do nothing;
 select * into hist from verification_email_history where user_id=pro.profile_id;
 if not hist.history_confirmed then return jsonb_build_object('reason','historical_hold'); end if;
 select * into previous from email_deliveries where user_id=pro.profile_id and verification_sequence is not null order by verification_sequence desc limit 1;
 if found then
  if previous.status in ('queued','retry','sending') then return jsonb_build_object('sequence',previous.verification_sequence); end if;
  if previous.status <> 'accepted' or previous.bounced_at is not null or previous.verification_sequence>=2 then return jsonb_build_object('reason','already_contacted'); end if;
  if previous.accepted_at > now()-interval '30 days' then return jsonb_build_object('reason','not_due'); end if;
  seq:=2;
 else
  if hist.historical_count>=2 then return jsonb_build_object('reason','already_contacted'); end if;
  if hist.historical_count=1 and (hist.historical_last_at is null or hist.historical_last_at>now()-interval '30 days') then return jsonb_build_object('reason','not_due'); end if;
  seq:=hist.historical_count+1;
 end if;
 return jsonb_build_object('sequence',seq);
end $$;

create function public.enqueue_email_delivery(p_key text,p_recipient text,p_subject text,p_purpose text,p_level text,p_payload jsonb,
 p_campaign text default null,p_professional uuid default null,p_sequence integer default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; account uuid; candidate jsonb;
begin
 if length(p_key)>300 or length(p_subject)>300 or p_payload is null or length(p_payload::text)>10000000 then raise exception 'Invalid envelope'; end if;
 select id into account from profiles where lower(email)=lower(trim(p_recipient)) order by created_at limit 1;
 if p_purpose='verification' then
  candidate:=verification_email_candidate(p_professional);
  if (candidate->>'sequence')::integer is distinct from p_sequence then return null; end if;
 end if;
 insert into email_deliveries(event_key,recipient,subject,purpose,level,payload,campaign,user_id,professional_id,verification_sequence,expires_at)
 values(p_key,lower(trim(p_recipient)),p_subject,p_purpose,p_level,p_payload,p_campaign,account,p_professional,p_sequence,
 now()+case when p_purpose='security' then interval '30 minutes' when p_purpose='activity' then interval '2 days' else interval '45 days' end)
 on conflict(event_key) do nothing returning id into result;
 if result is null then select id into result from email_deliveries where event_key=p_key and recipient=lower(trim(p_recipient)); end if;
 return result;
end $$;

create function public.claim_email_delivery(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare mail email_deliveries; budget integer; held integer; threshold integer; recent timestamptz; due timestamptz; hist record;
begin
 -- Shared with legacy campaign reservations. Serialize daily capacity AND recipient state.
 perform pg_advisory_xact_lock(hashtextextended('outreach-daily',0));
 select * into mail from email_deliveries where id=p_id for update;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(mail.recipient,731));
 -- A crash after dispatch can mean Brevo accepted it. Never replay it blindly.
 update email_deliveries set status='uncertain',last_error='Worker interrupted; reconcile provider receipt',payload=null
 where recipient=mail.recipient and status='sending' and lease_until<now();
 select * into mail from email_deliveries where id=p_id;
 if mail.status not in ('queued','retry') or mail.available_at>now() then return null; end if;
 if mail.expires_at<now() then
  update email_deliveries set status='cancelled',payload=null,last_error='Expired' where id=p_id; return null; end if;
 if mail.purpose in ('activity','campaign','verification') and mail.user_id is not null and exists(select 1 from profiles where id=mail.user_id and (is_disabled is true or lower(email)<>mail.recipient)) then
  update email_deliveries set status='cancelled',payload=null,last_error='Account changed' where id=p_id; return null; end if;
 if exists(select 1 from email_delivery_suppressions where recipient=mail.recipient) or
 (mail.purpose in ('activity','campaign','verification') and exists(select 1 from email_bajas where lower(correo)=mail.recipient)) then
  update email_deliveries set status='cancelled',payload=null,last_error='Recipient suppressed' where id=p_id; return null; end if;
 if mail.purpose='verification' then
  if exists(select 1 from verification_email_history where user_id=mail.user_id and not history_confirmed) or not exists(select 1 from professionals where id=mail.professional_id and is_verified is not true and verification_status in ('pending','under_appeal') and is_banned is not true) then
   update email_deliveries set status='cancelled',payload=null,last_error='Verification no longer eligible' where id=p_id; return null; end if;
 end if;
 if exists(select 1 from email_deliveries where recipient=mail.recipient and id<>mail.id and status='sending') then
  update email_deliveries set available_at=now()+interval '2 minutes' where id=p_id; return null; end if;
 -- Requested account/security/support messages remain prompt. Other email waits.
 if mail.purpose in ('activity','campaign','verification') then
  select max(accepted_at) into recent from email_deliveries where recipient=mail.recipient;
  due:=recent+case when mail.purpose='activity' then interval '5 minutes' else interval '24 hours' end;
  if mail.purpose in ('campaign','verification') then
   due:=greatest(due,(select created_at+interval '24 hours' from profiles where id=mail.user_id));
   select max(t) into recent from (
    select accepted_at t from email_deliveries where recipient=mail.recipient and purpose in ('campaign','verification')
    union all select enviado_en from admin_campaign_sends where lower(email)=mail.recipient and (mail.campaign is null or campana<>mail.campaign)
    union all select h.historical_last_at from verification_email_history h join profiles p on p.id=h.user_id where lower(p.email)=mail.recipient
   ) dates;
   due:=greatest(due,recent+interval '14 days');
   -- Hold uncertain mail to this recipient; it might already be in their inbox.
   if exists(select 1 from email_deliveries where recipient=mail.recipient and id<>mail.id and status='uncertain') then
    update email_deliveries set available_at=now()+interval '1 day',last_error='Awaiting provider reconciliation' where id=p_id; return null; end if;
  end if;
  if due>now() then update email_deliveries set available_at=due where id=p_id; return null; end if;
 end if;
 select coalesce(sum(enviados),0) into budget from email_cuota_diaria where dia=(now() at time zone 'UTC')::date;
 select count(*) into held from email_deliveries where status in ('sending','uncertain') and accepted_at is null and reserved_day=(now() at time zone 'UTC')::date;
 threshold:=case mail.level when 'masivo' then 250 when 'normal' then 260 else 300 end;
 if budget+held>=threshold then
  update email_deliveries set available_at=(date_trunc('day',now() at time zone 'UTC')+interval '1 day 5 minutes') at time zone 'UTC',last_error='Daily quota reserved' where id=p_id; return null; end if;
 update email_deliveries set status='sending',attempts=attempts+1,attempt_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',reserved_day=(now() at time zone 'UTC')::date,last_error=null
 where id=p_id returning * into mail;
 return to_jsonb(mail);
end $$;

create function public.finish_email_delivery(p_id uuid,p_token uuid,p_outcome text,p_provider text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare mail email_deliveries; seq integer; last_day date;
begin
 select * into mail from email_deliveries where id=p_id for update;
 if not found or mail.status<>'sending' or mail.attempt_token is distinct from p_token then return false; end if;
 if p_outcome='accepted' then
  update email_deliveries set status='accepted',accepted_at=now(),provider_id=p_provider,payload=null,lease_until=null,last_error=null where id=p_id;
  insert into email_cuota_diaria(dia,nivel,enviados) values(mail.reserved_day,mail.level,1)
  on conflict(dia,nivel) do update set enviados=email_cuota_diaria.enviados+1;
  if mail.campaign is not null then
   update admin_campaign_sends set status='sent',enviado_en=now() where campana=mail.campaign and lower(email)=mail.recipient;
  end if;
  if mail.purpose='verification' then
   insert into notifications(user_id,type,title,message,data) values(mail.user_id,'verification_outreach',
    case when mail.verification_sequence=2 then 'Falta poco para verificar tu perfil' else 'Tu perfil todavía no está verificado' end,
    'Te enviamos al correo los pasos para verificar tu identidad.',jsonb_build_object('link','/dashboard/profesional?tab=profile&mode=offer&focus=verification','email_delivery_id',mail.id));
  end if;
 elsif p_outcome='retry' and mail.attempts<4 then
  update email_deliveries set status='retry',available_at=now()+make_interval(mins=>least(360,5*(2^mail.attempts)::integer)),lease_until=null,last_error=left(p_error,300) where id=p_id;
 else
  update email_deliveries set status=case when p_outcome='uncertain' then 'uncertain' when p_outcome='cancelled' then 'cancelled' else 'failed' end,
   payload=null,lease_until=null,last_error=left(p_error,300) where id=p_id;
 end if;
 return true;
end $$;

-- Provider confirmations are idempotent and cannot downgrade delivered mail.
create function public.record_email_delivery_event(p_id uuid,p_recipient text,p_event text,p_provider text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare mail email_deliveries;
begin
 select * into mail from email_deliveries where id=p_id and recipient=lower(trim(p_recipient)) for update;
 if not found or mail.attempts=0 or (mail.provider_id is not null and p_provider is not null and mail.provider_id<>p_provider) then return false; end if;
 if p_event in ('delivered','opened','unique_opened','uniqueOpened','click','clicks','sent','request','hard_bounce','hardBounce','hardBounces','blocked','invalid','invalid_email','spam','unsubscribed','soft_bounce','softBounce','deferred') then
  -- Reconcile a crash/unknown result with explicit provider evidence, exactly once.
  if mail.accepted_at is null then
   update email_deliveries set status='sending' where id=p_id;
   perform finish_email_delivery(p_id,mail.attempt_token,'accepted',p_provider);
  end if;
  update email_deliveries set
   delivered_at=case when p_event in ('delivered','opened','unique_opened','uniqueOpened','click','clicks') then coalesce(delivered_at,now()) else delivered_at end,
   opened_at=case when p_event in ('opened','unique_opened','uniqueOpened') then coalesce(opened_at,now()) else opened_at end,
   clicked_at=case when p_event in ('click','clicks') then coalesce(clicked_at,now()) else clicked_at end,
   bounced_at=case when p_event in ('hard_bounce','hardBounce','hardBounces','blocked','invalid','invalid_email','spam') then coalesce(bounced_at,now()) else bounced_at end where id=p_id;
  if p_event in ('hard_bounce','hardBounce','hardBounces','invalid','spam','blocked') then
   insert into email_delivery_suppressions(recipient,reason) values(mail.recipient,p_event) on conflict(recipient) do nothing;
  end if;
 end if;
 return true;
end $$;
-- These tables contain mail bodies/tokens. Only the trusted worker may read them.
revoke all on function verification_email_candidate(uuid),enqueue_email_delivery(text,text,text,text,text,jsonb,text,uuid,integer),claim_email_delivery(uuid),finish_email_delivery(uuid,uuid,text,text,text),record_email_delivery_event(uuid,text,text,text) from public,anon,authenticated;
grant execute on function verification_email_candidate(uuid),enqueue_email_delivery(text,text,text,text,text,jsonb,text,uuid,integer),claim_email_delivery(uuid),finish_email_delivery(uuid,uuid,text,text,text),record_email_delivery_event(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
