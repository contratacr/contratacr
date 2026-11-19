# Créditos y anticipos por proyecto (fila 50, local)

Estado: **fase 1 terminada (SQL, manifiesto, spec y borradores de código); fase 2 pendiente** (copiar los borradores a `src/`, conectar la vista y correr las pruebas). Mientras la fase 2 no se haga, la fila 50 del registro sigue en **P**.

Equivalente funcional del módulo de créditos y anticipos de Houzz Pro (recorrido del 2026-11-11 en `houzz-live-structure-2026-11-10.md`): pestañas de anticipos, notas de crédito, sobrepagos y reembolsos; totales disponible, aplicado y total; filtro por estado; columnas título, código, estado, creado, total, saldo, destinatario y disponible. Los textos, nombres y diseño son propios de ContrataCR.

> **Registro interno, no fiscal.** Nada de este módulo cobra al cliente, mueve dinero, envía avisos ni emite factura o nota de crédito electrónica ante Hacienda. La interfaz lo dice en cada vista y en cada formulario que toca dinero.

## Auditoría previa (qué ya existía y qué se reutiliza)

| Pieza existente | Qué hace | Cómo la usa este módulo |
|---|---|---|
| `client-operations-draft.sql` (`pro_client_entries`, `pro_record_client_operation`, `pro_work_account`) — `client-operations.tsx`, fila 47 | Libro de abonos por trabajo: acuerdo, abonos y reversos; saldo = acuerdo − abonos. | **Es el único libro de dinero recibido.** Un anticipo recibido y un sobrepago siempre apuntan a un abono de este libro (`entry_id`). La recepción manual de un anticipo registra el abono **en este libro** con `pro_record_client_operation`, con la misma validación (exige acuerdo y no supera el saldo del trabajo). |
| `payment-metadata-local.sql` — `payment-metadata.tsx` | Fecha, medio y referencia de un abono, con correcciones auditadas. | Se leen con `pro_invoice_payment_metadata`. Si el abono no tiene esos datos, se piden y se crea la instantánea `pro_invoice_payments` igual que lo hace pagos de factura. |
| `invoice-payments-local.sql` (`pro_invoice_payment_mutate`, `pro_invoice_payment_used`) — `invoice-payments.tsx` | Asigna dinero recibido a un borrador de factura, con reverso de la asignación. | **Aplicar un anticipo o sobrepago a un borrador es la misma asignación** (`apply` / `unapply` de ese escritor, con el mismo `actionId`). Por eso el panel de pagos del borrador la muestra y el mismo dinero no puede asignarse dos veces desde los dos módulos. |
| `invoice-drafts-local.sql`, `invoice-management-local.sql` — `invoice-draft.tsx`, `invoice-workspace.tsx` | Borradores internos por trabajo/cotización; archivo. | Solo se aplican créditos a borradores **del mismo proyecto y cliente**, no archivados. |
| `client-statement-local.sql` — `client-account-statement.tsx`, fila 48 | Estado de cuenta derivado del libro. | No se modifica. Los abonos que respaldan créditos ya aparecen allí como abonos normales. |
| `work-changes-local.sql` — `work-changes.tsx` | Extras y cambios aprobados (ajustan el acuerdo). | No se toca; el acuerdo vigente es el que valida la recepción manual. |
| `job-workspace.tsx` grupo **Finanzas** | Costos y pagos, Horas, Órdenes de compra, Extras y cambios. | La fase 2 agrega «Créditos y anticipos» después de Órdenes de compra, solo en el espacio Pro independiente (`proSpace`). |

## Modelo

Archivo: `docs/pro/sql/credits-retainers-local.sql` (solo objetos nuevos, prefijo `pro_credit`).

- `pro_credits`: anticipo (`retainer`, ANT), nota de crédito (`credit_note`, NC) o sobrepago (`overpayment`, SP), por proyecto (`pro_work`) y cliente. `amount_cents` bigint en céntimos CRC.
- `pro_credit_applications` (+ `pro_credit_application_reversals`): cada aplicación a un borrador. Para créditos respaldados por un abono guarda `invoice_application_id` (la fila de `pro_invoice_payment_applications`).
- `pro_credit_refunds` (+ `pro_credit_refund_voids`): reembolsos manuales con número REE.
- `pro_credit_counters`: un contador por cuenta y tipo.
- `pro_credit_history` (antes/después inmutable) y `pro_credit_actions` (recibos por `actionId`).

