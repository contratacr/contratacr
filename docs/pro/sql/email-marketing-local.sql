-- LOCAL PRO ONLY. Round 6D (2026-11-13): email campaigns and automations for professionals (row 71).
-- * Audience = the professional's own contacts (Pro clients / leads) WITH explicit marketing consent. Consent is
--   recorded with its text, source, evidence and date (immutable events). Revocation and every unsubscribe put
--   the address on a per-owner suppression list (SHA-256 of the lowercase email; insert-only).
-- * The DATABASE refuses any campaign/automation message to a contact that is not «granted» or is suppressed
--   (trigger pro_mkt_message_guard, 42501 pro_mkt_no_consent): no code path can send to non-consenting people.
-- * Test sends go only to the owner's own account email (outbox viewer). In mock mode every message is stored
--   as «simulado» (CHECK): nothing leaves the machine. Real delivery needs the marketing_email provider (inactive).
-- * Automations (follow-up after a quote was shared, review request after a completed job) only create DRAFTS in
--   «pending_approval»; nothing is queued until the owner approves each draft.
-- * Every unsubscribe link carries a random token whose SHA-256 is stored; the public page only needs the token.
-- * Post-security fixes (2026-11-13), Ley 8968 DOUBLE OPT-IN: a site-form tick only creates a «pending» contact and a
--   confirmation email (mock adapter: stored as «simulado», never sent) carrying a single-use token whose SHA-256 is
--   stored. Only the recipient's confirmation makes the contact «granted»; the CHECK pro_mkt_contacts_double_optin and
--   the message guard refuse any campaign/automation to a site-form contact that never confirmed. Owner-recorded
--   consent with evidence is unchanged. An unsubscribed address gets nothing (same public answer as anyone).
-- Tables: RLS on, service_role only; history/events/messages/suppressions immutable; functions security invoker.
begin;
create or replace function public.pro_mkt_email_hash(p_email text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$ select encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex') $$;
create table if not exists public.pro_mkt_contacts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 email text not null check(length(email) between 3 and 254 and email~'^[^@\s]+@[^@\s]+\.[^@\s]+$' and email=lower(email)),
 email_hash text generated always as (public.pro_mkt_email_hash(email)) stored,
 name text not null check(length(btrim(name)) between 1 and 160),
 client_id text check(client_id is null or length(client_id) between 1 and 160),
 lead_id uuid,
 consent text not null default 'none' check(consent in('granted','revoked','none')),
 consent_source text check(consent_source is null or consent_source in('site_form','owner_recorded')),
 consent_text text check(consent_text is null or length(consent_text) between 20 and 1000),
 consent_at timestamptz,revoked_at timestamptz,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,email),
 check(consent<>'granted' or (consent_source is not null and consent_text is not null and consent_at is not null)),
 check(consent<>'revoked' or revoked_at is not null)
);
create table if not exists public.pro_mkt_consent_events(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,contact_id uuid not null,
 event text not null check(event in('granted','revoked','unsubscribed')),
 source text not null check(source in('site_form','owner_recorded','unsubscribe_link','owner_revoked')),
 consent_text text check(consent_text is null or length(consent_text)<=1000),
 evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=2048),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,id),
 foreign key(owner_id,contact_id) references public.pro_mkt_contacts(owner_id,id) on delete cascade
);
create table if not exists public.pro_mkt_suppressions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 email_hash text not null check(email_hash~'^[a-f0-9]{64}$'),
 reason text not null check(reason in('unsubscribed','owner','bounced','complaint')),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,email_hash)
);
create table if not exists public.pro_mkt_unsubscribe_tokens(
 token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),
 owner_id uuid not null references public.profiles(id) on delete cascade,contact_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),used_at timestamptz,
 foreign key(owner_id,contact_id) references public.pro_mkt_contacts(owner_id,id) on delete cascade
);
create table if not exists public.pro_mkt_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 subject text not null check(length(btrim(subject)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 8000),
 archived boolean not null default false,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,id)
);
create table if not exists public.pro_mkt_campaigns(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 subject text not null check(length(btrim(subject)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 8000),
 segment text not null default 'all' check(segment in('all','clients','leads')),
 status text not null default 'draft' check(status in('draft','scheduled','sent','cancelled')),
 scheduled_at timestamptz,sent_at timestamptz,recipients integer check(recipients is null or recipients>=0),
 mode text check(mode is null or mode in('mock','sandbox','production')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,id),
 check((status='scheduled')=(scheduled_at is not null and sent_at is null) or status<>'scheduled'),
 check((status='sent')=(sent_at is not null and recipients is not null and mode is not null))
);
create table if not exists public.pro_mkt_automations(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('quote_followup','review_request')),
 enabled boolean not null default false,delay_days integer not null default 3 check(delay_days between 0 and 60),
 subject text not null check(length(btrim(subject)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 8000),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,kind)
);
create table if not exists public.pro_mkt_automation_drafts(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 kind text not null check(kind in('quote_followup','review_request')),
 ref_kind text not null check(ref_kind in('estimate_publication','work')),ref_id text not null check(length(ref_id) between 1 and 160),
 ref_label text not null check(length(ref_label) between 1 and 200),
 contact_id uuid not null,subject text not null,body text not null,
 status text not null default 'pending_approval' check(status in('pending_approval','approved','rejected')),
 created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,message_id uuid,
 primary key(owner_id,id),unique(owner_id,kind,ref_id),
 foreign key(owner_id,contact_id) references public.pro_mkt_contacts(owner_id,id) on delete cascade,
 check((status='pending_approval')=(decided_at is null)),check((status='approved')=(message_id is not null))
);
create table if not exists public.pro_mkt_messages(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 kind text not null check(kind in('test','campaign','automation')),
 campaign_id uuid,draft_id uuid,contact_id uuid,
 to_email text not null check(length(to_email) between 3 and 254),
 subject text not null check(length(subject) between 1 and 200),body text not null check(length(body) between 1 and 12000),
 token_hash text check(token_hash is null or token_hash~'^[a-f0-9]{64}$'),
 mode text not null check(mode in('mock','sandbox','production')),
 delivery text not null check(delivery in('simulado','queued','sent','failed')),
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,id),
 check(mode<>'mock' or delivery='simulado'),
 check(kind='test' or (contact_id is not null and token_hash is not null)),
 check((kind='campaign')=(campaign_id is not null)),check((kind='automation')=(draft_id is not null))
);
create index if not exists pro_mkt_messages_recent on public.pro_mkt_messages(owner_id,created_at desc);
create table if not exists public.pro_mkt_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_mkt_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 action text not null,entity text not null,entity_id text not null,snapshot jsonb not null check(octet_length(snapshot::text)<=32768),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);


