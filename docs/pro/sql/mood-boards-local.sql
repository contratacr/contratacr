-- LOCAL PRO ONLY. Tableros de ideas por proyecto (row 61 of the parity register:
-- idea / mood boards). Per job (pro_work): boards → fixed-size pages → elements
-- (image, item of My items, color swatch, text note). Coordinates are normalized
-- integers in ten-thousandths of the page (0..10000), validated here.
-- Saving is per page with optimistic revision (40001 → 409) and idempotent receipts.
-- Sharing: the owner publishes an immutable snapshot; the linked customer
-- (confirmed/completed request) sees the latest published version only when the
-- opt-in customer-view section show_mood_boards is on, and can comment on it.
-- Images reuse the existing private job files (pro_work_files, bucket pro-work-files);
-- no new bucket. Nothing here sends notifications, charges, invoices or calls
-- external services. Only new objects: existing functions are not redefined.
begin;
-- Opt-in customer-view section, off by default: existing rows keep their current view.
alter table public.pro_client_dashboards add column if not exists show_mood_boards boolean not null default false;
create table if not exists public.pro_mood_boards(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 position bigint generated always as identity,
 name text not null check(length(name) between 1 and 80 and name=btrim(name)),
 room text check(room is null or length(room) between 1 and 80 and room=btrim(room)),
 page_format text not null check(page_format in('wide','a4')),
 archived boolean not null default false,
 -- Version of the snapshot the customer currently sees; null = not shared.
 published_version integer check(published_version is null or published_version between 1 and 100),
 check(not archived or published_version is null),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create unique index if not exists pro_mood_board_global_id on public.pro_mood_boards(id);
create index if not exists pro_mood_board_page on public.pro_mood_boards(owner_id,work_id,archived,updated_at desc);
create table if not exists public.pro_mood_board_pages(
 owner_id uuid not null,board_id uuid not null,id uuid not null,
 sort_order integer not null check(sort_order between 0 and 19),
 name text check(name is null or length(name) between 1 and 60 and name=btrim(name)),
 background text not null default '#ffffff' check(background~'^#[0-9a-f]{6}$'),
 elements jsonb not null default '[]'::jsonb check(jsonb_typeof(elements)='array' and jsonb_array_length(elements)<=60),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,board_id) references public.pro_mood_boards(owner_id,id) on delete cascade,
 constraint pro_mood_board_page_order unique(owner_id,board_id,sort_order) deferrable initially deferred
);
create unique index if not exists pro_mood_board_page_global_id on public.pro_mood_board_pages(id);
-- Immutable snapshots shown to the customer. Images keep only the job file id.
create table if not exists public.pro_mood_board_publications(
 owner_id uuid not null,id uuid not null,board_id uuid not null,work_id text not null,
 version integer not null check(version between 1 and 100),
 name text not null check(length(name) between 1 and 80),room text check(room is null or length(room) between 1 and 80),
 page_format text not null check(page_format in('wide','a4')),
 pages jsonb not null check(jsonb_typeof(pages)='array' and jsonb_array_length(pages) between 1 and 20),
 published_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,board_id,version),
 foreign key(owner_id,board_id) references public.pro_mood_boards(owner_id,id) on delete cascade
);
create unique index if not exists pro_mood_board_publication_global_id on public.pro_mood_board_publications(id);
-- Comments on a published board (customer or owner reply). The author identity is
-- captured, not a blocking FK: deleting a customer account never blocks the board.
create table if not exists public.pro_mood_board_comments(
 owner_id uuid not null,id uuid not null,board_id uuid not null,work_id text not null,version integer not null,
 side text not null check(side in('owner','client')),author_id uuid not null,author_name text check(author_name is null or length(author_name) between 1 and 160),
 body text not null check(length(body) between 1 and 1000 and body=btrim(body)),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,board_id,version) references public.pro_mood_board_publications(owner_id,board_id,version) on delete cascade
);
create unique index if not exists pro_mood_board_comment_global_id on public.pro_mood_board_comments(id);
create index if not exists pro_mood_board_comment_page on public.pro_mood_board_comments(owner_id,board_id,created_at,id);
create table if not exists public.pro_mood_board_history(
 owner_id uuid not null,work_id text not null,action_id uuid not null,actor_id uuid not null,side text not null check(side in('owner','client')),
 action text not null,board_id uuid not null,target_kind text not null check(target_kind in('board','page','comment')),target_id uuid not null,
 before_value jsonb,after_value jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,actor_id,action_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_mood_board_history_page on public.pro_mood_board_history(owner_id,board_id,at desc);
create table if not exists public.pro_mood_board_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create or replace function public.pro_mood_board_text(p_value jsonb,p_max integer) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v text;
begin
 if jsonb_typeof(p_value)='null' then return null;end if;
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Invalid board text' using errcode='22023';end if;
 v:=nullif(btrim(p_value#>>'{}'),'');
 if v is not null and length(v)>p_max then raise exception 'Board text too long' using errcode='22023';end if;
 return v;
end $$;
-- Validates and normalizes the elements of one page. Item elements keep the name,
-- unit and price captured when they were first placed (a snapshot of My items).
create or replace function public.pro_mood_board_elements(p_owner uuid,p_work text,p_input jsonb,p_previous jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare e jsonb;k text;kind text;keys text[];expected text[];result jsonb:='[]'::jsonb;ids uuid[]:='{}';eid uuid;
 x integer;y integer;w integer;h integer;rot integer;prev jsonb;prod public.pro_products;fid uuid;v_name text;v_unit text;v_cents bigint;v_text text;item jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'array' or jsonb_array_length(p_input)>60 then raise exception 'Invalid elements' using errcode='22023';end if;
 for e in select value from jsonb_array_elements(p_input) loop
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'kind') is distinct from 'string' or jsonb_typeof(e->'id') is distinct from 'string' then raise exception 'Invalid element' using errcode='22023';end if;
  kind:=e->>'kind';
  expected:=case kind when 'image' then array['fileId','h','id','kind','rotation','w','x','y']
   when 'product' then array['fileId','h','id','kind','productId','rotation','showPrice','w','x','y']
   when 'swatch' then array['color','h','id','kind','label','rotation','w','x','y']
   when 'note' then array['h','id','kind','rotation','text','w','x','y']
   -- Round 7C: free text, arrows and freehand drawing (points relative to the box, 0..1000).
   when 'text' then array['color','h','id','kind','rotation','text','w','x','y']
   when 'arrow' then array['color','h','id','kind','points','rotation','w','x','y']
   when 'drawing' then array['color','h','id','kind','points','rotation','w','x','y'] end;
  select array_agg(key order by key) into keys from jsonb_object_keys(e) key;
  if expected is null or keys is distinct from expected then raise exception 'Invalid element fields' using errcode='22023';end if;
  foreach k in array array['x','y','w','h','rotation'] loop
   if jsonb_typeof(e->k) is distinct from 'number' or not coalesce((e->>k)~'^[0-9]{1,5}$',false) then raise exception 'Invalid element geometry' using errcode='22023';end if;
  end loop;
  eid:=(e->>'id')::uuid;
  if eid=any(ids) then raise exception 'Duplicate element' using errcode='22023';end if;
  ids:=ids||eid;
  x:=(e->>'x')::integer;y:=(e->>'y')::integer;w:=(e->>'w')::integer;h:=(e->>'h')::integer;rot:=(e->>'rotation')::integer;
  -- At least 2% of the page per side and fully inside the page before rotation.
  if rot not in(0,90,180,270) or w<200 or h<200 or x+w>10000 or y+h>10000 then raise exception 'Element outside the page' using errcode='22023';end if;
  fid:=null;
  if kind in('image','product') then
   if jsonb_typeof(e->'fileId')='string' then fid:=(e->>'fileId')::uuid;
   elsif kind='image' or jsonb_typeof(e->'fileId') is distinct from 'null' then raise exception 'Invalid image' using errcode='22023';end if;
   -- Only a ready photo of this same job (the private job files are immutable).
   if fid is not null and not exists(select 1 from public.pro_work_files f where f.owner_id=p_owner and f.work_id=p_work and f.id=fid and f.ready and f.mime_type='image/jpeg') then raise exception 'Unknown image' using errcode='22023';end if;
  end if;
  item:=jsonb_build_object('id',eid,'kind',kind,'x',x,'y',y,'w',w,'h',h,'rotation',rot);
  if kind='image' then item:=item||jsonb_build_object('fileId',fid);
  elsif kind='product' then
   if jsonb_typeof(e->'productId') is distinct from 'string' or length(e->>'productId') not between 1 and 160 or jsonb_typeof(e->'showPrice') is distinct from 'boolean' then raise exception 'Invalid item element' using errcode='22023';end if;
   select value into prev from jsonb_array_elements(coalesce(p_previous,'[]'::jsonb)) where value->>'id'=eid::text and value->>'kind'='product' and value->>'productId'=e->>'productId' limit 1;
   if prev is not null then v_name:=prev->>'name';v_unit:=prev->>'unit';v_cents:=(prev->>'priceCents')::bigint;
   else
    select * into prod from public.pro_products p where p.user_id=p_owner and p.id=e->>'productId' and not p.archived;
    if not found then raise exception 'Unknown item' using errcode='22023';end if;
    v_name:=left(btrim(prod.name),160);v_unit:=nullif(left(btrim(coalesce(prod.unit,'')),40),'');v_cents:=round(prod.price*100)::bigint;
    if v_name='' then v_name:='—';end if;
    if v_cents not between 0 and 10000000000 then raise exception 'Item price outside the range' using errcode='22023';end if;
   end if;
   item:=item||jsonb_build_object('productId',e->>'productId','fileId',fid,'showPrice',(e->>'showPrice')::boolean,'name',v_name,'unit',v_unit,'priceCents',v_cents);
  elsif kind='swatch' then
   if jsonb_typeof(e->'color') is distinct from 'string' or not coalesce((e->>'color')~'^#[0-9a-f]{6}$',false) then raise exception 'Invalid color' using errcode='22023';end if;
   item:=item||jsonb_build_object('color',e->>'color','label',public.pro_mood_board_text(e->'label',60));
  elsif kind in('text','arrow','drawing') then
   if jsonb_typeof(e->'color') is distinct from 'string' or not coalesce((e->>'color')~'^#[0-9a-f]{6}$',false) then raise exception 'Invalid color' using errcode='22023';end if;
   if kind='text' then
    v_text:=public.pro_mood_board_text(e->'text',280);
    if v_text is null then raise exception 'Text required' using errcode='22023';end if;
    item:=item||jsonb_build_object('text',v_text,'color',e->>'color');
   else
    if jsonb_typeof(e->'points') is distinct from 'array' or kind='arrow' and jsonb_array_length(e->'points')<>2 or jsonb_array_length(e->'points') not between 2 and 120
     or exists(select 1 from jsonb_array_elements(e->'points') pt where jsonb_typeof(pt.value) is distinct from 'array' or jsonb_array_length(pt.value)<>2
       or jsonb_typeof(pt.value->0) is distinct from 'number' or jsonb_typeof(pt.value->1) is distinct from 'number'
       or not coalesce((pt.value->>0)~'^[0-9]{1,4}$' and (pt.value->>1)~'^[0-9]{1,4}$',false) or (pt.value->>0)::integer>1000 or (pt.value->>1)::integer>1000) then raise exception 'Invalid points' using errcode='22023';end if;
    item:=item||jsonb_build_object('color',e->>'color','points',e->'points');
   end if;
  else
   v_text:=public.pro_mood_board_text(e->'text',280);
   if v_text is null then raise exception 'Note text required' using errcode='22023';end if;
   item:=item||jsonb_build_object('text',v_text);
  end if;
  result:=result||jsonb_build_array(item);
 end loop;
 return result;
end $$;
create or replace function public.pro_mood_board_page_json(p_row public.pro_mood_board_pages) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'boardId',p_row.board_id,'sortOrder',p_row.sort_order,'name',p_row.name,'background',p_row.background,
  'elements',p_row.elements,'revision',p_row.revision,'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_mood_board_json(p_row public.pro_mood_boards) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'position',p_row.position,'name',p_row.name,'room',p_row.room,'pageFormat',p_row.page_format,
  'archived',p_row.archived,'publishedVersion',p_row.published_version,
  'publishedAt',(select pb.published_at from public.pro_mood_board_publications pb where pb.owner_id=p_row.owner_id and pb.board_id=p_row.id and pb.version=p_row.published_version),
  'pageCount',(select count(*) from public.pro_mood_board_pages pg where pg.owner_id=p_row.owner_id and pg.board_id=p_row.id),
  'cover',(select jsonb_build_object('background',pg.background,'elements',pg.elements) from public.pro_mood_board_pages pg where pg.owner_id=p_row.owner_id and pg.board_id=p_row.id order by pg.sort_order limit 1),
  'commentCount',(select count(*) from public.pro_mood_board_comments c where c.owner_id=p_row.owner_id and c.board_id=p_row.id),
  'clientCommentCount',(select count(*) from public.pro_mood_board_comments c where c.owner_id=p_row.owner_id and c.board_id=p_row.id and c.side='client'),
  'lastCommentAt',(select max(c.created_at) from public.pro_mood_board_comments c where c.owner_id=p_row.owner_id and c.board_id=p_row.id),
  'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_mood_board_comment_json(p_row public.pro_mood_board_comments) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'boardId',p_row.board_id,'version',p_row.version,'side',p_row.side,'authorName',p_row.author_name,'body',p_row.body,'createdAt',p_row.created_at);
$$;
create or replace function public.pro_mood_board_pages_json(p_owner uuid,p_board uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.pro_mood_board_page_json(pg) order by pg.sort_order),'[]'::jsonb) from public.pro_mood_board_pages pg where pg.owner_id=p_owner and pg.board_id=p_board;
$$;
-- Customer copy of snapshot elements: no job file ids, item ids or hidden prices.
create or replace function public.pro_mood_board_client_elements(p_elements jsonb) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(case e.value->>'kind'
   when 'image' then (e.value-'fileId')||jsonb_build_object('hasImage',true)
   when 'product' then (e.value-'fileId'-'productId'-'showPrice'-'priceCents')||jsonb_build_object('hasImage',jsonb_typeof(e.value->'fileId')='string',
    'priceCents',case when (e.value->>'showPrice')::boolean then e.value->'priceCents' else 'null'::jsonb end)
   else e.value end order by e.ordinality),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_elements,'[]'::jsonb)) with ordinality e;
