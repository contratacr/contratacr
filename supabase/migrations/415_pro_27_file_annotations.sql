-- ContrataCR Pro, row 30: annotations on files. A pin (normalized coordinate on a photo or on a PDF page) or a plain note
-- is a PRIVATE comment of the team on a file of a job or of the company library.
--  * Append-only history: a row is never updated or deleted (immutable trigger); only the cascade of the account removal
--    (trigger depth > 0) can remove rows. Idempotent: one action id per account, the same id with another body is refused.
--  * Never shown to customers: no customer function reads this table, RLS is closed, only service_role reaches it.
--  * An annotated job file counts as used for the permanent delete (the foreign key to pro_work_files is detected by
--    pro_wfo_file_in_use); an annotated library file counts as used in pro_company_file_in_use (migration 414).
--  * 1..1000 characters, at most 500 annotations per file, page 1..2000, x and y in [0,1].
-- PRO_ENABLED stays false in production. Reapplicable: create if not exists / or replace.
begin;

create table if not exists public.pro_file_annotations(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{32}$'),
 scope text not null check(scope in('work','company')),
 work_id text,work_file_id uuid,company_file_id uuid,
 kind text not null check(kind in('pin','note')),
 page integer check(page between 1 and 2000),
 x numeric(7,6) check(x between 0 and 1),y numeric(7,6) check(y between 0 and 1),
 body text not null check(length(btrim(body)) between 1 and 1000 and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 author_id uuid not null,author_name text not null check(length(author_name) between 1 and 120),
 created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,action_id),
 check((scope='work' and work_id is not null and work_file_id is not null and company_file_id is null) or (scope='company' and work_id is null and work_file_id is null and company_file_id is not null)),
 check((kind='pin' and page is not null and x is not null and y is not null) or (kind='note' and page is null and x is null and y is null)),
 foreign key(owner_id,work_id,work_file_id) references public.pro_work_files(owner_id,work_id,id));
create index if not exists pro_file_annotations_work on public.pro_file_annotations(owner_id,work_file_id,created_at,id) where scope='work';
create index if not exists pro_file_annotations_company on public.pro_file_annotations(owner_id,company_file_id,created_at,id) where scope='company';

create or replace function public.pro_file_annotation_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Annotations are immutable' using errcode='23514';end $$;
drop trigger if exists pro_file_annotation_guard on public.pro_file_annotations;
create trigger pro_file_annotation_guard before update or delete on public.pro_file_annotations for each row when (pg_trigger_depth()=0) execute function public.pro_file_annotation_guard();

create or replace function public.pro_file_annotation_json(r public.pro_file_annotations) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'scope',r.scope,'fileId',coalesce(r.work_file_id,r.company_file_id),'workId',r.work_id,'kind',r.kind,'page',r.page,'x',r.x,'y',r.y,'body',r.body,'authorName',r.author_name,'at',r.created_at)
$$;

-- Access to the file: the owner account (or a member working as the owner, resolved by the route) on its own files.
-- Returns the mime type of the file or null when it does not exist for this account.
create or replace function public.pro_file_annotation_target(p_actor uuid,p_scope text,p_file uuid,p_work text) returns text language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare mime text;
begin
 if p_scope='work' then
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  select f.mime_type into mime from public.pro_work_files f where f.owner_id=p_actor and f.id=p_file and f.work_id=p_work and f.ready;
 elsif p_scope='company' then
  if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  select f.mime_type into mime from public.pro_company_files f where f.owner_id=p_actor and f.id=p_file and f.ready;
 else raise exception 'Invalid annotation' using errcode='22023';end if;
 return mime;
end $$;

