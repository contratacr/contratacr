import { createHash, timingSafeEqual } from "node:crypto";

function secretDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}
/** Hashing both inputs first keeps the comparison constant-size even when a
 * caller deliberately sends a secret with a different length. */
export function timingSafeSecretEqual(candidate: string | null, expected: string | undefined) {
  if (!candidate || !expected) return false;
  return timingSafeEqual(secretDigest(candidate), secretDigest(expected));
}

export function pushWorkerSecretFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers.get("x-push-worker-secret")?.trim() ?? null;
}

export function isAuthorizedPushWorkerRequest(
  request: Request,
  expected: string | Array<string | undefined> | undefined = [
    process.env.PUSH_WORKER_SECRET,
    process.env.CRON_SECRET,
  ],
) {
  const expectedSecrets = Array.isArray(expected) ? expected : [expected];
  const candidate = pushWorkerSecretFromRequest(request);
  return expectedSecrets.some((secret) => timingSafeSecretEqual(candidate, secret));
}
