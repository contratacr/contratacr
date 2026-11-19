-- LOCAL ONLY. Transactional relational backfill, no hosted application or canonical quote changes.
begin;
lock table public.pro_workspace_core in access exclusive mode;
alter table public.pro_workspace_core add column panel_fields text[] not null default array['work','availability','quotes','quoteLinks'];
update public.pro_workspace_core set panel_fields=array(select k from unnest(array['work','availability','quotes','quoteLinks']) k where document ? k);
create table public.pro_panel_legacy_backup (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 document jsonb not null,revision integer not null,saved_at timestamptz not null default now()
);
insert into public.pro_panel_legacy_backup(user_id,document,revision) select user_id,document,revision from public.pro_workspaces;
create table public.pro_work (user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade, position bigint generated always as identity,
 "id" text not null,
 "client" text not null,
 "service" text not null,
 "stage" text not null check(stage in ('new','quoting','scheduled','completed')),
 "start" text not null,
 "end" text not null,
 "clientId" text not null,
 "quoteId" text,
 "externalQuoteId" text,
 "cancelled" boolean not null,
 "bookingClientId" text,primary key(user_id,"id"),foreign key(user_id,"clientId") references public.pro_clients(user_id,id));
create table public.pro_availability (user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade, position bigint generated always as identity,
 "start" text not null,
 "end" text not null,primary key(user_id,"start"));
create table public.pro_legacy_quotes (user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade, position bigint generated always as identity,
 "id" text not null,
 "clientId" text not null,
 "title" text not null,
 "status" text not null check(status in ('draft','accepted','declined')),
 "validUntil" text not null,primary key(user_id,"id"),foreign key(user_id,"clientId") references public.pro_clients(user_id,id));
create table public.pro_quote_links (user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade, position bigint generated always as identity,
 "quoteId" text not null,
 "clientId" text not null,primary key(user_id,"quoteId"),foreign key(user_id,"clientId") references public.pro_clients(user_id,id));
