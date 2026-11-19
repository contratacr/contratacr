# Historial y vista local — 8 de noviembre de 2026

Solo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo previo conservado. Sin push/commits, cambios de esquema ni producción.

## Vista local

Servidor existente confirmado activo. HTTP local en 127.0.0.1:3185 y HTTPS privado en 192.168.40.59:3443 responden con redirección de autenticación esperada para peticiones sin sesión. HTTPS comprobado con el certificado local explícito, sin desactivar validación. No se inició otro servidor ni se cambió la base.

## Cambio

Historial del cliente: bloquear registros durante carga, error o cambio de revisión. Actualizar recupera el recorrido; se conserva la paginación. Se añade nombre accesible al diálogo de cita de respaldo. No se modifican registros, API o permisos.

## Validación

- `/tmp/pro-tools-history.log`: 1/1 aprobado. Incluye 156 registros mixtos paginados, revisiones concurrentes, registros bloqueados hasta actualizar, cita/cotización fuera de la primera página, regreso en ES/EN, aislamiento y conservación de registros originales.
- Fixture profesional completa solo para las cuentas desechables de esa prueba. ESLint focal, TypeScript y diff-check sin errores.
- Simulator/Safari en la cuenta local existente: Herramientas en español, abrir Preparar visitas, agregar pregunta temporal y escribir, inspeccionar Cancelar/Guardar; cancelar y verificar restauración de 0 minutos entre visitas, 15 minutos de anticipación y ninguna pregunta. Sin guardar ni enviar nada. Complementa el mismo recorrido manual inglés documentado en pending-report-actions-local.md; el componente de preparación no cambió entre esas comprobaciones.

Esta evidencia cierra ese recorrido manual de cancelación ES/EN, no toda la aplicación. La prueba del historial ES/EN es automatizada, no manual en el simulador. Facturación permanece aparte.
