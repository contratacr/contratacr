import { cache } from "react";
import { revalidateTag } from "next/cache";
import { withPromiseTimeout } from "@/lib/promise-timeout";

type Bucket = { get(key: string): Promise<{ text(): Promise<string> } | null>; put(key: string, value: string): Promise<unknown> };
async function bucket(): Promise<Bucket | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context.env as { NEXT_INC_CACHE_R2_BUCKET?: Bucket }).NEXT_INC_CACHE_R2_BUCKET ?? null;
  } catch { return null; }
}
function key() {
  return `professional-revision/v1/${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname}`;
}
/** R2 is strongly consistent; a new revision makes older cached reads unreachable.
 * Cloudflare has an R2 incremental cache but no Next tag-cache binding. Node
 * development uses native tag invalidation. React deduplicates only per request.
 */
export const professionalRevision = cache(async (): Promise<string | null> => {
  const r2 = await bucket();
  if (!r2) return "node";
  try {
    const entry = await withPromiseTimeout(r2.get(key()), 1500);
    return entry ? await entry.text() : "initial";
  } catch { return null; } // Bypass stale data when the revision cannot be read.
});
export async function invalidateProfessionalCache() {
  const r2 = await bucket();
  if (r2) await withPromiseTimeout(r2.put(key(), crypto.randomUUID()), 3000);
  else revalidateTag("public-professionals", { expire: 0 });
}
