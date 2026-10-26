# Regresión de ContrataCR

> Política vigente de selección y reutilización: [test-selection-policy.md](./test-selection-policy.md).
> Antes de un lanzamiento manual, justificar el alcance según cambios y evidencia;
> no repetir la exhaustiva por cada nuevo commit. Los disparadores automáticos
> existentes siguen activos mientras no se modifiquen y validen sus workflows.

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
Postgres, Auth, PostgREST, Storage and Realtime, but omits Studio, analytics
and other services that the application does not need. Realtime must stay
available because signed-in headers and conversations open subscriptions. This gate uses no hosted
Supabase credentials and cannot modify test or production.

The exhaustive browser suite uses synthetic local fixtures inside each runner.
The native WebView suite does the same. A bounded manual check can still use
the hosted test mirror, but the exhaustive workflows do not mutate that project.

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
5. Create one coherent release-candidate commit and advance `main` and `test`
   atomically to that same commit. Select validation using
   `test-selection-policy.md`; reuse compatible successful evidence. Dispatch an
   exhaustive run only when the change risk or unknown impact requires it, or
   when explicitly requested. Do not use retries to hide a flaky first attempt.

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

La corrida exhaustiva `38960494952`, sobre `a98c2db4`, terminó con 1.528 casos aprobados, 46 fallidos, 151 saltos y 36 casos sin ejecutar. El verificador final de motivos de salto no se ejecutó tras el fallo, por lo que no se certifican todos esos motivos. No constituye una certificación. El smoke posterior de `c7882efc` terminó correctamente: los saltos de escritorio del aviso móvil ya declaran su motivo.

Correcciones posteriores:

- Desactivar y eliminar cuentas usan `signOutToHome`, que marca el cierre antes de invalidar la sesión. Conserva el idioma y el resultado de eliminación. La prueba de desactivación también exige que no exista una navegación intermedia a login.
- El acceso de las pruebas espera el contenido visible del panel, además de su URL y cookie, para no iniciar otra navegación mientras el panel termina de montar.
- Las pruebas de registro pulsan la casilla visible de términos y comprueban su estado; ya no ignoran un fallo al marcar el input oculto.
- Los casos de traducción inglesa, tarjeta de cuenta, correo de recuperación y página inexistente usan las etiquetas vigentes y excluyen el prepaint oculto.
- El caso que recorre dos cuentas y cuatro accesos declara su duración como prueba lenta; sus comprobaciones individuales conservan sus plazos.

Validación dirigida: idioma/guías/video en los tres navegadores; registro de cliente web y nativo; desactivación en móvil y escritorio; menú de cuenta en WebKit; edición de datos del admin y enlaces inexistentes en escritorio. Typecheck, lint de archivos modificados, YAML de CI e inventario de superficies también comprobados. Las rondas locales intermedias registraron bloqueos/504 del proyecto test compartido; no se contabilizan como aprobadas.

La regresión web exhaustiva ahora distribuye sus cuatro grupos entre runners independientes, cada uno con Supabase y Next propios, sin cancelar los demás cuando uno falla. El smoke de cada push sigue usando un solo grupo. Los reportes JSON y HTML se conservan por grupo. La regresión WebView deja de modificar el Supabase alojado de test y utiliza una base local sintética con Realtime. Android e iOS continúan bajo ejecución manual y no publican versiones.

Pendiente: recibir y revisar los resultados completos de esta segunda ronda antes de certificar todo el inventario. Los originales de la migración de imágenes siguen conservados. La revisión separada de test terminó: cero referencias activas de Cloudinary y 491 propietarios de respaldos registrados; véase `media-migration-2026-10-16.md`.

### Cierre adicional de fotos y comprobaciones móviles

La ejecución móvil `38985601599` terminó correctamente: contratos/build, 130 casos WebView aprobados y dos saltos de escritorio declarados, cuatro pruebas nativas en el emulador Android, y compilación/instalación/arranque en simulador iOS. No equivale a publicar ni certificar una instalación nueva desde las tiendas.

