# Clientes, productos y existencias — 8 de noviembre de 2026

Solo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo local previo preservado. Sin push, commits, migraciones ni escrituras en producción.

## Alcance

- Formularios compartidos de cliente, producto y cita: Cancelar antes de Guardar, en el pie existente. Cancelar usa el mismo cierre que la flecha; no se añade una confirmación nueva ni se cambia el almacenamiento de borradores.
- Producto/servicio: tipo, nombre, precio y código antes de existencias y costos. Se retira el párrafo que repetía el orden de campos.
- Categoría/unidad permanecen en Datos del catálogo. CABYS pasa a Referencia fiscal (opcional), cerrado inicialmente y con el campo montado para conservar su valor al guardar sin abrirlo.
- Registro de existencias: presentación móvil de pantalla completa y pie Cancelar/Guardar. No cambian la validación ni los movimientos.
- Facturación y sus borradores permanecen aparte. Ningún campo o función fiscal se elimina.

## Selección de comprobaciones

Cambio de presentación de BusinessPanel compartido por clientes, catálogo y agenda. Seleccionados: forms-ux (creación mínima, edición preservada, duración y cotización), catalog-item-types (producto/servicio y consumidores), project-card-style ES/EN ampliado para comprobar el orden Nombre/Precio/Código y cancelar edición/movimiento sin cambiar el documento. Se conservan los contratos anteriores, adaptando solamente el despliegue de CABYS y los textos de botones.

Se reutiliza evidencia de Gastos, Categorías, correcciones de pagos, importación y complementos: sus componentes no cambian en esta tanda. ESLint focal, TypeScript y diff-check sin errores.

Simulador: Productos cargó en inglés; el control devolvió noWindowsAvailable al tocar Nuevo. No se afirma revisión manual del formulario ni guardado manual. No se modificaron datos desde el simulador.

Hallazgos adicionales: se limpia el error de movimiento al cerrar y se añade nombre accesible al diálogo. El error de existencias negativas se traduce al inglés en la presentación sin cambiar la validación del dominio.

El primer intento de forms-ux esperaba que crear una cita cerrara todos los diálogos; el producto ahora abre el detalle creado. Se actualiza la prueba para exigir ese detalle, su acción Editar y cierre, conservando las aserciones de duración y datos. Los primeros casos ES/EN de movimientos descubrieron la falta de nombre accesible del diálogo; se corrige el componente, no se elimina la comprobación.

Resultados finales:
- `/tmp/pro-tools-round4.log`: catalog-item-types aprobado (copias independientes a cotización/borrador y aislamiento de existencias); los fallos restantes se describen arriba y no se presentan como aprobados.
- `/tmp/pro-tools-round4-verified.log`: 3/3 aprobados (forms-ux y estilo/acciones ES/EN).
- `/tmp/pro-tools-round4-final.log`: 2/2 aprobados tras añadir la comprobación textual del error localizado ES/EN. Cancelar edición/movimientos y reabrir después de error conserva documento, revisión e historial originales.
- ESLint, TypeScript y diff-check finales sin errores. Capturas de producto EN y movimiento ES inspeccionadas y conservadas en research/2026-11-08/customer-product-actions.

El control del simulador se reintentó tras traer su ventana al frente y volvió a devolver noWindowsAvailable. La revisión visual de los formularios se realizó sobre capturas WebKit móvil; no se confunde con una prueba manual completa de Simulator ni con el binario instalado.
