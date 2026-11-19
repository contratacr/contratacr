-- LOCAL PRO ONLY. Round 7B (Houzz parity: change orders). Adds to the existing change flow
-- (pro_work_changes_mutate, unchanged signatures and rules):
--  * per line, optional quantity (qtyMilli), unit cost (unitCostCents) and markup (markupBps); when
--    all three are given the line amount must be exactly round(qty × cost × (1 + markup)), so the
--    customer total still comes only from amountCents (same agreement formula, no double counting);
--  * per change, optional schedule impact in days (scheduleDays 0..365) carried in the propose input;
--  * when the change is accepted (customer, or the owner recording an external approval), the plan
--    of the job moves: the tasks that end last get their planned end pushed by those days, once,
--    and the schedule revision is bumped (CAS readers reload). Immutable: the days and the shift are
--    recorded on the change row and never re-applied.
-- Triggers run inside the mutate transaction: any invalid detail raises 22023 and nothing is kept.
begin;
alter table public.pro_work_changes add column if not exists schedule_days integer not null default 0;
alter table public.pro_work_changes add column if not exists schedule_applied_at timestamptz;
alter table public.pro_work_changes add column if not exists schedule_shifted_tasks integer not null default 0;
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_work_changes_schedule_days_check') then
  alter table public.pro_work_changes add constraint pro_work_changes_schedule_days_check check(schedule_days between 0 and 365);
 end if;
end$$;

create or replace function public.pro_work_change_lines_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare line jsonb;keys text[];q numeric;cost numeric;markup numeric;expected numeric;
begin
 for line in select value from jsonb_array_elements(new.lines) loop
  select array_agg(k order by k) into keys from jsonb_object_keys(line) k;
  if not keys<@array['amountCents','description','markupBps','qtyMilli','unitCostCents'] then raise exception 'Invalid change line fields' using errcode='22023';end if;
  if line?'qtyMilli' and (jsonb_typeof(line->'qtyMilli') is distinct from 'number' or (line->>'qtyMilli')::numeric<>round((line->>'qtyMilli')::numeric) or (line->>'qtyMilli')::numeric not between 1 and 1000000000) then raise exception 'Invalid change quantity' using errcode='22023';end if;
  if line?'unitCostCents' and (jsonb_typeof(line->'unitCostCents') is distinct from 'number' or (line->>'unitCostCents')::numeric<>round((line->>'unitCostCents')::numeric) or (line->>'unitCostCents')::numeric not between 0 and 10000000000) then raise exception 'Invalid change cost' using errcode='22023';end if;
  if line?'markupBps' and (jsonb_typeof(line->'markupBps') is distinct from 'number' or (line->>'markupBps')::numeric<>round((line->>'markupBps')::numeric) or (line->>'markupBps')::numeric not between 0 and 100000) then raise exception 'Invalid change markup' using errcode='22023';end if;
  if (line?'qtyMilli' or line?'unitCostCents' or line?'markupBps') and not(line?'qtyMilli' and line?'unitCostCents' and line?'markupBps') then raise exception 'Quantity, cost and markup go together' using errcode='22023';end if;
  if line?'qtyMilli' then
   q:=(line->>'qtyMilli')::numeric;cost:=(line->>'unitCostCents')::numeric;markup:=(line->>'markupBps')::numeric;
   expected:=round(q*cost*(10000+markup)/10000000);
   if abs((line->>'amountCents')::numeric)<>expected then raise exception 'Change line amount does not match quantity, cost and markup' using errcode='22023';end if;
  end if;
 end loop;
 return new;
end $$;
drop trigger if exists pro_work_change_lines_guard on public.pro_work_changes;
create trigger pro_work_change_lines_guard before insert on public.pro_work_changes for each row execute function public.pro_work_change_lines_guard();

