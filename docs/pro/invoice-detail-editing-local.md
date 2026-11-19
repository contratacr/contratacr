# Detalle editable de borradores — Pro local

2026-10-26, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preserva todo el trabajo local previo. Sin branches/worktrees, push, emisión, cobros, mensajes, cambios main/mobile ni datos de producción.

## Alcance y referencia

Referencia funcional: inventario histórico autorizado de GTI y [servicio público GTI](https://www.facturaelectronica.cr/NuestroServicio). Se revisaron fuentes primarias de [Hacienda, anexos 4.4](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf) y [BCCR, preguntas CABYS](https://www.bccr.fi.cr/indicadores-economicos/cabys/Preguntas-frecuentes-CABYS.pdf). Las reglas completas tienen tratamientos especiales; esta entrega prepara un borrador comercial y no certifica XML ni tratamiento tributario.

Se permite agregar productos guardados con su ID/SKU/unidad/precio/CABYS copiados, o escribir productos/servicios manuales. Se editan descripción, cantidad, precio unitario, descuento comercial porcentual o monto por línea, motivo, tratamiento de IVA, tarifa, CABYS, unidad y código comercial. CABYS admite pendiente o 13 dígitos: sin afirmar existencia, clasificación ni tarifa oficial. IVA, exento, no sujeto y pendiente son estados distintos. No se infiere exención de un cero heredado ni producto/servicio de la descripción.

## Selección de pruebas previa

Por almacenamiento/RLS/RPC nuevos, API y cálculo monetario: verificador BigInt con casos de frontera y entradas inválidas; SQL aislado ampliado con conservación/reinstalación, cálculo equivalente, rollback/CAS, propietarios, paginación existente, reset y refresh; E2E nuevo de detalle y consumidores de borradores/preparación/Facturación en WebKit móvil y Chromium móvil/escritorio. Es cobertura delimitada a facturación y sus referencias, no suite global. Se reutiliza evidencia de almacenamiento operativo, marca y navegación compartida cuyas entradas no cambian. Revisar manualmente iOS, comparar snapshots privados y ejecutar ESLint/TypeScript de fuentes/UTF-8/diff. Resultados al final.

## Persistencia, cálculo y uso

El detalle editado se guarda en `pro_invoice_edited_detail` y `pro_invoice_edited_lines`, con propietario, FK compuestas, RLS de lectura propia y RPC de servidor. No reemplaza líneas comerciales de la cotización ni la copia de origen del borrador. Se conservan el total/impuesto del origen para comparación y restauración explícita. Seleccionar inventario copia referencias/datos al borrador sin descontar stock; un producto eliminado físicamente deja sus snapshots y total intactos y limpia solamente el enlace opcional al catálogo.

La API calcula en PostgreSQL con numeric, sin aceptar totales/abonos enviados por el cliente. La vista previa usa BigInt y no aritmética binaria de punto flotante para dinero. Cantidad/precio admiten hasta cinco decimales, punto o coma; bruto y descuento porcentual se redondean a cinco decimales, luego base e IVA por línea. Se suman los importes a cinco decimales y se redondea a dos el total en CRC. Redondeo de mitades hacia arriba para importes no negativos. El descuento de monto es del renglón completo, no por unidad. Versión interna `crc-draft-v1`, sin certificación tributaria. Máximo 100 líneas; límites internos de cantidad/precio y total conservados por validación de cliente/servidor.

Acciones separadas: editar líneas, guardar detalle y usar la última copia de origen. Guardar actualiza solo total/impuesto/revisión del borrador y su detalle. No crea deuda, aplica pagos ni registra consumo. Actualizar desde origen conserva las líneas editadas y su total, actualizando la copia de comparación; incluso un trabajo manual sin importe conserva su monto de origen separado del total editado. Una versión anterior del editor que solo modifica receptor/notas no borra el detalle nuevo.

Se conserva la ruta con `detalleFactura=1`, recarga, flecha/Atrás y búsqueda de Facturación. Hay confirmación para descartar cambios o restaurar origen. El formulario principal debe guardarse antes de abrir líneas para no perder sus cambios. La lista recibe el nuevo total sin reiniciar la búsqueda.

CABYS sigue como referencia manual o copiada del producto. No hay aún búsqueda/validación en catálogo oficial ni determinación automática de IVA por clasificación. Tampoco se incluyen múltiples impuestos especiales, exoneraciones, descuentos de naturaleza especial como regalías/bonificaciones, tipo de transacción fiscal, combos, facturación parcial o XML. Esas brechas se mantienen: no se anuncian como cubiertas por un editor comercial.

## Hallazgos y correcciones

- Se usó sintaxis de constructor BigInt compatible con el target TypeScript existente, sin cambiar configuración global ni cálculo exacto.
- Agregar/quitar líneas son botones locales `type=button`; no envían el formulario de manera implícita.
- La primera prueba detectó un FK al producto que bloqueaba la baja de la cuenta de prueba. Se corrigió a limpiar solo `product_id` al eliminar el artículo, conservando el snapshot financiero; se añadieron pruebas de borrado del producto y cascada del propietario.
- El selector del diálogo de restauración se ajustó al encabezado visible dentro del diálogo: el hook compartido no asigna nombre accesible cuando oculta la cabecera. No se modificaron el diálogo global ni sus aserciones, ni se usaron clics forzados.

## Evidencia final

- Cálculo exacto y entradas inválidas: PASS (`/tmp/pro-detail-math-final.log`). SQL aislado, reinstalación, RLS/propietarios, CAS/rollback, eliminación de producto/cuenta y conservación: PASS (`/tmp/pro-detail-db-final.log`).
- Cobertura funcional de los cuatro escenarios (detalle, borradores, preparación y Facturación) en Chromium escritorio/móvil y WebKit móvil: los 12 pares tienen evidencia aprobada. La tanda inicial dio 7/8 y otra móvil 2/3: fallaron una navegación con carga pendiente y una consulta de cotización con 401 durante comprobación de sesión. La presión de ejecución paralela es una hipótesis, no causa demostrada. Las repeticiones en serie pasaron sin cambiar autenticación ni aserciones: Facturación escritorio 1/1 y detalle/borradores móvil 2/2. Se conservan esos fallos iniciales; no se presenta la tanda inicial como verde.
- ESLint enfocado, TypeScript de fuentes, UTF-8 y diff: PASS. No equivale a certificación global de toda la aplicación.
- Snapshots privados de datos originales comparados al terminar: conservados. Se comprueban también movimientos operativos reales; no solo JSON del workspace. Los fixtures descartables se limitaron al entorno local; dos cuentas de la primera prueba se limpiaron tras corregir el FK, con filtro estricto y exclusión de propietarios originales.
- Simulador iPhone 17 Pro: arranca el checkout Pro local y muestra el borrador existente con la nueva acción «Editar detalle de factura». No se pudo completar la interacción nativa: Computer Use devuelve `noWindowsAvailable` incluso tras renovar la sesión. Se pidió dejar la ventana visible/desbloquear el Mac; la comprobación manual de las líneas queda pendiente. No se guardaron cambios sobre el borrador de demostración. Las pruebas WebKit móvil sí cubrieron edición, cálculo, guardado, recarga, Atrás y restauración.

Todo permanece local en Pro, sin push ni emisión de facturas reales.

## Reanudación visual tras disponibilidad del Mac

El usuario indicó «listo» y el control nativo volvió a funcionar. Se abrió «Editar detalle de factura» en iPhone 17 Pro/iOS 26.5, se clasificó temporalmente como servicio, se probaron cantidad 2 y precio 100 (línea visible ₡200,00), descuento porcentual 10, selección IVA con tarifa 13 y campos CABYS/unidad. No se afirma consulta oficial del CABYS ficticio. La entrada automatizada de texto CABYS quedó incompleta (12 dígitos visibles); no se guardó ni se interpreta como CABYS válido. Validación/rechazo y persistencia ya tienen cobertura automatizada.

Se verificó la flecha con confirmación «¿Descartar cambios del detalle?»; se descartaron los valores temporales y se reabrió el editor desde el borrador conservado. Total original ₡50.000, abonos ₡20.000 y saldo ₡30.000 intactos. Los verificadores privados de borradores y operaciones confirman igualdad exacta. Captura final: `/tmp/contratacr-pro-detalle-factura-20261026.png`. Se resuelve el bloqueo de interacción anterior; no se afirma un recorrido nativo de guardado sobre datos existentes.

## Revisión autónoma y correcciones de recuperación

Se delegó auditoría de solo lectura al agente `invoice_usability_review`; encontró dos P2 concretos: Atrás del navegador eludía el diálogo del botón y los errores podían quedar en campos fiscales plegados. Se corrigieron y el agente revisó la solución final sin otro defecto concreto por lectura.

El detalle registra una protección temporal de recorrido en el almacén de parámetros Pro, antes de que sus suscriptores actualicen/desmonten el formulario. Ante Atrás con cambios restaura el estado/ruta capturados y pregunta; cancelar conserva los valores, confirmar sale. Durante guardado retiene el editor. Se conserva el árbol Next de la entrada original: no se solicita una restauración nueva mezclando URL del detalle con árbol del destino. El registro se limpia por identidad al guardar o desmontar. Se añade advertencia nativa beforeunload para recarga/salida del documento, sujeta al soporte/activación del navegador; no se garantiza un diálogo personalizado en navegación entre documentos ni terminación forzada de la app.

Al guardar datos inválidos se identifica la línea, abre sus campos avanzados si corresponde, enfoca/desplaza al campo y lo relaciona con el mensaje mediante aria-invalid/aria-describedby. Se añadió cobertura de interfaz para CABYS incompleto oculto y corrección, Atrás cancelado/confirmado con valores sin guardar y Atrás mientras la petición de guardado está retenida.

Validación incremental:
- Primera implementación de guard en un listener tardío del editor pasó WebKit y falló Chromium; instrumentación temporal mostró actualización/desmontaje antes de llegar al listener. No se debilitó la prueba. Se movió la decisión antes del update del almacén Pro; se retiró toda instrumentación temporal.
- Dos pruebas iniciales no llegaron a los cambios por consultas atascadas del servidor dev. Se reinició solo el proceso cuyo cwd era Pro, conservando BD/autenticación. No se atribuyen los posteriores defectos de navegación al GC.
- Detalle final con validación, guardado retenido y recuperación en WebKit móvil, Chromium móvil y escritorio: tres pases (`/tmp/pro-detail-navigation-final.log`).
- Regresión del almacén compartido: dos casos de rutas por tres perfiles. La tanda final fue 8/9 total (incluye los tres casos de detalle): un recorrido WebKit Agenda→Cliente quedó mostrando cita en lugar de cliente. La repetición dirigida sin cambiar código/aserciones pasó (`/tmp/pro-detail-navigation-webkit-recheck.log`, 1/1). Causa del fallo intermitente no demostrada; conservarlo como observación de estabilidad. No se describe como una única tanda 9/9.
- ESLint y TypeScript de fuentes: PASS (`/tmp/pro-detail-usability-lint-final.log`, `/tmp/pro-detail-usability-types-final.log`). UTF-8/diff y comparación de datos originales: PASS. No cambiaron esquema/API/cálculo en esta revisión: se reutiliza evidencia SQL/matemática anterior compatible.

Comprobación nativa final: se introdujo CABYS ficticio incompleto `123`, se cerró «Descuento, impuestos y CABYS» y se pulsó Guardar. La app volvió a abrir el apartado y mostró «Línea 1: CABYS debe estar vacío o tener 13 dígitos». No se envió guardado válido ni se alteraron datos. Captura `/tmp/contratacr-pro-validacion-cabys-20261026.png`. Después se descartaron los cambios con confirmación y quedó abierto el borrador original: total ₡50.000, abonos ₡20.000, saldo ₡30.000 y material de costo ₡2.500.

La sesión GTI abierta por el usuario en Safari se consultó sin guardar ni emitir; el contraste está en `billing-gti-gap-review-local.md`. Paridad funcional completa sigue pendiente.

## Ampliación posterior — 27 octubre 2026

La preparación de IVA ordinario por catálogo y exoneraciones documentales por línea se incorpora en `invoice-tax-exoneration-local.md`. El cálculo anterior sin metadatos se conserva como v1; las escrituras explícitas con catálogo usan `crc-draft-tax-v2`. Las limitaciones de impuestos especiales y emisión de esta nota siguen vigentes.
