# Regresión de ContrataCR

> **Qué corre y cuándo** (30-sep-2026): la lista completa de lo que se prueba,
> ambiente por ambiente, está en [`regression-coverage-matrix.md`](./regression-coverage-matrix.md).
>
> | Cuándo | Qué |
> | --- | --- |
> | Cada push a `test` | Compuerta rápida (esquema, contratos, build). |
> | Cada madrugada 3:00 CR | Regresión exhaustiva completa (`regression-tests.yml`); los lunes también Safari. |
> | Cada mañana 6:00 CR | Smoke diario en test.contratacr.com (con sesión) y www.contratacr.com (solo lectura) (`smoke-diario.yml`). |
> | Cada 3 horas | Vigilancia de producción (5 peticiones). |
> | A mano | Regresión de la app nativa (Android + iOS) y Safari antes de publicar diseño. |
>
> Todo fallo avisa por correo a soporte@contratacr.com (`scripts/ci/avisar-por-correo.mjs`).
> Para correr el smoke a mano: `npm run test:e2e:smoke:test` o `npm run test:e2e:smoke:produccion`.


## Local database gate

Every regression run first starts a disposable Supabase stack inside GitHub
Actions and rebuilds the database from `supabase/migrations`. It includes
Postgres, Auth, PostgREST and Storage, but omits Studio, analytics and other
services that the schema contract does not need. This gate uses no hosted
Supabase credentials and cannot modify test or production.

For now, the exhaustive browser suite still uses the isolated hosted test data.
The next migration phase replaces that dependency with synthetic local fixtures;
until parity is proven, the hosted verifier remains the source of truth.

This suite is designed to use the **test data environment** while the application
itself runs as an optimized production build inside GitHub Actions. Production should
receive the same certified code after the local production server passes. A small
post-deployment smoke is the only browser layer that should target a paid host.

## Commands

### Development loop: keep the batch local

Do not push after every fix. During an active bug-fix batch:

1. Reproduce the bug locally and add a focused Playwright case beside the
   affected surface. Every real bug must become a permanent regression case.
2. Run only that spec or case against the local Next.js server. For example:

   ```bash
   npm run test:e2e:focal -- tests/e2e/search-results.spec.ts --grep "whole-province coverage"
   ```

3. Inspect the affected screen manually in both desktop and mobile sizes. Check
   loading, empty, populated, error, disabled, saving and success states; long
   Spanish and English copy; keyboard focus; scroll; overlays; and viewport
   clipping. Automation protects the contract, while this exploration finds the
   next contract that should be automated.
4. Keep all related fixes uncommitted and unpushed until the complete batch is
   locally coherent. Run TypeScript, focused ESLint and every affected spec.
5. Create one release-candidate commit, advance `main` and `test` atomically to
   that same commit, let the fast gates pass, and dispatch exactly one exhaustive
   regression run. Do not use retries to hide a flaky first attempt.

Local Playwright starts the app on loopback; it does not navigate through Cloudflare
unless `PLAYWRIGHT_BASE_URL` is explicitly provided. Seeded cases still require
the isolated test credentials. If those credentials are unavailable, the local
gate must stop instead of silently using production.

Run against the local app:

```bash
npm run test:e2e
```

On Windows/OneDrive, redirect artifacts if its sync client locks
`test-results/.last-run.json`:

```powershell
$env:PLAYWRIGHT_OUTPUT_DIR = Join-Path $env:TEMP "contratacr-playwright"
npm run test:e2e:focal -- tests/e2e/search-results.spec.ts
```

Run explicitly against a deployed host only for a bounded smoke or diagnosis:

```bash
PLAYWRIGHT_BASE_URL=https://test.contratacr.com npm run test:e2e
```

Run only the always-safe smoke layer:

```bash
npm run test:e2e:smoke
```

Open the Playwright UI:

```bash
npm run test:e2e:ui
```

## Release gate

