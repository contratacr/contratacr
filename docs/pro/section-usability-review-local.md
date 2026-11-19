# Revisión de organización de secciones — 7 de noviembre de 2026

Solo checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo previo sin commits, push, migraciones ni cambios de producción.

## Criterio

Reutilizar los componentes existentes de Proyectos/Mi perfil: acción principal clara, filtros antes de búsqueda, tarjetas consistentes y opciones secundarias separadas. No forzar idénticos controles cuando cambia la función: dos estados caben en pestañas; cinco estados se mantienen en un selector. No sustituir producción por esta rama.

## Revisión por superficie

| Superficie | Decisión |
| --- | --- |
| Clientes | Mantener Nuevo cliente ancho, Activos/Archivados, búsqueda, tarjetas Ver/Editar y menú secundario en título. Sin contador de registros cargados. |
| Catálogo | Mantener selector único para productos/servicios/stock, búsqueda después; importación, categorías y exportación en menú del título. |
| Citas | Mantener Nueva cita y selector único de estado, lista sin calendario principal. Disponibilidad pública secundaria. |
| Cotizaciones | Mantener Nueva cotización, selector de estado, búsqueda, tarjetas y plantillas en menú del título. |
| Herramientas | Mantener filas de navegación como Mi perfil; configuración de visitas en pantalla propia. |
| Gastos / Proveedores | Mantener botón principal según pestaña. Cambiar Activos/Archivados de proveedores al componente de pestañas compartido, antes de la búsqueda. |
| Pagos | Mantener estado/fecha/búsqueda y tarjetas. Quitar contador redundante, explicación de totales desplegable; Limpiar filtros solo con búsqueda no vacía, estado o fechas activos. |
| Facturación | Secundaria, solo borradores. Activos/Archivados en pestañas compartidas. Conservar aviso explícito sin validez fiscal ni cobros. No ampliar emisión. |
| Plantillas y paquetes | Nueva plantilla ancho completo; filtro antes de búsqueda. Conservar bloqueo durante guardado incierto, precios e historial. |
| Ficha del cliente / trabajos / costos | Mantener contexto dentro del cliente/cita y advertencias necesarias para interpretar saldos/costos. No crear más secciones principales. |

## Selección de pruebas

Cambios de presentación en Gastos, Facturación, Pagos y Plantillas; sin API/auth/RLS/esquema. E2E funcional de cada superficie modificada, matriz de tarjetas ES/EN de Clientes/Catálogo/Cotizaciones/Citas y menú Herramientas. Reutilizar evidencia anterior de navegación/encabezados/marca: no se modifican sus entradas. TypeScript y ESLint focal. Cuentas desechables en Supabase local; no avisos ni facturas reales.

## Resultados

11 casos distintos aprobados en sus ejecuciones finales: Gastos ES/EN, Facturación, Pagos, Recibos, tarjetas ES/EN, Herramientas ES/EN, Plantillas ES/EN. Logs:
- `/tmp/pro-section-review-tests.log`: 6 aprobados, 2 fallos iniciales de carga/navegación en inglés; se conservaron trazas.
- `/tmp/pro-section-review-final.log`: 6 aprobados, 1 fallo de apertura del selector de plantillas en inglés. Confirma Gastos y tarjetas ES/EN.
- `/tmp/pro-section-review-packages.log`: 2/2 después de controlar explícitamente el estado abierto del selector con React y evitar el toggle nativo simultáneo. No se retiraron aserciones.
- ESLint focal y TypeScript aprobados; `git diff --check` limpio.

Recibos también quedó con filtros antes de búsqueda. Capturas de Clientes, Citas, Cotizaciones, Proveedores y Plantillas inspeccionadas visualmente; conservadas en `research/2026-11-07/section-usability-review/`.

Se preservaron los casos de independencia de líneas, archivo/restauración, historial, recuperación de errores, aislamiento de cuentas y no duplicación. No se ejecutó de nuevo toda la suite ni se certifican todos los formularios fiscales avanzados. La matriz WebKit móvil no equivale a una prueba física ni certifica paridad de toda la app con producción.
