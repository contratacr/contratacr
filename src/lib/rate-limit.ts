// Lightweight in-memory fixed-window rate limiter for abuse-prone public
// endpoints (contact, support, reports, registration, cédula lookup).
//
// NOTE: this is per-instance memory — on serverless it's best-effort (a burst
// can hit multiple cold instances) and resets on redeploy. It stops simple
// floods/spam from a single client. For strong, global limits use a shared
// store (Upstash/Redis) — tracked as a follow-up.

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}

/** Returns { ok } — false when the caller exceeded `limit` requests per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel/Cloudflare set x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Convenience: enforce a limit for `bucket` keyed by client IP. Returns a 429
 *  Response when exceeded, or null when the request may proceed. */
export function enforceRateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number
): Response | null {
  const { ok, retryAfter } = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (ok) return null;
  return new Response(
    JSON.stringify({ error: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
  );
}
