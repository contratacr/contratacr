# Tableros de ideas (fila 61 del registro de paridad) — local

Estado: **fase 1 terminada (SQL, manifiesto, spec y borradores); fase 2 pendiente** (copiar borradores a `src/`, correr la spec y la regresión). Nada de esto se ha probado todavía en el navegador.

Equivalente funcional de los tableros de estilo de Houzz Pro, escrito de nuevo: sin marca, textos, íconos ni diseño de Houzz. Nombre visible: «Tableros de ideas» / «Idea boards».

## Qué hace

- **Por proyecto** (`JobWorkspace › Planificación › Tableros de ideas`), solo en el espacio Pro independiente (`proSpace`), igual que Selecciones.
- **Lista de tableros:** tarjetas con miniatura (primera página dibujada), nombre, habitación o área, fecha de última modificación (hora de Costa Rica), cantidad de páginas, estado compartido y comentarios. Pestañas Activos / Archivados con contadores. Acciones: crear, renombrar (nombre, área y tamaño de página), duplicar (copia privada sin comentarios), archivar y restaurar.
- **Editor:** migas de pan Tableros › Área › Tablero; páginas de tamaño fijo, 16:9 o A4 horizontal; tira de páginas con miniaturas (agregar, mover a la izquierda o derecha, eliminar con confirmación; hasta 20); elementos:
  - foto (subida en el momento por la API existente de archivos del trabajo, o elegida de Archivos del trabajo);
  - artículo de Mis artículos (búsqueda por nombre, código o categoría; nombre, unidad y precio capturados al colocarlo; precio visible opcional; foto opcional del trabajo, porque hoy los artículos no tienen imagen);
  - muestra de color (código hex y nombre opcional, con colores sugeridos);
  - nota de texto (hasta 280 caracteres).
- Mover arrastrando (pointer events nativos, sin dependencias), redimensionar con la esquina, girar 0/90/180/270, traer al frente / enviar atrás, quitar, deshacer / rehacer locales (Ctrl/Cmd+Z, Ctrl/Cmd+Mayús+Z o Ctrl+Y), fondo de página y nombre de página.
- **Teclado:** cada elemento es enfocable; flechas mueven 0,5 % (con Mayús, 5 %); Supr o Retroceso lo quitan.
- **Alternativa accesible:** lista de elementos de la página (seleccionable) e inspector con posición y tamaño numéricos en porcentaje, giro y orden.
- **Guardado por página** con revisión optimista (409 si cambió en otra ventana) y recibo idempotente por `actionId`; el botón «Reintentar la misma operación» reenvía el mismo cuerpo. No se puede cambiar de página con cambios sin guardar. El estado sucio/ocupado se suma a `baseNestedBlocked`.
- **Presentar:** pantalla completa página a página (Fullscreen API si el navegador lo permite; si no, capa a toda la ventana), flechas y Escape.
- **Compartir con el cliente:** «Compartir con el cliente» crea una **instantánea inmutable** (versión 1, 2, …). El cliente vinculado (solicitud confirmada o completada) la ve en Mis proyectos solo si el profesional activa la nueva sección opt-in **Tableros de ideas** (`show_mood_boards`, apagada por defecto) en Vista del cliente. Lo editado después queda privado hasta compartir otra vez; «Dejar de compartir» y «Archivar» la retiran.
- **Comentarios del cliente** por tablero compartido (texto, autor y fecha en hora de Costa Rica), visibles para el profesional, que puede responder. Un comentario sobre una versión vieja da 409 y la vista del cliente se recarga.

## Decisiones

- **Coordenadas normalizadas enteras** (diezmilésimas de página, 0–10 000), tamaño mínimo 2 % por lado, caja completa dentro de la página antes de girar. El giro se dibuja alrededor del centro; si un elemento girado sobresale, la página lo recorta.
- Límites: 50 tableros activos por trabajo, 20 páginas por tablero, 60 elementos por página, 100 versiones compartidas y 300 comentarios por tablero. El cuerpo de cada operación es ≤ 16 KiB (413); el editor lo mide antes de enviar y explica cómo reducirlo.
- **Imágenes:** se reutilizan los archivos privados del trabajo (`pro_work_files`, bucket `pro-work-files`); no hay bucket nuevo. La subida usa `POST /api/pro/work-files` sin cambios. Cada imagen se sirve por `GET /api/pro/mood-boards` reautorizando en cada pedido (dueño: `?image=<archivo>`; cliente: `?publication&page&element` de la versión vigente), con verificación de tamaño y SHA-256, igual que Selecciones. Compartir un tablero muestra sus fotos al cliente aunque no se hayan compartido en Archivos del trabajo; el diálogo de compartir lo dice.
- La copia del cliente **no expone** ids de archivos ni de artículos, ni precios ocultos.
- **Instantánea de artículos:** el nombre, la unidad y el precio se toman de Mis artículos la primera vez que se coloca; mover o editar el elemento no los cambia. Un artículo archivado no se puede colocar de nuevo.
- La sección del cliente sigue el patrón `show_*` de Vista del cliente: en la fase 1 solo se agregó la columna (`add column if not exists`) en `mood-boards-local.sql`; en la fase 2 el script inserta `showMoodBoards` en `client-dashboard-local.sql` (JSON, claves opcionales, insert/update) y en su esquema y editor, igual que se hizo con montos previstos, selecciones, cronograma y pendientes finales.
- No se agregaron dependencias npm.

