# Secciones nuevas con el estilo de Mis proyectos

Referencia: captura de Mis proyectos compartida por el usuario y el componente
existente `client-activity.tsx`. Trabajo local sobre `local/pro-suite-no-push`,
HEAD `06b70019`, sin ramas nuevas, commits, push ni cambios de producción.

## Resultado

`ProRecordCard` reutiliza Card, Button, CardActionsMenu y la caja de iconos del
panel: borde y sombra, icono de 52px, título/segunda línea, metadatos y fila de
acciones con separación. Conserva abrir detalles mediante la cabecera; no
introduce otro acordeón ni otra pantalla antes del detalle existente.

| Sección | Información útil de la tarjeta | Acciones visibles |
| --- | --- | --- |
| Clientes | Nombre, contacto e identificación disponible | Ver cliente, Editar |
| Inventario | Nombre/código, existencias, precio o servicio | Ver producto/servicio, Editar |
| Citas | Servicio, cliente, horario, estado y origen | Ver cita |
| Cotizaciones | Título, cliente, estado e importe | Ver cotización |
| Gastos/proveedores | Concepto, proveedor, fecha, saldo; contacto e identificación del proveedor | Ver gasto, Editar proveedor |
| Pagos | Cliente, trabajo, fecha, importe, aplicado/disponible y referencia | Ver pago |
| Borradores | Título, cliente/receptor, origen, importe y actualización | Editar borrador |

Herramientas también reutiliza la tarjeta para sus accesos. Se conservan las
opciones secundarias, historial, estados y datos. La facturación sigue en su
ubicación secundaria y solo prepara borradores.

`ProSectionActions` coloca el menú de sección junto al título, a la derecha,
en la cabecera visible (web móvil, modo nativo o escritorio). El menú de cada
registro sigue en la tarjeta. Se mantiene una salida de respaldo para las
rutas independientes sin cabecera del panel. Solo el disparador de importar
se mueve al encabezado; CatalogImport y el formulario permanecen montados para
conservar el estado al cambiar de ancho.

Acción de crear a todo el ancho en teléfono, filtros antes de búsqueda, sin
contador de registros cargados ni limpiar filtros cuando no hay filtros.
Las etiquetas de las acciones admiten salto de línea en pantallas pequeñas.

## Selección y evidencia

Cambios de presentación compartida y ubicación de acciones. No cambian APIs,
esquema, permisos ni cálculos. Se seleccionan recorridos reales del panel,
importación, paginación/aislamiento, citas, gastos, borradores y pagos, además
del contrato obligatorio de marca.

- Nueva matriz ES/EN en WebKit móvil: tarjetas, detalles, edición, menú junto
  al título, vuelta al listado, menú fuera del botón de crear, anchura, cambio
  de escritorio/teléfono y controles en 320px. Web 2/2 en
  `/tmp/pro-project-style-complete.log`; modo nativo simulado EN aprobado en
  `/tmp/pro-project-style-native-final.log` y ES en
  `/tmp/pro-project-style-native-es.log`.
- Marca 3/3 en WebKit móvil, Chromium móvil y escritorio:
  `/tmp/pro-project-style-brand.log`.
- Citas ES/EN, catálogos, historial de navegación y usabilidad/importación:
  seis casos aprobados en `/tmp/pro-project-style-regression.log`.
- Gastos/proveedores, pagos parciales, reversos y conservación del histórico:
  1/1 en `/tmp/pro-project-style-expenses-final.log`.
- Gestión de borradores y pagos recibidos, conservación/aislamiento y vuelta
  exacta al origen: 2/2 en `/tmp/pro-project-style-complete.log`.
- TypeScript y ESLint de los componentes Pro y de la nueva matriz sin errores;
  registros `/tmp/pro-project-style-final-types.log` y
  `/tmp/pro-project-style-final-lint.log`. Diff revisado sin errores de espacios.

La evidencia funcional anterior al ajuste final de padding del pie y al
parámetro opcional de accesibilidad de borradores se reutiliza para flujos de
catálogo/citas: no cambian sus callbacks, datos, selección ni permisos. La
matriz final valida el componente visual actualizado en ambos idiomas y modos.

Se conservan fallos iniciales: el nuevo test buscaba Cancelar en un formulario
que cierra con Cerrar (selector corregido), una tanda coincidió con recarga de
desarrollo y un arranque frío no terminó de cargar el catálogo antes del plazo.
La matriz espera ahora la hidratación antes de comprobar las tarjetas; no se
redujeron conteos ni aserciones de datos, permisos, navegación o cálculos.

Capturas revisadas en `research/2026-11-07/project-style-sections/`. Son pruebas
web con runtime nativo simulado, no una certificación del binario instalado.
Solo cuentas y datos desechables en Supabase local; no facturas emitidas ni
notificaciones reales. No se modifica main/mobile.
