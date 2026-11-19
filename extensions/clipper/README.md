# ContrataCR Pro · extensión «Agregar al catálogo» (borrador, no publicada)

Ronda 6D (fila 60 del registro de paridad). Andamiaje de una extensión Manifest V3 para Chrome/Edge que envía la
página de producto abierta a **Empresa › Mis artículos › Agregar desde enlace**.

## Cómo funciona
1. El usuario abre una página de producto (https) y pulsa el botón de la extensión.
2. La extensión **no lee la página** ni llama al API: solo abre `https://contratacr.com/es/dashboard/pro?tab=pro_company&empresa=articulos&clip=<enlace>`.
3. La aplicación muestra el enlace ya pegado; al pulsar «Leer enlace» (con la sesión normal del usuario, mismo origen) llama al **mismo endpoint** del botón interno,
   `POST /api/pro/catalog-clipper` con `source:"extension"`. El servidor lee solo datos públicos (Open Graph /
   schema.org) respetando `robots.txt` (en local devuelve datos de ejemplo marcados «Simulado»).
4. El dueño revisa y corrige nombre, código, costo y precio, y guarda con el escritor del catálogo.

Permisos: solo `activeTab` (leer la URL de la pestaña activa al pulsar). Sin `host_permissions`, sin scripts de
contenido, sin acceso a cookies. Esto evita CSRF entre orígenes: el endpoint exige mismo origen.

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
