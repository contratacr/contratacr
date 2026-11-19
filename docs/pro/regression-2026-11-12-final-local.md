# Regresión final Pro local — 12 noviembre 2026

Rama `local/pro-suite-no-push`, worktree `/Users/contratacr/Desktop/contratacr/contratacr-pro`. Servidor dev `http://127.0.0.1:3185` (webpack) y Supabase solo en loopback. No se hizo commit, push, stash, merge, ramas, despliegues ni envíos. `S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`.

## Resumen

| Perfil | Specs | Tests en lote (passed / failed / omitidos) | Specs verdes en lote | Intermitentes (fallaron en lote, pasaron aisladas) | Persistentes | Corregidas |
|---|---|---|---|---|---|---|
| chromium-desktop | 249 | 591 / 30 / 18 | 224 | 22 | **0** | 3 (`pro-work-costs`, `pro-work-costs-english`, `pro-work-cost-write-recovery`) |
| webkit-mobile | 249 | 612 / 17 / 10 (+2 de `pro-contracts`, corrida aparte¹) | 233 | 16 | **0** | — (la corrida ya incluía la corrección) |

- Al cierre no queda ninguna spec con fallo persistente en ninguno de los dos perfiles.
- Las 3 specs de costos fallaron siempre en chromium (lote más 2 aislamientos) por un **defecto de producto** introducido hoy (§ 2). Se corrigió con un cambio pequeño en `business-panel.tsx`; después pasan en chromium y en toda la corrida de webkit.
- Las intermitentes son de entorno: timeouts de 15–30 s en `apiRequestContext`, `page.goto` o `page.screenshot`, compilación bajo demanda, RSS del servidor por encima de 5,5–7,6 GB a mitad de lote, y `ECONNRESET` aislado. Algunas son navegaciones interrumpidas por otra navegación (§ 3).
- ¹ `pro-contracts` no corrió en el lote 2 de webkit por un error en el script de lotes (§ 5). Se corrió aparte: 2/2.

## 1. Estáticos

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 errores (antes y después de la corrección) |
| `npx eslint src/components/pro src/lib/pro src/app/api/pro tests/e2e/pro-*.spec.ts` | 0 errores, 1 advertencia previa (`src/components/pro/invoice-document-settings.tsx:16`, `react-hooks/exhaustive-deps`, sin tocar). `business-panel.tsx` tras la corrección: 0 problemas. |
| `node scripts/pro/verify-local-preparation-manifest.mjs` | PASS: 119 módulos SQL, 120 pasos, 208 dependencias |
| `scripts/pro/verify-*-db.mjs` (36 scripts, con `source $S/native-env.sh`) | 36/36 PASS (resumen en `$S/final-reg/static/verify-db-summary.txt`) |
| `node scripts/pro/verify-pdfjs-vendor.mjs` | PASS: pdf.js 6.4.299, los hashes coinciden con el tarball |

## 2. Fallo persistente corregido: costos del trabajo (chromium)

**Síntoma.** `pro-work-costs` y `pro-work-costs-english`: tras inyectar un 503 en la primera lectura de `/api/pro/work-costs`, `[data-work-costs]` nunca muestra el `alert` honesto. `pro-work-cost-write-recovery` [es]/[en] deja el registro pendiente en `localStorage` (`expect.poll(stored).toBeNull()`) en las líneas 24, 31, 42 y 43, según la corrida.

**Evidencia (traza `iso1`).** El 503 llega a las 16:34:30.142 y 220 ms después hay una segunda lectura con 200. `/api/pro/client-operations` también se pide dos veces, a las 30.007 y a las 30.236. El estado de error del primer `WorkCosts` desaparece porque el componente se vuelve a montar.

