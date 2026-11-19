-- LOCAL PRO ONLY (multivertical F4 wiring, 2026-11-16). Team-roles gate for Pro editions/modules.
-- Depends on: team-roles-local.sql (pro_role_of, pro_company_team_activity, pro_team_name, grants) and
--             pro-editions-local.sql (pro_route_module, pro_has_module).
-- Applied AFTER both so team-roles-local.sql stays untouched (no dependency cycle).
-- * New capabilities: inventory.write, listing.publish, price.write, menu.write (public-facing publish/price only for
--   admin/manager; members may edit inventory and menu; read_only stays read).
-- * pro_team_route_authorize checks the role first, then the module of the route (a GET to a disabled module is
--   also refused with reason module_disabled).
-- Idempotent: only create or replace; create or replace keeps the existing grants.
begin;
create or replace function public.pro_role_allows(p_role text,p_capability text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_role
  when 'admin' then p_capability in('read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write')
  when 'manager' then p_capability in('read','work.write','lead.write','sales.write','finance.write','company.write','inventory.write','listing.publish','price.write','menu.write')
  when 'member' then p_capability in('read','work.write','lead.write','inventory.write','menu.write')
  when 'read_only' then p_capability='read'
  else false end
$$;
create or replace function public.pro_role_matrix_read() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_object_agg(r,(select jsonb_agg(c order by o) from unnest(array['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write']) with ordinality x(c,o) where public.pro_role_allows(r,c)))
 from unnest(array['admin','manager','member','read_only']) r
$$;
create or replace function public.pro_role_require(p_actor uuid,p_owner uuid,p_capability text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;
begin
 if p_capability is null or p_capability not in('read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write') then raise exception 'Unknown capability' using errcode='22023';end if;
 r:=public.pro_role_of(p_actor,p_owner);
 if r is null or not public.pro_role_allows(r,p_capability) then raise exception 'Role does not allow %',p_capability using errcode='42501';end if;
 return r;
end $$;
create or replace function public.pro_role_route_capability(p_method text,p_path text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare seg text:=split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1);
begin
 if upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then return 'read';end if;
 if seg in('team','team-roles') then return 'team.manage';end if;
 if seg ~ '^(auto-inventory|property-inventory|inventory|inventory-items|inventory-movements|stock-alerts)$' then return 'inventory.write';end if;
 if seg ~ '^(auto-listings|listings)$' then return 'listing.publish';end if;
 if seg ~ '^(price-list|prices)$' then return 'price.write';end if;
 if seg ~ '^(menu|menu-items|menu-sections|menu-from-photo)$' then return 'menu.write';end if;
 if seg ~ '^(integrations|connectors|oauth|site|site-public|marketing|marketing-confirm|ads-tracking|social|social-content|promotions|invoice-document-settings|invoice-issuer|accounting|accounting-export|einvoice|einvoice-file)$' then return 'settings.write';end if;
 if seg ~ '^(invoice-|payment-|pay$|client-operations|client-balance|client-statement|client-finances|credits-retainers|work-billing|work-budget|work-costs|expenses|expense-receipts|purchase-order|online-payments)' then return 'finance.write';end if;
 if seg ~ '^(lead-|request-pipeline|request-followups|manual-lead-)' then return 'lead.write';end if;
 if seg ~ '^(private-estimate|quote|quotes|contract|esign|appointment-|reservations|bids|bid-portal-links|work-changes|selections|allowances|project-quote-context|visit-preparation|work-client-invitations|client-dashboard|client-pending|client-fiscal|request-quotes|direct-project|workspace|projects|work-header|identity-lookup)' then return 'sales.write';end if;
 if seg ~ '^(catalog|company-|service-packages|discount-presets|task-templates|schedule-templates|ai|ai-meetings)' then return 'company.write';end if;
 return 'work.write';
end $$;
create or replace function public.pro_team_workspace_resolve(p_member uuid,p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;
begin
 if p_member is null or p_owner is null or p_member=p_owner then return null;end if;
 r:=public.pro_role_of(p_member,p_owner);
 if r is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then return null;end if;
 return jsonb_build_object('ownerId',p_owner,'ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_owner),public.pro_team_name(p_owner)),
  'role',r,'capabilities',(select jsonb_agg(c) from unnest(array['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write']) c where public.pro_role_allows(r,c)));
end $$;
create or replace function public.pro_team_route_authorize(p_member uuid,p_owner uuid,p_method text,p_path text) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare ws jsonb;cap text;mod text;
begin
 if p_path is null or length(p_path)>200 or p_path !~ '^/api/pro(/|$)' then raise exception 'Invalid route' using errcode='22023';end if;
 ws:=public.pro_team_workspace_resolve(p_member,p_owner);
 if ws is null then return jsonb_build_object('allowed',false,'reason','not_member');end if;
 cap:=public.pro_role_route_capability(p_method,p_path);
 begin perform public.pro_role_require(p_member,p_owner,cap);
 exception when insufficient_privilege then return jsonb_build_object('allowed',false,'reason','role','role',ws->>'role','capability',cap);end;
 mod:=public.pro_route_module(p_path);
 if mod is not null and not public.pro_has_module(p_owner,mod) then
  return jsonb_build_object('allowed',false,'reason','module_disabled','role',ws->>'role','capability',cap,'module',mod);end if;
 if cap<>'read' then
  insert into public.pro_company_team_activity(owner_id,member_user_id,member_name,role,capability,method,path)
  values(p_owner,p_member,public.pro_team_name(p_member),ws->>'role',cap,upper(p_method),left(p_path,200));
 end if;
 return jsonb_build_object('allowed',true,'role',ws->>'role','capability',cap);
end $$;
commit;
