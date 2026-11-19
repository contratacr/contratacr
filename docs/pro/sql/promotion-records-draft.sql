-- LOCAL ONLY. No remote migration has been created or applied.
-- Diffusion is an immutable admin audit event, not a subscription quota.
create unique index if not exists pro_promotion_request_unique
on public.pro_audit ((detail->>'requestId'))
where action='publication_promotion';
