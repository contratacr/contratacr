-- Pro family 66/67 (takeoffs): persisted human review of an AI plan reading (who accepted which rows and what they edited:
-- proposed values vs saved values) and the assisted-detection audit of area outlines. One review per AI suggestion, immutable.
-- Owner-only, service_role only, text and size bounds in SQL. The AI suggestion itself is never written to takeoffs here.
begin;
create table if not exists public.pro_ai_takeoff_reviews(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 suggestion_id uuid not null,
 reviewed_by uuid not null references public.profiles(id) on delete cascade,
 work_id text not null check(length(work_id) between 1 and 160),
 plan_id uuid not null,
 outcome text not null check(outcome in('accepted','discarded')),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=30 and octet_length(rows::text)<=32768),
 proposed_count integer not null check(proposed_count between 0 and 30),
 accepted_count integer not null check(accepted_count between 0 and 30 and accepted_count<=proposed_count),
 edited_count integer not null check(edited_count between 0 and 30 and edited_count<=accepted_count),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,suggestion_id),
 foreign key(owner_id,suggestion_id) references public.pro_ai_suggestions(owner_id,id) on delete cascade,
 check((outcome='discarded')=(accepted_count=0))
);
create index if not exists pro_ai_takeoff_reviews_recent on public.pro_ai_takeoff_reviews(owner_id,created_at desc);

-- Immutable: a review is recorded once.
create or replace function public.pro_ai_takeoff_review_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'A takeoff review is immutable' using errcode='23514';end $$;
drop trigger if exists pro_ai_takeoff_review_guard on public.pro_ai_takeoff_reviews;
create trigger pro_ai_takeoff_review_guard before update on public.pro_ai_takeoff_reviews for each row execute function public.pro_ai_takeoff_review_guard();

-- Input: {suggestionId, planId, outcome, rows:[{index, include, kind, proposed:{name,kind,quantity}, saved:{name,kind,quantity}|null}]}.
-- Idempotent: a repeat for the same suggestion returns the stored record.
create or replace function public.pro_ai_takeoff_review_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];sid uuid;pid uuid;oc text;r jsonb;s public.pro_ai_suggestions;cur public.pro_ai_takeoff_reviews;
 n_prop integer;n_acc integer:=0;n_edit integer:=0;item jsonb;kinds text[]:=array['area','length','count'];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid review' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['outcome','planId','rows','suggestionId'] or jsonb_typeof(p_input->'rows') is distinct from 'array'
  or jsonb_array_length(p_input->'rows')>30 then raise exception 'Invalid review fields' using errcode='22023';end if;
 begin sid:=(p_input->>'suggestionId')::uuid;pid:=(p_input->>'planId')::uuid;exception when others then raise exception 'Invalid ids' using errcode='22023';end;
 oc:=p_input->>'outcome';if oc not in('accepted','discarded') then raise exception 'Invalid outcome' using errcode='22023';end if;
 r:=p_input->'rows';n_prop:=jsonb_array_length(r);
 for item in select * from jsonb_array_elements(r) loop
  if jsonb_typeof(item)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['include','index','proposed','saved']
   or jsonb_typeof(item->'include')<>'boolean' or jsonb_typeof(item->'index')<>'number' or jsonb_typeof(item->'proposed')<>'object'
   or not coalesce((item->'proposed'->>'kind')=any(kinds),false) then raise exception 'Invalid review row' using errcode='22023';end if;
  if (item->>'include')::boolean then
   if jsonb_typeof(item->'saved')<>'object' or not ((item->'saved'->>'kind')=any(kinds)) or coalesce(length(btrim(item->'saved'->>'name')),0) not between 1 and 120
    or coalesce((item->'saved'->>'quantity')~'^[0-9]{1,9}([.][0-9]{1,3})?$',false)=false then raise exception 'Invalid saved row' using errcode='22023';end if;
   n_acc:=n_acc+1;if (item->'proposed') is distinct from (item->'saved') then n_edit:=n_edit+1;end if;
  end if;
 end loop;
 if (oc='accepted')<>(n_acc>0) then raise exception 'Outcome does not match rows' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ai-takeoff-review:'||p_actor::text||':'||sid::text,0));
 select * into s from public.pro_ai_suggestions where owner_id=p_actor and id=sid and feature='takeoff' and status='ready';
 if not found then raise exception 'Suggestion unavailable' using errcode='P0002';end if;
 if s.work_id is null or not exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and id=pid and work_id=s.work_id) then raise exception 'Plan unavailable' using errcode='P0002';end if;
 select * into cur from public.pro_ai_takeoff_reviews where owner_id=p_actor and suggestion_id=sid;
 if not found then
  insert into public.pro_ai_takeoff_reviews(owner_id,suggestion_id,reviewed_by,work_id,plan_id,outcome,rows,proposed_count,accepted_count,edited_count)
   values(p_actor,sid,p_actor,s.work_id,pid,oc,r,n_prop,n_acc,n_edit) returning * into cur;
 end if;
 return jsonb_build_object('suggestionId',cur.suggestion_id,'outcome',cur.outcome,'proposed',cur.proposed_count,'accepted',cur.accepted_count,'edited',cur.edited_count,'createdAt',cur.created_at);
end $$;

do $$declare f record;begin
 alter table public.pro_ai_takeoff_reviews enable row level security;
 revoke all on public.pro_ai_takeoff_reviews from public,anon,authenticated;
 grant select,insert on public.pro_ai_takeoff_reviews to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_ai_takeoff_review_record','pro_ai_takeoff_review_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