-- Post-security fixes: double opt-in columns and rules (idempotent for databases that already have the tables).
alter table public.pro_mkt_contacts add column if not exists confirmation_requested_at timestamptz,add column if not exists confirmed_at timestamptz;
alter table public.pro_mkt_contacts drop constraint if exists pro_mkt_contacts_consent_check;
alter table public.pro_mkt_contacts add constraint pro_mkt_contacts_consent_check check(consent in('granted','pending','revoked','none'));
alter table public.pro_mkt_contacts drop constraint if exists pro_mkt_contacts_double_optin;
alter table public.pro_mkt_contacts add constraint pro_mkt_contacts_double_optin check(consent<>'granted' or consent_source is distinct from 'site_form' or confirmed_at is not null);
alter table public.pro_mkt_contacts drop constraint if exists pro_mkt_contacts_pending;
alter table public.pro_mkt_contacts add constraint pro_mkt_contacts_pending check(consent<>'pending' or (consent_source='site_form' and consent_text is not null and confirmation_requested_at is not null and confirmed_at is null));
alter table public.pro_mkt_consent_events drop constraint if exists pro_mkt_consent_events_event_check;
alter table public.pro_mkt_consent_events add constraint pro_mkt_consent_events_event_check check(event in('granted','revoked','unsubscribed','requested','confirmed'));
alter table public.pro_mkt_consent_events drop constraint if exists pro_mkt_consent_events_source_check;
alter table public.pro_mkt_consent_events add constraint pro_mkt_consent_events_source_check check(source in('site_form','owner_recorded','unsubscribe_link','owner_revoked','confirmation_link'));
-- The confirmation email of the MOCK adapter (never sent) with its single-use token (only the SHA-256 is the key).
-- Owners never read this table (no reader exposes it): an owner cannot confirm on the recipient's behalf.
create table if not exists public.pro_mkt_confirmations(
 token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),
 owner_id uuid not null references public.profiles(id) on delete cascade,contact_id uuid not null,
 to_email text not null check(length(to_email) between 3 and 254),
 subject text not null check(length(subject) between 1 and 200),body text not null check(length(body) between 1 and 4000),
 mode text not null default 'mock' check(mode='mock'),delivery text not null default 'simulado' check(delivery='simulado'),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,used_at timestamptz,
 check(expires_at>created_at),
 foreign key(owner_id,contact_id) references public.pro_mkt_contacts(owner_id,id) on delete cascade
);
create index if not exists pro_mkt_confirmations_contact on public.pro_mkt_confirmations(owner_id,contact_id,created_at desc);

-- ---------------------------------------------------------------- guards
create or replace function public.pro_mkt_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Marketing history, consent events, suppressions and messages are immutable' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['pro_mkt_consent_events','pro_mkt_suppressions','pro_mkt_messages','pro_mkt_actions','pro_mkt_history'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.pro_mkt_immutable()',t||'_immutable',t);
end loop;end $$;
-- The consent rule lives in the database: a campaign or automation message needs a granted, non-suppressed contact.
create or replace function public.pro_mkt_message_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_mkt_contacts;
begin
 if new.kind='test' then
  if lower(new.to_email) is distinct from (select lower(email) from public.profiles where id=new.owner_id) then
   raise exception 'Test sends only go to the owner''s own email' using errcode='42501',hint='pro_mkt_test_owner_only';end if;
  return new;end if;
 select * into c from public.pro_mkt_contacts where owner_id=new.owner_id and id=new.contact_id;
 if not found or c.consent<>'granted' or c.email<>lower(new.to_email)
    or (c.consent_source='site_form' and c.confirmed_at is null) -- double opt-in: a site-form contact must have confirmed
    or exists(select 1 from public.pro_mkt_suppressions s where s.owner_id=new.owner_id and s.email_hash=public.pro_mkt_email_hash(new.to_email)) then
  raise exception 'No marketing consent for this recipient' using errcode='42501',hint='pro_mkt_no_consent';end if;
 return new;
end $$;
create or replace function public.pro_mkt_confirmation_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-'used_at') is distinct from (to_jsonb(old)-'used_at') or old.used_at is not null then
  raise exception 'A confirmation is immutable and single-use' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_mkt_confirmation_guard on public.pro_mkt_confirmations;
