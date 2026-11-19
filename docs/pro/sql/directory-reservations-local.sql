-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): table reservations + same-day waitlist for
-- CLAIMED restaurants and cafés, opt-in by the owner. Depends on directory-core-local.sql, directory-claims-local.sql
-- and directory-place-tools-local.sql (dir_tool_authorize).
-- * Settings (one row per place, OFF by default): enabled, waitlistEnabled, partyMax, horizonDays, minNoticeMinutes and
--   the weekly slots [{weekday 0..6, time HH:MM, capacity (people)}]; CAS by revision, every version in the immutable
--   dir_reservation_settings_history.
-- * Customers (signed in, or a device hash computed by the server) ask for a date/time/party size with a name and a
--   phone or e-mail. Capacity per slot counts pending + confirmed people. No deposits, payments or card data, ever.
-- * Owner/team (Pro, effective account = owner; a company member needs work.write, so read_only cannot act) confirms,
--   declines, cancels, seats or marks no-show; waitlist entries are seated, notified «your table is ready» or removed.
--   Every change: CAS by revision (40001), idempotent actionId, immutable dir_reservation_events. Each customer notice
--   (received/confirmed/declined/table_ready) is recorded in the immutable dir_reservation_notices with sender 'mock':
--   this build never sends a real e-mail or SMS (the route hands it to the in-memory mock sender).
-- * Limits: 3 active bookings per person/device per place, 10 requests per person/device a day, 300 per place a day;
--   1 active waitlist entry per person/device per place, 60 waitlist entries per place a day.
-- * Customer self-service (pending fixes round, 2026-11-17): every new entry stores the SHA-256 of a private access token
--   (derived by the server from a secret pepper, never stored). /reserva/<token> shows status, waitlist position and a
--   timeline; the customer cancels until the start time (CAS, idempotent actionId, immutable 'customer_cancel' event,
--   MOCK 'customer_cancelled' notice to the business). Signed-in customers also list theirs (dir_reservation_mine).
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
begin;

