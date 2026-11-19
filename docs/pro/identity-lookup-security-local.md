# Consulta de identificación — endurecimiento local de Pro

1 noviembre 2026. Checkout `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo local anterior. Sin push, producción, emisión, mensajes ni consultas de identificaciones reales a Hacienda.

## Implementado

- Los formularios fiscales de clientes y borradores usan `POST /api/pro/identity-lookup`, con cuerpo pequeño, JSON estricto, una identificación y finalidad `client_billing`. No se envía la cédula en nuestra URL. GET responde 405. No se admite búsqueda por nombre ni lotes.
- El guard existente comprueba sesión del servidor, origen exacto, perfil habilitado y membresía Pro vigente; conserva MFA administrativo y la barrera de desarrollo. Además se rechaza una fila profesional suspendida. Auth metadata editable no otorga acceso. La consulta no está habilitada en producción.
- Cuotas atómicas compartidas en PostgreSQL: 20 consultas por cuenta/10 minutos, 60 por IP/10 minutos, 100 globales/minuto y 5 globales/segundo. Las denegaciones no consumen otros cupos. Si la cuota no puede consultarse, se responde 503 sin acudir a Hacienda. El 429 incluye `Retry-After`.
- Los tokens de cuenta/IP usan HMAC-SHA256 con secreto de servidor de al menos 32 caracteres (`PRO_IDENTITY_RATE_LIMIT_SECRET`, o la clave de servicio existente como respaldo). La tabla guarda únicamente token, contador y vencimiento; nunca nombre, cédula, IP en claro o UUID de cuenta. Son identificadores seudónimos, no una garantía de anonimato.
- Solo se usa la IP de `cf-connecting-ip` cuando hay contexto de Cloudflare. Fuera de ese entorno se comparte un cupo conservador de ingreso; no se acepta `X-Forwarded-For` enviado por el usuario. La configuración real del proxy deberá verificarse antes de habilitar otro entorno.
- RLS y permisos impiden a `anon`/`authenticated` leer, alterar, consumir o borrar contadores directamente. Solo el backend con rol de servicio invoca las funciones.
- Pro usa `lookup(...,{cache:false})`: no lee ni escribe la caché de registro en memoria/R2. Devuelve solamente `found`, nombre y tipo; no actividades, deudas, situación tributaria, edad ni fecha de nacimiento. No añade historial de personas consultadas. La respuesta es `no-store, private` y `no-referrer`.
- El resultado se muestra para revisión y solo se incorpora a los registros si se aplica y guarda el formulario. Los datos originales del cliente y las copias de facturas anteriores no se sustituyen al consultar. No se añadieron logs de cuerpos o resultados.
- Aviso desplegable ES/EN en el propio formulario: finalidad, destinatario Hacienda, ausencia de caché de resultados Pro, aplicación voluntaria, contadores temporales, límites de la consulta y canal existente para derechos. El enlace de privacidad abre otra pestaña para no perder una edición.

## Retención y mantenimiento local

La cuota caduca como máximo a los diez minutos. Cada consumo limpia vencidos y un trabajo local `pg_cron`, `pro-identity-quota-prune`, los elimina físicamente cada minuto, incluso sin nuevas consultas. La función de limpieza usa el mismo bloqueo que el consumo. Se verificó un registro sintético vencido: eliminado y última ejecución `succeeded`. El margen normal es hasta un minuto adicional; una avería del planificador necesita detección y reparación, no se promete eliminación instantánea ni un SLA de producción.

Solo se instaló la extensión/trabajo en la base loopback. El preparador local instala ambos SQL nuevos. No se modifican migraciones desplegables, datos de clientes ni documentos fiscales. Antes de habilitar otro entorno debe existir mantenimiento equivalente, monitorización y revisión del secreto y del ingreso confiable. Los logs del planificador contienen el comando fijo de limpieza, sin cédulas ni nombres.

## Alcance que no debe confundirse

El endpoint público **preexistente** `/api/cedula/[id]` sigue atendiendo el registro y otros consumidores anteriores; no se retiró ni se cambió su contrato para evitar romper el alta. Su caché y su limitador anterior no quedan endurecidos por este incremento. Pro dejó de depender de él, pero esto no impide que alguien conozca y utilice el endpoint público antiguo. No se presenta como cierre de la exposición global a extracción ni de la retención histórica en R2. Deben auditarse ese flujo, sus logs y objetos antiguos antes de publicar una herramienta independiente. No se borraron objetos alojados ni datos de producción.

Se mantiene el botón dentro de formularios. Esta entrega **no añade ni publica una sección independiente** ni cambia el menú Pro. La propuesta de herramienta aparte sigue condicionada a cerrar la revisión jurídica y la exposición del flujo público, no únicamente a cambiar la ubicación del botón.

## Paquete para revisión jurídica — pendiente, no enviado

Preparado para que el responsable lo revise con asesoría costarricense; no se contactó a abogados, PRODHAB ni terceros.

1. Confirmar la base jurídica y finalidad para consultar datos de terceros al prestar un servicio o facturar; no interpretar una API pública o la declaración del usuario como consentimiento universal.
2. Determinar los roles de ContrataCR y del profesional respecto a los datos de su clientela, destinatarios, encargados y condiciones de alojamiento.
3. Evaluar si corresponde inscripción ante PRODHAB según la finalidad efectiva de la base y de una herramienta independiente. Cobrar la licencia no resuelve por sí solo esa clasificación.
4. Revisar el aviso contextual y la política general antes de habilitación pública: operador real, finalidades, datos, destinatarios, conservación, seguridad, canal y ejercicio de derechos. El aviso local es borrador, no dictamen jurídico.
5. Aprobar conservación de clientes, documentos, respaldos y registro/caché antiguos, distinguiendo datos corregibles de documentos sujetos a obligaciones de conservación. No borrar o reescribir facturas históricas automáticamente para atender una solicitud.
6. Revisar el procedimiento de derechos: recibir por el canal existente, verificar legitimación de forma proporcional, identificar registros y responsables, evaluar obligaciones de conservación, responder y documentar la resolución con acceso restringido. No atender solicitudes de terceros sin comprobación ni pedir identificaciones/documentos por este chat. El plazo aplicable y las excepciones deben incorporarse al procedimiento aprobado.

Fuentes oficiales consultadas el 1 noviembre 2026: [API Hacienda y límites](https://api.hacienda.go.cr/docs/), [Ley 8968, artículos 3, 5–7, 10–12 y 21](https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf), [preguntas frecuentes de PRODHAB](https://www.prodhab.go.cr/preguntasfrecuentes.aspx). PRODHAB devolvió 403 en extracción directa; se consultó su contenido oficial indexado. Estas fuentes no certifican esta aplicación concreta.

## Pruebas y límites de la evidencia

- SQL/PGlite: PASS, `scripts/pro/verify-identity-quota-db.mjs`. Cuatro alcances, denegación sin escrituras parciales, caducidad, limpieza, validación y permisos RLS/RPC.
- PostgreSQL/Supabase loopback: PASS, `scripts/pro/verify-identity-quota-local.mjs`. Dos solicitudes simultáneas para el último cupo: una admitida, una denegada, contador final correcto; RPC de servicio y rechazo anónimo. Solo tokens sintéticos, limpieza de sus claves al finalizar.
- Runtime final: **37/37 PASS**, `/tmp/pro-private-identity-runtime-final.log`. Incluye verificador compartido de Hacienda/registro y casos privados de formato/tamaño/finalidad, acceso, suspensión, GET, no-store, fallo cerrado, Retry-After, minimización, no caché y rechazo de encabezados de proxy no confiables. Hacienda está simulada; no se envían cédulas reales.
- UI y API reales locales: **6/6 PASS**, `/tmp/pro-private-identity-ui.log`, WebKit móvil, Chromium escritorio y móvil. Formularios con resultados simulados, fallos/reintentos, revisión voluntaria, cancelación de consultas atrasadas, aviso, conservación de cliente/copia histórica y cuentas desechables limpiadas. API sin sesión/sin Pro/vencida/deshabilitada/suspendida y origen ausente/ajeno: rechazados. Los casos admitidos usan datos inválidos para detenerse antes de Hacienda.
- Captura móvil inspeccionada: `/tmp/pro-private-identity-ui/pro-client-fiscal-Pro-clie-9030b-immutable-invoice-snapshots-chromium-mobile/private-identity-notice.png`. Navegador móvil; no se declara prueba nativa.
- TypeScript y ESLint focal: PASS, `/tmp/pro-private-identity-types-final.log`, `/tmp/pro-private-identity-lint-final.log`. UTF-8, presupuesto bilingüe y diff-check: PASS. No se modificaron cabeceras/logos; se reutiliza su evidencia compatible y sus bloqueos previos documentados, sin repetir tiendas, CI ni suite completa.
- Los helpers temporales antiguos de preservación de gastos/pagos no pudieron reutilizarse: faltan sus archivos previos en `/tmp`. No se regeneró un supuesto snapshot anterior. La conservación comprobada en este incremento es la de los fixtures y copias históricas del recorrido fiscal; el SQL nuevo solo crea cuotas y su mantenimiento.

No se afirma seguridad absoluta, aprobación jurídica, validación fiscal, funcionamiento de Hacienda en vivo ni aptitud de publicación. La herramienta continúa restringida al desarrollo local.
