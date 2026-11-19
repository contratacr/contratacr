# Revisión del recorrido Pro — 3 noviembre 2026

Solo checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preservan los cambios locales previos. Sin push, producción, mensajes ni emisión fiscal.

Se prioriza cerrar recorridos existentes antes de añadir recordatorios o servicios recurrentes. Entradas revisadas: cliente/trabajo/materiales/abonos, cotización→borrador y trabajo→borrador, costos y resultado, pagos de factura, estado de cuenta y reprogramación. La cobertura consiste en escenarios integrados por dominio; no se presenta como un único test que atraviese todas las etapas ni como certificación fiscal.

Corrección de facilidad de uso: cuando no hay una reprogramación disponible ni propuesta pendiente, el bloque muestra «Historial de horarios» y omite la explicación de esperar aceptación. Esto evita anunciar una acción en citas ya terminadas. Se conserva el historial y no se modifica almacenamiento.

Selección de pruebas: WebKit móvil para los seis recorridos dependientes; TypeScript global, ESLint focal, UTF-8 y diff-check. Se reutiliza la evidencia de Empleos, marca y permisos de la entrega anterior porque esas entradas no cambian. No se ejecutan CI, paquetes nativos ni suite exhaustiva.

Revisión visual de la captura de costos: importes, saldo, materiales, horas, gastos y resultado aparecen junto a acciones explícitas; no hay desbordamiento en el caso probado. [Captura WebKit](research/2026-11-03/work-cost-summary-webkit.png).

El control del simulador devolvió «The Mac is locked and automatic unlock could not unlock it». La prueba manual queda pendiente de desbloqueo; los E2E WebKit no se describen como prueba manual del simulador. La validación con Hacienda y revisión contable sigue pendiente y requiere entorno fiscal de pruebas; no se conectó ni emitió ningún documento.

Resultado: seis escenarios aprobados en WebKit móvil, sin retries: ficha integrada (32 s), borradores (28,7 s), costos (36,5 s), reprogramación (17,7 s), estado de cuenta (15,3 s) y pagos (21 s). Logs `/tmp/pro-journey-review.log` y `/tmp/pro-journey-close.log`. TypeScript global, ESLint focal sin warnings, UTF-8 y diff-check aprobados.

Comparación contra la base de conservación previa: 78 tablas revisadas y las 626 filas originales idénticas. Se conservan los tres eventos de auditoría sintéticos ya documentados el 2 de noviembre; no se borran para ocultar su existencia. Las cuentas operativas desechables de los tests se limpiaron. Evidencia `/tmp/pro-journey-data.log`.

## Reanudación manual tras desbloqueo

Safari del simulador iPhone 17 Pro/iOS 26.5 abrió la aplicación local en `127.0.0.1:3185`. Se inició sesión con la cuenta sintética de regresión ya existente y se rechazó guardar su contraseña. Se comprobó Mi panel → Ventas y cobros → Facturas → Nuevo borrador. Se escribió un concepto de prueba sin guardar, la flecha abrió la confirmación para descartar y, al descartar esa edición, volvió a Facturas sin crear documentos. Se dejó el simulador en la lista vacía de borradores. [Evidencia de protección](research/2026-11-03/invoice-unsaved-guard-ios-simulator.png).

Esto resuelve el bloqueo de interacción del simulador para este recorrido. No certifica un guardado manual de pagos ni de reprogramación; esos casos conservan la evidencia E2E. No se emitieron facturas ni se alteraron los registros comerciales existentes.
