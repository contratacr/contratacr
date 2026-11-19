# Brief del equipo: réplica de Houzz Pro en ContrataCR Pro

Lectura obligatoria para cada agente antes de tocar archivos. Isaac (dueño) autorizó trabajo autónomo, pruebas locales y revisión. El líder coordina; cada módulo tiene un implementador y luego un revisor independiente.

## Objetivo

Replicar Houzz Pro por ingeniería inversa: **la misma estructura, las mismas funciones y los mismos recorridos**, adaptados a Costa Rica (CRC/USD, IVA, cédula, horario de Costa Rica).

**Nunca** se copian marca, logotipos, íconos, capturas, textos literales, nombres comerciales de funciones ni diseño gráfico exacto de Houzz. Todo texto se escribe de nuevo: español claro de Costa Rica, en trato de «usted» como el resto del producto, e inglés natural. Se usan los componentes y la marca de ContrataCR.

## Reglas que no se negocian

- Trabajar **solo** en `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`.
- **Prohibido:** commit, push, merge, stash, reset, checkout de otras ramas, crear ramas o worktrees, y borrar o revertir cambios ajenos. El árbol tiene cientos de cambios sin commit de trabajo previo: se conservan. Solo se hacen inserciones mínimas en archivos existentes.
- No leer ni mostrar secretos. `.env.test` se carga solo así: `set -a && . ./.env.test >/dev/null 2>&1; set +a`. Nunca se imprime.
- SQL solo en la base local de loopback, con `node /private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/apply-one.mjs docs/pro/sql/<archivo>.sql docs/pro/sql/<archivo>.sql`. Se aplica dos veces para probar que es idempotente. No ejecutar el preparador completo ni resetear la base.
- Nada real: sin correos, notificaciones push, cobros, facturas ni llamadas a proveedores externos.
- Houzz se consulta en la ayuda pública (`https://pro.houzz.com/pro-help/...`) con WebFetch o WebSearch. Para ver la cuenta de prueba en Safari, solo un agente a la vez y solo lectura, con `$S/visit.sh URL nombre` y `$S/click.applescript "texto"`, donde S=`/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`. Las salidas quedan en `$S/houzz/`. Nunca guardar, enviar, compartir ni editar nada en Houzz.
- El servidor de desarrollo ya corre en `http://127.0.0.1:3185` con recarga en caliente. No se reinicia.

## Patrones que se copian (leerlos antes de escribir)

- **SQL** con tabla, historial inmutable, recibos idempotentes por `actionId`, revisión optimista (40001→409), RLS cerrada, RPC `security invoker` solo para `service_role` y elegibilidad con `pro_private_work_tools_enabled(p_actor)`: `docs/pro/sql/client-dashboard-local.sql`. Lectura paginada: `docs/pro/sql/projects-local.sql`.
- Cada SQL nuevo se registra en `scripts/pro/local-sql-manifest.mjs` (lista y aristas de dependencias) y se comprueba con `node scripts/pro/verify-local-preparation-manifest.mjs`.
- **API:** `src/app/api/pro/client-dashboard/route.ts` (actor, `X-Pro-Expected-Actor`, cuerpo acotado, origen, límite de frecuencia, solo `development`) o `src/app/api/pro/projects/route.ts` (`proApiAccess`).
- **Esquemas zod:** `src/lib/pro/client-dashboard.ts`, `src/lib/pro/projects.ts`.
- **Interfaz:** `src/components/pro/client-dashboard.tsx` (estados de carga/error/reintento, `onStateChange` para dirty/busy, `useProChildGuard`), `src/components/pro/projects-workspace.tsx` (lista con tabla y tarjetas).
- El expediente del proyecto es `src/components/pro/job-workspace.tsx`: las vistas y grupos (Planificación / Gestión / Finanzas) se agregan ahí y se conectan en `src/components/pro/business-panel.tsx`, cerca de `<JobWorkspace`, sumando su estado a `baseNestedBlocked`.
- Las secciones globales de Pro están en `pro-space.tsx` (labels + render), `management-shell.tsx` (menú) y `simple-workspace.tsx` (Inicio).
- **Pruebas E2E:** `tests/e2e/pro-client-dashboard.spec.ts` y `tests/e2e/pro-projects.spec.ts` (cuentas desechables, fixture `pro_workspaces`, y `client-operations` para materializar trabajos).

## Comandos

```
cd /Users/contratacr/Desktop/contratacr/contratacr-pro
npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS'
npx eslint <archivos tocados>
set -a && . ./.env.test >/dev/null 2>&1; set +a
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 npx playwright test --config=playwright.pro-local.config.ts tests/e2e/<spec> --project=chromium-desktop --reporter=line
PLAYWRIGHT_WEBKIT=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 npx playwright test --config=playwright.pro-local.config.ts tests/e2e/<spec> --project=webkit-mobile --reporter=line
```

Cada corrida de Playwright vacía `test-results/`, así que las capturas se revisan antes de la siguiente corrida. Fallo previo conocido, no causado por el equipo: los casos de interfaz de `pro-work-updates.spec.ts` (clic dentro de un `<details>` ya cerrado).

## Calidad exigida (definición de terminado)

1. TypeScript con 0 errores y ESLint sin errores ni advertencias en los archivos tocados.
2. SQL aplicado dos veces en loopback y manifiesto en PASS.
3. Spec nueva con casos ES y EN que pasan en `chromium-desktop` y `webkit-mobile`. Cubre: API (validación 400, conflicto 409, permisos 403/404, aislamiento entre cuentas, repetición idempotente), interfaz (crear, editar, recargar y ver persistido; estados vacío y error), ausencia de desbordamiento horizontal y ausencia de errores de página.
4. Regresión: se corren las specs existentes del área tocada. Si una falla, se demuestra si ya fallaba antes. Nunca se debilitan aserciones para obtener verde. Solo se actualiza una expectativa cuando el cambio es intencional y se explica.
5. Estética: capturas a página completa (`info.outputPath`) en móvil y escritorio, revisadas con Read. Seguir los tokens existentes (`#162543` texto, `#52627a` secundario, `#008bb5`/`#0089bb` acento, `#d7e1ea` bordes, `#f7f9fc` fondo, `rounded-xl/2xl`, `min-h-11` en controles táctiles). Nada cortado, superpuesto ni desalineado.
6. Textos completos ES/EN: sin mezclar idiomas, sin claves sin traducir, sin errores de ortografía.
7. Documento `docs/pro/<modulo>-local.md` (qué se hizo, decisiones, evidencia y límites) y la fila del registro `docs/pro/houzz-parity-register-local.md` actualizada con honestidad (V solo con evidencia).
8. Informe final al líder: archivos creados o modificados, comandos y resultados exactos, capturas revisadas y pendientes.