create trigger pro_mkt_confirmation_guard before update on public.pro_mkt_confirmations for each row execute function public.pro_mkt_confirmation_guard();
drop trigger if exists pro_mkt_message_guard on public.pro_mkt_messages;
create trigger pro_mkt_message_guard before insert on public.pro_mkt_messages for each row execute function public.pro_mkt_message_guard();
create or replace function public.pro_mkt_draft_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.owner_id,new.id,new.kind,new.ref_kind,new.ref_id,new.contact_id,new.subject,new.body,new.created_at) is distinct from (old.owner_id,old.id,old.kind,old.ref_kind,old.ref_id,old.contact_id,old.subject,old.body,old.created_at) then
  raise exception 'An automation draft is immutable' using errcode='23514';end if;
 if old.status<>'pending_approval' and (new.status,new.decided_at,new.message_id) is distinct from (old.status,old.decided_at,old.message_id) then
  raise exception 'The approval decision is recorded once' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_mkt_draft_guard on public.pro_mkt_automation_drafts;
create trigger pro_mkt_draft_guard before update on public.pro_mkt_automation_drafts for each row execute function public.pro_mkt_draft_guard();

-- ---------------------------------------------------------------- helpers
create or replace function public.pro_mkt_owner(p_actor uuid) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;end $$;
create or replace function public.pro_mkt_business(p_owner uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(nullif(btrim(p.business_name),''),nullif(btrim(f.full_name),''),'ContrataCR') from public.profiles f left join public.professionals p on p.profile_id=f.id where f.id=p_owner $$;
create or replace function public.pro_mkt_contact_json(c public.pro_mkt_contacts) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',c.id,'email',c.email,'name',c.name,'clientId',c.client_id,'leadId',c.lead_id,'consent',c.consent,'consentSource',c.consent_source,'consentText',c.consent_text,'consentAt',c.consent_at,'revokedAt',c.revoked_at,'confirmationRequestedAt',c.confirmation_requested_at,'confirmedAt',c.confirmed_at,
  'suppressed',exists(select 1 from public.pro_mkt_suppressions s where s.owner_id=c.owner_id and s.email_hash=c.email_hash),'revision',c.revision,'createdAt',c.created_at) $$;
/** Records explicit consent (site form or the owner attesting consent obtained). A suppressed address stays suppressed. */
create or replace function public.pro_mkt_grant(p_owner uuid,p_email text,p_name text,p_source text,p_text text,p_evidence jsonb,p_client text,p_lead uuid) returns public.pro_mkt_contacts
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_mkt_contacts;e text:=lower(btrim(p_email));
begin
 -- Double opt-in: consent from the site form is never granted here (pro_mkt_request_confirmation + pro_mkt_confirm).
 if p_source is distinct from 'owner_recorded' then raise exception 'Only owner-recorded consent is granted directly' using errcode='22023';end if;
if exists(select 1 from public.pro_mkt_suppressions where owner_id=p_owner and email_hash=public.pro_mkt_email_hash(e)) then
  raise exception 'This address unsubscribed; it cannot be added again from here' using errcode='42501',hint='pro_mkt_suppressed';end if;
 insert into public.pro_mkt_contacts(owner_id,id,email,name,client_id,lead_id,consent,consent_source,consent_text,consent_at)
 values(p_owner,gen_random_uuid(),e,btrim(p_name),p_client,p_lead,'granted',p_source,p_text,clock_timestamp())
 on conflict(owner_id,email) do update set name=excluded.name,client_id=coalesce(pro_mkt_contacts.client_id,excluded.client_id),lead_id=coalesce(pro_mkt_contacts.lead_id,excluded.lead_id),
  consent='granted',consent_source=excluded.consent_source,consent_text=excluded.consent_text,consent_at=excluded.consent_at,revoked_at=null,revision=pro_mkt_contacts.revision+1,updated_at=clock_timestamp()
 returning * into c;
 insert into public.pro_mkt_consent_events(owner_id,id,contact_id,event,source,consent_text,evidence) values(p_owner,gen_random_uuid(),c.id,'granted',p_source,p_text,coalesce(p_evidence,'{}'));
 return c;
