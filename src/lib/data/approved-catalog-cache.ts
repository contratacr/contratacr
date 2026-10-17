import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { buildApprovedCatalog, type ApprovedCatalog } from "./approved-catalog";
import { withPromiseTimeout } from "@/lib/promise-timeout";

// Only public catalogue data. Separate projects even when they share an R2 bucket.
// No module-scoped promises: Workers must not await another request's I/O.
const TTL_MS = 20_000;
type Snapshot = { catalog: ApprovedCatalog; expiresAt: number };
type Stored = { etag: string; json(): Promise<Snapshot> };
type Bucket = {
  get(key: string): Promise<Stored | null>;
  put(key: string, value: string, options: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } }): Promise<unknown | null>;
};
const LOCAL_TAG = "approved-public-catalog";
// Node's data cache is shared by route and server-component bundles. In
// Cloudflare we use explicit R2 publication because tag cache is not configured.
const localCatalog = unstable_cache(async (project: string) => {
  void project;
  return buildApprovedCatalog();
}, ["approved-public-catalog-v1"], { revalidate: TTL_MS / 1000, tags: [LOCAL_TAG] });

async function bucket(): Promise<Bucket | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context.env as { NEXT_INC_CACHE_R2_BUCKET?: Bucket }).NEXT_INC_CACHE_R2_BUCKET ?? null;
  } catch {
    return null; // Node development and tests use completed values, never shared I/O.
  }
}
function valid(value: Snapshot | null): value is Snapshot {
  return !!value && Number.isFinite(value.expiresAt) && Array.isArray(value.catalog?.categories)
    && Array.isArray(value.catalog?.groups) && Array.isArray(value.catalog?.categoryFlags);
}

export async function getApprovedCatalog({ refresh = false } = {}): Promise<ApprovedCatalog> {
  const r2 = await bucket();
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  const key = `public-catalog/v1/${project}.json`;
  if (!r2) {
    if (refresh) revalidateTag(LOCAL_TAG, { expire: 0 });
    return localCatalog(project);
  }
  let previous: Stored | null = null;
  if (r2) {
    try {
      previous = await withPromiseTimeout(r2.get(key), 1500, "catalog-cache-read-timeout");
      const snapshot = previous ? await previous.json() : null;
      if (!refresh && valid(snapshot) && snapshot.expiresAt > Date.now()) return snapshot.catalog;
    } catch { /* A cache outage must not prevent a fresh database read. */ }
  }

  const catalog = await buildApprovedCatalog();
  const snapshot = { catalog, expiresAt: Date.now() + TTL_MS };
  {
    try {
      // A refresh that started before an admin edit must not overwrite its result.
      const written = await withPromiseTimeout(r2.put(key, JSON.stringify(snapshot), {
        onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: "*" },
      }), 1500, "catalog-cache-write-timeout");
      if (!written && refresh) {
        // Another writer won. Re-read the database against the new version,
        // rather than accepting a potentially older public request's snapshot.
        const latest = await r2.get(key);
        const fresh = await buildApprovedCatalog();
        await r2.put(key, JSON.stringify({ catalog: fresh, expiresAt: Date.now() + TTL_MS }), {
          onlyIf: latest ? { etagMatches: latest.etag } : { etagDoesNotMatch: "*" },
        });
        return fresh;
      }
    } catch (error) {
      if (refresh) throw error; // The admin wrapper reports a failed publication.
    }
  }
  return catalog;
}

export async function refreshApprovedCatalog(): Promise<void> {
  try {
    await withPromiseTimeout(getApprovedCatalog({ refresh: true }), 5000, "catalog-refresh-timeout");
  } catch (error) {
    // The edit is already persisted. Do not report it as failed (which invites
    // duplicate writes/notifications); the cache also expires after twenty seconds.
    console.error("[categories] catalogue edit saved but cache refresh failed", error instanceof Error ? error.message : error);
  }
}
