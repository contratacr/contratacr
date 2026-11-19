-- LOCAL ONLY (pre-launch hardening, 2026-11-17): shared fixed-window rate limiter for every API route.
-- Replaces the per-isolate in-memory Map of src/lib/rate-limit.ts, which does not hold on Cloudflare Workers
-- (each isolate/instance had its own counters, reset on every deploy or eviction).
-- * key: HMAC-SHA256 hex computed by the server (bucket + client IP / user / device / token digest). Raw IPs,
--   user ids or tokens never reach this table.
-- * Same semantics as the previous limiter: the window starts at the first hit; a denied hit does not count;
--   a hit after window_ends_at starts a new window with count 1; retryAfter = whole seconds left (>= 1).
-- * Atomic: insert ... on conflict do nothing, then a row lock (select ... for update). Concurrent callers on
--   one key serialize on that row, so exactly `limit` hits are admitted per window.
-- * Cleanup: about 2% of calls delete up to 500 rows expired for more than a minute (skip locked);
--   app_rate_limit_prune() deletes them all (for a scheduled job).
-- * Only service_role: RLS on with no policies, table and functions revoked from public/anon/authenticated.
begin;
create table if not exists public.app_rate_limit_buckets(
 key text primary key check (key ~ '^[a-f0-9]{64}$'),
 hits integer not null check (hits between 1 and 100000),
 window_ends_at timestamptz not null
);
create index if not exists app_rate_limit_buckets_expiry on public.app_rate_limit_buckets(window_ends_at);
alter table public.app_rate_limit_buckets enable row level security;
revoke all on public.app_rate_limit_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.app_rate_limit_buckets to service_role;

create or replace function public.app_rate_limit_take(p_key text,p_limit integer,p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare at_time timestamptz:=clock_timestamp(); win interval; row_hits integer; row_end timestamptz; attempt integer;
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit<1 or p_limit>100000
    or p_window_ms is null or p_window_ms<1000 or p_window_ms>86400000 then
  raise exception 'Invalid rate limit' using errcode='22023';
 end if;
 win:=p_window_ms*interval '1 millisecond';
 if random()<0.02 then
  delete from app_rate_limit_buckets where key in(
   select key from app_rate_limit_buckets where window_ends_at<at_time-interval '1 minute' limit 500 for update skip locked);
 end if;
 for attempt in 1..3 loop
  insert into app_rate_limit_buckets(key,hits,window_ends_at) values(p_key,1,at_time+win) on conflict(key) do nothing;
  if found then return jsonb_build_object('allowed',true,'retryAfter',0); end if;
  select hits,window_ends_at into row_hits,row_end from app_rate_limit_buckets where key=p_key for update;
  if not found then continue; end if; -- pruned between both statements: insert again
  if row_end<at_time then
   update app_rate_limit_buckets set hits=1,window_ends_at=at_time+win where key=p_key;
   return jsonb_build_object('allowed',true,'retryAfter',0);
  end if;
  if row_hits>=p_limit then
   return jsonb_build_object('allowed',false,'retryAfter',greatest(1,ceil(extract(epoch from row_end-at_time))::integer));
  end if;
  update app_rate_limit_buckets set hits=hits+1 where key=p_key;
  return jsonb_build_object('allowed',true,'retryAfter',0);
 end loop;
 raise exception 'Rate limit bucket unavailable' using errcode='40001';
end $$;
revoke all on function public.app_rate_limit_take(text,integer,integer) from public,anon,authenticated;
grant execute on function public.app_rate_limit_take(text,integer,integer) to service_role;

create or replace function public.app_rate_limit_prune() returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin delete from app_rate_limit_buckets where window_ends_at<clock_timestamp()-interval '1 minute'; get diagnostics n=row_count; return n; end $$;
revoke all on function public.app_rate_limit_prune() from public,anon,authenticated;
grant execute on function public.app_rate_limit_prune() to service_role;
commit;