end $$;
create or replace function public.pro_mkt_suppress(p_owner uuid,p_contact uuid,p_reason text,p_source text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_mkt_contacts;
begin
 select * into c from public.pro_mkt_contacts where owner_id=p_owner and id=p_contact for update;if not found then raise exception 'Contact unavailable' using errcode='P0002';end if;
 insert into public.pro_mkt_suppressions(owner_id,email_hash,reason) values(p_owner,c.email_hash,p_reason) on conflict do nothing;
 if c.consent<>'revoked' then
  update public.pro_mkt_contacts set consent='revoked',revoked_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=p_contact;
  insert into public.pro_mkt_consent_events(owner_id,id,contact_id,event,source) values(p_owner,gen_random_uuid(),p_contact,case when p_reason='unsubscribed' then 'unsubscribed' else 'revoked' end,p_source);
 end if;
end $$;
create or replace function public.pro_mkt_render(p_owner uuid,p_text text,p_name text,p_link text) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select replace(replace(replace(p_text,'{{nombre}}',split_part(btrim(coalesce(p_name,'')),' ',1)),'{{negocio}}',public.pro_mkt_business(p_owner)),'{{enlace}}',coalesce(p_link,'')) $$;
create or replace function public.pro_mkt_base_ok(p_base text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin if p_base is null or p_base!~'^https?://[A-Za-z0-9.:-]{3,120}$' then raise exception 'Invalid base URL' using errcode='22023';end if;return p_base;end $$;
/** One outbox message for one consenting contact, with its own unsubscribe token. The guard trigger re-checks consent. */
create or replace function public.pro_mkt_enqueue(p_owner uuid,p_contact uuid,p_kind text,p_campaign uuid,p_draft uuid,p_subject text,p_body text,p_mode text,p_base text,p_link text default null) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_mkt_contacts;token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');mid uuid:=gen_random_uuid();url text;footer text;
begin
 select * into c from public.pro_mkt_contacts where owner_id=p_owner and id=p_contact;
 url:=public.pro_mkt_base_ok(p_base)||'/baja-pro#t='||token;
 footer:=E'\n\n—\n'||public.pro_mkt_business(p_owner)||E'\nRecibe este correo porque aceptó recibir información de este negocio. Para no recibir más correos: '||url||E'\nYou receive this email because you agreed to hear from this business. Unsubscribe: '||url;
 insert into public.pro_mkt_unsubscribe_tokens(token_hash,owner_id,contact_id) values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_owner,p_contact);
 insert into public.pro_mkt_messages(owner_id,id,kind,campaign_id,draft_id,contact_id,to_email,subject,body,token_hash,mode,delivery)
 values(p_owner,mid,p_kind,p_campaign,p_draft,p_contact,coalesce(c.email,'unknown@invalid'),left(public.pro_mkt_render(p_owner,p_subject,c.name,p_link),200),left(public.pro_mkt_render(p_owner,p_body,c.name,p_link)||footer,12000),
  encode(sha256(convert_to(token,'UTF8')),'hex'),p_mode,case when p_mode='mock' then 'simulado' else 'queued' end);
 return mid;
end $$;
create or replace function public.pro_mkt_audience(p_owner uuid,p_segment text) returns setof public.pro_mkt_contacts
language sql stable security invoker set search_path=public,pg_temp as $$
 select c.* from public.pro_mkt_contacts c where c.owner_id=p_owner and c.consent='granted'
  and not exists(select 1 from public.pro_mkt_suppressions s where s.owner_id=c.owner_id and s.email_hash=c.email_hash)
  and (p_segment='all' or p_segment='clients' and c.client_id is not null or p_segment='leads' and c.lead_id is not null) order by c.created_at,c.id $$;
create or replace function public.pro_mkt_dispatch(p_owner uuid,p_campaign uuid,p_mode text,p_base text) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare k public.pro_mkt_campaigns;c public.pro_mkt_contacts;n integer:=0;
begin
 select * into k from public.pro_mkt_campaigns where owner_id=p_owner and id=p_campaign for update;
 if not found then raise exception 'Campaign unavailable' using errcode='P0002';end if;
 if k.status not in('draft','scheduled') then raise exception 'Campaign already sent or cancelled' using errcode='40001';end if;
 for c in select * from public.pro_mkt_audience(p_owner,k.segment) limit 2000 loop
  perform public.pro_mkt_enqueue(p_owner,c.id,'campaign',k.id,null,k.subject,k.body,p_mode,p_base);n:=n+1;
 end loop;
 update public.pro_mkt_campaigns set status='sent',scheduled_at=null,sent_at=clock_timestamp(),recipients=n,mode=p_mode,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=p_campaign;
 return n;
end $$;
create or replace function public.pro_mkt_campaign_json(k public.pro_mkt_campaigns) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',k.id,'name',k.name,'subject',k.subject,'body',k.body,'segment',k.segment,'status',k.status,'scheduledAt',k.scheduled_at,'sentAt',k.sent_at,'recipients',k.recipients,'mode',k.mode,'revision',k.revision,'updatedAt',k.updated_at,
  'audience',(select count(*) from public.pro_mkt_audience(k.owner_id,k.segment))) $$;
create or replace function public.pro_mkt_default_automation(p_kind text) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_kind when 'quote_followup' then jsonb_build_object('subject','¿Pudo revisar la cotización?','body',E'Hola {{nombre}}:\n\nLe escribimos para saber si pudo revisar la cotización «{{enlace}}». Con gusto respondemos sus preguntas.\n\nSaludos,\n{{negocio}}','delayDays',3)
  else jsonb_build_object('subject','¿Cómo le fue con el trabajo?','body',E'Hola {{nombre}}:\n\nGracias por confiar en {{negocio}}. Si quedó satisfecho, nos ayudaría mucho una reseña en ContrataCR: {{enlace}}\n\nSaludos,\n{{negocio}}','delayDays',1) end $$;
