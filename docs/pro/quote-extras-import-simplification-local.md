# Complementos e importaciones — 8 de noviembre de 2026

Solo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Cambios previos conservados. Sin push/commits, migraciones, emisión de documentos ni escrituras en producción.

## Cambios

- Complementos de cotización: Cancelar y Guardar en el pie fijo compartido del Modal; formulario asociado mediante ID propio de la cotización. Se mantienen validaciones HTML, confirmación de descarte, bloqueo por guardado incierto y aceptación del cliente.
- Importar CSV de clientes/productos: Cancelar antes de Importar, texto corto para móvil. Columnas e instrucciones técnicas bajo Cómo completar el archivo. No cambian el formato, límites, validación ni el proceso de guardado.
- Facturación permanece aparte; el test conserva la comprobación del snapshot del borrador como consumidor compatible, sin emitir nada.

## Validación

- ESLint focal, TypeScript y git diff --check sin errores.
- `/tmp/pro-tools-round3-import.log`: 3/3 aprobados en WebKit móvil. Contrato CSV y recorrido ES/EN: errores bloquean escrituras parciales, cancelar no guarda, archivo válido conserva los grupos.
- `/tmp/pro-tools-round3-quotes-final.log`: 1/1 aprobado en WebKit móvil. Incluye formulario EN, guardar/reintentar ES, aceptación del cliente, privacidad y snapshot independiente. Se conservan aserciones anteriores, adaptando localizadores a los botones cortos y añadiendo asociación del formulario y orden Cancelar/Guardar.
- Primeros intentos en round3.log: localizador de Importar coincidía también con Importar CSV; corregido con exact:true. Las primeras ejecuciones de cotizaciones agotaron esperas en pasos distintos de carga local. El recorrido completo final pasa sin rebajar aserciones ni ampliar esperas.
- Simulador iPhone 17 Pro / Safari: importación de clientes ES y productos EN inspeccionadas visualmente, ayuda desplegada y Cancelar probado en ambos, regreso a lista verificado. No se seleccionaron archivos ni se escribieron datos desde el simulador. Complementos revisado visualmente mediante captura WebKit EN; no se afirma guardado manual de complementos en Simulator.

Se reutiliza la evidencia previa de Gastos, Categorías y correcciones de pagos: sus componentes no se modificaron en esta tanda. Esto no certifica la totalidad de Pro ni la app nativa distribuida.