A release candidate is accepted only when the test-environment workflow finishes with:

- TypeScript contracts passing.
- No committed `test.only`.
- Every seeded account and test-environment secret available.
- The complete desktop and mobile suite green on its first attempt.
- No unexpected skipped test in the Playwright report.
- The external-provider checklist below reviewed when auth, email, maps, WhatsApp, or uploads changed.

The detailed source of truth is [the regression coverage matrix](./regression-coverage-matrix.md).

## Coverage

The suite runs in two Playwright projects:

- `chromium-desktop`: 1366 x 900.
- `chromium-mobile`: Pixel 7 viewport.

It covers:

- Public routes in Spanish and English: home, services, legacy categories redirect, search, auth, registration, support, help, contact, how it works, atraer clientes, privacy and terms.
- Public APIs for service search and the approved service catalog.
- Services catalog behavior: known service search, empty enter behavior, unknown-service suggestion CTA, and untranslated-key guards.
- Guest service suggestions: anonymous submissions create a pending admin moderation row and the test cleans up the temporary hidden service.
- Navbar/public shell checks on desktop and responsive.
- Search results and professional cards, including responsive favorite-button layout.
- Public professional profile and professional Open Graph image generation.
- Client booking API flow: create request, block double booking, professional view, mark work done, client completion.
- Booking/project notifications for create, edit, work done, complete and cancellation paths.
- Projects API flow: publish request, ownership rules, reopen and delete.
- Dashboard surfaces for professional mode: profile, services, success cases, availability, requests received, verification, messages, notifications, support, account security.
- Dashboard surfaces for client mode: profile, my requests, my posts, favorites, messages, notifications, support, account security.
- UI entry points for booking and publishing request modals without submitting.
- Editable review lifecycle after completed work, including one-review-per-request persistence.
- Signed-in and guest support ticket creation, automatic acknowledgement, reply, reopen, and confirmation.
- Contextual in-app chat from profiles and requests, including both participants, unread state, realtime delivery, archive/restore and access control.
- ContrataCR AI routing, local documented answers, bounded Workers AI fallback, live search results, safety boundaries, localized actions, responsive visibility and private account history. OpenAI remains disabled by default.
- Real password change and restored seeded credentials.
- Real professional bio, service description, success-case upload, and availability privacy persistence.
- Notification translation and destination contracts for every supported notification type.
- Protected API boundaries for guest users and privacy-safe forgot-password behavior.
- English professional and client panels, localized footer routes, and safe external links.
- Admin signed-out/API boundaries and all authenticated admin sections through the seeded test admin account, including requests and publications.

No regression suite can prove literally every possible user-data combination or guarantee external-provider uptime. This suite is the launch safety net for every major product surface and the flows most likely to regress.

## Test tags

- `@smoke`: public routes, support/login rendering, services catalog, admin signed-out surface, and public APIs. These do not need seeded users.
- `@seeded`: search cards, professional profile, profile share image, dashboard surfaces, booking/project flows, and modal entry points. These use the test Supabase project and skip automatically if seeded regression is disabled.

## GitHub Actions

`regression-tests` runs two different depths:

- **Every push to `test`** runs the fast gate: migrations rebuilt from an empty
  local Supabase stack, synthetic seed, isolation contracts, surface ownership,
  typecheck, lint and `next build`. It does **not** open a browser.
- **Run workflow** (Actions > Regression Tests, branch `test`) additionally runs
  the exhaustive Playwright release regression in four shards against
  `next start` on the runner loopback, then requires zero failures, flakies and
  unexpected skips. This is the release gate; it is never triggered by a push.

Both depths use only the local stack started on the runner, so the workflow has
its own concurrency group. After a failed manual run the job log contains the
Next.js server output and the last 400 lines of the local `auth`, `rest`, `kong`
and `db` containers; the `playwright-report` artifact carries traces, videos and
the error context of every failed test.

