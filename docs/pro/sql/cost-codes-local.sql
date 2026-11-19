-- LOCAL PRO ONLY. Row 54 of the parity register (Ronda F1-B, 2026-11-19): company cost-code library,
-- markup and VAT per budget line, integral forecast (estimate at completion) and a client-visible
-- budget summary shared explicitly by the owner. Additive: the per-work budget tables of
-- work-budget-local.sql (codes, assignments, history) and their API are not changed.
--  * Library (pro_cost_code_library): two levels like the per-work budget (group -> item), owner-private,
--    with default unit, VAT tariff (the Hacienda codes already used in quotes and invoices) and default
--    markup in basis points. Archive/restore, never delete. Optional starter set for Costa Rica
--    construction and remodeling trades (own list), and a copy of an existing project's codes.
--  * Applying library codes to a work creates the missing per-work groups/items THROUGH the existing
--    writer pro_work_budget_mutate (same validation, revision and immutable history). A per-work code
--    with the same code text is linked, never overwritten; its planned amount and costs stay intact.
--  * Line settings (pro_work_budget_line_settings): markup % and VAT tariff per item, link to the
--    library. Sale = cost + round(cost x markup); tax = round(sale x rate). Deviation and forecast are
--    always computed on cost.
--  * Forecast per code: projected = greatest(committed, actual) (purchase orders never double count a
--    later expense), remaining = greatest(planned - projected, 0), estimate at completion (EAC) =
--    projected + remaining, variance = planned - EAC (null while time has no cost), consumed = actual /
--    planned, status ok/watch(>= 90 %)/over/incomplete/idle. Uncoded commitments and costs are added to
--    the total EAC.
--  * Client summary (pro_work_budget_client_shares): an immutable snapshot of groups and sale totals
--    (subtotal, VAT, total) taken when the owner presses "Compartir con el cliente"; never cost, markup,
--    committed or actual amounts. One active share per work; sharing again replaces it, revoke hides it.
--    Read only by the linked customer of a confirmed/completed request (same audience as the other
--    customer readers). Nothing is sent: no e-mail, message or notification.
-- Lock order: own action advisory -> library advisory (library writes) -> work-budget advisory (same key
-- as pro_work_budget_mutate) -> state rows. Work writes never take the library advisory.
-- Patterns: RLS on, service_role only, security invoker, immutable receipts.
begin;

create table if not exists public.pro_cost_code_library_state(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 revision integer not null check(revision>0)
);
create table if not exists public.pro_cost_code_library(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 kind text not null check(kind in('group','item')),
 code text not null check(code ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$'),
 title text not null check(length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'),
 parent_id uuid,
 unit text check(unit is null or(length(btrim(unit)) between 1 and 20 and unit !~ '[[:cntrl:]]')),
 vat_code text check(vat_code is null or vat_code in('01','02','03','04','08','09','10','11')),
 markup_bp integer check(markup_bp is null or markup_bp between 0 and 100000),
 archived boolean not null default false,
 source text not null default 'manual' check(source in('manual','starter','work')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,code),
 foreign key(owner_id,parent_id) references public.pro_cost_code_library(owner_id,id),
 check(parent_id is distinct from id),
 check(kind='item' or(parent_id is null and unit is null and vat_code is null and markup_bp is null))
);
create index if not exists pro_cost_code_library_parent on public.pro_cost_code_library(owner_id,parent_id);
create table if not exists public.pro_work_budget_line_settings(
 owner_id uuid not null,work_id text not null,code_id uuid not null,
 library_id uuid,
 markup_bp integer check(markup_bp is null or markup_bp between 0 and 100000),
 vat_code text check(vat_code is null or vat_code in('01','02','03','04','08','09','10','11')),
 primary key(owner_id,work_id,code_id),
 foreign key(owner_id,work_id,code_id) references public.pro_work_budget_codes(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,library_id) references public.pro_cost_code_library(owner_id,id) on delete set null(library_id)
);
create index if not exists pro_work_budget_line_settings_library on public.pro_work_budget_line_settings(owner_id,library_id);
create table if not exists public.pro_work_budget_extra_state(
 owner_id uuid not null,work_id text not null,revision integer not null check(revision>0),
 primary key(owner_id,work_id),
 foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade
);
create table if not exists public.pro_work_budget_client_shares(
 owner_id uuid not null,work_id text not null,id uuid not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 shared_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,revoked_reason text check(revoked_reason is null or revoked_reason in('revoked','replaced')),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade,
 check((revoked_at is null)=(revoked_reason is null))
);
create unique index if not exists pro_work_budget_client_share_active on public.pro_work_budget_client_shares(owner_id,work_id) where revoked_at is null;
create index if not exists pro_work_budget_client_share_page on public.pro_work_budget_client_shares(owner_id,work_id,shared_at desc);
create table if not exists public.pro_cost_code_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 scope text not null check(scope in('library','work')),work_id text,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),check((scope='work')=(work_id is not null))
);

-- ===== Pure helpers =====
create or replace function public.pro_cost_code_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 -- Deterministic RFC 9562 version-4 shaped identity (version and variant bits set), so strict UUID readers accept it.
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 from(select md5(p_seed) h) x
$$;
create or replace function public.pro_cost_code_vat_rate(p_code text) returns numeric
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_code when '02' then 1 when '03' then 2 when '04' then 4 when '08' then 13 when '09' then 0.5 else 0 end::numeric
$$;
create or replace function public.pro_cost_code_json(p_row public.pro_cost_code_library) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'kind',p_row.kind,'code',p_row.code,'title',p_row.title,'parentId',p_row.parent_id,
  'unit',p_row.unit,'vatCode',p_row.vat_code,'markupBp',p_row.markup_bp,'archived',p_row.archived,'source',p_row.source)
