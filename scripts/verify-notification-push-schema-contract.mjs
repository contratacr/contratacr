import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(
  path.join(root, "supabase/migrations/167_notification_push_outbox.sql"),
  "utf8",
);

for (const fragment of [
  "create unique index if not exists user_push_tokens_active_transport_token_uidx",
  "where is_active = true",
  "create or replace function public.register_user_push_token(",
  "create or replace function public.deactivate_user_push_token(",
  "create table if not exists public.notification_push_outbox",
  "create table if not exists public.notification_push_deliveries",
  "after insert on public.notifications",
  "new.data ->> 'push_suppressed'",
  "then 'suppressed'",
  "notification_id uuid not null",
  "auth.role() is distinct from 'service_role'",
  "push_lease_expired_after_max_attempts",
  "contratacr:push-token-registration",
  "ranked.token_rank > 10",
  "create or replace function public.claim_notification_push_outbox(",
  "create or replace function public.finish_notification_push_outbox(",
  "grant execute on function public.claim_notification_push_outbox(text, integer, integer) to service_role",
]) {
  assert.ok(migration.toLowerCase().includes(fragment.toLowerCase()), `Missing schema contract: ${fragment}`);
}

const outboxDefinition = migration.match(/create table if not exists public\.notification_push_outbox \(([\s\S]*?)\n\);/i)?.[1] ?? "";
for (const privateCopy of ["title text", "body text", "data jsonb"]) {
  assert.ok(!outboxDefinition.toLowerCase().includes(privateCopy), `Outbox must not duplicate notification PII: ${privateCopy}`);
}
assert.ok(
  /join public\.notifications as notification\s+on notification\.id = claimed\.notification_id/i.test(migration),
  "Claim RPC must fetch notification copy from the canonical notification row.",
);

const claimFields = ["id uuid", "notification_id uuid", "user_id uuid", "title text", "body text", "data jsonb", "attempts integer", "max_attempts integer"];
const claimSignature = migration.match(/create or replace function public\.claim_notification_push_outbox[\s\S]*?returns table \(([\s\S]*?)\)\s*language plpgsql/i)?.[1] ?? "";
for (const field of claimFields) {
  assert.ok(claimSignature.toLowerCase().includes(field), `Claim RPC is missing worker field: ${field}`);
}

for (const argument of ["p_outbox_id uuid", "p_worker_id text", "p_outcome text", "p_deliveries jsonb", "p_error text", "p_available_at timestamptz"]) {
  assert.ok(migration.toLowerCase().includes(argument), `Finish RPC is missing worker argument: ${argument}`);
}

console.log("Notification push schema contract verified.");
