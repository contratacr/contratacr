import "server-only";
import { cache } from "react";
import { getApprovedCatalog } from "@/lib/data/approved-catalog-cache";
import { getCustomCategories, setCategoryFeatureOverrides, setCustomCategories } from "@/lib/data/categories";
import { withPromiseTimeout } from "@/lib/promise-timeout";

// React shares I/O only inside the current render/request. Never keep a pending
// promise in module state: Workers cannot await another request's I/O safely.
// R2 supplies cross-request caching; each new request sees admin publications.
const catalogForRequest = cache(() => withPromiseTimeout(getApprovedCatalog(), 3_000, "catálogo de servicios: tiempo agotado"));
let ultimoCatalogoEnTexto: string | null = null;

function install(raw: string) {
  const catalog = JSON.parse(raw) as Awaited<ReturnType<typeof getApprovedCatalog>>;
  setCategoryFeatureOverrides(catalog.categoryFlags);
  setCustomCategories(catalog.categories, catalog.groups);
}

export async function ensureServerCategoryCatalog(): Promise<void> {
  try {
    const catalog = await catalogForRequest();
    const raw = JSON.stringify(catalog);
    // The client and server receive the exact same catalogue. Avoid resetting
    // the registry when nothing changed; restore it after a development reload.
    if (raw !== ultimoCatalogoEnTexto || getCustomCategories().length === 0) install(raw);
    ultimoCatalogoEnTexto = raw;
  } catch (error) {
    console.warn("[categories] server catalogue not refreshed", error instanceof Error ? error.message : error);
    // Keep the last completed value on transient failure, never cache a partial
    // database result or leave every future request waiting on a failed promise.
    if (ultimoCatalogoEnTexto && getCustomCategories().length === 0) install(ultimoCatalogoEnTexto);
  }
}

/** Same serialized registry for server prerender and client hydration. */
export async function catalogoParaElCliente(): Promise<string | null> {
  await ensureServerCategoryCatalog();
  return ultimoCatalogoEnTexto;
}