**Causa raíz.** En la corrección B6 de hoy (`qa-review-2026-11-10-local.md` § «Corrección de fallos persistentes») se cambió la clave de `<ClientOperations>` en `business-panel.tsx` a `"operations:"+(accountId||"pending")+":"+customer.id`. Cuando llega la cuenta, la clave pasa de `pending` al id y React vuelve a montar todo el árbol: «Trabajos y saldos», `WorkCosts`, presupuesto y recuperación de escrituras. Eso repite todas las lecturas y descarta el estado anidado: el error visible y la recuperación en curso de una escritura de costos (el reintento queda en la instancia desmontada).

**Corrección** (respaldo `$S/final-reg-backup/business-panel.tsx.orig`). Una «generación» de dueño reemplaza la cuenta en la clave. Cuando la cuenta se resuelve por primera vez (`""`→id), la instancia se conserva; solo se vuelve a montar si la cuenta cambia a otra distinta. `ClientOperations` ya espera la cuenta por dentro (`client-operations.tsx:57`), así que B6 sigue cubierto.

```tsx
const [operationsOwner,setOperationsOwner]=useState({id:accountId,generation:0});
if(accountId&&accountId!==operationsOwner.id)setOperationsOwner({id:accountId,generation:operationsOwner.id?operationsOwner.generation+1:operationsOwner.generation});
// …
<ClientOperations key={"operations:"+operationsOwner.generation+":"+customer.id} …/>
```

**Prueba A/B (chromium-desktop).** Antes de la corrección fallaban 3/3 corridas (lote, `iso1` e `iso2`). Después pasan, sin tocar ninguna aserción: `pro-work-costs` 1/1, `pro-work-costs-english` 1/1, `pro-work-cost-write-recovery` 2/2, `pro-work-cost-write-reload` 1/1, `pro-client-recovery-scope` 2/2 (la spec de B6), `pro-client-operations` 1/1, `pro-work-budget-api` 7/7, `pro-work-budget-journey` 3/3 y `pro-client-write-recovery` 2/2 (log `$S/fix-logs/finreg-fix1-chromium-desktop.log`). En webkit-mobile, la corrida completa posterior a la corrección pasó las tres de costos en el lote.

## 3. Intermitentes: firmas

- **Timeouts del servidor dev** (la mayoría, en lotes con RSS alto): `apiRequestContext.get/post: Timeout 15000ms`, `page.goto: Timeout 30000ms`, `page.reload`, `page.screenshot` y «Cargando detalle…» sin terminar. Afectan a `pro-lead-*`, `pro-quote-choices`, `pro-reservations`, `pro-search-availability-preview`, `pro-select-recovery`, `pro-invoice-detail`, `pro-payment-receipts`, `pro-project-journey`, `pro-private-estimate-*` (webkit) y otras. En el lote 3 de chromium el RSS pasó de 5,6 GB a mitad de lote. En el lote 2 reanudado de webkit llegó a 7,6 GB.
- **Primera compilación del idioma [es]**: un botón sigue deshabilitado a los 12 s (`pro-form-keyboard` en ambos perfiles, `pro-lazy-sections`, `pro-lead-commercial-progress-journey`).
- **Navegación interrumpida**: `pro-simplified-navigation` y `pro-sales-workspace` en chromium (`net::ERR_ABORTED` en `gotoOK`, fallaron en lote y en `iso1` y pasaron en `iso2`), y `pro-agenda-operations` en webkit («interrupted by another navigation» a la URL de la cita, falló 2 veces y pasó en la tercera). En `pro-simplified-navigation`, la traza muestra que, tras `page.goBack()`, el documento de la lista se vuelve a cargar mientras empieza el `goto` siguiente. Coincide con `handlePopState` de Next (`app-router.js:67`): recarga si la entrada no tiene `__NA`. La spec borra a propósito `ccrProNavigation` antes. Esa spec no usa `stabilizeLocalProRuntime`. No se corrigió: pasa aislada y no hay evidencia de impacto real en el usuario.
- **URL que queda en `/dashboard/pro` sin `tab`** después de pulsar una sección: `pro-independent-space` [es] (chromium, lote) y `pro-tools-profile-menu` [es] (webkit, en el lote y en la variante `PRO_TOOLS_NATIVE=1`). Pasa en los reintentos (2/2, 2/2 y 2/2). Siempre en el primer test del archivo. Conviene vigilarla: puede ser una carrera de la navegación por secciones con la primera compilación.
- **Otras**: `route.fetch: read ECONNRESET` en `pro-work-budget-journey` (webkit, 2 veces; la tercera 3/3), una medida de 459 px frente a > 465 px en `pro-service-packages-english` (ambos perfiles, 1/1 aislada), y un registro de recuperación de `pro-daily-log-discussion` (webkit, 6/6 aislada).

