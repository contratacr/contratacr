# Regresión Pro local — 11 noviembre 2026

Rama `local/pro-suite-no-push`, servidor dev `http://127.0.0.1:3185` (webpack), Supabase loopback. Sin commit, push, stash ni envíos reales. Rol: QA de regresión.

## Resumen

| Perfil | Specs | passed | flaky (falló en el conjunto, pasó aislada) | failed (persiste aislada) | Tests con fallo persistente |
|---|---|---|---|---|---|
| chromium-desktop | 241 | 190 | 13 | 38 | 58 de 616 |
| webkit-mobile | 241 | 191 | 10 | 40 | 65 de 616 |

- Excluidas por orden del líder (fase 2, sin `src/`): `pro-takeoffs`, `pro-credits-retainers`, `pro-mood-boards`. No se corrieron ni se modificaron.
- Dentro de las 38/40 fallidas hay 4 specs que otros agentes agregaron **durante** esta regresión y cuyos endpoints aún no existen (`/api/pro/bids`, `contracts`, `contract-print`, `file-versions`, `project-notes`, `project-details` → 404): `pro-bids`, `pro-contracts`, `pro-file-versions`, `pro-project-notes-details`. No es regresión: módulo en curso.
- Omitidos (skips condicionales del perfil o de entorno nativo, no fallos): p. ej. `pro-native-section-scroll`, `pro-section-scroll`, `pro-tools-profile-menu`, `pro-project-card-style` en escritorio; PDF publicados en chromium.

## 1. `pro-navigation.spec.ts:45` — causa raíz y corrección

**Síntoma.** «Pantalla en blanco al volver a Inicio». La captura automática `test-failed-1.png` es blanca porque Playwright la toma *después* del `finally{page.goto('about:blank')}`; la captura propia `navigation-failure.png` muestra el Inicio correcto. No es una página en blanco.

**Causa 1 (prueba desactualizada).** Al volver a Inicio la spec buscaba el botón «Clientes». Desde la simplificación de navegación (fijada por `pro-simplified-navigation`), Inicio solo ofrece Citas y Herramientas/«ContrataCR Pro»; Clientes y «Productos y servicios» (antes «Catálogo») viven en el hub de herramientas, que abre el espacio independiente `/dashboard/pro` (decisión documentada en `houzz-quality-roadmap-local.md`, «Espacio independiente Pro»). Se actualizó el recorrido: Inicio → ContrataCR Pro → Clientes; regreso Clientes → Herramientas → Mi panel; «Catálogo» → «Productos y servicios»; `headerBack` reconoce los botones «Volver» / «Volver a Mi panel» del espacio Pro (elegidos por la pestaña de la URL, no por conteo).

**Causa 2 (carreras de la prueba).** En `/dashboard/pro` las secciones cambian con el router de Next (asíncrono): `const quote=path()` podía leer todavía la URL del cliente porque el texto «Cotización de rutas» ya está en el historial del cliente. Ahora se espera `toHaveURL(/tab=quotes&cotizacion=/)`, se espera `[data-pro-tools]` antes de capturar la ruta de herramientas y `[data-dashboard-current=home]` antes de tocar Inicio. Tras recargar el movimiento de inventario, el formulario está bloqueado unos ms por la comprobación de recuperación (`inventoryRecovery.blocked`, intencional); se espera «Cancelar» habilitado antes de cerrar.

**Causa 3 (defecto real de producto).** `src/lib/pro/navigation.ts`: después de una traversía del navegador, Next vuelve a pedir el RSC y su `HistoryUpdater` reescribe la entrada actual con `replaceState({__NA, tree})` sin `preserveCustomHistoryState` (`node_modules/next/dist/client/components/app-router.js:95-110`). Eso borraba `ccrProNavigation`; al cerrar la cita se usaba el respaldo (`replaceState`) en vez de volver a su origen y quedaba `…&dia=…&mes=…` en lugar de la lista. A velocidad humana (esperando a que termine el RSC) fallaba siempre. Corrección: `preserveProEntryOnRouterRewrites()` conserva solo nuestro espacio de nombres en reescrituras internas de Next (`__NA`) de la **misma URL**; no toca pushState ni URLs distintas. Prueba A/B: con la espera de RSC asentado antes de cerrar, webkit-mobile **3/3 fallaba** antes de la corrección y **6/6 pasa** después.

