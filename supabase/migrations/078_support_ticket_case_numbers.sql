-- 078_support_ticket_case_numbers.sql
-- Human-readable, unique support case numbers.
-- The UUID remains the real primary key; `case_number` is the public/admin reference
-- shown as SUP-YYYY-1001, SUP-YYYY-1002, etc.

create sequence if not exists public.support_ticket_case_number_seq start with 1001;

alter table public.support_tickets
  add column if not exists case_number bigint;

with ordered as (
  select
    id,
    row_number() over (order by created_at asc, id asc) + 1000 as next_case_number
  from public.support_tickets
  where case_number is null
)
update public.support_tickets t
set case_number = ordered.next_case_number
from ordered
where t.id = ordered.id;

select setval(
  'public.support_ticket_case_number_seq',
  greatest(
    coalesce((select max(case_number) from public.support_tickets), 1000),
    1000
  ),
  true
);

alter table public.support_tickets
  alter column case_number set default nextval('public.support_ticket_case_number_seq'),
  alter column case_number set not null;

create unique index if not exists support_tickets_case_number_key
  on public.support_tickets (case_number);

notify pgrst, 'reload schema';