create or replace function public.pro_mkt_automation_json(p_owner uuid,p_kind text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when a.kind is null then jsonb_build_object('kind',p_kind,'enabled',false,'delayDays',(d->>'delayDays')::int,'subject',d->>'subject','body',d->>'body','revision',0)
  else jsonb_build_object('kind',a.kind,'enabled',a.enabled,'delayDays',a.delay_days,'subject',a.subject,'body',a.body,'revision',a.revision) end
 from (select public.pro_mkt_default_automation(p_kind) d) x left join public.pro_mkt_automations a on a.owner_id=p_owner and a.kind=p_kind $$;

-- ---------------------------------------------------------------- read
create or replace function public.pro_mkt_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object(
  'ownerEmail',(select email from public.profiles where id=p_actor),'business',public.pro_mkt_business(p_actor),
  'contacts',coalesce((select jsonb_agg(public.pro_mkt_contact_json(c) order by c.created_at desc) from (select * from public.pro_mkt_contacts where owner_id=p_actor order by created_at desc limit 300) c),'[]'),
  'counts',jsonb_build_object('granted',(select count(*) from public.pro_mkt_audience(p_actor,'all')),'revoked',(select count(*) from public.pro_mkt_contacts where owner_id=p_actor and consent='revoked'),
   'suppressed',(select count(*) from public.pro_mkt_suppressions where owner_id=p_actor),
   'withoutConsent',(select count(*) from public.pro_clients k where k.user_id=p_actor and not k.archived and k.email~'@' and not exists(select 1 from public.pro_mkt_contacts c where c.owner_id=p_actor and c.email=lower(btrim(k.email)) and c.consent='granted'))),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('clientId',k.id,'name',k.name,'email',lower(btrim(k.email))) order by k.name) from (select * from public.pro_clients k where k.user_id=p_actor and not k.archived and k.email~'^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and not exists(select 1 from public.pro_mkt_contacts c where c.owner_id=p_actor and c.email=lower(btrim(k.email))) order by k.name limit 100) k),'[]'),
  'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'subject',t.subject,'body',t.body,'archived',t.archived,'revision',t.revision) order by t.updated_at desc) from public.pro_mkt_templates t where t.owner_id=p_actor),'[]'),
  'campaigns',coalesce((select jsonb_agg(public.pro_mkt_campaign_json(k) order by k.updated_at desc) from public.pro_mkt_campaigns k where k.owner_id=p_actor),'[]'),
  'automations',jsonb_build_array(public.pro_mkt_automation_json(p_actor,'quote_followup'),public.pro_mkt_automation_json(p_actor,'review_request')),
  'drafts',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'refKind',d.ref_kind,'refId',d.ref_id,'refLabel',d.ref_label,'contactId',d.contact_id,'to',c.email,'subject',d.subject,'body',d.body,'status',d.status,'createdAt',d.created_at,'decidedAt',d.decided_at) order by d.created_at desc)
   from (select * from public.pro_mkt_automation_drafts where owner_id=p_actor order by created_at desc limit 100) d join public.pro_mkt_contacts c on c.owner_id=d.owner_id and c.id=d.contact_id),'[]'),
  'outbox',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'campaignId',m.campaign_id,'draftId',m.draft_id,'to',m.to_email,'subject',m.subject,'body',m.body,'mode',m.mode,'delivery',m.delivery,'createdAt',m.created_at) order by m.created_at desc) from (select * from public.pro_mkt_messages where owner_id=p_actor order by created_at desc limit 60) m),'[]'));
end $$;