**Entorno.** `stabilizeLocalProRuntime` (HMR de páginas hermanas recargaba la página y perdía entradas), precalentamiento de `/es/dashboard/profesional?tab=home` y `/es/dashboard/pro?tab=pro_tools`, y espera a que no haya peticiones `_rsc` en vuelo antes de «Volver»/«Cerrar» (en WebKit un toque con RSC pendiente hacía que Next cayera a navegación de navegador: «Failed to fetch RSC payload … Load failed»).

**Expectativa actualizada (explicada).** El final exigía `revision:1`; la prueba pulsa «Guardar» en el cliente sin cambios y `pro_mutate_catalog` siempre avanza la revisión compartida. Ahora exige exactamente `revision:2` con el documento idéntico (una sola escritura intencional).

Resultado: chromium-desktop 6/6 (`--repeat-each=3`), webkit-mobile 6/6 (`--repeat-each=3`), y pasó en ambas corridas completas.

## 2. Otras correcciones

- **Expediente del trabajo con vistas** (`job-workspace.tsx`, cambio intencional): 8 specs abrían la cita y buscaban acciones de Extras/Constancia en el Resumen. Se agregó `&vistaTrabajo=changes|delivery` a sus `goto` (sin tocar aserciones): `pro-work-change-write-recovery`, `pro-work-change-response-recovery`, `pro-delivery-photo-recovery`, `pro-delivery-write-recovery` → **pasan** (8 tests, chromium; también en webkit). `pro-delivery-photo-reload`, `pro-work-delivery(-english)`, `pro-work-write-reload` avanzan pero siguen fallando más adelante (controles/formularios que ya no coinciden): pendientes.
- Respaldos de los originales: `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/reg1111/before/` y `…/scratchpad/pro-navigation.spec.ts.before-qa`, `…/scratchpad/navigation.ts.before-qa`.

## 3. Entorno durante la corrida

- La primera corrida chromium se detuvo en el test 219/607 al llegar el servidor a 6,8 GB con `ECONNRESET`/`Error: read` en cadena; se reinició el puerto 3185 con el comando indicado y se continuó por lotes de 40 specs con reinicio preventivo si RSS > 4,5–6 GB (reinicios: chromium 2, webkit 2, más los de aislamiento). Memoria libre del equipo muy baja durante toda la sesión (24 GB totales).
- Los fallos “flaky” son de entorno: timeouts de `apiRequestContext` de 15–45 s, `ECONNRESET`, navegación interrumpida; todos pasan aislados con el servidor recién iniciado.

## 4. Fallos persistentes pendientes (no corregidos)

> **Actualización 2026-11-12:** corregidos según `qa-review-2026-11-10-local.md` § «Corrección de fallos persistentes (2026-11-12)». En la tabla del § 7, la nueva columna «12-nov» da el estado de cada spec. De las 44, 42 pasan en ambos perfiles. Siguen fallando `pro-tools-profile-menu` y `pro-native-section-scroll`, solo en webkit, por dos defectos de producto nuevos (N1: guarda de «Preparar visitas» en `/dashboard/pro`; N2: el `<main>` nativo tapa el encabezado del espacio Pro). La lista de abajo es el diagnóstico original del 11-nov.

Firmas principales (logs `…/reg1111/chri-*.log`, `…/reg1111/wki-*.log`). Ninguna aserción se debilitó.