create table public.pro_legacy_quote_lines (
 user_id uuid not null,quote_id text not null,line_number integer not null check(line_number>0),
 description text not null,quantity numeric not null check(quantity>0),price numeric not null check(price>=0),tax numeric not null check(tax between 0 and 100),
 primary key(user_id,quote_id,line_number),foreign key(user_id,quote_id) references public.pro_legacy_quotes(user_id,id) on delete cascade
);
create index pro_work_day_page on public.pro_work(user_id,"start",id);
create index pro_work_client on public.pro_work(user_id,"clientId",position);
create index pro_availability_day on public.pro_availability(user_id,"start");
create index pro_legacy_quotes_client on public.pro_legacy_quotes(user_id,"clientId",id);
create index pro_quote_links_client on public.pro_quote_links(user_id,"clientId");
-- JSON is a transport/compatibility projection only, never a stored panel record.
create function public.pro_legacy_quote_record(p_user uuid,p_id text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select (to_jsonb(q)-'user_id'-'position')||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l)-'user_id'-'quote_id'-'line_number' order by line_number) from pro_legacy_quote_lines l where l.user_id=q.user_id and l.quote_id=q.id),'[]')) from pro_legacy_quotes q where q.user_id=p_user and q.id=p_id;
$$;
create function public.pro_upsert_panels(p_user uuid,p_document jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare q jsonb;
begin
 insert into pro_work(user_id,"id","client","service","stage","start","end","clientId","quoteId","externalQuoteId","cancelled","bookingClientId") select p_user,"id","client","service","stage","start","end","clientId","quoteId","externalQuoteId","cancelled","bookingClientId" from jsonb_to_recordset(coalesce(p_document->'work','[]')) as r("id" text,"client" text,"service" text,"stage" text,"start" text,"end" text,"clientId" text,"quoteId" text,"externalQuoteId" text,"cancelled" boolean,"bookingClientId" text)
 on conflict(user_id,"id") do update set "client"=excluded."client","service"=excluded."service","stage"=excluded."stage","start"=excluded."start","end"=excluded."end","clientId"=excluded."clientId","quoteId"=excluded."quoteId","externalQuoteId"=excluded."externalQuoteId","cancelled"=excluded."cancelled","bookingClientId"=excluded."bookingClientId" where (to_jsonb(pro_work)-'position') is distinct from (to_jsonb(excluded)-'position');
 insert into pro_availability(user_id,"start","end") select p_user,"start","end" from jsonb_to_recordset(coalesce(p_document->'availability','[]')) as r("start" text,"end" text)
 on conflict(user_id,"start") do update set "end"=excluded."end" where (to_jsonb(pro_availability)-'position') is distinct from (to_jsonb(excluded)-'position');
 insert into pro_legacy_quotes(user_id,"id","clientId","title","status","validUntil") select p_user,"id","clientId","title","status","validUntil" from jsonb_to_recordset(coalesce(p_document->'quotes','[]')) as r("id" text,"clientId" text,"title" text,"status" text,"validUntil" text)
 on conflict(user_id,"id") do update set "clientId"=excluded."clientId","title"=excluded."title","status"=excluded."status","validUntil"=excluded."validUntil" where (to_jsonb(pro_legacy_quotes)-'position') is distinct from (to_jsonb(excluded)-'position');
 insert into pro_quote_links(user_id,"quoteId","clientId") select p_user,"quoteId","clientId" from jsonb_to_recordset(coalesce(p_document->'quoteLinks','[]')) as r("quoteId" text,"clientId" text)
 on conflict(user_id,"quoteId") do update set "clientId"=excluded."clientId" where (to_jsonb(pro_quote_links)-'position') is distinct from (to_jsonb(excluded)-'position');
 for q in select * from jsonb_array_elements(coalesce(p_document->'quotes','[]')) loop
 delete from pro_legacy_quote_lines where user_id=p_user and quote_id=q->>'id';
 insert into pro_legacy_quote_lines(user_id,quote_id,line_number,description,quantity,price,tax)
 select p_user,q->>'id',n,r->>'description',(r->>'quantity')::numeric,(r->>'price')::numeric,(r->>'tax')::numeric from jsonb_array_elements(q->'lines') with ordinality a(r,n);
 end loop;
end $$;
do $$ declare r record;begin
 for r in select * from pro_panel_legacy_backup loop perform pro_upsert_panels(r.user_id,r.document);end loop;
end $$;
update pro_workspace_core set document=document-'work'-'availability'-'quotes'-'quoteLinks';
alter table pro_workspace_core add constraint pro_core_envelope_only check(not(document ?| array['clients','products','movements','work','availability','quotes','quoteLinks']));
create or replace view public.pro_workspaces with(security_invoker=true) as
 select w.user_id,w.document||jsonb_build_object(
 'clients',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_clients r where r.user_id=w.user_id),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_products r where r.user_id=w.user_id),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_movements r where r.user_id=w.user_id),'[]'::jsonb),
 'work',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_work r where r.user_id=w.user_id),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_availability r where r.user_id=w.user_id),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(pro_legacy_quote_record(r.user_id,r.id) order by position) from public.pro_legacy_quotes r where r.user_id=w.user_id),'[]'::jsonb),
 'quoteLinks',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_quote_links r where r.user_id=w.user_id),'[]'::jsonb)) - array(select k from unnest(array['work','availability','quotes','quoteLinks']) k where not(k=any(w.panel_fields))) as document,w.revision,w.updated_at from public.pro_workspace_core w;
do $$ begin
 if exists(select 1 from pro_panel_legacy_backup b full join pro_workspaces w using(user_id) where b.document is distinct from w.document or b.revision is distinct from w.revision) then raise exception 'Panel backfill mismatch: transaction rolled back. Fields: %',(select string_agg(distinct k,',') from pro_panel_legacy_backup b join pro_workspaces w using(user_id),jsonb_object_keys(b.document) k where b.document->k is distinct from w.document->k);end if;
