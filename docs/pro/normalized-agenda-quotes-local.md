# Almacenamiento relacional de Agenda y Cotizaciones en Pro

26 de octubre de 2026. Checkout exclusivo:
`/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama
`local/pro-suite-no-push`, base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`.
Se conserva todo el trabajo local previo. Sin commit, push, merge ni cambios en
main/mobile, producción, CI, tiendas o comunicaciones reales.

## Modelo y compatibilidad

`docs/pro/sql/panel-storage-draft.sql` migra en una transacción:

- `pro_work`: citas, identidad de reserva y referencias estables.
- `pro_availability`: horarios disponibles.
- `pro_legacy_quotes`: cabeceras de las cotizaciones antiguas.
- `pro_legacy_quote_lines`: líneas ordenadas por número dentro de cada cotización.
- `pro_quote_links`: asociación entre cotizaciones habituales y clientes Pro.

Las cotizaciones habituales ya están normalizadas en `public.quotes`; no se
recrean, renumeran ni cambian sus códigos públicos o estados. Los catálogos
normalizados de la ronda anterior permanecen intactos.

Las tablas nuevas usan claves por propietario y registro, claves foráneas de
clientes y líneas, RLS de lectura por propietario y escritura solo de servidor.
Los listados tienen índices por propietario/fecha/ID o cliente. Se preservan las
fechas textuales originales, IDs, campos opcionales, orden de arrays y líneas,
estados e importes, incluido el redondeo anterior en JavaScript.

`pro_workspace_core.document` conserva solamente el sobre no normalizado (por
ejemplo, versión y compatibilidad de social); una restricción impide guardar
allí clientes, productos, movimientos, citas, disponibilidad, cotizaciones o
vínculos. `panel_fields` conserva la presencia/ausencia de campos vacíos de
espacios antiguos, sin guardar sus registros en JSON.

`pro_workspaces` es una vista de compatibilidad que reconstruye el contrato
anterior desde las tablas. GET/PUT antiguos y los fixtures explícitos siguen
funcionando, con CAS y protección del historial. Los recorridos conectados de
Agenda/Cotizaciones no necesitan esa vista ni descargan el documento completo.
La existencia de JSON como DTO de API o copia histórica no es almacenamiento
activo de los paneles.

## Migración y preservación

El preparador `scripts/pro/prepare-supabase-local.mjs` verifica API y PostgreSQL
en loopback. Solo aplica la migración cuando falta `pro_work`; después reaplica
las funciones relacionales de `panel-queries-draft.sql` y los RPC de catálogos.
No se agregó ninguna migración desplegable en `supabase/migrations`.

Antes de extraer los registros se crea `pro_panel_legacy_backup` con documentos
y revisiones completos. Se compara la reconstrucción JSONB exacta antes del
COMMIT y cualquier diferencia revierte toda la transacción. La copia original
de la primera migración (`pro_workspace_legacy_backup`) también se conserva.
Las copias no son legibles por clientes autenticados ni anónimos.

La primera aplicación local detectó campos vacíos ausentes en espacios antiguos
y revirtió todo. Se preservó su presencia mediante `panel_fields` y la segunda
aplicación pasó la igualdad exacta. No se ignoró ni relajó esa comparación.

Comprobación del snapshot local completo después de migrar: **2 cuentas,
11 citas, 10 cotizaciones antiguas, 50 horarios, 46 clientes, 45 productos,
10 movimientos y sus revisiones idénticos**. Los registros de demostración de
rondas anteriores permanecen. No había vínculos habituales en esas dos cuentas;
los fixtures desechables sí validan vínculos y citas desde cotizaciones aceptadas.

## Consultas y escrituras

Agenda conserva páginas de 20 citas, horarios del día e indicadores del mes.
Las consultas ahora leen tablas, con límites de fecha reales (día siguiente y
primer día del mes siguiente), evitando depender del orden de símbolos de la
configuración regional de PostgreSQL. La regresión local detectó y corrigió
ese problema antes de dar el cambio por validado.

Los detalles se buscan por ID; las cotizaciones antiguas consultan solo su
cabecera y líneas. La historia de un cliente usa una consulta relacional acotada
a ese cliente, sin leer el workspace ni multiplicar peticiones por cotización.
Los selectores y exportaciones paginados de la ronda anterior permanecen.