### Cifras

- **Aplicado** = aplicaciones activas (no revertidas aquí, no quitadas en los pagos del borrador, y abono de origen no reversado en el libro).
- **Reembolsado** = reembolsos no anulados.
- **Saldo** = total − aplicado − reembolsado (0 si está solicitado, cancelado o su abono se reversó).
- **Disponible** = saldo; si el crédito está respaldado por un abono, además nunca más que lo **sin asignar** de ese abono menos lo reembolsado. Así, si el mismo abono se usó directamente en los pagos de un borrador, el anticipo muestra menos disponible (la interfaz lo explica).
- **Saldo del borrador** visto por créditos = total − pagos aplicados (`pro_invoice_payment_used`) − notas de crédito aplicadas.

### Estados (derivados)

`requested` (solicitado), `available` (disponible, sin uso), `partial` (usado en parte), `used` (sin disponible), `reversed` (el abono de origen se reversó en el libro) y `cancelled`. Reembolsos: `recorded` / `voided`.

### Sobrepago detectado

`exceso = máx(0, abonado − facturado neto − retenido por créditos)`, donde abonado es `paidCents` de `pro_work_account`; facturado neto suma los borradores activos del proyecto (total − notas de crédito aplicadas) más lo pagado en borradores archivados; retenido es, por cada anticipo o sobrepago con abono, `mín(total − aplicado, lo sin asignar del abono)`. Un sobrepago se registra sobre un abono concreto del proyecto y nunca por encima del exceso ni de lo sin asignar de ese abono. Es una ayuda: si el cliente todavía debe parte de un borrador, el exceso baja.

## Reglas de negocio

- **Numeración** por cuenta y tipo (ANT-0001, NC-0001, SP-0001, REE-0001), asignada en la misma transacción con bloqueo de la fila del contador. Un rechazo revierte el contador (sin huecos); un reintento con el mismo `actionId` devuelve el recibo y no consume número. Los prefijos son identificadores y no se traducen.
- **Anticipo:** se crea solicitado (título, monto, fecha de solicitud, nota). Se marca recibido (a) vinculando un abono existente del proyecto con dinero sin asignar (monto ≤ lo sin asignar) o (b) registrando el abono ahora con fecha (no futura, Costa Rica), medio y referencia: queda una sola vez en el libro de abonos. Un abono respalda como máximo un crédito vigente.
- **Nota de crédito:** monto y motivo obligatorio; no es dinero, así que su aplicación vive solo en este módulo y rebaja el saldo del borrador que calcula `pro_credit_draft_balance`.
- **Sobrepago:** ver arriba.
- **Aplicar:** parcial, a un borrador del mismo proyecto y cliente, no archivado, con trabajo y cliente activos; nunca más que lo disponible ni que el saldo del borrador. **Revertir** pide motivo y queda en el historial; para créditos con abono también anula la asignación en pagos de factura.
- **Reembolso:** registro manual (no procesa dinero), monto ≤ disponible, fecha no futura y no anterior a la recepción o creación. Se anula con motivo. No anula el abono del libro (el libro no tiene reversos parciales): el estado de cuenta sigue mostrando el abono completo.
- **Editar:** título y nota siempre (salvo cancelado); monto solo si el crédito no viene de un abono y nunca por debajo de aplicado + reembolsado; motivo solo en notas de crédito.
- **Cancelar:** sin aplicaciones ni reembolsos activos. Libera el abono para otro crédito.
- **Trabajo cancelado o cliente archivado:** solo lectura para crear, recibir y aplicar; se puede revertir, anular reembolsos y cancelar.

## Patrón del brief

- RLS activada y `revoke all` a `public, anon, authenticated` en las 8 tablas; `grant` solo a `service_role`. Todas las funciones `security invoker` con `search_path` fijo, ejecutables solo por `service_role`.
- Elegibilidad `pro_private_work_tools_enabled(p_actor)` en lectura y escritura (403).
- Revisión optimista por crédito: `40001` → 409. Identidad reutilizada → `23505` → 409. Validación → `22023` → 400. Invariantes → `23514` → 400. Límite de 500 por tipo y proyecto → `54000` → 429.
- Recibos idempotentes por `actionId` (mismo cuerpo devuelve el mismo resultado; otro cuerpo con el mismo `actionId` → 400).
- Historial, aplicaciones, reversos, reembolsos, anulaciones y recibos con trigger que impide `update`.
- Invariantes en el servidor: comprobación al final de cada acción y **trigger diferido** propio (`pro_credit_guard`) sobre las tablas del módulo: aplicado + reembolsado ≤ total y saldo del borrador ≥ 0, quien sea que escriba.
- Orden de bloqueo: el mismo candado consultivo por dueño que usan el libro, los borradores y los pagos de factura (`hashtextextended(owner,0)`), luego recibo, contador, crédito y borrador. Un solo escritor por cuenta a la vez, sin interbloqueos con esos módulos.

