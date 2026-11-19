# Avisos administrativos sin push oportuno — diagnóstico y candidato local

1 noviembre 2026. Solo se escribe en Pro (`local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`). Main se consultó en lectura, HEAD abreviado `50d58cd9`; no se modificaron main/mobile, CI, tiendas, credenciales, registros de producción o sus estados. No se enviaron notificaciones reales ni se ejecutó manualmente el drenaje de producción.

## Causa comprobada para la captura

El texto «Hay un elemento nuevo por atender en el panel administrativo» procede de `257_avisos_admin_y_excluir_autocontactos.sql` en main. Ese disparador crea notificaciones `admin_attention` sin suprimir push; el trigger de `notifications` debe incluirlas en la outbox. El consumidor actual comprueba que el destinatario siga siendo administrador habilitado antes de buscar sus tokens.

Consulta de producción estrictamente de lectura, acotada a los diez avisos administrativos más recientes de las últimas tres horas, sin devolver cuerpos, nombres, correos, IDs de usuario o tokens:

| Hora de creación (Costa Rica, 1 noviembre) | Estado observado aproximadamente a las 3:40 p. m. | Intentos |
|---|---|---|
| 3:27:06 p. m. | `pending` | 0 |
| 3:28:47 p. m. | `pending` | 0 |

Ambos avisos tienen outbox y no habían llegado a intentar envío. Existen tokens iOS FCM activos; el registro más recientemente observado se actualizó a las 3:36:01 p. m. (`last_seen_at`, no necesariamente un token nuevo). Tener un token activo no certifica el permiso del sistema ni la recepción remota, pero para estos dos avisos el bloqueo observado ocurre antes de FCM/APNs. El icono de silencio del iPhone no explica cero intentos en el servidor.

El workflow `push-drain.yml` está declarado `*/10 * * * *`, pero las ejecuciones reales del día estuvieron separadas por horas: 7:31:41 p. m. del 31 octubre, 3:08:27 a. m., 9:11:18 a. m. y 1:46:51 p. m. del 1 noviembre (horario CR). Se revisaron solo runs de este consumidor, sin lanzar workflows ni duplicar seguimiento de regresión/tiendas del chat original.

La [ejecución 41343452050](https://github.com/contratacr/contratacr/actions/runs/41343452050), a la 1:46 p. m., confirmó OAuth listo, envío habilitado y un trabajo entregado al proveedor; después quedó sin trabajos reclamados. La anterior `41319937042` también confirmó credenciales listas. No se atribuye a esta sesión ese envío automático preexistente ni se interpreta aceptación de Firebase como confirmación visual en el teléfono. Los dos avisos de la captura se crearon después de la última ejecución observada.

Conclusión: **retraso del disparador de procesamiento**, confirmado para esos dos eventos. No falta una inserción en la cola. Tampoco está demostrado un fallo del binario iOS; no se propone recompilar o subir paquetes para arreglar esta causa de servidor. Después de resolver el procesamiento hay que observar una entrega física autorizada para cerrar el recorrido completo.

## Corrección preparada, no desplegada

`workers/push-scheduler/worker.mjs` es un programador independiente para Cloudflare. Invoca una vez por minuto el endpoint protegido **existente** `/api/internal/push/drain`; no incluye ni despliega la app Pro ni necesita mezclar sus commits con main/mobile.

- Configuración base: sin cron y `MODE=off`.
- Configuración propuesta de producción: cron cada minuto, inicialmente `MODE=check-only`. Verifica credenciales sin reclamar trabajos ni enviar.
- `MODE=deliver` solo después de autorización explícita: una petición con límite 50, timeout de 50 segundos y sin reintentos inmediatos. El endpoint existente conserva leases, recibos por token, comprobación de rol admin, reintentos y caducidad de seis horas. No se reactivan avisos históricos fallidos/suprimidos.
- Único destino admitido: origen HTTPS exacto `https://contratacr.com`; no se siguen redirecciones. Se requiere un secreto de servidor de al menos 32 caracteres que coincida con `PUSH_WORKER_SECRET` o `CRON_SECRET` aceptado por el backend. No se añade el valor al repositorio ni al informe.
- El Worker no expone un drenaje público: HTTP responde 404. Solo el evento de calendario usa la credencial.
- Registro de totales acotados y códigos internos; nunca destinatarios, tokens, mensajes, respuestas de proveedor o secretos. Configuración inválida, credenciales fallidas, envío deshabilitado y respuestas incompatibles producen error visible, no un verde engañoso.
- La cadencia propuesta reduce la dependencia de GitHub Actions. No equivale a un SLA ni elimina todas las causas posibles de fallos del teléfono o del proveedor. Con un cupo de 50 y el presupuesto temporal del backend, una cola mayor requiere varias ejecuciones y supervisión.

Referencias primarias: [Cron Triggers de Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/) y [Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/). La configuración de este candidato se distingue del comportamiento observado de GitHub.

## Pruebas

- `node --test scripts/verify-push-scheduler.mjs`: **8/8 PASS**, `/tmp/pro-push-scheduler-tests.log`. Modo apagado sin red, origen/secreto, checkOnly, límite/destino, redirects/errores, contadores inválidos, sanitización y ausencia de endpoint público. Fetch simulado: cero llamadas de envío reales.
- Contratos existentes de outbox: **12/12 PASS**, `/tmp/pro-push-scheduler-consumers-final.log`. Leases, secuencia, reintento parcial sin repetir tokens entregados, compatibilidad, cierre de sesión y rechazo de invitado al drenaje. Servidor loopback con `PUSH_DELIVERY_ENABLED=false`. El primer intento tuvo 11 aprobadas y una conexión rechazada porque el servidor local estaba apagado; se arrancó explícitamente con envío deshabilitado y se repitió el fichero sin cambiar aserciones.
- Wrangler `deploy --dry-run --env production`: PASS, `/tmp/pro-push-scheduler-build.log`, paquete 2,94 KiB. **No fue un despliegue**. Bindings mostrados: origen público y `MODE=check-only`, sin secretos.
- ESLint focal, UTF-8 y `git diff --check`: PASS. No se tocaron cabeceras, esquema de negocio, autenticación de usuarios ni código nativo; no se repiten tiendas, pruebas físicas o suites ajenas.

## Paso pendiente de autorización

Para corregir el servicio real hace falta autorizar el despliegue del programador independiente y su activación de entrega. Esa activación procesaría **avisos vigentes pendientes y nuevos**, con los destinatarios y controles actuales; no es una prueba ficticia. La regla previa de no enviar notificaciones reales continúa vigente, por lo que aquí no se activó.

Con autorización: verificar origen/secretos sin divulgarlos, desplegar primero check-only, confirmar su ejecución, activar entrega, observar estados acotados y confirmar recepción del propietario. Mantener reversión a `off`, revisar la convivencia del programador anterior como respaldo y avisar al chat que conserva la operación de main/CI. No editar esos checkouts ni deshabilitar jobs sin autorización específica. No prometer corrección en producción antes de esa verificación.
