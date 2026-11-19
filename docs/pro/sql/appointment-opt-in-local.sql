-- LOCAL ONLY: explicit opt-in for NEW requests. Existing requests and work survive pausing.
begin;
create table if not exists public.pro_appointment_preferences (
 owner_id uuid primary key references profiles(id) on delete cascade,
 enabled boolean not null default false,revision integer not null check(revision>0),updated_at timestamptz not null default now()
);
create table if not exists public.pro_appointment_preference_actions (
 owner_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 primary key(owner_id,action_id)
);
create or replace function public.pro_appointment_preferences_record(p_actor uuid,p_input jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s pro_appointment_preferences;prior pro_appointment_preference_actions;result jsonb;aid uuid;
begin
 if not pro_appointment_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into s from pro_appointment_preferences where owner_id=p_actor;
 if p_input is not null then
  if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['enabled','revision','actionId']) or (select count(*) from jsonb_object_keys(p_input))<>3 or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]+$' then raise exception 'Invalid preferences' using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;
  select * into prior from pro_appointment_preference_actions where owner_id=p_actor and action_id=aid;
  if found then if prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
  if (p_input->>'revision')::integer<>coalesce(s.revision,0) then raise exception 'Preferences changed' using errcode='40001';end if;
  insert into pro_appointment_preferences values(p_actor,(p_input->>'enabled')::boolean,coalesce(s.revision,0)+1,now()) on conflict(owner_id) do update set enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at returning * into s;
 end if;
 result:=jsonb_build_object('enabled',coalesce(s.enabled,false),'revision',coalesce(s.revision,0));
 if p_input is not null then insert into pro_appointment_preference_actions values(p_actor,aid,p_input,result);end if;
 return result;
end $$;
-- Patch the existing operation in place: check AFTER replay detection and under the SAME owner lock.
-- Fail loudly if a future operation changes the insertion point; never install an unguarded variant.
do $$
declare definition text;anchor text:='if act not in (''cancel'',''decline'') and not pro_appointment_enabled(owner) then';
begin
 definition:=pg_get_functiondef('public.pro_appointment_mutate(uuid,jsonb)'::regprocedure);
 if position('New requests are paused' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Opt-in insertion point changed';end if;
  definition:=replace(definition,anchor,'if act=''create'' and not coalesce((select enabled from pro_appointment_preferences where owner_id=owner),false) then raise exception ''New requests are paused'' using errcode=''42501'';end if; '||anchor);
  execute definition;
 end if;
end $$;
alter table pro_appointment_preferences enable row level security;
alter table pro_appointment_preference_actions enable row level security;
revoke all on pro_appointment_preferences,pro_appointment_preference_actions from public,anon,authenticated;
grant all on pro_appointment_preferences,pro_appointment_preference_actions to service_role;
revoke all on function pro_appointment_preferences_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_appointment_preferences_record(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