$$;
-- Own starter list for Costa Rica construction and remodeling trades (editable after import).
create or replace function public.pro_cost_code_starter()
returns table(pos integer,code text,kind text,parent_code text,title_es text,title_en text,unit_es text,unit_en text,vat_code text,markup_bp integer)
language sql immutable security invoker set search_path=public,pg_temp as $$
 select * from (values
  (1,'01','group',null,'Preliminares y trámites','Preliminaries and permits',null,null,null,null),
  (2,'01.01','item','01','Permisos, timbres y visado de planos','Permits, stamps and plan approval','global','lump sum','10',0),
  (3,'01.02','item','01','Diseño, planos y dirección técnica','Design, drawings and technical direction','global','lump sum','08',1000),
  (4,'01.03','item','01','Limpieza, trazado y nivelación','Site clearing, layout and leveling','m²','m²','08',1500),
  (5,'01.04','item','01','Instalaciones provisionales de obra','Temporary site facilities','global','lump sum','08',1000),
  (6,'01.05','item','01','Demolición y desalojo de escombros','Demolition and debris removal','m³','m³','08',1500),
  (7,'02','group',null,'Obra gris y estructura','Structure and shell',null,null,null,null),
  (8,'02.01','item','02','Excavación y movimiento de tierra','Excavation and earthwork','m³','m³','08',1500),
  (9,'02.02','item','02','Cimientos y placas','Foundations and footings','m³','m³','08',1500),
  (10,'02.03','item','02','Columnas, vigas y entrepisos','Columns, beams and slabs','m³','m³','08',1500),
  (11,'02.04','item','02','Paredes de bloque y mampostería','Block and masonry walls','m²','m²','08',1500),
  (12,'02.05','item','02','Acero de refuerzo','Reinforcing steel','kg','kg','08',1500),
  (13,'03','group',null,'Techos y cielos','Roofing and ceilings',null,null,null,null),
  (14,'03.01','item','03','Estructura de techo','Roof framing','m²','m²','08',1500),
  (15,'03.02','item','03','Cubierta de lámina','Roof sheeting','m²','m²','08',1500),
  (16,'03.03','item','03','Canoas, bajantes y precintas','Gutters, downspouts and fascia','ml','lm','08',1500),
  (17,'03.04','item','03','Cielos de gypsum o PVC','Gypsum or PVC ceilings','m²','m²','08',1500),
  (18,'04','group',null,'Instalación eléctrica','Electrical',null,null,null,null),
  (19,'04.01','item','04','Acometida, tablero y breakers','Service entrance, panel and breakers','global','lump sum','08',1500),
  (20,'04.02','item','04','Salidas de tomacorriente y apagadores','Outlets and switches','unidad','each','08',2000),
  (21,'04.03','item','04','Luminarias','Light fixtures','unidad','each','08',2000),
  (22,'04.04','item','04','Voz, datos y CCTV','Voice, data and CCTV','unidad','each','08',2000),
  (23,'05','group',null,'Instalación mecánica y plomería','Plumbing',null,null,null,null),
  (24,'05.01','item','05','Agua potable','Potable water supply','punto','point','08',2000),
  (25,'05.02','item','05','Aguas negras y servidas','Sanitary drainage','punto','point','08',2000),
  (26,'05.03','item','05','Aguas pluviales','Storm drainage','ml','lm','08',1500),
  (27,'05.04','item','05','Tanque séptico y drenaje','Septic tank and drain field','global','lump sum','08',1500),
  (28,'05.05','item','05','Agua caliente','Hot water','unidad','each','08',2000),
  (29,'06','group',null,'Acabados','Finishes',null,null,null,null),
  (30,'06.01','item','06','Repellos y afinados','Plaster and render','m²','m²','08',2000),
  (31,'06.02','item','06','Pisos y enchapes','Floor and wall tiling','m²','m²','08',2000),
  (32,'06.03','item','06','Pintura','Painting','m²','m²','08',2000),
  (33,'06.04','item','06','Rodapiés y molduras','Baseboards and trim','ml','lm','08',2000),
  (34,'07','group',null,'Puertas, ventanas y carpintería','Doors, windows and millwork',null,null,null,null),
  (35,'07.01','item','07','Puertas y cerrajería','Doors and hardware','unidad','each','08',1500),
  (36,'07.02','item','07','Ventanería de aluminio y vidrio','Aluminum and glass windows','m²','m²','08',1500),
  (37,'07.03','item','07','Muebles de cocina','Kitchen cabinets','ml','lm','08',2000),
  (38,'07.04','item','07','Closets y muebles fijos','Closets and built-ins','ml','lm','08',2000),
  (39,'08','group',null,'Cocina y baños','Kitchen and bathrooms',null,null,null,null),
  (40,'08.01','item','08','Loza sanitaria','Sanitary fixtures','unidad','each','08',1500),
  (41,'08.02','item','08','Grifería','Faucets and valves','unidad','each','08',1500),
  (42,'08.03','item','08','Sobres de granito o cuarzo','Granite or quartz countertops','m²','m²','08',1500),
  (43,'08.04','item','08','Accesorios y espejos de baño','Bathroom accessories and mirrors','unidad','each','08',1500),
  (44,'08.05','item','08','Electrodomésticos','Appliances','unidad','each','08',1000),
  (45,'09','group',null,'Obras exteriores','Exterior works',null,null,null,null),
  (46,'09.01','item','09','Aceras, cocheras y entradas','Sidewalks, carports and driveways','m²','m²','08',1500),
  (47,'09.02','item','09','Tapias, mallas y verjas','Walls, fences and railings','ml','lm','08',1500),
  (48,'09.03','item','09','Jardinería y zacate','Landscaping and lawn','m²','m²','08',1500),
  (49,'09.04','item','09','Portones','Gates','unidad','each','08',1500),
  (50,'10','group',null,'Indirectos de obra','Site overhead',null,null,null,null),
  (51,'10.01','item','10','Mano de obra por horas','Hourly labor','h','h','08',2500),
  (52,'10.02','item','10','Maestro de obras y supervisión','Foreman and supervision','semana','week','08',1500),
  (53,'10.03','item','10','Fletes y acarreos','Freight and hauling','viaje','trip','08',1000),
  (54,'10.04','item','10','Alquiler de equipo y andamios','Equipment and scaffolding rental','día','day','08',1000),
  (55,'10.05','item','10','Imprevistos','Contingency','global','lump sum','08',0)
 ) as s(pos,code,kind,parent_code,title_es,title_en,unit_es,unit_en,vat_code,markup_bp)
