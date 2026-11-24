-- Deleting an owner (account deletion) cascades to both pro_project_statuses and pro_work/pro_project_hub_state, but the
-- composite FK hub_state(owner_id,status_id) -> statuses(owner_id,id) had no delete action, so a project assigned to a
-- custom status blocked the whole cascade ("violates foreign key constraint pro_project_hub_state_owner_id_status_id_fkey").
-- Clear only status_id when its status disappears; owner_id stays (it is NOT NULL and the row follows its project).
begin;
alter table public.pro_project_hub_state drop constraint if exists pro_project_hub_state_owner_id_status_id_fkey;
alter table public.pro_project_hub_state
 add constraint pro_project_hub_state_owner_id_status_id_fkey
 foreign key(owner_id,status_id) references public.pro_project_statuses(owner_id,id) on delete set null(status_id);
commit;
