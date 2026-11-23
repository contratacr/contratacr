# Regresión local de Pro en CI (`pro-local-regression.yml`)

Los specs `tests/e2e/pro-*.spec.ts` no corren en `regression-tests.yml`: `playwright.config.ts` los ignora porque necesitan
su propio servidor de desarrollo en `127.0.0.1:3185` y Supabase local en `127.0.0.1:54321`
(`playwright.pro-local.config.ts`). El workflow `.github/workflows/pro-local-regression.yml` les da ese entorno en GitHub Actions.

## Qué hace cada job

1. **plan** (`scripts/ci/pro-local-plan.mjs`): decide el alcance y escribe el resumen del run.
2. **pro-local** (matriz): por cada fragmento levanta su propia pila Supabase (mismos pasos, versión 2.109.0 del CLI,
   exclusiones, login a GHCR y caché de npm que `regression-tests.yml`), reconstruye todas las migraciones desde una base
   vacía (el esquema de Pro viene de `supabase/migrations`), siembra la base sintética, arranca
   `node scripts/dev-local-test-env.js --webpack --hostname 127.0.0.1 --port 3185` (el mismo servidor que `npm run dev` y
   `scripts/pro/dev-lan.cjs`; Pro queda activo porque `PRO_ENABLED` es verdadero en desarrollo) y ejecuta
   `npx playwright test --config=playwright.pro-local.config.ts`.
3. **result**: compuerta final del run (siempre se emite, como en la regresión general).

Variables que los specs esperan y el workflow exporta: `NEXT_PUBLIC_SUPABASE_URL` (debe ser exactamente
`http://127.0.0.1:54321`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_FIXTURES_READY=1`,
`E2E_ALLOW_NON_TEST_SUPABASE=1`, `E2E_TEST_PASSWORD`, `NEXT_PUBLIC_APP_URL` y `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185`
(esta última impide que Playwright arranque otro servidor y fija el origen que `stabilizeLocalProRuntime` exige). Los
specs `*-api` abren `psql` nativo y exigen `PRO_LOCAL_PSQL`, `PGHOST` (loopback), `PGPORT=54322`, `PGDATABASE=postgres`
y `PGPASSWORD`, que se derivan de `SUPABASE_DB_URL` sin imprimir la contraseña. `PUSH_DELIVERY_ENABLED=false` evita envíos.
No se fijan `DIRECTORY_LISTINGS_ENABLED` ni `E2E_PRO_OFF`: los avisos clasificados siguen apagados (decisión del 16-nov-2026) y
los specs que dependen de esa bandera se saltan con motivo declarado.

## Cuándo corre

- **Push a `test`** limitado a rutas de Pro, migraciones y specs (`on.push.paths`, idéntico a `TRIGGER_GLOBS` del selector;
  una prueba en `tests/ci/pro-local-plan.test.mjs` lo exige).
- **Manual** (`workflow_dispatch`): `scope=full` (todos, en 12 fragmentos) o `scope=selected` con `specs`
  (por ejemplo `pro-projects pro-tasks`); `webkit=true` añade el proyecto `webkit-mobile`.
- No hay `schedule` ni `pull_request`: no se cambia ninguna compuerta existente.

## Selección (política de `docs/test-selection-policy.md`)

En push, la base es el último run exitoso de este workflow en `test`, ancestro del HEAD, **cuyos fragmentos completos
(`Pro local full shard N/12`) pasaron todos**: un pase de specs sueltos no certifica el conjunto. Entre base y HEAD:

| Cambio relevante | Alcance |
|---|---|
| Nada de las rutas de Pro | no corre nada (el resumen lo dice) |
| Solo specs `pro-*.spec.ts` modificados o nuevos (hasta 30) | solo esos specs, un job |
| Specs borrados únicamente | no corre nada |
| Migraciones, SQL de Pro, `src/**/pro`, helpers, config, `package*.json`, el workflow o el selector | completo, 12 fragmentos |
| Sin base compatible, más de 30 specs o duda | completo |

## Resultado y artefactos

Cada fragmento escribe `test-results/results-N.json` y exige cero fallos, inestables y saltos inesperados con
`npm run test:e2e:verify-results`. Se suben `playwright-report/`, `test-results/` (trazas, capturas, video de los fallos) y
`dev-server.log` como `pro-local-report-N` (7 días). Ante un fallo se imprimen la cola del servidor y los logs de auth,
rest y kong. Un fallo antes de los tests (Docker, imágenes, siembra) es de infraestructura: reintente el job fallido.

## Correrlo a mano

Localmente (Mac, Supabase nativo, servidor ya iniciado): `npx playwright test --config=playwright.pro-local.config.ts pro-projects`.
En GitHub: Actions, "Pro Local Regression", Run workflow.

## Límites conocidos

- `node scripts/pro/build-pro-migrations.mjs --check` hoy falla (migraciones 360, 370 y 390 sin entrada en el manifiesto);
  por eso no es parte de este workflow. CI usa las migraciones como fuente de verdad.
- El servidor es `next dev`: la primera visita de cada ruta compila. Los fragmentos son pequeños (unos 30 specs) en lugar de
  reiniciar el servidor cada 9 specs como en las corridas locales. Si aparecen fallos por memoria o compilación, suba
  `FULL_SHARDS` en `scripts/ci/pro-local-plan.mjs` (la matriz sale de ahí).
- Esta primera versión del workflow no se pudo ejecutar fuera de GitHub (no hay Docker local): el primer run en `test`
  es su validación y puede destapar specs que fallen en el entorno limpio.
