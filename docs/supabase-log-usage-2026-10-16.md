# Logs de Supabase: revisión del 16 de octubre de 2026

Lectura del panel de producción: ciclo 18 de septiembre–18 de octubre de 2026; Log Ingestion 3.525 GB sobre 1 GB incluido, marcado Upcoming. El panel indica que no se han excedido cuotas vigentes. Otros consumos: base de datos 0.116/0.5 GB, egress 0.161/5 GB, 111/50000 usuarios activos, 6/200 conexiones simultáneas Realtime y 1379/2000000 mensajes.

La documentación de Logs Ingest establece un período de gracia hasta comienzos de 2027. No publica una franquicia adicional garantizada en GB ni una fecha exacta de corte. Para Free, el exceso no se factura; se describen avisos y un período de gracia, seguidos de posibles restricciones según Fair Use. No interpretar esto como volumen ilimitado ni como caída automática al llegar a 1 GB. Las restricciones generales pueden afectar a la organización, pero el panel actual no muestra una restricción por logs.

Recomendación: conservar Supabase, sin comprar servicios ni migrar por esta métrica por ahora. Antes de la aplicación de los límites, medir el origen del volumen y revisar la verbosidad de Postgres (log_statement, umbral de consultas lentas, pgAudit, conexiones y RAISE NOTICE/LOG) sin desactivar errores o registros de seguridad. Los contadores acumulados no se reducen al borrar registros. No se cambiaron configuraciones de producción durante esta revisión ni se atribuyó el consumo a pruebas sin evidencia.

Fuentes consultadas:
- https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest
- https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy


## Investigación y reducción aplicada

Muestra de producción de las últimas 24 horas consultada el 16 de octubre por la noche: API Gateway ~45.7k entradas, Auth ~4.9k, Postgres ~2k, PostgREST ~2.2k, Realtime 192. Son conteos por servicio del panel; no equivalen a bytes ni permiten distribuir los 3.52 GB del ciclo por causa. El plan gratuito conserva solo un día de logs. No atribuir retrospectivamente todo el ciclo a estas muestras.

Configuración leída con SELECT sobre pg_settings y ajustes por rol: log_statement=ddl; log_min_duration_statement=-1; log_min_messages=warning; log_connections=off; log_disconnections=off; pgaudit.log=none; pgaudit.role vacío; log_temp_files=-1; log_autovacuum_min_duration=600000 ms; log_lock_waits=on. Los ajustes particulares de los roles internos solo reducen log_statement a none. No se alteró esta configuración: no estaba habilitada una auditoría exhaustiva que justificara quitar registros de seguridad.

Se observó el error 42501 «permission denied for table professionals» con una consulta de contact_email en visitas anónimas. Se eliminó esa lectura del perfil público cacheado y se evita la lectura por visita cuando no existe sesión; los permisos RLS no cambian y los visitantes con sesión conservan su lectura autorizada fuera de la caché pública. Cinco lecturas opcionales de metadatos del perfil se agruparon en una, conservando el fallback para esquemas antiguos. Presupuesto comprobado del flujo anónimo: frío de 11 a 5 lecturas; caliente de 2 a 1, conservando la comprobación en vivo de suspensión.

El catálogo hacía tres consultas por actualización, tanto en la API como al llenar registros del servidor; el ETag ahorraba cuerpo HTTP pero no esas consultas. Ahora ambos usan un snapshot público en el R2 privado de caché ya existente, separado por proyecto. Vence a los 20 s y se publica de nuevo tras cada edición/creación/ocultación/revisión desde admin. Las escrituras condicionales impiden que una carga pública anterior sobrescriba una edición posterior. Node usa su caché de datos compartida entre bundles y su invalidación por etiqueta. Cloudflare tiene tagCache dummy, por lo que no se presupone que revalidateTag funcione allí. No se comparten promesas pendientes entre peticiones de Workers. Las lecturas fallidas no guardan catálogos parciales.

La precarga de navegación y el polling administrativo se revisaron: el polling ya se detiene cuando la pestaña no está visible; las precargas sostienen el requisito aprobado de navegación inmediata. No se quitaron sin evidencia de ahorro y sin una medición de latencia que lo justifique.

No se añadieron suscripciones, buckets ni credenciales. R2 mantiene sus propias cuotas de operaciones: reutilizar el servicio existente no equivale a prometer uso ilimitado gratis. No se puede garantizar todavía quedar bajo 1 GB; el ahorro mensual necesita una comparación de varios días posteriores al despliegue con tráfico comparable. El acumulado del ciclo no baja al desplegar la corrección.

Fuentes adicionales:
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://opennext.js.org/cloudflare/caching

Validación: contratos de caché (7), consultas de perfil (5), R2 local real y vocabulario (6) aprobados. Pruebas de navegador: catálogo (15), contacto (6), invalidación admin/API/SSR/ETag (3) aprobadas. TypeScript, lint dirigido y build OpenNext para Cloudflare aprobados. No se midió todavía el ahorro en GB posteriores al despliegue.
