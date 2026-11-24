-- Pro area A: per-event notification matrix gets two more columns, "daily digest" and "push". Stored per person
-- (owner or company member) like the WhatsApp preference: ContrataCR delivers nothing outside the app, the choice is saved
-- and used by the sandbox adapters. One row per person, optimistic revision, service_role only.
begin;
create table if not exists public.pro_notification_event_extras(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 person_id uuid not null,
 digest jsonb not null default '{}'::jsonb check(jsonb_typeof(digest)='object'),
 push jsonb not null default '{}'::jsonb check(jsonb_typeof(push)='object'),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,person_id)
);
create or replace function public.pro_notification_extras_read(p_owner uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_notification_event_extras;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into c from public.pro_notification_event_extras x where x.owner_id=p_owner and x.person_id=p_person;
 return jsonb_build_object('revision',coalesce(c.revision,0),'delivery','stored_not_sent',
  'digest',(select jsonb_object_agg(t.e,coalesce((c.digest->>t.e)::boolean,false)) from unnest(public.pro_notification_events()) as t(e)),
  'push',(select jsonb_object_agg(t.e,coalesce((c.push->>t.e)::boolean,false)) from unnest(public.pro_notification_events()) as t(e)));
end $$;
create or replace function public.pro_notification_extras_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare k text;dg jsonb:='{}'::jsonb;ps jsonb:='{}'::jsonb;cur integer;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'digest')<>'object' or jsonb_typeof(p_input->'push')<>'object'
  or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid preferences' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_input->'digest') loop
  if not k=any(public.pro_notification_events()) or jsonb_typeof(p_input->'digest'->k)<>'boolean' then raise exception 'Invalid preference' using errcode='22023';end if;
  dg:=dg||jsonb_build_object(k,p_input->'digest'->k);
 end loop;
 for k in select jsonb_object_keys(p_input->'push') loop
  if not k=any(public.pro_notification_events()) or jsonb_typeof(p_input->'push'->k)<>'boolean' then raise exception 'Invalid preference' using errcode='22023';end if;
  ps:=ps||jsonb_build_object(k,p_input->'push'->k);
 end loop;
 select x.revision into cur from public.pro_notification_event_extras x where x.owner_id=p_owner and x.person_id=p_person for update;
 cur:=coalesce(cur,0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Preferences changed' using errcode='40001';end if;
 insert into public.pro_notification_event_extras(owner_id,person_id,digest,push,revision) values(p_owner,p_person,dg,ps,cur+1)
  on conflict(owner_id,person_id) do update set digest=excluded.digest,push=excluded.push,revision=excluded.revision,updated_at=now();
 return public.pro_notification_extras_read(p_owner,p_person);
end $$;
do $$declare f record;begin
 alter table public.pro_notification_event_extras enable row level security;
 revoke all on public.pro_notification_event_extras from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_notification_event_extras to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_notification_extras_read','pro_notification_extras_save') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