create table if not exists public.dir_reservation_settings(
 place_id uuid primary key references public.dir_places(id),
 enabled boolean not null default false,
 waitlist_enabled boolean not null default false,
 party_max smallint not null default 8 check(party_max between 1 and 30),
 horizon_days smallint not null default 30 check(horizon_days between 1 and 90),
 min_notice_minutes smallint not null default 60 check(min_notice_minutes between 0 and 2880),
 slots jsonb not null default '[]' check(jsonb_typeof(slots)='array' and jsonb_array_length(slots)<=336),
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null,member_id uuid,
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.dir_reservation_settings_history(
 id bigint generated always as identity primary key,
 place_id uuid not null references public.dir_places(id),
 revision integer not null check(revision>0),
 snapshot jsonb not null,
 actor_id uuid not null,member_id uuid,action_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 unique(place_id,revision)
);
create table if not exists public.dir_reservations(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 kind text not null check(kind in('booking','waitlist')),
 reference text not null unique check(reference~'^[A-Z0-9]{6}$'),
 day date not null,
 slot_time time,
 party_size smallint not null check(party_size between 1 and 30),
 name text not null check(length(btrim(name)) between 2 and 80),
 phone text check(phone~'^\+?[0-9][0-9 ()-]{6,22}$'),
 email text check(email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(email)<=254),
 note text check(length(note) between 1 and 300 and note!~*'(https?://|www\.)'),
 customer_id uuid,
 visitor_hash text check(visitor_hash~'^[a-f0-9]{64}$'),
 status text not null check(status in('pending','confirmed','declined','cancelled','seated','no_show','waiting','notified','left')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(phone is not null or email is not null),
 check((customer_id is null)<>(visitor_hash is null)),
 check((kind='booking')=(slot_time is not null)),
 check(kind='booking' and status in('pending','confirmed','declined','cancelled','seated','no_show') or kind='waitlist' and status in('waiting','notified','seated','left'))
);
create index if not exists dir_reservations_place_day on public.dir_reservations(place_id,day,slot_time);
create index if not exists dir_reservations_who on public.dir_reservations(coalesce(customer_id::text,visitor_hash),created_at desc);
create table if not exists public.dir_reservation_events(
 id bigint generated always as identity primary key,
 reservation_id uuid not null references public.dir_reservations(id),
 actor_id uuid,member_id uuid,action_id uuid not null,
 action text not null check(action in('request','join','confirm','decline','cancel','seated','no_show','notify_ready','left','customer_cancel')),
 from_status text,to_status text not null,
 at timestamptz not null default clock_timestamp()
);
create index if not exists dir_reservation_events_res on public.dir_reservation_events(reservation_id,id);
create table if not exists public.dir_reservation_notices(
 id bigint generated always as identity primary key,
 reservation_id uuid not null references public.dir_reservations(id),
 kind text not null check(kind in('received','confirmed','declined','table_ready','customer_cancelled')),
 channel text not null check(channel in('email','sms')),
 sender text not null check(sender='mock'),
 action_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 unique(reservation_id,action_id)
);

-- Pending fixes round (owner approval 2026-11-17): customer self-service. Each new booking/waitlist entry stores only the
-- SHA-256 of its private access token (the token itself is derived by the server from a secret pepper and never stored);
-- the customer's link /reserva/<token> shows the status and lets them cancel. Older rows keep access_hash null (no link).
alter table public.dir_reservations add column if not exists access_hash text;
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_reservations_access_hash_key') then
  alter table public.dir_reservations add constraint dir_reservations_access_hash_key unique(access_hash);end if;
 if not exists(select 1 from pg_constraint where conname='dir_reservations_access_hash_check') then
  alter table public.dir_reservations add constraint dir_reservations_access_hash_check check(access_hash~'^[a-f0-9]{64}$');end if;
 alter table public.dir_reservation_events drop constraint if exists dir_reservation_events_action_check;
 alter table public.dir_reservation_events add constraint dir_reservation_events_action_check
  check(action in('request','join','confirm','decline','cancel','seated','no_show','notify_ready','left','customer_cancel'));
 alter table public.dir_reservation_notices drop constraint if exists dir_reservation_notices_kind_check;
 alter table public.dir_reservation_notices add constraint dir_reservation_notices_kind_check
  check(kind in('received','confirmed','declined','table_ready','customer_cancelled'));
end $$;
create index if not exists dir_reservations_customer on public.dir_reservations(customer_id,day desc) where customer_id is not null;

do $$declare t text;begin
 foreach t in array array['dir_reservation_settings_history','dir_reservation_events','dir_reservation_notices'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.dir_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['dir_reservation_settings','dir_reservation_settings_history','dir_reservations','dir_reservation_events','dir_reservation_notices'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
end $$;

-- Identity of a reservation is fixed; only status/revision/updated_at change after creation; no deletes.
create or replace function public.dir_reservations_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Reservations are never deleted' using errcode='23514';end if;
 if (to_jsonb(new)-'status'-'revision'-'updated_at') is distinct from (to_jsonb(old)-'status'-'revision'-'updated_at') then
  raise exception 'Reservation details are immutable' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
drop trigger if exists dir_reservations_guard on public.dir_reservations;
create trigger dir_reservations_guard before update or delete on public.dir_reservations for each row execute function public.dir_reservations_guard();

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_reservation_vertical_ok(p_vertical text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$ select p_vertical in('restaurant','cafe_bar') $$;
create or replace function public.dir_cr_now() returns timestamp
language sql stable security invoker set search_path=public,pg_temp as $$ select (clock_timestamp() at time zone 'America/Costa_Rica') $$;
-- Slots: [{weekday 0..6, time 'HH:MM' (quarter hours), capacity 1..500}], unique weekday+time.
create or replace function public.dir_reservation_slots_ok(p_slots jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p_slots)='array' and jsonb_array_length(p_slots)<=336 and not exists(
  select 1 from jsonb_array_elements(p_slots) s where jsonb_typeof(s)<>'object'
   or exists(select 1 from jsonb_object_keys(s) k where k not in('weekday','time','capacity'))
   or jsonb_typeof(s->'weekday')<>'number' or (s->>'weekday') !~ '^[0-6]$'
   or coalesce(s->>'time','')!~'^([01][0-9]|2[0-3]):(00|15|30|45)$'
   or jsonb_typeof(s->'capacity')<>'number' or (s->>'capacity')!~'^[0-9]{1,3}$' or (s->>'capacity')::integer not between 1 and 500)
  and (select count(*) from jsonb_array_elements(p_slots))=(select count(distinct (s->>'weekday')||' '||(s->>'time')) from jsonb_array_elements(p_slots) s) $$;
create or replace function public.dir_reservation_reference(p_id uuid) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(get_byte(decode(replace(p_id::text,'-',''),'hex'),i)%32)+1,1),'' order by i) from generate_series(0,5) i $$;
create or replace function public.dir_reservation_settings_json(p public.dir_reservation_settings) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('enabled',coalesce(p.enabled,false),'waitlistEnabled',coalesce(p.waitlist_enabled,false),'partyMax',coalesce(p.party_max,8),
  'horizonDays',coalesce(p.horizon_days,30),'minNoticeMinutes',coalesce(p.min_notice_minutes,60),'slots',coalesce(p.slots,'[]'::jsonb),'revision',coalesce(p.revision,0)) $$;
-- Place of a public reservation request: published, claimed restaurant/café with reservations on.
create or replace function public.dir_reservation_place(p_slug text) returns public.dir_places
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;
begin
 if public.dir_place_public(p_slug) is null then raise exception 'Place unavailable' using errcode='P0002';end if;
 select * into p from public.dir_places where slug=p_slug;
 if p.status<>'published' or p.claim_status<>'claimed' or not public.dir_reservation_vertical_ok(p.vertical_id)
  or not exists(select 1 from public.dir_reservation_settings s where s.place_id=p.id and s.enabled) then
  raise exception 'Reservations are off for this place' using errcode='P0002',hint='dir_reservations_off';end if;
 return p;
end $$;
create or replace function public.dir_reservation_left(p_place uuid,p_day date,p_time time) returns integer
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select (x->>'capacity')::integer from public.dir_reservation_settings s,jsonb_array_elements(s.slots) x
   where s.place_id=p_place and (x->>'weekday')::integer=extract(dow from p_day)::integer and (x->>'time')::time=p_time),0)
  -coalesce((select sum(r.party_size)::integer from public.dir_reservations r where r.place_id=p_place and r.day=p_day and r.slot_time=p_time and r.kind='booking' and r.status in('pending','confirmed')),0) $$;

-- ---------------------------------------------------------------- owner: settings
-- Input: {actionId, placeId, revision (0 = first time), enabled, waitlistEnabled, partyMax, horizonDays, minNoticeMinutes, slots}.
create or replace function public.dir_reservation_settings_mutate(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;rev integer;who uuid:=coalesce(p_member,p_actor);prior jsonb;p public.dir_places;s public.dir_reservation_settings;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number'
  or jsonb_typeof(p_input->'enabled')<>'boolean' or jsonb_typeof(p_input->'waitlistEnabled')<>'boolean'
  or jsonb_typeof(p_input->'partyMax')<>'number' or jsonb_typeof(p_input->'horizonDays')<>'number' or jsonb_typeof(p_input->'minNoticeMinutes')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','enabled','waitlistEnabled','partyMax','horizonDays','minNoticeMinutes','slots'))
  or not public.dir_reservation_slots_ok(p_input->'slots') then raise exception 'Invalid reservation settings' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid reservation settings' using errcode='22023';end;
 if aid is null or pid is null or rev<0 or (p_input->>'partyMax')!~'^[0-9]+$' or (p_input->>'horizonDays')!~'^[0-9]+$' or (p_input->>'minNoticeMinutes')!~'^[0-9]+$' then
  raise exception 'Invalid reservation settings' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 p:=public.dir_tool_authorize(p_actor,p_member,pid,'work.write');
 if not public.dir_reservation_vertical_ok(p.vertical_id) then raise exception 'Reservations are for restaurants and cafés' using errcode='22023',hint='dir_reservations_section';end if;
 if (p_input->>'enabled')::boolean and jsonb_array_length(p_input->'slots')=0 then raise exception 'Add at least one slot' using errcode='22023',hint='dir_reservations_no_slots';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-reservations:'||pid::text,0));
 select * into s from public.dir_reservation_settings where place_id=pid for update;
 if coalesce(s.revision,0)<>rev then raise exception 'Settings changed' using errcode='40001';end if;
 begin
  if s.place_id is null then
   insert into public.dir_reservation_settings(place_id,enabled,waitlist_enabled,party_max,horizon_days,min_notice_minutes,slots,updated_by,member_id)
   values(pid,(p_input->>'enabled')::boolean,(p_input->>'waitlistEnabled')::boolean,(p_input->>'partyMax')::smallint,(p_input->>'horizonDays')::smallint,(p_input->>'minNoticeMinutes')::smallint,p_input->'slots',p_actor,p_member) returning * into s;
  else
   update public.dir_reservation_settings set enabled=(p_input->>'enabled')::boolean,waitlist_enabled=(p_input->>'waitlistEnabled')::boolean,party_max=(p_input->>'partyMax')::smallint,
    horizon_days=(p_input->>'horizonDays')::smallint,min_notice_minutes=(p_input->>'minNoticeMinutes')::smallint,slots=p_input->'slots',revision=revision+1,updated_by=p_actor,member_id=p_member,updated_at=clock_timestamp()
   where place_id=pid returning * into s;
  end if;
 exception when check_violation or numeric_value_out_of_range then raise exception 'Invalid reservation settings' using errcode='22023';end;
 insert into public.dir_reservation_settings_history(place_id,revision,snapshot,actor_id,member_id,action_id) values(pid,s.revision,public.dir_reservation_settings_json(s),p_actor,p_member,aid);
 result:=public.dir_reservation_settings_json(s)||jsonb_build_object('placeId',pid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public
-- Config of a place's booking form (null when reservations are off). No ids, no capacity totals.
create or replace function public.dir_reservation_public_config(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;s public.dir_reservation_settings;today date:=public.dir_cr_now()::date;
begin
 begin p:=public.dir_reservation_place(p_slug);exception when sqlstate 'P0002' then return null;end;
 select * into s from public.dir_reservation_settings where place_id=p.id;
 return jsonb_build_object('partyMax',s.party_max,'horizonDays',s.horizon_days,'minNoticeMinutes',s.min_notice_minutes,'today',today,
  'lastDay',today+s.horizon_days,'weekdays',(select coalesce(jsonb_agg(distinct (x->>'weekday')::integer),'[]') from jsonb_array_elements(s.slots) x),
  'waitlistOpen',s.waitlist_enabled and exists(select 1 from jsonb_array_elements(s.slots) x where (x->>'weekday')::integer=extract(dow from today)::integer));
end $$;
-- Times of one day with the seats still available (only times later than now + minimum notice).
create or replace function public.dir_reservation_availability(p_slug text,p_day date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;s public.dir_reservation_settings;now_cr timestamp:=public.dir_cr_now();
begin
 begin p:=public.dir_reservation_place(p_slug);exception when sqlstate 'P0002' then return null;end;
 select * into s from public.dir_reservation_settings where place_id=p.id;
 if p_day is null or p_day<now_cr::date or p_day>now_cr::date+s.horizon_days then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('time',x->>'time','left',greatest(public.dir_reservation_left(p.id,p_day,(x->>'time')::time),0)) order by x->>'time')
  from jsonb_array_elements(s.slots) x where (x->>'weekday')::integer=extract(dow from p_day)::integer
   and p_day+(x->>'time')::time>=now_cr+make_interval(mins=>s.min_notice_minutes)),'[]'::jsonb);
end $$;

-- Input: {actionId, reservationId, slug, day, time, partySize, name, phone?, email?, note?, visitorHash?}.
-- p_actor = signed-in customer, or null with visitorHash (server HMAC of the device).
create or replace function public.dir_reservation_request(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;who uuid;vh text:=p_input->>'visitorHash';prior jsonb;p public.dir_places;s public.dir_reservation_settings;r public.dir_reservations;
 d date;tm time;n integer;nm text:=btrim(regexp_replace(coalesce(p_input->>'name',''),'\s+',' ','g'));ph text:=nullif(btrim(coalesce(p_input->>'phone','')),'');
 em text:=lower(nullif(btrim(coalesce(p_input->>'email','')),''));nt text:=nullif(btrim(coalesce(p_input->>'note','')),'');now_cr timestamp:=public.dir_cr_now();result jsonb;
begin
 if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'partySize')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reservationId','slug','day','time','partySize','name','phone','email','note','visitorHash','accessHash')) then
  raise exception 'Invalid reservation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reservationId');
 begin d:=(p_input->>'day')::date;tm:=(p_input->>'time')::time;n:=(p_input->>'partySize')::integer;exception when others then raise exception 'Invalid reservation' using errcode='22023';end;
 if aid is null or rid is null or d is null or tm is null or n<1 or length(nm) not between 2 and 80 or (ph is null and em is null)
  or (ph is not null and ph!~'^\+?[0-9][0-9 ()-]{6,22}$') or (em is not null and (em!~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' or length(em)>254))
  or (nt is not null and (length(nt)>300 or nt~*'(https?://|www\.)')) then raise exception 'Invalid reservation' using errcode='22023';end if;
 if p_actor is null then
  if coalesce(vh,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid reservation' using errcode='22023';end if;
  who:=public.dir_derived_uuid(public.dir_try_uuid(substr(vh,1,8)||'-'||substr(vh,9,4)||'-4'||substr(vh,14,3)||'-8'||substr(vh,18,3)||'-'||substr(vh,21,12)),'reservation');
 else
  if vh is not null then raise exception 'Invalid reservation' using errcode='22023';end if;who:=p_actor;
 end if;
 if p_input ? 'accessHash' and coalesce(p_input->>'accessHash','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid reservation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 p:=public.dir_reservation_place(p_input->>'slug');
 perform pg_advisory_xact_lock(hashtextextended('dir-reservations:'||p.id::text,0));
 select * into s from public.dir_reservation_settings where place_id=p.id;
 if n>s.party_max then raise exception 'Party too large' using errcode='22023',hint='dir_reservation_party';end if;
 if d<now_cr::date or d>now_cr::date+s.horizon_days or d+tm<now_cr+make_interval(mins=>s.min_notice_minutes)
  or not exists(select 1 from jsonb_array_elements(s.slots) x where (x->>'weekday')::integer=extract(dow from d)::integer and (x->>'time')::time=tm) then
  raise exception 'That time is not available' using errcode='22023',hint='dir_reservation_slot';end if;
 if exists(select 1 from public.dir_reservations where id=rid) then raise exception 'Reservation id reused' using errcode='22023';end if;
 if (select count(*) from public.dir_reservations x where x.place_id=p.id and x.kind='booking' and x.status in('pending','confirmed') and x.day>=now_cr::date
   and (x.customer_id=p_actor or x.visitor_hash=vh))>=3 then raise exception 'Too many active reservations' using errcode='54000',hint='dir_reservation_cap';end if;
 if (select count(*) from public.dir_reservations x where (x.customer_id=p_actor or x.visitor_hash=vh) and x.created_at>clock_timestamp()-interval '1 day')>=10
  or (select count(*) from public.dir_reservations x where x.place_id=p.id and x.created_at>clock_timestamp()-interval '1 day')>=300 then
  raise exception 'Too many reservations' using errcode='54000',hint='dir_reservation_cap';end if;
 if public.dir_reservation_left(p.id,d,tm)<n then raise exception 'That time is full' using errcode='23514',hint='dir_reservation_full';end if;
 if p_input ? 'accessHash' and exists(select 1 from public.dir_reservations where access_hash=p_input->>'accessHash') then raise exception 'Reservation id reused' using errcode='22023';end if;
 insert into public.dir_reservations(id,place_id,kind,reference,day,slot_time,party_size,name,phone,email,note,customer_id,visitor_hash,status,access_hash)
 values(rid,p.id,'booking',public.dir_reservation_reference(rid),d,tm,n,nm,ph,em,nt,p_actor,case when p_actor is null then vh end,'pending',p_input->>'accessHash') returning * into r;
 insert into public.dir_reservation_events(reservation_id,actor_id,action_id,action,from_status,to_status) values(r.id,p_actor,aid,'request',null,'pending');
 insert into public.dir_reservation_notices(reservation_id,kind,channel,sender,action_id) values(r.id,'received',case when em is not null then 'email' else 'sms' end,'mock',aid);
 result:=jsonb_build_object('reservationId',r.id,'reference',r.reference,'status',r.status,'day',r.day,'time',to_char(r.slot_time,'HH24:MI'),'partySize',r.party_size,
  'notice',jsonb_build_object('kind','received','channel',case when em is not null then 'email' else 'sms' end));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- Same-day waitlist. Input: {actionId, reservationId, slug, partySize, name, phone?, email?, visitorHash?}.
create or replace function public.dir_waitlist_join(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;who uuid;vh text:=p_input->>'visitorHash';prior jsonb;p public.dir_places;s public.dir_reservation_settings;r public.dir_reservations;n integer;pos integer;
 nm text:=btrim(regexp_replace(coalesce(p_input->>'name',''),'\s+',' ','g'));ph text:=nullif(btrim(coalesce(p_input->>'phone','')),'');em text:=lower(nullif(btrim(coalesce(p_input->>'email','')),''));
 today date:=public.dir_cr_now()::date;result jsonb;
begin
 if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'partySize')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reservationId','slug','partySize','name','phone','email','visitorHash','accessHash')) then
  raise exception 'Invalid waitlist entry' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reservationId');
 begin n:=(p_input->>'partySize')::integer;exception when others then raise exception 'Invalid waitlist entry' using errcode='22023';end;
 if aid is null or rid is null or n<1 or length(nm) not between 2 and 80 or (ph is null and em is null)
  or (ph is not null and ph!~'^\+?[0-9][0-9 ()-]{6,22}$') or (em is not null and em!~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$') then
  raise exception 'Invalid waitlist entry' using errcode='22023';end if;
 if p_actor is null then
  if coalesce(vh,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid waitlist entry' using errcode='22023';end if;
  who:=public.dir_derived_uuid(public.dir_try_uuid(substr(vh,1,8)||'-'||substr(vh,9,4)||'-4'||substr(vh,14,3)||'-8'||substr(vh,18,3)||'-'||substr(vh,21,12)),'reservation');
 else
  if vh is not null then raise exception 'Invalid waitlist entry' using errcode='22023';end if;who:=p_actor;
 end if;
 if p_input ? 'accessHash' and coalesce(p_input->>'accessHash','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid reservation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 p:=public.dir_reservation_place(p_input->>'slug');
 perform pg_advisory_xact_lock(hashtextextended('dir-reservations:'||p.id::text,0));
 select * into s from public.dir_reservation_settings where place_id=p.id;
 if not s.waitlist_enabled then raise exception 'Waitlist is off' using errcode='P0002',hint='dir_waitlist_off';end if;
 if n>s.party_max then raise exception 'Party too large' using errcode='22023',hint='dir_reservation_party';end if;
 if exists(select 1 from public.dir_reservations where id=rid) then raise exception 'Reservation id reused' using errcode='22023';end if;
 if exists(select 1 from public.dir_reservations x where x.place_id=p.id and x.kind='waitlist' and x.day=today and x.status in('waiting','notified') and (x.customer_id=p_actor or x.visitor_hash=vh)) then
  raise exception 'Already on the waitlist' using errcode='23505',hint='dir_waitlist_exists';end if;
 if (select count(*) from public.dir_reservations x where x.place_id=p.id and x.kind='waitlist' and x.day=today)>=60
  or (select count(*) from public.dir_reservations x where (x.customer_id=p_actor or x.visitor_hash=vh) and x.created_at>clock_timestamp()-interval '1 day')>=10 then
  raise exception 'Too many waitlist entries' using errcode='54000',hint='dir_reservation_cap';end if;
 if p_input ? 'accessHash' and exists(select 1 from public.dir_reservations where access_hash=p_input->>'accessHash') then raise exception 'Reservation id reused' using errcode='22023';end if;
 insert into public.dir_reservations(id,place_id,kind,reference,day,slot_time,party_size,name,phone,email,customer_id,visitor_hash,status,access_hash)
 values(rid,p.id,'waitlist',public.dir_reservation_reference(rid),today,null,n,nm,ph,em,p_actor,case when p_actor is null then vh end,'waiting',p_input->>'accessHash') returning * into r;
 insert into public.dir_reservation_events(reservation_id,actor_id,action_id,action,from_status,to_status) values(r.id,p_actor,aid,'join',null,'waiting');
 select count(*) into pos from public.dir_reservations x where x.place_id=p.id and x.kind='waitlist' and x.day=today and x.status='waiting' and (x.created_at,x.id)<=(r.created_at,r.id);
 insert into public.dir_reservation_notices(reservation_id,kind,channel,sender,action_id) values(r.id,'received',case when em is not null then 'email' else 'sms' end,'mock',aid);
 result:=jsonb_build_object('reservationId',r.id,'reference',r.reference,'status',r.status,'position',pos,'partySize',r.party_size,
  'notice',jsonb_build_object('kind','received','channel',case when em is not null then 'email' else 'sms' end));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- owner: list and decisions
create or replace function public.dir_reservation_owner_read(p_actor uuid,p_member uuid,p_place uuid,p_day date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;s public.dir_reservation_settings;d date:=coalesce(p_day,public.dir_cr_now()::date);
begin
 p:=public.dir_tool_authorize(p_actor,p_member,p_place,'read');
 select * into s from public.dir_reservation_settings where place_id=p.id;
 return jsonb_build_object('placeId',p.id,'slug',p.slug,'name',p.name,'allowed',public.dir_reservation_vertical_ok(p.vertical_id),'day',d,'today',public.dir_cr_now()::date,
  'settings',public.dir_reservation_settings_json(s),
  'pendingUpcoming',(select count(*) from public.dir_reservations r where r.place_id=p.id and r.kind='booking' and r.status='pending' and r.day>=public.dir_cr_now()::date),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'reference',r.reference,'day',r.day,'time',to_char(r.slot_time,'HH24:MI'),'partySize',r.party_size,
    'name',r.name,'phone',r.phone,'email',r.email,'note',r.note,'status',r.status,'revision',r.revision,'createdAt',r.created_at)
    order by r.kind,r.slot_time nulls last,r.created_at,r.id) from public.dir_reservations r where r.place_id=p.id and r.day=d),'[]'));
end $$;

-- Input: {actionId, reservationId, revision, action: confirm|decline|cancel|seated|no_show|notify_ready|left}.
-- Result carries `notice` (kind + channel + destination) when the customer must be told; the route passes it to the
-- MOCK sender only and never returns the destination to the browser.
create or replace function public.dir_reservation_decide(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;rev integer;who uuid:=coalesce(p_member,p_actor);prior jsonb;r public.dir_reservations;act text:=p_input->>'action';nxt text;old text;nk text;ch text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reservationId','revision','action')) then raise exception 'Invalid decision' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reservationId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid decision' using errcode='22023';end;
 if aid is null or rid is null or rev<1 or act is null or act not in('confirm','decline','cancel','seated','no_show','notify_ready','left') then raise exception 'Invalid decision' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 select * into r from public.dir_reservations where id=rid;
 if not found then raise exception 'Reservation not found' using errcode='P0002';end if;
 perform public.dir_tool_authorize(p_actor,p_member,r.place_id,'work.write');
 select * into r from public.dir_reservations where id=rid for update;
 if r.revision<>rev then raise exception 'Reservation changed' using errcode='40001';end if;
 nxt:=case
  when r.kind='booking' and r.status='pending' and act='confirm' then 'confirmed'
  when r.kind='booking' and r.status='pending' and act='decline' then 'declined'
  when r.kind='booking' and r.status in('pending','confirmed') and act='cancel' then 'cancelled'
  when r.kind='booking' and r.status='confirmed' and act='seated' then 'seated'
  when r.kind='booking' and r.status='confirmed' and act='no_show' then 'no_show'
  when r.kind='waitlist' and r.status in('waiting','notified') and act='notify_ready' then 'notified'
  when r.kind='waitlist' and r.status in('waiting','notified') and act='seated' then 'seated'
  when r.kind='waitlist' and r.status in('waiting','notified') and act='left' then 'left'
  end;
 if nxt is null then raise exception 'Not allowed from this status' using errcode='22023',hint='dir_reservation_transition';end if;
 old:=r.status;
 update public.dir_reservations set status=nxt,revision=revision+1 where id=rid returning * into r;
 insert into public.dir_reservation_events(reservation_id,actor_id,member_id,action_id,action,from_status,to_status) values(rid,p_actor,p_member,aid,act,old,nxt);
 nk:=case act when 'confirm' then 'confirmed' when 'decline' then 'declined' when 'notify_ready' then 'table_ready' end;
 ch:=case when r.email is not null then 'email' else 'sms' end;
 if nk is not null then insert into public.dir_reservation_notices(reservation_id,kind,channel,sender,action_id) values(rid,nk,ch,'mock',aid);end if;
 result:=jsonb_build_object('reservationId',rid,'revision',r.revision,'status',r.status,
  'notice',case when nk is not null then jsonb_build_object('kind',nk,'channel',ch,'to',coalesce(r.email,r.phone),'name',r.name,'reference',r.reference,
   'day',r.day,'time',to_char(r.slot_time,'HH24:MI'),'partySize',r.party_size,'placeName',(select name from public.dir_places where id=r.place_id)) end);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- customer self-service (pending fixes round)
-- Waitlist position of a waiting entry (1 = next).
create or replace function public.dir_waitlist_position(r public.dir_reservations) returns integer
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when r.kind='waitlist' and r.status='waiting' then (select count(*)::integer from public.dir_reservations x
  where x.place_id=r.place_id and x.kind='waitlist' and x.day=r.day and x.status='waiting' and (x.created_at,x.id)<=(r.created_at,r.id)) end $$;
-- Can the customer still cancel? Bookings: pending/confirmed and before the booked time (Costa Rica time).
-- Waitlist: waiting or «table ready» on the same day.
create or replace function public.dir_reservation_customer_can_cancel(r public.dir_reservations) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when r.kind='booking' then r.status in('pending','confirmed') and r.day+r.slot_time>public.dir_cr_now()
  else r.status in('waiting','notified') and r.day=public.dir_cr_now()::date end $$;
-- What the customer sees: no ids, no contact data, no actors; the timeline lists only status changes.
create or replace function public.dir_reservation_customer_json(r public.dir_reservations) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('reference',r.reference,'kind',r.kind,'status',r.status,'revision',r.revision,'day',r.day,'time',to_char(r.slot_time,'HH24:MI'),
  'partySize',r.party_size,'name',r.name,'placeName',p.name,'placeSlug',p.slug,'position',public.dir_waitlist_position(r),
  'canCancel',public.dir_reservation_customer_can_cancel(r),'createdAt',r.created_at,
  'timeline',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'status',e.to_status,'at',e.at) order by e.id) from public.dir_reservation_events e where e.reservation_id=r.id),'[]'))
 from public.dir_places p where p.id=r.place_id $$;
-- Status by private link: p_access_hash = SHA-256 (hex) of the token. Unknown → null (the page answers 404).
create or replace function public.dir_reservation_by_access(p_access_hash text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.dir_reservations;
begin
 if coalesce(p_access_hash,'')!~'^[a-f0-9]{64}$' then return null;end if;
 select * into r from public.dir_reservations where access_hash=p_access_hash;
 if not found then return null;end if;
 return public.dir_reservation_customer_json(r);
end $$;
-- «Mis reservas» of a signed-in customer (latest 50 with a private link). `id` is for the server only: the route turns it
-- into the private token and never sends it to the browser.
create or replace function public.dir_reservation_mine(p_actor uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.day desc,x.created_at desc),'[]') from (
  select public.dir_reservation_customer_json(r)||jsonb_build_object('id',r.id) j,r.day,r.created_at from public.dir_reservations r
  where p_actor is not null and r.customer_id=p_actor and r.access_hash is not null order by r.day desc,r.created_at desc limit 50) x $$;
-- Customer cancels by private link. Input: {actionId, accessHash, revision}. CAS by revision (40001), idempotent actionId
-- (receipts keyed by the reservation), immutable event 'customer_cancel', a MOCK notice to the business
-- ('customer_cancelled'). Booking → cancelled; waitlist → left. Closed after the start time → 409.
create or replace function public.dir_reservation_customer_cancel(p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rev integer;who uuid;prior jsonb;r public.dir_reservations;old text;nxt text;result jsonb;
begin
 if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','accessHash','revision')) then raise exception 'Invalid cancellation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid cancellation' using errcode='22023';end;
 if aid is null or rev<1 or coalesce(p_input->>'accessHash','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid cancellation' using errcode='22023';end if;
 select * into r from public.dir_reservations where access_hash=p_input->>'accessHash';
 if not found then raise exception 'Reservation not found' using errcode='P0002';end if;
 who:=public.dir_derived_uuid(r.id,'reservation-access');
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-reservations:'||r.place_id::text,0));
 select * into r from public.dir_reservations where id=r.id for update;
 if r.revision<>rev then raise exception 'Reservation changed' using errcode='40001';end if;
 if not public.dir_reservation_customer_can_cancel(r) then raise exception 'It can no longer be cancelled' using errcode='22023',hint='dir_reservation_cancel_closed';end if;
 old:=r.status;nxt:=case r.kind when 'booking' then 'cancelled' else 'left' end;
 update public.dir_reservations set status=nxt,revision=revision+1 where id=r.id returning * into r;
 insert into public.dir_reservation_events(reservation_id,actor_id,action_id,action,from_status,to_status) values(r.id,r.customer_id,aid,'customer_cancel',old,nxt);
 insert into public.dir_reservation_notices(reservation_id,kind,channel,sender,action_id) values(r.id,'customer_cancelled','email','mock',aid);
 result:=public.dir_reservation_customer_json(r)||jsonb_build_object('ownerNotice',jsonb_build_object('kind','customer_cancelled','channel','email','placeId',r.place_id,
  'reference',r.reference,'name',r.name,'day',r.day,'time',to_char(r.slot_time,'HH24:MI'),'partySize',r.party_size,'waitlist',r.kind='waitlist'));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_reservation_settings','dir_reservation_settings_history','dir_reservations','dir_reservation_events','dir_reservation_notices'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n in('dir_reservation_settings','dir_reservations') then execute format('grant select,insert,update on public.%I to service_role',n);
 else execute format('grant select,insert on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and (p.proname like 'dir\_reservation%' or p.proname in('dir_waitlist_join','dir_waitlist_position','dir_cr_now')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
