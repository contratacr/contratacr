# Vista del cliente configurable (familia 33) — 2026-11-10

Solo checkout Pro, rama `local/pro-suite-no-push`. Sin push, despliegue, envíos ni cambios en otros checkouts.

## Referencia

- [How to Customize the Client Dashboard](https://pro.houzz.com/pro-help/r/how-to-customize-the-client-dashboard): menú de secciones con interruptores, widgets (vídeo, bloque de texto, clima), cabecera con datos de empresa y portada, vista previa.
- [How to Preview and Share the Client Dashboard](https://pro.houzz.com/pro-help/r/how-to-preview-and-share-the-client-dashboard): vista previa, compartir por correo o enlace anónimo de un año, publicación por función y retiro de acceso.
- Sesión de Safari de Isaac en *Edit Client Dashboard* (proyecto de ejemplo), leída después con capturas y con el árbol de accesibilidad: ver `houzz-live-structure-2026-11-10.md`. La comparación es estructural; no es una réplica visual píxel a píxel.

## Implementado y verificado localmente

- SQL `docs/pro/sql/client-dashboard-local.sql`, registrado en el manifiesto después de sus dependencias. Tabla `pro_client_dashboards` por propietario y trabajo, historial inmutable, recibos idempotentes por `actionId`, revisión optimista (409), RLS cerrada y RPC solo para `service_role`. La elegibilidad del dueño usa `pro_private_work_tools_enabled`.
- API `/api/pro/client-dashboard` (solo development): GET `workId` (dueño), GET `requestId` (cliente vinculado), POST mutación acotada a 16 KiB, con revisión de origen y límite de frecuencia.
- Nueva pestaña **Vista del cliente** en el expediente del trabajo: interruptores para Avances, Resúmenes del día y Archivos compartidos; mensaje de bienvenida de hasta 1000 caracteres; vista previa; historial de 20 cambios; reintento de la misma operación cuando el resultado es incierto.
- En Mis proyectos el cliente ve el mensaje arriba y solo las secciones activas. Sin configuración guardada, se mantiene la vista anterior con todo visible.

## Decisiones

- **Ocultar no es revocar.** Igual que en Houzz, apagar una sección cambia solo la presentación. Las versiones y archivos ya compartidos conservan sus propios permisos y APIs.
- **Siempre visibles:** cotizaciones, extras y cambios, y constancia final, porque pueden requerir una respuesta del cliente. Además se renderizan fuera de la carga de configuración, así que un fallo no las bloquea.
- **Sin enlace anónimo.** Se mantiene la decisión vigente de acceso autenticado del cliente vinculado; no se replica el enlace público de un año de Houzz.
- Mientras la configuración carga o falla, las secciones configurables quedan ocultas con un botón para reintentar, para que una sección oculta nunca aparezca por un instante.

## Verificación local (2026-11-10, autorizada por Isaac)

- TypeScript del proyecto: 0 errores. ESLint de los archivos tocados y de la prueba: 0 errores y 0 advertencias, tras corregir dos lecturas de ref durante el render.
- `verify-local-preparation-manifest.mjs`: PASS (98 módulos, 99 pasos, 108 dependencias).
- SQL aplicado **solo** a la base local de 127.0.0.1, dos veces seguidas sin error (idempotente), con las mismas protecciones de loopback del preparador. No se reinstalaron los demás módulos.
- Prueba nueva `tests/e2e/pro-client-dashboard.spec.ts`: **4/4 PASS** (ES/EN en Chromium escritorio y en WebKit móvil). Cubre:
  - valores por defecto y lectura del cliente;
  - 400 por campo extra o texto largo, repetición idempotente, `actionId` reutilizado con otro contenido (400), revisión vieja (409), «sin cambios» (400) y origen ausente (403);
  - el cliente no puede escribir (403); un tercero no puede leer (404 y 403);
  - el avance compartido sigue legible por API aunque esté oculto;
  - en la interfaz: editor, vista previa, guardado, historial, recarga, mensaje e inclusión y exclusión real de la sección para el cliente, sin desbordamiento horizontal;
  - las notificaciones y la cola de push quedan iguales.
  - Capturas revisadas: editor y vista del cliente en WebKit móvil ES.
- Regresión vecina: `pro-appointment-requests.spec.ts` y el caso API de `pro-work-updates.spec.ts` pasan. Los dos casos de interfaz de `pro-work-updates.spec.ts` (ES/EN) **fallan también sin estos cambios**: se retiró temporalmente la integración, se repitió el caso ES con el mismo fallo y se restauraron los archivos, comprobados con `cmp`. Tras cancelar «Compartir con cliente», la prueba vuelve a pulsar un botón del menú `<details>`, que ya se cerró. Es un fallo previo, no causado por este incremento.

## Límites y pendientes

- No sobrevive a una recarga a mitad de un guardado incierto: el reintento con el mismo `actionId` está en memoria, no en el almacenamiento durable que usan otros editores.
- El mensaje aparece debajo de los datos de la cita, no en una cabecera propia como en Houzz.
- Faltan los widgets de vídeo y clima, la portada y la tarjeta de empresa, ocultar documentos individuales, el aviso cuando el cliente abre la vista, el menú lateral por función y mensajes dentro de la vista.
- La estructura observada en Houzz está en `houzz-live-structure-2026-11-10.md`.

## Comparación visual antes y después (2026-11-23, fila 33)

- Dueño: en «Vista del cliente» del trabajo, bloque «Comparación antes y después»: elige dos fotos JPG de los Archivos del trabajo, título y leyenda opcionales, hasta 20 activas; edita, archiva y restaura; historial inmutable (`pro_work_file_comparison_events`, migración 412).
- «Visible para el cliente» es solo presentación (como las carpetas compartidas): respeta «Archivos y fotos» y no concede ni revoca accesos; archivar la deja no visible.
- Cliente y vista previa «como cliente»: sección «Antes y después» con visor deslizador accesible (control nativo: teclado, ratón, táctil) y modo «Lado a lado». Cada imagen y descarga sale de `/api/pro/work-file-comparisons` y se reautoriza en cada lectura (sin URL pública); foto en papelera, oculta individualmente, «Archivos y fotos» apagado o comparación archivada la retiran al instante.
- Una foto usada en una comparación no se elimina definitivamente (el organizador la conserva en la papelera).
- Spec: `tests/e2e/pro-before-after.spec.ts` (necesita Supabase local; aún no corrido en este Mac).
