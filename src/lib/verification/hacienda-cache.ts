import { createHash } from "node:crypto";
import type { IdentityLookupResult } from "./identity-verifier";
import { withPromiseTimeout } from "@/lib/promise-timeout";

type Entry = { expires: number; result: IdentityLookupResult };
type Bucket = { get(key: string): Promise<{ json<T>(): Promise<T> } | null>; put(key: string, value: string): Promise<unknown> };
const memory = new Map<string, Entry>(); // Completed values only; never share Workers request I/O.
function key(id: string) {
  return `hacienda-lookup/v1/${createHash("sha256").update(id).digest("hex")}`;
}
async function bucket(): Promise<Bucket | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context.env as { NEXT_INC_CACHE_R2_BUCKET?: Bucket }).NEXT_INC_CACHE_R2_BUCKET ?? null;
  } catch { return null; }
}
export async function readHaciendaCache(id: string): Promise<IdentityLookupResult | null> {
  const cacheKey = key(id); let entry = memory.get(cacheKey);
  if (entry && entry.expires > Date.now()) return entry.result;
  memory.delete(cacheKey);
  try {
    const r2 = await bucket();
    const stored = r2 ? await withPromiseTimeout(r2.get(cacheKey), 1000) : null;
    entry = stored ? await stored.json<Entry>() : undefined;
    if (entry && entry.expires > Date.now() && entry.result?.provider === "hacienda_api" && typeof entry.result.found === "boolean" && entry.result.dob === null && entry.result.isAdult === false && (!entry.result.found || (typeof entry.result.fullName === "string" && !!entry.result.idType)) && !entry.result.unavailable) {
      if (memory.size >= 500) memory.clear();
      memory.set(cacheKey, entry); return entry.result;
    }
  } catch { /* Cache outages fall back to the official API. */ }
  return null;
}
export async function writeHaciendaCache(id: string, result: IdentityLookupResult) {
  if (result.unavailable) return;
  // Only name, document type and lookup outcome. No tax status, debts or activities.
  const entry: Entry = { expires: Date.now() + (result.found ? 600_000 : 60_000), result };
  const cacheKey = key(id);
  if (memory.size >= 500) memory.clear();
  memory.set(cacheKey, entry);
  try {
    const r2 = await bucket();
    if (r2) await withPromiseTimeout(r2.put(cacheKey, JSON.stringify(entry)), 1000);
  } catch { /* A failed cache write must not invalidate a real API response. */ }
}
