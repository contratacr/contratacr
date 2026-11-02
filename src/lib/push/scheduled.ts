import { isPushDeliveryEnabled } from "./retry";

type PushScheduleEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  PUSH_WORKER_SECRET?: string;
  CRON_SECRET?: string;
  PUSH_DELIVERY_ENABLED?: string;
};

type WorkerFetch<Env, Context> = (request: Request, env: Env, ctx: Context) => Promise<Response>;

/** GitHub schedules can be delayed for hours. Drain from the deployed Worker
 * itself so database-created notices do not depend on a browser being open.
 * Workers configured for test/preview do not drain either environment. */
export async function runScheduledPushDrain<Env extends PushScheduleEnv, Context>(
  handleRequest: WorkerFetch<Env, Context>,
  env: Env,
  ctx: Context,
) {
  if (env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") !== "https://contratacr.com") return;
  if (!isPushDeliveryEnabled(env.PUSH_DELIVERY_ENABLED ?? "false")) return;
  const secret = env.PUSH_WORKER_SECRET || env.CRON_SECRET;
  if (!secret) throw new Error("push_schedule_not_configured");

  // Call the local handler, never the public network or an environment URL.
  // The existing endpoint retains auth, leases, per-token dedup and the TTL.
  const response = await handleRequest(new Request("https://contratacr.com/api/internal/push/drain", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 100 }),
  }), env, ctx);
  if (!response.ok) throw new Error("push_schedule_drain_failed");
  const result = await response.json() as { ok?: boolean; disabled?: boolean; failed?: number; retried?: number };
  if (result.ok !== true || result.disabled === true || (result.failed ?? 0) > 0 || (result.retried ?? 0) > 0) {
    // Do not echo responses: tokens, notification text and secrets stay private.
    throw new Error("push_schedule_delivery_incomplete");
  }
}