Los nombres históricos `pro_patch_core` y `pro_reserve_core` conservan su firma,
pero escriben filas relacionales. Comparten bloqueo por propietario y revisión
con catálogos y escrituras antiguas. Los solapamientos se comprueban globalmente
bajo ese bloqueo, incluyendo citas que cruzan medianoche o están en otra página.
Las citas canceladas conservan su historial y las cotizaciones resueltas y
vínculos conservan su inmutabilidad.

`pro_booking_context` consulta los horarios futuros realmente libres mediante
NOT EXISTS contra citas, y para un reintento devuelve únicamente su cita por ID.
La reserva vuelve a comprobar disponibilidad dentro de la transacción, y guarda
cliente/cita atómicamente. El público recibe solo horarios. Las rutas mantienen
sesión, Pro, propietario, origen, desarrollo y MFA de administrador. Los RPC de
consulta agregada/mutación son exclusivos de `service_role`; el helper de detalle
antiguo es `security invoker` y su lectura autenticada queda limitada por RLS.

## Validación

Por tocar almacenamiento, permisos y reservas compartidas corresponde regresión
amplia de Pro, sin repetir pruebas físicas/tiendas ni suites globales del chat
original. No se debilitaron aserciones.

- `verify-panel-db.mjs`: backfill exacto, campos ausentes, líneas en orden,
  ausencia de arrays en núcleo, prohibición de reintroducir JSON, páginas,
  totales, edición parcial, rollback del historial, compatibilidad completa,
  CAS, solapamientos, reserva atómica e identidad, RLS y RPC denegados.
  Evidencia: `/tmp/pro-normalized-db.log`.
- `verify-catalog-db.mjs`: regresión aislada de migración/catálogos, cursores,
  búsqueda, existencias, importaciones, CAS y RLS.
  Evidencia: `/tmp/pro-normalized-catalog-db.log`.
- `pro-scoped-panels.spec.ts`: amplía las aserciones existentes con las tablas
  efectivas, núcleo sin arrays, reconstrucción exacta, lecturas propias y
  aislamiento/denegación de escritura directa por PostgREST real.
- TypeScript y ESLint focal: `/tmp/pro-normalized-tsc2.log` y
  `/tmp/pro-normalized-lint2.log`. Se mantiene la evidencia previa de diagnósticos
  de lint preexistentes en la página contenedora, sin desactivar reglas.

## Simulador

Se reutiliza la app local `/tmp/contratacr-pro-simulator/App.app`, servidor
`http://127.0.0.1:3185`, cuenta ficticia existente y sesión local. Sin nueva
compilación nativa ni cambios del checkout mobile. Agenda y Cotizaciones se
inspeccionan visualmente en iPhone 17 Pro / iOS 26.5 después de la migración:

- `/tmp/contratacr-pro-agenda-normalizada-20261026.png`
- `/tmp/contratacr-pro-cotizaciones-normalizadas-20261026.png`

El simulador queda en Cotizaciones con los servicios locales activos.

## Cierre de esta etapa

- Regresión amplia: **60 aprobadas y 3 fallos iniciales de WebKit** por el límite
  de texto de la fecha. Log: `/tmp/pro-normalized-e2e.log`, artefactos:
  `/tmp/pro-normalized-e2e`. Chromium escritorio/móvil ya ejecutaron las consultas
  corregidas y aprobaron sus recorridos completos.
- Se repitieron únicamente esos tres consumidores afectados de WebKit:
  integración admin/MFA, reservas y paneles acotados. **3/3 aprobados** en
  `/tmp/pro-normalized-webkit-review.log`, artefactos en
  `/tmp/pro-normalized-webkit-review`. La cobertura combinada confirma los
  **63 casos de Pro**, sin omisiones ni aserciones debilitadas; no se presenta la
  primera ejecución como una suite íntegramente verde.
- PostgreSQL aislado también verifica actualización/orden de líneas, rechazo de
  horas inválidas y rollback de un cliente al fallar la cita dentro de la misma
  reserva. Pasó después de la última revisión del SQL.
- Comparación exacta final de snapshot/revisión y comparación con las copias
  originales de la primera migración aprobadas otra vez.
- TypeScript, ESLint focal, UTF-8, presupuesto bilingüe, archivos privados y
  `git diff --check` aprobados. Sin cambios adicionales del contenedor desde la
  evidencia de lint preexistente documentada en la etapa anterior.
- Agenda y Cotizaciones verificadas visualmente en el simulador después de la
  migración; conserva la sesión, cuenta ficticia y servidor local.
