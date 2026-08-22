import "server-only";
import { buildApprovedCatalog } from "@/lib/data/approved-catalog";
import { setCategoryFeatureOverrides, setCustomCategories } from "@/lib/data/categories";

// Server-rendered pages label services through the same module registry the
// browser fills from /api/categories/approved. Without this loader a renamed
// service kept its old name in search, profiles and the home page until the
// client hydrated. Refreshed at most every 20 seconds per server instance;
// failures keep the previous catalogue.
const TTL_MS = 20_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

export function ensureServerCategoryCatalog(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = buildApprovedCatalog()
    .then((catalog) => {
      setCategoryFeatureOverrides(catalog.categoryFlags);
      setCustomCategories(catalog.categories, catalog.groups);
      loadedAt = Date.now();
    })
    .catch((error) => {
      console.warn("[categories] server catalogue not refreshed", error instanceof Error ? error.message : error);
      loadedAt = Date.now() - TTL_MS + 5_000;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
