// Shared fixed-window rate limiter for abuse-prone endpoints, backed by Postgres
// (public.app_rate_limit_take, docs/pro/sql/rate-limit-buckets-local.sql).
//
// Why not memory: on Cloudflare Workers every isolate has its own memory and is
// recycled at will, so a Map-based limit neither holds across instances nor
// survives a deploy. The database row is the single counter for every instance.
//
// Privacy: the database only receives HMAC-SHA256(bucket + client IP / user id /
// token digest) keyed with RATE_LIMIT_PEPPER (or, when it is not set, the server's
// SUPABASE_SERVICE_ROLE_KEY). Raw IPs, user ids or tokens are never stored.
//
// Failure policy when the limiter store cannot answer (network, missing function):
// - fail CLOSED (503, Retry-After 5) by default: public/anonymous, authentication,
//   identity, claim/OTP, payments, uploads, reviews, Q&A, reservations, reports and
//   every token-keyed bucket (enforceRateLimitKey);
// - fail OPEN (request continues, error logged) only for:
//   * telemetry buckets in FAIL_OPEN_BUCKETS (dropping them protects nothing), and
//   * per-account dashboard buckets whose name ends with the authenticated user's
//     UUID ('<route>-<uuid>', the Pro dashboard routes): the caller already passed
//     session + Pro entitlement checks, and the same database outage fails the route
//     itself. The full per-route table is in docs/pro/rate-limits.md.
//
// Tests: only under `next dev` (NODE_ENV=development) a request may send
// `x-ccr-rate-limit-namespace` to use its own buckets (re-runs do not inherit the
// previous run's counters). It is ignored in production builds; it never skips a limit.
import { createAdminClient } from "@/lib/supabase/admin";

const FAIL_OPEN_BUCKETS = new Set([
  "client-error",
  "analytics",
  "analytics-usage",
  "analytics-journey",
  "minimal-meta",
  "professional-ready",
]);
const USER_BUCKET = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAMESPACE_HEADER = "x-ccr-rate-limit-namespace";

type Verdict = { ok: boolean; retryAfter: number; unavailable?: boolean };
type AdminClient = ReturnType<typeof createAdminClient>;
let client: AdminClient | null = null;
let keyCache: { secret: string; key: CryptoKey } | null = null;

function limiterSecret(): string | null {
  const value = process.env.RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return value.length >= 32 ? value : null;
}

async function digest(text: string): Promise<string | null> {
  const secret = limiterSecret();
  if (!secret) return null;
  if (!keyCache || keyCache.secret !== secret) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache = { secret, key };
  }
  const signature = await crypto.subtle.sign("HMAC", keyCache.key, new TextEncoder().encode("ccr-rate-limit:v1:" + text));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pure helper (exported for tests): true when a store failure lets the request continue. */
export function rateLimitFailsOpen(bucket: string): boolean {
  return FAIL_OPEN_BUCKETS.has(bucket) || USER_BUCKET.test(bucket);
}

async function take(key: string, limit: number, windowMs: number): Promise<Verdict> {
  try {
    const hashed = await digest(key);
    if (!hashed) throw new Error("rate limiter secret missing");
    client ??= createAdminClient();
    const { data, error } = await client
      .rpc("app_rate_limit_take", { p_key: hashed, p_limit: Math.trunc(limit), p_window_ms: Math.trunc(windowMs) })
      .abortSignal(AbortSignal.timeout(4000));
    const verdict = data as { allowed?: unknown; retryAfter?: unknown } | null;
    if (error || !verdict || typeof verdict.allowed !== "boolean") throw new Error(error?.code || "invalid limiter reply");
    return { ok: verdict.allowed, retryAfter: Math.max(0, Number(verdict.retryAfter) || 0) };
  } catch (error) {
    // Never log the key (it may contain an IP or user id); the route name is enough.
    console.error("[rate-limit] store unavailable:", error instanceof Error ? error.message : "unknown");
    return { ok: false, retryAfter: 5, unavailable: true };
  }
}

/** Best-effort client IP from proxy headers (Vercel/Cloudflare set x-forwarded-for). */
function clientIp(req: Request): string {
  // En Cloudflare la IP real viene en cf-connecting-ip y no se puede falsear.
  // El primer valor de x-forwarded-for lo escribe quien hace la petición: con
  // él solo, bastaba inventarlo para saltarse cualquier límite.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Development-only bucket namespace for automated tests (see header comment). */
function testNamespace(req: Request): string {
  if (process.env.NODE_ENV !== "development") return "";
  const value = req.headers.get(NAMESPACE_HEADER)?.trim() ?? "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? `ns:${value}:` : "";
}

const noStore = { "Content-Type": "application/json", "Cache-Control": "no-store, private" };

function tooMany(retryAfter: number): Response {
  // no-store: a cached 429 must never be served to another client or replayed later.
  return new Response(
    JSON.stringify({ error: "Demasiadas solicitudes. Espere un momento e intente de nuevo." }),
    { status: 429, headers: { ...noStore, "Retry-After": String(Math.max(1, retryAfter)) } }
  );
}

function unavailable(): Response {
  return new Response(
    JSON.stringify({ error: "El servicio no está disponible en este momento. Intente de nuevo en unos segundos.", reason: "rate_limit_unavailable" }),
    { status: 503, headers: { ...noStore, "Retry-After": "5" } }
  );
}

function answer(verdict: Verdict, failOpen: boolean): Response | null {
  if (verdict.unavailable) return failOpen ? null : unavailable();
  return verdict.ok ? null : tooMany(verdict.retryAfter);
}

/** Enforce a limit for `bucket` keyed by client IP. Resolves to a 429 (or 503 when
 *  the store is down and the bucket fails closed) Response, or null to proceed. */
export async function enforceRateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  const verdict = await take(`${testNamespace(req)}${bucket}:${clientIp(req)}`, limit, windowMs);
  return answer(verdict, rateLimitFailsOpen(bucket));
}

/** Same limit with an explicit key chosen by the caller (for example a digest of a
 *  session cookie), independent of any client-controlled header. Always fails closed. */
export async function enforceRateLimitKey(key: string, limit: number, windowMs: number): Promise<Response | null> {
  const verdict = await take(`key:${key}`, limit, windowMs);
  return answer(verdict, false);
}
