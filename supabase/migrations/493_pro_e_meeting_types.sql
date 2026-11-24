-- Pro area E (calendar): meeting types of the owner (name, length, where it happens, video app, description), up to 20.
-- Owner only, service_role only, revision CAS, bounds in SQL.
begin;
create table if not exists public.pro_meeting_types(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(name) between 1 and 80 and name=btrim(name)),
 minutes integer not null check(minutes between 5 and 480),
 location_kind text not null check(location_kind in('phone','project_address','video')),
 video_app text check(video_app is null or video_app in('meet','teams','zoom','other')),
 description text not null default '' check(length(description)<=300),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 check(location_kind='video' or video_app is null)
);
create unique index if not exists pro_meeting_types_name on public.pro_meeting_types(owner_id,lower(name));

create or replace function public.pro_meeting_types_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'minutes',t.minutes,'locationKind',t.location_kind,'videoApp',t.video_app,'description',t.description,'revision',t.revision) order by t.created_at,t.id)
  from public.pro_meeting_types t where t.owner_id=p_actor),'[]'::jsonb));
end $$;

create or replace function public.pro_meeting_types_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];tid uuid;rev integer;v_name text;v_min integer;v_kind text;v_app text;v_desc text;cur public.pro_meeting_types;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid meeting type action' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from case act when 'save' then array['action','description','id','locationKind','minutes','name','revision','videoApp'] when 'delete' then array['action','id'] end then raise exception 'Invalid meeting type fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not (p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid id' using errcode='22023';end if;
 tid:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('meeting-types:'||p_actor::text,0));
 if act='delete' then
  delete from public.pro_meeting_types where owner_id=p_actor and id=tid;
  if not found then raise exception 'Meeting type unavailable' using errcode='P0002';end if;
  return jsonb_build_object('deleted',true);
 end if;
 if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'minutes') is distinct from 'number' or jsonb_typeof(p_input->'locationKind') is distinct from 'string'
  or jsonb_typeof(p_input->'videoApp') not in('string','null') or jsonb_typeof(p_input->'description') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce((p_input->>'minutes')~'^[0-9]{1,3}$',false) or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid meeting type' using errcode='22023';end if;
 v_name:=btrim(p_input->>'name');v_min:=(p_input->>'minutes')::integer;v_kind:=p_input->>'locationKind';v_desc:=btrim(p_input->>'description');rev:=(p_input->>'revision')::integer;
 v_app:=case when jsonb_typeof(p_input->'videoApp')='null' then null else p_input->>'videoApp' end;
 if length(v_name) not between 1 and 80 or v_min not between 5 and 480 or v_kind not in('phone','project_address','video') or length(v_desc)>300
  or v_app is not null and v_app not in('meet','teams','zoom','other') or v_kind<>'video' and v_app is not null then raise exception 'Invalid meeting type' using errcode='22023';end if;
 select * into cur from public.pro_meeting_types where owner_id=p_actor and id=tid for update;
 if not found then
  if rev<>0 then raise exception 'Stale meeting type' using errcode='40001';end if;
  if (select count(*) from public.pro_meeting_types where owner_id=p_actor)>=20 then raise exception 'Meeting type limit' using errcode='54000';end if;
  insert into public.pro_meeting_types(owner_id,id,name,minutes,location_kind,video_app,description) values(p_actor,tid,v_name,v_min,v_kind,v_app,v_desc);
 else
  if cur.revision<>rev then raise exception 'Stale meeting type' using errcode='40001';end if;
  update public.pro_meeting_types set name=v_name,minutes=v_min,location_kind=v_kind,video_app=v_app,description=v_desc,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid;
 end if;
 return (select r from jsonb_array_elements(public.pro_meeting_types_read(p_actor)->'types') r where r->>'id'=tid::text);
end $$;

do $$declare f record;begin
 alter table public.pro_meeting_types enable row level security;
 revoke all on public.pro_meeting_types from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_meeting_types to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_meeting_types_read','pro_meeting_types_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