La preparación de fotos públicas de servicios, casos de éxito y promociones ahora comparte un presupuesto de 512 KiB. Los avatares conservan 800 px/150 KiB. Los adjuntos de chat y soporte conservan su presupuesto separado. La prueba de cámara con ruido verifica ambas políticas, dimensiones y proporción; tres navegadores aprobados.

El grupo 4 de `38985601637` terminó con 415 aprobadas, dos fallidas y 29 saltos declarados; las trazas muestran un segmento oculto de streaming `S:*` junto al perfil visible. Los selectores del nombre ahora exigen una única coincidencia visible y la prueba de pestañas mide únicamente las pintadas, manteniendo la exigencia de la fila completa y estable. Otra medición del check ahora captura nombre y sello en un mismo cuadro, para no cruzar una revalidación de datos entre dos lecturas. Los 12 casos dirigidos de perfil aprobaron en el build desplegado de test con Chromium móvil, WebKit móvil y escritorio. Las ejecuciones intermedias de desarrollo registraron recargas de WebKit y no se cuentan como aprobadas.

El grupo 3 de esa misma ronda terminó con 402 aprobadas y 44 saltos declarados; su verificador confirma cero fallos, reintentos que oculten fallos o saltos sin motivo. El resultado de los otros grupos se consolida abajo.

Typecheck y lint del helper de imágenes y los casos modificados pasan. Los tres errores de lint de hooks que ya existían en el editor de servicios, y sus avisos anteriores, se conservan como deuda previa; las líneas de esa lógica no cambiaron en esta corrección.

El grupo 2 de `38985601637` terminó con 390 aprobadas, un fallo, 53 saltos declarados y dos casos sin ejecutar a consecuencia del bloque serial. El fallo de acceso en Linux WebKit contiene `Network process crashed`; la traza también muestra conexiones a Realtime rechazadas porque ese workflow excluía el servicio. Se restaura Realtime en el stack web, igual que en el móvil que aprobó. Esto corrige una diferencia del entorno; la relación causal y el resultado completo deben comprobarse en la siguiente ejecución, sin reintentos generales que oculten fallos.

### Resultado consolidado de la segunda ronda y nuevas correcciones

`38985601637` terminó con **1.611 aprobadas, siete fallidas, 151 saltos declarados y 16 sin ejecutar** de 1.785 casos descubiertos. El análisis de los cuatro JSON confirma cero casos que necesitaran reintento para pasar. Los 16 sin ejecutar siguen rechazando la certificación: no se convierten en saltos declarados.

El grupo 1 aporta 404 aprobadas, cuatro fallidas, 25 saltos y 14 sin ejecutar. Dos trazas de acceso contienen caída del proceso de red WebKit; la de teléfono/onboarding queda con la navegación del panel pendiente. La siguiente ronda debe verificar esos accesos con Realtime disponible. El caso de animación del menú ya no asume una posición exacta 40 ms después de hacer clic: pausa la transición real al 25 %, exige desplazamiento y opacidad completa, y la reanuda hasta su estado final. Pasó en ambos navegadores móviles y declara el salto de escritorio.

La exploración adicional con las listas largas del espejo de test reprodujo un menú de tarjeta fuera de la pantalla. `CardActionsMenu` ahora usa un portal, se posiciona antes de pintar y limita sus bordes al viewport visual; recalcula en scroll, resize y cambios de tamaño. Conserva la preferencia arriba/abajo, cierra con pointerdown exterior o Escape y devuelve el foco al botón. El nuevo caso aislado prueba bordes opuestos, tarjetas recortadas con transform, poco alto, scroll y ejecución de la última acción en tres navegadores. El selector del editor de promociones/empleos sigue el menú abierto del portal, evitando controles de la cabecera.

La matriz de pruebas incorpora `card-actions-menu.spec.ts` (112 specs en total). La prueba de cierre exterior pulsa un punto visible del margen; llevar el enorme `main` a su primer píxel podía luchar con la restauración del scroll y bloquear la propia prueba.