$$;
create or replace function public.pro_mood_boards_read(p_actor uuid,p_work text,p_archived boolean default false) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;visible boolean;recipient text;active_count integer;archived_count integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_archived is null then raise exception 'Invalid board query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(public.pro_mood_board_json(b) order by b.updated_at desc,b.position desc),'[]'::jsonb) into items
  from public.pro_mood_boards b where b.owner_id=p_actor and b.work_id=p_work and b.archived=p_archived;
 select count(*) filter(where not archived),count(*) filter(where archived) into active_count,archived_count from public.pro_mood_boards where owner_id=p_actor and work_id=p_work;
 select coalesce(d.show_mood_boards,false) into visible from public.pro_client_dashboards d where d.owner_id=p_actor and d.work_id=p_work;
 select ar.client_name into recipient from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
  where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
  order by ar.updated_at desc,ar.id desc limit 1;
 return jsonb_build_object('workId',p_work,'archived',p_archived,'clientVisible',coalesce(visible,false),'recipientName',recipient,
  'counts',jsonb_build_object('active',active_count,'archived',archived_count),'items',items);
end $$;
create or replace function public.pro_mood_board_read(p_actor uuid,p_work text,p_board uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare board public.pro_mood_boards;publications jsonb;comments jsonb;hist jsonb;visible boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_board is null then raise exception 'Invalid board query' using errcode='22023';end if;
 select * into board from public.pro_mood_boards where owner_id=p_actor and work_id=p_work and id=p_board;
 if not found then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',pb.id,'version',pb.version,'publishedAt',pb.published_at,'pageCount',jsonb_array_length(pb.pages)) order by pb.version desc),'[]'::jsonb) into publications
  from public.pro_mood_board_publications pb where pb.owner_id=p_actor and pb.board_id=p_board;
 select coalesce(jsonb_agg(public.pro_mood_board_comment_json(c) order by c.created_at,c.id),'[]'::jsonb) into comments from (
  select * from public.pro_mood_board_comments where owner_id=p_actor and board_id=p_board order by created_at desc,id desc limit 300) c;
 select coalesce(jsonb_agg(x.content order by x.at desc),'[]'::jsonb) into hist from (
  select h.at,jsonb_build_object('actionId',h.action_id,'side',h.side,'action',h.action,'targetKind',h.target_kind,'targetId',h.target_id,'at',h.at) as content
  from public.pro_mood_board_history h where h.owner_id=p_actor and h.board_id=p_board order by h.at desc limit 50) x;
 select coalesce(d.show_mood_boards,false) into visible from public.pro_client_dashboards d where d.owner_id=p_actor and d.work_id=p_work;
 return jsonb_build_object('board',public.pro_mood_board_json(board),'pages',public.pro_mood_board_pages_json(p_actor,p_board),'publications',publications,
  'comments',comments,'history',hist,'clientVisible',coalesce(visible,false));
end $$;
-- Up to 30 active items of My items for the picker (name, code or category match).
create or replace function public.pro_mood_board_products(p_actor uuid,p_search text default '') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare needle text;items jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_search is null or length(p_search)>80 then raise exception 'Invalid item query' using errcode='22023';end if;
 needle:=nullif(lower(btrim(p_search)),'');
 select coalesce(jsonb_agg(x.content order by x.name,x.id),'[]'::jsonb) into items from (
  select p.name,p.id,jsonb_build_object('id',p.id,'name',left(btrim(p.name),160),'sku',nullif(left(btrim(p.sku),80),''),'unit',nullif(left(btrim(coalesce(p.unit,'')),40),''),
   'category',nullif(left(btrim(coalesce(p.category,'')),80),''),'priceCents',round(p.price*100)::bigint) as content
  from public.pro_products p where p.user_id=p_actor and not p.archived and length(btrim(p.name))>0 and p.price*100<=10000000000
   and (needle is null or strpos(lower(p.name),needle)>0 or strpos(lower(p.sku),needle)>0 or strpos(lower(coalesce(p.category,'')),needle)>0)
  order by p.name,p.id limit 30) x;
 return jsonb_build_object('items',items);
end $$;
-- Linked customer: request of this actor with a job, confirmed/completed, and the
-- section turned on in the customer view.
create or replace function public.pro_mood_board_client_context(p_actor uuid,p_request uuid,out owner uuid,out wid text,out found_request boolean,out visible boolean,out client_name text)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare req_status text;enabled boolean;
begin
 found_request:=false;visible:=false;
 select r.owner_id,r.work_id,r.status,r.client_name into owner,wid,req_status,client_name from public.pro_appointment_requests r where r.id=p_request and r.client_user_id=p_actor and r.work_id is not null;
 if not found then owner:=null;wid:=null;client_name:=null;return;end if;
 found_request:=true;
 select coalesce(d.show_mood_boards,false) into enabled from public.pro_client_dashboards d where d.owner_id=owner and d.work_id=wid;
 visible:=req_status in('confirmed','completed') and coalesce(enabled,false);
end $$;
create or replace function public.pro_mood_boards_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ctx record;boards jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into ctx from public.pro_mood_board_client_context(p_actor,p_request);
 if not ctx.found_request then return null;end if;
 if not ctx.visible then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'publicationId',pb.id,'version',pb.version,'publishedAt',pb.published_at,'name',pb.name,'room',pb.room,'pageFormat',pb.page_format,
   'pages',(select coalesce(jsonb_agg(jsonb_build_object('id',pg.value->>'id','name',pg.value->'name','background',pg.value->>'background','elements',public.pro_mood_board_client_elements(pg.value->'elements')) order by pg.ordinality),'[]'::jsonb)
    from jsonb_array_elements(pb.pages) with ordinality pg),
   'comments',(select coalesce(jsonb_agg(public.pro_mood_board_comment_json(c) order by c.created_at,c.id),'[]'::jsonb) from (
    select * from public.pro_mood_board_comments cm where cm.owner_id=b.owner_id and cm.board_id=b.id order by cm.created_at desc,cm.id desc limit 300) c)
  ) order by pb.published_at desc,b.id),'[]'::jsonb) into boards
  from public.pro_mood_boards b join public.pro_mood_board_publications pb on pb.owner_id=b.owner_id and pb.board_id=b.id and pb.version=b.published_version
  where b.owner_id=ctx.owner and b.work_id=ctx.wid and not b.archived;
 return jsonb_build_object('visible',true,'boards',boards);