## 4. Variantes

| Variante | chromium-desktop | webkit-mobile |
|---|---|---|
| `PRO_INDEPENDENT=1 pro-job-workspace` | 2/2 | 2/2 |
| `PRO_STYLE_NATIVE=1 pro-project-card-style` | — (la spec se omite en escritorio) | 2/2 |
| `PRO_TOOLS_NATIVE=1 pro-tools-profile-menu` | — (se omite en escritorio) | 1/2 → 2/2 (intermitente, § 3) |

## 5. Comandos exactos

```
cd /Users/contratacr/Desktop/contratacr/contratacr-pro
# Estáticos
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/pro src/lib/pro src/app/api/pro tests/e2e/pro-*.spec.ts
node scripts/pro/verify-local-preparation-manifest.mjs
node scripts/pro/verify-pdfjs-vendor.mjs
source $S/native-env.sh >/dev/null 2>&1; for f in scripts/pro/verify-*-db.mjs; do node $f; done
# Lotes de 40 (por lote: PLAYWRIGHT_OUTPUT_DIR/PLAYWRIGHT_JSON_OUTPUT_NAME propios; reinicio si RSS > 5,5 GB o > 3 ECONNRESET)
zsh $S/final-reg/chunks.zsh chromium-desktop full $S/final-reg-specs.txt 40
FORCE_RESTART_FIRST=1 zsh $S/final-reg/chunks.zsh webkit-mobile full $S/final-reg-specs.txt 40
zsh $S/final-reg/chunks.zsh webkit-mobile wk2 $S/final-reg/wk-rest.txt 40      # reanudación desde la spec 81
#   equivale por lote a:
#   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 [PLAYWRIGHT_WEBKIT=1] npx playwright test --config=playwright.pro-local.config.ts <40 specs> --project=<perfil> --workers=1 --reporter=line,json
# Aislamiento (una invocación por spec)
FORCE_RESTART_FIRST=1 zsh $S/final-reg/chunks.zsh chromium-desktop iso1 $S/final-reg/chr-failed-list.txt 1
FORCE_RESTART_FIRST=1 zsh $S/final-reg/chunks.zsh webkit-mobile wkiso $S/final-reg/wkiso-list.txt 1
source $S/native-env.sh; zsh $S/fix-run2.zsh <perfil> <tag> <specs…>      # iso2, fix1, wkiso2, variantes (PRO_INDEPENDENT/PRO_STYLE_NATIVE/PRO_TOOLS_NATIVE=1 delante)
# Servidor
node scripts/dev-local-test-env.js --webpack --hostname 127.0.0.1 --port 3185   # log $S/dev-3185.log
# Tabla
python3 -I $S/final-reg/gen.py
```

