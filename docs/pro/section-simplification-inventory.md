# Inventario de simplificación de Pro

Revisión: 7 de noviembre de 2026. Solo checkout Pro, rama local/pro-suite-no-push, HEAD 06b70019. Este documento describe hallazgos y trabajo pendiente; no certifica implementación ni paridad completa con producción.

## Patrón de referencia

Reutilizar los componentes y jerarquía de Proyectos, Promociones y Empleos: título y regreso, una acción principal, filtros compactos, lista de tarjetas resumidas y detalle separado. El código de referencia inspeccionado incluye client-activity.tsx y StatusFilterTabs. Contrastar además con ambos destinos reales (web móvil y aplicación instalada) antes de afirmar paridad.

- Título: flecha a la izquierda, nombre, menú … a la derecha solo si tiene acciones.
- Lista: botón principal a ancho completo en móvil; filtros; buscador si es útil; tarjetas.
- Filtros: dos pestañas cuando realmente son dos grupos; un selector cuando hay varios estados. No inventar agrupaciones que oculten pendientes ni perder filtros al volver. Limpiar solo con filtros aplicados.
- Tarjeta: nombre, dato que permite identificar, estado o importe relevante; acción principal clara. Detalles/historial dentro.
- Formulario: datos imprescindibles primero, opcionales agrupados; Cancelar seguido de Guardar en pie compartido. Mantener validación, prevención de doble envío, confirmación de descarte y recuperación de guardado incierto.
- Estado vacío: explicación breve y una acción. Evitar dos botones de crear equivalentes.
- Las funciones se conservan; se reduce su exposición inicial. No se cambian cálculos, permisos ni almacenamiento por motivos visuales.

## Revisión sección por sección

