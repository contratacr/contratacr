# Revisión dirigida de utilidad y facilidad de uso

Solo Pro (`local/pro-suite-no-push`, HEAD 06b70019). Conservar los cambios y datos existentes; sin push, ramas nuevas ni producción. Facturación queda secundaria. No se declara una función poco usada sin evidencia de uso; primero se reduce exposición, duplicación o fricción sin borrar capacidades.

## Cola de trabajo actual

1. Auditoría terminada: separar hallazgos reales de opciones que ya eran secundarias.
2. Implementado y probado: confirmación al salir con flecha/Cancelar de formularios de cliente, producto, cita y movimiento de stock; seguir editando conserva borrador, recargar lo recupera; guardado exitoso no pide descartar.
3. Implementado y probado: pago/material con respuesta perdida conserva acción, cuerpo y revisión; impide salir desde hijo, padre, Escape y Back mientras se resuelve.
4. Implementado y probado en ES/EN: abrir el editor de constancia bajo demanda, conservando versiones publicadas visibles y protecciones de cambios.
5. Resuelto en la siguiente ronda: código de producto/servicio automático y opcional, proveedor dentro del gasto y grupos/categorías bajo demanda. Evidencia y selección en automatic-catalog-codes-local.md.

## Evidencia de esta ronda

- `/tmp/pro-led-business.log`: 3/3 WebKit móvil (creación mínima, ediciones preservadas, duraciones/cotización; tarjetas y descarte ES/EN).
- Simulador iPhone 17 Pro/Safari, español: editar cliente ficticio → escribir cambio temporal → flecha → Seguir editando mantiene nombre → Cancelar → Descartar cambios regresa a lista con nombre original. Sin guardar datos.
- Segundo intento manual en inglés bloqueado por el Mac; no se declara completado.
- `/tmp/pro-led-operations.log`: prueba de respuesta perdida encontró cierre indebido por Escape desde un modal padre. Se conserva la aserción y se corrige antes de repetir.
- `/tmp/pro-led-operations-fixed.log`: 1/1 WebKit móvil, reintento idéntico tras guardado y respuesta abortada; bloqueo de edición/cierre hijo/cierre padre/Escape/Back, un solo abono, reversión e historial y material/stock preservados. Incluye formulario inglés y recorrido completo español.
- TypeScript, ESLint focal y git diff --check: aprobados con todos los cambios de esta ronda.
- Constancia: `/tmp/pro-led-report.log` ES aprobado; EN falló al volver a editar tras el recorrido del cliente. `/tmp/pro-led-report-en.log` repite EN sin modificar código y aprueba 1/1. El trace confirma un remontaje del editor y Fast Refresh entre 23 y 25 s. La repetición sin cambios aprobó. Regresión del refresco de agenda por foco aprobada en ES/EN: respuesta200, vista previa/editor y versión1 preservados. No se atribuye la causa al temporizador sin evidencia.
- `/tmp/pro-led-report-final.log`: 2/2 ES/EN aprobados con refresco explícito de agenda, sin cambios de código durante la ejecución (28.6 s).
- Constancia cerrada de inicio, apertura explícita, Cancelar restaura último borrador, cerrar/reabrir conserva texto/nota privada y la versión compartida permanece visible. Cobertura de fotos privadas, reintento de subida sin duplicar y aislamiento entre cuentas conservada.
- Límite de la primera ronda, resuelto después: la acción incierta ahora se conserva por cuenta/cliente en el mismo navegador antes del POST y se recupera sin envío automático. Ver automatic-catalog-codes-local.md y /tmp/pro-recovery-final.log.
- Revisión de código: `InvoiceDraftAction` ya se presenta en `details` por defecto. No se cambia por aparecer directamente en JSX.

## Orden de revisión por sección

1. Clientes: identidad y contacto, crear/editar, historial y borradores conservados.
2. Citas: solicitud, estados y reprogramación; constancia opcional.
3. Cotizaciones: propuesta, cambios solicitados, aceptación y servicios frecuentes; facturación separada.
4. Productos y servicios: nombres, precios, existencias; códigos e importación secundarios.
5. Gastos y proveedores: registro corto y reutilización de proveedor.
6. Pagos y saldos: información clara, correcciones con historial y reintentos seguros.
7. Estadísticas y ajustes: resumen útil y configuración bajo demanda.

Las rondas anteriores tienen evidencia específica en `docs/pro/*local.md`. Esta lista no certifica cada sección completa ni reemplaza la revisión manual pendiente.

## Criterio de producto

- Camino principal: encontrar/contactar profesional → solicitud/cita → cotización → servicio terminado.
- Herramientas de apoyo: clientes, productos/servicios, gastos, pagos y resultados. No convertirlas en pasos obligatorios para prestar un servicio.
- Configuración, importaciones, variantes y facturación: secundarias y bajo demanda.
- Mantener componentes y jerarquía visual de secciones existentes: acción principal, filtro, búsqueda, tarjetas; detalle y formularios separados.
- Guardar/cancelar y regresar deben preservar datos y dejar claro cuándo se descartan cambios.

Esta cola se actualiza con hallazgos verificables y evidencia; no sustituye pruebas ni certifica paridad con producción.

## Pendientes concretos

- Resuelto: código de catálogo automático, conservando códigos anteriores y personalizados; CSV y unicidad internos sin cambios.
- Resuelto: proveedor desde gasto con borrador conservado, revisión coherente y reintentos sin duplicados.
- Revisión manual: catálogo ES/EN y gasto EN comprobados en Simulator; la constancia nueva y el recorrido completo de todas las secciones no se declaran revisados manualmente. Sus casos automatizados tienen evidencia separada.
- Resuelto: operación incierta recuperable en el mismo navegador/dispositivo. Las pruebas reabren pestaña en EN y ES, aíslan cuentas, niegan almacenamiento y verifican recuperación confirmed solo mediante lectura.