**Incidencias de la corrida.**
- La sesión se interrumpió a las 12:09, durante el lote 3 de webkit (test 81/124, `pro-leads-inboxes`): no quedó servidor ni Playwright y ese lote no escribió su JSON. Se reinició el servidor y se reanudó desde la spec 81 (`wk2`, lotes 1–5).
- `chunks.zsh` tenía un error: `restart()` reutilizaba la variable `i` del bucle y, después de un reinicio, el lote siguiente se saltaba su primera spec. Afectó a `pro-form-keyboard` en `iso1` de chromium (se corrió en `iso2`, 2/2) y a `pro-contracts` en el lote 2 de webkit (corrida aparte, 2/2). Se corrigió con `local i p pid p2` antes de reanudar `wk2`. La corrida completa de chromium no tuvo reinicios dentro del bucle y cubrió las 249 specs.
- Reinicios del servidor por el script: chromium 1 (antes de `iso1`; la corrida completa no lo necesitó), webkit 5 (inicio de `full`, reanudación `wk2`, RSS 7,6 GB antes del lote 3 y 5,97 GB antes del lote 5 de `wk2`, inicio de `wkiso`). `fix-run2.zsh` no reinició.

Logs y JSON: `$S/final-reg/logs/`, `$S/final-reg/json/`, `$S/final-reg/out/` (trazas), `$S/fix-logs/finreg-*.log`.

## 6. Comparación con el 11-nov

| | 11-nov chromium | 12-nov chromium | 11-nov webkit | 12-nov webkit |
|---|---|---|---|---|
| Specs | 241 (3 de fase 2 excluidas) | 249 (todas) | 241 | 249 |
| Verdes en lote | 190 | 224 | 191 | 233 |
| Intermitentes | 13 | 22 | 10 | 16 |
| Persistentes | 38 (58 tests) | 0 (3 corregidas en esta regresión) | 40 (65 tests) | 0 |

- Las 38/40 persistentes del 11-nov (incluidos los 4 módulos sin API: `pro-bids`, `pro-contracts`, `pro-file-versions` y `pro-project-notes-details`) pasan hoy. En webkit, `pro-native-section-scroll` (N2) pasa en el lote y `pro-tools-profile-menu` (N1) pasa aislada (en el lote, 1/2 por la firma «sin `tab`» del § 3).
- Las specs nuevas desde el 11-nov pasan en ambos perfiles: fase 2 (`pro-takeoffs`, `pro-credits-retainers`, `pro-mood-boards`; esta última intermitente en webkit), `pro-phase2-qa-fixes`, `pro-credit-notes-statement`, `pro-takeoffs-pdf`, `pro-bid-portal` y `pro-company-file-versions`.
- Hay más intermitentes que el 11-nov porque los lotes llegaron a más RSS (7,6 GB) y la suite creció. Todas pasan aisladas con el servidor recién iniciado.

## 7. Tabla por spec

