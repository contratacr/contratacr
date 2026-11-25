-- Pro row 79 fix: a plan template attached to an appointment request that was never archived has no pro_lead_center_records row
-- (that row only exists once the request is archived), so the foreign key made the attach fail with 23503 (answered 400).
-- The foreign key is replaced by an insert-time trigger that accepts either the lead-center row or the request itself.
begin;
alter table public.pro_lead_plan_templates drop constraint if exists pro_lead_plan_templates_owner_id_lead_kind_lead_id_fkey;
create or replace function public.pro_lead_plan_lead_exists() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not (exists(select 1 from public.pro_lead_center_records r where r.owner_id=new.owner_id and r.kind=new.lead_kind and r.id=new.lead_id)
  or new.lead_kind='request' and exists(select 1 from public.pro_appointment_requests q where q.owner_id=new.owner_id and q.id=new.lead_id)) then
  raise exception 'Opportunity unavailable' using errcode='23503';
 end if;
 return new;
end $$;
drop trigger if exists pro_lead_plan_lead_exists on public.pro_lead_plan_templates;
create trigger pro_lead_plan_lead_exists before insert on public.pro_lead_plan_templates for each row execute function public.pro_lead_plan_lead_exists();
commit;