- **Navegación simplificada / espacio Pro** (probable prueba desactualizada): `pro-simplified-navigation` (espera «Herramientas», la UI dice «ContrataCR Pro» por decisión documentada), `pro-billing` (botón «Ventas y cobros» ya no está en Inicio), `pro-sales-workspace` (`panel-tab-quotes` ya no existe; la propia spec simplificada exige 0), `pro-access-loading` (el título `[data-ccr-section-title]` es `lg:hidden` en escritorio; en webkit, `goto` interrumpido), `pro-client-english` (título «My panel» / cuenta), `pro-section-scroll`, `pro-native-section-scroll`, `pro-tools-profile-menu`, `pro-header-parity`, `pro-panel-state` (webkit).
- **Listas o diálogos que no aparecen** (requiere revisión con el autor del cambio): `pro-usability` y `pro-scoped-panels` (0 de 20 tarjetas de clientes), `pro-client-identification` (dos `dialog` a la vez al editar), `pro-client-recovery-scope` (sin `[data-client-operations]` en la ficha), `pro-catalog-storage` («Editar» no estable), `pro-discount-presets`, `pro-invoice-recurrence`, `pro-panel-ux` (campo «Cédula, DIMEX o NITE»), `pro-quote-ux`, `pro-reservations`, `pro-service-journey` («Gestionar trabajo»), `pro-service-package-write-recovery`, `pro-service-packages-english`, `pro-visit-preparation(-english)`, `pro-task-center-actions`, `pro-team` («Equipo» en herramientas), `pro-local-integration`, `pro-private-estimates-journey` (2/6), `pro-notifications-read-failure` (1/6), `pro-daily-log-file-reconcile` (1–2/6, contador de lecturas 8 > 2).
- **Diseño/medidas**: `pro-modal-keyboard-boundary` (alto 900 ≠ 804), `pro-modal-localization-journey` (6/6: objetivos táctiles 32 < 44 px y fila desbordada −371 px), `pro-tool-form-layout` (1/2 chromium).
- **Unitarias sin servidor**: `pro-direct-quote-write-recovery` (3/17, `Error: read` y forma del recibo: contrato de recuperación manual cambió).
- **WebKit, navegación interrumpida por redirección dev** (`page.goto … interrupted by another navigation`): `pro-client-write-recovery`, `pro-direct-project-quote-recovery`, `pro-profile-routes-local`, `pro-appointment-login`, `pro-project-deeplink`.
- Expediente con vistas, residuales: `pro-delivery-photo-reload`, `pro-work-delivery`, `pro-work-delivery-english`, `pro-work-write-reload`.

No hay evidencia previa en esta sesión de que estas specs pasaran con el árbol actual (cientos de cambios sin commit de otros agentes); no se atribuyen a esta corrección: `navigation.ts` solo agrega una clave en reescrituras de la misma URL, y la mayoría de los fallos ocurre antes de cualquier regreso por historial.

## 5. Calidad estática

- `npx tsc --noEmit -p tsconfig.json`: **9 errores, todos esperados** de specs de fase 2 que importan libs inexistentes (`tests/e2e/pro-credits-retainers.spec.ts` 6, `tests/e2e/pro-takeoffs.spec.ts` 3). 0 en el resto.
- `npx eslint src/components/pro src/lib/pro src/app/api/pro` + 241 specs Pro (sin las 3 de fase 2): **0 errores, 1 advertencia previa** en `src/components/pro/invoice-document-settings.tsx:16` (`react-hooks/exhaustive-deps`, archivo no tocado).
- `node scripts/pro/verify-local-preparation-manifest.mjs`: **PASS** (115 módulos SQL, 116 pasos, 192 dependencias).

## 6. Comandos exactos

