-- Pro family 29 (row 68), fix: PostgreSQL regular expressions accept at most 255 repetitions ({1,500} raises
-- "invalid repetition count(s)", SQLSTATE 2201B), so publishing a portfolio case answered 503. The photo URL length
-- is now checked with length() and the pattern uses an open repetition. Same signature and behavior otherwise.
begin;
create or replace function public.pro_portfolio_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];act text;pro public.professionals;pub public.pro_portfolio_publications;w public.pro_work;pid uuid;
 photos jsonb;urls text[];case_json jsonb;items jsonb;profs text[];v_profession text;v_title text;v_kind text;v_note text;v_on date;n integer;removed jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not coalesce((p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid id' using errcode='22023';end if;
 pid:=(p_input->>'id')::uuid;
 select * into pro from public.professionals where profile_id=p_actor for update;
 if pro.id is null then raise exception 'No public profile' using errcode='22023',hint='pro_portfolio_no_profile';end if;
 if act='publish' then
  if keys is distinct from array['action','consentKind','consentNote','consentOn','description','id','photos','profession','recipient','title','workId'] then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into pub from public.pro_portfolio_publications where owner_id=p_actor and id=pid;
  if found then return jsonb_build_object('id',pub.id,'caseId',pub.case_id,'status',pub.status,'replayed',true);end if;
  select * into w from public.pro_work where user_id=p_actor and id=p_input->>'workId';
  if w.id is null then raise exception 'Job not found' using errcode='P0002';end if;
  if w.stage<>'completed' or w.cancelled then raise exception 'Only a finished job can be published' using errcode='22023',hint='pro_portfolio_not_finished';end if;
  if exists(select 1 from public.pro_portfolio_publications where owner_id=p_actor and work_id=w.id and status='published') then raise exception 'Already published' using errcode='23505';end if;
  v_profession:=btrim(coalesce(p_input->>'profession',''));
  profs:=coalesce(nullif(pro.professions,'{}'),case when pro.category_id is not null then array[pro.category_id] else '{}'::text[] end);
  if not v_profession=any(profs) then raise exception 'Profession is not one of yours' using errcode='22023',hint='pro_portfolio_profession';end if;
  v_title:=btrim(coalesce(p_input->>'title',''));if length(v_title) not between 1 and 120 then raise exception 'Invalid title' using errcode='22023';end if;
  if jsonb_typeof(p_input->'description') is distinct from 'string' or length(p_input->>'description')>600 or jsonb_typeof(p_input->'recipient') is distinct from 'string' or length(p_input->>'recipient')>120 then raise exception 'Invalid text' using errcode='22023';end if;
  v_kind:=p_input->>'consentKind';if v_kind is null or v_kind not in('client_written','client_verbal','no_identifiable') then raise exception 'Consent required' using errcode='22023',hint='pro_portfolio_consent';end if;
  v_note:=btrim(coalesce(p_input->>'consentNote',''));if length(v_note)>300 or v_kind<>'no_identifiable' and length(v_note)<3 then raise exception 'Consent note required' using errcode='22023',hint='pro_portfolio_consent';end if;
  if jsonb_typeof(p_input->'consentOn') is distinct from 'string' or not coalesce((p_input->>'consentOn')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid consent date' using errcode='22023';end if;
  v_on:=(p_input->>'consentOn')::date;if v_on>current_date+1 then raise exception 'Invalid consent date' using errcode='22023';end if;
  photos:=p_input->'photos';
  if jsonb_typeof(photos)<>'array' or jsonb_array_length(photos) not between 1 and 5 or exists(select 1 from jsonb_array_elements(photos) e where jsonb_typeof(e)<>'string' or length(e#>>'{}') not between 9 and 500 or (e#>>'{}')!~'^https://[^[:space:]]+$') then raise exception 'Invalid photos' using errcode='22023',hint='pro_portfolio_photos';end if;
  items:=case when jsonb_typeof(pro.portfolio_items)='array' then pro.portfolio_items else '[]'::jsonb end;
  select count(*) into n from jsonb_array_elements(items) i where i->>'profession'=v_profession;
  if n>=10 then raise exception 'Too many cases' using errcode='22023',hint='pro_portfolio_limit';end if;
  case_json:=jsonb_build_object('id','pro-'||pid::text,'profession',v_profession,'title',v_title,'description',btrim(p_input->>'description'),'recipient',btrim(p_input->>'recipient'),
   'date',to_char(w."end"::date,'YYYY-MM'),'photos',photos);
  items:=items||jsonb_build_array(case_json);
  update public.professionals set portfolio_items=items,portfolio_urls=public.pro_portfolio_urls(items) where id=pro.id;
  insert into public.pro_portfolio_publications(owner_id,id,work_id,case_id,profession,title,consent_kind,consent_note,consent_on,photo_count)
   values(p_actor,pid,w.id,'pro-'||pid::text,v_profession,v_title,v_kind,v_note,v_on,jsonb_array_length(photos));
  return jsonb_build_object('id',pid,'caseId','pro-'||pid::text,'status','published','replayed',false);
 elsif act='withdraw' then
  if keys is distinct from array['action','id'] then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into pub from public.pro_portfolio_publications where owner_id=p_actor and id=pid for update;
  if pub.id is null then raise exception 'Not found' using errcode='P0002';end if;
  if pub.status='withdrawn' then return jsonb_build_object('id',pub.id,'status','withdrawn','removedPhotos','[]'::jsonb,'replayed',true);end if;
  items:=case when jsonb_typeof(pro.portfolio_items)='array' then pro.portfolio_items else '[]'::jsonb end;
  select coalesce(jsonb_agg(ph),'[]'::jsonb) into removed from jsonb_array_elements(items) i,jsonb_array_elements(case when jsonb_typeof(i->'photos')='array' then i->'photos' else '[]'::jsonb end) ph where i->>'id'=pub.case_id;
  select coalesce(jsonb_agg(i order by o),'[]'::jsonb) into items from jsonb_array_elements(items) with ordinality t(i,o) where i->>'id' is distinct from pub.case_id;
  update public.professionals set portfolio_items=items,portfolio_urls=public.pro_portfolio_urls(items) where id=pro.id;
  update public.pro_portfolio_publications set status='withdrawn',withdrawn_at=clock_timestamp() where owner_id=p_actor and id=pid;
  return jsonb_build_object('id',pid,'status','withdrawn','removedPhotos',removed,'replayed',false);
 end if;
 raise exception 'Invalid action' using errcode='22023';
end $$;
revoke all on function public.pro_portfolio_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_portfolio_mutate(uuid,jsonb) to service_role;
commit;