passed (n) = n tests verdes en el lote · flaky = falló en el lote y pasó aislada (con `→` se encadenan los aislamientos sucesivos) · corregida = fallo persistente corregido en esta regresión · omitida = skip condicional del perfil.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-access-bootstrap-recovery | passed (4) | passed (4) |
| pro-access-loading | passed (2) | passed (2) |
| pro-agenda-operations | passed (1) | flaky (falló 1/1 en lote → aislada 0/1 → 1/1) |
| pro-allowances | passed (2) | passed (2) |
| pro-appointment-inbox | passed (2) | passed (2) |
| pro-appointment-login | passed (4) | passed (4) |
| pro-appointment-notices | passed (2) | passed (2) |
| pro-appointment-notification-copy | passed (7) | passed (7) |
| pro-appointment-reminder-copy | passed (4) | passed (4) |
| pro-appointment-reminders | passed (2) | passed (2) |
| pro-appointment-requests | passed (1) | passed (1) |
| pro-appointment-reschedule | passed (1) | passed (1) |
| pro-appointment-schedule | passed (2) | passed (2) |
| pro-bid-portal | passed (2) | passed (2) |
| pro-bids | passed (2) | passed (2) |
| pro-billing | passed (1) | passed (1) |
| pro-business | passed (3) | passed (3) |
| pro-catalog-expected-actor | passed (1) | passed (1) |
| pro-catalog-import | passed (3) | passed (3) |
| pro-catalog-item-types | passed (1) | passed (1) |
| pro-catalog-organizations | passed (1) | passed (1) |
| pro-catalog-storage | passed (1) | passed (1) |
| pro-client-dashboard | passed (2) | passed (2) |
| pro-client-english | passed (2) | passed (2) |
| pro-client-fiscal | passed (1) | passed (1) |
| pro-client-history | passed (1) | passed (1) |
| pro-client-identification | passed (2) | passed (2) |
| pro-client-operations | passed (1) | passed (1) |
| pro-client-pending-requests | passed (2) | passed (2) |
| pro-client-recovery-scope | passed (2) | passed (2) |
| pro-client-statement | passed (1) | passed (1) |
| pro-client-statement-english | passed (1) | passed (1) |
| pro-client-write-recovery | passed (2) | passed (2) |
| pro-company | passed (3) | passed (3) |
| pro-company-daily-log-files | passed (6) | passed (6) |
| pro-company-daily-log-files-api | passed (5) | passed (5) |
| pro-company-file-management | passed (2) | passed (2) |
| pro-company-file-versions | passed (2) | passed (2) |
| pro-company-files | passed (2) | passed (2) |
| pro-company-files-api | passed (2) | passed (2) |
| pro-contracts | passed (2) | passed (2) — corrida aparte¹ |
| pro-credit-notes-statement | passed (2) | passed (2) |
| pro-credits-retainers | passed (2) | passed (2) |
| pro-daily-log-discussion | passed (6) | flaky (falló 1/6 en lote → aislada 6/6) |
| pro-daily-log-discussion-api | passed (2) | passed (2) |
| pro-daily-log-duplicate | passed (6) | passed (6) |
| pro-daily-log-duplicate-api | passed (6) | passed (6) |
| pro-daily-log-file-reconcile | passed (6) | passed (6) |
| pro-daily-log-file-reconcile-api | passed (3) | passed (3) |
| pro-daily-log-file-storage | passed (2) | passed (2) |
| pro-daily-log-files | passed (4) | passed (4) |
| pro-daily-log-files-api | passed (2) | passed (2) |
| pro-daily-log-footer | passed (8) | passed (8) |
| pro-daily-logs | passed (6) | passed (6) |
| pro-daily-logs-api | passed (2) | passed (2) |
| pro-dashboard-prefetch-smoke | passed (2) | omitida (2) |
| pro-delivery-acknowledge-recovery | passed (2) | passed (2) |
| pro-delivery-photo-recovery | passed (2) | passed (2) |
| pro-delivery-photo-reload | passed (2) | passed (2) |
| pro-delivery-write-recovery | passed (2) | passed (2) |
| pro-direct-invoice | passed (1) | passed (1) |
| pro-direct-project-quote-recovery | flaky (falló 1/2 en lote → aislada 2/2) | passed (2) |
| pro-direct-quote-public-code | passed (1) | passed (1) |
| pro-direct-quote-tab-recovery | passed (3) | passed (3) |
| pro-direct-quote-write-recovery | passed (17) | passed (17) |
| pro-discount-presets | passed (1) | passed (1) |
| pro-document-settings | passed (1) | passed (1) |
| pro-editor-draft | passed (1) | passed (1) |
| pro-expense-revision-race | passed (2) | passed (2) |
| pro-expense-write-recovery | passed (2) | passed (2) |
| pro-expenses | passed (1) | passed (1) |
| pro-expenses-english | passed (1) | passed (1) |
| pro-file-versions | passed (3) | passed (3) |
| pro-form-keyboard | flaky (falló 1/2 en lote → aislada 2/2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-forms-ux | passed (1) | passed (1) |
| pro-header-parity | omitida (2) | passed (2) |
| pro-home-summary | passed (2) | passed (2) |
| pro-identity-access | passed (1) | passed (1) |
| pro-identity-security-runtime | passed (6) | passed (6) |
| pro-independent-space | flaky (falló 1/2 en lote → aislada 2/2) | passed (2) |
| pro-inventory-write-recovery | passed (2) | passed (4) |
| pro-invoice-beverages | passed (1) | passed (1) |
| pro-invoice-detail | flaky (falló 1/1 en lote → aislada 1/1) | passed (1) |
| pro-invoice-drafts | passed (1) | passed (1) |
| pro-invoice-extras | passed (1) | passed (1) |
| pro-invoice-management | passed (1) | passed (1) |
| pro-invoice-payments | passed (1) | passed (1) |
| pro-invoice-preparation | passed (1) | passed (1) |
| pro-invoice-recurrence | passed (1) | passed (1) |
| pro-invoice-tax | passed (1) | passed (1) |
| pro-issuer-settings | passed (1) | passed (1) |
| pro-job-workspace | passed (2) | passed (2) |
| pro-jobs-routes-local | flaky (falló 1/1 en lote → aislada 1/1) | passed (1) |
| pro-lan-and-contact-parity | omitida (1) | omitida (1) |
| pro-lazy-sections | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-lead-center | flaky (falló 4/6 en lote → aislada 6/6) | passed (6) |
| pro-lead-center-api | passed (6) | passed (6) |
| pro-lead-commercial-progress-api | passed (4) | passed (4) |
| pro-lead-commercial-progress-journey | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-lead-followups-api | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-lead-followups-journey | flaky (falló 1/7 en lote → aislada 7/7) | passed (7) |
| pro-lead-origin-create-api | passed (5) | passed (5) |
| pro-lead-origin-create-journey | passed (6) | passed (6) |
| pro-lead-origins-api | passed (4) | passed (4) |
| pro-lead-origins-journey | passed (4) | passed (4) |
| pro-lead-private-quotes-api | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-lead-private-quotes-journey | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-leads-inboxes | passed (6) | passed (6) |
| pro-local-integration | passed (1) | passed (1) |
| pro-manual-lead-quotes-api | passed (5) | passed (5) |
| pro-manual-lead-quotes-journey | passed (4) | passed (4) |
| pro-manual-lead-work-api | passed (4) | passed (4) |
| pro-manual-lead-work-journey | passed (5) | passed (5) |
| pro-modal-keyboard-boundary | omitida (1) | passed (1) |
| pro-modal-localization-journey | passed (6) | passed (6) |
| pro-mood-boards | passed (2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-native-section-scroll | omitida (2) | passed (2) |
| pro-navigation | passed (2) | passed (2) |
| pro-notifications-parity | omitida (2) | passed (2) |
| pro-notifications-read-failure | passed (6) | passed (3, +3 omitidas) |
| pro-panel-state | passed (2) | passed (2) |
| pro-panel-ux | passed (1) | passed (1) |
| pro-payment-metadata | passed (1) | passed (1) |
| pro-payment-metadata-english | passed (1) | passed (1) |
| pro-payment-overview | passed (1) | passed (1) |
| pro-payment-receipts | passed (1) | flaky (falló 1/1 en lote → aislada 1/1) |
| pro-phase2-qa-fixes | passed (9) | passed (9) |
| pro-prefetch-lifecycle | passed (5) | passed (5) |
| pro-private-daily-file-recovery-api | passed (2) | passed (2) |
| pro-private-daily-file-recovery-journey | passed (2) | passed (2) |
| pro-private-daily-logs-access-api | passed (2) | passed (2) |
| pro-private-daily-logs-access-journey | passed (2) | passed (2) |
| pro-private-estimate-commercial-list-api | passed (2) | passed (2) |
| pro-private-estimate-commercial-list-journey | passed (2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-private-estimate-destination-copy-api | passed (6) | passed (6) |
| pro-private-estimate-destination-copy-journey | passed (3) | flaky (falló 1/3 en lote → aislada 3/3) |
| pro-private-estimate-publication-copy-api | passed (5) | passed (5) |
| pro-private-estimate-publication-copy-journey | passed (2) | passed (2) |
| pro-private-estimate-publications-api | passed (5) | passed (5) |
| pro-private-estimate-publications-journey | passed (2) | passed (2) |
| pro-private-estimate-publications-pdf | passed (2, +2 omitidas) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-private-estimate-work-api | passed (6) | passed (6) |
| pro-private-estimate-work-journey | passed (2) | passed (2) |
| pro-private-estimates-api | passed (4) | passed (4) |
| pro-private-estimates-journey | passed (6) | flaky (falló 1/6 en lote → aislada 6/6) |
| pro-private-estimates-pdf | passed (2, +2 omitidas) | passed (2, +2 omitidas) |
| pro-private-schedule-templates-access-api | passed (2) | passed (2) |
| pro-private-schedule-templates-access-journey | passed (2) | passed (2) |
| pro-private-stages-api | passed (4) | passed (4) |
| pro-private-stages-journey | passed (3) | passed (3) |
| pro-private-team-access-api | passed (3) | passed (3) |
| pro-private-team-access-journey | passed (2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-private-work-plan-access-api | passed (2) | passed (2) |
| pro-private-work-plan-access-journey | passed (2) | passed (2) |
| pro-private-work-tools-access-api | passed (5) | passed (5) |
| pro-private-work-tools-journey | passed (2) | passed (2) |
| pro-profile-routes-local | passed (2) | passed (2) |
| pro-project-card-style | omitida (2) | passed (2) |
| pro-project-deeplink | passed (2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-project-journey | flaky (falló 1/3 en lote → aislada 3/3) | flaky (falló 2/3 en lote → aislada 3/3) |
| pro-project-notes-details | passed (2) | passed (2) |
| pro-project-planning | passed (3) | passed (3) |
| pro-project-read-lifecycle | passed (2) | passed (2) |
| pro-project-schedule | passed (2) | passed (2) |
| pro-projects | passed (2) | passed (2) |
| pro-purchase-orders | passed (2) | passed (2) |
| pro-quantity-input | passed (1) | passed (1) |
| pro-quote-change-requests | passed (2) | passed (2) |
| pro-quote-choices | flaky (falló 1/1 en lote → aislada 1/1) | passed (1) |
| pro-quote-draft-recovery | passed (5) | passed (5) |
| pro-quote-price-input | passed (1) | passed (1) |
| pro-quote-ux | passed (1) | passed (1) |
| pro-quote-validity | passed (1) | passed (1) |
| pro-quotes-settled-visual | passed (2) | passed (2) |
| pro-quotes-unified | passed (1) | passed (1) |
| pro-request-followups | passed (3) | passed (3) |
| pro-request-pipeline | passed (4) | passed (4) |
| pro-request-pipeline-api | passed (5) | passed (5) |
| pro-request-quote-journey | flaky (falló 1/4 en lote → aislada 4/4) | passed (4) |
| pro-request-quote-response-recovery | passed (1) | passed (1) |
| pro-reservations | flaky (falló 1/1 en lote → aislada 1/1) | passed (1) |
| pro-runtime-navigation-cancel | passed (1) | passed (1) |
| pro-sales-workspace | flaky (falló 1/1 en lote → aislada 0/1 → 1/1) | passed (1) |
| pro-schedule-template-management | flaky (falló 1/5 en lote → aislada 5/5) | passed (5) |
| pro-schedule-templates | passed (2) | passed (2) |
| pro-schedule-templates-api | passed (3) | passed (3) |
| pro-scoped-panels | passed (1) | passed (1) |
| pro-search-availability-preview | flaky (falló 2/2 en lote → aislada 2/2) | passed (2) |
| pro-section-scroll | omitida (2) | passed (2) |
| pro-select-recovery | flaky (falló 1/1 en lote → aislada 1/1) | passed (1) |
| pro-selections | passed (2) | passed (2) |
| pro-server | passed (4) | passed (4) |
| pro-service-focus | passed (1) | passed (1) |
| pro-service-journey | passed (3) | passed (3) |
| pro-service-package-recovery | passed (8) | passed (8) |
| pro-service-package-write-recovery | passed (2) | passed (2) |
| pro-service-packages | passed (1) | passed (1) |
| pro-service-packages-english | flaky (falló 1/1 en lote → aislada 1/1) | flaky (falló 1/1 en lote → aislada 1/1) |
| pro-simplified-navigation | flaky (falló 1/1 en lote → aislada 0/1 → 1/1) | passed (1) |
| pro-social | passed (2) | passed (2) |
| pro-stock-history | passed (1) | passed (1) |
| pro-takeoffs | passed (2) | passed (2) |
| pro-takeoffs-pdf | passed (2) | passed (2) |
| pro-task-center | passed (3) | passed (3) |
| pro-task-center-actions | passed (2) | passed (2) |
| pro-task-center-batch | passed (4) | passed (4) |
| pro-task-center-planning | passed (2) | passed (2) |
| pro-task-center-planning-api | passed (1) | passed (1) |
| pro-task-template-management | passed (2) | passed (2) |
| pro-task-templates | passed (2) | passed (2) |
| pro-task-templates-api | passed (2) | passed (2) |
| pro-team | passed (6) | passed (6) |
| pro-team-api | passed (1) | passed (1) |
| pro-team-assignments | passed (2) | passed (2) |
| pro-team-assignments-api | passed (1) | passed (1) |
| pro-team-task-discussion | passed (2) | passed (2) |
| pro-team-task-discussion-api | passed (1) | passed (1) |
| pro-team-task-mentions | passed (2) | passed (2) |
| pro-team-task-mentions-api | passed (1) | passed (1) |
| pro-time-tracking | passed (2) | passed (2) |
| pro-tool-form-layout | passed (2) | passed (2) |
| pro-tools-profile-menu | omitida (2) | flaky (falló 1/2 en lote → aislada 2/2) |
| pro-usability | passed (1) | flaky (falló 1/1 en lote → aislada 1/1) |
| pro-visit-preparation | passed (1) | passed (1) |
| pro-visit-preparation-english | passed (1) | passed (1) |
| pro-work-budget-api | passed (7) | passed (7) |
| pro-work-budget-journey | passed (3) | flaky (falló 1/3 en lote → aislada 2/3 → 3/3) |
| pro-work-change-response-recovery | passed (2) | passed (2) |
| pro-work-change-write-recovery | passed (2) | passed (2) |
| pro-work-changes | passed (1) | passed (1) |
| pro-work-changes-english | passed (1) | passed (1) |
| pro-work-cost-write-recovery | **corregida** (falló 2/2 en lote; aislada 1/2 → 1/2; tras corrección 2/2) | passed (2) |
| pro-work-cost-write-reload | passed (1) | passed (1) |
| pro-work-costs | **corregida** (falló 1/1 en lote; aislada 0/1 → 0/1; tras corrección 1/1) | passed (1) |
| pro-work-costs-english | **corregida** (falló 1/1 en lote; aislada 0/1 → 0/1; tras corrección 1/1) | passed (1) |
| pro-work-delivery | passed (1) | passed (1) |
| pro-work-delivery-english | passed (1) | passed (1) |
| pro-work-files | passed (3) | passed (3) |
| pro-work-files-headers | passed (1) | passed (1) |
| pro-work-milestones | passed (2) | passed (2) |
| pro-work-milestones-api | passed (1) | passed (1) |
| pro-work-schedule | passed (4) | passed (4) |
| pro-work-schedule-api | passed (1) | passed (1) |
| pro-work-tasks | passed (3) | passed (3) |
| pro-work-timeline | passed (2) | passed (2) |
| pro-work-timeline-api | passed (1) | passed (1) |
| pro-work-updates | passed (3) | passed (3) |
| pro-work-write-reload | passed (3) | passed (3) |
| pro-workspace | passed (4) | passed (4) |

¹ `pro-contracts` en webkit-mobile: no corrió en el lote (error del script, § 5); corrida aparte en `wkiso`.
