-- LOCAL ONLY. Audited metadata corrections; never changes money or base snapshots.
begin;
create table if not exists public.pro_payment_metadata_changes(
 user_id uuid not null references profiles(id) on delete cascade,
 id uuid not null,canonical_id uuid not null,
 entry_id uuid,payment_id uuid,
 revision integer not null check(revision>0),
 previous_received_on date,previous_method text,previous_reference text,
 received_on date not null check(received_on>=date '1900-01-01'),
 method text not null check(method in('cash','card','transfer','sinpe','other')),
 reference text not null check(length(reference)<=160),reason text not null check(length(trim(reason)) between 1 and 160),
 actor_id uuid not null check(actor_id=user_id),changed_at timestamptz not null,
 input jsonb not null,
 primary key(user_id,id),unique(user_id,canonical_id,revision),
 foreign key(user_id,entry_id) references pro_client_entries(user_id,id) on delete cascade,
 foreign key(user_id,payment_id) references pro_invoice_payments(user_id,id) on delete cascade,
 check(canonical_id=coalesce(entry_id,payment_id) and coalesce(entry_id,payment_id) is not null)
);
create index if not exists pro_payment_metadata_history on pro_payment_metadata_changes(user_id,canonical_id,changed_at desc,id desc);
alter table pro_payment_metadata_changes enable row level security;
drop policy if exists pro_payment_metadata_owner on pro_payment_metadata_changes;
create policy pro_payment_metadata_owner on pro_payment_metadata_changes for select to authenticated using(user_id=auth.uid());
revoke all on pro_payment_metadata_changes from public,anon,authenticated;
grant select on pro_payment_metadata_changes to authenticated;
grant all on pro_payment_metadata_changes to service_role;
drop trigger if exists pro_payment_metadata_immutable on pro_payment_metadata_changes;
create trigger pro_payment_metadata_immutable before update on pro_payment_metadata_changes for each row execute function pro_invoice_payment_immutable();
create or replace function public.pro_invoice_payment_metadata(p_user uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with source as(
 select e.id,p.received_on,p.method,p.reference from pro_client_entries e left join pro_invoice_payments p on p.user_id=e.user_id and p.entry_id=e.id where e.user_id=p_user and e.id=p_id and e.kind='payment'
 union all select p.id,p.received_on,p.method,p.reference from pro_invoice_payments p where p.user_id=p_user and p.id=p_id and p.work_id is null and p.entry_id is null
 ),latest as(select * from pro_payment_metadata_changes where user_id=p_user and canonical_id=p_id order by revision desc limit 1)
 select jsonb_build_object('receivedOn',case when c.id is null then s.received_on else c.received_on end,'method',case when c.id is null then s.method else c.method end,'reference',case when c.id is null then s.reference else c.reference end,'revision',coalesce(c.revision,0)) from source s left join latest c on true limit 1;
$$;
create or replace function public.pro_payment_metadata_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare payment jsonb;metadata jsonb;result jsonb;
begin
 perform pro_payment_overview_validate_cursor(p_after);
 payment:=pro_payment_overview_row(p_user,p_id,'');if payment is null then return null;end if;
 metadata:=pro_invoice_payment_metadata(p_user,p_id);
 with matching as(select * from pro_payment_metadata_changes where user_id=p_user and canonical_id=p_id and (p_after is null or (changed_at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid)) order by changed_at desc,id desc limit 21),page as(select * from matching order by changed_at desc,id desc limit 20)
 select jsonb_build_object('payment',payment,'revision',(metadata->>'revision')::integer,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'receivedOn',received_on,'method',method,'reference',reference,'previousReceivedOn',previous_received_on,'previousMethod',previous_method,'previousReference',previous_reference,'reason',reason,'changedAt',changed_at,'actorId',actor_id) order by changed_at desc,id desc) from page),'[]'),'nextCursor',case when (select count(*) from matching)>20 then(select jsonb_build_object('at',changed_at,'id',id) from page order by changed_at asc,id asc limit 1) else null end) into result;
 return result;