create or replace function public.pro_file_annotations_read(p_actor uuid,p_scope text,p_file uuid,p_work text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare mime text;items jsonb;
begin
 mime:=public.pro_file_annotation_target(p_actor,p_scope,p_file,p_work);
 if mime is null then return null;end if;
 select coalesce(jsonb_agg(public.pro_file_annotation_json(a) order by a.created_at,a.id),'[]'::jsonb) into items
  from public.pro_file_annotations a where a.owner_id=p_actor and a.scope=p_scope and coalesce(a.work_file_id,a.company_file_id)=p_file;
 return jsonb_build_object('mimeType',mime,'pinnable',mime in('image/jpeg','image/png','image/webp','application/pdf'),'items',items);
end $$;

create or replace function public.pro_file_annotation_create(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];want text[];aid uuid;fid uuid;scp text;wid text;k text;pg integer;px numeric;py numeric;txt text;mime text;prior public.pro_file_annotations;row_ public.pro_file_annotations;
 hash text:=md5(p_input::text);who uuid:=coalesce(p_member,p_actor);nm text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid annotation' using errcode='22023';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 scp:=p_input->>'scope';k:=p_input->>'kind';
 if k='pin' and scp='work' then want:=array['action','actionId','body','fileId','kind','page','scope','workId','x','y'];
 elsif k='pin' and scp='company' then want:=array['action','actionId','body','fileId','kind','page','scope','x','y'];
 elsif k='note' and scp='work' then want:=array['action','actionId','body','fileId','kind','scope','workId'];
 elsif k='note' and scp='company' then want:=array['action','actionId','body','fileId','kind','scope'];
 end if;
 if want is null or keys is distinct from want or p_input->>'action' is distinct from 'create' then raise exception 'Invalid annotation' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;fid:=(p_input->>'fileId')::uuid;exception when others then raise exception 'Invalid annotation' using errcode='22023';end;
 txt:=btrim(p_input->>'body');wid:=p_input->>'workId';
 if txt is null or length(txt) not between 1 and 1000 or txt ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid annotation' using errcode='22023';end if;
 if k='pin' then
  if jsonb_typeof(p_input->'page') is distinct from 'number' or jsonb_typeof(p_input->'x') is distinct from 'number' or jsonb_typeof(p_input->'y') is distinct from 'number' then raise exception 'Invalid annotation' using errcode='22023';end if;
  px:=(p_input->>'x')::numeric;py:=(p_input->>'y')::numeric;
  if px<0 or px>1 or py<0 or py>1 or (p_input->>'page')::numeric<>trunc((p_input->>'page')::numeric) or (p_input->>'page')::numeric not between 1 and 2000 then raise exception 'Invalid annotation' using errcode='22023';end if;
  pg:=(p_input->>'page')::integer;px:=round(px,6);py:=round(py,6);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ann:'||p_actor::text||':'||fid::text,0));
 select * into prior from public.pro_file_annotations where owner_id=p_actor and action_id=aid;
 if found then
  if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;
  return jsonb_build_object('annotation',public.pro_file_annotation_json(prior),'replayed',true);
 end if;
 mime:=public.pro_file_annotation_target(p_actor,scp,fid,wid);
 if mime is null then raise exception 'File not found' using errcode='42501';end if;
 if k='pin' and mime not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Pins need a photo or a PDF' using errcode='22023';end if;
 if k='pin' and mime<>'application/pdf' and pg<>1 then raise exception 'Invalid annotation' using errcode='22023';end if;
 if (select count(*) from public.pro_file_annotations where owner_id=p_actor and scope=scp and coalesce(work_file_id,company_file_id)=fid)>=500 then raise exception 'Annotation limit reached' using errcode='54000';end if;
 select coalesce(nullif(btrim(full_name),''),'Equipo') into nm from public.profiles where id=who;
 insert into public.pro_file_annotations(owner_id,action_id,input_hash,scope,work_id,work_file_id,company_file_id,kind,page,x,y,body,author_id,author_name)
  values(p_actor,aid,hash,scp,case when scp='work' then wid end,case when scp='work' then fid end,case when scp='company' then fid end,k,pg,px,py,txt,who,left(coalesce(nm,'Equipo'),120)) returning * into row_;
 return jsonb_build_object('annotation',public.pro_file_annotation_json(row_),'replayed',false);
end $$;

-- Grants as in migrations 352/360: closed table, writers for service_role only.
do $$declare f record;begin
 alter table public.pro_file_annotations enable row level security;
 revoke all on public.pro_file_annotations from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_file_annotations to service_role;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_file_annotation_guard','pro_file_annotation_json','pro_file_annotation_target','pro_file_annotations_read','pro_file_annotation_create') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