$$;
create or replace function public.pro_cost_code_line_figures(p_planned bigint,p_markup_bp integer,p_vat text)
returns table(markup bigint,sale bigint,tax bigint)
language sql immutable security invoker set search_path=public,pg_temp as $$
 with m as(select round(coalesce(p_planned,0)::numeric*coalesce(p_markup_bp,0)/10000)::bigint markup)
 select m.markup,coalesce(p_planned,0)+m.markup,round((coalesce(p_planned,0)+m.markup)::numeric*public.pro_cost_code_vat_rate(p_vat)/100)::bigint from m
$$;
create or replace function public.pro_cost_code_forecast_figures(p_planned bigint,p_markup bigint,p_sale bigint,p_tax bigint,
 p_committed bigint,p_actual bigint,p_unknown bigint,p_projected bigint,p_eac bigint) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('costCents',p_planned,'markupCents',p_markup,'saleCents',p_sale,'taxCents',p_tax,'totalCents',p_sale+p_tax,
  'committedCents',p_committed,'actualCents',p_actual,'unknownCount',p_unknown,'projectedCents',p_projected,
  'remainingCents',p_eac-p_projected,'eacCents',p_eac,
  'varianceCents',case when p_unknown>0 then null else p_planned-p_eac end,
  'consumedBp',case when p_planned>0 then (p_actual*10000/p_planned) else null end,
  'status',case when p_unknown>0 then 'incomplete' when p_planned=0 and p_eac=0 then 'idle' when p_eac>p_planned then 'over'
   when p_projected*10>=p_planned*9 then 'watch' else 'ok' end)
$$;

-- ===== Library =====
create or replace function public.pro_cost_codes_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;st text;lang text;items jsonb;rev integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_query) k where k not in('view','status','lang'))
  or jsonb_typeof(p_query->'view') is distinct from 'string' then raise exception 'Invalid cost code query' using errcode='22023';end if;
 v:=p_query->>'view';st:=coalesce(p_query->>'status','active');lang:=coalesce(p_query->>'lang','es');
 if v not in('library','starter') or st not in('active','archived','all') or lang not in('es','en') then raise exception 'Invalid cost code query' using errcode='22023';end if;
 rev:=coalesce((select revision from public.pro_cost_code_library_state where owner_id=p_actor),0);
 if v='starter' then
  select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'kind',s.kind,'parentCode',s.parent_code,
    'title',case when lang='en' then s.title_en else s.title_es end,'unit',case when lang='en' then s.unit_en else s.unit_es end,
    'vatCode',s.vat_code,'markupBp',s.markup_bp,'exists',exists(select 1 from public.pro_cost_code_library l where l.owner_id=p_actor and l.code=s.code)) order by s.pos),'[]'::jsonb)
   into items from public.pro_cost_code_starter() s;
  return jsonb_build_object('revision',rev,'lang',lang,'items',items);
 end if;
 select coalesce(jsonb_agg(public.pro_cost_code_json(c)||jsonb_build_object('parentCode',p.code,'parentTitle',p.title,
   'usage',(select count(*) from public.pro_work_budget_line_settings s where s.owner_id=p_actor and s.library_id=c.id))
   order by coalesce(p.code,c.code),c.parent_id is not null,c.code),'[]'::jsonb) into items
  from public.pro_cost_code_library c left join public.pro_cost_code_library p on p.owner_id=c.owner_id and p.id=c.parent_id
  where c.owner_id=p_actor and(st='all' or c.archived=(st='archived'));
 return jsonb_build_object('revision',rev,'status',st,'items',items,
  'activeCount',(select count(*) from public.pro_cost_code_library where owner_id=p_actor and not archived),
  'archivedCount',(select count(*) from public.pro_cost_code_library where owner_id=p_actor and archived),
  'capacity',500);
end $$;

