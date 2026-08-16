import { randomUUID } from "node:crypto";
import { getFirebaseMessaging } from "@/lib/push/firebase-admin";
import { buildFcmMulticastPayload } from "@/lib/push/payload";
import { classifyFirebaseFailure, isPushDeliveryEnabled, pushRetryAt } from "@/lib/push/retry";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_FCM_MULTICAST_TOKENS = 500;
export const MAX_PUSH_JOBS_PER_DRAIN = 100;
const DEFAULT_PUSH_JOBS_PER_DRAIN = 25;
// The route has a 60-second execution ceiling. Keep a generous lease around a
// single just-in-time claim so a replacement worker cannot overlap a request
// that is still being terminated by the platform.
const PUSH_LEASE_SECONDS = 300;
const PUSH_DRAIN_BUDGET_MS = 45_000;

export type PushOutboxJob = {
  id: string;
  notification_id: string | null;
  user_id: string;
  title: string;
  body: string;
  data: unknown;
  attempts: number;
  max_attempts: number;
};

type PushToken = {
  id: string;
  token: string;
};

type PushDelivery = {
  token_id: string;
  status: "delivered" | "failed" | "invalid";
  provider_message_id: string | null;
  error_code: string | null;
  error_detail: string | null;
};

type FinishPushJobInput = {
  outboxId: string;
  workerId: string;
  outcome: "delivered" | "retry" | "failed" | "suppressed";
  deliveries: PushDelivery[];
  errorCode?: string;
  availableAt?: string;
};

export type PushOutboxRepository = {
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<PushOutboxJob[]>;
  activeFcmTokens(userId: string): Promise<PushToken[]>;
  deliveredTokenIds(outboxId: string): Promise<Set<string>>;
  deactivateTokens(tokenIds: string[]): Promise<void>;
  finish(input: FinishPushJobInput): Promise<void>;
};

export type PushMulticastSender = (input: {
  tokens: string[];
  title: string;
  body: string;
  data: unknown;
  notificationId: string | null;
}) => Promise<Array<{ success: boolean; messageId?: string; errorCode?: string }>>;

export class PushWorkerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PushWorkerError";
  }
}

export function chunkPushItems<T>(items: T[], size = MAX_FCM_MULTICAST_TOKENS) {
  const safeSize = Math.min(MAX_FCM_MULTICAST_TOKENS, Math.max(1, Math.floor(size)));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
}

export function normalizePushDrainLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PUSH_JOBS_PER_DRAIN;
  return Math.min(MAX_PUSH_JOBS_PER_DRAIN, Math.max(1, Math.floor(value)));
}

export function assertPushOutboxFinished(value: unknown): asserts value is true {
  if (value !== true) throw new PushWorkerError("push_outbox_lease_lost");
}