end $$;
-- Image access. Owner mode (no publication): a ready photo of one of the owner's
-- jobs. Customer mode: an element of the currently published snapshot, visible to
-- the linked customer. Returns storage metadata of the reused job file.
create or replace function public.pro_mood_board_image(p_actor uuid,p_file uuid,p_publication uuid default null,p_page uuid default null,p_element uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pb public.pro_mood_board_publications;f public.pro_work_files;target uuid;allowed boolean:=false;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_publication is null then
  if p_file is null or p_page is not null or p_element is not null then raise exception 'Invalid image query' using errcode='22023';end if;
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  select * into f from public.pro_work_files where owner_id=p_actor and id=p_file and ready and mime_type='image/jpeg';
 else
  if p_file is not null or p_page is null or p_element is null then raise exception 'Invalid image query' using errcode='22023';end if;
  select * into pb from public.pro_mood_board_publications where id=p_publication;
  if not found then return null;end if;
  if pb.owner_id=p_actor then allowed:=coalesce(public.pro_private_work_tools_enabled(p_actor),false);
  else
   allowed:=exists(select 1 from public.pro_mood_boards b where b.owner_id=pb.owner_id and b.id=pb.board_id and b.published_version=pb.version and not b.archived)
    and exists(select 1 from public.pro_appointment_requests r join public.pro_client_dashboards d on d.owner_id=r.owner_id and d.work_id=r.work_id
     where r.owner_id=pb.owner_id and r.work_id=pb.work_id and r.client_user_id=p_actor and r.status in('confirmed','completed') and d.show_mood_boards);
  end if;
  if not allowed then return null;end if;
  select (el.value->>'fileId')::uuid into target from jsonb_array_elements(pb.pages) pg cross join lateral jsonb_array_elements(pg.value->'elements') el
   where pg.value->>'id'=p_page::text and el.value->>'id'=p_element::text and jsonb_typeof(el.value->'fileId')='string' limit 1;
  if target is null then return null;end if;
  select * into f from public.pro_work_files where owner_id=pb.owner_id and work_id=pb.work_id and id=target and ready and mime_type='image/jpeg';
 end if;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
create or replace function public.pro_mood_boards_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;bid uuid;rev integer;keys text[];expected text[];receipt public.pro_mood_board_actions;
 board public.pro_mood_boards;page public.pro_mood_board_pages;cm public.pro_mood_board_comments;before_json jsonb;after_json jsonb;result jsonb;
 kind text:='board';target uuid;v_name text;v_room text;v_format text;v_page uuid;v_new uuid;v_ids uuid[];v_bg text;v_elements jsonb;v_body text;v_comment uuid;n integer;v_version integer;v_author text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid board action' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 expected:=case act
  when 'board_create' then array['action','actionId','id','name','pageFormat','pageId','room','workId']
  when 'board_update' then array['action','actionId','id','name','pageFormat','revision','room','workId']
  when 'board_duplicate' then array['action','actionId','id','name','newId','workId']
  when 'board_archive' then array['action','actionId','id','revision','workId']
  when 'board_restore' then array['action','actionId','id','revision','workId']
  when 'page_add' then array['action','actionId','id','pageId','revision','workId']
  when 'page_reorder' then array['action','actionId','id','pageIds','revision','workId']
  when 'page_delete' then array['action','actionId','id','pageId','revision','workId']
  when 'page_save' then array['action','actionId','background','elements','id','name','pageId','revision','workId']
  when 'publish' then array['action','actionId','id','revision','workId']
  when 'unpublish' then array['action','actionId','id','revision','workId']
  when 'comment' then array['action','actionId','body','commentId','id','workId'] end;
 if expected is null or keys is distinct from expected
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or p_input?'revision' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646)
  then raise exception 'Invalid board fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid board identity' using errcode='22023';end if;
 -- Pure field validation before any lock.
 if act in('board_create','board_update','board_duplicate') then
  v_name:=public.pro_mood_board_text(p_input->'name',80);if v_name is null then raise exception 'Board name required' using errcode='22023';end if;
 end if;
 if act in('board_create','board_update') then
  v_room:=public.pro_mood_board_text(p_input->'room',80);
  if jsonb_typeof(p_input->'pageFormat') is distinct from 'string' or p_input->>'pageFormat' not in('wide','a4') then raise exception 'Invalid page format' using errcode='22023';end if;
  v_format:=p_input->>'pageFormat';
 end if;
 if act in('board_create','page_add','page_delete','page_save') then
  if jsonb_typeof(p_input->'pageId') is distinct from 'string' then raise exception 'Invalid page' using errcode='22023';end if;v_page:=(p_input->>'pageId')::uuid;
 end if;
 if act='board_duplicate' then
  if jsonb_typeof(p_input->'newId') is distinct from 'string' then raise exception 'Invalid board copy' using errcode='22023';end if;v_new:=(p_input->>'newId')::uuid;
  if v_new=bid then raise exception 'Invalid board copy' using errcode='22023';end if;
 end if;
 if act='page_reorder' then
  if jsonb_typeof(p_input->'pageIds') is distinct from 'array' or jsonb_array_length(p_input->'pageIds') not between 1 and 20
   or exists(select 1 from jsonb_array_elements(p_input->'pageIds') v where jsonb_typeof(v) is distinct from 'string') then raise exception 'Invalid page order' using errcode='22023';end if;
  select array_agg(v::uuid order by o) into v_ids from jsonb_array_elements_text(p_input->'pageIds') with ordinality t(v,o);
  if (select count(distinct x) from unnest(v_ids) x)<>array_length(v_ids,1) then raise exception 'Invalid page order' using errcode='22023';end if;
 end if;
 if act='page_save' then
  if jsonb_typeof(p_input->'background') is distinct from 'string' or not coalesce((p_input->>'background')~'^#[0-9a-f]{6}$',false) then raise exception 'Invalid background' using errcode='22023';end if;
  v_bg:=p_input->>'background';v_name:=public.pro_mood_board_text(p_input->'name',60);
 end if;
 if act='comment' then
  if jsonb_typeof(p_input->'commentId') is distinct from 'string' then raise exception 'Invalid comment' using errcode='22023';end if;v_comment:=(p_input->>'commentId')::uuid;
  v_body:=public.pro_mood_board_text(p_input->'body',1000);if v_body is null then raise exception 'Comment required' using errcode='22023';end if;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mood-board-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_mood_board_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 if act in('board_create','board_duplicate') then perform pg_advisory_xact_lock(hashtextextended('pro-mood-boards-work:'||p_actor::text||':'||wid,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mood-board:'||p_actor::text||':'||bid::text,0));
 if act='board_create' then
  if exists(select 1 from public.pro_mood_boards where id=bid) or exists(select 1 from public.pro_mood_board_pages where id=v_page) then raise exception 'Board already exists' using errcode='23505';end if;
  select count(*) into n from public.pro_mood_boards where owner_id=p_actor and work_id=wid and not archived;
  if n>=50 then raise exception 'Too many boards' using errcode='22023';end if;
  insert into public.pro_mood_boards(owner_id,id,work_id,name,room,page_format) values(p_actor,bid,wid,v_name,v_room,v_format) returning * into board;
  insert into public.pro_mood_board_pages(owner_id,board_id,id,sort_order) values(p_actor,bid,v_page,0);
  before_json:=null;target:=bid;
 elsif act='board_duplicate' then
  select * into board from public.pro_mood_boards where owner_id=p_actor and work_id=wid and id=bid;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.pro_mood_boards where id=v_new) then raise exception 'Board already exists' using errcode='23505';end if;
  select count(*) into n from public.pro_mood_boards where owner_id=p_actor and work_id=wid and not archived;
  if n>=50 then raise exception 'Too many boards' using errcode='22023';end if;
  before_json:=null;target:=v_new;
  -- The copy starts private: no publication and no comments.
  insert into public.pro_mood_boards(owner_id,id,work_id,name,room,page_format) values(p_actor,v_new,wid,v_name,board.room,board.page_format) returning * into board;
  insert into public.pro_mood_board_pages(owner_id,board_id,id,sort_order,name,background,elements)
   select p_actor,v_new,gen_random_uuid(),pg.sort_order,pg.name,pg.background,pg.elements from public.pro_mood_board_pages pg where pg.owner_id=p_actor and pg.board_id=bid;
 else
  select * into board from public.pro_mood_boards where owner_id=p_actor and work_id=wid and id=bid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  before_json:=public.pro_mood_board_json(board);target:=bid;
  if act='page_save' then
   if board.archived then raise exception 'Restore the board first' using errcode='22023';end if;
   select * into page from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid and id=v_page for update;
   if not found or page.revision<>rev then raise exception 'Page changed' using errcode='40001';end if;
   v_elements:=public.pro_mood_board_elements(p_actor,wid,p_input->'elements',page.elements);
   if page.name is not distinct from v_name and page.background=v_bg and page.elements=v_elements then raise exception 'No page changes' using errcode='22023';end if;
   before_json:=public.pro_mood_board_page_json(page);kind:='page';target:=v_page;
   update public.pro_mood_board_pages set name=v_name,background=v_bg,elements=v_elements,revision=revision+1,updated_at=now() where owner_id=p_actor and id=v_page returning * into page;
   update public.pro_mood_boards set updated_at=now() where owner_id=p_actor and id=bid returning * into board;
  elsif act='comment' then
   if board.archived or board.published_version is null then raise exception 'Publish the board first' using errcode='22023';end if;
   if exists(select 1 from public.pro_mood_board_comments where id=v_comment) then raise exception 'Comment already exists' using errcode='23505';end if;
   select count(*) into n from public.pro_mood_board_comments where owner_id=p_actor and board_id=bid;
   if n>=300 then raise exception 'Too many comments' using errcode='22023';end if;
   select nullif(left(btrim(coalesce(full_name,'')),160),'') into v_author from public.profiles where id=p_actor;
   insert into public.pro_mood_board_comments(owner_id,id,board_id,work_id,version,side,author_id,author_name,body) values(p_actor,v_comment,bid,wid,board.published_version,'owner',p_actor,v_author,v_body) returning * into cm;
   before_json:=null;kind:='comment';target:=v_comment;
  else
   if board.revision<>rev then raise exception 'Board changed' using errcode='40001';end if;
   if act<>'board_restore' and board.archived and act<>'board_archive' then raise exception 'Restore the board first' using errcode='22023';end if;
   if act='board_update' then
    if board.name=v_name and board.room is not distinct from v_room and board.page_format=v_format then raise exception 'No board changes' using errcode='22023';end if;
    update public.pro_mood_boards set name=v_name,room=v_room,page_format=v_format,revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='board_archive' then
    if board.archived then raise exception 'Board already archived' using errcode='22023';end if;
    -- Archiving also withdraws the board from the customer view.
    update public.pro_mood_boards set archived=true,published_version=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='board_restore' then
    if not board.archived then raise exception 'Board is not archived' using errcode='22023';end if;
    select count(*) into n from public.pro_mood_boards where owner_id=p_actor and work_id=wid and not archived;
    if n>=50 then raise exception 'Too many boards' using errcode='22023';end if;
    update public.pro_mood_boards set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='page_add' then
    select count(*) into n from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid;
    if n>=20 then raise exception 'Too many pages' using errcode='22023';end if;
    if exists(select 1 from public.pro_mood_board_pages where id=v_page) then raise exception 'Page already exists' using errcode='23505';end if;
    insert into public.pro_mood_board_pages(owner_id,board_id,id,sort_order) values(p_actor,bid,v_page,n);
    update public.pro_mood_boards set revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='page_reorder' then
    if array_length(v_ids,1)<>(select count(*) from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid)
     or exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.pro_mood_board_pages pg where pg.owner_id=p_actor and pg.board_id=bid and pg.id=x)) then raise exception 'Page order does not match the board' using errcode='40001';end if;
    if v_ids=(select array_agg(pg.id order by pg.sort_order) from public.pro_mood_board_pages pg where pg.owner_id=p_actor and pg.board_id=bid) then raise exception 'No page changes' using errcode='22023';end if;
    update public.pro_mood_board_pages pg set sort_order=t.o-1,updated_at=now() from unnest(v_ids) with ordinality t(x,o) where pg.owner_id=p_actor and pg.board_id=bid and pg.id=t.x;
    update public.pro_mood_boards set revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='page_delete' then
    if not exists(select 1 from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid and id=v_page) then raise exception 'Page changed' using errcode='40001';end if;
    if (select count(*) from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid)<=1 then raise exception 'A board keeps at least one page' using errcode='22023';end if;
    delete from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid and id=v_page;
    update public.pro_mood_board_pages pg set sort_order=t.o-1 from (select id,row_number() over(order by sort_order) o from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid) t
     where pg.owner_id=p_actor and pg.id=t.id and pg.sort_order<>t.o-1;
    update public.pro_mood_boards set revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='publish' then
    if not exists(select 1 from public.pro_mood_board_pages where owner_id=p_actor and board_id=bid and jsonb_array_length(elements)>0) then raise exception 'Add something to the board first' using errcode='22023';end if;
    select coalesce(max(version),0)+1 into v_version from public.pro_mood_board_publications where owner_id=p_actor and board_id=bid;
    if v_version>100 then raise exception 'Too many versions' using errcode='22023';end if;
    insert into public.pro_mood_board_publications(owner_id,id,board_id,work_id,version,name,room,page_format,pages)
     select p_actor,gen_random_uuid(),bid,wid,v_version,board.name,board.room,board.page_format,
      jsonb_agg(jsonb_build_object('id',pg.id,'name',pg.name,'background',pg.background,'elements',pg.elements) order by pg.sort_order)
     from public.pro_mood_board_pages pg where pg.owner_id=p_actor and pg.board_id=bid;
    update public.pro_mood_boards set published_version=v_version,revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   elsif act='unpublish' then
    if board.published_version is null then raise exception 'Board is not shared' using errcode='22023';end if;
    update public.pro_mood_boards set published_version=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=bid returning * into board;
   end if;
  end if;
 end if;
 if kind='comment' then after_json:=public.pro_mood_board_comment_json(cm);result:=jsonb_build_object('comment',after_json);
 elsif kind='page' then after_json:=public.pro_mood_board_page_json(page);result:=jsonb_build_object('board',public.pro_mood_board_json(board),'page',after_json);
 else after_json:=public.pro_mood_board_json(board);result:=jsonb_build_object('board',after_json,'pages',public.pro_mood_board_pages_json(p_actor,board.id));
 end if;
 insert into public.pro_mood_board_history(owner_id,work_id,action_id,actor_id,side,action,board_id,target_kind,target_id,before_value,after_value)
  values(p_actor,wid,aid,p_actor,'owner',act,board.id,kind,target,before_json,after_json);
 insert into public.pro_mood_board_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- Customer comment on the version they see. A stale version (owner republished or
-- withdrew it meanwhile) is a conflict, so the customer reloads before commenting.
create or replace function public.pro_mood_boards_client_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;bid uuid;cid uuid;ver integer;keys text[];receipt public.pro_mood_board_actions;ctx record;board public.pro_mood_boards;cm public.pro_mood_board_comments;
 v_body text;n integer;result jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid comment' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','boardId','body','commentId','requestId','version'] or p_input->>'action' is distinct from 'comment' or jsonb_typeof(p_input->'action') is distinct from 'string'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'boardId') is distinct from 'string'
  or jsonb_typeof(p_input->'commentId') is distinct from 'string' or jsonb_typeof(p_input->'version') is distinct from 'number' or not coalesce((p_input->>'version')~'^[0-9]{1,3}$',false)
  or (p_input->>'version')::integer not between 1 and 100 then raise exception 'Invalid comment fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'requestId')::uuid;bid:=(p_input->>'boardId')::uuid;cid:=(p_input->>'commentId')::uuid;ver:=(p_input->>'version')::integer;
 v_body:=public.pro_mood_board_text(p_input->'body',1000);if v_body is null then raise exception 'Comment required' using errcode='22023';end if;
 select * into ctx from public.pro_mood_board_client_context(p_actor,rid);
 if not ctx.found_request or not ctx.visible then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mood-board-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_mood_board_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mood-board:'||ctx.owner::text||':'||bid::text,0));
 select * into board from public.pro_mood_boards where owner_id=ctx.owner and work_id=ctx.wid and id=bid for update;
 -- An unshared, archived or unknown board does not exist for the customer.
 if not found or board.archived or board.published_version is null then raise exception 'Forbidden' using errcode='42501';end if;
 if board.published_version<>ver then raise exception 'Board changed' using errcode='40001';end if;
 if exists(select 1 from public.pro_mood_board_comments where id=cid) then raise exception 'Comment already exists' using errcode='23505';end if;
 select count(*) into n from public.pro_mood_board_comments where owner_id=board.owner_id and board_id=bid;
 if n>=300 then raise exception 'Too many comments' using errcode='22023';end if;
 insert into public.pro_mood_board_comments(owner_id,id,board_id,work_id,version,side,author_id,author_name,body)
  values(board.owner_id,cid,bid,board.work_id,ver,'client',p_actor,nullif(left(btrim(coalesce(ctx.client_name,'')),160),''),v_body) returning * into cm;
 result:=jsonb_build_object('comment',public.pro_mood_board_comment_json(cm));
 insert into public.pro_mood_board_history(owner_id,work_id,action_id,actor_id,side,action,board_id,target_kind,target_id,before_value,after_value)
  values(board.owner_id,board.work_id,aid,p_actor,'client','comment',bid,'comment',cid,null,result->'comment');
 insert into public.pro_mood_board_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_mood_board_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Board history, snapshots, comments and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_mood_board_history_immutable on public.pro_mood_board_history;
