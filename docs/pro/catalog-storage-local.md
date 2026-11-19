# Clientes e inventario: almacenamiento y paginación local

> Actualización del 26 de octubre: Agenda y Cotizaciones ya usan consultas acotadas; véase [la continuación local](scoped-agenda-quotes-local.md). Los límites descritos en esta primera ronda son históricos.

26 de octubre de 2026. Checkout `contratacr-pro`, rama `local/pro-suite-no-push`,
base y HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Cambios locales sin push.

## Implementación

- `pro_clients`, `pro_products` y `pro_movements` almacenan filas tipadas por
  propietario. Claves compuestas y FK impiden vincular un movimiento a otro negocio.
  Índices por propietario/estado/ID, identificación y SKU mantienen paginación y
  unicidad; los archivados también participan en las restricciones de duplicados.
- El documento de `pro_workspace_core` conserva agenda, disponibilidad, cotizaciones
  antiguas y vínculos. Ya no contiene arrays de clientes, productos ni movimientos.
- `pro_workspaces` es una vista `security_invoker` de compatibilidad. Reconstruye el
  contrato anterior para reservas, agenda, cotizaciones y fixtures existentes.
  Estos consumidores aún pueden solicitar el documento completo; esta ronda no
  convierte la agenda ni los selectores de cotizaciones en consultas paginadas.
- Los paneles de Clientes e Inventario usan `/api/pro/catalog`: páginas reales de
  hasta 20, cursor por ID, búsqueda literal sin distinguir tildes, archivados y
  existencias bajas filtrados en PostgreSQL. No descargan `/api/pro/workspace`.
- El detalle carga solo el cliente/producto elegido, su contexto y páginas de
  movimientos. Los movimientos conservan orden de inserción mediante un cursor
  de posición. Buscar/filtrar descarta respuestas anteriores; mantiene el foco.
- Guardar envía solo filas modificadas y el nuevo movimiento. El RPC comparte
  bloqueo y revisión con `pro_save_workspace`: una reserva o edición anterior
  genera 409 y conserva el formulario, sin sobrescribir el cambio concurrente.
- Importar conserva la vista previa existente y valida duplicados globales en el
  servidor. Todo el lote y su revisión se confirman o revierten juntos. No se
  sobrescriben registros existentes mediante importación.
- Exportar recorre todas las páginas del filtro solicitado; no exporta únicamente
  las primeras 20. Si cambia la revisión entre páginas, no entrega una mezcla.

## Preservación y aplicación

Los tres SQL siguen fuera de las migraciones de producción:
`catalog-storage-draft.sql`, `catalog-mutations-draft.sql`, `catalog-pages-draft.sql`.
`node scripts/pro/prepare-supabase-local.mjs` comprueba Supabase nativo y exige
API y PostgreSQL en loopback antes de ejecutarlos. Nunca ejecutar los borradores
manualmente en un proyecto remoto. Hace falta numeración vigente, revisión y
validación en TEST antes de una eventual publicación expresamente autorizada.

La migración de estructura se ejecuta una sola vez, dentro de una transacción.
Guarda los documentos y revisiones originales en `pro_workspace_legacy_backup`;
reconstruye cada documento y exige igualdad JSONB exacta, incluido orden de arrays,
IDs, opcionales e historial. Si hay datos incompatibles o duplicados, aborta toda
la transacción. No intenta arreglarlos, descartarlos ni borrar registros.
La copia original no se ofrece a `anon` ni `authenticated`. Las tablas tienen
RLS por propietario; los RPC de escritura/paginación son solo para `service_role`.
Los endpoints conservan guardia de desarrollo, sesión, Pro activo, origen y MFA
administrativo. No hay activación remota ni nuevos permisos de usuario.

## Selección de pruebas

