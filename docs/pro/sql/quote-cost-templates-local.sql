-- LOCAL PRO ONLY. Round F1-C (2026-11-19): document templates for "Documentos con su marca" (row 45) and
-- sections in the customer's per-item proposal of a shared quote (row 43). Additive; mirrored as
-- supabase/migrations/293_pro_quote_cost_templates.sql. Depends on document-branding-local.sql and
-- quote-line-decisions-local.sql.
-- * pro_document_branding.template (jsonb, default '{}' = today's prints exactly): layout variant
--   (classic | modern | compact), logo position (left | center | right), accent colour (the theme
--   colour or one of the same 4 ContrataCR-style colours, no free colours), paper (auto = today, letter,
--   a4), fields shown (line codes/CABYS, unit prices, tax breakdown, signature block, terms, notes) and
--   default terms/notes per document type. pro_document_branding_template_json() validates strictly
--   (unknown keys/values -> 22023) and always returns the complete template with defaults.
-- * pro_document_branding_save accepts the optional key "template"; callers without it keep the saved one
--   (same CAS 40001, idempotent actionId receipts and immutable history as Round 9).
-- * pro_quote_line_decisions_read: each line also carries its section name ("group", or null). Same
--   access rules; still no internal cost (the publication whitelist never holds it).
begin;
alter table public.pro_document_branding add column if not exists template jsonb not null default '{}'::jsonb;
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_document_branding_template_object' and conrelid='public.pro_document_branding'::regclass) then
  alter table public.pro_document_branding add constraint pro_document_branding_template_object check(jsonb_typeof(template)='object' and length(template::text)<=40000);
 end if;
end $$;

-- Document types that have their own default terms and notes.
create or replace function public.pro_document_template_types() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['quote','invoice','change_order','purchase_order','contract','statement','payment_plan','receipt','selections']
$$;

create or replace function public.pro_document_branding_template_json(p jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v jsonb:=coalesce(p,'{}'::jsonb);show jsonb;texts jsonb;k text;t text;entry jsonb;out_show jsonb:='{}'::jsonb;out_texts jsonb:='{}'::jsonb;
 show_keys constant text[]:=array['codes','notes','signature','taxes','terms','unitPrices'];
begin
 if jsonb_typeof(v)<>'object' then raise exception 'Invalid template' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(v) x where x not in('layout','logoPosition','accent','paper','show','texts')) then raise exception 'Invalid template keys' using errcode='22023';end if;
 if v ? 'layout' and (jsonb_typeof(v->'layout')<>'string' or v->>'layout' not in('classic','modern','compact')) then raise exception 'Invalid layout' using errcode='22023';end if;
 if v ? 'logoPosition' and (jsonb_typeof(v->'logoPosition')<>'string' or v->>'logoPosition' not in('left','center','right')) then raise exception 'Invalid logo position' using errcode='22023';end if;
 if v ? 'accent' and (jsonb_typeof(v->'accent')<>'string' or v->>'accent' not in('theme','celeste','marino','bosque','terracota')) then raise exception 'Invalid accent' using errcode='22023';end if;
 if v ? 'paper' and (jsonb_typeof(v->'paper')<>'string' or v->>'paper' not in('auto','letter','a4')) then raise exception 'Invalid paper' using errcode='22023';end if;
 show:=coalesce(v->'show','{}'::jsonb);
 if jsonb_typeof(show)<>'object' or exists(select 1 from jsonb_object_keys(show) x where x<>all(show_keys)) then raise exception 'Invalid shown fields' using errcode='22023';end if;
 foreach k in array show_keys loop
  if show ? k and jsonb_typeof(show->k)<>'boolean' then raise exception 'Invalid shown field' using errcode='22023';end if;
  out_show:=out_show||jsonb_build_object(k,coalesce((show->>k)::boolean,true));
 end loop;
 texts:=coalesce(v->'texts','{}'::jsonb);
 if jsonb_typeof(texts)<>'object' or exists(select 1 from jsonb_object_keys(texts) x where x<>all(public.pro_document_template_types())) then raise exception 'Invalid document type' using errcode='22023';end if;
 foreach t in array public.pro_document_template_types() loop
  entry:=coalesce(texts->t,'{}'::jsonb);
  if jsonb_typeof(entry)<>'object' or exists(select 1 from jsonb_object_keys(entry) x where x not in('terms','notes')) then raise exception 'Invalid document texts' using errcode='22023';end if;
  if entry ? 'terms' and (jsonb_typeof(entry->'terms')<>'string' or length(entry->>'terms')>1000) or entry ? 'notes' and (jsonb_typeof(entry->'notes')<>'string' or length(entry->>'notes')>1000) then raise exception 'Invalid document text' using errcode='22023';end if;
  if coalesce(entry->>'terms','')~'[\x01-\x08\x0b\x0c\x0e-\x1f]' or coalesce(entry->>'notes','')~'[\x01-\x08\x0b\x0c\x0e-\x1f]' then raise exception 'Invalid document text' using errcode='22023';end if;
  out_texts:=out_texts||jsonb_build_object(t,jsonb_build_object('terms',btrim(coalesce(entry->>'terms','')),'notes',btrim(coalesce(entry->>'notes',''))));
 end loop;
 return jsonb_build_object('layout',coalesce(v->>'layout','classic'),'logoPosition',coalesce(v->>'logoPosition','left'),'accent',coalesce(v->>'accent','theme'),'paper',coalesce(v->>'paper','auto'),'show',out_show,'texts',out_texts);
end $$;

create or replace function public.pro_document_branding_json(p_owner uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce(b.revision,0),'theme',coalesce(b.theme,'celeste'),'displayName',coalesce(b.display_name,''),'tagline',coalesce(b.tagline,''),'footer',coalesce(b.footer_text,''),
  'logo',case when b.logo_path is null then null else jsonb_build_object('path',b.logo_path,'sha256',b.logo_sha256,'bytes',b.logo_bytes) end,
  'template',public.pro_document_branding_template_json(coalesce(b.template,'{}'::jsonb)))
 from (select 1) one left join public.pro_document_branding b on b.owner_id=p_owner
$$;

create or replace function public.pro_document_branding_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text;prior public.pro_document_branding_actions;cur public.pro_document_branding;before_json jsonb;answer jsonb;keys text[];logo jsonb;v_path text;v_sha text;v_bytes integer;v_template jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['actionId','displayName','footer','logo','revision','tagline','theme'] and keys is distinct from array['actionId','displayName','footer','logo','revision','tagline','template','theme']
  or not coalesce(p_input->>'actionId','')~'^[0-9a-f-]{36}$' or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid branding' using errcode='22023';end if;
 if p_input->>'theme' not in('celeste','marino','bosque','terracota') or jsonb_typeof(p_input->'displayName')<>'string' or jsonb_typeof(p_input->'tagline')<>'string' or jsonb_typeof(p_input->'footer')<>'string'
  or length(p_input->>'displayName')>120 or length(p_input->>'tagline')>160 or length(p_input->>'footer')>300 then raise exception 'Invalid branding' using errcode='22023';end if;
 -- Validate the template before any write (22023 on any unknown key or value).
 if p_input ? 'template' then v_template:=public.pro_document_branding_template_json(p_input->'template');end if;
 aid:=(p_input->>'actionId')::uuid;hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('pro_document_branding:'||p_actor::text,0));
 select * into prior from public.pro_document_branding_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into cur from public.pro_document_branding where owner_id=p_actor for update;
 if coalesce(cur.revision,0)<>(p_input->>'revision')::integer then raise exception 'Branding changed' using errcode='40001';end if;
 v_template:=coalesce(v_template,cur.template,'{}'::jsonb);
 logo:=p_input->'logo';
 -- logo: 'keep' (string), null (remove) or {path,sha256,bytes} of a file the server just stored at the path SQL gave.
 if logo='"keep"'::jsonb then v_path:=cur.logo_path;v_sha:=cur.logo_sha256;v_bytes:=cur.logo_bytes;
 elsif jsonb_typeof(logo)='null' then v_path:=null;
 elsif jsonb_typeof(logo)='object' then
  if (select array_agg(k order by k) from jsonb_object_keys(logo) k) is distinct from array['bytes','path','sha256'] or not coalesce(logo->>'path','')~('^'||p_actor::text||'/[0-9a-f-]{36}\.jpg$') or not coalesce(logo->>'sha256','')~'^[a-f0-9]{64}$' or not coalesce(logo->>'bytes','')~'^[0-9]{1,7}$' or (logo->>'bytes')::integer not between 1 and 1048576 then raise exception 'Invalid logo' using errcode='22023';end if;
  v_path:=logo->>'path';v_sha:=logo->>'sha256';v_bytes:=(logo->>'bytes')::integer;
 else raise exception 'Invalid logo' using errcode='22023';end if;
 before_json:=case when cur.owner_id is null then null else public.pro_document_branding_json(p_actor) end;
 insert into public.pro_document_branding(owner_id,theme,display_name,tagline,footer_text,logo_path,logo_sha256,logo_bytes,template,revision,updated_at)
  values(p_actor,p_input->>'theme',btrim(p_input->>'displayName'),btrim(p_input->>'tagline'),btrim(p_input->>'footer'),v_path,case when v_path is null then null else v_sha end,case when v_path is null then null else v_bytes end,v_template,1,clock_timestamp())
  on conflict(owner_id) do update set theme=excluded.theme,display_name=excluded.display_name,tagline=excluded.tagline,footer_text=excluded.footer_text,logo_path=excluded.logo_path,logo_sha256=excluded.logo_sha256,logo_bytes=excluded.logo_bytes,template=excluded.template,revision=public.pro_document_branding.revision+1,updated_at=clock_timestamp();
 answer:=jsonb_build_object('branding',public.pro_document_branding_json(p_actor));
 insert into public.pro_document_branding_history(owner_id,action_id,before_row,after_row) values(p_actor,aid,before_json,answer->'branding');
 insert into public.pro_document_branding_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- Same reader as quote-line-decisions-local.sql plus the line's section ("group", null without one).
