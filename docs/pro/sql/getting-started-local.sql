-- LOCAL PRO ONLY. Round 12 (2026-11-15): «Primeros pasos» (getting started) inside Pro (Houzz Pro parity row 74).
-- One read that derives, from the account's OWN existing records, which first steps are done: company profile,
-- document branding, first customer, first quote, first job, a customer following a job, the customer view
-- configured, a billing document or payment plan, and a team member. Nothing is stored or sent; the checklist
-- disappears from «Inicio» when every step is done. Read only, service_role only, security invoker.
begin;
create or replace function public.pro_getting_started_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare steps jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 steps:=jsonb_build_array(
  jsonb_build_object('key','profile','done',exists(select 1 from public.professionals p where p.profile_id=p_actor and coalesce(btrim(p.business_name),'')<>''
   and (coalesce(btrim(p.call_phone),'')<>'' or coalesce(btrim(p.whatsapp),'')<>'') and coalesce(btrim(p.formatted_address),'')<>'')),
  jsonb_build_object('key','branding','done',exists(select 1 from public.pro_document_branding b where b.owner_id=p_actor)),
  jsonb_build_object('key','customer','done',exists(select 1 from public.pro_clients c where c.user_id=p_actor and not c.archived)),
  jsonb_build_object('key','quote','done',exists(select 1 from public.pro_private_estimates e where e.owner_id=p_actor)),
  jsonb_build_object('key','job','done',exists(select 1 from public.pro_work w where w.user_id=p_actor and not coalesce(w.cancelled,false))),
  jsonb_build_object('key','client_linked','done',exists(select 1 from public.pro_appointment_requests r where r.owner_id=p_actor and r.client_user_id is not null and r.work_id is not null and r.status in('confirmed','completed'))),
  jsonb_build_object('key','client_view','done',exists(select 1 from public.pro_client_dashboards d where d.owner_id=p_actor)),
  jsonb_build_object('key','billing','done',exists(select 1 from public.pro_invoice_drafts i where i.user_id=p_actor) or exists(select 1 from public.pro_payment_plans p where p.owner_id=p_actor)),
  jsonb_build_object('key','team','done',exists(select 1 from public.pro_company_members m where m.owner_id=p_actor)));
 return jsonb_build_object('steps',steps,'done',(select count(*) from jsonb_array_elements(steps) s where (s->>'done')::boolean),'total',jsonb_array_length(steps));
end $$;
revoke all on function public.pro_getting_started_read(uuid) from public,anon,authenticated;
grant execute on function public.pro_getting_started_read(uuid) to service_role;
notify pgrst,'reload schema';
commit;
