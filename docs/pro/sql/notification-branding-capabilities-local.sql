-- LOCAL PRO ONLY. Round 9 (2026-11-15): route capabilities of the new Round 9 routes for the role gate
-- (single source: pro_role_route_capability; same module table as job-page-local.sql plus two rules):
--  * /api/pro/notifications writes are personal ('read'): marking read and one's own preferences.
--  * /api/pro/document-branding writes are a company setting ('settings.write', Administrator only).
-- Everything else is unchanged (time-report is GET only = read; task-center bulk = work.write;
-- company-files = company.write; selections = sales.write; sub-portal stays outside the substitution).
begin;
create or replace function public.pro_role_route_capability(p_method text,p_path text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare seg text:=split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1);
begin
 if upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then return 'read';end if;
 -- Round 8: one's own overview arrangement is a personal preference, not a change to company data.
 if seg='overview-layout' then return 'read';end if;
 -- Round 9: the notification center (marking read, own preferences and reminder schedule) is personal.
 if seg='notifications' then return 'read';end if;
 -- Round 9: company branding of printed documents is a company setting (Administrator only).
 if seg='document-branding' then return 'settings.write';end if;
 if seg in('team','team-roles','subcontractors') then return 'team.manage';end if;
 if seg ~ '^(integrations|connectors|oauth|site|site-public|marketing|marketing-confirm|ads-tracking|social|social-content|promotions|invoice-document-settings|invoice-issuer|accounting|accounting-export|einvoice|einvoice-file)$' then return 'settings.write';end if;
 if seg ~ '^(invoice-|payment-|pay$|client-operations|client-balance|client-statement|client-finances|credits-retainers|work-billing|work-budget|work-costs|expenses|expense-receipts|purchase-order|online-payments)' then return 'finance.write';end if;
 if seg ~ '^(lead-|request-pipeline|request-followups|manual-lead-)' then return 'lead.write';end if;
 if seg ~ '^(private-estimate|quote|quotes|contract|esign|appointment-|reservations|bids|bid-portal-links|work-changes|selections|allowances|project-quote-context|visit-preparation|work-client-invitations|client-dashboard|client-pending|client-fiscal|request-quotes|direct-project|workspace|projects|work-header|identity-lookup)' then return 'sales.write';end if;
 if seg ~ '^(catalog|company-|service-packages|discount-presets|task-templates|schedule-templates|ai|ai-meetings)' then return 'company.write';end if;
 return 'work.write';
end $$;



do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_role_route_capability') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
