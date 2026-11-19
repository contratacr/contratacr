# Estado de cuenta y pendientes por cliente — Pro local

28 de octubre de 2026. Solo `local/pro-suite-no-push`. Sin emisión fiscal, envíos ni cambios en producción.

## Uso

En Clientes → ficha → **Estado de cuenta**, se consultan los importes acordados, los abonos activos y el saldo por cobrar de todos los trabajos del cliente. El historial muestra los acuerdos anteriores, sus sustituciones, los abonos y sus anulaciones; cada movimiento de trabajo abre su gestión y permite regresar a la misma ficha. La fecha efectiva del pago se distingue de la fecha de registro. Cuando falta, se muestra como no indicada.

Los pagos directos aparecen por separado: no se descuentan de un trabajo sin asociación explícita. Las cotizaciones, los borradores de factura y los materiales incluidos en un acuerdo no generan cargos adicionales. Los registros de trabajos cancelados se conservan; cancelar una cita no anula un acuerdo o un abono. El saldo positivo y los importes a favor se muestran por separado, sin compensarlos entre trabajos.

**Qué sigue con este cliente** presenta citas pasadas que requieren revisión, próximas citas, cotizaciones por preparar, enviadas esperando respuesta y aceptadas sin cita asociada. Son sugerencias operativas, no vencimientos de cobro ni cambios automáticos de estado. Una cotización aceptada puede no necesitar cita. Se excluyen citas finalizadas/canceladas y cotizaciones aceptadas que ya tienen trabajo activo vinculado. No se añaden filtros: los contadores explican la lista y cada fila abre la acción correspondiente.

## Datos y acceso

- `/api/pro/client-statement`: movimientos de 20 en 20, resumen global independiente de la página, cursor estable por fecha de registro/ID y huella para impedir mezclar revisiones.
- `/api/pro/client-pending`: páginas de 6, resumen global, prioridad/fecha/clave estable, instante de clasificación fijo durante la paginación y huella de los candidatos.
- Ambas consultas usan tablas normalizadas y el propietario de la sesión validado por `proApiAccess`. No descargan el JSON del workspace ni aceptan un propietario suministrado por el cliente.
- Funciones SQL de lectura con permisos exclusivos para `service_role`, sin nuevas tablas ni reescritura de documentos.
- SQL aditivo: `sql/client-statement-local.sql` y `sql/client-pending-local.sql`. Incluido en el preparador local después de sus dependencias; no ejecutar el preparador completo sobre datos existentes para instalar únicamente estas funciones.
- Errores recuperables, actualización explícita y bloqueo de la paginación si cambian los datos. Navegación por las utilidades existentes de Pro.

## Validación

Las pruebas aisladas `scripts/pro/verify-client-statement-db.mjs` y `scripts/pro/verify-client-pending-db.mjs` comprueban cálculos, anulaciones, acuerdos sustituidos, separación de pagos directos, exclusión de borradores como deuda, páginas con fechas empatadas, categorías de pendientes, propiedad, permisos y conservación exacta al consultar/reinstalar. Ejecución aprobada en bases efímeras, sin datos reales.

La prueba `tests/e2e/pro-client-statement.spec.ts` usa cuentas locales desechables y comprueba APIs y recorridos de interfaz, fallos recuperables, navegación de regreso, páginas y conservación. Se acompaña de los consumidores existentes de ficha, historial, fiscal, agenda y pagos. Resultado final: **18/18 E2E** aprobados: 3 del nuevo flujo y 15 de los cinco consumidores existentes en WebKit móvil y Chromium móvil/escritorio. Evidencia: `/tmp/pro-client-statement-final` y `/tmp/pro-client-account-regression`. Las capturas móviles se inspeccionaron y se corrigieron la referencia duplicada y la separación de acciones; después se repitieron los 3 casos del flujo nuevo, todos aprobados.

Dos intentos iniciales del nuevo recorrido fallaron al hidratar durante actualizaciones HMR del servidor de desarrollo; uno registró `Invalid or unexpected token` antes de consultar el catálogo. Con el código estable se aprobaron los tres perfiles sin aumentar timeouts, omitir casos ni debilitar aserciones.

TypeScript, ESLint, UTF-8, presupuesto bilingüe y `git diff --check` aprobados. Los seis verificadores de conservación histórica confirmaron que documentos, revisiones, tablas normalizadas, borradores/líneas, configuración fiscal y pagos originales permanecen exactamente iguales. Las cuentas creadas por los E2E se eliminaron mediante su limpieza desechable. No se hizo push.

La app actualmente instalada en el simulador apunta a `https://contratacr.com/es`; no representa este checkout Pro. La comprobación móvil de esta entrega se realiza contra el servidor local en WebKit y Chromium. No se presenta como prueba de la app nativa ni se utiliza producción para crear fixtures.
