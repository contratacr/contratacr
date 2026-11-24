-- Pro row 16 follow-up: deleting an account (or a job/task) must still cascade through the task-center comments.
-- The append-only triggers of migrations 403/437 raised on every DELETE, so an account that ever wrote a comment could
-- not be removed (auth user deletion cascades profiles -> comments). Direct deletes stay refused (trigger depth 1);
-- only deletes fired by a foreign-key cascade (depth >= 2) pass, which is how the rest of the Pro append-only tables behave.
begin;

create or replace function public.pro_task_center_comments_immutable() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' and pg_trigger_depth()>=2 then return old;end if;
 if tg_op='UPDATE' and coalesce(current_setting('pro.comment_change',true),'')='1'
  and new.owner_id=old.owner_id and new.work_id=old.work_id and new.task_id=old.task_id and new.id=old.id and new.author_id=old.author_id
  and new.author_name=old.author_name and new.mentions=old.mentions and new.created_at=old.created_at then return new;end if;
 raise exception 'Task comments are append-only' using errcode='22023';
end $$;

create or replace function public.pro_task_center_revisions_immutable() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' and pg_trigger_depth()>=2 then return old;end if;
 raise exception 'Comment revisions are append-only' using errcode='22023';
end $$;

commit;
