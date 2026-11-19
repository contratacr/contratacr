# Montos previstos para materiales por elegir (familia 75) — 2026-11-10

Solo checkout Pro, rama `local/pro-suite-no-push`. Sin commit, push, envíos, cobros ni proveedores externos. SQL aplicado solo en la base de loopback. Referencia pública: [How to Use Allowances](https://pro.houzz.com/pro-help/r/how-to-use-allowances) (partida provisional con fecha para decidir; estados abierta, finalizada y reabierta; diferencia frente a lo previsto; cambio opcional al finalizar). No se copiaron textos, marca ni diseño de Houzz.

Nombre visible: **«Montos previstos» / «Allowances»**, en el grupo Planificación / Planning del proyecto, después de Cotizaciones. Se evitó «Asignaciones» (se confunde con responsables del equipo).

## Qué se hizo

1. **SQL** `docs/pro/sql/allowances-local.sql` (registrado en `scripts/pro/local-sql-manifest.mjs`, depende de `private-work-tools-access`, `appointment-requests`, `client-dashboard` y `work-changes`):
   - `pro_work_allowances`: por trabajo (`pro_work`), nombre (1–160), área o categoría opcional (≤80), monto previsto en céntimos de CRC (0–10 000 000 000), fecha límite opcional, notas internas opcionales (≤1000), estado `open` / `decided` / `reopened`, elección (descripción ≤300, proveedor o producto opcional ≤160, cantidad 0,01–1 000 000 con 2 decimales, total real), `change_id` opcional, `archived`, `revision`. Restricciones: «definida» ⇔ elección completa; `change_id` solo si está definida.
   - `pro_work_allowance_history`: una fila inmutable por acción (`create`, `update`, `decide`, `reopen`, `archive`, `restore`, `link_change`) con la partida antes y después. `pro_work_allowance_actions`: recibos por `actionId`. Ambas con disparador que rechaza `update` (23514).
   - `pro_work_allowances_mutate`: claves exactas por acción, elegibilidad `pro_private_work_tools_enabled`, trabajo propio, recibo idempotente (misma carga → mismo resultado; misma identidad con otra carga → 400), CAS por `revision` (40001 → 409), id repetido → 409, límite 200 partidas por trabajo (429).
   - Reglas: una partida definida queda bloqueada (no se edita ni se vuelve a definir: primero se reabre). Reabrir quita la elección de los totales; la elección anterior queda en `before_item` del historial. Archivar la saca de totales y de la vista del cliente; restaurar la devuelve.
   - Totales (solo no archivadas): previsto, previsto de lo definido, real definido, diferencia (real − previsto de lo definido), total proyectado (real de lo definido + previsto de lo pendiente), definidas, pendientes y **vencidas**: pendientes con fecha límite anterior al día de hoy en `America/Costa_Rica` (`pro_work_allowance_today()`).
   - `pro_work_allowances_read` (dueño: partidas, totales, últimas 100 entradas del historial) y `pro_work_allowances_client_read` (cliente). RLS habilitada sin políticas, todo revocado a `public/anon/authenticated`; RPC `security invoker` solo para `service_role`.
2. **Vista del cliente** (`docs/pro/sql/client-dashboard-local.sql`, inserción mínima): columna `show_allowances boolean not null default false` con `add column if not exists` (filas existentes quedan apagadas; reaplicable). `showAllowances` es **opcional** en la mutación: los llamadores anteriores (y la spec existente) siguen funcionando y conservan el valor guardado. El historial anterior sin la clave se interpreta como apagado (`historySettingsSchema` con `default(false)`). La lectura de preferencias del cliente (`pro_client_dashboard_client_read`) **no cambió**.
   - Lectura del cliente de montos previstos: solo el cliente vinculado de la solicitud, con estado `confirmed` o `completed` (misma regla que corrigió QA), y solo si la sección está encendida; si no, `{visible:false}`. Entrega nombre, categoría, previsto, fecha límite, estado y, si está definida, lo elegido, cantidad, total real y diferencia. **No** entrega notas internas, revisiones, historial ni el id del extra.
3. **API** `src/app/api/pro/allowances/route.ts` (patrón de `client-dashboard`): solo `development`, actor y `X-Pro-Expected-Actor` (403 si no coincide), `GET ?workId=` o `?requestId=` con exactamente un parámetro (400 si hay repetidos o extra), `POST` con origen, cuerpo acotado a 16 KB, límite de frecuencia y zod estricto (`src/lib/pro/allowances.ts`). Errores: 400, 403, 404, 409, 413, 429, 503.
4. **Interfaz** `src/components/pro/work-allowances.tsx`:
   - `WorkAllowances` (dueño): resumen arriba (Previsto, Definido real, Diferencia, Por elegir, Vencidas, total proyectado), lista en tarjetas (estado, «Vencida», previsto, fecha límite o real, elección y diferencia con color: por encima / por debajo / igual), crear y editar en formulario en línea, «Definir elección» con vista previa de la diferencia, Reabrir y Archivar con confirmación, archivadas plegadas con Restaurar, historial plegable que muestra la elección anterior al reabrir. Estados de carga, error con reintento, vacío, conflicto (Recargar) y guardado incierto (reintenta la misma operación con el mismo `actionId`). Montos aceptan `250000`, `250.000` o `250 000,50`.
   - El estado dirty/busy se informa con `onStateChange` y se suma a `baseNestedBlocked` en `business-panel.tsx` (el menú del trabajo queda bloqueado mientras hay un formulario con cambios o un guardado pendiente).
   - `AppointmentAllowances` (cliente), insertado en `appointment-requests-workspace.tsx` después de las secciones configurables: no muestra nada mientras carga, si hay error o si la sección está apagada, para que nunca aparezca y desaparezca.
   - Editor de Vista del cliente: nuevo interruptor «Montos previstos / Allowances», apagado por defecto, con explicación; entra en la vista previa y en el historial.
5. **Menú del proyecto** (`job-workspace.tsx`): vista `vistaTrabajo=allowances` en Planificación. Se pasa **solo en el espacio Pro independiente** (`proSpace`), igual que Cotizaciones: en `/dashboard/profesional` el grupo Planificación no se ofrece.

## Extra por la diferencia (conexión con `work-changes`)

Botón opcional «Proponer extra por la diferencia», solo en partidas definidas con diferencia positiva y sin extra vinculado. Tras confirmar:

1. Lee `GET /api/pro/work-changes?workId=` (importe acordado, `canPropose` y si ya hay una propuesta pendiente). Sin acuerdo o con una propuesta pendiente, explica qué hacer y no escribe nada.
2. Envía `POST /api/pro/work-changes` `action:'propose'` validado con el mismo `workChangeMutation`, una línea por la diferencia exacta. Toda la lógica (acuerdo vigente, pagos, una sola propuesta pendiente, aprobación del cliente) sigue en `pro_work_changes_mutate`; no se duplicó.
3. Vincula la propuesta con `link_change`; el SQL exige que exista una propuesta de ese mismo trabajo con `delta_cents` igual a la diferencia.

No se crea deuda ni cobro: la propuesta queda «Por aprobar» en Extras y cambios y solo al ser aceptada por el cliente (o registrada por el profesional) se convierte en acuerdo, como ya ocurría. Si la respuesta se pierde, «Reintentar la misma operación» repite el mismo cuerpo (mismos `id` y `actionId`), idempotente en ambos módulos.

## Decisiones

- **Moneda:** solo CRC, en céntimos (`bigint`), igual que `work-budget` y `work-changes`, para que la diferencia pase sin conversión al extra. No hay USD en este módulo; el formulario acepta hasta 2 decimales.
- **Catálogo:** proveedor o producto es texto libre. El catálogo vive en el documento del espacio y no tiene una referencia estable reutilizable de forma simple aquí; queda pendiente.
- **Bloqueo al definir:** coherente con la referencia (la partida finalizada fija sus montos). Para cambiarla, se reabre; el historial conserva todo.
- **Reabrir quita el vínculo al extra** (`change_id`); la propuesta sigue en Extras y cambios, donde se retira o se resuelve.
- Formularios en línea (no modal) para no agregar pasos de historial del navegador.

## Evidencia

- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0. ESLint en los 10 archivos tocados → 0 errores, 0 advertencias.
- `node $S/apply-one.mjs docs/pro/sql/client-dashboard-local.sql docs/pro/sql/client-dashboard-local.sql` y lo mismo con `allowances-local.sql` → ok en ambas pasadas.
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 101 SQL modules, 102 ordered steps, 121 dependencies…`.
- `tests/e2e/pro-allowances.spec.ts` (ES y EN): **2/2 en chromium-desktop** y **2/2 en webkit-mobile**. Cubre:
  - API: 400 (clave extra, monto negativo o con fracción de céntimo, fecha imposible, nombre vacío, cantidad 0, consulta sin parámetro o repetida, sin cambios, editar o redefinir una definida, reabrir dos veces, archivar dos veces, vínculo a un extra inexistente), 403 (sin origen, cliente que lee o escribe, otra cuenta Pro que escribe), 404 (otra cuenta Pro que lee el trabajo o la solicitud), 409 (revisión vieja, id repetido), repetición idempotente idéntica, diferencias por encima / por debajo / igual, totales y total proyectado, vencida con la fecha de Costa Rica (ayer sí, hoy no), reabrir conserva la elección anterior en el historial, historial inmutable (actualización rechazada), archivar y restaurar.
  - Cliente: apagado por defecto (`{visible:false}`), encendido desde el editor, sin notas internas ni revisiones, partidas archivadas excluidas; un guardado anterior sin `showAllowances` conserva el valor; apagado otra vez desaparece de la página; solicitud cancelada no lo recibe aunque esté encendido.
  - Interfaz: Planificación › Montos previstos activo, error con reintento, estado vacío, validación de monto, menú bloqueado con formulario sucio, crear, editar, definir con vista previa, extra propuesto (una fila `pro_work_changes` «proposed» por 45 000 sobre el acuerdo, sin nuevas entradas de acuerdo), reabrir, historial, archivar, recargar, restaurar, orden completo del historial, sin desbordamiento horizontal ni errores de página, sin notificaciones ni filas de envío.
- Regresión:
  - chromium-desktop, `pro-client-dashboard`, `pro-job-workspace` (ruta `profesional`), `pro-project-planning`, `pro-projects`, `pro-work-changes`, `pro-work-changes-english` → **9 pasaron, 2 fallaron**. Fallan las dos de `pro-work-changes*`, en la línea 22: abren `/dashboard/profesional?tab=pro_agenda&cita=…` y esperan el `GET /api/pro/work-changes` en la carga. Desde que existe el menú del proyecto (`job-workspace.tsx`, trabajo anterior), «Extras y cambios» es una vista aparte que solo se monta con `vistaTrabajo=changes`, y la spec (del 7 nov) nunca navega ahí. En la ruta `profesional` este módulo no cambia nada del menú (la vista solo se pasa con `proSpace`), así que el fallo ya existía y no lo causa este cambio. No se tocó esa spec. El recorrido de extras sí queda cubierto por `pro-allowances.spec.ts`, que crea una propuesta real por la API de `work-changes`.
  - chromium-desktop, `PRO_INDEPENDENT=1 pro-job-workspace` → EN pasó; ES falló una vez antes de llegar al expediente (en `tab=pro_tools`, «Abriendo sección…», esperando `gastosVista=suppliers`) y al repetirla **pasó**. Con eso se verifican los 9 botones.
  - webkit-mobile, `pro-client-dashboard`, `pro-job-workspace`, `pro-project-planning`, `pro-projects` → **9 pasaron (3.2 min)**.
- Expectativa cambiada a propósito: `pro-job-workspace.spec.ts` exigía 8 botones en el espacio independiente; ahora 9, y además exige que «Montos previstos» aparezca solo ahí (0 en `profesional`).
- Capturas revisadas con Read (escritorio 1366 px y móvil 390 px, ES y EN): vacío, definida con diferencia, restaurada y vencida, editor de Vista del cliente con el interruptor, vista del cliente encendida y apagada. Copias en `$S/allowances-shots/{desktop,mobile}/`. Corrección hecha tras revisarlas: los importes del resumen del cliente se partían en dos líneas en el modal; ahora el resumen usa 2 columnas y los importes no se cortan.

## Límites y pendientes

- Sin tablero de selecciones con varias opciones por partida ni aprobación de la elección por el cliente (el cliente solo ve).
- Sin margen o recargo sobre el monto previsto, sin integración con cotizaciones (no se agregan desde una cotización ni se fusionan en ella) y sin órdenes de compra.
- Sin reporte PDF ni exportación; los totales del proyecto no se suman todavía al Presupuesto (`work-budget`).
- Proveedor o producto no se vincula con el catálogo.
- ~~El vínculo con el extra no se actualiza si la propuesta se retira o se rechaza~~ Corregido en QA (ver `qa-review-2026-11-10-local.md`): la lectura del dueño entrega `changeStatuses` y la tarjeta muestra el estado real (propuesto, aceptado, rechazado, retirado o «no se pudo consultar»). Para proponer otro extra tras un rechazo o retiro, se reabre y se vuelve a definir.
- ~~La vista del cliente no muestra error si su lectura falla~~ Corregido en QA: un fallo (que no sea 404) muestra un aviso con «Reintentar»; mientras carga sigue sin mostrar nada.
- En móvil el resumen ocupa bastante alto antes de la lista.