## API (borrador, fase 2)

`/api/pro/credits-retainers` (`route-common`): solo `development`, `X-Pro-Expected-Actor`, POST del mismo origen, cuerpo JSON ≤ 16 KiB (413), límite de frecuencia 120/min por cuenta, esquemas zod estrictos en `src/lib/pro/credits-retainers.ts`.

- `GET ?workId=…&tab=retainer|credit_note|overpayment|refund&status=…&after=…` → lista paginada (20, cursor por número), totales de la pestaña (sin filtro de estado), conteos por pestaña, detección de sobrepago, próximos números y referencias (borradores con saldo y abonos con dinero sin asignar).
- `GET ?workId=…&view=detail&id=…` → crédito con aplicaciones, reembolsos e historial (100).
- `POST` acciones: `create_retainer`, `receive_retainer` (`source: existing|manual`), `create_credit_note`, `create_overpayment`, `update`, `apply`, `unapply`, `refund`, `void_refund`, `cancel`.

## Interfaz (borrador, fase 2)

`src/components/pro/work-credits.tsx`: aviso no fiscal permanente; selector de pestañas con conteos (botones `aria-pressed`, no pestañas ARIA); totales; tarjeta de detección en Sobrepagos; filtro por estado; tabla de 8 columnas en escritorio (`lg`) y tarjetas en móvil (sin desplazamiento horizontal); detalle con cifras, acciones y formularios en línea (recibir, aplicar, reembolsar, editar, revertir, anular, cancelar); historial en `<details>`; estados de carga, error con reintento, conflicto 409 con recargar y reintento idéntico ante 5xx. `onStateChange` bloquea la navegación del expediente mientras hay cambios o guardado. Tokens del brief y controles `min-h-11`. Textos ES (usted) / EN propios.

## Evidencia de la fase 1

