# Formularios secundarios — 7 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin commits/push, migraciones ni modificaciones a producción. Trabajo local anterior preservado.

## Cambios

- Plantillas: Guardar y Cancelar en el pie fijo del Modal compartido; envío asociado al formulario, validación HTML y bloqueo durante guardado/respuesta incierta preservados. Lista con Activas/Archivadas y buscador compartidos; campo opcional fiscal sigue plegado.
- Grupos/categorías: presentación móvil de pantalla completa. Formulario separado antes de filtros y búsqueda. Selector único para Activos/Archivados/Nombres existentes; las pestañas iniciales se descartaron después de comprobar visualmente que el tercer nombre quedaba fuera de vista. Explicaciones históricas disponibles bajo un desplegable.
- Revisados los formularios de datos fiscales, emisor y costos: ya usan el pie fijo compartido y protecciones de cambios pendientes; sin cambios en ellos en esta tanda. Correcciones de pagos permanecen dentro del detalle de pago para conservar su contexto.

## Validación seleccionada

Impacto de UI limitado a dos componentes. Casos existentes de Plantillas ES/EN (copias independientes a cotización y borrador, edición, archivo/restauración y reintento sin duplicados); Grupos (nombres históricos, asignaciones, conflictos, permisos y navegación con cambios sin guardar). Se añaden comprobaciones de ubicación de formulario y asociación del botón Guardar al formulario. No se debilitan aserciones. TypeScript y ESLint focal; sin cambios en encabezados compartidos/marca.

Primer intento: 1 aprobado, 2 fallos antes de abrir las pantallas. Las cuentas desechables tenían `profiles.is_provider=true` pero rol/metadatos de cliente; se corrigieron solo las fixtures de estos tres tests para mantener rol profesional y datos de sesión coherentes. No se modificaron permisos del producto ni cuentas existentes.

`/tmp/pro-secondary-forms-final.log`: 3/3 aprobados. La revisión posterior del filtro de Grupos se valida por separado en `/tmp/pro-secondary-groups-final.log`. Capturas inspeccionadas: formulario largo de Plantillas con pie fijo y pantalla Grupos. Esto es WebKit móvil automatizado, no una prueba física ni una certificación de todos los formularios avanzados.

Resultado final de Grupos: `/tmp/pro-secondary-groups-verified.log` 1/1 aprobado. El intento previo con selector nuevo encontró un localizador antiguo de botón en Categorías; se adaptó a seleccionar el mismo valor, preservando todas las aserciones. TypeScript y ESLint focal aprobados, diff-check limpio. Capturas en `research/2026-11-07/secondary-forms/`.
