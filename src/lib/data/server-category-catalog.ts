import "server-only";
import { buildApprovedCatalog } from "@/lib/data/approved-catalog";
import { setCategoryFeatureOverrides, setCustomCategories } from "@/lib/data/categories";
import { withPromiseTimeout } from "@/lib/promise-timeout";

// Server-rendered pages label services through the same module registry the
// browser fills from /api/categories/approved. Without this loader a renamed
// service kept its old name in search, profiles and the home page until the
// client hydrated. Refreshed at most every 20 seconds per server instance;
// failures keep the previous catalogue.
const TTL_MS = 20_000;
// Lo que se espera como mucho por el catálogo. Pasado ese tiempo la página sale
// con el catálogo anterior: un nombre de servicio viejo por 20 segundos es una
// molestia; una página que no termina de cargar es una caída.
const ESPERA_MAXIMA_MS = 3_000;
let loadedAt = 0;
let intentoAt = 0;

/**
 * OJO — aquí NO se comparte una promesa entre peticiones.
 *
 * Antes se guardaba la carga en curso en una variable del módulo y las demás
 * peticiones esperaban ESA promesa. En Cloudflare Workers una promesa pertenece
 * a la petición que la creó: si esa petición termina (o se cancela) antes de
 * que resuelva, la promesa se queda colgada PARA SIEMPRE, y como solo se
 * limpiaba al resolver, todas las páginas atendidas por ese proceso se quedaban
 * esperando sin fin — el 19-sep-2026 el nodo de Costa Rica sirvió una pantalla
 * gris en todas las páginas mientras el resto del mundo cargaba normal.
 *
 * Ahora cada petición hace su propia carga, con límite de tiempo. Para no
 * repetir la consulta en ráfaga, mientras alguien la intentó hace menos de 5 s
 * y ya hay un catálogo cargado, las demás siguen con el que hay.
 */
export async function ensureServerCategoryCatalog(): Promise<void> {
  const ahora = Date.now();
  if (ahora - loadedAt < TTL_MS) return;
  if (loadedAt > 0 && ahora - intentoAt < 5_000) return;
  intentoAt = ahora;
  try {
    const catalog = await withPromiseTimeout(buildApprovedCatalog(), ESPERA_MAXIMA_MS, "catálogo de servicios: tiempo agotado");
    setCategoryFeatureOverrides(catalog.categoryFlags);
    setCustomCategories(catalog.categories, catalog.groups);
    loadedAt = Date.now();
  } catch (error) {
    console.warn("[categories] server catalogue not refreshed", error instanceof Error ? error.message : error);
    // Se reintenta en unos segundos, no en cada petición.
    if (loadedAt > 0) loadedAt = Date.now() - TTL_MS + 5_000;
  }
}
