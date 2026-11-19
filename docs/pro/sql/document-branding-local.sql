-- LOCAL PRO ONLY. Round 9 (2026-11-15): company branding of printed documents (family 45). One record
-- per company: a ContrataCR-style colour theme (fixed list, no free colours), the company name and a
-- short line for the header, a footer line, and an optional company logo (JPG normalised by the server,
-- ≤ 1 MiB, private bucket `pro-document-logos`, embedded in the printed copy; never a public URL).
-- Applies to future prints only; printed copies and documents already shared are not changed. The
-- ContrataCR mark stays as approved. CAS 40001 on the revision, idempotent actionId receipts,
-- immutable history; RLS + service_role-only. Writes are 'settings.write' for the role gate.
begin;
create table if not exists public.pro_document_branding(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 theme text not null default 'celeste' check(theme in('celeste','marino','bosque','terracota')),
 display_name text not null default '' check(length(display_name)<=120 and display_name=btrim(display_name)),
 tagline text not null default '' check(length(tagline)<=160 and tagline=btrim(tagline)),
 footer_text text not null default '' check(length(footer_text)<=300 and footer_text=btrim(footer_text)),
 logo_path text,logo_sha256 text check(logo_sha256 is null or logo_sha256~'^[a-f0-9]{64}$'),logo_bytes integer check(logo_bytes is null or logo_bytes between 1 and 1048576),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 check((logo_path is null)=(logo_sha256 is null) and (logo_path is null)=(logo_bytes is null)),
 check(logo_path is null or logo_path~('^'||owner_id::text||'/[0-9a-f-]{36}\.jpg$')));
create table if not exists public.pro_document_branding_history(
 owner_id uuid not null,action_id uuid not null,before_row jsonb,after_row jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_document_branding_actions(
 owner_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));

create or replace function public.pro_document_branding_json(p_owner uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce(b.revision,0),'theme',coalesce(b.theme,'celeste'),'displayName',coalesce(b.display_name,''),'tagline',coalesce(b.tagline,''),'footer',coalesce(b.footer_text,''),
  'logo',case when b.logo_path is null then null else jsonb_build_object('path',b.logo_path,'sha256',b.logo_sha256,'bytes',b.logo_bytes) end)
 from (select 1) one left join public.pro_document_branding b on b.owner_id=p_owner
$$;
create or replace function public.pro_document_branding_read(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return public.pro_document_branding_json(p_actor);
end $$;
-- Print routes: the branding of the document's owner (no access check here; the caller already
-- authorised the document itself). Returns defaults when the owner has none.
create or replace function public.pro_document_branding_for_print(p_owner uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_document_branding_json(p_owner)
$$;
create or replace function public.pro_document_branding_logo_path(p_actor uuid,p_file uuid) returns text language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_file is null then raise exception 'Invalid file' using errcode='22023';end if;
 return p_actor::text||'/'||p_file::text||'.jpg';
end $$;
create or replace function public.pro_document_branding_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text;prior public.pro_document_branding_actions;cur public.pro_document_branding;before_json jsonb;answer jsonb;keys text[];logo jsonb;v_path text;v_sha text;v_bytes integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['actionId','displayName','footer','logo','revision','tagline','theme'] or not coalesce(p_input->>'actionId','')~'^[0-9a-f-]{36}$' or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid branding' using errcode='22023';end if;
 if p_input->>'theme' not in('celeste','marino','bosque','terracota') or jsonb_typeof(p_input->'displayName')<>'string' or jsonb_typeof(p_input->'tagline')<>'string' or jsonb_typeof(p_input->'footer')<>'string'
  or length(p_input->>'displayName')>120 or length(p_input->>'tagline')>160 or length(p_input->>'footer')>300 then raise exception 'Invalid branding' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('pro_document_branding:'||p_actor::text,0));
 select * into prior from public.pro_document_branding_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into cur from public.pro_document_branding where owner_id=p_actor for update;
 if coalesce(cur.revision,0)<>(p_input->>'revision')::integer then raise exception 'Branding changed' using errcode='40001';end if;
 logo:=p_input->'logo';
 -- logo: 'keep' (string), null (remove) or {path,sha256,bytes} of a file the server just stored at the path SQL gave.
 if logo='"keep"'::jsonb then v_path:=cur.logo_path;v_sha:=cur.logo_sha256;v_bytes:=cur.logo_bytes;
 elsif jsonb_typeof(logo)='null' then v_path:=null;
 elsif jsonb_typeof(logo)='object' then
  if (select array_agg(k order by k) from jsonb_object_keys(logo) k) is distinct from array['bytes','path','sha256'] or not coalesce(logo->>'path','')~('^'||p_actor::text||'/[0-9a-f-]{36}\.jpg$') or not coalesce(logo->>'sha256','')~'^[a-f0-9]{64}$' or not coalesce(logo->>'bytes','')~'^[0-9]{1,7}$' or (logo->>'bytes')::integer not between 1 and 1048576 then raise exception 'Invalid logo' using errcode='22023';end if;
  v_path:=logo->>'path';v_sha:=logo->>'sha256';v_bytes:=(logo->>'bytes')::integer;
 else raise exception 'Invalid logo' using errcode='22023';end if;
 before_json:=case when cur.owner_id is null then null else public.pro_document_branding_json(p_actor) end;
 insert into public.pro_document_branding(owner_id,theme,display_name,tagline,footer_text,logo_path,logo_sha256,logo_bytes,revision,updated_at)
  values(p_actor,p_input->>'theme',btrim(p_input->>'displayName'),btrim(p_input->>'tagline'),btrim(p_input->>'footer'),v_path,case when v_path is null then null else v_sha end,case when v_path is null then null else v_bytes end,1,clock_timestamp())
  on conflict(owner_id) do update set theme=excluded.theme,display_name=excluded.display_name,tagline=excluded.tagline,footer_text=excluded.footer_text,logo_path=excluded.logo_path,logo_sha256=excluded.logo_sha256,logo_bytes=excluded.logo_bytes,revision=public.pro_document_branding.revision+1,updated_at=clock_timestamp();
 answer:=jsonb_build_object('branding',public.pro_document_branding_json(p_actor));
 insert into public.pro_document_branding_history(owner_id,action_id,before_row,after_row) values(p_actor,aid,before_json,answer->'branding');
 insert into public.pro_document_branding_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;
create or replace function public.pro_document_branding_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Branding history and receipts are immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_document_branding','pro_document_branding_history','pro_document_branding_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_document_branding_history','pro_document_branding_actions'] loop
  execute format('drop trigger if exists pro_document_branding_immutable on public.%I',t);execute format('create trigger pro_document_branding_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_document_branding_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_document_branding_json','pro_document_branding_read','pro_document_branding_for_print','pro_document_branding_logo_path','pro_document_branding_save','pro_document_branding_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-document-logos','pro-document-logos',false,1048576,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  if not exists(select 1 from storage.buckets where id='pro-document-logos' and not public and file_size_limit=1048576) then raise exception 'Document logos bucket configuration';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
