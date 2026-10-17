# Idioma de enlaces compartidos — 17 de octubre de 2026

Los perfiles cortos, incluyendo la forma anterior con @, y los enlaces cortos de empleos, proyectos, promociones y cotizaciones se resuelven en español. No dependen de Accept-Language, NEXT_LOCALE ni de la cookie de elección manual. Mantienen sus parámetros, incluido tab=resenas. Las rutas explícitas /en/ siguen siendo inglesas.

La imagen del perfil traduce los servicios asociados al catálogo con el idioma de la ruta, igual que el título de sus metadatos. Los textos libres escritos por profesionales conservan su contenido; no se traducen automáticamente.

El aviso al intentar contactar el perfil propio usa «Desde aquí, los clientes pueden escribirte para coordinar», compatible con WhatsApp y mensajes internos, con equivalente en inglés.

Validación: seis casos ejecutando el middleware real: perfiles cortos y anteriores, enlaces de empleos/proyectos/promociones con navegador y cookies inglesas, conservación de parámetros y ruta inglesa explícita. Se incorporan al smoke de push. TypeScript, UTF-8 y contrato de marca comprobados. Las tarjetas ya guardadas en la caché de una red social pueden conservar temporalmente el contenido anterior; no se reescriben mensajes ya enviados.
