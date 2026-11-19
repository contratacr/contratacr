# Pagos aplicados a borradores — local Pro

HEAD/base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`; rama `local/pro-suite-no-push`. Cambios previos conservados. Sin push, producción, emisión, cobro ni envío real.

## Utilidad y decisión previa

Permitir ver cuánto dinero recibido está asignado a un borrador y cuánto falta; reutilizar abonos existentes en lugar de registrarlos dos veces. Fecha efectiva de recepción, medio y referencia opcional. El estado fiscal y la deuda del trabajo siguen separados; el borrador no genera una segunda cuenta por cobrar. La fecha de registro de un abono histórico no permite inferir cuándo fue recibido: se pide confirmarla al primer enlace.

Referencia: auditoría GTI guardada en `gti-parity-ledger-local.md` (#16/#17). [GTI oficial](https://www.facturaelectronica.cr/NuestroServicio) ofrece borradores y búsquedas/reportes por cliente y estado; su página pública no detalla aplicaciones. [Documentación primaria Alegra, Ingresos y Cobros](https://docs.alegra.com/manuales/alegra-contabilidad/ingresos-cobros.html#registrar-un-pago-desde-una-factura-de-venta) confirma el patrón de registrar desde la factura y pedir fecha recibida/contacto/medio. Se toma ese patrón de interacción, no sus reglas tributarias ni acciones de emisión. Nuestra decisión: entrada en borrador guardado, reutilizar el cliente, importe sugerido por saldo, referencia opcional, un solo pago compartido con el trabajo, aplicar/quitar sin devolver dinero. Esto es diseño validado técnicamente, no estudio con usuarios reales.

## Selección de pruebas previa

Cambio aditivo con RLS y dinero/ledger compartido: SQL aislado amplio (aplicaciones parciales, límites, fecha válida/no futura, idempotencia, reversos, aislamiento y cascadas, guardia de total final y ausencia de doble deuda/stock); nueva E2E en Chromium escritorio/móvil y WebKit móvil con dos dueños y anónimo, flujo manual de simulador. Consumidores: ledger clientes, recibos, edición de detalle y gestión/copia/archivo de borradores. Política Pro leída; política reciente main sólo lectura como referencia, sin fusionar. Reutilizar evidencia compatible de catálogos, impuestos sin cambios, marca/nav globales y tiendas. Sin suite completa por cada corrección. Resultados finales a continuación.

## Implementación y límites

Tablas aditivas `pro_invoice_payments` (dinero/fecha/medio/referencia inmutables), `pro_invoice_payment_applications`, `pro_invoice_payment_voids`, estado y solicitudes idempotentes. Sólo lectura propia por RLS; RPC de escritura sólo service_role detrás de sesión, Pro activo y origen permitido. Sin backfill ni reescritura del JSON. Aplicado únicamente el nuevo SQL en Supabase loopback; sin reset ni seeds de cuentas originales.

- Desde borrador guardado: Pagos del borrador. Total / Aplicado / Por aplicar distingue asignación interna de la deuda del trabajo. Fuente existente sugerida cuando hay abonos disponibles; importe parcial editable, fecha recibida y medio; referencia opcional. CTA y errores al pie visibles en teléfono.
- Abonos de trabajo sólo se reutilizan en el mismo cliente/trabajo exacto. Sin trabajo, se reutilizan pagos independientes del mismo cliente; duplicar un borrador no copia aplicaciones ni habilita usar el abono de otro trabajo.
- Nuevo pago de trabajo: llama el escritor de ledger existente en la misma transacción, una sola vez. Conserva su límite de acuerdo/saldo, cliente activo y trabajo vigente. Pago independiente no toca ledger/core/inventario.
- Un abono existente conserva su importe original. La suma de aplicaciones activas no puede excederlo ni superar el total del borrador; reparto parcial de dinero independiente entre borradores permitido.
- Quitar exige motivo, conserva dinero y permite reutilizarlo; no devuelve dinero ni anula el abono del trabajo. Un reverso del ledger elimina efecto de todas las aplicaciones vinculadas en lectura y sumas vigentes.
- Fecha efectiva entre 1900 y hoy CR; no se infiere de created_at histórico. Datos de un pago ya vinculado se reutilizan bloqueados para mantener consistencia entre aplicaciones. Corregir metadata histórica después del primer enlace queda fuera de este incremento: no se sobrescribe sin historial.
- Pago y revisión separados de snapshots del borrador; guardia diferida verifica el total final al editar detalle/impuestos/cargos y rechaza bajar del aplicado. Permite valores intermedios de los escritores existentes.
- Reintento tras respuesta incierta conserva UUID y payload exactos. Tras POST confirmado con GET fallido bloquea otra escritura hasta recuperar lectura completa y reiniciar campos; evita reutilizar datos ya enviados como solicitud nueva.
- Archivar conserva pagos. Se permite ver/quitar aplicaciones desde su ficha archivada; aplicar nuevos requiere restaurar.

## Evidencia

SQL aislado final PASS: `/tmp/pro-invoice-payments-db-final.log`. Pagos únicos/ledger, reparto, sin doble deuda, validación fechas/metadatos/CAS, errores atómicos, reversos vigentes, guardia de total FINAL, páginas/empates, RLS/aislamiento/grants/inmutabilidad, reinstalación y cascadas.

Consumidores: 21/21 PASS en `/tmp/pro-invoice-payments-consumers.log` (Chromium escritorio/móvil y WebKit móvil): operaciones de cliente, recibos internos, gestión/archivo/copia, detalle, origen/reutilización de borradores, IVA/exoneraciones y cargos/impuestos especiales. Prueba nueva inicial pasó 3 perfiles; se amplió con fallos de recarga tras POST confirmado y acceso de archivados para la ejecución final. No se rebajó ninguna aserción para obtener verde: primera ejecución señaló que una expectativa prohibía archivar, contraria al contrato; se reemplazó por archivo conservando pagos y rechazo de aplicar al archivado sin ninguna mutación.

Revisión independiente detectó dos P2 (recarga tras POST y gate de archivados), ambos corregidos y cubiertos por la nueva prueba. Sin hallazgos P1 de acceso/aislamiento. TypeScript (`/tmp/pro-invoice-payments-tsc-final3.log` sin errores), ESLint (`/tmp/pro-invoice-payments-lint-final3.log` sin errores), UTF-8, presupuesto bilingüe sin ampliarlo y diff-check focales: PASS.

## Simulador

En iPhone 17 Pro iOS26.5 se completó por UI la aplicación de ₡10.000 de un abono ficticio anterior de ₡20.000 al borrador Pintura de habitación de ₡50.000, recibido 26 octubre 2026, SINPE y referencia de prueba. Se verificó en DB el importe exacto, la fecha/medio/referencia y que el header original y todo el ledger permanecen exactos. Se reabrió la app para comprobar persistencia: aplicado ₡10.000, por aplicar ₡40.000 y disponible del abono ₡10.000; fecha/medio/referencia bloqueados para reutilizar. Flecha volvió al borrador. Se habilitó temporalmente captura de teclado del simulador y se devolvió usando I/O > Input > Send Keyboard Input to Device; título volvió a iOS26.5.

Capturas: `/tmp/contratacr-pro-pago-factura-datos-20261027.png` y `/tmp/contratacr-pro-pago-factura-aplicado-20261027.png`. Limpieza final PASS: se eliminaron exclusivamente las filas nuevas verificadas de dinero/aplicación/estado/solicitud creadas por esta prueba nativa, con las cinco tablas del demo de nuevo idénticas a su captura inicial vacía. No se elimina el pago original ni se modifica deuda real. Los cinco verificadores privados de preservación pasaron de nuevo (header/líneas/materiales/issuer, ledger, core y revisiones, catálogos/agenda/cotizaciones/movimientos). Simulador queda abierto en Pagos del borrador con los datos originales restaurados.

### Cierre funcional

Nueva E2E final: **3/3 PASS** (`/tmp/pro-invoice-payments-final.log`), Chromium escritorio/móvil y WebKit móvil. Incluye POST confirmado con GET503, bloqueo de segunda escritura, recuperación/reset de campos sin otro ledger; entrada real por botón del borrador archivado y recarga conservando subvista, sin opción aplicar pero quitar habilitado. **24 combinaciones funcionales únicas aprobadas** al sumar los 21 consumidores: no se suman las repeticiones previas como cobertura adicional. Signoff independiente de ambos P2: corregidos sin pendientes concretos. SQL aislado final aprobado; validaciones de datos originales y limpieza aprobadas. Todo local en Pro; sin push, emisión, envío ni cobro real.

### Revisión posterior: cuenta local y archivados (27 octubre)

Por solicitud explícita del usuario se cambió únicamente `professionals.is_banned` de true a false en la cuenta demo local. Guard de conexión exacta `127.0.0.1:54321`, selección única del dueño demo y comparación de la fila completa: el resto de sus campos quedó idéntico; copia privada previa en `/tmp/pro-local-suspension-before.json`. Sin cambios de producción. Aviso desaparecido confirmado en Facturación del simulador.

Revisión visual continuada: regreso Pagos → Borrador → Facturación y filtro Archivados. Se encontró mensaje vacío genérico que sugería ausencia de todos los borradores; se ajustó sólo ese estado a «No hay borradores archivados» con «Ver borradores activos». Selección de pruebas: verificación manual nativa de ambos estados/retorno y regresión focal de gestión en Chromium móvil; se reutiliza la evidencia previa de pagos/SQL y los otros navegadores sin repetir su suite completa. Sin push ni nuevas operaciones de dinero. Resultados focales en el registro local de esta revisión.

Resultado de revisión posterior: gestión Chromium móvil 1/1 PASS (`/tmp/pro-unsuspended-review.log`), TypeScript sin errores (`/tmp/pro-unsuspended-review-tsc.log`), ESLint focal y diff-check PASS. Comprobación nativa del nuevo mensaje y botón Ver borradores activos aprobada: vuelve al borrador existente sin crear/archivar/modificar ninguno. Verificadores de preservación de snapshots/ledger/core y catálogo normalizado PASS. Captura sin aviso de suspensión: `/tmp/contratacr-pro-sin-suspension-20261027.png`.

## Extensión posterior: correcciones auditadas

`payment-metadata-local.md` añade correcciones append-only de fecha/medio/referencia. La instantánea en `pro_invoice_payments` permanece inmutable; las consultas y validaciones de reutilización consultan la metadata efectiva. El helper fallback se instala únicamente si no existe, para que reinstalar el consumidor no suprima correcciones existentes. Importe, límites, aplicaciones y recibos conservan su contrato.

## Importe sugerido según el idioma (2026-11-12)

«Importe a aplicar ₡» en «Pagos del borrador» se propone con el separador decimal del idioma: `4000,00` en español y `4000.00` en inglés (antes siempre `4000.00`). Al guardar, `inputCents` acepta coma o punto (y recorta espacios). Pruebas: `pro-invoice-payments.spec.ts` (`400,00`, cambio intencional de la expectativa) y `pro-phase2-qa-fixes.spec.ts` (ES `4000,00`, EN `4000.00`, y `inputCents('4000,00')=inputCents('4000.00')=400000`).
