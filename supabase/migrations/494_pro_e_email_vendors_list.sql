-- Pro area E (email marketing): the "Vendors" system list. A vendor is an active supplier or subcontractor of the owner
-- (pro_expense_suppliers). The list holds the owner's marketing contacts with granted consent whose email matches a vendor email.
-- Consent rules are unchanged: nobody is in an audience without granted consent and without an unsuppressed address.
begin;
do $$declare c record;begin
 for c in select con.conname from pg_constraint con where con.contype='c' and con.conrelid='public.pro_mkt_campaigns'::regclass and pg_get_constraintdef(con.oid) like '%segment%' loop
  execute format('alter table public.pro_mkt_campaigns drop constraint %I',c.conname);
 end loop;
 alter table public.pro_mkt_campaigns add constraint pro_mkt_campaigns_segment_chk check(segment in('all','clients','leads','vendors') or segment~'^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
end $$;

create or replace function public.pro_mkt_audience(p_owner uuid,p_segment text) returns setof public.pro_mkt_contacts
language sql stable security invoker set search_path=public,pg_temp as $$
 select c.* from public.pro_mkt_contacts c where c.owner_id=p_owner and c.consent='granted'
  and not exists(select 1 from public.pro_mkt_suppressions s where s.owner_id=c.owner_id and s.email_hash=c.email_hash)
  and (p_segment='all' or p_segment='clients' and c.client_id is not null or p_segment='leads' and c.lead_id is not null
   or p_segment='vendors' and exists(select 1 from public.pro_expense_suppliers v where v.user_id=c.owner_id and not v.archived and lower(btrim(v.email))=c.email)
   or p_segment like 'list:%' and exists(select 1 from public.pro_mkt_list_members m where m.owner_id=c.owner_id and m.contact_id=c.id and m.list_id::text=substr(p_segment,6)))
  order by c.created_at,c.id $$;

create or replace function public.pro_mkt_lists_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object(
  'system',jsonb_build_object('all',(select count(*) from public.pro_mkt_audience(p_actor,'all')),'clients',(select count(*) from public.pro_mkt_audience(p_actor,'clients')),'leads',(select count(*) from public.pro_mkt_audience(p_actor,'leads')),
   'vendors',(select count(*) from public.pro_mkt_audience(p_actor,'vendors')),
   'vendorsWithEmail',(select count(*) from public.pro_expense_suppliers v where v.user_id=p_actor and not v.archived and btrim(v.email)<>'')),
  'lists',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,
    'contactIds',coalesce((select jsonb_agg(m.contact_id order by m.contact_id) from public.pro_mkt_list_members m where m.owner_id=l.owner_id and m.list_id=l.id),'[]'::jsonb),
    'audience',(select count(*) from public.pro_mkt_audience(p_actor,'list:'||l.id::text))) order by l.created_at,l.id)
   from public.pro_mkt_lists l where l.owner_id=p_actor),'[]'::jsonb),
  'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email) order by c.name,c.id)
   from (select * from public.pro_mkt_contacts where owner_id=p_actor and consent='granted' order by name,id limit 500) c),'[]'::jsonb));
end $$;
notify pgrst,'reload schema';
commit;