-- ---------------------------------------------------------------- mutate
create or replace function public.pro_mkt_mutate(p_actor uuid,p_input jsonb,p_mode text default 'mock',p_base text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_mkt_actions;result jsonb;rid uuid;rev integer;c public.pro_mkt_contacts;k public.pro_mkt_campaigns;t public.pro_mkt_templates;d public.pro_mkt_automation_drafts;a public.pro_mkt_automations;
 n integer;mid uuid;owner_email text;at_value timestamptz;
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input)<>'object' or act not in('contact_consent','contact_revoke','template_save','template_archive','campaign_save','campaign_schedule','campaign_unschedule','campaign_cancel','campaign_send_now','test_send','automation_save','draft_decide') then
  raise exception 'Invalid marketing action' using errcode='22023';end if;
 if p_mode not in('mock','sandbox','production') then raise exception 'Invalid mode' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Missing action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mkt:'||p_actor::text,0));
 select * into receipt from public.pro_mkt_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 rev:=case when jsonb_typeof(p_input->'revision')='number' then (p_input->>'revision')::integer else null end;
 if act='contact_consent' then
  if coalesce(length(p_input->>'consentText'),0) not between 20 and 1000 or p_input->>'evidence' not in('verbal','written','form','other') then raise exception 'Consent text and evidence are required' using errcode='22023';end if;
  if p_input->>'email' is null or lower(btrim(p_input->>'email'))!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email' using errcode='22023';end if;
  if p_input->>'clientId' is not null and not exists(select 1 from public.pro_clients where user_id=p_actor and id=p_input->>'clientId') then raise exception 'Client unavailable' using errcode='P0002';end if;
  c:=public.pro_mkt_grant(p_actor,p_input->>'email',coalesce(nullif(btrim(p_input->>'name'),''),split_part(p_input->>'email','@',1)),'owner_recorded',p_input->>'consentText',jsonb_build_object('evidence',p_input->>'evidence','note',left(coalesce(p_input->>'note',''),300)),p_input->>'clientId',null);
  result:=jsonb_build_object('action',act,'contact',public.pro_mkt_contact_json(c));
 elsif act='contact_revoke' then
  rid:=(p_input->>'id')::uuid;select * into c from public.pro_mkt_contacts where owner_id=p_actor and id=rid;
  if not found then raise exception 'Contact unavailable' using errcode='P0002';end if;if c.revision<>rev then raise exception 'Contact changed' using errcode='40001';end if;
  perform public.pro_mkt_suppress(p_actor,rid,'owner','owner_revoked');select * into c from public.pro_mkt_contacts where owner_id=p_actor and id=rid;
  result:=jsonb_build_object('action',act,'contact',public.pro_mkt_contact_json(c));
 elsif act in('template_save','template_archive') then
  rid:=(p_input->>'id')::uuid;select * into t from public.pro_mkt_templates where owner_id=p_actor and id=rid for update;
  if coalesce(t.revision,0)<>rev then raise exception 'Template changed' using errcode='40001';end if;
  if act='template_archive' then if not found then raise exception 'Template unavailable' using errcode='P0002';end if;
   update public.pro_mkt_templates set archived=not archived,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into t;
  elsif not found then insert into public.pro_mkt_templates(owner_id,id,name,subject,body) values(p_actor,rid,btrim(p_input->>'name'),btrim(p_input->>'subject'),p_input->>'body') returning * into t;
  else update public.pro_mkt_templates set name=btrim(p_input->>'name'),subject=btrim(p_input->>'subject'),body=p_input->>'body',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into t;end if;
  result:=jsonb_build_object('action',act,'template',jsonb_build_object('id',t.id,'name',t.name,'subject',t.subject,'body',t.body,'archived',t.archived,'revision',t.revision));
 elsif act like 'campaign_%' or act='test_send' then
  rid:=(p_input->>'id')::uuid;select * into k from public.pro_mkt_campaigns where owner_id=p_actor and id=rid for update;
  if act='campaign_save' then
   if coalesce(k.revision,0)<>rev then raise exception 'Campaign changed' using errcode='40001';end if;
   if found and k.status not in('draft','scheduled') then raise exception 'Only drafts can be edited' using errcode='40001';end if;
   if not found then insert into public.pro_mkt_campaigns(owner_id,id,name,subject,body,segment) values(p_actor,rid,btrim(p_input->>'name'),btrim(p_input->>'subject'),p_input->>'body',coalesce(p_input->>'segment','all')) returning * into k;
   else update public.pro_mkt_campaigns set name=btrim(p_input->>'name'),subject=btrim(p_input->>'subject'),body=p_input->>'body',segment=coalesce(p_input->>'segment','all'),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into k;end if;
  else
   if not found then raise exception 'Campaign unavailable' using errcode='P0002';end if;
   if act<>'test_send' and k.revision<>rev then raise exception 'Campaign changed' using errcode='40001';end if;
   if act='test_send' then
    select email into owner_email from public.profiles where id=p_actor;
    mid:=gen_random_uuid();
    insert into public.pro_mkt_messages(owner_id,id,kind,to_email,subject,body,mode,delivery) values(p_actor,mid,'test',owner_email,left('[Prueba] '||public.pro_mkt_render(p_actor,k.subject,'Cliente de prueba',null),200),
     left(public.pro_mkt_render(p_actor,k.body,'Cliente de prueba',null)||E'\n\n— Envío de prueba: solo a su propio correo. / Test send: only to your own email.',12000),p_mode,case when p_mode='mock' then 'simulado' else 'queued' end);
   elsif act='campaign_schedule' then
    begin at_value:=(p_input->>'scheduledAt')::timestamptz;exception when others then raise exception 'Invalid date' using errcode='22023';end;
    if at_value is null or at_value<=now() then raise exception 'Schedule a future time' using errcode='22023';end if;
    if k.status<>'draft' then raise exception 'Only drafts can be scheduled' using errcode='40001';end if;
    update public.pro_mkt_campaigns set status='scheduled',scheduled_at=at_value,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into k;
   elsif act='campaign_unschedule' then
    if k.status<>'scheduled' then raise exception 'Not scheduled' using errcode='40001';end if;
    update public.pro_mkt_campaigns set status='draft',scheduled_at=null,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into k;
   elsif act='campaign_cancel' then
    if k.status not in('draft','scheduled') then raise exception 'Already sent or cancelled' using errcode='40001';end if;
    update public.pro_mkt_campaigns set status='cancelled',scheduled_at=null,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into k;
   else n:=public.pro_mkt_dispatch(p_actor,rid,p_mode,p_base);select * into k from public.pro_mkt_campaigns where owner_id=p_actor and id=rid;
   end if;
  end if;
  result:=jsonb_build_object('action',act,'campaign',public.pro_mkt_campaign_json(k),'messageId',mid);
 elsif act='automation_save' then
  if p_input->>'kind' not in('quote_followup','review_request') then raise exception 'Invalid automation' using errcode='22023';end if;
  select * into a from public.pro_mkt_automations where owner_id=p_actor and kind=p_input->>'kind' for update;
  if coalesce(a.revision,0)<>rev then raise exception 'Automation changed' using errcode='40001';end if;
  insert into public.pro_mkt_automations(owner_id,kind,enabled,delay_days,subject,body) values(p_actor,p_input->>'kind',(p_input->>'enabled')::boolean,(p_input->>'delayDays')::integer,btrim(p_input->>'subject'),p_input->>'body')
  on conflict(owner_id,kind) do update set enabled=excluded.enabled,delay_days=excluded.delay_days,subject=excluded.subject,body=excluded.body,revision=pro_mkt_automations.revision+1,updated_at=clock_timestamp();
  result:=jsonb_build_object('action',act,'automation',public.pro_mkt_automation_json(p_actor,p_input->>'kind'));
 else -- draft_decide
  rid:=(p_input->>'id')::uuid;select * into d from public.pro_mkt_automation_drafts where owner_id=p_actor and id=rid for update;
  if not found then raise exception 'Draft unavailable' using errcode='P0002';end if;
  if d.status<>'pending_approval' then raise exception 'Already decided' using errcode='40001';end if;
  if p_input->>'decision'='approve' then
   mid:=public.pro_mkt_enqueue(p_actor,d.contact_id,'automation',null,d.id,d.subject,d.body,p_mode,p_base);
   update public.pro_mkt_automation_drafts set status='approved',decided_at=clock_timestamp(),message_id=mid where owner_id=p_actor and id=rid;
  elsif p_input->>'decision'='reject' then update public.pro_mkt_automation_drafts set status='rejected',decided_at=clock_timestamp() where owner_id=p_actor and id=rid;
  else raise exception 'Invalid decision' using errcode='22023';end if;
  result:=jsonb_build_object('action',act,'draftId',rid,'status',(select status from public.pro_mkt_automation_drafts where owner_id=p_actor and id=rid),'messageId',mid);
 end if;
 insert into public.pro_mkt_history(owner_id,action_id,action,entity,entity_id,snapshot) values(p_actor,aid,act,split_part(act,'_',1),coalesce(rid::text,c.id::text,p_input->>'kind',''),result);
 insert into public.pro_mkt_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Scheduled campaigns that are due: claimed atomically (two tabs never send twice).