end $$;
create function public.pro_store_panels(p_user uuid,p_document jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from pro_work old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'work','[]')) r where r->>'id'=old."id")) then raise exception 'Panel history cannot be deleted' using errcode='22023';end if;
 if exists(select 1 from pro_legacy_quotes old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'quotes','[]')) r where r->>'id'=old."id")) then raise exception 'Panel history cannot be deleted' using errcode='22023';end if;
 if exists(select 1 from pro_quote_links old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'quoteLinks','[]')) r where r->>'quoteId'=old."quoteId")) then raise exception 'Panel history cannot be deleted' using errcode='22023';end if;
 if exists(select 1 from pro_work old join jsonb_array_elements(coalesce(p_document->'work','[]')) r on r->>'id'=old.id where old.user_id=p_user and old."bookingClientId" is distinct from r->>'bookingClientId') then raise exception 'Booking identity is immutable' using errcode='22023';end if;
 if exists(select 1 from pro_quote_links old join jsonb_array_elements(coalesce(p_document->'quoteLinks','[]')) r on r->>'quoteId'=old."quoteId" where old.user_id=p_user and old."clientId"<>r->>'clientId') then raise exception 'Quote link is immutable' using errcode='22023';end if;
 if exists(select 1 from pro_legacy_quotes old join jsonb_array_elements(coalesce(p_document->'quotes','[]')) r on r->>'id'=old.id where old.user_id=p_user and old.status<>'draft' and pro_legacy_quote_record(p_user,old.id)<>r) then raise exception 'Resolved quote is immutable' using errcode='22023';end if;
 delete from pro_availability old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'availability','[]')) r where r->>'start'=old.start);
 perform pro_upsert_panels(p_user,p_document);
end $$;
create or replace function public.pro_save_workspace(p_user uuid,p_document jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001';end if;
 v:=coalesce(v,0)+1;
 insert into pro_workspace_core(user_id,document,revision) values(p_user,p_document-'clients'-'products'-'movements'-'work'-'availability'-'quotes'-'quoteLinks',v)
 on conflict(user_id) do update set document=excluded.document,revision=excluded.revision,updated_at=now();
 perform pro_store_catalog(p_user,p_document);
 perform pro_store_panels(p_user,p_document);
 update pro_workspace_core set panel_fields=array(select k from unnest(array['work','availability','quotes','quoteLinks']) k where p_document ? k) where user_id=p_user;
 return v;
end $$;
alter table public.pro_work enable row level security;
revoke all on public.pro_work from public,anon,authenticated;
grant select on public.pro_work to authenticated;
grant all on public.pro_work to service_role;
create policy pro_work_owner on public.pro_work for select to authenticated using(user_id=(select auth.uid()));
grant usage,select on sequence public.pro_work_position_seq to service_role;
alter table public.pro_availability enable row level security;
revoke all on public.pro_availability from public,anon,authenticated;
grant select on public.pro_availability to authenticated;
grant all on public.pro_availability to service_role;
create policy pro_availability_owner on public.pro_availability for select to authenticated using(user_id=(select auth.uid()));
grant usage,select on sequence public.pro_availability_position_seq to service_role;
alter table public.pro_legacy_quotes enable row level security;
revoke all on public.pro_legacy_quotes from public,anon,authenticated;
grant select on public.pro_legacy_quotes to authenticated;
grant all on public.pro_legacy_quotes to service_role;
create policy pro_legacy_quotes_owner on public.pro_legacy_quotes for select to authenticated using(user_id=(select auth.uid()));
grant usage,select on sequence public.pro_legacy_quotes_position_seq to service_role;
alter table public.pro_quote_links enable row level security;
revoke all on public.pro_quote_links from public,anon,authenticated;
grant select on public.pro_quote_links to authenticated;
grant all on public.pro_quote_links to service_role;
create policy pro_quote_links_owner on public.pro_quote_links for select to authenticated using(user_id=(select auth.uid()));
grant usage,select on sequence public.pro_quote_links_position_seq to service_role;
alter table public.pro_legacy_quote_lines enable row level security;
revoke all on public.pro_legacy_quote_lines from public,anon,authenticated;
grant select on public.pro_legacy_quote_lines to authenticated;
grant all on public.pro_legacy_quote_lines to service_role;
create policy pro_legacy_quote_lines_owner on public.pro_legacy_quote_lines for select to authenticated using(user_id=(select auth.uid()));
alter table public.pro_panel_legacy_backup enable row level security;
revoke all on public.pro_panel_legacy_backup from public,anon,authenticated;
grant all on public.pro_panel_legacy_backup to service_role;
revoke all on function public.pro_upsert_panels(uuid,jsonb),public.pro_store_panels(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_upsert_panels(uuid,jsonb),public.pro_store_panels(uuid,jsonb) to service_role;
revoke all on function public.pro_legacy_quote_record(uuid,text) from public,anon;
grant execute on function public.pro_legacy_quote_record(uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
