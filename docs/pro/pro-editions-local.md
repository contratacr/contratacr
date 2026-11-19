# Ediciones y módulos Pro (F4, LOCAL, 2026-11-16)

Estado: capa de datos lista y probada en PGlite. **Cableado 2026-11-17 (ronda de brechas):** `choose_edition` tiene ruta
(`/api/pro/editions`, GET estado + rol, POST `{actionId,edition,revision}` con CAS e idempotencia) y pantalla
(Pro › «Edición de Pro», `?tab=pro_editions[&edicion=…]`, `src/components/pro/edition-settings.tsx`). Solo dueño o
administrador de la empresa (`settings.write`) elige; el resto lee. Se ofrecen Servicios, Autos, Restaurantes y Comercio
(bienes raíces queda fuera mientras los clasificados de propiedades estén apagados). Gratis en el lanzamiento: no cambia
nivel ni fuente. Los vacíos de Menú, Reservas y Mi lugar enlazan a esta pantalla (antes: solicitud a Soporte).
Prueba: `tests/e2e/pro-gaps-editions-team.spec.ts` y `scripts/pro/gaps-editions.test.mjs`.
SQL: `pro-editions-local.sql` (en staging del scratchpad hasta cerrar la regresión; ver `dir-wiring-F4.md`).
TS: `src/lib/pro/editions.ts` (navegador, sin dependencias). Prueba: `scripts/pro/verify-pro-editions-db.mjs`.

## Modelo
- `pro_workspace_editions` (una fila por dueño): `edition` servicios | autos | restaurantes | bienes_raices | comercio;
  `tier` basico | pro | plus; `source` launch_free | admin | billing; `active`; `revision`. **Sin fila = servicios/básico activo.**
- `pro_edition_default_modules(edition)`: tabla inmutable (función `immutable`) módulo → nivel mínimo. Copia exacta en
  `PRO_EDITION_DEFAULT_MODULES` (la prueba compara ambas).
- `pro_workspace_modules`: ajustes por dueño. El dueño (rol con `settings.write`) apaga/enciende módulos de su edición
  (`source=owner`); el administrador de la plataforma puede bloquear uno apagado (`admin`) o añadir uno fuera de la
  edición o por encima del nivel (`admin`/`billing`). El dueño no puede cambiar un ajuste `admin`/`billing` (`module_locked`).
- `pro_billing_switches`: fila única `paywall_enabled` (por defecto **false**: Pro gratis al lanzamiento). Solo
  `pro_billing_switch_set` (administrador de plataforma, CAS + `actionId`, motivo obligatorio) puede cambiarla; cualquier
  UPDATE/DELETE/TRUNCATE directo falla (23514). Historial `pro_billing_switch_events` inmutable.

## Regla de módulo (`pro_has_module` = `hasModule` en TS)
1. Dueño sin Pro (`pro_entitled` falso) → no. 2. Edición inactiva → no. 3. Ajuste `enabled=false` → no.
4. Módulo de la edición: paywall apagado → **sí, sin importar el nivel**; paywall encendido → nivel ≥ mínimo, o concesión
   admin/billing. 5. Módulo fuera de la edición → solo con concesión admin/billing (complemento).

`pro_module_require(actor, owner, module)`: módulo desconocido 22023; actor fuera de la empresa 42501; módulo apagado
**42501 con hint `module_disabled`** (detalle = módulo). `pro_route_module(path)` asigna módulo solo a rutas NUEVAS de
vertical (auto-inventory, listings, menu…); las rutas existentes devuelven null y nunca se bloquean por módulo.

## Tabla de módulos (propuesta; niveles a confirmar con la decisión de precios)
Comunes a todas: clients, leads, quotes, agenda, payments, catalog, site (básico); statistics, expenses, team (pro);
marketing, ai_plus (plus).

| Edición | Básico | Pro | Plus |
|---|---|---|---|
| servicios | projects, tasks | timesheets, visit_prep, invoice_drafts | bids |
| autos | auto_inventory, listings, test_drives | auto_finance_calc | listing_metrics |
| restaurantes | menu | table_reservations | menu_from_photo |
| bienes_raices | property_inventory, listings, property_visits | — | listing_metrics |
| comercio | inventory, price_list | stock_alerts | — |

Mientras `paywall_enabled=false` la columna de nivel no tiene efecto.

## Mutaciones (`pro_workspace_edition_mutate(actor, input)`)
Claves exactas; `revision` = revisión actual de la fila (0 si no existe) → 40001 si cambió; `actionId` idempotente
(misma entrada → resultado guardado con `replayed:true`; otra entrada → 22023).
- `choose_edition {action,actionId,edition,ownerId,revision}` — dueño/`settings.write`; no cambia nivel ni fuente.
- `set_module {action,actionId,enabled,module,ownerId,revision}` — dueño/`settings.write`; solo módulos de su edición.
- `admin_set_edition {…,active,edition,reason,source,tier}` y `admin_set_module {…,enabled,module,reason,source}` —
  administrador de la plataforma (no basta ser administrador de una empresa).
Historial `pro_workspace_edition_events` y recibos `pro_edition_actions` inmutables.

## Relleno servicios (no automático)
`pro_editions_backfill_servicios(admin, dryRun=true, tier='pro')`: dueños con fila en `pro_memberships` o `pro_workspaces`
y sin edición → servicios, `source=launch_free`. Simulación por defecto; idempotente; nunca toca filas existentes.

## Capacidades nuevas
`inventory.write`, `listing.publish`, `price.write`, `menu.write`: parche exacto (diff + bloque SQL probado) en
`dir-wiring-F4.md`; `team-roles-local.sql` no se modificó. Incluye la puerta de módulo en `pro_team_route_authorize`.

## Neutralidad del directorio
Ediciones, niveles y paywall no leen ni escriben tablas del directorio, búsqueda u orden (la prueba falla si el SQL o las
funciones mencionan `dir_`, `is_featured` o búsqueda). Pagar nunca cambia el orden público.

## Verificación
```
DIR_SQL_DIR=<scratchpad>/dir-staging-sql PRO_F4_WIRING_MD=<scratchpad>/dir-wiring-F4.md node scripts/pro/verify-pro-editions-db.mjs
```
Tras restaurar el SQL a `docs/pro/sql`, basta `node scripts/pro/verify-pro-editions-db.mjs`.
