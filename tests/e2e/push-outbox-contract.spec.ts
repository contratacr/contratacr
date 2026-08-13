import { expect, test } from "playwright/test";
import { buildFcmMulticastPayload, compactPushText, notificationPushUrl } from "../../src/lib/push/payload";
import {
  classifyFirebaseFailure,
  isPushDeliveryEnabled,
  pushRetryDelayMs,
} from "../../src/lib/push/retry";
import {
  isAuthorizedPushWorkerRequest,
  timingSafeSecretEqual,
} from "../../src/lib/push/worker-auth";
import {
  assertPushOutboxFinished,
  chunkPushItems,
  drainPushOutbox,
  processClaimedPushJob,
  type PushMulticastSender,
  type PushOutboxJob,
  type PushOutboxRepository,
} from "../../src/lib/push/worker";

test.describe("@contract push outbox safety contracts", () => {
  test("FCM payload keeps private metadata server-side and compacts visible copy", () => {
    const payload = buildFcmMulticastPayload({
      tokens: ["fcm-token-placeholder"],
      title: `  ${"T".repeat(90)}  `,
      body: `Message\n${"body ".repeat(40)}`,
      data: {
        link: "/es/dashboard/profesional?tab=notifications",
        project_id: "project-contract",
        private_note: "must-not-leave-the-server",
      },
      notificationId: "notification-contract",
    });

    expect(payload.notification?.title).toHaveLength(72);
    expect(payload.notification?.body?.length).toBeLessThanOrEqual(112);
    expect(payload.data).toEqual({
      url: "/es/dashboard/profesional?tab=notifications&project=project-contract",
      notificationId: "notification-contract",
    });
    expect(payload.android?.collapseKey).toBe("notification-contract");
    expect(payload.android?.notification?.tag).toBe("notification-contract");
    expect(JSON.stringify(payload)).not.toContain("must-not-leave-the-server");
    expect(compactPushText(" one   two ", 20)).toBe("one two");
  });

  test("push destinations stay app-relative", () => {
    expect(notificationPushUrl({ link: "https://attacker.invalid/path" })).toBe("/es/notificaciones");
    expect(notificationPushUrl({ link: "//attacker.invalid/path" })).toBe("/es/notificaciones");
    expect(notificationPushUrl(null)).toBe("/es/notificaciones");
  });

  test("provider failures distinguish dead tokens from retryable outages", () => {
    expect(classifyFirebaseFailure("messaging/registration-token-not-registered")).toEqual({
      code: "messaging/registration-token-not-registered",
      invalidToken: true,
      retryable: false,
    });
    expect(classifyFirebaseFailure("messaging/invalid-payload").retryable).toBe(false);
    expect(classifyFirebaseFailure("messaging/mismatched-credential")).toEqual({
      code: "messaging/mismatched-credential",
      invalidToken: false,
      retryable: true,
    });
    expect(classifyFirebaseFailure("messaging/server-unavailable").retryable).toBe(true);
    expect(classifyFirebaseFailure(undefined).retryable).toBe(true);

    expect(pushRetryDelayMs(1, 0)).toBe(22_500);
    expect(pushRetryDelayMs(2, 0.5)).toBe(60_000);
    expect(pushRetryDelayMs(99, 1)).toBeLessThanOrEqual(7.5 * 60 * 60 * 1_000);
  });

  test("worker secret accepts either protected header using constant-size comparison", () => {
    expect(timingSafeSecretEqual("correct horse", "correct horse")).toBe(true);
    expect(timingSafeSecretEqual("wrong", "correct horse")).toBe(false);
    expect(timingSafeSecretEqual(null, "correct horse")).toBe(false);

    const bearer = new Request("https://contratacr.com/api/internal/push/drain", {
      headers: { authorization: "Bearer correct horse" },
    });
    const dedicatedHeader = new Request("https://contratacr.com/api/internal/push/drain", {
      headers: { "x-push-worker-secret": "correct horse" },
    });
    expect(isAuthorizedPushWorkerRequest(bearer, "correct horse")).toBe(true);
    expect(isAuthorizedPushWorkerRequest(dedicatedHeader, "correct horse")).toBe(true);
  });

  test("delivery kill switch is fail-closed and needs an explicit enable", () => {
    expect(isPushDeliveryEnabled(undefined)).toBe(false);
    expect(isPushDeliveryEnabled("true")).toBe(true);
    expect(isPushDeliveryEnabled("false")).toBe(false);
    expect(isPushDeliveryEnabled("OFF")).toBe(false);
    expect(isPushDeliveryEnabled("0")).toBe(false);
  });

  test("multicast chunks never exceed Firebase's 500-token limit", () => {
    const chunks = chunkPushItems(Array.from({ length: 1_201 }, (_, index) => index), 5_000);
    expect(chunks.map((chunk) => chunk.length)).toEqual([500, 500, 201]);
    expect(chunkPushItems([1, 2], 0)).toEqual([[1], [2]]);
  });

  test("a lost outbox lease is never reported as a successful finish", () => {
    expect(() => assertPushOutboxFinished(true)).not.toThrow();
    expect(() => assertPushOutboxFinished(false)).toThrowError("push_outbox_lease_lost");
    expect(() => assertPushOutboxFinished(null)).toThrowError("push_outbox_lease_lost");
  });

  test("drain claims one job immediately before each sequential delivery", async () => {
    const previousEnabled = process.env.PUSH_DELIVERY_ENABLED;
    process.env.PUSH_DELIVERY_ENABLED = "true";
    const queuedJobs: PushOutboxJob[] = ["a", "b"].map((suffix) => ({
      id: `outbox-${suffix}`,
      notification_id: `notification-${suffix}`,
      user_id: `user-${suffix}`,
      title: "Title",
      body: "Body",
      data: {},
      attempts: 1,
      max_attempts: 4,
    }));
    const claimLimits: number[] = [];
    const repository: PushOutboxRepository = {
      claim: async (_workerId, limit) => {
        claimLimits.push(limit);
        const job = queuedJobs.shift();
        return job ? [job] : [];
      },
      activeFcmTokens: async () => [],
      deliveredTokenIds: async () => new Set(),
      deactivateTokens: async () => undefined,
      finish: async () => undefined,
    };

    try {
      const result = await drainPushOutbox({ limit: 2, repository, sender: async () => [] });
      expect(result).toMatchObject({ claimed: 2, suppressed: 2 });
      expect(claimLimits).toEqual([1, 1]);
    } finally {
      if (previousEnabled === undefined) delete process.env.PUSH_DELIVERY_ENABLED;
      else process.env.PUSH_DELIVERY_ENABLED = previousEnabled;
    }
  });

  test("partial retries skip tokens already delivered on the next lease", async () => {
    const job: PushOutboxJob = {
      id: "outbox-contract",
      notification_id: "notification-contract",
      user_id: "user-contract",
      title: "Title",
      body: "Body",
      data: {},
      attempts: 1,
      max_attempts: 4,
    };
    const tokens = [
      { id: "token-a", token: "fcm-token-a-placeholder" },
      { id: "token-b", token: "fcm-token-b-placeholder" },
    ];
    const delivered = new Set<string>();
    const finishes: Parameters<PushOutboxRepository["finish"]>[0][] = [];
    const repository: PushOutboxRepository = {
      claim: async () => [job],
      activeFcmTokens: async () => tokens,
      deliveredTokenIds: async () => new Set(delivered),
      deactivateTokens: async () => undefined,
      finish: async (input) => {
        finishes.push(input);
        for (const row of input.deliveries) {
          if (row.status === "delivered") delivered.add(row.token_id);
        }
      },
    };
    const sentTokenBatches: string[][] = [];
    let invocation = 0;
    const sender: PushMulticastSender = async ({ tokens: sentTokens }) => {
      sentTokenBatches.push(sentTokens);
      invocation += 1;
      return invocation === 1
        ? [
            { success: true, messageId: "provider-message" },
            { success: false, errorCode: "messaging/server-unavailable" },
          ]
        : [{ success: true, messageId: "provider-retry-message" }];
    };

    expect(await processClaimedPushJob(job, "worker-contract", repository, sender)).toBe("retried");
    expect(finishes[0]).toMatchObject({ outcome: "retry", errorCode: "retryable_provider_failure" });
    expect(await processClaimedPushJob({ ...job, attempts: 2 }, "worker-contract", repository, sender)).toBe("delivered");
    expect(sentTokenBatches).toEqual([
      ["fcm-token-a-placeholder", "fcm-token-b-placeholder"],
      ["fcm-token-b-placeholder"],
    ]);
  });

  test("internal drain route never accepts a guest request", async ({ request }) => {
    const response = await request.post("/api/internal/push/drain", {
      data: { limit: 1 },
    });
    expect([401, 503]).toContain(response.status());
    expect(await response.json()).toMatchObject({ ok: false });
  });
});