create or replace function public.pro_cost_codes_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;rev integer;cur integer;keys text[];receipt public.pro_cost_code_actions;r public.pro_cost_code_library;
 cid uuid;pid uuid;created integer:=0;linked integer:=0;skipped integer:=0;lang text;wanted text[];srow record;wrow record;
 lib_id uuid;wid text;result jsonb;code_json jsonb;v_unit text;v_vat text;v_markup integer;ctx jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce(p_input->>'revision' ~ '^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then
  raise exception 'Invalid cost code mutation' using errcode='22023';end if;
 act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 keys:=array['action','actionId','revision']||case act when 'save' then array['id','kind','code','title','parentId','unit','vatCode','markupBp']
  when 'archive' then array['id'] when 'restore' then array['id'] when 'import_starter' then array['lang','codes'] when 'import_work' then array['workId'] else null end;
 if keys is null or not(p_input ?& keys) or(p_input-keys)<>'{}'::jsonb then raise exception 'Invalid cost code fields' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-cost-codes-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-cost-codes:'||p_actor::text,0));
 select * into receipt from public.pro_cost_code_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Cost code action reused' using errcode='40001';end if;
  return receipt.result;
 end if;
 select revision into cur from public.pro_cost_code_library_state where owner_id=p_actor for update;
 if coalesce(cur,0)<>rev then raise exception 'Cost code library changed' using errcode='40001';end if;
 if act='save' then
  if jsonb_typeof(p_input->'id') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string' or p_input->>'kind' not in('group','item')
   or jsonb_typeof(p_input->'code') is distinct from 'string' or not coalesce(p_input->>'code' ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$',false)
   or jsonb_typeof(p_input->'title') is distinct from 'string' or length(btrim(p_input->>'title')) not between 1 and 160 or p_input->>'title' ~ '[[:cntrl:]]'
   or jsonb_typeof(p_input->'parentId') not in('null','string') or jsonb_typeof(p_input->'unit') not in('null','string')
   or jsonb_typeof(p_input->'vatCode') not in('null','string') or jsonb_typeof(p_input->'markupBp') not in('null','number') then
   raise exception 'Invalid cost code content' using errcode='22023';end if;
  cid:=(p_input->>'id')::uuid;pid:=(p_input->>'parentId')::uuid;
  v_unit:=nullif(btrim(p_input->>'unit'),'');v_vat:=p_input->>'vatCode';
  if jsonb_typeof(p_input->'markupBp')='number' then
   if not coalesce(p_input->>'markupBp' ~ '^[0-9]{1,6}$',false) or(p_input->>'markupBp')::integer>100000 then raise exception 'Invalid markup' using errcode='22023';end if;
   v_markup:=(p_input->>'markupBp')::integer;
  end if;
  if p_input->>'kind'='group' and(pid is not null or v_unit is not null or v_vat is not null or v_markup is not null) then raise exception 'Groups only have code and name' using errcode='22023';end if;
  if v_vat is not null and v_vat not in('01','02','03','04','08','09','10','11') then raise exception 'Invalid VAT tariff' using errcode='22023';end if;
  if v_unit is not null and(length(v_unit)>20 or v_unit ~ '[[:cntrl:]]') then raise exception 'Invalid unit' using errcode='22023';end if;
  select * into r from public.pro_cost_code_library where owner_id=p_actor and id=cid for update;
  if found and(r.archived or r.kind<>p_input->>'kind') then raise exception 'Restore code or retain its kind' using errcode='40001';end if;
  if not found and(select count(*) from public.pro_cost_code_library where owner_id=p_actor)>=500 then raise exception 'Cost code capacity reached' using errcode='54000';end if;
  if pid is not null and not exists(select 1 from public.pro_cost_code_library where owner_id=p_actor and id=pid and kind='group' and not archived) then
   raise exception 'Choose an active group' using errcode='40001';end if;
  insert into public.pro_cost_code_library(owner_id,id,kind,code,title,parent_id,unit,vat_code,markup_bp)
   values(p_actor,cid,p_input->>'kind',p_input->>'code',btrim(p_input->>'title'),pid,v_unit,v_vat,v_markup)
   on conflict(owner_id,id) do update set code=excluded.code,title=excluded.title,parent_id=excluded.parent_id,unit=excluded.unit,
    vat_code=excluded.vat_code,markup_bp=excluded.markup_bp,updated_at=clock_timestamp()
   returning * into r;
  code_json:=public.pro_cost_code_json(r);
 elsif act in('archive','restore') then
  if jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid cost code identity' using errcode='22023';end if;
  cid:=(p_input->>'id')::uuid;
  select * into r from public.pro_cost_code_library where owner_id=p_actor and id=cid for update;
  if not found then raise exception 'Cost code unavailable' using errcode='P0002';end if;
  if r.archived=(act='archive') then raise exception 'Cost code status changed' using errcode='40001';end if;
  if act='archive' and r.kind='group' and exists(select 1 from public.pro_cost_code_library where owner_id=p_actor and parent_id=cid and not archived) then
   raise exception 'Archive active children first' using errcode='40001';end if;
  if act='restore' and r.parent_id is not null and not exists(select 1 from public.pro_cost_code_library where owner_id=p_actor and id=r.parent_id and not archived) then
   raise exception 'Restore parent group first' using errcode='40001';end if;
  update public.pro_cost_code_library set archived=(act='archive'),updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into r;
  code_json:=public.pro_cost_code_json(r);
 elsif act='import_starter' then
  lang:=p_input->>'lang';
  if lang is null or lang not in('es','en') or jsonb_typeof(p_input->'codes') is distinct from 'array'
   or jsonb_array_length(p_input->'codes') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(p_input->'codes') e where jsonb_typeof(e) is distinct from 'string')
   or exists(select 1 from jsonb_array_elements_text(p_input->'codes') e where e not in(select code from public.pro_cost_code_starter()))
   or(select count(distinct e) from jsonb_array_elements_text(p_input->'codes') e)<>jsonb_array_length(p_input->'codes') then
   raise exception 'Invalid starter selection' using errcode='22023';end if;
  select array_agg(e) into wanted from jsonb_array_elements_text(p_input->'codes') e;
  -- A chosen item brings its group.
  wanted:=wanted||coalesce((select array_agg(distinct s2.parent_code) from public.pro_cost_code_starter() s2 where s2.code=any(wanted) and s2.parent_code is not null),array[]::text[]);
  for srow in select * from public.pro_cost_code_starter() st where st.code=any(wanted) order by st.kind='item',st.pos loop
   if exists(select 1 from public.pro_cost_code_library where owner_id=p_actor and code=srow.code) then skipped:=skipped+1;continue;end if;
   if(select count(*) from public.pro_cost_code_library where owner_id=p_actor)>=500 then raise exception 'Cost code capacity reached' using errcode='54000';end if;
   pid:=null;
   if srow.parent_code is not null then select id into pid from public.pro_cost_code_library where owner_id=p_actor and code=srow.parent_code and kind='group' and not archived;end if;
   insert into public.pro_cost_code_library(owner_id,id,kind,code,title,parent_id,unit,vat_code,markup_bp,source)
    values(p_actor,public.pro_cost_code_uuid('starter:'||aid::text||':'||srow.code),srow.kind,srow.code,case when lang='en' then srow.title_en else srow.title_es end,pid,
     case when lang='en' then srow.unit_en else srow.unit_es end,srow.vat_code,srow.markup_bp,'starter');
   created:=created+1;
  end loop;
 else -- import_work: copy the per-work codes of one project into the library and link them.
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
  wid:=p_input->>'workId';ctx:=public.pro_work_budget_context(p_actor,wid);
  perform pg_advisory_xact_lock(hashtextextended('pro-work-budget:'||p_actor::text||':'||wid,0));
  if not exists(select 1 from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid and not archived) then
   raise exception 'The work has no active budget codes' using errcode='40001';end if;
  for wrow in select c.*,ls.library_id,ls.markup_bp lm,ls.vat_code lv,p.code parent_code from public.pro_work_budget_codes c
    left join public.pro_work_budget_line_settings ls on ls.owner_id=c.owner_id and ls.work_id=c.work_id and ls.code_id=c.id
    left join public.pro_work_budget_codes p on p.owner_id=c.owner_id and p.work_id=c.work_id and p.id=c.parent_id
    where c.owner_id=p_actor and c.work_id=wid and not c.archived order by c.kind='item',c.code loop
   select id into lib_id from public.pro_cost_code_library where owner_id=p_actor and code=wrow.code and kind=wrow.kind;
   if lib_id is null then
    if exists(select 1 from public.pro_cost_code_library where owner_id=p_actor and code=wrow.code) then skipped:=skipped+1;continue;end if;
    if(select count(*) from public.pro_cost_code_library where owner_id=p_actor)>=500 then raise exception 'Cost code capacity reached' using errcode='54000';end if;
    pid:=null;
    if wrow.parent_code is not null then select id into pid from public.pro_cost_code_library where owner_id=p_actor and code=wrow.parent_code and kind='group' and not archived;end if;
    lib_id:=public.pro_cost_code_uuid('work:'||aid::text||':'||wrow.id::text);
    insert into public.pro_cost_code_library(owner_id,id,kind,code,title,parent_id,unit,vat_code,markup_bp,source)
     values(p_actor,lib_id,wrow.kind,wrow.code,wrow.title,pid,null,case when wrow.kind='item' then wrow.lv end,case when wrow.kind='item' then wrow.lm end,'work');
    created:=created+1;
   else linked:=linked+1;end if;
   insert into public.pro_work_budget_line_settings(owner_id,work_id,code_id,library_id) values(p_actor,wid,wrow.id,lib_id)
    on conflict(owner_id,work_id,code_id) do update set library_id=coalesce(public.pro_work_budget_line_settings.library_id,excluded.library_id);
  end loop;
  insert into public.pro_work_budget_extra_state values(p_actor,wid,1) on conflict(owner_id,work_id) do update set revision=public.pro_work_budget_extra_state.revision+1;
 end if;
 if cur is null then insert into public.pro_cost_code_library_state values(p_actor,1);
 else update public.pro_cost_code_library_state set revision=revision+1 where owner_id=p_actor;end if;
 result:=jsonb_build_object('action',act,'revision',rev+1,'code',code_json,'created',created,'linked',linked,'skipped',skipped);
 insert into public.pro_cost_code_actions(owner_id,action_id,scope,work_id,input,result) values(p_actor,aid,'library',null,p_input,result);
 return result;
end $$;

-- ===== Forecast (owner) =====
create or replace function public.pro_cost_code_forecast_rows(p_owner uuid,p_work text)
returns table(id uuid,kind text,code text,title text,parent_id uuid,archived boolean,library_id uuid,library_code text,markup_bp integer,vat_code text,
 planned bigint,committed bigint,actual bigint,unknown bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 with sources as materialized(select * from public.pro_work_budget_sources(p_owner,p_work)),
 committed as materialized(select l.budget_code_id code_id,sum(l.subtotal_cents+l.tax_cents)::bigint cents
   from public.pro_purchase_order_lines l join public.pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id
   where l.owner_id=p_owner and l.work_id=p_work and o.status<>'cancelled' and l.budget_code_id is not null group by l.budget_code_id)
 select c.id,c.kind,c.code,c.title,c.parent_id,c.archived,s.library_id,lib.code,s.markup_bp,s.vat_code,
  c.planned_cents,coalesce(m.cents,0)::bigint,
  coalesce((select sum(x.amount_cents) from sources x where x.code_id=c.id),0)::bigint,
  (select count(*) from sources x where x.code_id=c.id and x.amount_cents is null)::bigint
 from public.pro_work_budget_codes c
 left join public.pro_work_budget_line_settings s on s.owner_id=c.owner_id and s.work_id=c.work_id and s.code_id=c.id
 left join public.pro_cost_code_library lib on lib.owner_id=s.owner_id and lib.id=s.library_id
 left join committed m on m.code_id=c.id
 where c.owner_id=p_owner and c.work_id=p_work
$$;

-- Client-visible summary: active groups and sale totals only (never cost, markup, committed or actual).
create or replace function public.pro_cost_code_client_snapshot(p_owner uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with codes as materialized(select * from public.pro_work_budget_codes where owner_id=p_owner and work_id=p_work),
 items as materialized(select i.id,i.parent_id,f.sale,f.tax from codes i
   left join public.pro_work_budget_line_settings s on s.owner_id=i.owner_id and s.work_id=i.work_id and s.code_id=i.id
   cross join lateral public.pro_cost_code_line_figures(i.planned_cents,s.markup_bp,s.vat_code) f
   where i.kind='item' and not i.archived and(i.parent_id is null or exists(select 1 from codes g where g.id=i.parent_id and not g.archived))),
 groups as(select g.code,g.title,sum(i.sale)::bigint sale from codes g join items i on i.parent_id=g.id group by g.id,g.code,g.title)
 select jsonb_build_object('title',(select service from public.pro_work where user_id=p_owner and id=p_work),'currency','CRC',
  'groups',coalesce((select jsonb_agg(jsonb_build_object('code',code,'title',title,'saleCents',sale) order by code) from groups),'[]'::jsonb),
  'otherSaleCents',(select sum(sale)::bigint from items where parent_id is null),
  'lineCount',(select count(*) from items),
  'saleCents',coalesce((select sum(sale) from items),0)::bigint,'taxCents',coalesce((select sum(tax) from items),0)::bigint,
  'totalCents',coalesce((select sum(sale+tax) from items),0)::bigint)
$$;

create or replace function public.pro_cost_code_forecast_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;rows jsonb;totals jsonb;loose record;share_row public.pro_work_budget_client_shares;current_snapshot jsonb;hist jsonb;customer text;
begin
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid forecast query' using errcode='22023';end if;
 ctx:=public.pro_work_budget_context(p_actor,p_work);
 with r as materialized(select * from public.pro_cost_code_forecast_rows(p_actor,p_work)),
 items as materialized(select r.*,f.markup,f.sale,f.tax,greatest(r.committed,r.actual) projected,greatest(r.planned,greatest(r.committed,r.actual)) eac
   from r cross join lateral public.pro_cost_code_line_figures(r.planned,r.markup_bp,r.vat_code) f where r.kind='item'),
 grouped as(select g.id,g.kind,g.code,g.title,g.parent_id,g.archived,g.library_id,g.library_code,null::integer markup_bp,null::text vat_code,
   coalesce(sum(i.planned),0)::bigint planned,coalesce(sum(i.markup),0)::bigint markup,coalesce(sum(i.sale),0)::bigint sale,coalesce(sum(i.tax),0)::bigint tax,
   coalesce(sum(i.committed),0)::bigint committed,coalesce(sum(i.actual),0)::bigint actual,coalesce(sum(i.unknown),0)::bigint unknown,
   coalesce(sum(i.projected),0)::bigint projected,coalesce(sum(i.eac),0)::bigint eac,count(i.id) children
   from r g left join items i on i.parent_id=g.id where g.kind='group' group by g.id,g.kind,g.code,g.title,g.parent_id,g.archived,g.library_id,g.library_code),
 every as(select id,kind,code,title,parent_id,archived,library_id,library_code,markup_bp,vat_code,planned,markup,sale,tax,committed,actual,unknown,projected,eac,null::bigint children from items
   union all select * from grouped)
 select coalesce(jsonb_agg(jsonb_build_object('codeId',e.id,'kind',e.kind,'code',e.code,'title',e.title,'parentId',e.parent_id,'archived',e.archived,
   'libraryId',e.library_id,'libraryCode',e.library_code,'markupBp',e.markup_bp,'vatCode',e.vat_code,'childCount',e.children)
   ||public.pro_cost_code_forecast_figures(e.planned,e.markup,e.sale,e.tax,e.committed,e.actual,e.unknown,e.projected,e.eac)
   order by coalesce((select p.code from r p where p.id=e.parent_id),e.code),e.parent_id is not null,e.code),'[]'::jsonb) into rows from every e;
 select coalesce((select sum(l.subtotal_cents+l.tax_cents) from public.pro_purchase_order_lines l join public.pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id
   where l.owner_id=p_actor and l.work_id=p_work and o.status<>'cancelled' and l.budget_code_id is null),0)::bigint committed,
  coalesce((select sum(s.amount_cents) from public.pro_work_budget_sources(p_actor,p_work) s where s.code_id is null),0)::bigint actual,
  (select count(*) from public.pro_work_budget_sources(p_actor,p_work) s where s.code_id is null and s.amount_cents is null)::bigint unknown
  into loose;
 with r as materialized(select * from public.pro_cost_code_forecast_rows(p_actor,p_work) where kind='item'),
 items as(select r.*,f.markup,f.sale,f.tax,greatest(r.committed,r.actual) projected,greatest(r.planned,greatest(r.committed,r.actual)) eac
   from r cross join lateral public.pro_cost_code_line_figures(r.planned,r.markup_bp,r.vat_code) f)
 select public.pro_cost_code_forecast_figures(coalesce(sum(planned),0)::bigint,coalesce(sum(markup),0)::bigint,coalesce(sum(sale),0)::bigint,coalesce(sum(tax),0)::bigint,
   coalesce(sum(committed),0)::bigint+loose.committed,coalesce(sum(actual),0)::bigint+loose.actual,coalesce(sum(unknown),0)::bigint+loose.unknown,
   coalesce(sum(projected),0)::bigint+greatest(loose.committed,loose.actual),coalesce(sum(eac),0)::bigint+greatest(loose.committed,loose.actual))
  ||jsonb_build_object('itemCount',count(*),'pricedCount',count(*) filter(where markup_bp is not null or vat_code is not null),
   'overCount',count(*) filter(where unknown=0 and eac>planned),'watchCount',count(*) filter(where unknown=0 and eac<=planned and planned>0 and projected*10>=planned*9))
  into totals from items;
 select * into share_row from public.pro_work_budget_client_shares where owner_id=p_actor and work_id=p_work and revoked_at is null;
 current_snapshot:=public.pro_cost_code_client_snapshot(p_actor,p_work);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'sharedAt',x.shared_at,'revokedAt',x.revoked_at,'reason',x.revoked_reason,'totalCents',(x.snapshot->>'totalCents')::bigint) order by x.shared_at desc,x.id),'[]'::jsonb)
  into hist from(select * from public.pro_work_budget_client_shares where owner_id=p_actor and work_id=p_work order by shared_at desc,id limit 10) x;
 select ar.client_name into customer from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
  where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
  order by ar.updated_at desc,ar.id desc limit 1;
 return jsonb_build_object('work',jsonb_build_object('id',ctx->>'id','clientId',ctx->>'clientId','title',ctx->>'title'),
  'currency','CRC','canWrite',not(ctx->>'cancelled')::boolean and not(ctx->>'clientArchived')::boolean,
  'budgetRevision',coalesce((select revision from public.pro_work_budget_state where owner_id=p_actor and work_id=p_work),0),
  'revision',coalesce((select revision from public.pro_work_budget_extra_state where owner_id=p_actor and work_id=p_work),0),
  'rows',rows,'totals',totals||jsonb_build_object('uncoded',jsonb_build_object('committedCents',loose.committed,'actualCents',loose.actual,'unknownCount',loose.unknown,
   'projectedCents',greatest(loose.committed,loose.actual))),
  'clientPreview',current_snapshot,
  'share',case when share_row.id is null then null else jsonb_build_object('id',share_row.id,'sharedAt',share_row.shared_at,'snapshot',share_row.snapshot,
   'stale',share_row.snapshot is distinct from current_snapshot) end,
  'shareHistory',hist,'customerName',customer);
