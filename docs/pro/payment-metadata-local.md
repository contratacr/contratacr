# Correcciones de datos del pago — sólo local

Base y HEAD: `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama `local/pro-suite-no-push`. Se conserva todo trabajo previo; no push, producción ni emisión.

Fecha de recepción, medio y referencia se corrigen desde el detalle de Pagos recibidos. Se exige motivo y se conserva historial de antes/después, cuenta propietaria, revisión y fecha. El importe, aplicaciones, ledger original y recibos preparados se conservan. Los históricos sin metadata mantienen valores anteriores desconocidos, sin inventar fecha efectiva. Las lecturas muestran datos vigentes; las instantáneas originales no se reescriben.

## Selección previa de pruebas

La extensión añade escritura privada auditada y cambia metadatos efectivos de consumidores: cobertura amplia delimitada a pagos, consultas y recibos. Verificador SQL aislado: roles/RLS, propietarios, validación, revisión, idempotencia, conservación, paginación y consumidores al reutilizar. E2E nuevo en Chromium móvil/escritorio y WebKit móvil; regresiones invoice-payments, payment-overview y payment-receipts en los tres perfiles. Se reutiliza evidencia de impuestos, totales, materiales y saldos de la entrega previa porque no se modifican sus cálculos ni contratos. TypeScript, lint focal, UTF-8, presupuesto bilingüe y diff-check. Simulador iOS con fixture exclusivamente local desechable y limpieza verificada. No suite global por no modificar autenticación/navegación/estilos globales.

## Resultados — 27 octubre 2026

- SQL aislado PASS: `/tmp/pro-payment-metadata-db.log`. Validación de fechas reales hasta hoy CR, motivo/no-op, revisión optimista, reintento con input idéntico y rechazo de UUID reutilizado con otro contenido, historial paginado, nulos históricos, reverso vivo, roles reales/RLS/grants, reinstalación y cascadas. Snapshot base/recibos inmutable. La prueba aislada de dos escritores usa revisiones serializadas; la E2E añade peticiones simultáneas reales a PostgreSQL local.
- Compatibilidad aislada previa: invoice-payments y payment-overview PASS. Nueva extensión y consumidores instalados sólo en loopback, sin reset ni preparador completo. Orden: `invoice-payments-local.sql`, `payment-overview-local.sql`, `payment-metadata-local.sql`. La última se incorpora al preparador para instalaciones futuras.
- E2E nueva inicial 3/3 PASS. Se amplió para simular POST confirmado en servidor cuya respuesta se pierde, reintento exacto sin duplicar, y GET posterior503: `/tmp/pro-payment-metadata-final.log` 3/3 PASS. Además de concurrencia real200/409, conflicto UI conserva campos y exige revisión; historial original y metadata efectiva para futuras aplicaciones, fechas antiguas desconocidas, pagos anulados sólo lectura, origen/propietario y recibos intactos.
- Consumidores: `/tmp/pro-payment-metadata-consumers.log` 9/9 PASS (invoice-payments, payment-overview y payment-receipts en Chromium móvil/escritorio y WebKit móvil). Revisión posterior corrigió etiqueta standalone que aún mostraba referencia base; SQL aislado valida etiqueta/referencia vigentes y base intacta. Reaplicado sólo consumidor y repetido invoice-payments: `/tmp/pro-payment-metadata-reuse-final.log` 3/3 PASS. Repeticiones no se cuentan como combinaciones adicionales.
- Revisión visual WebKit móvil detectó fecha general desactualizada después de recargar un conflicto: historial mostraba3oct mientras ficha aún2oct. Corregido aviso al padre tras lectura completa de revisión diferente. Test exige referencia/fecha generales actualizadas conservando la edición escrita. Resultado final de esta ampliación: `/tmp/pro-payment-metadata-refresh-final.log` **3/3 PASS**. En conjunto, 12 combinaciones funcionales únicas aprobadas al sumar los nueve consumidores; no se suman repeticiones. Captura final inspeccionada: ficha e historial muestran3oct de forma consistente.
- Corrección de cierre local: Escape desde enlace profundo con formulario sucio ya no cierra el listado de fondo; confirmaciones no se duplican ni pierden campos. No se modificó Modal/navegación global. Caso cubierto en E2E.
- TypeScript y lint focal finales: `/tmp/pro-payment-metadata-tsc-final3.log`, `/tmp/pro-payment-metadata-lint-final3.log` sin errores. UTF-8, presupuesto bilingüe sin aumentarlo y diff-check PASS.
- Conservación de originales: helpers de workspace, paneles normalizados, borradores/líneas/materiales/emisor y metadata nativa PASS. La cuenta local demo sigue sin suspensión. No emisión, cobro, envío ni push.

## Simulador: corrección manual verificada

En iPhone17Pro/iOS26.5 se abrió el formulario sobre un pago descartable local de ₡123, cambió la fecha de 1 a 26 octubre2026, el medio de Efectivo a SINPE y la referencia de prueba; el motivo quedó registrado. La ficha mostró los valores vigentes y el historial mostró cada valor anterior/nuevo y el motivo. La interacción nativa se completó correctamente.

Verificador privado PASS: la única corrección pertenece al pago ficticio, revisión1 y cuenta propietaria; importe/fecha/medio/referencia de la instantánea original, saldo y aplicaciones siguen intactos. Al terminar se borraron sólo el pago descartable y su cambio auditado; las doce tablas del dueño vuelven a coincidir exactamente con la captura previa. Pagos recibidos quedó abierto con los datos originales. La cuenta local demo continúa sin suspensión por autorización anterior.

Captura del historial funcional WebKit móvil: `/tmp/pro-payment-metadata-refresh-final/pro-payment-metadata-Pro-p-25f31-and-historical-preservation-webkit-mobile/payment-correction-history.png`. Pruebas automáticas focales y resultados previos siguen en las rutas de log indicadas arriba; no se repitieron. Sin push, emisión, cobro, envío ni cambios fuera de Pro.