function defaultRepository(): PushOutboxRepository {
  const db = createAdminClient();

  return {
    async claim(workerId, limit, leaseSeconds) {
      const { data, error } = await db.rpc("claim_notification_push_outbox", {
        p_worker_id: workerId,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new PushWorkerError("push_outbox_claim_failed");
      return (data ?? []) as PushOutboxJob[];
    },

    async activeFcmTokens(userId) {
      const { data, error } = await db
        .from("user_push_tokens")
        .select("id,token")
        .eq("user_id", userId)
        .eq("transport", "fcm")
        .eq("is_active", true);
      if (error) throw new PushWorkerError("push_tokens_read_failed");
      return ((data ?? []) as PushToken[]).filter((row) => (
        typeof row.id === "string" && typeof row.token === "string" && row.token.length > 10
      ));
    },

    async deliveredTokenIds(outboxId) {
      const { data, error } = await db
        .from("notification_push_deliveries")
        .select("token_id")
        .eq("outbox_id", outboxId)
        .eq("status", "delivered");
      if (error) throw new PushWorkerError("push_deliveries_read_failed");
      return new Set((data ?? []).map((row) => String(row.token_id)));
    },

    async deactivateTokens(tokenIds) {
      if (tokenIds.length === 0) return;
      for (const ids of chunkPushItems([...new Set(tokenIds)])) {
        const { error } = await db
          .from("user_push_tokens")
          .update({ is_active: false })
          .eq("transport", "fcm")
          .in("id", ids);
        if (error) throw new PushWorkerError("push_tokens_deactivate_failed");
      }
    },

    async finish(input) {
      const { data, error } = await db.rpc("finish_notification_push_outbox", {
        p_outbox_id: input.outboxId,
        p_worker_id: input.workerId,
        p_outcome: input.outcome,
        p_deliveries: input.deliveries,
        p_error: input.errorCode ?? null,
        p_available_at: input.availableAt ?? null,
      });
      if (error) throw new PushWorkerError("push_outbox_finish_failed");
      assertPushOutboxFinished(data);
    },
  };
}

const defaultSender: PushMulticastSender = async ({
  tokens,
  title,
  body,
  data,
  notificationId,
}) => {
  const result = await getFirebaseMessaging().sendEachForMulticast(buildFcmMulticastPayload({
    tokens,
    title,
    body,
    data,
    notificationId,
  }));
  return result.responses.map((response) => ({
    success: response.success,
    messageId: response.messageId,
    errorCode: response.error?.code,
  }));
};

export async function processClaimedPushJob(
  job: PushOutboxJob,
  workerId: string,
  repository: PushOutboxRepository,
  sender: PushMulticastSender,
) {
  try {
    const [tokens, alreadyDelivered] = await Promise.all([
      repository.activeFcmTokens(job.user_id),
      repository.deliveredTokenIds(job.id),
    ]);
    const remainingTokens = tokens.filter((row) => !alreadyDelivered.has(row.id));

    if (remainingTokens.length === 0) {
      const outcome = alreadyDelivered.size > 0 ? "delivered" : "suppressed";
      await repository.finish({ outboxId: job.id, workerId, outcome, deliveries: [] });
      return outcome;
    }

    const deliveries: PushDelivery[] = [];
    const invalidTokenIds: string[] = [];
    let successful = alreadyDelivered.size;
    let retryable = 0;

    for (const tokenChunk of chunkPushItems(remainingTokens)) {
      let responses: Awaited<ReturnType<PushMulticastSender>>;
      try {
        responses = await sender({
          tokens: tokenChunk.map((row) => row.token),
          title: job.title,
          body: job.body,
          data: job.data,
          notificationId: job.notification_id,
        });
      } catch {
        responses = tokenChunk.map(() => ({
          success: false,
          errorCode: "messaging/unknown-error",
        }));
      }

      for (let index = 0; index < tokenChunk.length; index += 1) {
        const token = tokenChunk[index];
        const response = responses[index] ?? { success: false, errorCode: "messaging/unknown-error" };
        if (response.success) {
          successful += 1;
          deliveries.push({
            token_id: token.id,
            status: "delivered",
            provider_message_id: response.messageId ?? null,
            error_code: null,
            error_detail: null,
          });
          continue;
        }

        const failure = classifyFirebaseFailure(response.errorCode);
        if (failure.invalidToken) invalidTokenIds.push(token.id);
        if (failure.retryable) retryable += 1;
        deliveries.push({
          token_id: token.id,
          status: failure.invalidToken ? "invalid" : "failed",
          provider_message_id: null,
          error_code: failure.code,
          // Never persist provider messages: they can echo registration tokens.
          error_detail: null,
        });
      }
    }

    await repository.deactivateTokens(invalidTokenIds);

    if (retryable > 0 && job.attempts < job.max_attempts) {
      await repository.finish({
        outboxId: job.id,
        workerId,
        outcome: "retry",
        deliveries,
        errorCode: "retryable_provider_failure",
        availableAt: pushRetryAt(job.attempts),
      });
      return "retried" as const;
    }

    const outcome = successful > 0 ? "delivered" : "failed";
    await repository.finish({
      outboxId: job.id,
      workerId,
      outcome,
      deliveries,
      errorCode: outcome === "failed"
        ? (retryable > 0 ? "retry_attempts_exhausted" : "permanent_provider_failure")
        : undefined,
    });
    return outcome;
  } catch (error) {
    if (error instanceof PushWorkerError && error.code === "push_outbox_lease_lost") {
      throw error;
    }
    const exhausted = job.attempts >= job.max_attempts;
    await repository.finish({
      outboxId: job.id,
      workerId,
      outcome: exhausted ? "failed" : "retry",
      deliveries: [],
      errorCode: error instanceof PushWorkerError ? error.code : "push_delivery_internal_error",
      availableAt: exhausted ? undefined : pushRetryAt(job.attempts),
    });
    return exhausted ? "failed" as const : "retried" as const;
  }
}

export async function drainPushOutbox(options: {
  limit?: unknown;
  repository?: PushOutboxRepository;
  sender?: PushMulticastSender;
} = {}) {
  const summary = {
    disabled: false,
    claimed: 0,
    delivered: 0,
    suppressed: 0,
    retried: 0,
    failed: 0,
  };
  if (!isPushDeliveryEnabled()) return { ...summary, disabled: true };

  const workerId = `push-${randomUUID()}`;
  const repository = options.repository ?? defaultRepository();
  const sender = options.sender ?? defaultSender;
  const requestedJobs = normalizePushDrainLimit(options.limit);
  const drainStartedAt = Date.now();

  // Claim immediately before processing. Pre-claiming the whole drain batch
  // lets later jobs lose their lease while earlier Firebase calls are still
  // running, which can produce duplicate sends from a second worker.
  while (
    summary.claimed < requestedJobs
    && Date.now() - drainStartedAt < PUSH_DRAIN_BUDGET_MS
  ) {
    const [job] = await repository.claim(workerId, 1, PUSH_LEASE_SECONDS);
    if (!job) break;
    summary.claimed += 1;
    const outcome = await processClaimedPushJob(job, workerId, repository, sender);
    summary[outcome] += 1;
  }

  return summary;
}
