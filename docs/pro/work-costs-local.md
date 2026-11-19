# Horas, gastos y resultado por trabajo — Pro local

28 de octubre de 2026. Solo checkout Pro y rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push ni emisión fiscal. Los registros anteriores se conservan.

## Uso

En Clientes → ficha → Gestionar trabajo se encuentra **Costos y resultado**. También se abre desde el detalle de la cita en Agenda mediante **Ver costos y resultado**, conservando la cita y los filtros de origen al regresar.

La sección reúne materiales utilizados, mano de obra, otros gastos y el total registrado. Compara ese costo con el último importe acordado del trabajo para mostrar su resultado. Los abonos del cliente y los pagos a proveedores no se vuelven a contar como ingresos o gastos: pagar una deuda cambia el dinero pendiente, no el costo del servicio.

**Registrar tiempo** pide fecha, horas y minutos, y un costo por hora opcional. La tarifa es el costo del profesional, no el precio cobrado al cliente. Una tarifa vacía significa costo desconocido; cero solo significa costo nulo explícito. Si quedan horas sin valorar, se muestra resultado incompleto. Sin importe acordado tampoco se inventa una ganancia: se ofrece definirlo mediante el flujo existente. Los resultados negativos se conservan.

**Registrar gasto** crea un gasto en el módulo existente y lo vincula al trabajo en una sola transacción, usando un proveedor guardado. **Vincular gasto existente** permite reutilizarlo sin registrarlo dos veces. La asignación usa el importe completo y solo un trabajo activo por gasto; todavía no se divide un gasto compartido entre varios trabajos. Los proveedores se crean en Gastos y proveedores.

Los materiales utilizan su costo histórico al registrarlos; cambiar el costo del catálogo no revaloriza el trabajo anterior. Las devoluciones reducen ese costo. Los gastos adicionales deben ser conceptos como transporte o alquiler: la pantalla advierte que no se deben volver a vincular compras de materiales cuyo costo ya se contabilizó mediante materiales utilizados. No se infiere el contenido de una compra por su texto.

## Cálculos e historial

- Mano de obra: minutos × costo por hora / 60, redondeado a céntimos por registro mediante aritmética entera/numeric. Un registro admite de 1 a 1440 minutos; cantidades adicionales se registran por fecha.
- Costos registrados = materiales netos + tiempo valorado activo + gastos vinculados activos.
- Resultado = importe acordado − costos registrados, siempre que exista importe y no haya tiempo sin valorar. No representa utilidad contable neta ni incorpora automáticamente gastos generales o cálculos fiscales.
- Se cuentan los gastos registrados elegidos, aunque no estén pagados. El módulo general permite gastos con fecha futura: si se vinculan explícitamente, forman parte de esta comparación de registros. No es un informe de caja ni un corte fiscal por período.
- Corregir tiempo conserva el registro original y su anulación con motivo, y crea el registro corregido. Anular tiempo retira su costo actual y conserva el historial.
- Desvincular conserva el gasto y sus pagos en Gastos y proveedores. Guarda su importe vigente al desvincular; el evento original conserva el importe con el que se vinculó. Si se vuelve a vincular después, se crea un evento independiente.
- Editar un gasto en su módulo actualiza su costo vigente en el trabajo. La huella de lectura detecta ese cambio entre páginas. Un pago al proveedor no reduce ni aumenta su costo.
- No se modifican importes acordados, abonos del cliente, documentos anteriores ni inventario al registrar horas o gastos. Cotizaciones y borradores de factura no aportan ingresos adicionales al resultado.

## Persistencia y acceso

La extensión SQL `sql/work-costs-local.sql` crea registros de costos, asignaciones activas de gastos, revisiones y solicitudes idempotentes. Consulta tablas normalizadas; no descarga ni reescribe el JSON del workspace. La escritura reutiliza `pro_expenses_save` para crear el gasto canónico dentro de la misma transacción que su asignación. Un fallo revierte ambas operaciones.

`/api/pro/work-costs` reutiliza `proApiAccess`, origen verificado en escrituras y propietario de sesión. RLS limita la lectura de tablas al dueño, y solo `service_role` puede escribir o ejecutar funciones detrás del API validado. CAS separa revisión de costos y revisión de gastos. Los reintentos con el mismo identificador y cuerpo exacto resuelven el resultado anterior antes de comprobar revisiones.

Una respuesta perdida bloquea edición y salida hasta reintentar la misma solicitud. Un conflicto confirmado conserva el formulario y pide actualizar. El historial y los gastos disponibles se consultan de 20 en 20; el resumen abarca todos los registros y una huella impide mezclar páginas de datos cambiados. Los gastos ya asignados no aparecen de nuevo en candidatos.