create or replace function public.pro_quote_line_decisions_read(p_actor uuid,p_publication uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare side text;v public.pro_private_estimate_publications;s public.pro_private_estimate_publication_states;lines jsonb;open boolean;
begin
 side:=public.pro_private_estimate_publication_authorize(p_actor,p_publication,false);
 select * into v from public.pro_private_estimate_publications where id=p_publication;
 select * into s from public.pro_private_estimate_publication_states where publication_id=p_publication;
 open:=s.status in('shared','changes_requested') and coalesce(public.pro_private_work_tools_enabled(v.owner_id),false)
  and(v.content->>'validUntil' is null or(v.content->>'validUntil')::date>=(clock_timestamp() at time zone 'America/Costa_Rica')::date);
 select coalesce(jsonb_agg(jsonb_build_object('lineId',l.value->>'id','position',l.ord,'description',l.value->>'description','unit',l.value->>'unit',
   'qtyMilli',(l.value->>'qtyMilli')::bigint,'unitPriceCents',(l.value->>'unitPriceCents')::bigint,'totalCents',public.pro_quote_line_total(l.value),
   'group',case when jsonb_typeof(l.value->'group')='string' then l.value->>'group' end,
   'hasImage',exists(select 1 from public.pro_private_estimate_items i join public.pro_product_details pd on pd.user_id=v.owner_id and pd.product_id=i.content->>'catalogProductId' and pd.image_id is not null
     where i.owner_id=v.owner_id and i.estimate_id=v.estimate_id and i.id::text=l.value->>'id'),
   'decision',d.decision,'note',coalesce(d.note,''),'revision',coalesce(d.revision,0),'decidedAt',d.updated_at) order by l.ord),'[]'::jsonb) into lines
  from jsonb_array_elements(coalesce(v.content->'lines','[]'::jsonb)) with ordinality l(value,ord)
  left join public.pro_quote_line_decisions d on d.publication_id=p_publication and d.line_id::text=l.value->>'id';
 return jsonb_build_object('publicationId',p_publication,'side',side,'status',s.status,'version',v.version,'title',v.content->>'title','currency',coalesce(v.content->>'currency','CRC'),
  'canDecide',side='client' and open,'lines',lines,'totalCents',(v.content->>'totalCents')::bigint,
  'approvedCents',(select coalesce(sum((x->>'totalCents')::bigint),0) from jsonb_array_elements(lines) x where x->>'decision'='approved'),
  'declinedCents',(select coalesce(sum((x->>'totalCents')::bigint),0) from jsonb_array_elements(lines) x where x->>'decision'='declined'),
  'approvedCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision'='approved'),
  'declinedCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision'='declined'),
  'pendingCount',(select count(*) from jsonb_array_elements(lines) x where x->>'decision' is null));
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_document_template_types','pro_document_branding_template_json','pro_document_branding_json','pro_document_branding_save','pro_quote_line_decisions_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