This keeps exhaustive browser navigation, server rendering and API calls off Cloudflare Workers.
Provider-specific deployment checks must stay in a separate, short smoke and must not
grow into a second exhaustive suite.

## Notes

When running locally, Google Maps can log `RefererNotAllowedMapError` if the local URL is not allowed in Google Cloud. That warning does not fail the suite; the test environment URL should be allowlisted.

Playwright verifies that ContrataCR submits or renders the correct behavior around Google OAuth, Resend/Brevo, Cloudinary, Google Maps, and WhatsApp. It cannot guarantee that those independent providers deliver a message, keep their service online, or preserve a third-party UI. Use the short manual checklist in the coverage matrix whenever one of those integrations changes.

## Environments: what runs where

| Environment | Branch | Data | Automated | Manual |
|---|---|---|---|---|
| Production | `main` | Real users | `security-checks` on push; daily `supabase-backup` | Never test against production. |
| Test | `test` (same code as `main`) | Production copy refreshed on demand with `sync-production-to-test`, plus the two regression identities below | `regression-tests` on every push to `test` (local stack rebuilt from migrations, seeded, contracts and build); the full Playwright release regression runs from *Run workflow* only | Sign in at https://test.contratacr.com with the regression identities. |
| Mobile | `mobile` (`test` + native shell) | Same as test | `mobile-native-regression` on every push to `mobile`: contracts plus the native WebView shell and direct-chat suites. The Android emulator and iOS simulator jobs run only from *Run workflow* (the macOS runner costs ten times a Linux minute). | Debug APK pointed at a local dev server (`android/app/src/debug`) or the release build against test. |

`cloudflare-compatibility` is the deployment pipeline despite its name: a push to `main` deploys the production Worker (`contratacr`), and a push to `test` **or** `mobile` deploys the shared `contratacr-preview` Worker behind test.contratacr.com — the last of the two pushed wins, which is why the native app loads test.contratacr.com with the `mobile` code after a `mobile` push.

## Manual testing identities (test only)

The seeded regression pair is the same pair you see as **ContrataCR** (client side) and **SG Solutions** (professional side):

- `e2e.client@contratacr.test`
- `e2e.pro@contratacr.test`

Both use the password stored as `E2E_TEST_PASSWORD` — in `.env.test` locally and as a GitHub Actions secret. The value is never committed. `npm run seed:test:full` recreates the pair and its coverage data; `npm run seed:test:verify` checks it. These accounts cannot be deleted through the app (the deletion RPC refuses regression identities).

**Manual test sessions.** Testing by hand with any account other than these two breaks the fixture check the suites rely on. Run `npm run seed:test:verify` **before** a manual session (so you start from a known state) and **again after it** (so whatever the session changed is caught and repaired with `npm run seed:test:full` before the next regression run, not by the run itself).

## Follow-up — 2026-10-16

