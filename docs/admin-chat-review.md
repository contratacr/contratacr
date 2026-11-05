# Seguimiento y revisión de conversaciones

Requiere aplicar las migraciones 260 y 261 antes de usar las nuevas secciones.
No se habilitan revisores automáticamente ni se modifican permisos existentes de participantes.

## Alcance

`/admin/conversaciones` muestra únicamente nombres, dirección de la espera y fechas.
Se calcula el primer mensaje del turno actual, ignorando mensajes eliminados para todos;
leer no cuenta como responder. Solo incluye conversaciones abiertas entre cuentas activas.
WhatsApp, llamadas, correo y cuentas sin chat interno no pueden comprobarse aquí.
No debe utilizarse para afirmar incumplimiento o evaluar automáticamente profesionales.

## Contenido restringido

La API y las funciones SQL exigen administrador activo y MFA AAL2. Para leer contenido,
la cuenta debe tener además una autorización explícita en `admin_chat_reviewers`.
La migración deja esa tabla vacía. Salud operativa incluye gestión auditada de permisos
para administradores con los tres ámbitos (moderación, soporte e identidad). No se
concede lectura de chats automáticamente.

Cada página de 50 mensajes requiere el UUID de un caso de soporte abierto/en proceso de
uno de los participantes o un reporte abierto de un participante vinculado a esa
conversación y un motivo de 15–500 caracteres. Se exige exactamente uno de los dos.
Un reporte anónimo sobre un perfil no habilita leer conversaciones ajenas.
El administrador debe comprobar que el caso justifica revisar esa conversación concreta.
El control de pertenencia del caso no prueba por sí solo esa justificación.

La auditoría y recuperación se realizan en una transacción: si falla el registro no se
devuelve contenido. `admin_chat_access_log` conserva actor, fecha, conversación, caso,
motivo y paginación; no copia mensajes. Sus registros pueden consultarse por el operador
autorizado con acceso a base de datos. La app no concede UPDATE/DELETE del registro a
usuarios ni a service_role. El propietario de la base conserva sus facultades técnicas.
La purga conserva casos abiertos o resueltos recientemente y elimina historial cerrado
con más de 365 días. Usa pg_cron si está disponible; Salud avisa si no hay evidencia
de ejecución. Los retiros activos se mantienen separados del historial eliminado.

Adjuntos y URLs privadas quedan excluidos. Mensajes eliminados para todos no se recuperan.
No se actualizan recibos de lectura, no se envían mensajes ni notificaciones y las
respuestas HTTP usan `private, no-store`. El visor no guarda contenido en almacenamiento
local; cerrar cancela la petición y retira el contenido mostrado.

## Publicación y privacidad

Revisar la base jurídica y el aviso de privacidad antes de activar acceso a chats históricos.
Un cambio de política o una casilla de aceptación general no legitiman automáticamente
cualquier consulta. La política ES/EN describe finalidad, autorización adicional y auditoría.

## Moderación y salud operativa

La cola conserva reportes resueltos, prioridad, responsable, decisión, solicitud de
revisión e historial. Retirar proyectos, empleos, promociones, reseñas y perfiles
conserva el estado anterior para restaurarlo. El autor no puede volver a publicar
contenido retirado, tampoco por rutas service_role. Las restricciones de cuenta
caducan (máximo 30 días) y bloquean nuevas publicaciones y mensajes sin borrar cuentas.
Las fotos de portafolio también admiten retiro/restauración. Cada acción exige motivo
y auditoría transaccional. Las señales de spam o reincidencia requieren revisión humana.
El afectado consulta sus decisiones y solicita revisión desde Soporte. Una advertencia
sin caso queda en el expediente interno; para comunicar la decisión se resuelve el
reporte con su motivo. Evitar datos privados en motivos visibles al afectado.

Los adjuntos denunciados solo se ponen en cuarentena tras comprobar que pertenecen
al chat reportado. Se bloquean nuevos enlaces y lecturas directas autenticadas. Un
enlace firmado anterior puede conservar validez hasta su expiración (una hora).

El análisis antivirus requiere servicio HTTPS y `FILE_SCAN_URL` + `FILE_SCAN_SECRET`.
Sin ambos, Salud muestra configuración pendiente; no se afirma análisis activo. Con
configuración, respuesta no limpia, caída o error rechaza la subida. No se configura
un proveedor ni se envían archivos reales en pruebas; siguen las validaciones de formato.

Salud distingue cero incidencias de datos no disponibles. Resume push/correo, errores,
eliminaciones, reportes antiguos, cuarentena y conservación, sin reenviar fallidos ni
exponer tokens o mensajes. La cola no certifica recepción física en el teléfono.

## Validación autorizada

Base main/test: 99328bd73a0c373e2c268170d3561ea502804b60. Se preserva la corrección
anterior de comillas. La autorización actual incluye pruebas y push. La selección y
evidencia local están en `/tmp/ccr-admin-moderation-selection.txt` y archivos asociados.
Se prueba SQL real en PostgreSQL aislado (PGlite), contratos de API, componentes React
reales en Chromium escritorio/móvil y WebKit móvil, tipos, lint, texto e inventario.
Los dobles usan datos sintéticos y no certifican la integración de una base remota.
CI cubre el esquema completo y recorridos autenticados en el entorno aislado. No se
leen chats reales, crean semillas de producción ni envían notificaciones para validar.
