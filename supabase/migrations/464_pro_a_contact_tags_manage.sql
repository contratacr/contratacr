-- Pro area A (Contacts, tags manager): rename or delete a contact tag across all customers of the owner.
-- Renaming onto a tag that a customer already has keeps one copy; renaming only changes the case of a tag in place.
-- Role gate (sales.write) stays at the /api/pro/client-contacts route; SQL enforces owner and bounds. service_role only.
begin;
create or replace function public.pro_contact_tags_manage(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare act text;old_tag text;new_tag text;n integer:=0;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid tag' using errcode='22023';end if;
 act:=p_input->>'action';old_tag:=btrim(coalesce(p_input->>'tag',''));
 if act not in('tag_rename','tag_delete') or length(old_tag) not between 1 and 40 then raise exception 'Invalid tag' using errcode='22023';end if;
 if act='tag_delete' then
  delete from public.pro_contact_tags t where t.owner_id=p_actor and t.tag_key=lower(old_tag);
  get diagnostics n=row_count;
 else
  new_tag:=btrim(coalesce(p_input->>'name',''));
  if length(new_tag) not between 1 and 40 or new_tag ~ '[[:cntrl:];,]' then raise exception 'Invalid tag' using errcode='22023';end if;
  if lower(new_tag)<>lower(old_tag) then
   delete from public.pro_contact_tags t where t.owner_id=p_actor and t.tag_key=lower(old_tag)
    and exists(select 1 from public.pro_contact_tags u where u.owner_id=t.owner_id and u.client_id=t.client_id and u.tag_key=lower(new_tag));
  end if;
  update public.pro_contact_tags t set tag=new_tag where t.owner_id=p_actor and t.tag_key=lower(old_tag);
  get diagnostics n=row_count;
 end if;
 return jsonb_build_object('ok',true,'affected',n);
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_contact_tags_manage' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