```
cd /Users/contratacr/Desktop/contratacr/contratacr-pro
set -a && . ./.env.test >/dev/null 2>&1; set +a
source /private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/native-env.sh   # PRO_LOCAL_PSQL/PG* para las *-api con psql
# Por lote (scratchpad/reg1111/run.zsh): PLAYWRIGHT_OUTPUT_DIR y PLAYWRIGHT_JSON_OUTPUT_NAME por lote
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 npx playwright test --config=playwright.pro-local.config.ts <specs> --project=chromium-desktop --reporter=line,json
PLAYWRIGHT_WEBKIT=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 npx playwright test --config=playwright.pro-local.config.ts <specs> --project=webkit-mobile --reporter=line,json
# Lotes de 40 con reinicio si RSS>umbral: scratchpad/reg1111/chunks.zsh <perfil> <tag> <lista> 40
# Aislamiento: chunks.zsh <perfil> <tag> <lista-de-fallidas> 1 (una invocación por spec, servidor recién iniciado)
# Reinicio del servidor: matar el PID del puerto 3185 y
node scripts/dev-local-test-env.js --webpack --hostname 127.0.0.1 --port 3185   # log en scratchpad/dev-3185.log
```

`playwright.pro-local.config.ts` ya fija `workers:1`; chromium y webkit nunca corrieron a la vez. `PRO_INDEPENDENT=1` (`pro-job-workspace`) no se corrió en variante independiente; la variante por defecto pasó en ambos perfiles. `PRO_STYLE_NATIVE`/`PRO_TOOLS_NATIVE` son variantes nativas opcionales, no corridas.

Logs y JSON: `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/reg1111/` (`chromium-full.log`, `chr2-*.log`, `chri-*.log`, `fixjob.log`, `chrn-1.log`, `wk-*.log`, `wki-*.log`, `*-first.json`).

## 7. Tabla por spec