- `node $S/apply-one.mjs docs/pro/sql/credits-retainers-local.sql docs/pro/sql/credits-retainers-local.sql` → `ok` / `ok` (idempotente; también tras cada ajuste).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 110 SQL modules, 111 ordered steps, 161 dependencies, guard/repeat contracts and negative cases; offline only.`
- Prueba transaccional con `psql` contra la base de loopback, toda dentro de `begin … rollback` (`$S/credits-draft/sql/credits-retainers-test.sql`): `WARNING: ALL CREDIT ASSERTIONS PASSED` y `ROLLBACK`; después, 0 filas en `pro_credits` y 0 usuarios de prueba. Cubre validación 22023, 42501 sin membresía y entre cuentas, idempotencia y reutilización de identidad (23505), CAS 40001, recepción con abono existente (crea la instantánea) y manual (abono en el libro, rechazo sin acuerdo o sobre el saldo), aplicación parcial compartida con pagos de factura, disponible acotado por uso directo del mismo abono, nota de crédito sin dejar el borrador negativo, edición y no-op, reverso con historial y anulación en pagos de factura, reembolso y anulación, detección y registro de sobrepago, cancelación, abono reversado, listas/filtros/totales, numeración sin huecos, inmutabilidad, trigger diferido y RLS (`authenticated` y `anon` → 42501).
- Las 25 respuestas reales de esa prueba (listas, detalles y recibos) validan contra los esquemas zod del borrador (`check-samples.mts`: `ALL 25 SAMPLES MATCH THE ZOD SCHEMAS`).
- TypeScript de los borradores con un `tsconfig` propio en el scratchpad (superpone los borradores y los dos archivos integrados sobre `src/`): 0 errores. ESLint de los borradores, de la spec nueva y del manifiesto: 0 errores y 0 advertencias.
- La spec `tests/e2e/pro-credits-retainers.spec.ts` (ES/EN) está escrita y tipada, **sin correr** (requiere la fase 2).

## Límites y decisiones abiertas

- **Brecha con los escritores existentes (decisión del líder).** Pagos de factura y la edición del total del borrador no conocen las notas de crédito ni los reembolsos de créditos: podrían dejar un borrador cubierto por encima de su total o reutilizar dinero ya reembolsado. Se comprobó en una transacción revertida (saldo del borrador −60 000 céntimos sin guardia). La propuesta `$S/credits-draft/sql/credits-retainers-guard-proposal.sql` agrega un trigger diferido a `pro_invoice_payment_applications` y `pro_invoice_drafts` que lo impide (probado: rechazo 22023 y caso exacto aceptado), pero **no se aplicó** porque toca tablas existentes. Sin créditos, su efecto es nulo.
- Las claves foráneas nuevas hacia `pro_work`, `pro_clients`, `pro_client_entries`, `pro_invoice_drafts` y `pro_invoice_payment_applications` son `on delete cascade`: la limpieza de cuentas sigue funcionando y arrastra los créditos.
- ~~El panel de pagos del borrador y el estado de cuenta no muestran las notas de crédito~~ → **resuelto el 2026-11-12** (ver «Notas de crédito en el estado de cuenta y en Pagos recibidos»). Los reembolsos siguen solo en este módulo y no reducen el «abonado» del libro.
- Solo CRC. Sin PDF, envío, aceptación del cliente, aplicación automática ni notas de crédito fiscales. Sin edición de reembolsos (se anulan y se registran de nuevo).

## Fase 2 (2026-11-11)

- Aplicada con `apply-phase2.mjs` (incluye el +1 de botones en `pro-job-workspace`).
- Guarda para escritores existentes: decisión tomada; integrada como `docs/pro/sql/credits-retainers-guard-local.sql` (manifiesto: después de `credits-retainers-local.sql`, `invoice-drafts-local.sql` e `invoice-payments-local.sql`), aplicada en loopback (2 triggers `pro_credit_existing_guard`). `guard-test.sql`: sin guarda saldo −60 000; con guarda 22023 al sobrecubrir y caso exacto aceptado. `credits-retainers-local.sql` excluye la función de la concesión a `service_role`.
- Corrección de UI: al cambiar el filtro de estado ya no se muestra el vacío del filtro anterior («Todavía no hay anticipos» con contador 1) mientras carga; se muestra «Cargando créditos…».


## Notas de crédito en el estado de cuenta y en Pagos recibidos (2026-11-12)

- **SQL** `docs/pro/sql/credit-notes-statement-local.sql` (manifiesto: después de `client-statement-local.sql`, `payment-overview-local.sql`, `credits-retainers-local.sql`, `credits-retainers-guard-local.sql` y `catalog-pages-draft.sql`). Solo lectura. Reemplaza `pro_client_statement_page` (misma firma y salida, con campos nuevos) y agrega `pro_credit_note_lines` y `pro_payment_overview_credit_notes`. No cambia `pro_payment_overview_page`.
- **Estado de cuenta**: cada aplicación de una nota de crédito (`pro_credit_applications` sin `invoice_application_id`, crédito `credit_note`) es una **línea** «Nota de crédito aplicada» (cambio en el saldo −importe, código NC-, borrador y motivo). Una reversión conserva la línea (marcada «Aplicación revertida; se conserva en el historial») y agrega «Nota de crédito revertida» (+importe, motivo de la reversión). Resumen: `creditNotesCents` y `creditNoteCount`; **«Por cobrar en trabajos» = Σ max(saldo del trabajo − notas aplicadas, 0)**. Una nota mayor que lo que se debe nunca deja saldo a favor (`creditCents` sigue siendo solo sobrepago). La revisión de la página cambia al aplicar o revertir.
- **Pagos recibidos**: total aparte «Notas de crédito aplicadas: ₡… · reducen lo que deben los clientes; no son dinero recibido ni entran en estos totales» (solo con «Todos»). Filtra por cliente, búsqueda literal (cliente, trabajo, código, título) y día de aplicación en Costa Rica; nunca suma a recibido/aplicado/disponible. La API lo agrega al `summary` (`creditNotesCents`, `creditNoteCount`).
- **Pruebas**: `scripts/pro/verify-client-statement-db.mjs` y `scripts/pro/verify-payment-overview-db.mjs` (PGlite aislado) ahora instalan los créditos y comprueban líneas, reversión, tope en cero, aislamiento y permisos (PASS); spec nueva `tests/e2e/pro-credit-notes-statement.spec.ts` (ES/EN).