La siguiente ronda completa debe ejecutarse sobre el lote cerrado, sin publicar en App Store ni Google Play. Los objetivos manuales de rendimiento de las rutas públicas continúan pendientes; sus umbrales no se relajaron.

### Disponibilidad real de Realtime en el entorno aislado

La ronda móvil `38989299854` terminó con 124 aprobadas, dos fallos de recepción en vivo, dos saltos declarados y cuatro casos sin ejecutar. Las trazas muestran rechazo del handshake WebSocket (503): además de quitar Realtime de `--exclude`, era necesario habilitarlo en `supabase/config.toml`. Se habilita y ambos workflows comprueban una suscripción real a `direct_messages` antes de comenzar los navegadores. Un entorno sin Realtime falla en ese paso, sin consumir una ronda completa ni ocultar el fallo con reintentos. La comprobación no escribe mensajes ni accede a producción.

Las fotos migradas usadas en Open Graph se conservan como JPEG/PNG compatibles. La regresión de presupuesto incorpora el render de una fotografía y transparencia; seis casos dirigidos aprobados entre Chromium móvil, WebKit móvil y escritorio. No se publicaron versiones móviles.

### Verificación posterior a habilitar Realtime

Sobre `a7e04463` (mobile `6b117bf2`), la ejecución móvil `38990733747` aprobó contratos/build y los 130 casos WebView, con dos saltos declarados. La suscripción real se comprobó antes del build; los dos casos de recepción en vivo que fallaban ahora pasan. Los trabajos nativos de Android/iOS se omiten por diseño en push: la última ejecución manual con esos trabajos aprobó en `38985601599`; los archivos nativos no cambiaron en este lote. No es una prueba nueva desde las tiendas.

La revisión pública posterior al despliegue de producción aprobó 178 casos con dos saltos declarados de escritorio, en español e inglés y tres navegadores. Otra prueba dirigida contra el Supabase alojado de test aprobó recepción en vivo, validación y bloqueo del chat en los tres navegadores. La limpieza conservó las conversaciones canónicas y no reintrodujo referencias activas de Cloudinary.

Medición adicional sin relajar límites: inicio 668 KB de JavaScript, 5.090 KB totales y FCP 1.696 ms; login 626 KB de JavaScript, 994 KB totales y FCP 988 ms. Los presupuestos de transferencia siguen pendientes. Los principales recursos restantes incluyen fotografías del catálogo y del carrusel, capturas de la guía, fuentes y JavaScript compartido.

La ronda exhaustiva `38990749488` aprobó los grupos 4 (418 casos y 29 saltos declarados) y 3 (404 y 44). El grupo 2 terminó con 394 aprobadas, un fallo y 53 saltos declarados, sin casos abandonados: WebKit autenticó correctamente, pero no terminó la navegación al panel en `verification-badges.spec.ts`. La traza muestra dos solicitudes simultáneas al panel (precarga RSC y navegación del documento) que no llegan al servidor, tras cargar la portada completa para limpiar la sesión. Esto no prueba por sí solo la causa del bloqueo.

Se evita el trabajo especulativo de la barra en las rutas de acceso, registro, recuperación y continuación del alta: la navegación del formulario conserva el control hasta salir de ellas. La regresión del panel añade latencia a la reactivación sin reemplazar su respuesta, y exige ausencia de precargas del panel mientras sigue en login. `resetAuth` limpia el almacenamiento desde el texto del mismo origen `/robots.txt`, sin montar el carrusel, disparar precargas ni revivir la caché de sesión. Ahora los fallos de navegación o limpieza se propagan; no se ocultan con `catch`. Debe comprobarse el resultado en la siguiente ronda completa.

Validación dirigida de ese ajuste: 42 casos de marca/sellos aprobados entre los tres navegadores y otros tres accesos con latencia aprobados. El contrato de contornos del logo, TypeScript y lint de helpers/prueba pasan. Los cuatro errores y dos avisos de lint previos de `landing-navbar.tsx` coinciden con el archivo de HEAD; esta corrección no cambia esas líneas. La comprobación de ausencia de precarga debe validarse también en el build de producción de CI, donde Next sí activa el prefetch.

