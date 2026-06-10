-- 041_support_status.sql
-- Simplify the support lifecycle to THREE states and let users confirm a fix.
--   open ("Pendiente") → in_progress ("En proceso") → resolved ("Resuelto")
-- "closed" is removed (it overlapped with "resolved").

-- Migrate any old 'closed' tickets into 'resolved'.
update public.support_tickets set status = 'resolved' where status = 'closed';

-- Narrow the status check to the three states.
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'resolved'));

-- When a ticket is "resolved", the user can CONFIRM the fix (finalizes it) or
-- request to REOPEN. `user_confirmed` records the confirmation.
alter table public.support_tickets add column if not exists user_confirmed boolean not null default false;

notify pgrst, 'reload schema';