El trabajo no puede cambiar de propietario, ID o cliente tras guardar costos, para conservar su asociación histórica. Cancelar un trabajo o archivar un cliente conserva sus costos y permite anulaciones/desvinculaciones con motivo; bloquea registros nuevos. La eliminación completa de una cuenta desechable sigue limpiando sus filas mediante las relaciones existentes.

## Selección de pruebas

Dinero, nuevas tablas/RLS y creación compuesta requieren cobertura del dominio/SQL aislado, límites, redondeos, propietario, concurrencia, idempotencia, atomicidad, instalación aditiva y conservación. Los consumidores seleccionados incluyen operaciones del cliente, gastos/proveedores, estado de cuenta, agenda y borradores de trabajo; el motor fiscal no cambia y conserva su evidencia compatible. No se repiten CI, tiendas ni pruebas físicas aprobadas.

Las pruebas usan cuentas desechables en Supabase de loopback y bases efímeras. Los verificadores de preservación comparan los registros originales. Se identifican las capturas locales como navegador WebKit/Chromium; la app instalada en el simulador apunta a la aplicación pública y no se usa para validar Pro.

## Evidencia

Verificador `scripts/pro/verify-work-costs-db.mjs` aprobado en PostgreSQL aislado: redondeo exacto, tarifa desconocida frente a cero, edición/anulación histórica, materiales devueltos, gastos canónicos y sus pagos, modificación de importes, creación/asignación atómica, idempotencia, exclusión de doble asignación, revisiones/páginas, permisos, reasignación de cliente rechazada, limpieza de cuenta y reinstalación conservadora.

La revisión independiente detectó y corrigió el importe histórico al desvincular un gasto modificado y la precarga del formulario de tiempo al recargar su URL. Cobertura final: **18 combinaciones E2E aprobadas** (3 del nuevo recorrido y 15 de cinco consumidores existentes) en WebKit móvil y Chromium escritorio/móvil. Se obtuvo entre rondas compatibles, no en una única ejecución íntegra de 18:

- `/tmp/pro-work-costs-reviewed.log`: nuevo recorrido 3/3 aprobado. Incluye costos exactos, pago del cliente y proveedor sin alterar resultado, modificación de gasto canónico, devolución de materiales, tarifa desconocida y cero, corrección auditada, reintento exacto tras pérdida de respuesta, propietario/origen/RLS/CAS, páginas, recarga de edición y regreso a Agenda con estado de historial perdido.
- `/tmp/pro-work-cost-consumers.log`: 14/15 aprobados. El caso de estado de cuenta en Chromium escritorio se interrumpió por una recarga completa del documento durante Fast Refresh: la segunda página respondió 200 y luego el navegador volvió a cargar la primera. La traza permitió identificar esa recarga, sin modificar producto ni aserciones.
- `/tmp/pro-work-cost-statement-reviewed.log`: solo ese consumidor/perfil volvió a ejecutarse con código estable, 1/1 aprobado, conservando aserciones y tiempos.
- Los intentos previos del nuevo test corrigieron un selector de nota plegada y una expectativa de formato inglés: `proMoney` usa el formato CRC de la aplicación también en inglés (`₡574,50`). Se conservó el importe exacto esperado, sin debilitar la comprobación. Una ejecución intermedia recibió HTTP 500 vacío del servidor de desarrollo al registrar material antes de usar la nueva API; no reapareció en la ronda final estable. No se añadieron reintentos automáticos ni se aumentaron timeouts.

Capturas de `/tmp/pro-work-costs-reviewed` inspeccionadas en español e inglés, incluyendo `work-cost-summary.png`, `work-time-form.png` y `work-cost-summary-english.png`. Ejemplo ficticio validado: importe acordado 1000CRC, mano de obra 350CRC, otros gastos 75,50CRC, materiales devueltos netos0CRC, costo425,50CRC y resultado574,50CRC. El abono400CRC deja saldo600CRC y no altera el resultado.

TypeScript, ESLint focal, UTF-8, presupuesto bilingüe y diff check aprobados. Se añadió una restricción de integridad aditiva que impide duración NULL en registros de tiempo e importe NULL en gastos, manteniendo la tarifa desconocida intencional. El verificador aislado comprobó el rechazo directo, conservación, reinstalación y limpieza de cuenta.

Los siete verificadores privados de preservación confirmaron igualdad exacta de documentos/revisiones, tablas normalizadas, borradores/líneas/materiales/detalles, configuración fiscal, pagos y gastos/proveedores originales. Se conservan los registros previos de dos cuentas: 11 trabajos, 10 cotizaciones heredadas, 50 disponibilidades, 46 clientes, 45 productos y 10 movimientos. Las cuentas desechables se limpiaron al finalizar. No hubo push, emisión fiscal, transferencias ni notificaciones reales.