El grupo 1 de esa ronda registró cinco fallos WebKit observados (cuenta, navegación del panel en inglés, alta profesional nativa, editor de promociones y CTA de guías), pero el runner recibió una señal de apagado antes de generar el JSON o subir las trazas. No se inventa un total para ese grupo ni se certifican los casos que no terminaron. La ejecución sobre `7a1fc28f` se detuvo al detectar una corrección adicional necesaria; no se cuenta como ronda aprobada.

La navegación heredada `tab=verificacion` del panel evaluaba `isProvider` antes de terminar de cargar la cuenta y lanzaba un `router.replace` tardío. La limpieza posterior de `focus` también pedía la misma página al servidor; podía interrumpir la navegación siguiente a Notificaciones. Ahora espera autenticación/datos y normaliza esos parámetros con el historial integrado de Next, conservando el idioma. Una microtarea de foco pendiente se descarta si ya cambió la dirección. La prueba nueva exige que el enlace abra la identificación y que la siguiente sección permanezca en Notificaciones sin una solicitud RSC competidora. Los seis casos dirigidos de navegación/idioma pasan en los tres navegadores. TypeScript y lint de la prueba pasan; el panel conserva exactamente sus tres errores y seis avisos de lint anteriores.

Los otros cuatro flujos WebKit que fallaron en el grupo interrumpido también pasan después de los ajustes: cuenta profesional web, alta profesional dentro de la app, publicación/edición/pausa de una promoción y todos los CTA de guías con enlaces representativos en inglés (cuatro casos, 2,8 minutos). No sustituye la ronda completa sobre el lote final.

### Motor WebKit de la herramienta de pruebas

