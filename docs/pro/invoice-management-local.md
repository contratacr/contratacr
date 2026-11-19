# Gestión local de borradores

Implementación aditiva de Pro, sin emisión ni envíos:

- Listas separadas de borradores activos y archivados, con búsqueda y paginación.
- Archivar/restaurar conserva el documento y cambia únicamente su estado de gestión. Los borradores archivados no pueden editarse hasta restaurarse.
- Duplicar genera un borrador directo independiente. Copia receptor, preparación, notas, líneas comerciales, versiones e impuestos/cargos guardados. Limpia vínculos de cotización/trabajo, acuerdo, pagos y saldo; no copia movimientos operativos de materiales ni modifica inventario, deuda o workspace. Admite el snapshot histórico de un cliente archivado.
- La duplicación tiene requestId estable para recuperar respuestas inciertas sin duplicar. Un rechazo CAS definitivo permite refrescar y comenzar otro intento.
- Impresión provisional autenticada, con datos escapados, logo compartido aprobado, CSP y caché privada deshabilitada. Incluye líneas, impuestos, exoneraciones y otros cargos. Presenta marca visible **SIN VALIDEZ FISCAL**. No es comprobante electrónico ni valida requisitos fiscales. Actualmente el documento de impresión está en español.

## Instalación y validación

La extensión `docs/pro/sql/invoice-management-local.sql` se aplica después de la pila local completa de facturación. No se aplica a producción ni hace backfill. La configuración documental futura se copia en la preparación de nuevos borradores; duplicar conserva la preparación original exacta.

Verificador aislado: `node scripts/pro/verify-invoice-management-db.mjs`. Utiliza PGlite en memoria, sin red ni base de datos viva. Cubre copias v1–v4, CAS, rechazo de edición archivada con rollback, aislamiento/RLS, reintentos idempotentes, preservación operativa, filtro/paginación, reinstalación y cascada de eliminación de cuenta. No demuestra concurrencia entre conexiones PostgreSQL reales.

`tests/e2e/pro-invoice-management.spec.ts` prepara cuentas desechables únicamente en loopback. Cubre interfaz, conflicto y recuperación, impresión escapada y carrera real entre archivo/edición. Su ejecución y la revisión del diálogo de impresión/simulador quedan a cargo de la validación central. Este incremento no ejecuta esas pruebas ni aplica SQL a una base viva por su cuenta.

Validación central posterior y límites actualizados: [aplicación de recomendaciones](gti-recommendations-execution-local.md). La evidencia final de ese registro sustituye las notas iniciales de pruebas pendientes de este documento.
