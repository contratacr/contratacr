# Pagos y estado de cuenta — 8 de noviembre de 2026

Solo checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo previo preservado. Sin push, commits, producción, migraciones o emisión de documentos.

## Cambios

- Pagos: cada búsqueda/filtro/actualización tiene una identidad propia de carga. Volver rápidamente a un filtro anterior no reutiliza su lista antigua para paginar mientras está pendiente la consulta nueva. Se descartan errores y resultados de consultas anteriores. No se cambian API, datos, cálculos ni exportaciones.
- Estado de cuenta: el detalle de importes disponibles para borradores queda bajo una opción secundaria. Saldo de trabajos, abonos y pagos directos siguen visibles. Se mantienen sus explicaciones y sus importes completos.

## Pruebas seleccionadas

Contratos de Pagos y Estado de cuenta ES/EN. Se conserva la prueba de paginación 20→28 tras filtro rápido y Limpiar filtros; se añade el mismo recorrido en la vista inglesa de Pagos dentro de Herramientas. Estado de cuenta comprueba el detalle de borradores plegado y desplegado, sin eliminar las aserciones de saldos, historial, permisos y navegación.

Fixtures de cuentas desechables profesionales coherentes con el panel. No se cambian usuarios existentes ni permisos del producto. Se reutiliza evidencia de los otros formularios que no cambian en esta tanda.

ESLint focal, TypeScript y diff-check sin errores. Primera ejecución: Pagos y estado de cuenta ES aprobados; estado de cuenta EN agotó la espera al cargar la ficha (captura Loading record), antes de llegar a la sección modificada. Su resultado se registra por separado tras repetir solo ese caso.

Simulador: se intentó abrir Pagos, activar la ventana desde Window y operar el selector visible. El control devolvió noWindowsAvailable al tocar, aunque captura y menús nativos responden. No se afirma prueba manual de Pagos/estado de cuenta en ES/EN ni se modificaron datos desde Simulator.

Resultados finales: `/tmp/pro-tools-round6.log` contiene Pagos aprobado (con el recorrido de Herramientas EN añadido) y estado de cuenta ES aprobado. `/tmp/pro-tools-round6-english.log`: estado de cuenta EN aprobado, 1/1. Se mantienen todas las aserciones de conservación de documentos, saldos y movimientos. Captura ES inspeccionada; se iguala además el borde del bloque de pagos directos al gris del resto de formularios.

No se declara cerrada la prueba manual del simulador: el bloqueo de entrada persiste. Los recorridos funcionales citados son de WebKit móvil automatizado.