Playwright 1.60.0 aplica en su configuración de WebKit un parche que fija libsoup 3.6.5. El proyecto documentó una corrupción de memoria del proceso de red en esa biblioteca: [Playwright #42803](https://github.com/microsoft/playwright/issues/42803), corregida para la línea 1.64. Esto explica una causa posible de las caídas de `WPENetworkProcess` observadas en Linux; no convierte por sí solo cada fallo funcional en un problema del runner.

Se actualiza únicamente la dependencia de desarrollo Playwright a 1.64.1 y su lockfile. Antes se descargó el paquete Linux Ubuntu 24.04 x64 y se comprobó que sus bibliotecas WPE y GTK contienen `libsoup/3.6.6`. No se inyectan bibliotecas externas ni se cambian los reintentos o las exigencias de los tests. Los cuatro flujos WebKit fallidos pasan también con el motor nuevo. El contrato de cámara pasa en los tres navegadores y el verificador JSON acepta los cinco casos aprobados y el único salto de escritorio declarado de su prueba de compatibilidad, sin fallos ni casos sin ejecutar. TypeScript pasa.

El smoke público posterior a las correcciones de navegación sobre producción terminó otra vez con 178 aprobadas y dos saltos declarados en los tres navegadores, español e inglés. La nueva medición de login fue 761 KB de JavaScript, 1.125 KB totales y FCP 1.092 ms; la transferencia continúa por encima del presupuesto y la variación de terceros impide atribuir una mejora de peso al ajuste del prefetch.

La actualización además aprobó los 18 casos dirigidos de panel/idioma, chat en vivo, marca, foto de Open Graph y acceso con latencia entre Chromium móvil, WebKit móvil y escritorio. No hubo fallos ni reintentos. La ronda exhaustiva siguiente debe usar este lockfile y el WebKit corregido; las ejecuciones canceladas con el motor anterior no se cuentan como aprobadas.

### Cierre de la ejecución con Playwright 1.64.1

La ejecución móvil `38995245131` sobre mobile `88400947` aprobó contratos/build, 130 casos WebView y dos saltos declarados de la prueba exclusiva de escritorio. La suscripción de Realtime y la comprobación posterior de fixtures pasan. No se ejecutaron nuevos builds nativos de tiendas: las diferencias nativas siguen siendo las 19 aprobadas y no cambiaron en este lote.

La ejecución exhaustiva [`38995258100`](https://github.com/contratacr/contratacr/actions/runs/38995258100) sobre `a9658d40` terminó correctamente. Los cuatro JSON suman **1.794 casos descubiertos: 1.643 aprobados, 151 saltos declarados, cero fallos, cero casos con reintentos y cero casos sin ejecutar**. El grupo 1 aporta 425 aprobados/25 saltos; el 2, 395/54; el 3, 406/43; el 4, 417/29. Los cuatro verificadores estrictos y las comprobaciones posteriores de fixtures aprobaron. Los saltos conservan su motivo (pantalla, funciones desactivadas o casos que requieren los datos alojados de test) y no se cuentan como aprobados.

Esto cierra la ronda funcional del lote; los presupuestos generales de rendimiento siguen pendientes según las mediciones anteriores. Las pruebas dirigidas contra el entorno alojado y el smoke de producción se registran por separado. Los originales de Cloudinary/R2 se conservan, los documentos de verificación permanecen privados en Supabase y no se publicaron versiones en App Store o Google Play.

### Visor de fotos de quien publica (2026-10-16)

`marketplace-profile-photo.spec.ts` cubre empleos, proyectos y la ficha de una promoción: apertura del visor de la foto de perfil, conservación de la URL, cierre, recuperación del foco y reapertura por teclado. El componente compartido aísla el clic de los enlaces extendidos y la selección de tarjetas. Promociones consulta ahora el avatar público del profesional y lo muestra junto al nombre en su ficha; el arte de la promoción conserva su propia galería.

Validación focal: 9 pruebas aprobadas (Chromium escritorio, Chromium móvil y WebKit móvil), TypeScript sin errores. Lint de los archivos nuevos y promociones/empleos aprobado; projects-board conserva un aviso previo de static-components por su selector de iconos.


### Reducción de consultas y logs de Supabase (2026-10-16)

- `node scripts/verify-approved-catalog-cache.mjs`: reutilización entre Workers, caducidad, publicación de admin, carreras con cargas anteriores, fallo de base/R2 y modo Node.
- `node scripts/verify-catalog-r2-runtime.mjs`: ejecuta la implementación del catálogo con R2 local real (Miniflare), sin red ni credenciales. Verifica lecturas sin volver a la base, publicación, vencimiento y condiciones ETag de R2.
- `node scripts/verify-professional-profile-queries.mjs`: límites de 5 lecturas en frío y 1 en caliente; ningún correo privado se consulta como invitado; sesión autorizada conserva correo, suspensión sigue vigente y metadatos mantienen fallback.
- `catalog-cache-invalidation.spec.ts`: cuenta admin y servicio temporales en la base aislada; edición, ETag/304, cambio inmediato de API/SSR, ocultación y limpieza. Ejecutar en Chromium escritorio, Chromium móvil y WebKit móvil. No usar producción para este caso.

Estas verificaciones quedan en el workflow de regresión. Las métricas de ahorro se refieren a consultas de esos flujos, no al volumen mensual completo de logs.

Validación de esta entrega: 7 contratos de caché, 5 contratos de consultas de perfil, verificación de R2 con Miniflare y 6 contratos de vocabulario aprobados; 15 pruebas de catálogo de servicios, 6 pruebas de contacto y 3 de invalidación de admin aprobadas entre Chromium escritorio/móvil y WebKit móvil. TypeScript, lint de los archivos cambiados y compilación OpenNext para Cloudflare aprobados. La primera invocación con E2E_FIXTURES_READY=0 no era válida para los casos sembrados; se ejecutaron después con fixtures. El fallo inicial de SSR del catálogo en bundles separados de desarrollo se corrigió con invalidación compartida de la caché Node; no se relajó la comprobación de actualización inmediata.

## Perfil: conservar sección ante recarga tardía (16 octubre 2026)

`professional-profile.spec.ts` retiene la respuesta de `/api/professionals/:slug`, abre el enlace de reseñas, cambia a Servicios y libera después los datos. Espera un nombre comercial sintético actualizado para comprobar que la respuesta ya se pintó y exige que Servicios siga seleccionada. Protege contra el efecto que reactivaba Reseñas al refrescar el objeto del profesional. La prueba existente mantiene la cobertura de estrellas sin texto, Atrás, Seguir editando y Salir sin guardar antes de cambiar de sección. Validación focal en Chromium desktop/móvil y WebKit móvil.

El registro profesional ahora conserva `tab=completion` al publicar. El guard de cuentas ya profesionales se suspende durante el envío y la redirección final, y cancela su consulta anterior, para no competir con la navegación posterior a actualizar los metadatos de autenticación. `borrador-sin-sesion.spec.ts` exige llegar directamente a Completa tu perfil; se retiró la apertura manual que ocultaba la pérdida del destino.

## Descarga PDF de cotizaciones en todos los entornos — 16 octubre 2026

- `cotizaciones.spec.ts`: crear cotización sintética, abrir detalle, pulsar Descargar PDF, comprobar nombre, cabecera `%PDF-` y tamaño en Chromium desktop, Chromium móvil y WebKit móvil. Antes el bloque de descarga se omitía en móvil.
- `file-download.spec.ts`: entrega de bytes PDF a Filesystem/Share de iOS; guardado Android en Documents sin navegación blob ni sobrescritura; builds sin plugins deben informar actualización, no fallar silenciosamente. Cubre también ausencia de crypto.randomUUID.
- `direct-chat.spec.ts`: conservar descarga y cancelación sin descarga inesperada al reutilizar el helper de archivos.
- Prueba nativa manual con datos sintéticos y helper real: iOS 26.5, hoja Save to Files y archivo guardado de 4.533.029 bytes; Android API 36, archivo en `/sdcard/Documents/ContrataCR/<id>/Cotizacion-QA-0001.pdf`, 6.043.136 bytes. Cabecera `%PDF-` comprobada en ambos. Se usó una app QA separada, sin cuentas de producción. Android no depende de randomUUID, ausente en el origen HTTP local de QA.
- Builds antiguos sin Filesystem/Share conservan el fallback web si existe; si no, muestran el aviso de actualización. Los candidatos 1.0.11 ya incluyen los plugins; este cambio es del código web compartido.

La vista del cliente (`QuoteDetailModal` con role=client) usa `BotonDescargarCotizacion` y comparte generación, mensajes de error y guardado con el profesional. `file-download.spec.ts` monta el botón real con next-intl y descarga un PDF en los tres navegadores; no deja un segundo enlace blob fuera de la corrección.


### 2026-10-17: Apple Android y nombres públicos

- Apple completó manualmente el acceso en el candidato Android 1.0.11 (15): el botón «Volver a ContrataCR» cerró la ventana de navegador y la app mostró la selección de rol con sesión iniciada. No se eligió un rol ni se modificó el perfil de prueba.
- Regresión de retorno: logo principal raster generado del mismo arte del navbar, ES/EN, enlace fijo, CSP y exclusión de tokens/URL de terceros.
- Saludo OAuth sin nombre: no derivar nombres del correo ni guardar el alias privado como nombre; avatar neutro y saludo genérico. Pruebas en `scripts/verify-public-display-names.mjs`, incorporadas al contrato rápido de CI.
- Nombres públicos: criterio compartido en perfiles, reseñas, chat, empleos, promociones y exportaciones. Conservar nombres comerciales y estructuras ambiguas; los datos de identidad y el padrón no se sobrescriben. Cotizaciones descargadas usan `professional_name` de la API; el documento no repite el nombre legal del emisor debajo del público.
- Rondas previas confirmadas: Regression Tests 39006959945, Mobile Native Regression 39006966502 y Cloudflare Compatibility 39006966491 finalizaron con éxito antes de estos ajustes.
