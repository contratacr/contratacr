import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// La caché de datos de Next vive en R2 (ver wrangler.jsonc). Antes no había
// ninguna configurada: `unstable_cache` no guardaba nada en Cloudflare.
//
// Con OTRO NOMBRE a propósito: con el nombre de fábrica, el despliegue intenta
// «precargar» el bucket con las páginas estáticas, y eso pide permiso de R2 al
// token de GitHub (que no lo tiene). Esta app no tiene páginas estáticas que
// precargar: la caché se llena sola en la primera visita.
// Mismo objeto (sus métodos viven en el prototipo), otro nombre.
const cacheEnR2 = Object.assign(Object.create(Object.getPrototypeOf(r2IncrementalCache)), r2IncrementalCache, { name: "contratacr-r2-cache" }) as typeof r2IncrementalCache;

export default defineCloudflareConfig({
  incrementalCache: cacheEnR2,
});