-- The propose input is kept (immutable) in pro_work_change_actions; its scheduleDays goes to the row.
create or replace function public.pro_work_change_schedule_days() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare days numeric;
begin
 if new.input->>'action'<>'propose' or not(new.input?'scheduleDays') then return new;end if;
 if jsonb_typeof(new.input->'scheduleDays') is distinct from 'number' then raise exception 'Invalid schedule impact' using errcode='22023';end if;
 days:=(new.input->>'scheduleDays')::numeric;
 if days<>round(days) or days not between 0 and 365 then raise exception 'Invalid schedule impact' using errcode='22023';end if;
 update public.pro_work_changes set schedule_days=days::integer where owner_id=new.owner_id and id=(new.input->>'id')::uuid and status='proposed' and schedule_days=0;
 return new;
end $$;
drop trigger if exists pro_work_change_schedule_days on public.pro_work_change_actions;
create trigger pro_work_change_schedule_days after insert on public.pro_work_change_actions for each row execute function public.pro_work_change_schedule_days();

-- Acceptance moves the plan once: the tasks that finish last are extended by the days.
create or replace function public.pro_work_change_apply_schedule() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare last_end date;shifted integer:=0;
begin
 if new.status<>'accepted' or old.status='accepted' or new.schedule_days=0 or new.schedule_applied_at is not null then return new;end if;
 select max(planned_end) into last_end from public.pro_work_schedule_plans where owner_id=new.owner_id and work_id=new.work_id and planned_end is not null;
 if last_end is not null and last_end+new.schedule_days<=date'2100-12-31' then
  update public.pro_work_schedule_plans set planned_end=planned_end+new.schedule_days where owner_id=new.owner_id and work_id=new.work_id and planned_end=last_end;
  get diagnostics shifted=row_count;
  update public.pro_work_schedule_heads set revision=revision+1,updated_at=now() where owner_id=new.owner_id and work_id=new.work_id;
 end if;
 new.schedule_applied_at:=now();new.schedule_shifted_tasks:=shifted;
 return new;
end $$;
drop trigger if exists pro_work_change_apply_schedule on public.pro_work_changes;
create trigger pro_work_change_apply_schedule before update on public.pro_work_changes for each row execute function public.pro_work_change_apply_schedule();

-- Days and the applied shift are immutable once written.
create or replace function public.pro_work_change_schedule_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.schedule_days<>0 and new.schedule_days is distinct from old.schedule_days then raise exception 'Schedule impact is immutable' using errcode='22023';end if;
 if old.schedule_applied_at is not null and (new.schedule_applied_at is distinct from old.schedule_applied_at or new.schedule_shifted_tasks is distinct from old.schedule_shifted_tasks) then raise exception 'Schedule impact is immutable' using errcode='22023';end if;
 if old.status<>'proposed' and new.schedule_days is distinct from old.schedule_days then raise exception 'Schedule impact is immutable' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_work_change_schedule_immutable on public.pro_work_changes;
create trigger pro_work_change_schedule_immutable before update on public.pro_work_changes for each row execute function public.pro_work_change_schedule_immutable();

-- Reader for the change list (owner and linked customer): days and applied shift per change.
create or replace function public.pro_work_change_schedule_read(p_actor uuid,p_ids uuid[]) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(c.id::text,jsonb_build_object('scheduleDays',c.schedule_days,'scheduleApplied',c.schedule_applied_at is not null,'shiftedTasks',c.schedule_shifted_tasks)),'{}'::jsonb)
 from public.pro_work_changes c where c.id=any(coalesce(p_ids,'{}'::uuid[])) and cardinality(coalesce(p_ids,'{}'::uuid[]))<=50 and p_actor in(c.owner_id,c.client_user_id);
$$;
revoke all on function public.pro_work_change_lines_guard(),public.pro_work_change_schedule_days(),public.pro_work_change_apply_schedule(),public.pro_work_change_schedule_immutable(),public.pro_work_change_schedule_read(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.pro_work_change_schedule_read(uuid,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
