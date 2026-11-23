# ContrataCR Pro · extensión «Agregar al catálogo» (borrador, no publicada)

Ronda 6D (fila 60 del registro de paridad). Andamiaje de una extensión Manifest V3 para Chrome/Edge que envía la
página de producto abierta a **Empresa › Mis artículos › Agregar desde enlace**.

## Cómo funciona (v0.2)
1. El usuario abre una página de producto (https) y pulsa el botón de la extensión.
2. La extensión lee, **en el navegador del propio usuario** (`chrome.scripting` con `activeTab`, solo al pulsar), las etiquetas Open Graph y el JSON-LD de schema.org que la página ya muestra, con el mismo lector que el marcador (bookmarklet) de la aplicación.
3. Abre `https://contratacr.com/<es|en>/dashboard/pro?tab=pro_company&empresa=articulos&clip=<enlace>#clipdata=<base64url JSON, máx. 8 KB>`. El **hash nunca llega a ningún servidor**. El idioma (`es`/`en`) sale del idioma del navegador (`_locales/es`, `_locales/en`).
4. La aplicación valida el hash (`decodeClipData`), muestra los datos con la marca «Capturado desde su navegador, sin lectura del servidor» y, al pulsar «Leer enlace», los guarda con `POST /api/pro/catalog-clipper` acción `import` (mismo origen, sesión normal, `source` extensión/marcador, `mode` navegador). Si no hay hash, la aplicación lee el enlace en el servidor con el lector SSRF-seguro (`product_clipper`, apagado salvo `PRO_CLIPPER_ENABLE_FETCH=1`).
5. El dueño revisa y corrige nombre, código, costo y precio, y guarda con el escritor del catálogo.

La extensión **nunca envía nada** por sí misma ni llama al API: solo abre la aplicación. Permisos: `activeTab` y `scripting` (sin `host_permissions`, sin scripts de contenido permanentes, sin cookies).

El marcador (bookmarklet) equivalente está en Empresa › Mis artículos › Agregar desde enlace › «Capturar desde su navegador» y no requiere publicar nada.

## Probar en local (sin publicar)
1. Cambie `APP_ORIGIN` en `popup.js` a `http://127.0.0.1:3185`.
2. Chrome › `chrome://extensions` › Modo desarrollador › «Cargar descomprimida» › esta carpeta.
3. No suba esta carpeta a la Chrome Web Store sin la autorización de Isaac (requiere cuenta de desarrollador,
   política de privacidad y revisión de Google).

## Lista para publicar (requiere OK de Isaac)
- Íconos 16/48/128 generados desde `public/brand/` con `scripts/generate-primary-brand.mjs` (marca oficial).
- Política de privacidad de la extensión (solo transmite la URL activa a ContrataCR al pulsar el botón).
- Cuenta de Chrome Web Store (pago único) y, si se desea, Microsoft Edge Add-ons.
- Activar el proveedor `product_clipper` en modo real (ver guía de integraciones §17).
