-- LOCAL PRO ONLY. Quotas contain opaque tokens, never identifications or names.
begin;
create table if not exists public.pro_identity_quota (
 key text primary key, hits integer not null check(hits>0), expires_at timestamptz not null
);
create index if not exists pro_identity_quota_expiry on public.pro_identity_quota(expires_at);
alter table public.pro_identity_quota enable row level security;
revoke all on public.pro_identity_quota from public,anon,authenticated;
grant select,insert,update,delete on public.pro_identity_quota to service_role;
create or replace function public.pro_identity_quota_take(p_account text,p_ip text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare at_time timestamptz:=clock_timestamp(); keys text[]; ends timestamptz[]; limits integer[]:=array[20,60,100,5]; idx integer; existing public.pro_identity_quota;
begin
 if p_account is null or p_ip is null or p_account !~ '^[a-f0-9]{64}$' or p_ip !~ '^[a-f0-9]{64}$' then raise exception 'Invalid quota token' using errcode='22023';end if;
 -- One atomic decision across instances and all scopes. Denials do not consume other scopes.
 perform pg_advisory_xact_lock(6845211301);
 at_time:=clock_timestamp();
 delete from public.pro_identity_quota where expires_at<=at_time;
 keys:=array['account:'||p_account,'ip:'||p_ip,'global:minute','global:second'];
 ends:=array[at_time+interval '10 minutes',at_time+interval '10 minutes',at_time+interval '1 minute',at_time+interval '1 second'];
 for idx in 1..4 loop
  select * into existing from public.pro_identity_quota where key=keys[idx];
  if found and existing.hits>=limits[idx] then return jsonb_build_object('allowed',false,'retryAfter',greatest(1,ceil(extract(epoch from existing.expires_at-at_time))::integer));end if;
 end loop;
 for idx in 1..4 loop
  insert into public.pro_identity_quota(key,hits,expires_at) values(keys[idx],1,ends[idx])
  on conflict(key) do update set hits=pro_identity_quota.hits+1;
 end loop;
 return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.pro_identity_quota_take(text,text) from public,anon,authenticated;
grant execute on function public.pro_identity_quota_take(text,text) to service_role;
-- Scheduled physical deletion is installed separately in the loopback preparation.
create or replace function public.pro_identity_quota_prune() returns void
language plpgsql security invoker set search_path=public,pg_temp as $$begin perform pg_advisory_xact_lock(6845211301);delete from public.pro_identity_quota where expires_at<=clock_timestamp();end$$;
revoke all on function public.pro_identity_quota_prune() from public,anon,authenticated;
grant execute on function public.pro_identity_quota_prune() to service_role;
commit;
