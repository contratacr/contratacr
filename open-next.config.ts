import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// La caché de datos de Next vive en R2 (ver wrangler.jsonc). Antes no había
// ninguna configurada: `unstable_cache` no guardaba nada en Cloudflare.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
