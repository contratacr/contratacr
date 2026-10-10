-- Durable action receipts and CAPI queue. No browser role can write conversions.
create table if not exists public.growth_conversion_events (
  event_id text primary key,
  is_baseline boolean not null default false,
  action text not null check (action in ('service_contact','project_published','service_hire_confirmed','professional_profile_published','professional_project_contact','professional_project_accepted','service_offer_published','employer_job_published')),
  audience text not null check (audience in ('client','professional','employer')),
  actor_hash text not null,
  attribution jsonb not null default '{}'::jsonb,
  payload jsonb,
  status text not null check (status in ('pending','sending','sent','browser_only','suppressed','expired')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  delivery_mode text check (delivery_mode in ('test','production')),
  created_at timestamptz not null default now()
);
alter table public.growth_conversion_events enable row level security;
revoke all on public.growth_conversion_events from anon, authenticated;
grant all on public.growth_conversion_events to service_role;
create index if not exists growth_conversion_pending on public.growth_conversion_events(next_attempt_at) where status in ('pending','sending');
create or replace function public.claim_growth_conversions(batch_size integer default 25)
returns setof public.growth_conversion_events language plpgsql security definer set search_path = public as $$
begin
  update growth_conversion_events set status='expired', payload=null where status in ('pending','sending') and created_at < now()-interval '6 days';
  -- Personal matching data is short-lived; keep only the action receipt for deduplication.
  update growth_conversion_events set payload=null where status='sent' and sent_at < now()-interval '1 day';
  return query update growth_conversion_events e set status='sending', locked_at=now(), attempts=e.attempts+1
  where e.event_id in (select q.event_id from growth_conversion_events q
    where (q.status='pending' and q.next_attempt_at<=now()) or (q.status='sending' and q.locked_at<now()-interval '5 minutes')
    order by q.created_at for update skip locked limit greatest(1,least(batch_size,100))) returning e.*;
end $$;
revoke all on function public.claim_growth_conversions(integer) from public, anon, authenticated;
grant execute on function public.claim_growth_conversions(integer) to service_role;

create or replace function public.expire_growth_conversion_payloads()
returns void language sql security definer set search_path = public as $$
 update growth_conversion_events set status='expired',payload=null where status in ('pending','sending') and created_at<now()-interval '6 days';
 update growth_conversion_events set payload=null where status='sent' and sent_at<now()-interval '1 day';
$$;
revoke all on function public.expire_growth_conversion_payloads() from public, anon, authenticated;
grant execute on function public.expire_growth_conversion_payloads() to service_role;

-- Seed previous publications as suppressed receipts so an edit/renewal cannot
-- become a new acquisition conversion. No historical actions are sent to Meta.
insert into public.growth_conversion_events(event_id,is_baseline,action,audience,actor_hash,status)
select encode(sha256(convert_to('professional_profile_published:'||p.id::text,'UTF8')),'hex'),true,
 'professional_profile_published','professional',encode(sha256(convert_to(p.profile_id::text,'UTF8')),'hex'),'suppressed'
from public.professionals p join public.profiles account on account.id=p.profile_id
where coalesce(p.is_banned,false)=false and coalesce(p.oculto_del_buscador,false)=false and coalesce(account.is_disabled,false)=false
 and coalesce(p.verification_status,'')<>'rejected' and length(regexp_replace(coalesce(p.whatsapp,''),'[^0-9]','','g'))>=8
 and (p.coverage_country or p.provincia_id is not null or coalesce(cardinality(p.coverage_provincias),0)>0 or jsonb_array_length(case when jsonb_typeof(p.coverage_areas)='array' then p.coverage_areas else '[]'::jsonb end)>0)
 and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p.services)='array' then p.services else '[]'::jsonb end) service
  where coalesce(service->>'active','true')<>'false' and coalesce(service->>'enabled','true')<>'false' and length(coalesce(service->>'name',service->>'title',''))>0)
on conflict(event_id) do nothing;
insert into public.growth_conversion_events(event_id,is_baseline,action,audience,actor_hash,status)
select encode(sha256(convert_to('service_offer_published:'||o.id::text,'UTF8')),'hex'),true,'service_offer_published','professional',
 encode(sha256(convert_to(p.profile_id::text,'UTF8')),'hex'),'suppressed'
from public.professional_offers o join public.professionals p on p.id=o.professional_id
where o.offer_type='service_offer' and o.status<>'draft' on conflict(event_id) do nothing;
insert into public.growth_conversion_events(event_id,is_baseline,action,audience,actor_hash,status)
select encode(sha256(convert_to('employer_job_published:'||j.id::text,'UTF8')),'hex'),true,'employer_job_published','employer',
 encode(sha256(convert_to(p.profile_id::text,'UTF8')),'hex'),'suppressed'
from public.job_posts j join public.professionals p on p.id=j.employer_id
where j.status<>'draft' on conflict(event_id) do nothing;
