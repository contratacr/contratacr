# Orden y alineación de campos — 7 de noviembre de 2026

Pro local, `local/pro-suite-no-push`, HEAD `06b70019`. Sin push, commits, migraciones ni producción. Se conserva el trabajo previo.

Filas de Plantillas, líneas/descuentos de factura, descuentos guardados y artículo/inciso de exoneración pasan a una columna en móvil. En pantallas >=640 px se conservan dos columnas alineadas por abajo. Identificación y ubicación fiscal alineadas en pantallas amplias. Bloques opcionales de cliente/producto mantienen una sola columna porque Grupo/Categoría son controles compuestos de altura variable.

No se cambian nombres, valores, validaciones, cálculos ni persistencia. Los pares cortos de horas/minutos ya tenían alineación; no se modifican calendarios ni resúmenes de importes.

Validación seleccionada: E2E de formularios generales, datos fiscales de cliente, líneas de factura, impuestos, descuentos guardados y Plantillas ES/EN. Se agregan aserciones de posición vertical, mismo inicio horizontal y ancho de cantidad/precio en Plantillas móvil. Capturas inspeccionadas y guardadas en `research/2026-11-07/field-order/`. TypeScript y ESLint focal aprobados.

Primer intento `/tmp/pro-field-order-tests.log`: 4 aprobados; 3 interrumpidos por timeouts durante compilación local (requests de 15 s y bootstrap de 30 s). Logs del servidor atribuyen la demora a Next. Repetición de esos mismos casos, sin cambiar aserciones: `/tmp/pro-field-order-recovery.log`. No se alteran encabezados compartidos ni marca; no se repite suite global. WebKit móvil no certifica una revisión física ni todos los formularios de producción.

Cierre: los 7 casos distintos aprobaron en sus ejecuciones finales. `/tmp/pro-field-order-recovery.log`: datos fiscales y descuentos aprobados; formulario general falló al comprobar contenido mientras seguía «Creando…». Se agregó espera explícita del POST de cotización (y aserción de respuesta exitosa), conservando comprobaciones de texto, cantidad de POST e integridad de datos. `/tmp/pro-field-order-forms.log`: 1/1 aprobado. Diff-check limpio. No se certifica layout de escritorio con esta tanda móvil.
