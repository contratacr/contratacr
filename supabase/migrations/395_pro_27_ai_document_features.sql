-- Pro row 46: document-level AI drafts. Four new suggestion features (quote scope note, additional contract clause,
-- visual proposal introduction, change-order reason). The CHECK on pro_ai_suggestions.feature and the validation in
-- pro_ai_begin both read pro_ai_features(), so replacing it is enough; old rows stay valid. Suggestions still never
-- save anything on their own; consent, monthly limit and idempotent actionId are enforced by pro_ai_begin as before.
begin;
create or replace function public.pro_ai_features() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['quote_line','contract_clause','daily_log','client_update','takeoff','expense_receipt','expense_voice','meeting','transcribe_voice','transcribe_meeting',
  'quote_scope','contract_draft','proposal_intro','change_order']::text[] $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_ai_features' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