create trigger pro_mood_board_history_immutable before update on public.pro_mood_board_history for each row execute function public.pro_mood_board_immutable();
drop trigger if exists pro_mood_board_action_immutable on public.pro_mood_board_actions;
create trigger pro_mood_board_action_immutable before update on public.pro_mood_board_actions for each row execute function public.pro_mood_board_immutable();
drop trigger if exists pro_mood_board_publication_immutable on public.pro_mood_board_publications;
create trigger pro_mood_board_publication_immutable before update on public.pro_mood_board_publications for each row execute function public.pro_mood_board_immutable();
drop trigger if exists pro_mood_board_comment_immutable on public.pro_mood_board_comments;
create trigger pro_mood_board_comment_immutable before update on public.pro_mood_board_comments for each row execute function public.pro_mood_board_immutable();
alter table public.pro_mood_boards enable row level security;
alter table public.pro_mood_board_pages enable row level security;
alter table public.pro_mood_board_publications enable row level security;
alter table public.pro_mood_board_comments enable row level security;
alter table public.pro_mood_board_history enable row level security;
alter table public.pro_mood_board_actions enable row level security;
revoke all on public.pro_mood_boards,public.pro_mood_board_pages,public.pro_mood_board_publications,public.pro_mood_board_comments,public.pro_mood_board_history,public.pro_mood_board_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_mood_boards,public.pro_mood_board_pages,public.pro_mood_board_publications,public.pro_mood_board_comments,public.pro_mood_board_history,public.pro_mood_board_actions to service_role;
grant usage,select on sequence public.pro_mood_boards_position_seq to service_role;
revoke all on function public.pro_mood_board_text(jsonb,integer),public.pro_mood_board_elements(uuid,text,jsonb,jsonb),public.pro_mood_board_page_json(public.pro_mood_board_pages),
 public.pro_mood_board_json(public.pro_mood_boards),public.pro_mood_board_comment_json(public.pro_mood_board_comments),public.pro_mood_board_pages_json(uuid,uuid),
 public.pro_mood_board_client_elements(jsonb),public.pro_mood_boards_read(uuid,text,boolean),public.pro_mood_board_read(uuid,text,uuid),public.pro_mood_board_products(uuid,text),
 public.pro_mood_board_client_context(uuid,uuid),public.pro_mood_boards_client_read(uuid,uuid),public.pro_mood_board_image(uuid,uuid,uuid,uuid,uuid),
 public.pro_mood_boards_mutate(uuid,jsonb),public.pro_mood_boards_client_mutate(uuid,jsonb),public.pro_mood_board_immutable() from public,anon,authenticated;
grant execute on function public.pro_mood_board_text(jsonb,integer),public.pro_mood_board_elements(uuid,text,jsonb,jsonb),public.pro_mood_board_page_json(public.pro_mood_board_pages),
 public.pro_mood_board_json(public.pro_mood_boards),public.pro_mood_board_comment_json(public.pro_mood_board_comments),public.pro_mood_board_pages_json(uuid,uuid),
 public.pro_mood_board_client_elements(jsonb),public.pro_mood_boards_read(uuid,text,boolean),public.pro_mood_board_read(uuid,text,uuid),public.pro_mood_board_products(uuid,text),
 public.pro_mood_board_client_context(uuid,uuid),public.pro_mood_boards_client_read(uuid,uuid),public.pro_mood_board_image(uuid,uuid,uuid,uuid,uuid),
 public.pro_mood_boards_mutate(uuid,jsonb),public.pro_mood_boards_client_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
