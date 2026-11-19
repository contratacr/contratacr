# Cotización desde una solicitud — contexto local

`POST /api/pro/appointment-quote-context` recibe exclusivamente `{requestId}` (UUID, cuerpo hasta 1 KB). Requiere sesión Pro activa y origen válido mediante `proApiAccess`; la ruta solo existe en desarrollo. La solicitud debe pertenecer a esa cuenta y estar solicitada, propuesta o confirmada. No busca clientes por nombre ni correo.

La acción explícita prepara o reutiliza `reservation-<client_user_id>`, el mismo contacto determinista de las reservas confirmadas. Si falta, lo normaliza con `clientSchema` y guarda mediante `pro_mutate_catalog` con revisión CAS y modo de inserción sin sobrescritura (`p_importing: true`). Solo usa el nombre conservado en la solicitud; correo, teléfono y notas quedan vacíos. No consulta datos privados de identidad. Un contacto existente se conserva íntegro, incluido su nombre enriquecido. Un contacto archivado devuelve 409; esta acción no lo restaura.

La revisión se lee antes del contacto. Ante conflicto CAS o unicidad se vuelve a leer solamente el contacto determinista: si apareció, se reutiliza; si no apareció, devuelve 409 sin reintentar una escritura sobre datos nuevos. No se modifica el JSON del workspace. La operación no crea cotizaciones ni trabajos, no acepta solicitudes y no genera mensajes, pagos o facturas.

`GET` en la misma ruta con `?requestId=<UUID>` realiza las mismas comprobaciones de propietario y estado, pero solo lee: devuelve 404 si no existe el contacto asociado y 409 si está archivado. Permite que el editor revalide el origen al abrir una URL, sin confiar en parámetros de servicio o cliente.

Ambos métodos devuelven `{requestId, clientId, service, clientName}`. `clientName` representa el contacto guardado. Solicitudes ajenas/inexistentes devuelven 404. No se incorpora SQL ni se modifica producción.

Verificación prevista: contacto nuevo y reintento exacto sin aumentar revisión, contacto enriquecido preservado, archivado rechazado, GET sin escritura, solicitud ajena/terminal denegada y concurrencia CAS sin sobrescritura. La prueba integrada y del simulador se coordina con el recorrido del editor.

Verificación aislada del handler (sin DB ni red): PASS en GET sin escritura/contacto ausente, creación, reintento sin escritura adicional, contacto enriquecido, rechazo de archivado, colisión CAS con contacto concurrente preservado, solicitud ajena y estado terminado. Esta prueba usa dobles del acceso y catálogo; no sustituye la comprobación integrada de sesión/origen/RPC. ESLint del endpoint: PASS.

Integración local completada: recorrido aprobado en Chromium escritorio/móvil y WebKit móvil; controles reales de origen, cuenta sin Pro y dueño ajeno; contactos enriquecidos preservados y archivados rechazados. Resultados y límites: `service-journey-local.md`.