passed (n) = n tests verdes en la corrida completa · flaky = falló en el conjunto y pasó entera aislada · failed = sigue fallando aislada.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-access-bootstrap-recovery | passed (4) | passed (4) |
| pro-access-loading | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-agenda-operations | passed (1) | flaky (1/1 → aislado 1 passed) |
| pro-allowances | passed (2) | passed (2) |
| pro-appointment-inbox | passed (2) | passed (2) |
| pro-appointment-login | passed (4) → **12-nov: pasa 4/4** | failed (1/4 en aislamiento) → **12-nov: pasa 4/4** |
| pro-appointment-notices | passed (2) | passed (2) |
| pro-appointment-notification-copy | passed (7) | passed (7) |
| pro-appointment-reminder-copy | passed (4) | passed (4) |
| pro-appointment-reminders | passed (2) | passed (2) |
| pro-appointment-requests | passed (1) | passed (1) |
| pro-appointment-reschedule | passed (1) | passed (1) |
| pro-appointment-schedule | passed (2) | passed (2) |
| pro-bids | failed (módulo sin API: 404) | failed (módulo sin API: 404) |
| pro-billing | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-business | passed (3) | passed (3) |
| pro-catalog-expected-actor | passed (1) | passed (1) |
| pro-catalog-import | passed (3) | passed (3) |
| pro-catalog-item-types | passed (1) | passed (1) |
| pro-catalog-organizations | passed (1) | passed (1) |
| pro-catalog-storage | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-client-dashboard | passed (2) | passed (2) |
| pro-client-english | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-client-fiscal | passed (1) | passed (1) |
| pro-client-history | passed (1) | passed (1) |
| pro-client-identification | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-client-operations | passed (1) | passed (1) |
| pro-client-pending-requests | passed (2) | passed (2) |
| pro-client-recovery-scope | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-client-statement-english | passed (1) | passed (1) |
| pro-client-statement | passed (1) | passed (1) |
| pro-client-write-recovery | passed (2) → **12-nov: pasa 2/2** | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-company-daily-log-files-api | passed (5) | passed (5) |
| pro-company-daily-log-files | passed (6) | passed (6) |
| pro-company-file-management | passed (2) | passed (2) |
| pro-company-files-api | passed (2) | passed (2) |
| pro-company-files | passed (2) | passed (2) |
| pro-company | passed (3) | passed (3) |
| pro-contracts | failed (módulo sin API: 404) | failed (módulo sin API: 404) |
| pro-daily-log-discussion-api | passed (2) | passed (2) |
| pro-daily-log-discussion | passed (6) | passed (6) |
| pro-daily-log-duplicate-api | passed (6) | passed (6) |
| pro-daily-log-duplicate | passed (6) | passed (6) |
| pro-daily-log-file-reconcile-api | passed (3) | passed (3) |
| pro-daily-log-file-reconcile | failed (1/6 en aislamiento) → **12-nov: pasa 6/6** | failed (2/6 en aislamiento) → **12-nov: pasa 6/6** |
| pro-daily-log-file-storage | passed (2) | passed (2) |
| pro-daily-log-files-api | passed (2) | passed (2) |
| pro-daily-log-files | passed (4) | passed (4) |
| pro-daily-log-footer | passed (8) | passed (8) |
| pro-daily-logs-api | passed (2) | passed (2) |
| pro-daily-logs | passed (6) | passed (6) |
| pro-dashboard-prefetch-smoke | passed (2) | passed (2) |
| pro-delivery-acknowledge-recovery | passed (2) | passed (2) |
| pro-delivery-photo-recovery | passed tras corrección (2) | passed (2) |
| pro-delivery-photo-reload | failed (2/2) tras corrección parcial → **12-nov: pasa 2/2** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-delivery-write-recovery | passed tras corrección (2) | passed (2) |
| pro-direct-invoice | passed (1) | passed (1) |
| pro-direct-project-quote-recovery | passed (2) → **12-nov: pasa 2/2** | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-direct-quote-public-code | passed (1) | passed (1) |
| pro-direct-quote-tab-recovery | passed (3) | passed (3) |
| pro-direct-quote-write-recovery | failed (3/17 en aislamiento) → **12-nov: 17/17** | failed (3/17 en aislamiento) → **12-nov: 17/17** |
| pro-discount-presets | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-document-settings | passed (1) | passed (1) |
| pro-editor-draft | passed (1) | passed (1) |
| pro-expense-revision-race | passed (2) | passed (2) |
| pro-expense-write-recovery | passed (2) | passed (2) |
| pro-expenses-english | passed (1) | passed (1) |
| pro-expenses | passed (1) | passed (1) |
| pro-file-versions | failed (módulo sin API: 404) | failed (módulo sin API: 404) |
| pro-form-keyboard | passed (2) | passed (2) |
| pro-forms-ux | passed (1) | passed (1) |
| pro-header-parity | passed (2) → **12-nov: skip previo (contrato móvil)** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-home-summary | passed (2) | passed (2) |
| pro-identity-access | passed (1) | passed (1) |
| pro-identity-security-runtime | passed (6) | passed (6) |
| pro-independent-space | passed (2) | passed (2) |
| pro-inventory-write-recovery | passed (2) | passed (2) |
| pro-invoice-beverages | passed (1) | passed (1) |
| pro-invoice-detail | passed (1) | passed (1) |
| pro-invoice-drafts | passed (1) | passed (1) |
| pro-invoice-extras | passed (1) | passed (1) |
| pro-invoice-management | passed (1) | passed (1) |
| pro-invoice-payments | passed (1) | passed (1) |
| pro-invoice-preparation | passed (1) | passed (1) |
| pro-invoice-recurrence | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-invoice-tax | passed (1) | passed (1) |
| pro-issuer-settings | passed (1) | passed (1) |
| pro-job-workspace | passed (2) | passed (2) |
| pro-jobs-routes-local | passed (1) | flaky (1/1 → aislado 1 passed) |
| pro-lan-and-contact-parity | passed (1) | passed (1) |
| pro-lazy-sections | flaky (2/4 → aislado 4 passed) | passed (4) |
| pro-lead-center-api | passed (6) | passed (6) |
| pro-lead-center | passed (6) | flaky (1/6 → aislado 6 passed) |
| pro-lead-commercial-progress-api | passed (4) | passed (4) |
| pro-lead-commercial-progress-journey | passed (4) | passed (4) |
| pro-lead-followups-api | flaky (1/4 → aislado 4 passed) | passed (4) |
| pro-lead-followups-journey | passed (7) | passed (7) |
| pro-lead-origin-create-api | passed (5) | passed (5) |
| pro-lead-origin-create-journey | passed (6) | passed (6) |
| pro-lead-origins-api | passed (4) | passed (4) |
| pro-lead-origins-journey | passed (4) | passed (4) |
| pro-lead-private-quotes-api | passed (4) | passed (4) |
| pro-lead-private-quotes-journey | passed (4) | passed (4) |
| pro-leads-inboxes | passed (6) | passed (6) |
| pro-local-integration | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-manual-lead-quotes-api | passed (5) | flaky (1/5 → aislado 5 passed) |
| pro-manual-lead-quotes-journey | passed (4) | flaky (1/4 → aislado 4 passed) |
| pro-manual-lead-work-api | passed (4) | passed (4) |
| pro-manual-lead-work-journey | passed (5) | passed (5) |
| pro-modal-keyboard-boundary | failed (1/1 en aislamiento) → **12-nov: skip (escritorio)** | passed (1) → **12-nov: pasa** |
| pro-modal-localization-journey | failed (6/6 en aislamiento) → **12-nov: pasa 6/6** | failed (6/6 en aislamiento) → **12-nov: pasa 6/6** |
| pro-native-section-scroll | passed (2) → **12-nov: skip previo (contrato móvil)** | failed (2/2 en aislamiento) → **12-nov: falla 2/2 (N2)** |
| pro-navigation | passed (2) | passed (2) |
| pro-notifications-parity | passed (2) | passed (2) |
| pro-notifications-read-failure | failed (1/6 en aislamiento) → **12-nov: pasa 6/6** | failed (1/3 en aislamiento) → **12-nov: pasa 3/3 (3 skip de escritorio)** |
| pro-panel-state | passed (2) → **12-nov: pasa 2/2** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-panel-ux | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-payment-metadata-english | passed (1) | flaky (1/1 → aislado 1 passed) |
| pro-payment-metadata | passed (1) | flaky (1/1 → aislado 1 passed) |
| pro-payment-overview | passed (1) | passed (1) |
| pro-payment-receipts | passed (1) | passed (1) |
| pro-prefetch-lifecycle | passed (5) | passed (5) |
| pro-private-daily-file-recovery-api | passed (2) | passed (2) |
| pro-private-daily-file-recovery-journey | passed (2) | passed (2) |
| pro-private-daily-logs-access-api | passed (2) | passed (2) |
| pro-private-daily-logs-access-journey | passed (2) | passed (2) |
| pro-private-estimate-commercial-list-api | passed (2) | passed (2) |
| pro-private-estimate-commercial-list-journey | passed (2) | passed (2) |
| pro-private-estimate-destination-copy-api | passed (6) | passed (6) |
| pro-private-estimate-destination-copy-journey | passed (3) | passed (3) |
| pro-private-estimate-publication-copy-api | passed (5) | passed (5) |
| pro-private-estimate-publication-copy-journey | passed (2) | passed (2) |
| pro-private-estimate-publications-api | passed (5) | passed (5) |
| pro-private-estimate-publications-journey | passed (2) | passed (2) |
| pro-private-estimate-publications-pdf | passed (4) | passed (4) |
| pro-private-estimate-work-api | passed (6) | passed (6) |
| pro-private-estimate-work-journey | passed (2) | passed (2) |
| pro-private-estimates-api | passed (4) | passed (4) |
| pro-private-estimates-journey | failed (2/6 en aislamiento) → **12-nov: pasa 6/6** | failed (2/6 en aislamiento) → **12-nov: pasa 6/6** |
| pro-private-estimates-pdf | passed (4) | passed (4) |
| pro-private-schedule-templates-access-api | passed (2) | passed (2) |
| pro-private-schedule-templates-access-journey | passed (2) | passed (2) |
| pro-private-stages-api | passed (4) | passed (4) |
| pro-private-stages-journey | passed (3) | passed (3) |
| pro-private-team-access-api | passed (3) | passed (3) |
| pro-private-team-access-journey | passed (2) | passed (2) |
| pro-private-work-plan-access-api | passed (2) | passed (2) |
| pro-private-work-plan-access-journey | passed (2) | passed (2) |
| pro-private-work-tools-access-api | passed (5) | passed (5) |
| pro-private-work-tools-journey | passed (2) | passed (2) |
| pro-profile-routes-local | passed (2) → **12-nov: pasa 2/2** | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-project-card-style | passed (2) | passed (2) |
| pro-project-deeplink | passed (2) → **12-nov: pasa 2/2** | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-project-journey | passed (3) | passed (3) |
| pro-project-notes-details | failed (módulo sin API: 404) | failed (módulo sin API: 404) |
| pro-project-planning | passed (3) | passed (3) |
| pro-project-read-lifecycle | passed (2) | passed (2) |
| pro-project-schedule | passed (2) | passed (2) |
| pro-projects | passed (2) | passed (2) |
| pro-purchase-orders | flaky (1/2 → aislado 2 passed) | passed (2) |
| pro-quantity-input | passed (1) | passed (1) |
| pro-quote-change-requests | passed (2) | passed (2) |
| pro-quote-choices | flaky (1/1 → aislado 1 passed) | passed (1) |
| pro-quote-draft-recovery | passed (5) | passed (5) |
| pro-quote-price-input | passed (1) | passed (1) |
| pro-quote-ux | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-quote-validity | passed (1) | passed (1) |
| pro-quotes-settled-visual | passed (2) | passed (2) |
| pro-quotes-unified | passed (1) | passed (1) |
| pro-request-followups | passed (3) | passed (3) |
| pro-request-pipeline-api | passed (5) | passed (5) |
| pro-request-pipeline | passed (4) | passed (4) |
| pro-request-quote-journey | flaky (1/4 → aislado 4 passed) | passed (4) |
| pro-request-quote-response-recovery | passed (1) | passed (1) |
| pro-reservations | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-runtime-navigation-cancel | passed (1) | passed (1) |
| pro-sales-workspace | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-schedule-template-management | flaky (1/5 → aislado 5 passed) | passed (5) |
| pro-schedule-templates-api | passed (3) | passed (3) |
| pro-schedule-templates | passed (2) | passed (2) |
| pro-scoped-panels | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-search-availability-preview | passed (2) | passed (2) |
| pro-section-scroll | passed (2) → **12-nov: skip previo (contrato móvil)** | failed (2/2 en aislamiento) → **12-nov: pasa 2/2** |
| pro-select-recovery | passed (1) | passed (1) |
| pro-selections | passed (2) | passed (2) |
| pro-server | passed (4) | passed (4) |
| pro-service-focus | passed (1) | passed (1) |
| pro-service-journey | failed (1/3 en aislamiento) → **12-nov: pasa 3/3** | failed (1/3 en aislamiento) → **12-nov: pasa 3/3** |
| pro-service-package-recovery | passed (8) | passed (8) |
| pro-service-package-write-recovery | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** | passed (2) → **12-nov: pasa 2/2 (1 intermitente en lote, aislada pasa)** |
| pro-service-packages-english | failed (1/1 en aislamiento) → **12-nov: pasa** | passed (1) → **12-nov: pasa** |
| pro-service-packages | flaky (1/1 → aislado 1 passed) | passed (1) |
| pro-simplified-navigation | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-social | passed (2) | passed (2) |
| pro-stock-history | passed (1) | passed (1) |
| pro-task-center-actions | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** | passed (2) → **12-nov: pasa** |
| pro-task-center-batch | passed (4) | passed (4) |
| pro-task-center-planning-api | passed (1) | passed (1) |
| pro-task-center-planning | passed (2) | passed (2) |
| pro-task-center | passed (3) | passed (3) |
| pro-task-template-management | flaky (1/2 → aislado 2 passed) | flaky (1/2 → aislado 2 passed) |
| pro-task-templates-api | passed (2) | passed (2) |
| pro-task-templates | passed (2) | passed (2) |
| pro-team-api | passed (1) | passed (1) |
| pro-team-assignments-api | passed (1) | passed (1) |
| pro-team-assignments | flaky (1/2 → aislado 2 passed) | passed (2) |
| pro-team-task-discussion-api | flaky (1/1 → aislado 1 passed) | passed (1) |
| pro-team-task-discussion | passed (2) | passed (2) |
| pro-team-task-mentions-api | passed (1) | passed (1) |
| pro-team-task-mentions | passed (2) | passed (2) |
| pro-team | failed (1/6 en aislamiento) → **12-nov: pasa 6/6** | passed (6) → **12-nov: pasa 6/6** |
| pro-time-tracking | flaky (1/2 → aislado 2 passed) | passed (2) |
| pro-tool-form-layout | failed (1/2 en aislamiento) → **12-nov: pasa 2/2** | flaky (1/2 → aislado 2 passed) → **12-nov: pasa 2/2** |
| pro-tools-profile-menu | passed (2) → **12-nov: skip previo (contrato móvil)** | failed (2/2 en aislamiento) → **12-nov: falla 2/2 (N1)** |
| pro-usability | failed (1/1 en aislamiento) → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-visit-preparation-english | failed (1/1 en aislamiento) → **12-nov: pasa** | flaky (1/1 → aislado 1 passed) → **12-nov: pasa** |
| pro-visit-preparation | failed (1/1 en aislamiento) → **12-nov: pasa** | passed (1) → **12-nov: pasa** |
| pro-work-budget-api | flaky (4/7 → aislado 7 passed) | passed (7) |
| pro-work-budget-journey | flaky (3/3 → aislado 3 passed) | passed (3) |
| pro-work-change-response-recovery | passed tras corrección (2) | passed (2) |
| pro-work-change-write-recovery | passed tras corrección (2) | passed (2) |
| pro-work-changes-english | passed (1) | passed (1) |
| pro-work-changes | passed (1) | passed (1) |
| pro-work-cost-write-recovery | passed (2) | passed (2) |
| pro-work-cost-write-reload | passed (1) | passed (1) |
| pro-work-costs-english | passed (1) | passed (1) |
| pro-work-costs | passed (1) | passed (1) |
| pro-work-delivery-english | failed (1/1) tras corrección parcial → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-work-delivery | failed (1/1) tras corrección parcial → **12-nov: pasa** | failed (1/1 en aislamiento) → **12-nov: pasa** |
| pro-work-files-headers | passed (1) | passed (1) |
| pro-work-files | passed (3) | passed (3) |
| pro-work-milestones-api | passed (1) | passed (1) |
| pro-work-milestones | passed (2) | passed (2) |
| pro-work-schedule-api | passed (1) | passed (1) |
| pro-work-schedule | passed (4) | passed (4) |
| pro-work-tasks | passed (3) | passed (3) |
| pro-work-timeline-api | passed (1) | passed (1) |
| pro-work-timeline | passed (2) | passed (2) |
| pro-work-updates | passed (3) | passed (3) |
| pro-work-write-reload | failed (3/3) tras corrección parcial → **12-nov: pasa 3/3** | failed (3/3 en aislamiento) → **12-nov: pasa 3/3** |
| pro-workspace | passed (4) | passed (4) |
