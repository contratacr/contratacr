const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const PERMANENT_MESSAGE_CODES = new Set([
  "messaging/invalid-argument",
  "messaging/invalid-data-payload-key",
  "messaging/invalid-options",
  "messaging/invalid-payload",
  "messaging/payload-size-limit-exceeded",
]);

export type PushProviderFailure = {
  code: string;
  retryable: boolean;
  invalidToken: boolean;
};

export function normalizeFirebaseErrorCode(code: unknown) {
  if (typeof code !== "string" || !code.trim()) return "messaging/unknown-error";
  const normalized = code.trim().toLowerCase();
  return normalized.startsWith("messaging/") ? normalized : `messaging/${normalized}`;
}

/** Classify with a retry-safe default. Unknown provider and network failures
 * are retried; only documented token/payload failures are terminal. */
export function classifyFirebaseFailure(code: unknown): PushProviderFailure {
  const normalized = normalizeFirebaseErrorCode(code);
  const invalidToken = INVALID_TOKEN_CODES.has(normalized);
  return {
    code: normalized,
    invalidToken,
    retryable: !invalidToken && !PERMANENT_MESSAGE_CODES.has(normalized),
  };
}

export function pushRetryDelayMs(attempt: number, randomValue = Math.random()) {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const base = Math.min(6 * 60 * 60 * 1_000, 30_000 * (2 ** Math.min(safeAttempt - 1, 10)));
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const jitter = 0.75 + (boundedRandom * 0.5);
  return Math.round(base * jitter);
}

export function pushRetryAt(attempt: number, now = new Date(), randomValue = Math.random()) {
  return new Date(now.getTime() + pushRetryDelayMs(attempt, randomValue)).toISOString();
}

export function isPushDeliveryEnabled(value = process.env.PUSH_DELIVERY_ENABLED) {
  if (value === undefined || value.trim() === "") return false;
  return new Set(["1", "true", "on", "yes", "enabled"]).has(value.trim().toLowerCase());
}
