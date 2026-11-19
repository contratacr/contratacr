-- LOOPBACK ONLY via prepare-supabase-local. Never schedule hosted jobs from this draft.
create extension if not exists pg_cron;
select cron.schedule('pro-identity-quota-prune','* * * * *','select public.pro_identity_quota_prune()');
