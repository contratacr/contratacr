# Herramientas: formularios y acciones — 8 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo previo preservado. Sin push, commits, migraciones ni acceso de escritura a producción.

## Cambios

- Gastos, proveedores y sus pagos/reversos usan el Modal compartido de pantalla completa en móvil, con Cancelar antes de Guardar.
- Nuevo/editar gasto: proveedor, concepto, importe y fecha. Vencimiento es secundario; se muestra abierto si el gasto ya tiene uno. El campo permanece montado para conservarlo incluso plegado.
- Retirados del formulario de gasto los párrafos fiscales y la moneda duplicada; el importe sigue siendo CRC y mantiene su validación exacta.
- Categorías y administrador compatible de grupos: campo de nombre en su propia fila; acciones al final, Cancelar antes de Guardar. No se recupera la opción de grupos en el menú de Clientes.
- Corregir datos del pago: Cancelar y Guardar juntos al final. Bloqueo por guardado incierto, motivo obligatorio, importes e historial conservados.
- Facturación sigue aparte. No se cambian borradores, cálculos fiscales ni emisión de documentos.

## Evidencia y límites

Se reutiliza la evidencia previa de Servicios frecuentes ES/EN (2/2), ya que sus componentes no cambian en esta tanda. Se seleccionan contratos de Gastos ES/EN, Categorías/grupos y corrección de pagos ES/EN; sin cambios de API, autenticación, RLS o esquema del producto.

Las fixtures de Gastos se completaron con perfil profesional/metadatos y registro profesional desechable para evitar el alta inicial. La prueba del administrador compatible abre el paso mediante navegación de query del mismo documento, necesaria para probar su guardia de regreso; una navegación completa con goto prueba salida del documento, un recorrido diferente. Se conservan las aserciones de descarte y datos.

Simulador: Safari, iPhone 17 Pro. Formulario Nuevo gasto inspeccionado visualmente: campos ordenados, vencimiento plegado y pie Cancelar/Guardar sin recortes. El siguiente toque devolvió noWindowsAvailable; no se certifica guardado manual ni revisión manual de todos los formularios. No se modificaron datos desde el simulador.

Resultados finales:
- `/tmp/pro-tools-next-verified.log`: Categorías/grupos y Gastos ES/EN, 3/3 aprobados.
- `/tmp/pro-tools-payment.log`: correcciones de pagos ES/EN, 2/2 aprobados.
- `/tmp/pro-tools-due-date.log`: Gastos ES ampliado con edición y vencimiento plegado, 1/1 aprobado; importe, vencimiento y movimientos anteriores conservados.
- ESLint focal, TypeScript y diff-check sin errores. Capturas automatizadas inspeccionadas de Gastos EN y administrador de nombres ES.

Las primeras ejecuciones fallidas quedan en `/tmp/pro-tools-next.log`; no se usan como evidencia verde. Esta tanda no certifica todas las secciones de Pro ni la app nativa instalada.