| # | Sección | Primera vista propuesta | Simplificación pendiente |
|---|---|---|---|
| 1 | Mi panel | Perfil y accesos actuales | Mantener identidad, ver/compartir perfil y secciones existentes; sin otro resumen operativo duplicado. |
| 2 | Citas | Nueva cita, un selector de estado, lista | En detalle priorizar cliente, servicio, horario y siguiente acción. Acuerdo/cambios/constancia hoy ocupan demasiado espacio. |
| 3 | Disponibilidad pública | Activar/desactivar y horarios | Mantener secundaria dentro de Citas; separar configuración de la lista de solicitudes. |
| 4 | Cotizaciones (dentro de Herramientas) | Nueva cotización, estado, búsqueda, tarjetas | Eliminar subtítulo genérico que no ayuda; priorizar ver propuesta y su siguiente acción. Plantillas y complementos secundarios. |
| 5 | Clientes | Nuevo cliente, Activos/Archivados, búsqueda | En ficha: contacto y solicitudes/trabajos relevantes primero. Fiscalidad, historial extenso y cuentas como accesos específicos. |
| 6 | Herramientas | Filas de navegación del perfil | Evitar paneles explicativos; facturación permanece secundaria y claramente identificada como borradores. |
| 7 | Catálogo | Nuevo producto/servicio, estado, búsqueda | Existencias bajas como estado útil solo para productos controlados; grupos/CSV en …; no repetir ayuda permanente. |
| 8 | Gastos | Nuevo gasto, lista, búsqueda | Revisar necesidad de dos niveles de pestañas al pasar a proveedores; proveedor/trabajo opcionales en formulario. |
| 9 | Proveedores | Nuevo proveedor, Activos/Archivados, búsqueda | Separar acción de crear de filtros; datos de contacto primero; información adicional plegada. |
| 10 | Pagos | Lista, estado, búsqueda | Unificar fechas/exportación secundarias entre versión integrada y modal. En detalle, pago primero y aplicaciones/historial después. |
| 11 | Estado de cuenta del cliente | Saldo, registrar pago, movimientos | Mostrar trabajo y saldo sin obligar a entender aplicaciones a borradores. Correcciones/historial dentro del movimiento. |
| 12 | Pendientes del cliente | Acciones concretas por atender | Integrar en ficha; no crear otra sección principal ni repetir datos ya visibles. |
| 13 | Plantillas y paquetes | Nueva plantilla, filtros, lista | Elegir plantilla debe ser simple; editor separado y conceptos opcionales sin llenar la lista de controles. |
| 14 | Preparar visitas | Tiempos básicos y preguntas opcionales | Reducir párrafos permanentes. Configuración fuera del recorrido diario de solicitudes. |
| 15 | Horas y gastos por trabajo | Resumen y Registrar horas/Agregar gasto | Detalle económico secundario; costos no deben bloquear completar una cita. |
| 16 | Extras y cambios del trabajo | Acceso secundario, indicador de propuesta pendiente | Formulario ya tiene pie uniforme; evitar mostrar todo el historial/acuerdo al abrir cualquier cita. |
| 17 | Constancia del trabajo | Crear/ver constancia cuando es pertinente | No mostrar un formulario largo vacío al consultar una cita; abrirlo al elegir la acción. |
| 18 | Borradores de facturación | Nuevo borrador, filtros y lista | Mantener fuera del menú principal. Cliente y conceptos primero; configuración fiscal avanzada secundaria. |
| 19 | Emisor y datos fiscales del cliente | Datos requeridos organizados por bloque | Reutilizar datos, evitar repetición de textos y mezclar consulta con edición. |
| 20 | Impuestos, descuentos y exoneraciones | Resumen por línea y editar bajo demanda | Conservar precisión y validación; no desplegar todos los supuestos en una factura simple. |
| 21 | Recurrencias y configuración de documentos | Lista/resumen con acción explícita | Opciones avanzadas dentro de facturación, fuera de Citas/Clientes. |
| 22 | Recibos y aplicaciones de pagos | Consultar recibo o distribución específica | Accesos desde pago/cliente; evitar que parezcan otra tarea obligatoria para cobrar. |
| 23 | Grupos/categorías y CSV | Acciones secundarias del catálogo | Importar y organizar bajo …; mantener vista previa/validaciones de importación. |
| 24 | Consulta de identificación | Ayuda dentro de alta/edición de cliente | Evitar otra sección obligatoria; mantener límites de acceso y procedencia de datos. |

## Orden de implementación

1. Citas y detalle del trabajo (mayor saturación observada), conservando acceso a cambios/constancia e indicadores de pendientes.
2. Cotizaciones y ficha de cliente: recorrido solicitud → propuesta → aceptación → trabajo terminado.
3. Catálogo, gastos, proveedores y pagos: misma estructura de listas/filtros.
4. Herramientas secundarias y facturación: exposición progresiva sin pérdida de capacidades.

## Criterios de cierre por sección

Revisar lista con/sin datos, filtros activos/inactivos, creación, edición, errores, Cancelar/Guardar, regresar conservando contexto, ES/EN y ancho móvil. Usar fixtures locales separadas y verificar que datos previos se mantienen. Evidencia automatizada y manual diferenciada. No llamar terminada una sección por haber acomodado sus botones.

## Estado de esta revisión

Inventario y prioridades preparados. No se realizaron cambios de aplicación ni datos durante esta auditoría. La reorganización estructural está pendiente; las correcciones previas de formularios permanecen intactas. Sin push ni cambios en producción.

## Cambio de ubicación autorizado: Cotizaciones

Cotizaciones pasa a la primera fila de Herramientas; se retira del menú principal de Pro (incluido el agregado desde las pestañas normales). Se conservan ruta `quotes`, alias y enlaces contextuales; usuarios sin Pro mantienen su navegación. Pruebas de Herramientas ES/EN aprobadas (2/2, `/tmp/pro-quotes-tools.log`): ausencia en panel, acceso y regreso desde Herramientas, conservación de datos. ESLint focal, TypeScript y diff-check aprobados. No se modifican encabezados, logo ni almacenamiento.
