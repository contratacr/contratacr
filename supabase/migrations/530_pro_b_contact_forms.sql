-- ContrataCR Pro, leads area (2026-11-24): contact form builder. One form per company (a public form id separate from the
-- owner id, draft or published, a field configuration validated by the API), and the submissions it received.
-- A public submission creates the customer and the lead through the existing writer pro_lead_import_mutate (same
-- atomic, idempotent path as the CSV import), so the lead appears in Leads like any other, with the Website channel.
-- Nothing is sent to anyone; the owner sees the lead in the list.
begin;

create table if not exists public.pro_contact_forms(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 public_id uuid not null default gen_random_uuid(),
 status text not null default 'draft' check(status in('draft','published')),
 config jsonb not null check(jsonb_typeof(config)='object' and length(config::text)<=20000),
 revision integer not null default 1 check(revision>0),
 published_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id),unique(public_id));

create table if not exists public.pro_contact_form_submissions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 form_public_id uuid not null,
 lead_id uuid,
 answers jsonb not null check(jsonb_typeof(answers)='array' and length(answers::text)<=20000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id));
create index if not exists pro_contact_form_submissions_lead on public.pro_contact_form_submissions(owner_id,lead_id) where lead_id is not null;
create index if not exists pro_contact_form_submissions_recent on public.pro_contact_form_submissions(owner_id,created_at desc);

alter table public.pro_contact_forms enable row level security;
alter table public.pro_contact_form_submissions enable row level security;
revoke all on public.pro_contact_forms from public,anon,authenticated;
revoke all on public.pro_contact_form_submissions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_contact_forms to service_role;
grant select,insert,update,delete on public.pro_contact_form_submissions to service_role;

create or replace function public.pro_contact_form_json(p public.pro_contact_forms) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('publicId',p.public_id,'status',p.status,'config',p.config,'revision',p.revision,'publishedAt',p.published_at,'updatedAt',p.updated_at,
  'submissions',(select count(*) from public.pro_contact_form_submissions s where s.owner_id=p.owner_id))
$$;

create or replace function public.pro_contact_form_read(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_contact_forms;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 select * into f from public.pro_contact_forms where owner_id=p_owner;
 if not found then return jsonb_build_object('form',null);end if;
 return jsonb_build_object('form',public.pro_contact_form_json(f));
end $$;

-- Save the configuration (creates the draft the first time), publish or take the form offline. Guarded by the revision (409).
create or replace function public.pro_contact_form_mutate(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;rev integer;f public.pro_contact_forms;cfg jsonb;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) then raise exception 'Invalid contact form action' using errcode='22023';end if;
 act:=p_input->>'action';rev:=(p_input->>'revision')::integer;
 if act not in('save','publish','unpublish') then raise exception 'Invalid contact form action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contact-form:'||p_owner::text,0));
 select * into f from public.pro_contact_forms where owner_id=p_owner for update;
 if act='save' then
  cfg:=p_input->'config';
  if jsonb_typeof(cfg) is distinct from 'object' or length(cfg::text)>20000 then raise exception 'Invalid contact form config' using errcode='22023';end if;
  if not found then
   if rev<>0 then raise exception 'Contact form changed' using errcode='40001';end if;
   insert into public.pro_contact_forms(owner_id,config) values(p_owner,cfg) returning * into f;
  else
   if f.config=cfg and rev=f.revision-1 then return public.pro_contact_form_read(p_owner);end if;
   if f.revision<>rev then raise exception 'Contact form changed' using errcode='40001';end if;
   update public.pro_contact_forms set config=cfg,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner;
  end if;
 else
  if not found then raise exception 'Contact form unavailable' using errcode='P0002';end if;
  if (act='publish')=(f.status='published') and rev=f.revision-1 then return public.pro_contact_form_read(p_owner);end if;
  if f.revision<>rev then raise exception 'Contact form changed' using errcode='40001';end if;
  update public.pro_contact_forms set status=case when act='publish' then 'published' else 'draft' end,
   published_at=case when act='publish' then clock_timestamp() else published_at end,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner;
 end if;
 return public.pro_contact_form_read(p_owner);
end $$;

-- Public side: the configuration of a published form (nothing else about the company except its display name).
create or replace function public.pro_contact_form_public(p_public uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_contact_forms;
begin
 select * into f from public.pro_contact_forms where public_id=p_public and status='published';
 if not found then return null;end if;
 return jsonb_build_object('config',f.config,'business',coalesce(nullif(public.pro_team_name(f.owner_id),''),''));
end $$;

-- Public submission: one atomic step per submission id (a retry returns the first result and never creates a second lead).
create or replace function public.pro_contact_form_submit(p_public uuid,p_submission uuid,p_row jsonb,p_answers jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.pro_contact_forms;prior public.pro_contact_form_submissions;chan text;lid uuid;
begin
 select * into f from public.pro_contact_forms where public_id=p_public and status='published';
 if not found then raise exception 'Contact form unavailable' using errcode='P0002';end if;
 if jsonb_typeof(p_row) is distinct from 'object' or jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Invalid submission' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contact-form-submit:'||f.owner_id::text||':'||p_submission::text,0));
 select * into prior from public.pro_contact_form_submissions where owner_id=f.owner_id and id=p_submission;
 if found then return jsonb_build_object('ok',true,'repeated',true);end if;
 select x.name into chan from public.pro_lead_origin_catalog(f.owner_id) x where x.id='website' and not x.archived limit 1;
 perform public.pro_lead_import_mutate(f.owner_id,jsonb_build_object('action','import','actionId',p_submission,'fileName','Formulario de contacto','rows',jsonb_build_array(p_row||jsonb_build_object('channel',coalesce(chan,'')))));
 select r.lead_id into lid from public.pro_lead_import_rows r where r.owner_id=f.owner_id and r.import_id=p_submission and r.lead_id is not null order by r.row_number limit 1;
 insert into public.pro_contact_form_submissions(owner_id,id,form_public_id,lead_id,answers) values(f.owner_id,p_submission,p_public,lid,p_answers);
 return jsonb_build_object('ok',true,'repeated',false);
end $$;

-- The answers of the submission that created a lead (shown in the lead detail).
create or replace function public.pro_contact_form_lead_answers(p_owner uuid,p_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_contact_form_submissions;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 select * into s from public.pro_contact_form_submissions where owner_id=p_owner and lead_id=p_lead order by created_at desc limit 1;
 if not found then return jsonb_build_object('answers',null);end if;
 return jsonb_build_object('answers',s.answers,'receivedAt',s.created_at);
end $$;

do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_contact_form_json','pro_contact_form_read','pro_contact_form_mutate','pro_contact_form_public','pro_contact_form_submit','pro_contact_form_lead_answers') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
