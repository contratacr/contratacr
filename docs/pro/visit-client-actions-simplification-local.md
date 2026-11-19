# Tiempos de visita y acciones de cliente — 8 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo existente preservado. Sin push/commits, cambios de esquema, producción ni emisión de documentos.

## Cambios

- Preparar visitas: anticipación con opciones legibles en minutos, horas y días. Otro tiempo conserva el campo numérico con sus límites anteriores. Cualquier valor guardado que no coincida con las opciones se muestra como personalizado; no se redondea ni reescribe.
- Preguntas: la restricción a un servicio concreto queda secundaria. El campo sigue montado y se abre si ya contiene un servicio; no se borran sus datos ni cambia la coincidencia del servidor.
- Configuración: textos cortos Cancelar/Guardar, conservando guardia de salida y reintento del mismo guardado incierto.
- Operaciones del cliente (importe, material, abono y reversos): Cancelar antes de Guardar en el pie existente. Cancelar reutiliza el cierre de la flecha; no se cambian payloads, revisiones, cálculos, historial ni facturación.

## Selección de pruebas

Contratos existentes de preparación ES/EN y operaciones del cliente, con comprobación añadida de cancelación en inglés sin cambiar saldos y asociación del botón Guardar al formulario. Se conservan las aserciones de preguntas requeridas, historial congelado, márgenes de agenda, materiales, abonos y reversos.

Fixtures profesionales coherentes solo para las cuentas desechables de estas pruebas; no se modifican permisos del producto. Se reutiliza evidencia previa de importaciones, catálogo, gastos y complementos porque sus componentes no se alteraron.

Simulador: se abrió Preparar visitas y se inspeccionó la presentación inglesa con el nuevo selector. La sesión conserva inglés aunque se intente la ruta /es; no se presenta como una prueba manual en español. Al tocar el selector, el control devolvió noWindowsAvailable; no se guardaron cambios manuales ni se certifica el recorrido completo en Simulator.

Resultados:
- `/tmp/pro-tools-round5.log`: preparación ES/EN aprobada (2 casos). El primer caso de operaciones falló por localizador parcial Definir importe que coincidía con otra acción; se corrigió a exact:true conservando el contrato.
- `/tmp/pro-tools-round5-operations.log`: operaciones aprobado (1/1), con cancelación EN y recorrido completo ES.
- ESLint focal, TypeScript y diff-check sin errores.
- Capturas inspeccionadas de configuración con tiempo personalizado y formulario de importe EN. No se cambian configuraciones reales para obtener capturas.