end $$;
create or replace function public.pro_payment_metadata_correct(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare req uuid;canonical uuid;prior pro_payment_metadata_changes;payment jsonb;metadata jsonb;received date;new_revision integer;stamp timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 req:=(p_input->>'requestId')::uuid;canonical:=(p_input->>'id')::uuid;
 if req is null or canonical is null then raise exception 'Invalid correction identity' using errcode='22023';end if;
 select * into prior from pro_payment_metadata_changes where user_id=p_user and id=req;
 if found then if prior.input is distinct from p_input then raise exception 'Correction request changed' using errcode='40001';end if;return jsonb_build_object('id',prior.canonical_id,'revision',prior.revision);end if;
 payment:=pro_payment_overview_row(p_user,canonical,'');if payment is null then return null;end if;
 metadata:=pro_invoice_payment_metadata(p_user,canonical);
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')::numeric<0 or (p_input->>'revision')::numeric<>round((p_input->>'revision')::numeric,0) then raise exception 'Invalid correction revision' using errcode='22023';end if;
 if (p_input->>'revision')::numeric is distinct from (metadata->>'revision')::numeric then raise exception 'Payment metadata changed' using errcode='40001';end if;
 if (payment->>'reversed')::boolean then raise exception 'Reversed payment cannot be corrected' using errcode='22023';end if;
 if jsonb_typeof(p_input->'receivedOn') is distinct from 'string' or p_input->>'receivedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid received date' using errcode='22023';end if;
 received:=(p_input->>'receivedOn')::date;
 if received<date '1900-01-01' or to_char(received,'YYYY-MM-DD')<>p_input->>'receivedOn' or received>(now() at time zone 'America/Costa_Rica')::date then raise exception 'Invalid received date' using errcode='22023';end if;
 if jsonb_typeof(p_input->'method') is distinct from 'string' or p_input->>'method' not in('cash','card','transfer','sinpe','other') or jsonb_typeof(p_input->'reference') is distinct from 'string' or length(p_input->>'reference')>160 or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(trim(p_input->>'reason')) not between 1 and 160 then raise exception 'Invalid correction metadata' using errcode='22023';end if;
 if metadata->>'receivedOn' is not distinct from p_input->>'receivedOn' and metadata->>'method' is not distinct from p_input->>'method' and metadata->>'reference' is not distinct from p_input->>'reference' then raise exception 'Correction must change metadata' using errcode='22023';end if;
 new_revision:=(metadata->>'revision')::integer+1;
 select greatest(clock_timestamp(),coalesce(max(changed_at)+interval '1 microsecond','-infinity'::timestamptz)) into stamp from pro_payment_metadata_changes where user_id=p_user and canonical_id=canonical;
 insert into pro_payment_metadata_changes(user_id,id,canonical_id,entry_id,payment_id,revision,previous_received_on,previous_method,previous_reference,received_on,method,reference,reason,actor_id,changed_at,input)
 values(p_user,req,canonical,(payment->>'entryId')::uuid,case when payment->>'entryId' is null then (payment->>'paymentId')::uuid else null end,new_revision,(metadata->>'receivedOn')::date,metadata->>'method',metadata->>'reference',received,p_input->>'method',p_input->>'reference',trim(p_input->>'reason'),p_user,stamp,p_input);
 return jsonb_build_object('id',canonical,'revision',new_revision);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation or foreign_key_violation then raise exception 'Invalid metadata correction' using errcode='22023';
end $$;
revoke all on function pro_invoice_payment_metadata(uuid,uuid),pro_payment_metadata_read(uuid,uuid,jsonb),pro_payment_metadata_correct(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_payment_metadata(uuid,uuid),pro_payment_metadata_read(uuid,uuid,jsonb),pro_payment_metadata_correct(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
