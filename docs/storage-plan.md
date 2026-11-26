# Plan de almacenamiento de fotos (aprobado 2026-11-26)

Objetivo: quedarse en planes gratis. Cero transformaciones de Cloudflare Images y cero Cloudinary para fotos nuevas. Las fotos se achican en el navegador antes de subirlas. El servidor las vuelve a validar todas: tipo por bytes mágicos, tamaño, análisis de malware, quitar metadatos y revisar proporciones. El servidor nunca confía en el cliente.

## Qué va dónde

| Qué | Dónde | Por qué |
| --- | --- | --- |
| Foto de perfil (avatar) | R2 `contratacr-assets` (`assets.contratacr.com`): `contratacr/profiles/<usuario>/<id>.lg.jpg` (800 px JPEG) + `.sm.webp` (400 px) | El JPEG grande lo lee la tarjeta para compartir (Satori no lee WebP). Las tarjetas y listas usan la miniatura (`r2Thumb`). |
| Casos de éxito / portafolio | R2 `contratacr-assets`: `contratacr/portfolio/<usuario>/<id>.lg.webp` (1600 px WebP) + `.sm.webp` (400 px) | WebP 0,82 hecho en el navegador. La galería sirve el grande y las tarjetas la miniatura. |
| Otras fotos que pasan por `/api/upload/photo` (servicios, ofertas) | R2, mismo esquema de par: el grande queda como lo prepara `prepareImageForUpload` (JPEG) + `.sm.webp` | Todas reciben miniatura automática en `uploadPhotoFormDataWithRetry`. |
| Navegador sin codificador WebP (Safari) | El grande queda en JPEG como antes. La miniatura va en JPEG: `<id>.lg-j.<ext>` + `.sm.jpg` | La marca `-j` le dice a `r2Thumb` la extensión de la miniatura. |
| Fotos de lugares del directorio | R2 `contratacr-place-photos` (binding `PLACE_PHOTOS`): `<host supabase>/dir-places/<id>/<1600\|800\|320>.webp` (o `.jpg`) | El navegador manda las tres variantes y el servidor las valida tal como llegan (`createClientVariantsCodec`). Las fotos anteriores siguen en Supabase (`photo_store='supabase'`) hasta que se copien. |
| Fotos de anuncios Pro (`/api/pro/dir-listing-photos`) | Bucket privado de Supabase `dir-listing-photos` | Mismo esquema de variantes hechas en el navegador. |
| Fotos viejas de Cloudinary | Se quedan en Cloudinary hasta que se migren. Después: `contratacr/migrated/<sha>.lg.webp` (avatar: `.lg.jpg`) + `.sm.webp` | Las sigue sirviendo `cldThumb`/`cldLarge` (transformaciones por URL) hasta la migración. |
| Caché de datos de Next | R2 `contratacr-next-cache` | Ya existía. Hace falta una regla de ciclo de vida, ver abajo. |
| Local (`supabase start`, sin variables R2) | Bucket público local `local-uploads` | Así una subida local nunca llega a Cloudinary ni a R2 (`src/lib/media/local-upload-store.ts`). |

Reglas:

- Solo se reescriben las URL con la marca `.lg.` / `.lg-j.`. Las R2 anteriores sin miniatura se sirven tal cual. Ver `src/lib/r2-image-url.ts`.
- Una subida sin variantes (navegador viejo, o uno que no pudo decodificar la foto) en el Worker se rechaza con un mensaje claro: "Su navegador no pudo preparar esta foto…" (`browser_prep`). Desde el 2026-11-26 no hay códec de servidor en el Worker. En local se usa sharp. Si algún día hace falta, ahí se puede agregar un códec WASM (`pickPhotoCodec`).
- `next.config.ts` usa `images.unoptimized: true`. OpenNext sirve el original cuando falta el binding `IMAGES` (`node_modules/@opennextjs/cloudflare/dist/cli/templates/images.js`). Por eso el binding `images` se quitó de `wrangler.jsonc`.
- Límite conocido: el servidor revisa formato, tamaño, proporciones y metadatos de la miniatura y de las variantes, pero no compara el contenido. Un cliente alterado podría emparejar dos imágenes distintas. A la miniatura de perfil y de portafolio también se le corre `scanUpload`. A las variantes de lugares no: las fotos de otras personas pasan por moderación.

## Pasos únicos en el panel de Cloudflare (los hace el dueño)

1. **Regla de caché para `assets.contratacr.com`**: Caching → Cache Rules → Create rule. Condición: Hostname igual a `assets.contratacr.com`. Acción: Eligible for cache / **Cache Everything**, Edge TTL "Respect origin" (los objetos llevan `Cache-Control: public, max-age=31536000, immutable`) y Browser TTL "Respect origin".
2. **Regla de ciclo de vida en `contratacr-next-cache`**: R2 → `contratacr-next-cache` → Settings → Object lifecycle rules → Add rule. Prefijo vacío (todo el bucket). Borrar objetos 30 días después de subidos. Las claves llevan el id del build, así que lo viejo nunca se vuelve a leer.
3. Antes de desplegar, confirmar que el bucket `contratacr-place-photos` existe. Ya se creó el 2026-11-26, y wrangler no despliega un binding sin su bucket.

## Migraciones (corren en simulación por defecto; no se corren desde agentes)

Las variables van en un archivo privado fuera de Git. Ver la cabecera de cada script.

```sh
# 1) Cloudinary → R2: lista filas y URL (simulación), después aplica
node --env-file=/private/r2-migration.env scripts/storage/migrate-cloudinary-to-r2.mjs
MIGRATION_REPORT=/private/cld-r2.json node --env-file=/private/r2-migration.env scripts/storage/migrate-cloudinary-to-r2.mjs --apply

# 2) Fotos de lugares Supabase → R2 (photo_store='r2' solo tras verificar sha256 de las tres variantes)
node --env-file=/private/r2-place.env scripts/storage/copy-place-photos-to-r2.mjs
COPY_REPORT=/private/place-r2.json node --env-file=/private/r2-place.env scripts/storage/copy-place-photos-to-r2.mjs --apply
```

- Las dos son idempotentes. Se pueden volver a correr y siguen donde quedaron. Ninguna borra los originales (ni en Cloudinary ni en Supabase): eso se hace a mano cuando el informe esté verificado.
- `migrate-cloudinary-to-r2` deja sin tocar las filas de `professionals` con elementos antiguos sin actividad registrada. Si las tocara, el disparador avisaría a los seguidores. Esas filas aparecen en `skipped`.
- La migración pide dos derivados por foto a Cloudinary (grande y 400 px). Eso consume transformaciones del plan de Cloudinary una sola vez.
- Pruebas: `node --test scripts/storage/lib.test.mjs scripts/storage/photo-storage.test.mjs`.
