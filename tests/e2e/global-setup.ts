import { ensureRegressionSeed, regressionAdminClient } from "./seed";

// Rate limits live in the database since 269_rate_limit_buckets (before, an in-memory
// map that every new `next start` emptied). CI runs several Playwright steps against one
// local database, so counters from an earlier step (e.g. 10 registrations per 10 min)
// leaked into the next and answered 429. Each Playwright run starts from empty buckets,
// as it did with the in-memory limiter — only on a loopback database, never on the
// shared test project or production.
async function resetLocalRateLimitBuckets() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try { host = new URL(url).hostname; } catch { return; }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) return;
  const { error } = await regressionAdminClient().from("app_rate_limit_buckets").delete().not("key", "is", null);
  if (error && !/app_rate_limit_buckets/.test(error.message)) throw new Error(`Could not reset local rate-limit buckets: ${error.message}`);
}

export default async function globalSetup() {
  if (process.env.E2E_FIXTURES_READY !== "1") return;
  await ensureRegressionSeed();
  await resetLocalRateLimitBuckets();
}
