# Medición de web y aplicaciones móviles

El panel Administración → Analítica → Uso de web y apps muestra por separado Web (incluye web móvil/PWA), Android e iPhone. El histórico que no tiene sistema operativo o plataforma identificados conserva su propia categoría; no se convierte artificialmente en tráfico web.

## Uso y cuentas

`UsageCapture` envía automáticamente la pantalla/ruta, la pestaña del panel, la sesión y el primer uso detectado. La sesión cambia después de 30 minutos sin actividad; reabrir en ese intervalo, StrictMode y reintentos no crean sesiones duplicadas. La entrega se serializa para compartir la cookie del visitante antes y después del inicio de sesión. El servidor obtiene la identidad autenticada; el cliente no puede elegir qué cuenta registrar.

`app_usage_events` almacena sesiones, pantallas y accesos. El informe cuenta visitantes (navegadores/dispositivos), usuarios identificados, sesiones, accesos con cuenta, pantallas, primeras ejecuciones observadas y registros. Una persona puede aparecer en más de una plataforma; estos números no se suman para obtener personas únicas globales. Las cuentas recientes se muestran solo dentro del panel de administración. Una sesión conocida vincula sus eventos anónimos al usuario cuando inicia sesión.

`app_registration_sources` registra una vez la plataforma de creación de la cuenta: los endpoints de registro cubren correo y la primera sesión autenticada cubre Google/Apple. Se excluyen cuentas creadas antes de activar esta medición; iniciar sesión en otro dispositivo o añadir modo profesional no cambia el origen. No se reconstruye un historial inexistente.

Primer uso detectado significa la primera ejecución observada desde esta actualización, no una descarga ni necesariamente una instalación nueva. Borrar los datos del dispositivo puede generar otro visitante. Las descargas agregadas se consultan en App Store Connect y Google Play Console.

## Acciones compartidas

Todos los escritores de interacciones y conversiones que reciben una petición usan el mismo contexto: `platform` (web/native) y `runtime` (web/android/ios/native_unknown). Se conservan búsquedas, vistas de perfiles, contactos por WhatsApp/teléfono/correo, mensajes, cotizaciones, favoritos, publicaciones, postulaciones, reseñas, clics de campañas y los demás eventos ya instrumentados. Los procesos sin una petición de usuario, como verificaciones ejecutadas en segundo plano, pueden quedar sin plataforma.

Las conversiones únicas se muestran separadas de las interacciones, con el sufijo «únicos», para no sumar dos veces una misma acción en una métrica. Visitas y sesiones no se insertan en la tabla de interacciones y no inflan contactos. El Pixel/CAPI de Meta conserva su política existente: esta medición interna no anuncia que Meta ya mida instalaciones ni envía eventos móviles como si fueran de un sitio web.

## Protección y comprobación

- Las tablas y funciones están cerradas a anon/authenticated; solo service_role escribe o lee el informe.
- La identidad proviene de `auth.getUser`, nunca de un ID enviado en el cuerpo.
- No se envían parámetros de autenticación, contraseñas, consultas, correos ni tokens dentro de las rutas.
- Bots y pruebas automáticas mantienen su exclusión. Las pruebas de navegador interceptan los eventos para no generar métricas reales.
- La migración 239 es aditiva e idempotente y conserva los registros existentes.
- `scripts/verify-runtime-analytics.mjs` verifica deduplicación, registro original, periodos, plataformas, permisos y eliminación de cuentas con PostgreSQL local (PGlite).
- `tests/e2e/runtime-analytics.spec.ts` verifica navegación, reanudación, expiración, privacidad de URL y envío de cookies en web/Android/iPhone.

Son cambios compartidos servidos por contratacr.com; no necesitan un nuevo binario de las tiendas para los usuarios que utilizan la aplicación conectada.
