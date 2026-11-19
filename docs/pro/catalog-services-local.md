# Catálogo de productos y servicios — incremento local

27 octubre 2026. Pro `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`; cambios existentes conservados. Primer incremento de [equivalencia GTI](gti-parity-ledger-local.md); no representa paridad completa ni emisión fiscal.

## Contrato implementado

El catálogo compartido distingue producto con existencias de servicio sin existencias. La ausencia de `itemType` mantiene el significado histórico de producto: no se infiere desde stock, nombre o CABYS ni se rellena el histórico. Los servicios nuevos usan `itemType:'service'`, stock y mínimo cero. El tipo es inmutable al editar para no reinterpretar movimientos anteriores. Escritores antiguos que omiten el campo conservan el tipo ya guardado.

Factura y cotización reutilizan ambos tipos; materiales y alertas de reposición solo usan productos. La factura copia el servicio como línea de servicio sin referencia a inventario. Guardar cotización o borrador no consume stock ni genera deuda. Los documentos existentes conservan sus snapshots y versiones fiscales.

## Selección de pruebas antes de ejecución

Entradas: esquema de producto y helpers, importación CSV, RPC de catálogo/páginas/materiales, selectores y formularios compartidos, copia a factura. No cambian autenticación, dependencias, estilos globales ni contabilidad fiscal. Es una extensión SQL compartida: requiere verificadores aislados de catálogo, operaciones, panel y cadena de facturas, más regresión de consumidores y pruebas de aislamiento/compatibilidad. No basta un test de UI.

E2E seleccionados: nuevo recorrido producto/servicio y consumidores de catálogo, importación/exportación, materiales, movimientos, cotizaciones, factura directa/detalle y recuperación de selectores. Chromium escritorio/móvil y WebKit móvil, ejecución serial contra loopback. Reutilizar evidencia de cálculo fiscal compatible, salvo que la integración revele cambios en ese motor. No repetir CI, tiendas ni pruebas físicas aprobadas. Añadir tipos/lint/codificación y comparación exacta de datos originales antes/después.

## Estado

Incremento validado localmente: dominio, SQL, interfaz, consumidores y simulador. No publicado. Los valores predeterminados de documentos y demás módulos del bloque A/B de GTI siguen pendientes; no se declara equivalencia completa.

## Revisión y simulador

Tres agentes con archivos asignados: dominio/persistencia, UI y verificación independiente. Se corrigió revalidación de escritores antiguos después de recuperar el tipo guardado y se conservó normalización de precios a cinco decimales al copiar el catálogo. La revisión no encontró P1/P2 adicional.

Simulador iPhone 17 Pro/iOS 26.5, servidor local 3185: ficha de servicio muestra precio y datos comerciales sin movimientos ni mínimo; editor oculta stock y conserva tipo. Se abrió un borrador ficticio de un servicio de 12500, cambió cantidad 1→2, guardó y reabrió con total 25000. Verificación posterior confirmó línea service/productIdnull, stock 0 y ningún movimiento. IVA quedó explícitamente pendiente en esta prueba; no demuestra tratamiento fiscal. Solo se eliminaron el servicio y borrador desechables, comparando exactamente todas las filas originales de su dueño. No se emitió nada.

Capturas revisadas:
- `/tmp/contratacr-pro-servicio-formulario-20261027.png`
- `/tmp/contratacr-pro-servicio-factura-20261027.png`

La prueba nativa usó fixtures locales para abrir el formulario y borrador; la creación y selección de un servicio desde cero se cubren en el nuevo E2E. CSV para Excel y plantilla de importación continúan siendo contratos distintos; no se promete reimportar una exportación localizada directamente.

## Evidencia final y límites

Cobertura seleccionada de 11 recorridos/casos por tres perfiles (33 combinaciones), obtenida entre rondas compatibles, no una única suite de 33 verde:

- `/tmp/pro-service-catalog-regression.log`: primera ronda18;9 aprobados de materiales/operaciones, recuperación de selectores y movimientos;9 fallaron por nombres antiguos de campos. Se actualizaron los nombres intencionales sin quitar aserciones.
- `/tmp/pro-service-catalog-final.log`: 21 aprobados de importación (2 casos), catálogo relacional, factura directa, detalle, formularios e integración local ×3. Los 3 fallos pertenecían al nuevo test de servicios por aserción de texto sobre colección; se cambió por contar tarjetas coincidentes, conservando exclusión y cantidades.
- `/tmp/pro-service-new-final.log`: 3/3 aprobados del recorrido nuevo corregido; creación, omisión del campo por escritor antiguo, tipo inmutable, stock/materiales/factura manipulada rechazados, aislamiento por propietario, selección fuera de primera página, copia a cotización/factura, conservación y vista inglesa sin desbordamiento.
- `/tmp/pro-catalog-item-types-db.log`: dominio y PostgreSQL aislado, migración aditiva/reinstalación, ausencia histórica, CSV antiguo/nuevo, páginas, CAS, atomicidad y RLS aprobados.
- `/tmp/pro-catalog-item-operations-db.log`: operaciones/materiales y rechazo de servicios aprobados.
- `/tmp/pro-service-invoice-db.log`, `/tmp/pro-service-panel-db.log`: cadena de facturas/compatibilidad y panel aislados aprobados con nuevo orden de instalación.
- `/tmp/pro-service-final-types.log`, `/tmp/pro-service-final-lint.log`: TypeScript fuente y lint focal aprobados. UTF-8, presupuesto bilingüe (427 ocurrencias/65 archivos), archivos privados y diffcheck aprobados. No se aumentó presupuesto ni desactivaron reglas.

Se reutiliza la evidencia compatible del motor monetario/IVA/exoneraciones/especiales: no se cambiaron sus reglas, versiones ni snapshots. La cadena SQL de facturas se volvió a ejecutar por la nueva guarda de referencias a inventario. No se ejecutó la suite global de ContrataCR ni builds de tiendas.

Los verificadores privados de preservación volvieron a confirmar igualdad exacta de documentos/revisiones, facturas/líneas/materiales/preparación/detalle, operaciones y emisor originales. Datos conservados de 2 cuentas: 11 trabajos, 10 cotizaciones heredadas, 50 disponibilidades, 46 clientes, 45 productos y 10 movimientos. Las nuevas fixtures de los tests se limpian por sus cuentas desechables; las del simulador se eliminaron solo por dueño/ID/título capturados. La extensión no rellena `itemType` en las filas anteriores.