create or replace function public.pro_mkt_run_due(p_actor uuid,p_mode text,p_base text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare k record;sent jsonb:='[]';
begin
 perform public.pro_mkt_owner(p_actor);
 for k in select id from public.pro_mkt_campaigns where owner_id=p_actor and status='scheduled' and scheduled_at<=now() order by scheduled_at for update skip locked loop
  sent:=sent||jsonb_build_array(jsonb_build_object('id',k.id,'recipients',public.pro_mkt_dispatch(p_actor,k.id,p_mode,p_base)));
 end loop;
 return jsonb_build_object('sent',sent);
end $$;

-- Automations: find what happened (quote shared / job completed) and create DRAFTS that wait for approval.
create or replace function public.pro_mkt_automation_scan(p_actor uuid,p_base text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.pro_mkt_automations;r record;n integer:=0;slug text;review_link text;
begin
 perform public.pro_mkt_owner(p_actor);perform public.pro_mkt_base_ok(p_base);
 perform pg_advisory_xact_lock(hashtextextended('pro-mkt:'||p_actor::text,0));
 select p.slug into slug from public.professionals p where p.profile_id=p_actor;
 review_link:=p_base||'/profesionales/'||coalesce(slug,'');
 select * into a from public.pro_mkt_automations where owner_id=p_actor and kind='quote_followup' and enabled;
 if found then
  for r in select v.id,e.title,c.id contact_id from public.pro_private_estimate_publications v
    join public.pro_private_estimate_publication_states s on s.publication_id=v.id and s.status in('awaiting_claim','shared')
    join public.pro_private_estimates e on e.owner_id=v.owner_id and e.id=v.estimate_id and not e.archived
    join public.pro_clients k on k.user_id=v.owner_id and k.id=v.client_id
    join public.pro_mkt_contacts c on c.owner_id=v.owner_id and c.email=lower(btrim(k.email))
   where v.owner_id=p_actor and v.created_at<=now()-make_interval(days=>a.delay_days) and c.consent='granted'
    and not exists(select 1 from public.pro_mkt_suppressions x where x.owner_id=c.owner_id and x.email_hash=c.email_hash)
    and not exists(select 1 from public.pro_mkt_automation_drafts d where d.owner_id=p_actor and d.kind='quote_followup' and d.ref_id=v.id::text) limit 100 loop
   insert into public.pro_mkt_automation_drafts(owner_id,id,kind,ref_kind,ref_id,ref_label,contact_id,subject,body)
   values(p_actor,gen_random_uuid(),'quote_followup','estimate_publication',r.id::text,left(r.title,200),r.contact_id,a.subject,replace(a.body,'{{enlace}}',r.title));n:=n+1;
  end loop;
 end if;
 select * into a from public.pro_mkt_automations where owner_id=p_actor and kind='review_request' and enabled;
 if found then
  for r in select w.id,w.service,c.id contact_id from public.pro_work w
    join public.pro_clients k on k.user_id=w.user_id and k.id=w."clientId"
    join public.pro_mkt_contacts c on c.owner_id=w.user_id and c.email=lower(btrim(k.email))
   where w.user_id=p_actor and w.stage='completed' and not w.cancelled and c.consent='granted'
    and not exists(select 1 from public.pro_mkt_suppressions x where x.owner_id=c.owner_id and x.email_hash=c.email_hash)
    and not exists(select 1 from public.pro_mkt_automation_drafts d where d.owner_id=p_actor and d.kind='review_request' and d.ref_id=w.id) limit 100 loop
   insert into public.pro_mkt_automation_drafts(owner_id,id,kind,ref_kind,ref_id,ref_label,contact_id,subject,body)
   values(p_actor,gen_random_uuid(),'review_request','work',r.id,left(r.service,200),r.contact_id,a.subject,replace(a.body,'{{enlace}}',review_link));n:=n+1;
  end loop;
 end if;
 return jsonb_build_object('created',n);
end $$;

-- ---------------------------------------------------------------- public unsubscribe (token only)
create or replace function public.pro_mkt_unsubscribe(p_token text,p_confirm boolean) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare tk public.pro_mkt_unsubscribe_tokens;c public.pro_mkt_contacts;already boolean;
begin
 if p_token is null or p_token!~'^[a-f0-9]{64}$' then raise exception 'Invalid link' using errcode='22023';end if;
 select * into tk from public.pro_mkt_unsubscribe_tokens where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found then raise exception 'Link unavailable' using errcode='P0002';end if;
 select * into c from public.pro_mkt_contacts where owner_id=tk.owner_id and id=tk.contact_id;
 already:=exists(select 1 from public.pro_mkt_suppressions where owner_id=tk.owner_id and email_hash=c.email_hash);
 if p_confirm and not already then
  perform public.pro_mkt_suppress(tk.owner_id,tk.contact_id,'unsubscribed','unsubscribe_link');
  update public.pro_mkt_unsubscribe_tokens set used_at=clock_timestamp() where token_hash=tk.token_hash;
 end if;
 return jsonb_build_object('business',public.pro_mkt_business(tk.owner_id),'unsubscribed',already or p_confirm,'already',already);
end $$;

-- ---------------------------------------------------------------- double opt-in (post-security fixes, Ley 8968)
/** Site-form tick → «pending» contact + one confirmation email (mock: stored «simulado», never sent). Silent for an
 *  address that unsubscribed or already consented, and at most one new email per address per 24 h (no flooding). */
create or replace function public.pro_mkt_request_confirmation(p_owner uuid,p_email text,p_name text,p_text text,p_evidence jsonb,p_client text,p_lead uuid,p_base text,p_language text default 'es') returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_mkt_contacts;e text:=lower(btrim(p_email));token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');url text;en boolean:=p_language='en';biz text;
begin
 if coalesce(length(p_text),0) not between 20 and 1000 then raise exception 'Consent text is required' using errcode='22023';end if;
 url:=public.pro_mkt_base_ok(p_base)||case when en then '/en' else '' end||'/confirmar-pro#t='||token;
 if exists(select 1 from public.pro_mkt_suppressions where owner_id=p_owner and email_hash=public.pro_mkt_email_hash(e)) then return;end if;
 select * into c from public.pro_mkt_contacts where owner_id=p_owner and email=e for update;
 if found and c.consent='granted' then return;end if;
 if found and c.consent='pending' and exists(select 1 from public.pro_mkt_confirmations k where k.owner_id=p_owner and k.contact_id=c.id and k.used_at is null and k.created_at>clock_timestamp()-interval '24 hours') then return;end if;
 if found then
  update public.pro_mkt_contacts set consent='pending',consent_source='site_form',consent_text=p_text,consent_at=null,revoked_at=null,confirmation_requested_at=clock_timestamp(),confirmed_at=null,
   client_id=coalesce(client_id,p_client),lead_id=coalesce(lead_id,p_lead),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=c.id returning * into c;
 else
  insert into public.pro_mkt_contacts(owner_id,id,email,name,client_id,lead_id,consent,consent_source,consent_text,confirmation_requested_at)
  values(p_owner,gen_random_uuid(),e,btrim(p_name),p_client,p_lead,'pending','site_form',p_text,clock_timestamp()) returning * into c;
 end if;
 insert into public.pro_mkt_consent_events(owner_id,id,contact_id,event,source,consent_text,evidence) values(p_owner,gen_random_uuid(),c.id,'requested','site_form',p_text,coalesce(p_evidence,'{}'));
 biz:=public.pro_mkt_business(p_owner);
 insert into public.pro_mkt_confirmations(token_hash,owner_id,contact_id,to_email,subject,body,expires_at)
 values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_owner,c.id,c.email,left(case when en then 'Confirm that you want to receive emails from '||biz else 'Confirme que desea recibir correos de '||biz end,200),
  left(case when en then 'Hello '||split_part(c.name,' ',1)||E':\n\nYou asked '||biz||' to send you news and offers by email. To confirm, open this link (valid for 7 days):\n'||url||E'\n\nIf it was not you, ignore this email: you will receive nothing.'
   else 'Hola '||split_part(c.name,' ',1)||E':\n\nUsted pidió a '||biz||' recibir novedades y promociones por correo. Para confirmarlo, abra este enlace (válido 7 días):\n'||url||E'\n\nSi no fue usted, ignore este correo: no recibirá nada.' end,4000),
  clock_timestamp()+interval '7 days');
end $$;
/** Public confirmation (token only). «peek» shows the business; «confirm» grants consent once (idempotent). */
create or replace function public.pro_mkt_confirm(p_token text,p_confirm boolean) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare k public.pro_mkt_confirmations;c public.pro_mkt_contacts;suppressed boolean;
begin
 if p_token is null or p_token!~'^[a-f0-9]{64}$' then raise exception 'Invalid link' using errcode='22023';end if;
 select * into k from public.pro_mkt_confirmations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found then raise exception 'Link unavailable' using errcode='P0002';end if;
 select * into c from public.pro_mkt_contacts where owner_id=k.owner_id and id=k.contact_id for update;
 suppressed:=exists(select 1 from public.pro_mkt_suppressions where owner_id=k.owner_id and email_hash=c.email_hash);
 if k.used_at is not null then return jsonb_build_object('business',public.pro_mkt_business(k.owner_id),'confirmed',c.consent='granted' and not suppressed,'already',true,'expired',false);end if;
 if k.expires_at<=clock_timestamp() or suppressed or c.consent not in('pending','granted') then
  return jsonb_build_object('business',public.pro_mkt_business(k.owner_id),'confirmed',false,'already',false,'expired',true);end if;
 if p_confirm then
  if c.consent='pending' then
   update public.pro_mkt_contacts set consent='granted',consent_at=clock_timestamp(),confirmed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=c.owner_id and id=c.id;
   insert into public.pro_mkt_consent_events(owner_id,id,contact_id,event,source,consent_text,evidence)
   values(c.owner_id,gen_random_uuid(),c.id,'confirmed','confirmation_link',c.consent_text,jsonb_build_object('requestedAt',c.confirmation_requested_at,'emailSentAt',k.created_at));
  end if;
  update public.pro_mkt_confirmations set used_at=clock_timestamp() where token_hash=k.token_hash;
 end if;
 return jsonb_build_object('business',public.pro_mkt_business(k.owner_id),'confirmed',p_confirm,'already',false,'expired',false);
end $$;

-- ---------------------------------------------------------------- posture
do $$declare n text;begin foreach n in array array['pro_mkt_contacts','pro_mkt_consent_events','pro_mkt_suppressions','pro_mkt_unsubscribe_tokens','pro_mkt_confirmations','pro_mkt_templates','pro_mkt_campaigns','pro_mkt_automations','pro_mkt_automation_drafts','pro_mkt_messages','pro_mkt_actions','pro_mkt_history'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_mkt\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_mkt_immutable(%' and f::text not like 'pro_mkt_message_guard(%' and f::text not like 'pro_mkt_draft_guard(%' and f::text not like 'pro_mkt_confirmation_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
