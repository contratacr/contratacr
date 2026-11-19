-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): questions & answers on every place page.
-- Depends on directory-core-local.sql, directory-claims-local.sql, directory-moderation-local.sql (dir_mod_log,
-- dir_mod_reason_ok) and directory-place-tools-local.sql (moderation kinds question/answer).
-- * Anyone signed in asks (5..300 characters, no links or @handles); anyone signed in answers (1..500). An answer by an
--   active manager of the place (or a company member of the owner's Pro team whose role allows listing.publish) is
--   stored with is_owner=true and shown first, marked «Respuesta del negocio». Managers cannot ask on their own place.
-- * Text is never edited (no edit path); published/hidden only by staff, reversible, with reason, moderator, time and
--   CAS (expectedStatus) through dir_admin_qa_moderate -> immutable dir_moderation_log.
-- * Reports: dir_qa_flags (one per person per item, reasons like review flags), 20 a day; open flags feed the staff
--   queue (/admin/directorio, tab «Preguntas»).
-- * Limits: 5 questions a day per person, 30 per place a day; 20 answers a day per person; 3 answers per person per
--   question. Idempotent actionId everywhere (dir_place_actions receipts).
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
-- 2026-11-18 (launch without Pro): company-member roles come from the NEUTRAL helpers dir_business_role_of /
-- dir_business_allows (dir-business-roles-local.sql, required); they delegate to the Pro team module only when installed.
begin;

create table if not exists public.dir_questions(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 author_id uuid not null,
 author_name_snapshot text not null check(length(btrim(author_name_snapshot)) between 2 and 80),
 body text not null check(length(body) between 5 and 300 and body!~*'(https?://|www\.|@[a-z0-9_.-]+)'),
 status text not null default 'published' check(status in('published','hidden')),
 moderation_reason text check(length(moderation_reason) between 3 and 1000),
 moderated_by uuid,moderated_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(status='published' or moderation_reason is not null),
 check((moderated_by is null)=(moderated_at is null))
);
create index if not exists dir_questions_place on public.dir_questions(place_id,created_at desc,id desc) where status='published';
create index if not exists dir_questions_author on public.dir_questions(author_id,created_at);
create table if not exists public.dir_answers(
 id uuid primary key,
 question_id uuid not null references public.dir_questions(id),
 author_id uuid not null,member_id uuid,
 author_name_snapshot text not null check(length(btrim(author_name_snapshot)) between 2 and 80),
 is_owner boolean not null,
 body text not null check(length(body) between 1 and 500 and body!~*'(https?://|www\.|@[a-z0-9_.-]+)'),
 status text not null default 'published' check(status in('published','hidden')),
 moderation_reason text check(length(moderation_reason) between 3 and 1000),
 moderated_by uuid,moderated_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(status='published' or moderation_reason is not null),
 check((moderated_by is null)=(moderated_at is null))
);
create index if not exists dir_answers_question on public.dir_answers(question_id,created_at);
create index if not exists dir_answers_author on public.dir_answers(author_id,created_at);
create table if not exists public.dir_qa_flags(
 id uuid primary key,
 target_kind text not null check(target_kind in('question','answer')),
 target_id uuid not null,
 reporter_id uuid not null,
 reason text not null check(reason in('spam','offensive','fake','conflict_of_interest','private_info','other')),
 message text check(length(message) between 1 and 500),
 status text not null default 'open' check(status in('open','upheld','dismissed')),
 resolved_by uuid,resolved_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 unique(target_kind,target_id,reporter_id),
 check((status='open')=(resolved_at is null)),
 check((resolved_by is null)=(resolved_at is null))
);
create index if not exists dir_qa_flags_open on public.dir_qa_flags(target_kind,target_id) where status='open';

-- Text and identity immutable; moderation fields only through dir_admin_qa_moderate (dir.qa_moderation=on).
create or replace function public.dir_qa_protect() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare moderating boolean:=coalesce(current_setting('dir.qa_moderation',true),'')='on';
begin
 if tg_op='DELETE' then raise exception 'Questions and answers are hidden, never deleted' using errcode='23514';end if;
 if tg_op='INSERT' then
  if new.status<>'published' or new.moderated_by is not null then raise exception 'Moderation fields are managed by staff' using errcode='42501';end if;
  return new;
 end if;
 if (to_jsonb(new)-'status'-'moderation_reason'-'moderated_by'-'moderated_at') is distinct from (to_jsonb(old)-'status'-'moderation_reason'-'moderated_by'-'moderated_at') then
  raise exception 'Questions and answers are never edited' using errcode='23514';end if;
 if not moderating then raise exception 'Moderation fields are managed by staff' using errcode='42501';end if;
 return new;
end $$;
create or replace function public.dir_qa_flags_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Flags are never deleted' using errcode='23514';end if;
 if (to_jsonb(new)-'status'-'resolved_by'-'resolved_at') is distinct from (to_jsonb(old)-'status'-'resolved_by'-'resolved_at') then raise exception 'Flag identity is immutable' using errcode='23514';end if;
 if old.status<>'open' then raise exception 'A resolved flag is final' using errcode='23514';end if;
 return new;
end $$;
do $$declare t text;begin
 foreach t in array array['dir_questions','dir_answers'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_protect',t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.dir_qa_protect()',t||'_protect',t);
 end loop;
 drop trigger if exists dir_qa_flags_guard on public.dir_qa_flags;
 create trigger dir_qa_flags_guard before update or delete on public.dir_qa_flags for each row execute function public.dir_qa_flags_guard();
 foreach t in array array['dir_questions','dir_answers','dir_qa_flags'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
end $$;

-- ---------------------------------------------------------------- ask
-- Input: {actionId, questionId, slug, body, authorName}. The route sets authorName from the profile (snapshot).
create or replace function public.dir_question_ask(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;qid uuid;prior jsonb;p public.dir_places;q public.dir_questions;result jsonb;
 txt text:=btrim(regexp_replace(coalesce(p_input->>'body',''),'\s+',' ','g'));nm text:=btrim(regexp_replace(coalesce(p_input->>'authorName',''),'\s+',' ','g'));
begin
 if p_actor is null then raise exception 'Sign in to ask' using errcode='42501',hint='dir_qa_login';end if;
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','questionId','slug','body','authorName')) then
  raise exception 'Invalid question' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');qid:=public.dir_try_uuid(p_input->>'questionId');
 if aid is null or qid is null or length(txt) not between 5 and 300 or txt~*'(https?://|www\.|@[a-z0-9_.-]+)' or length(nm) not between 2 and 80 then raise exception 'Invalid question' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 if public.dir_place_public(p_input->>'slug') is null then raise exception 'Place unavailable' using errcode='P0002';end if;
 select * into p from public.dir_places where slug=p_input->>'slug';
 if p.status<>'published' then raise exception 'Place unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-qa:'||p_actor::text,0));
 if exists(select 1 from public.dir_place_managers where place_id=p.id and user_id=p_actor and status='active') then
  raise exception 'Managers answer, they do not ask' using errcode='42501',hint='dir_qa_own_place';end if;
 if exists(select 1 from public.dir_questions where id=qid) then raise exception 'Question id reused' using errcode='22023';end if;
 if (select count(*) from public.dir_questions where author_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=5
  or (select count(*) from public.dir_questions where place_id=p.id and created_at>clock_timestamp()-interval '1 day')>=30 then
  raise exception 'Too many questions' using errcode='54000',hint='dir_qa_cap';end if;
 insert into public.dir_questions(id,place_id,author_id,author_name_snapshot,body) values(qid,p.id,p_actor,nm,txt) returning * into q;
 result:=jsonb_build_object('questionId',q.id,'status',q.status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- answer
-- Input: {actionId, answerId, questionId, body, authorName}. p_actor = effective account (owner of the Pro workspace
-- when a company member answers for it; then p_member = that member and the role must allow listing.publish).
create or replace function public.dir_answer_post(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;ansid uuid;qid uuid;who uuid:=coalesce(p_member,p_actor);prior jsonb;q public.dir_questions;a public.dir_answers;owner boolean;r text;allowed boolean;result jsonb;
 txt text:=btrim(regexp_replace(coalesce(p_input->>'body',''),'\s+',' ','g'));nm text:=btrim(regexp_replace(coalesce(p_input->>'authorName',''),'\s+',' ','g'));
begin
 if p_actor is null then raise exception 'Sign in to answer' using errcode='42501',hint='dir_qa_login';end if;
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','answerId','questionId','body','authorName')) then
  raise exception 'Invalid answer' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');ansid:=public.dir_try_uuid(p_input->>'answerId');qid:=public.dir_try_uuid(p_input->>'questionId');
 if aid is null or ansid is null or qid is null or length(txt) not between 1 and 500 or txt~*'(https?://|www\.|@[a-z0-9_.-]+)' or length(nm) not between 2 and 80 then
  raise exception 'Invalid answer' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 select * into q from public.dir_questions where id=qid;
 if not found or q.status<>'published' or public.dir_place_public((select slug from public.dir_places where id=q.place_id)) is null then raise exception 'Question not found' using errcode='P0002';end if;
 owner:=exists(select 1 from public.dir_place_managers where place_id=q.place_id and user_id=p_actor and status='active');
 if p_member is not null and p_member<>p_actor then
  if not owner then raise exception 'Only the business team answers as the business' using errcode='42501',hint='dir_tool_not_manager';end if;
  r:=public.dir_business_role_of(p_member,p_actor);
  allowed:=public.dir_business_allows(r,'listing.publish');
  if r is null or not coalesce(allowed,false) then raise exception 'Role does not allow public answers' using errcode='42501',hint='dir_tool_role';end if;
 end if;
 if q.author_id=who then raise exception 'Cannot answer your own question' using errcode='42501',hint='dir_qa_own_question';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-qa:'||who::text,0));
 if exists(select 1 from public.dir_answers where id=ansid) then raise exception 'Answer id reused' using errcode='22023';end if;
 if (select count(*) from public.dir_answers where author_id=p_actor and coalesce(member_id,p_actor)=who and created_at>clock_timestamp()-interval '1 day')>=20
  or (select count(*) from public.dir_answers where question_id=qid and author_id=p_actor and coalesce(member_id,p_actor)=who)>=3 then
  raise exception 'Too many answers' using errcode='54000',hint='dir_qa_cap';end if;
 insert into public.dir_answers(id,question_id,author_id,member_id,author_name_snapshot,is_owner,body) values(ansid,qid,p_actor,p_member,nm,owner,txt) returning * into a;
 result:=jsonb_build_object('answerId',a.id,'isOwner',a.is_owner,'status',a.status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- flags
-- Input: {flagId, targetKind, targetId, reason, message?}. One per person per item (a repeat answers ok). 20 a day.
create or replace function public.dir_qa_flag_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fid uuid;tid uuid;tk text:=p_input->>'targetKind';msg text:=nullif(btrim(coalesce(p_input->>'message','')),'');author uuid;
begin
 if p_actor is null then raise exception 'Sign in to report' using errcode='42501',hint='dir_qa_login';end if;
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('flagId','targetKind','targetId','reason','message')) then raise exception 'Invalid report' using errcode='22023';end if;
 fid:=public.dir_try_uuid(p_input->>'flagId');tid:=public.dir_try_uuid(p_input->>'targetId');
 if fid is null or tid is null or tk is null or tk not in('question','answer') or coalesce(p_input->>'reason','') not in('spam','offensive','fake','conflict_of_interest','private_info','other')
  or (p_input->>'reason'='other' and length(coalesce(msg,''))<5) or length(coalesce(msg,''))>500 then raise exception 'Invalid report' using errcode='22023';end if;
 if tk='question' then select author_id into author from public.dir_questions where id=tid and status='published';
 else select a.author_id into author from public.dir_answers a join public.dir_questions q on q.id=a.question_id where a.id=tid and a.status='published' and q.status='published';end if;
 if author is null then raise exception 'Not found' using errcode='P0002';end if;
 if author=p_actor then raise exception 'Cannot report your own text' using errcode='42501',hint='dir_flag_own_review';end if;
 if exists(select 1 from public.dir_qa_flags where target_kind=tk and target_id=tid and reporter_id=p_actor) then return jsonb_build_object('ok',true);end if;
 if (select count(*) from public.dir_qa_flags where reporter_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=20 then raise exception 'Too many reports' using errcode='54000',hint='dir_flag_cap';end if;
 if exists(select 1 from public.dir_qa_flags where id=fid) then raise exception 'Flag id reused' using errcode='22023';end if;
 insert into public.dir_qa_flags(id,target_kind,target_id,reporter_id,reason,message) values(fid,tk,tid,p_actor,p_input->>'reason',msg);
 return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------------- readers
-- Public: published questions of a published place, newest first (30), each with its published answers (business
-- answer first, then oldest first). Never author ids.
create or replace function public.dir_place_questions_public(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pid uuid;
begin
 if public.dir_place_public(p_slug) is null then return null;end if;
 select id into pid from public.dir_places where slug=p_slug;
 return jsonb_build_object('total',(select count(*) from public.dir_questions where place_id=pid and status='published'),
  'items',coalesce((select jsonb_agg(x.j order by x.created_at desc,x.id desc) from(
   select q.created_at,q.id,jsonb_build_object('id',q.id,'name',q.author_name_snapshot,'body',q.body,'createdAt',q.created_at,
    'answers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.author_name_snapshot,'body',a.body,'isOwner',a.is_owner,'createdAt',a.created_at) order by a.is_owner desc,a.created_at,a.id)
     from public.dir_answers a where a.question_id=q.id and a.status='published'),'[]')) j
   from public.dir_questions q where q.place_id=pid and q.status='published' order by q.created_at desc,q.id desc limit 30) x),'[]'));
end $$;

-- Staff queue: flagged (open flags), hidden or recent items.
create or replace function public.dir_admin_qa_queue(p_filter text default 'flagged',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.at desc),'[]') from(
  select i.at,jsonb_build_object('targetKind',i.kind,'targetId',i.id,'slug',p.slug,'placeName',p.name,'authorId',i.author_id,'name',i.name,'body',i.body,'isOwner',i.is_owner,
   'status',i.status,'reason',i.reason,'createdAt',i.at,'question',i.question,
   'flags',(select coalesce(jsonb_agg(jsonb_build_object('reason',f.reason,'message',f.message,'at',f.created_at) order by f.created_at),'[]') from public.dir_qa_flags f where f.target_kind=i.kind and f.target_id=i.id and f.status='open')) j
  from(
   select 'question'::text kind,q.id,q.place_id,q.author_id,q.author_name_snapshot name,q.body,false is_owner,q.status,q.moderation_reason reason,q.created_at at,null::text question from public.dir_questions q
   union all
   select 'answer',a.id,q.place_id,a.author_id,a.author_name_snapshot,a.body,a.is_owner,a.status,a.moderation_reason,a.created_at,q.body from public.dir_answers a join public.dir_questions q on q.id=a.question_id
  ) i join public.dir_places p on p.id=i.place_id
  where case coalesce(p_filter,'flagged') when 'flagged' then exists(select 1 from public.dir_qa_flags f where f.target_kind=i.kind and f.target_id=i.id and f.status='open')
   when 'hidden' then i.status='hidden' else i.at>clock_timestamp()-interval '30 days' end
  order by i.at desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- Input: {actionId, targetKind, targetId, decision: hide|restore|dismiss, reason, expectedStatus}.
create or replace function public.dir_admin_qa_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;tid uuid;tk text:=p_input->>'targetKind';dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');prior jsonb;
 cur text;author uuid;pid uuid;nxt text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','targetKind','targetId','decision','reason','expectedStatus')) then
  raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');tid:=public.dir_try_uuid(p_input->>'targetId');
 if aid is null or tid is null or tk is null or tk not in('question','answer') or dec is null or dec not in('hide','restore','dismiss')
  or coalesce(p_input->>'expectedStatus','') not in('published','hidden') or not public.dir_mod_reason_ok(why,false) then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 if tk='question' then select status,author_id,place_id into cur,author,pid from public.dir_questions where id=tid for update;
 else select a.status,a.author_id,q.place_id into cur,author,pid from public.dir_answers a join public.dir_questions q on q.id=a.question_id where a.id=tid for update of a;end if;
 if cur is null then raise exception 'Not found' using errcode='P0002';end if;
 if author=p_actor then raise exception 'Cannot moderate your own text' using errcode='42501',hint='dir_review_self_moderation';end if;
 if cur<>p_input->>'expectedStatus' then raise exception 'Changed' using errcode='40001';end if;
 nxt:=case dec when 'hide' then 'hidden' when 'restore' then 'published' else cur end;
 if (dec='hide' and cur='hidden') or (dec='restore' and cur='published') then raise exception 'Nothing to change' using errcode='22023';end if;
 if dec<>'dismiss' then
  perform set_config('dir.qa_moderation','on',true);
  if tk='question' then update public.dir_questions set status=nxt,moderation_reason=why,moderated_by=p_actor,moderated_at=clock_timestamp() where id=tid;
  else update public.dir_answers set status=nxt,moderation_reason=why,moderated_by=p_actor,moderated_at=clock_timestamp() where id=tid;end if;
  perform set_config('dir.qa_moderation','off',true);
 end if;
 update public.dir_qa_flags set status=case when dec='hide' then 'upheld' else 'dismissed' end,resolved_by=p_actor,resolved_at=clock_timestamp()
 where target_kind=tk and target_id=tid and status='open';
 perform public.dir_mod_log(p_actor,aid,tk,tid,pid,dec,why,jsonb_build_object('status',cur),jsonb_build_object('status',nxt));
 result:=jsonb_build_object('targetKind',tk,'targetId',tid,'status',nxt);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_questions','dir_answers','dir_qa_flags'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in('dir_qa_protect','dir_qa_flags_guard','dir_question_ask','dir_answer_post','dir_qa_flag_create','dir_place_questions_public','dir_admin_qa_queue','dir_admin_qa_moderate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
