begin;
-- Extend the existing allow-list without dropping any historical notification type.
do $$ declare rule text; begin
 select pg_get_constraintdef(oid) into rule from pg_constraint
 where conrelid='public.notifications'::regclass and conname='notifications_type_check';
 if rule is not null and position('admin_attention' in rule)=0 then
  alter table public.notifications drop constraint notifications_type_check;
  execute 'alter table public.notifications add constraint notifications_type_check check (type = ''admin_attention'' OR ' || substring(rule from 7) || ')';
 end if;
end $$;
create unique index if not exists admin_attention_event_once on public.notifications
 (user_id,(data->>'admin_event_key')) where type='admin_attention';
-- Role revocation also removes access to old admin alerts; normal notices are unchanged.
drop policy if exists admin_attention_live_role on public.notifications;
create policy admin_attention_live_role on public.notifications as restrictive for select to authenticated
 using(type <> 'admin_attention' or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and not coalesce(p.is_disabled,false)));

create or replace function public.notify_admin_attention(event_key text, heading text, destination text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,type,title,message,data)
 select p.id,'admin_attention',heading,'Hay un elemento nuevo por atender en el panel administrativo.',
 jsonb_build_object('link',destination,'admin_attention',true,'admin_event_key',event_key)
 from public.profiles p where p.role='admin' and not coalesce(p.is_disabled,false)
 on conflict (user_id,(data->>'admin_event_key')) where type='admin_attention' do nothing;
end $$;
revoke all on function public.notify_admin_attention(text,text,text) from public,anon,authenticated;

-- No backfill: installation does not send the existing queue to a phone.
create or replace function public.capture_admin_attention()
returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb; k text; h text; dest text;
begin
 if TG_OP='UPDATE' then o:=to_jsonb(old); else o:='{}'; end if;
 if TG_TABLE_NAME='support_tickets' then
  if TG_OP<>'INSERT' or n->>'status' not in ('open','in_progress') then return new; end if;
  k:='support:new:'||(n->>'id'); dest:='/admin/soporte?ticket='||(n->>'id');
  h:=case when n->>'topic' in ('verification_documents','verification_appeal') then 'Nueva revisión de identidad' else 'Nuevo caso de soporte' end;
 elsif TG_TABLE_NAME='support_ticket_messages' then
  if n->>'sender_role'<>'user' then return new; end if;
  dest:='/admin/soporte?ticket='||(n->>'ticket_id');
  if not exists(select 1 from public.support_ticket_messages m where m.ticket_id=new.ticket_id and m.sender_role='user' and m.id<>new.id) then
   k:='support:new:'||(n->>'ticket_id'); h:='Nuevo caso de soporte';
  else k:='support:reply:'||(n->>'id'); h:='Nueva respuesta en soporte'; end if;
 elsif TG_TABLE_NAME='reports' then
  if n->>'status'<>'open' or (TG_OP='UPDATE' and o->>'status'='open') then return new; end if;
  k:='report:'||(n->>'id'); h:='Nuevo reporte por revisar'; dest:='/admin/reportes';
 elsif TG_TABLE_NAME='category_suggestions' then
  if n->>'status'<>'pending' or (TG_OP='UPDATE' and o->>'status'='pending') then return new; end if;
  k:='service:'||(n->>'id'); h:='Nueva sugerencia de servicio'; dest:='/admin/servicios';
 elsif TG_TABLE_NAME='account_deletion_requests' then
  if n->>'status' not in ('pending','failed') or (TG_OP='UPDATE' and n->>'status'=o->>'status') then return new; end if;
  k:='deletion:'||(n->>'id')||':'||(n->>'status')||':'||coalesce(n->>'attempts','0');
  h:=case when n->>'status'='failed' then 'Eliminación de cuenta pendiente de atención' else 'Nueva solicitud de eliminación de cuenta' end;
  dest:='/admin/cuentas';
 elsif TG_TABLE_NAME='professionals' then
  if n->>'verification_status' not in ('pending','under_appeal') then return new; end if;
  if TG_OP='UPDATE' and n->>'verification_status' is not distinct from o->>'verification_status'
   and n->>'verification_reason' is not distinct from o->>'verification_reason' then return new; end if;
  -- Initial automatic lookup can still approve the account: alert only a recorded manual need.
  if n->>'verification_status'='pending' and coalesce(n->>'verification_reason','')='' then return new; end if;
  if n->>'verification_status'='under_appeal' and exists(
   select 1 from public.support_tickets t where t.professional_id=new.id and t.status in ('open','in_progress')
  ) then return new; end if; -- The linked support case already carries the document/review alert.
  k:='verification:'||(n->>'id')||':'||coalesce(n->>'verification_updated_at',n->>'created_at','initial');
  h:='Identidad pendiente de revisión'; dest:='/admin/proveedores/'||(n->>'id');
 elsif TG_TABLE_NAME='profiles' then
  if n->>'client_identity_status'<>'pending' or coalesce(n->>'cedula','')='' then return new; end if;
  if TG_OP='UPDATE' and n->>'client_identity_status' is not distinct from o->>'client_identity_status' then return new; end if;
  if exists(select 1 from public.professionals p where p.profile_id=new.id) then return new; end if;
  k:='client-verification:'||(n->>'id')||':'||txid_current()::text;
  h:='Identidad de cliente pendiente de revisión'; dest:='/admin/usuarios/'||(n->>'id');
 else return new;
 end if;
 perform public.notify_admin_attention(k,h,dest);
 return new;
end $$;
revoke all on function public.capture_admin_attention() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['support_tickets','reports','category_suggestions','account_deletion_requests','professionals','profiles'] loop
  execute format('drop trigger if exists capture_admin_attention on public.%I',t);
  execute format('create trigger capture_admin_attention after insert or update on public.%I for each row execute function public.capture_admin_attention()',t);
 end loop;
end $$;
drop trigger if exists capture_admin_attention on public.support_ticket_messages;
create trigger capture_admin_attention after insert on public.support_ticket_messages
 for each row execute function public.capture_admin_attention();

-- Preserve known historical self events privately, outside every statistics consumer.
create table if not exists public.excluded_self_interactions (
 id uuid primary key default gen_random_uuid(), event jsonb not null, excluded_at timestamptz not null default now()
);
alter table public.excluded_self_interactions enable row level security;
revoke all on public.excluded_self_interactions from public,anon,authenticated;
grant all on public.excluded_self_interactions to service_role;
with removed as (
 delete from public.interaction_events e using public.professionals p
 where e.professional_id=p.id and e.viewer_user_id=p.profile_id
 and e.event_type in ('profile_view','whatsapp_click','phone_click','email_click','availability_view','schedule_slot_selected','favorite_add','favorite_remove','profile_share','external_link_click','contact_gate_shown') returning e.*
) insert into public.excluded_self_interactions(event) select to_jsonb(r) from removed r;
create or replace function public.skip_self_profile_interaction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type in ('profile_view','whatsapp_click','phone_click','email_click','availability_view','schedule_slot_selected','favorite_add','favorite_remove','profile_share','external_link_click','contact_gate_shown')
 and exists(select 1 from public.professionals p where p.id=new.professional_id and p.profile_id=new.viewer_user_id) then return null; end if;
 return new;
end $$;
revoke all on function public.skip_self_profile_interaction() from public,anon,authenticated;
drop trigger if exists skip_self_profile_interaction on public.interaction_events;
create trigger skip_self_profile_interaction before insert or update on public.interaction_events
 for each row execute function public.skip_self_profile_interaction();
notify pgrst,'reload schema';
commit;