end $$;

create or replace function public.pro_cost_code_extras_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;wid text;rev integer;cur integer;keys text[];receipt public.pro_cost_code_actions;ctx jsonb;brev integer;
 ids uuid[];lib record;work_code public.pro_work_budget_codes;new_id uuid;mapped jsonb:='{}'::jsonb;created integer:=0;linked integer:=0;skipped integer:=0;
 v_vat text;v_markup integer;result jsonb;snapshot jsonb;share_id uuid;active public.pro_work_budget_client_shares;n integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision' ~ '^[0-9]{1,10}$',false)
  or(p_input->>'revision')::numeric>2147483646 or length(p_input->>'workId') not between 1 and 160 then
  raise exception 'Invalid budget extras mutation' using errcode='22023';end if;
 act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;
 keys:=array['action','actionId','workId','revision']||case act when 'price' then array['codeIds','markupBp','vatCode']
  when 'apply_library' then array['budgetRevision','libraryIds'] when 'share' then array[]::text[] when 'revoke' then array['shareId'] else null end;
 if keys is null or not(p_input ?& keys) or(p_input-keys)<>'{}'::jsonb then raise exception 'Invalid budget extras fields' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-cost-codes-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-budget:'||p_actor::text||':'||wid,0));
 ctx:=public.pro_work_budget_context(p_actor,wid);
 select * into receipt from public.pro_cost_code_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Budget extras action reused' using errcode='40001';end if;
  return receipt.result;
 end if;
 if(ctx->>'cancelled')::boolean or(ctx->>'clientArchived')::boolean then raise exception 'Restore work or customer before changing budget' using errcode='40001';end if;
 select revision into cur from public.pro_work_budget_extra_state where owner_id=p_actor and work_id=wid for update;
 if coalesce(cur,0)<>rev then raise exception 'Budget extras changed' using errcode='40001';end if;
 if act in('price','apply_library') then
  if jsonb_typeof(p_input->case when act='price' then 'codeIds' else 'libraryIds' end) is distinct from 'array' then raise exception 'Invalid identities' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_input->case when act='price' then 'codeIds' else 'libraryIds' end) e where jsonb_typeof(e) is distinct from 'string') then raise exception 'Invalid identities' using errcode='22023';end if;
  select array_agg(e::uuid) into ids from jsonb_array_elements_text(p_input->case when act='price' then 'codeIds' else 'libraryIds' end) e;
  if coalesce(array_length(ids,1),0) not between 1 and 500 or(select count(distinct x) from unnest(ids) x)<>array_length(ids,1) then raise exception 'Invalid identities' using errcode='22023';end if;
 end if;
 if act='price' then
  if jsonb_typeof(p_input->'markupBp') is distinct from 'number' or not coalesce(p_input->>'markupBp' ~ '^[0-9]{1,6}$',false) or(p_input->>'markupBp')::integer>100000
   or jsonb_typeof(p_input->'vatCode') not in('null','string') or(p_input->>'vatCode' is not null and p_input->>'vatCode' not in('01','02','03','04','08','09','10','11')) then
   raise exception 'Invalid markup or VAT' using errcode='22023';end if;
  v_markup:=(p_input->>'markupBp')::integer;v_vat:=p_input->>'vatCode';
  select count(*) into n from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid and id=any(ids) and kind='item' and not archived;
  if n<>array_length(ids,1) then raise exception 'Choose active budget items' using errcode='40001';end if;
  insert into public.pro_work_budget_line_settings(owner_id,work_id,code_id,markup_bp,vat_code) select p_actor,wid,x,v_markup,v_vat from unnest(ids) x
   on conflict(owner_id,work_id,code_id) do update set markup_bp=excluded.markup_bp,vat_code=excluded.vat_code;
  linked:=n;
 elsif act='apply_library' then
  if jsonb_typeof(p_input->'budgetRevision') is distinct from 'number' or not coalesce(p_input->>'budgetRevision' ~ '^[0-9]{1,10}$',false) then raise exception 'Invalid budget revision' using errcode='22023';end if;
  brev:=coalesce((select revision from public.pro_work_budget_state where owner_id=p_actor and work_id=wid),0);
  if brev<>(p_input->>'budgetRevision')::bigint then raise exception 'Budget changed' using errcode='40001';end if;
  select count(*) into n from public.pro_cost_code_library where owner_id=p_actor and id=any(ids) and not archived;
  if n<>array_length(ids,1) then raise exception 'Library changed' using errcode='40001';end if;
  -- A chosen item that will be created brings its active group (a linked item keeps its current group).
  ids:=ids||coalesce((select array_agg(distinct l.parent_id) from public.pro_cost_code_library l where l.owner_id=p_actor and l.id=any(ids) and l.parent_id is not null
   and not exists(select 1 from public.pro_work_budget_codes wc where wc.owner_id=p_actor and wc.work_id=wid and wc.code=l.code)
   and exists(select 1 from public.pro_cost_code_library g where g.owner_id=p_actor and g.id=l.parent_id and not g.archived) and not(l.parent_id=any(ids))),array[]::uuid[]);
  for lib in select * from public.pro_cost_code_library l where l.owner_id=p_actor and l.id=any(ids) order by l.kind='item',l.code loop
   select * into work_code from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid and code=lib.code;
   if found then
    if work_code.kind<>lib.kind or work_code.archived then skipped:=skipped+1;continue;end if;
    -- Existing per-work code with the same code: map it, keep its planned amount and pricing.
    insert into public.pro_work_budget_line_settings(owner_id,work_id,code_id,library_id,markup_bp,vat_code)
     values(p_actor,wid,work_code.id,lib.id,lib.markup_bp,lib.vat_code)
     on conflict(owner_id,work_id,code_id) do update set library_id=coalesce(public.pro_work_budget_line_settings.library_id,excluded.library_id);
    mapped:=mapped||jsonb_build_object(lib.id::text,work_code.id);linked:=linked+1;continue;
   end if;
   new_id:=public.pro_cost_code_uuid('budget-code:'||p_actor::text||':'||aid::text||':'||lib.id::text);
   perform public.pro_work_budget_mutate(p_actor,case when lib.kind='group' then
     jsonb_build_object('action','save_group','actionId',public.pro_cost_code_uuid('budget-action:'||aid::text||':'||lib.id::text),'workId',wid,'clientId',ctx->>'clientId','revision',brev,'id',new_id,'code',lib.code,'title',lib.title)
    else jsonb_build_object('action','save_item','actionId',public.pro_cost_code_uuid('budget-action:'||aid::text||':'||lib.id::text),'workId',wid,'clientId',ctx->>'clientId','revision',brev,'id',new_id,'code',lib.code,'title',lib.title,
     'parentId',case when lib.parent_id is not null and mapped ? lib.parent_id::text then mapped->lib.parent_id::text else 'null'::jsonb end,'plannedCents',0) end);
   brev:=brev+1;
   insert into public.pro_work_budget_line_settings(owner_id,work_id,code_id,library_id,markup_bp,vat_code) values(p_actor,wid,new_id,lib.id,lib.markup_bp,lib.vat_code);
   mapped:=mapped||jsonb_build_object(lib.id::text,new_id);created:=created+1;
  end loop;
 elsif act='share' then
  snapshot:=public.pro_cost_code_client_snapshot(p_actor,wid);
  if(snapshot->>'lineCount')::integer=0 then raise exception 'Nothing to share' using errcode='40001';end if;
  update public.pro_work_budget_client_shares set revoked_at=clock_timestamp(),revoked_reason='replaced' where owner_id=p_actor and work_id=wid and revoked_at is null;
  share_id:=public.pro_cost_code_uuid('budget-share:'||p_actor::text||':'||aid::text);
  insert into public.pro_work_budget_client_shares(owner_id,work_id,id,snapshot) values(p_actor,wid,share_id,snapshot);
 else -- revoke
  if jsonb_typeof(p_input->'shareId') is distinct from 'string' then raise exception 'Invalid share' using errcode='22023';end if;
  select * into active from public.pro_work_budget_client_shares where owner_id=p_actor and work_id=wid and revoked_at is null for update;
  if active.id is null or active.id<>(p_input->>'shareId')::uuid then raise exception 'Share changed' using errcode='40001';end if;
  update public.pro_work_budget_client_shares set revoked_at=clock_timestamp(),revoked_reason='revoked' where owner_id=p_actor and id=active.id;
  share_id:=active.id;
 end if;
 if not exists(select 1 from public.pro_work_budget_state where owner_id=p_actor and work_id=wid) then raise exception 'Create budget codes first' using errcode='40001';end if;
 if cur is null then insert into public.pro_work_budget_extra_state values(p_actor,wid,1);
 else update public.pro_work_budget_extra_state set revision=revision+1 where owner_id=p_actor and work_id=wid;end if;
 result:=jsonb_build_object('action',act,'workId',wid,'revision',rev+1,
  'budgetRevision',coalesce((select revision from public.pro_work_budget_state where owner_id=p_actor and work_id=wid),0),
  'created',created,'linked',linked,'skipped',skipped,'shareId',share_id);
 insert into public.pro_cost_code_actions(owner_id,action_id,scope,work_id,input,result) values(p_actor,aid,'work',wid,p_input,result);
 ctx:=public.pro_work_budget_context(p_actor,wid);
 if(ctx->>'cancelled')::boolean or(ctx->>'clientArchived')::boolean then raise exception 'Work or customer changed' using errcode='40001';end if;
 return result;
