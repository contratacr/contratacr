-- LOCAL ONLY (launch without Pro, 2026-11-18): «Mi negocio» — the owner/manager of a CLAIMED place edits its public
-- contact data and opening hours, free, without Pro. Depends on directory-core-local.sql (dir_place_mutate, source
-- 'owner'), directory-claims-local.sql (dir_place_managers), dir-business-roles-local.sql and
-- directory-place-tools-local.sql (dir_tool_authorize).
-- * dir_owner_place_read(actor, member, place): the editable fields + revision (capability read).
-- * dir_owner_place_update(actor, member, input): input {actionId, placeId, revision, action:'contact', place:{phone?,
--   website?, email?, addressLine?}} or {actionId, placeId, revision, action:'hours', hours:[{weekday,opens,closes}]}.
--   Public data, so a company member needs listing.publish (admin/manager). Goes through dir_place_mutate with the
--   'owner' data source: CAS by revision (40001), idempotent actionId (same receipt), immutable place history and field
--   provenance (an owner e-mail is trusted for e-mail claims only when typed by the approved owner — existing rule).
--   The name, section, location and status stay staff-only (reports / admin).
-- Functions security invoker, pinned search_path, executable only by service_role. Idempotent.
begin;

create or replace function public.dir_owner_place_read(p_actor uuid,p_member uuid,p_place uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;
begin
 p:=public.dir_tool_authorize(p_actor,p_member,p_place,'read');
 return jsonb_build_object('placeId',p.id,'slug',p.slug,'name',p.name,'vertical',p.vertical_id,'status',p.status,'revision',p.revision,
  'phone',p.phone,'website',p.website,'email',p.email,'addressLine',p.address_line,
  'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens',to_char(h.opens,'HH24:MI'),'closes',to_char(h.closes,'HH24:MI')) order by h.weekday,h.seq)
   from public.dir_place_hours h where h.place_id=p.id),'[]'));
end $$;

create or replace function public.dir_owner_place_update(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;act text;pid uuid;aid uuid;pl jsonb;inner_input jsonb;r jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid place change' using errcode='22023';end if;
 act:=p_input->>'action';aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 if aid is null or pid is null or act is null or act not in('contact','hours') then raise exception 'Invalid place change' using errcode='22023';end if;
 if act='contact' then
  pl:=p_input->'place';
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','action','place'))
   or jsonb_typeof(pl)<>'object' or pl='{}'::jsonb
   or exists(select 1 from jsonb_object_keys(pl) k where k not in('phone','website','email','addressLine'))
   or exists(select 1 from jsonb_each(pl) e where jsonb_typeof(e.value) not in('string','null') or length(e.value#>>'{}')>500) then
   raise exception 'Invalid place change' using errcode='22023';end if;
  -- Empty text clears the field (dir_text keeps the current value only when the key is absent).
  select jsonb_object_agg(e.key,case when jsonb_typeof(e.value)='string' and btrim(e.value#>>'{}')='' then 'null'::jsonb
   when jsonb_typeof(e.value)='string' then to_jsonb(btrim(e.value#>>'{}')) else e.value end) into pl from jsonb_each(pl) e;
 else
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','action','hours'))
   or jsonb_typeof(p_input->'hours')<>'array' or jsonb_array_length(p_input->'hours')>28
   or exists(select 1 from jsonb_array_elements(p_input->'hours') x where jsonb_typeof(x)<>'object'
     or exists(select 1 from jsonb_object_keys(x) k where k not in('weekday','opens','closes'))
     or coalesce(x->>'weekday','') !~ '^[0-6]$' or coalesce(x->>'opens','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(x->>'closes','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
   raise exception 'Invalid hours' using errcode='22023';end if;
 end if;
 p:=public.dir_tool_authorize(p_actor,p_member,pid,'listing.publish');
 if p.status not in('published','draft','hidden') then raise exception 'Place cannot be edited' using errcode='42501',hint='dir_tool_not_manager';end if;
 inner_input:=jsonb_build_object('action',case act when 'contact' then 'update' else 'hours' end,'actionId',aid,'placeId',pid,
  'revision',p_input->'revision','source',jsonb_build_object('id','owner'));
 if act='contact' then inner_input:=inner_input||jsonb_build_object('place',pl);else inner_input:=inner_input||jsonb_build_object('hours',p_input->'hours');end if;
 r:=public.dir_place_mutate(p_actor,inner_input);
 return jsonb_build_object('placeId',pid,'revision',r->'revision','action',act);
end $$;

do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('dir_owner_place_read','dir_owner_place_update') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
