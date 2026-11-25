-- Pro row 72, fix: PostgreSQL regular expressions accept at most 255 repetitions; the webhook URL check used {0,400}, which
-- raises "invalid repetition count(s)" (SQLSTATE 2201B) on every insert, so creating a connection answered 503. The length is
-- already limited by length(url)<=600, so the path uses an open repetition.
begin;
alter table public.pro_webhook_endpoints drop constraint if exists pro_webhook_endpoints_url_check;
alter table public.pro_webhook_endpoints add constraint pro_webhook_endpoints_url_check
 check(length(url)<=600 and url~'^https://[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?(/[^[:space:]]*)?$');
commit;