Se amplía a toda la suite **Pro** porque cambian almacenamiento, RLS y el contrato
compartido de revisión. Incluye integración Auth/PostgREST local, MFA, reservas,
agenda, cotizaciones con/sin Pro, aislamiento, difusión histórica e importaciones,
en Chromium escritorio, Chromium móvil y WebKit móvil. No cambia arranque global,
marca, binarios ni toolchain; no se repite la regresión histórica completa de
ContrataCR ni las pruebas físicas/tiendas del otro chat.

Las 57+9 ejecuciones del 23 de octubre son antecedentes, no validación de estos
cambios. La nueva evidencia está en `/tmp/pro-catalog-final.log` y sus artefactos
`/tmp/pro-catalog-final`. La primera exploración encontró fallos de sesión con
el servidor antiguo; después de reiniciarlo con `.env.test`, la ronda focal de
catálogo/panel pasó 2/2. No se debilitaron aserciones existentes.

Prueba aislada de migración/RLS, sin dependencias nuevas en el repositorio:

```sh
PRO_PGLITE_MODULE=file:///ruta/externa/node_modules/@electric-sql/pglite/dist/index.js node scripts/pro/verify-catalog-db.mjs
```

Cubre datos previos a la migración, copia exacta, páginas sin duplicados, búsqueda,
archivo, mínimos, CAS, conservación de historia, importación atómica y denegación
de escrituras/RPC directos y lecturas entre cuentas. Resultado: aprobado.

## Simulador

Se reutiliza la app local ya compilada en `/tmp/contratacr-pro-simulator/App.app`,
apuntando exclusivamente a `http://127.0.0.1:3185`, y la cuenta ficticia existente
`Isaac Sánchez Monge · Local`. No se compiló, firmó ni subió un nuevo binario.
`scripts/pro/seed-catalog-demo.cjs` agrega de forma idempotente 35 clientes y 35
productos ficticios a esa cuenta desechable; exige loopback e identidad local,
preserva todos los registros previos y permite revisar más de una página.

## Resultado final

- Regresión completa Pro: **60/60 aprobadas**, sin omisiones, en los tres motores;
  5,7 minutos. `/tmp/pro-catalog-final.log`.
- Ampliación focal de catálogo: WebKit móvil y Chromium móvil aprobados en
  `/tmp/pro-catalog-interactions.log`; Chromium escritorio aprobado tras precisar
  el selector del menú de cada tarjeta en `/tmp/pro-catalog-interactions-desktop.log`.
  Comprueba borrador conservado ante 409, guardar sin cambios y CSV de 46 productos
  activos repartidos en tres páginas, sin incluir el archivado. El primer intento
  del selector coincidía también con el menú de cuenta; se acotó a la tarjeta,
  manteniendo todas las aserciones del recorrido.
- PGlite con los borradores finales: aprobado. También comprueba conservar las
  existencias originales con más de tres decimales al editar únicamente el nombre.
- TypeScript y ESLint del código/pruebas/scripts afectados: aprobados.
  Logs `/tmp/pro-catalog-tsc-final.log` y `/tmp/pro-catalog-lint-final.log`.
- Comprobaciones de archivos privados, codificación, presupuesto bilingüe y
  `git diff --check`: aprobadas.
- Comparación adicional contra la copia anterior a la migración: **11 clientes,
  10 productos y 10 movimientos de dos cuentas intactos**, después de añadir
  ejemplos al simulador. No se sustituyeron los datos anteriores.
- Revisadas Clientes e Inventario en iPhone 17 Pro/iOS 26.5. Capturas:
  `/tmp/contratacr-pro-catalog-clientes-20261026.png` y
  `/tmp/contratacr-pro-catalog-inventario-20261026.png`.
  El simulador queda abierto en Inventario con sesión y servidor locales.
- Sin push, merge, nuevas ramas/worktrees, cambios a main/mobile, migraciones
  remotas, envíos reales ni acciones de tiendas. Los cambios quedan sin commit
  para la revisión local del usuario.