## Archivos

Fase 1 (en el repositorio):

- `docs/pro/sql/mood-boards-local.sql` (solo objetos nuevos): columna `pro_client_dashboards.show_mood_boards`; tablas `pro_mood_boards`, `pro_mood_board_pages`, `pro_mood_board_publications`, `pro_mood_board_comments`, `pro_mood_board_history`, `pro_mood_board_actions`; funciones `pro_mood_boards_read`, `pro_mood_board_read`, `pro_mood_board_products`, `pro_mood_boards_client_read`, `pro_mood_board_image`, `pro_mood_boards_mutate`, `pro_mood_boards_client_mutate` y auxiliares. RLS activada sin políticas, todo revocado a `public/anon/authenticated`, `security invoker`, ejecución solo para `service_role`, elegibilidad con `pro_private_work_tools_enabled(p_actor)`, historial, instantáneas, comentarios y recibos inmutables por disparador.
- `scripts/pro/local-sql-manifest.mjs`: paso `mood-boards-local.sql` al final y sus aristas (private-work-tools-access, appointment-requests, client-dashboard, work-files, catalog-storage-draft).
- `tests/e2e/pro-mood-boards.spec.ts` (sin correr; tipos locales para no depender de `src/` antes de la fase 2).
- Este documento.

Fase 2 (borradores en `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/moodboards-draft/`):

- Nuevos: `src/lib/pro/mood-boards.ts`, `src/app/api/pro/mood-boards/route.ts`, `src/components/pro/mood-board-canvas.tsx`, `src/components/pro/work-mood-boards.tsx`, `src/components/pro/appointment-mood-boards.tsx`.
- Inserciones mínimas con `apply-phase2.mjs` (todo o nada, `--dry-run`, `--out=<dir>`; anclajes por expresión regular que toleran otras vistas insertadas, como créditos o mediciones): `job-workspace.tsx`, `business-panel.tsx`, `appointment-requests-workspace.tsx`, `client-dashboard.tsx`, `src/lib/pro/client-dashboard.ts`, `docs/pro/sql/client-dashboard-local.sql` y `tests/e2e/pro-job-workspace.spec.ts` (+1 botón calculado sobre el valor que tenga, más la aserción del botón nuevo).

## Evidencia de la fase 1

- SQL aplicado dos veces en loopback con `apply-one.mjs`: `ok` / `ok`.
- `node scripts/pro/verify-local-preparation-manifest.mjs`: `PASS: 111 SQL modules, 112 ordered steps, 166 dependencies, guard/repeat contracts and negative cases; offline only.`
- Prueba psql en transacción con `rollback` (`moodboards-draft/sql-test.sql`, salida en `sql-test.out`): validación 22023 (claves extra, formato, nombre vacío, geometría fuera de página, fracciones, giro 45°, tamaño mínimo, foto de otro trabajo, PDF, artículo archivado, hex en mayúsculas, elemento repetido, 61 elementos), 40001 (página y tablero con revisión vieja, orden de páginas incompleto, versión vieja del cliente), 23505 (id repetido), 42501 (otra cuenta, cliente sin Pro, comentario ajeno o de tablero no compartido), repetición idempotente, límite de 20 páginas, renumeración al borrar, duplicado privado con ids de página nuevos, instantánea de precio, copia del cliente sin `fileId`/`productId`, instantánea inmutable tras editar, imágenes (dueño, PDF rechazado, otra cuenta, cliente, versión vieja revocada), solicitud no confirmada oculta, archivar retira al cliente, historial/recibos/comentarios/instantáneas inmutables, privilegios (`anon`/`authenticated` sin acceso, `service_role` con acceso), RLS en todas las tablas y ninguna función `security definer`. Tras el `rollback` no queda ninguna fila.
- El parche de `client-dashboard-local.sql` de la fase 2 se compiló y probó también en transacción con `rollback` (`dashboard-patch-test.sql`): `showMoodBoards` se guarda, un cliente viejo sin la clave conserva el valor, el tipo se valida y el historial lo registra; la función en vivo no cambió.
- TypeScript de los borradores (tsconfig propio en el scratchpad con los 12 archivos resultantes y las dos specs): 0 errores. ESLint con la configuración del repositorio y `--max-warnings 0`: 0 problemas.

## Límites

- Sin herramientas de dibujo libre, flechas, borrador, zoom manual, catálogos de marcas, colores de pintura de fabricantes, planos 3D, descarga ni impresión (Houzz las tiene); el lienzo se escala solo al ancho disponible.
- Los artículos de Mis artículos no tienen imagen propia; se puede asociar una foto del trabajo.
- Un elemento girado 90/270° conserva su caja sin girar para la validación; la página recorta lo que sobresalga.
- No se envían notificaciones por comentarios ni por compartir.
- La fila 61 del registro de paridad se actualiza en la fase 2, cuando haya evidencia de navegador.
