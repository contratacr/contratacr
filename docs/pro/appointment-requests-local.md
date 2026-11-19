# Solicitudes de citas — Pro local

Implementación del 1 de noviembre de 2026 en `local/pro-suite-no-push`. Solo desarrollo: no se desplegó SQL ni se habilitó en producción. No envía notificaciones, correos o mensajes.

## Recorrido

- El perfil profesional conserva el contacto principal y ofrece «Solicitar una cita» como acción secundaria.
- El cliente elige servicio, duración (incluidos 120 minutos), lugar y un horario publicado. Si ninguno sirve, indica su preferencia sin reservar un espacio.
- La cuenta gratuita del cliente tiene «Citas»; Agenda Pro muestra las solicitudes recibidas. No hace falta que ambos instalen la aplicación.
- El profesional confirma el horario solicitado o propone otro. Una propuesta necesita aceptación del cliente. Hasta confirmar o aceptar no se crea ni se bloquea un trabajo.
- La confirmación crea un único trabajo y reutiliza el contacto asociado. Desde la solicitud se abre el trabajo y se conserva el camino de vuelta, incluso después de recargar.
- Se puede cancelar una cita futura, consultar el historial o repetir una solicitud con datos revisables. Repetir nunca envía automáticamente.

## Datos y seguridad

`appointment-requests-local.sql` agrega solicitudes, eventos y acciones idempotentes normalizados; no descarga ni migra el JSON completo del workspace. Las páginas y el historial cargan veinte registros por consulta.

Los participantes autorizados ven únicamente sus solicitudes. El API vincula la identidad a la sesión; las tablas y funciones no permiten acceso directo de anon/authenticated. La disponibilidad pública contiene solo horarios. El profesional necesita Pro activo para recibir/confirmar; el cliente no. La consulta del historial y la salida segura de solicitudes se mantienen al vencer la licencia.

Confirmar y aceptar comparten el bloqueo de agenda con las reservas existentes; comprueban de nuevo el horario dentro de la transacción. La repetición exacta de una acción devuelve su comprobante sin duplicar trabajo. Los fallos de lectura posteriores a un guardado reconocido no repiten la escritura. Los formularios privados no se guardan en almacenamiento del navegador ni se incluyen en enlaces de repetición.

Un trabajo nuevo enlazado conserva el horario/servicio/cliente acordados. Se puede completar o cancelar con historial; cambiar su acuerdo requiere cancelar y solicitar otra cita. Las reservas históricas y el API anterior mantienen su funcionamiento. No se sobrescriben datos fiscales, contactos enriquecidos, cobros o materiales existentes.

Aplicación local verificada contra loopback únicamente; comparación inmediata antes/después y de los propietarios originales tras las pruebas de navegador en `pro_workspaces`, `pro_work` y `pro_clients`: contenido idéntico.

## Validación

- TypeScript aprobó antes de generar las rutas públicas. La repetición posterior a la prueba de marca encuentra un error previo de `JobsPageContent` en el tipo generado de `/empleos`; no se modificó esa sección ni se borraron tipos para ocultarlo. ESLint focal, UTF-8, presupuesto bilingüe y contrato estático de marca: aprobados.
- PGlite aislado: permisos, estados, cancelación/completado, duración, conflictos, idempotencia, paginación, límites, expiración y conservación de datos aprobados.
- Primera serie de navegador: seis casos aprobados, solicitudes nuevas y API de reservas anteriores en Safari móvil, Chrome de escritorio y Chrome móvil. Segunda serie: seis casos aprobados, solicitud ampliada y marca en los tres navegadores; incluye regreso al origen tras recarga/pestaña nueva, inglés y etiquetas de horarios. Una ejecución focal adicional en Safari móvil aprobó y produjo la captura estable. Revisión visual corrigió horarios redundantes y una propuesta rotulada como confirmada; se añadió nombre accesible al diálogo de trabajo. Agenda, navegación, cotizaciones de cuenta gratuita y recuperación de sesión: seis casos aprobados en Chrome móvil. Formularios y MFA/aislamiento: dos casos focales aprobados después de corregir un selector ambiguo por el paquete de servicios previo y una fecha fija ya vencida; se mantienen sus aserciones. Total de consumidores: ocho casos aprobados, sin repetir los seis ya compatibles.

## Límites explícitos

No incluye entrega push, recordatorios, lista de espera automática, cobros, ubicación GPS, disponibilidad por zona ni reprogramación directa de citas confirmadas. Los horarios se interpretan en Costa Rica. El selector llega hasta noventa días y las duraciones avanzan de quince en quince minutos. No se anuncia como versión fiscal lista para emitir.

Captura revisada: [cita confirmada en Safari móvil emulado](research/2026-11-01/appointment-customer-confirmed-local.png). La app nativa instalada no se usó para escribir: esta evidencia corresponde al desarrollo local en navegador móvil emulado.


## Actualización local — 2 noviembre 2026

Se corrigió el error de tipos de Empleos y se incorporó la reprogramación acordada de citas confirmadas. Conserva el mismo trabajo y el horario original hasta que el cliente acepte; no reescribe pagos, materiales ni borradores. El cambio directo de horas sigue protegido: se utiliza el flujo explícito con historial y nueva comprobación de disponibilidad. Alcance, pruebas y límites: [Empleos y reprogramación](reschedule-and-jobs-local.md). La emisión fiscal y los avisos reales siguen fuera de esta entrega.
