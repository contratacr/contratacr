# Logs de Supabase: revisión del 16 de octubre de 2026

Lectura del panel de producción: ciclo 18 de septiembre–18 de octubre de 2026; Log Ingestion 3.525 GB sobre 1 GB incluido, marcado Upcoming. El panel indica que no se han excedido cuotas vigentes. Otros consumos: base de datos 0.116/0.5 GB, egress 0.161/5 GB, 111/50000 usuarios activos, 6/200 conexiones simultáneas Realtime y 1379/2000000 mensajes.

La documentación de Logs Ingest establece un período de gracia hasta comienzos de 2027. No publica una franquicia adicional garantizada en GB ni una fecha exacta de corte. Para Free, el exceso no se factura; se describen avisos y un período de gracia, seguidos de posibles restricciones según Fair Use. No interpretar esto como volumen ilimitado ni como caída automática al llegar a 1 GB. Las restricciones generales pueden afectar a la organización, pero el panel actual no muestra una restricción por logs.

Recomendación: conservar Supabase, sin comprar servicios ni migrar por esta métrica por ahora. Antes de la aplicación de los límites, medir el origen del volumen y revisar la verbosidad de Postgres (log_statement, umbral de consultas lentas, pgAudit, conexiones y RAISE NOTICE/LOG) sin desactivar errores o registros de seguridad. Los contadores acumulados no se reducen al borrar registros. No se cambiaron configuraciones de producción durante esta revisión ni se atribuyó el consumo a pruebas sin evidencia.

Fuentes consultadas:
- https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest
- https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy
