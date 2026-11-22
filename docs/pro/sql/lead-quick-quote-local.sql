-- LOCAL PRO ONLY (Ronda F2-B, 2026-11-19, parity row 35): one-click "Cotizar" from a lead.
-- Read-only context for the existing private-estimate editor: which private customer and which source
-- (manual opportunity or the request's job) the existing writer must use, plus the catalogue item of this
-- professional that best matches the lead's service. Nothing is written here: the quote is still created by
-- pro_private_estimate_* (same CAS, receipts and history); the matched item only pre-fills the first line with
-- its own catalogue price (never an invented one). No public directory requirement, no sends.
begin;

-- Accent/case/punctuation-insensitive text used to compare a service with catalogue names.
create or replace function public.pro_lead_quick_quote_norm(p_text text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select btrim(regexp_replace(translate(lower(coalesce(p_text,'')),'áàäéèëêíìïîóòöôúùüûñçâ','aaaeeeeiiiioooouuuunca'),'[^a-z0-9]+',' ','g')) $$;

-- Best catalogue match (active items only): exact name 100, one name contains the other 80, otherwise the share
-- of the service's significant words (4+ letters) found in the name (at least half, up to 70). Services before
-- products, then the closest length, then name/id for a stable answer. Null when nothing is close enough.
create or replace function public.pro_lead_quick_quote_match(p_actor uuid,p_service text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare svc text:=public.pro_lead_quick_quote_norm(p_service);words text[];answer jsonb;
begin
 if svc='' then return null;end if;
 select coalesce(array_agg(distinct w),'{}') into words from unnest(string_to_array(svc,' ')) w where length(w)>=4;
 with cand as(select p.id,p.name,p.unit,p.price,coalesce(p."itemType",'product') item_type,public.pro_lead_quick_quote_norm(p.name) n
   from public.pro_products p where p.user_id=p_actor and not p.archived),
  scored as(select c.*,case when c.n=svc then 100 when c.n<>'' and length(c.n)>=3 and(position(c.n in svc)>0 or position(svc in c.n)>0) then 80
    when cardinality(words)=0 then 0
    else(select round(70.0*count(*)/cardinality(words)) from unnest(words) w where w=any(string_to_array(c.n,' '))) end score from cand c)
 select jsonb_build_object('productId',s.id,'name',s.name,'unit',coalesce(s.unit,''),'priceCents',round(s.price*100)::bigint,'itemType',s.item_type,
   'matchedBy',case when s.score=100 then 'exact' when s.score=80 then 'contains' else 'words' end,'score',s.score::integer) into answer
  from scored s where s.score>=35 order by s.score desc,(s.item_type='service') desc,abs(length(s.n)-length(svc)),lower(s.name),s.id limit 1;
 return answer;
end $$;

-- Context for one lead (manual opportunity or ContrataCR request) of the owner.
create or replace function public.pro_lead_quick_quote_context(p_actor uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_lead_center_records;q public.pro_appointment_requests;c public.pro_clients;w public.pro_work;svc text;client_id text;source jsonb;blocked text;pref_archived boolean;
begin
 perform public.pro_lead_origin_owner(p_actor);
 if p_kind is null or p_kind not in('manual','request') or p_id is null then raise exception 'Invalid lead' using errcode='22023';end if;
 if p_kind='manual' then
  select * into l from public.pro_lead_center_records where owner_id=p_actor and kind='manual' and id=p_id;
  if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
  select * into c from public.pro_clients where user_id=p_actor and id=l.client_id;
  svc:=coalesce(nullif(btrim(l.project_type),''),btrim(l.title));client_id:=c.id;
  source:=jsonb_build_object('kind','manual','id',l.id,'revision',l.revision);
  blocked:=case when l.archived then 'archived' when c.id is null then 'no_client' when c.archived then 'client_archived' end;
 else
  select * into q from public.pro_appointment_requests where owner_id=p_actor and id=p_id;
  if not found then raise exception 'Request unavailable' using errcode='P0002';end if;
  svc:=btrim(q.service);
  select coalesce(r.archived,false) into pref_archived from public.pro_lead_center_records r where r.owner_id=p_actor and r.kind='request' and r.id=p_id;
  if q.work_id is not null then select * into w from public.pro_work where user_id=p_actor and id=q.work_id and not coalesce(cancelled,false);end if;
  if w.id is not null then
   -- Same source the job's own "Prepare quote" uses: the job and its customer.
   select * into c from public.pro_clients where user_id=p_actor and id=w."clientId";
   source:=jsonb_build_object('kind','work','id',w.id);
  else
   -- The private record ContrataCR keeps for a request's account customer (never created here).
   select * into c from public.pro_clients where user_id=p_actor and id='reservation-'||q.client_user_id::text;
   source:=null;
  end if;
  client_id:=c.id;
  blocked:=case when coalesce(pref_archived,false) then 'archived' when c.id is null then 'no_client' when c.archived then 'client_archived' end;
 end if;
 return jsonb_build_object('kind',p_kind,'id',p_id,'service',coalesce(svc,''),'clientId',client_id,'clientName',c.name,'source',source,'blocked',blocked,
  'match',public.pro_lead_quick_quote_match(p_actor,svc));
end $$;

do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_lead\_quick\_quote\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);end loop;
end $$;
commit;
notify pgrst,'reload schema';
