-- LOCAL ONLY. Manual single-occurrence draft copies. No scheduler, issuance, messages or debt.
begin;
create table if not exists public.pro_invoice_recurrences(
 user_id uuid not null,id uuid not null,name text not null check(length(trim(name)) between 1 and 160),source_draft_id uuid not null,source_revision integer not null check(source_revision>0),frequency text not null check(frequency in ('weekly','monthly')),start_date date not null,paused boolean not null default false,revision integer not null default 1 check(revision>0),primary key(user_id,id),foreign key(user_id,source_draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_recurrence_occurrences(
 user_id uuid not null,template_id uuid not null,occurrence_date date not null,draft_id uuid not null,source_revision integer not null,created_at timestamptz not null default now(),primary key(user_id,template_id,occurrence_date),unique(user_id,draft_id),foreign key(user_id,template_id) references pro_invoice_recurrences(user_id,id) on delete cascade,foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_recurrence_requests(
 user_id uuid not null references profiles(id) on delete cascade,request_id uuid not null,input jsonb not null,result_id uuid not null,revision integer not null,primary key(user_id,request_id)
);
create or replace function public.pro_invoice_recurrence_day(p_start date,p_frequency text,p_index integer) returns date language plpgsql immutable strict set search_path=public,pg_temp as $$
declare first_day date;last_day date;
begin
 if p_index<0 or p_frequency not in ('weekly','monthly') then raise exception 'Invalid recurrence' using errcode='22023';end if;
 if p_frequency='weekly' then return p_start+p_index*7;end if;
 first_day:=(date_trunc('month',p_start)::date+make_interval(months=>p_index))::date;last_day:=(first_day+interval '1 month -1 day')::date;
 return first_day+least(extract(day from p_start)::integer,extract(day from last_day)::integer)-1;
end $$;
create or replace function public.pro_invoice_recurrence_row(p_user uuid,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'name',r.name,'sourceDraftId',r.source_draft_id,'sourceRevision',r.source_revision,'frequency',r.frequency,'startDate',r.start_date,'paused',r.paused,'revision',r.revision,'sourceTitle',d.title,'currentSourceRevision',d.revision,'sourceArchived',coalesce(m.archived,false)) from pro_invoice_recurrences r join pro_invoice_drafts d on d.user_id=r.user_id and d.id=r.source_draft_id left join pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id where r.user_id=p_user and r.id=p_id;
$$;
create or replace function public.pro_invoice_recurrence_read(p_user uuid,p_query jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows jsonb;tid uuid:=nullif(p_query->>'id','')::uuid;after_id uuid:=nullif(p_query->>'after','')::uuid;today date:=(now() at time zone 'America/Costa_Rica')::date;horizon date;
begin
 if length(coalesce(p_query->>'q',''))>160 then raise exception 'Invalid search' using errcode='22023';end if;horizon:=(today+interval '12 months')::date;
 if tid is not null then
 select coalesce(jsonb_agg(jsonb_build_object('date',occurrence_date,'draftId',draft_id) order by occurrence_date),'[]') into rows from (select * from pro_invoice_recurrence_occurrences where user_id=p_user and template_id=tid and occurrence_date>=today and occurrence_date<=horizon order by occurrence_date limit 20) occurrences;
 return jsonb_build_object('items','[]'::jsonb,'template',pro_invoice_recurrence_row(p_user,tid),'occurrences',rows,'nextCursor',null,'today',today,'horizon',horizon);
 end if;
 select coalesce(jsonb_agg(row order by id),'[]') into rows from(select r.id,pro_invoice_recurrence_row(p_user,r.id) row from pro_invoice_recurrences r where r.user_id=p_user and (after_id is null or r.id>after_id) and strpos(lower(r.name),lower(coalesce(p_query->>'q','')))>0 order by r.id limit 21) p;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(rows) with ordinality p(e,n) where n<=20),'nextCursor',case when jsonb_array_length(rows)>20 then rows->19->>'id' else null end,'today',today,'horizon',horizon);
end $$;
create or replace function public.pro_invoice_recurrence_save(p_user uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior pro_invoice_recurrence_requests;r pro_invoice_recurrences;d pro_invoice_drafts;m pro_invoice_draft_management;rid uuid;v_request uuid:=(p_input->>'requestId')::uuid;act text:=p_input->>'action';day date;idx integer;rev integer;existing uuid;today date:=(now() at time zone 'America/Costa_Rica')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into prior from pro_invoice_recurrence_requests where user_id=p_user and pro_invoice_recurrence_requests.request_id=v_request;
 if found then if prior.input<>p_input then raise exception 'Request changed' using errcode='40001';end if;return jsonb_build_object('id',prior.result_id,'revision',prior.revision);end if;
 if act='template' then
 rid:=(p_input->>'id')::uuid;select * into r from pro_invoice_recurrences where user_id=p_user and id=rid for update;
 if (p_input->>'revision')::integer is distinct from coalesce(r.revision,0) then raise exception 'Template changed' using errcode='40001';end if;
 if r.id is null or r.source_draft_id is distinct from (p_input->>'sourceDraftId')::uuid or r.source_revision is distinct from (p_input->>'sourceRevision')::integer then
 select * into d from pro_invoice_drafts where user_id=p_user and id=(p_input->>'sourceDraftId')::uuid for update;
 if d.id is null or d.revision is distinct from (p_input->>'sourceRevision')::integer or exists(select 1 from pro_invoice_draft_management where user_id=p_user and draft_id=d.id and archived) then raise exception 'Choose active current source explicitly' using errcode='22023';end if;
 end if;
 insert into pro_invoice_recurrences(user_id,id,name,source_draft_id,source_revision,frequency,start_date,paused) values(p_user,rid,trim(p_input->>'name'),(p_input->>'sourceDraftId')::uuid,(p_input->>'sourceRevision')::integer,p_input->>'frequency',(p_input->>'startDate')::date,(p_input->>'paused')::boolean) on conflict(user_id,id) do update set name=excluded.name,source_draft_id=excluded.source_draft_id,source_revision=excluded.source_revision,frequency=excluded.frequency,start_date=excluded.start_date,paused=excluded.paused,revision=pro_invoice_recurrences.revision+1 returning revision into rev;
 elsif act='generate' then
 select * into r from pro_invoice_recurrences where user_id=p_user and id=(p_input->>'templateId')::uuid for update;
 if r.id is null then raise exception 'Missing owned template' using errcode='22023';end if;
 day:=(p_input->>'date')::date;
 select draft_id into existing from pro_invoice_recurrence_occurrences where user_id=p_user and template_id=r.id and occurrence_date=day;
 if existing is not null then rid:=existing;rev:=r.revision;
 else
 if r.revision is distinct from (p_input->>'revision')::integer then raise exception 'Template changed' using errcode='40001';end if;
 if r.paused or day<r.start_date or day>(today+interval '12 months')::date then raise exception 'Paused or date outside recurrence horizon' using errcode='22023';end if;
 idx:=case when r.frequency='weekly' then (day-r.start_date)/7 else (extract(year from day)::integer-extract(year from r.start_date)::integer)*12+extract(month from day)::integer-extract(month from r.start_date)::integer end;
 if pro_invoice_recurrence_day(r.start_date,r.frequency,idx)<>day then raise exception 'Date does not match calendar' using errcode='22023';end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=r.source_draft_id for update;select * into m from pro_invoice_draft_management where user_id=p_user and draft_id=d.id;
 if d.id is null or d.revision<>r.source_revision or coalesce(m.archived,false) then raise exception 'Source changed or archived; update template explicitly' using errcode='40001';end if;
 rid:=pro_invoice_management_save(p_user,jsonb_build_object('action','duplicate','id',d.id,'revision',d.revision,'managementRevision',coalesce(m.revision,0),'requestId',v_request));
 -- Only the independent copy's planned date changes. Financial/fiscal snapshots remain exact.
 if exists(select 1 from pro_invoice_preparation where user_id=p_user and draft_id=rid) then update pro_invoice_preparation set planned_date=day where user_id=p_user and draft_id=rid;
 else insert into pro_invoice_preparation(user_id,draft_id,issuer_name,issuer_id_type,issuer_id,issuer_email,issuer_phone,issuer_address,issuer_activity,planned_date,sale_condition,credit_days,payment_method,order_reference) values(p_user,rid,'','','','','','','',day,'',0,'','');end if;
 update pro_invoice_drafts set revision=revision+1,updated_at=now() where user_id=p_user and id=rid;
 insert into pro_invoice_recurrence_occurrences(user_id,template_id,occurrence_date,draft_id,source_revision) values(p_user,r.id,day,rid,r.source_revision);rev:=r.revision;
 end if;
 else raise exception 'Invalid action' using errcode='22023';end if;
 insert into pro_invoice_recurrence_requests values(p_user,v_request,p_input,rid,rev);return jsonb_build_object('id',rid,'revision',rev);
end $$;
do $$declare name text;begin foreach name in array array['pro_invoice_recurrences','pro_invoice_recurrence_occurrences','pro_invoice_recurrence_requests'] loop execute format('alter table %I enable row level security',name);execute format('revoke all on %I from public,anon,authenticated',name);execute format('grant select on %I to authenticated',name);execute format('grant all on %I to service_role',name);if not exists(select 1 from pg_policies where schemaname='public' and tablename=name and policyname=name||'_owner') then execute format('create policy %I on %I for select to authenticated using(user_id=(select auth.uid()))',name||'_owner',name);end if;end loop;end $$;
revoke all on function pro_invoice_recurrence_day(date,text,integer),pro_invoice_recurrence_row(uuid,uuid),pro_invoice_recurrence_read(uuid,jsonb),pro_invoice_recurrence_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_recurrence_day(date,text,integer),pro_invoice_recurrence_row(uuid,uuid),pro_invoice_recurrence_read(uuid,jsonb),pro_invoice_recurrence_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