The exhaustive web run [38960494952](https://github.com/contratacr/contratacr/actions/runs/38960494952) was still running when these follow-up fixes were prepared. This is not a full release certification.

- Added ES/EN round-trip checks for Services, Jobs and Promotions, including query, fragment, cookie persistence and reload: 9 local cases passed across desktop Chromium, mobile Chromium and mobile WebKit. Fixed Jobs/Promotions filter synchronization dropping URL fragments.
- Fixed the App Store link assertion to preserve click evidence outside a document that Linux WebKit may navigate away from; macOS WebKit may delegate the same link to the OS. Twelve targeted local cases passed. This does not certify an actual store installation.
- Deployed test performance measurement failed existing budgets: home ~6.7 MB and professional search ~4.5 MB transferred under the scripted mobile throttle. Kept all thresholds unchanged. Added optional PERF_ROUTES and PERF_DIAGNOSTICS resource reporting to diagnose failures.
- The download artwork was the largest home resource (~1.8 MB on mobile). Added same-dimension WebP assets: mobile 155,910 bytes instead of 1,800,230; desktop 181,778 instead of 2,039,384. Deployed performance must be measured again after deployment; this alone does not resolve the total/JS budgets.
- Native Android compilation/emulator checks and iOS compilation/simulator launch passed in run 38960498676. WebView failures are tracked separately; no store release was submitted.

### Photo budget and partial exhaustive results (2026-10-16)

The first exhaustive shard reported **368 passed and 20 failed**. The run is still in progress; it is not certified. Failures include stale assertions (last-used login hint, welcome copy, fixed category counts, route ownership and hidden prepaint heading) and unresolved Linux WebKit navigation errors. Do not treat those navigation errors as product fixes or suppress them with blanket retries.

The corrected ownership/login/support/category-back contracts passed 27 targeted local cases across the three browser projects. Support now associates its message label with its textarea. Photo preparation has a shared 800 px / 150 KiB budget in all five avatar upload entry points; a noisy camera-sized input and an unchanged small image passed in all three browser projects. Existing lint findings in edited screens are unchanged; the new helper/test add none.

`scripts/optimize-profile-photos.mjs` is dry-run by default and requires explicit `PHOTO_ENV_FILE` and `PHOTO_REPORT`. Test-data simulation found 46 existing R2 profile photos, 58,874,964 bytes before and 2,429,422 bytes after. **No existing photo has been replaced.** Apply requires the existing R2 credentials. It retains originals, records derivative ownership, verifies public bytes and conditionally updates only an unchanged avatar URL. The report records before/after URLs for recovery; keep it outside Git. The local Cloudflare session currently cannot access this storage account.

## 16-oct-2026 — cierre de fallos y segunda ronda completa

La corrida exhaustiva `38960494952`, sobre `a98c2db4`, terminó con 1.528 casos aprobados, 46 fallidos, 151 saltos declarados y 36 casos sin ejecutar. No constituye una certificación. El smoke posterior de `c7882efc` terminó correctamente: los saltos de escritorio del aviso móvil ya declaran su motivo.

Correcciones posteriores:

- Desactivar y eliminar cuentas usan `signOutToHome`, que marca el cierre antes de invalidar la sesión. Conserva el idioma y el resultado de eliminación. La prueba de desactivación también exige que no exista una navegación intermedia a login.
- El acceso de las pruebas espera el contenido visible del panel, además de su URL y cookie, para no iniciar otra navegación mientras el panel termina de montar.
- Las pruebas de registro pulsan la casilla visible de términos y comprueban su estado; ya no ignoran un fallo al marcar el input oculto.
- Los casos de traducción inglesa, tarjeta de cuenta, correo de recuperación y página inexistente usan las etiquetas vigentes y excluyen el prepaint oculto.
- El caso que recorre dos cuentas y cuatro accesos declara su duración como prueba lenta; sus comprobaciones individuales conservan sus plazos.

Validación dirigida: idioma/guías/video en los tres navegadores; registro de cliente web y nativo; desactivación en móvil y escritorio; menú de cuenta en WebKit; edición de datos del admin y enlaces inexistentes en escritorio. Typecheck, lint de archivos modificados, YAML de CI e inventario de superficies también comprobados. Las rondas locales intermedias registraron bloqueos/504 del proyecto test compartido; no se contabilizan como aprobadas.

La regresión web exhaustiva ahora distribuye sus cuatro grupos entre runners independientes, cada uno con Supabase y Next propios, sin cancelar los demás cuando uno falla. El smoke de cada push sigue usando un solo grupo. Los reportes JSON y HTML se conservan por grupo. La regresión WebView deja de modificar el Supabase alojado de test y utiliza una base local sintética con Realtime. Android e iOS continúan bajo ejecución manual y no publican versiones.

Pendiente: recibir y revisar los resultados completos de esta segunda ronda antes de certificar todo el inventario. Los originales de la migración de imágenes siguen conservados; los históricos de otra nube de Cloudinary presentes en test aún requieren revisión separada.