end $$;

-- ===== Customer reader =====
create or replace function public.pro_cost_code_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;s public.pro_work_budget_client_shares;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid budget summary query' using errcode='22023';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if req_status not in('confirmed','completed') then return jsonb_build_object('visible',false);end if;
 select * into s from public.pro_work_budget_client_shares where owner_id=owner and work_id=wid and revoked_at is null;
 if s.id is null then return jsonb_build_object('visible',false);end if;
 return jsonb_build_object('visible',true,'sharedAt',s.shared_at,'title',s.snapshot->'title','currency','CRC','groups',s.snapshot->'groups',
  'otherSaleCents',s.snapshot->'otherSaleCents','saleCents',s.snapshot->'saleCents','taxCents',s.snapshot->'taxCents','totalCents',s.snapshot->'totalCents');
end $$;

-- ===== Integrity =====
create or replace function public.pro_cost_code_action_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.profiles where id=old.owner_id) then return old;end if;
 raise exception 'Immutable cost code receipt' using errcode='23514';
end $$;
create or replace function public.pro_cost_code_share_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
  if not exists(select 1 from public.profiles where id=old.owner_id) or not exists(select 1 from public.pro_work_budget_state where owner_id=old.owner_id and work_id=old.work_id) then return old;end if;
  raise exception 'Shared budget summaries are kept' using errcode='23514';
 end if;
 -- Only one transition: active -> revoked/replaced. The shared snapshot never changes.
 if old.revoked_at is not null or new.revoked_at is null or(new.owner_id,new.work_id,new.id,new.snapshot,new.shared_at) is distinct from(old.owner_id,old.work_id,old.id,old.snapshot,old.shared_at) then
  raise exception 'Shared budget summary is immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_cost_code_action_immutable on public.pro_cost_code_actions;
create trigger pro_cost_code_action_immutable before update or delete on public.pro_cost_code_actions for each row execute function public.pro_cost_code_action_immutable();
drop trigger if exists pro_cost_code_share_guard on public.pro_work_budget_client_shares;
create trigger pro_cost_code_share_guard before update or delete on public.pro_work_budget_client_shares for each row execute function public.pro_cost_code_share_guard();

do $$declare t text;f record;begin
 foreach t in array array['pro_cost_code_library_state','pro_cost_code_library','pro_work_budget_line_settings','pro_work_budget_extra_state','pro_work_budget_client_shares','pro_cost_code_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'pro_cost_code%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
