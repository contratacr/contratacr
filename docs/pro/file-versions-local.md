# Versiones y comentarios por documento (local)

Fila 30 del registro de paridad (`houzz-parity-register-local.md`). Función de referencia: en los archivos del proyecto, cada documento tiene versiones y su propia conversación. Se replica la función y el recorrido con textos, marca y diseño propios de ContrataCR. No se copia ningún texto, nombre ni diseño de Houzz.

Estado: **fase 1 terminada** (SQL, manifiesto, prueba psql, spec redactada y borradores). La fase 2 (copiar a `src/` y correr Playwright) **no se hizo**: mientras corre la regresión contra el servidor de desarrollo, `src/` no se toca. Por eso la fila 30 sigue en **F**. No sube a P o V hasta que existan evidencias de la fase 2.

## Auditoría previa (lo que ya existía y se conserva)

- **Archivos del trabajo** (filas 25 y 26, `work-files-local.sql`, `/api/pro/work-files`, `work-files.tsx`). Cada fila de `pro_work_files` es inmutable. Solo admite JPEG normalizado (máx. 2 MiB) o PDF (máx. 3 MiB) y tiene un tope de 100 archivos por trabajo. Las imágenes se re-codifican con sharp, sin EXIF. Se guarda el hash SHA-256 de los bytes crudos y de los canónicos, y la ruta es `owner/<id>.jpg|pdf` en el bucket privado `pro-work-files`. La única transición es revisión 1 → 2, que es la publicación explícita al cliente confirmado (`pro_work_file_publish`). Lo compartido queda congelado. Cada descarga se vuelve a autorizar y se verifica su hash. No hay URL firmadas.
- **Cliente** (fila 32). `AppointmentFiles` (`pro_work_files_client_read`) lista solo los archivos con revisión 2 cuyo `client_user_id` es el del cliente.
- **Biblioteca de empresa** (fila 31, `company-files-local.sql`). Es una biblioteca privada del dueño, con carpetas y copia independiente hacia Archivos del trabajo (`pro_company_file_copies`). Una copia termina siendo una fila normal de `pro_work_files`, así que este módulo la puede versionar sin cambios.
- **Equipo** (`team-local.sql`, `pro_team_grants`). Los colaboradores no tienen acceso a los archivos del trabajo. Hoy ningún lector de equipo toca `pro_work_files`.

## Decisiones

1. **Solo objetos nuevos.** `file-versions-local.sql` no altera ninguna tabla ni función de `work-files-local.sql`. Las versiones apuntan a filas existentes de `pro_work_files`. Para subir una versión se usa la ruta de subida existente, con la misma normalización, el mismo hash, la misma verificación de bytes almacenados y el mismo límite de 100 archivos por trabajo. Después, `add_version` vincula esa fila a la familia.
2. **Familia = id del primer archivo.** Un archivo sin versiones es una familia implícita: la lectura devuelve una v1 sintética con revisión 0. La fila `pro_work_file_families` se crea en el primer `add_version` e inserta v1 (`original`, con la fecha del archivo) y v2.
3. **Historial de solo inserción.** `pro_work_file_versions` (v1…v100) nunca se actualiza; un trigger lo impide.
   - **Restaurar** agrega una versión nueva (`restore`, `restoredFrom`) que apunta al archivo de la versión elegida. No borra ni reescribe nada.
   - **Descargar una versión anterior** usa la descarga existente por `fileId`.
4. **Compartir nunca es implícito.** Subir o restaurar una versión no publica nada. «Compartir esta versión» llama al `publish` existente con ese `fileId`.
   - Lo que el cliente recibió sigue siendo exactamente lo que se publicó.
   - Si se comparten dos versiones, el cliente ve dos entregas. Es el modelo actual: cada publicación es un registro inmutable, no hay revocación y la lista del cliente no se modificó.
   - En la conversación del cliente se indica qué versiones se le compartieron (`sharedVersions`). Nunca se mencionan las versiones privadas.
5. **Comparar** compara metadatos: nombre, tipo, tamaño, fechas, si está compartida y si el contenido es idéntico según la huella SHA-256. No hay comparación visual de bytes, porque solo existen JPEG y PDF.
6. **Dos hilos de comentarios por familia**, de 1 a 2000 caracteres, con recorte y sin caracteres de control. Cada edición guarda el historial inmutable (`pro_work_file_comment_history`). Los comentarios se pueden archivar y restaurar. Hay un tope de 500 por familia.
   - `team`: es privado. Ningún lector del cliente lo devuelve. Hoy lo usa solo el dueño, porque el modelo de equipo no da acceso a archivos. El autor queda guardado para poder ampliarlo después con `pro_team_context` sin migrar datos.
   - `client`: solo existe si la familia tiene al menos una versión compartida. El dueño comenta sobre una versión compartida concreta. El cliente vinculado (solicitud `confirmed` o `completed`) comenta sobre la versión que se le compartió y puede editar o quitar (archivar) solo sus propios comentarios. El dueño puede archivar comentarios del cliente, pero no editarlos. El cliente ve las respuestas del dueño y sus propios comentarios, nunca los archivados.
   - Un archivo que ya tiene su propia conversación no se puede adjuntar como versión de otra familia (22023). Así no se mezclan hilos en silencio.
7. **Patrón del brief.**
   - RLS cerrada y `revoke` a `public`, `anon` y `authenticated`. Las RPC son `security invoker` y solo `service_role` las ejecuta.
   - El dueño necesita `pro_private_work_tools_enabled`.
   - CAS: la revisión de familia en `add_version`/`restore` y la revisión de comentario en editar/archivar. Un conflicto da 40001, que la API convierte en 409.
   - Recibos idempotentes por `actionId` (`pro_work_file_version_actions`): el mismo id con otro contenido da 22023.
   - Fechas: `dayCr` en America/Costa_Rica.
   - Orden de bloqueos: aviso por acción → aviso `pro-work-files:<dueño>:<trabajo>`, la misma clave que usan `reserve` y `publish` existentes, así que se serializan con subidas y publicaciones → familia → comentario.
   - Límites: 100 versiones por familia y 500 comentarios (54000, que la API convierte en 429).
8. **Biblioteca de empresa: implementada el 2026-11-12** (ver «Versiones en la biblioteca de la empresa» al final). Texto de la fase 1: **Biblioteca de empresa: queda fuera.** Versionarla exigiría tocar `pro_company_files`, cuya revisión ya se usa para renombrar, archivar y mover. Un archivo copiado desde la biblioteca hacia el trabajo sí se puede versionar dentro del trabajo.
9. **Sin envíos.** No se escribe en `notifications` ni en `notification_push_outbox`. La spec lo comprueba.

## Objetos SQL (`docs/pro/sql/file-versions-local.sql`)

- **Tablas:**
  - `pro_work_file_families`
  - `pro_work_file_family_members` (cada archivo pertenece a una sola familia)
  - `pro_work_file_versions`
  - `pro_work_file_comments`
  - `pro_work_file_comment_history`
  - `pro_work_file_version_actions`
- **Lecturas del dueño:**
  - `pro_work_file_versions_read(actor, work, file, thread?, archived?, after?, comment?)` devuelve, según los parámetros, el estado de la familia, una página de 20 comentarios o el detalle de un comentario con su historial.
  - `pro_work_file_versions_index(actor, work, files[≤20])` devuelve las insignias para la lista.
- **Escritura del dueño:** `pro_work_file_versions_mutate`, con las acciones `add_version`, `restore`, `comment_create`, `comment_edit`, `comment_archive` y `comment_restore`.
- **Cliente:**
  - `pro_work_file_client_discussion_read(actor, request, file, after?)`
  - `pro_work_file_client_comments_mutate`, con las acciones `create`, `edit` y `archive`.
- **Triggers:**
  - Las versiones, los miembros, el historial y los recibos son inmutables.
  - En la familia solo avanzan el puntero vigente y la revisión.
  - En los comentarios solo cambian el texto, la revisión, `edited_at` y `archived_at`, y la revisión debe ser la anterior + 1.

Manifiesto: el paso `file-versions-local.sql` va al final de `scripts/pro/local-sql-manifest.mjs`, con dependencias en `private-work-tools-access-local.sql`, `panel-storage-draft.sql`, `appointment-requests-local.sql` y `work-files-local.sql`.

## Evidencia de la fase 1

```
node /private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/apply-one.mjs docs/pro/sql/file-versions-local.sql docs/pro/sql/file-versions-local.sql
→ docs/pro/sql/file-versions-local.sql ok   (×2: idempotente)

node scripts/pro/verify-local-preparation-manifest.mjs
→ PASS: 115 SQL modules, 116 ordered steps, 192 dependencies, guard/repeat contracts and negative cases; offline only.

psql -X -f $S/file-versions-draft/sql/test.sql   (begin … rollback; salida en $S/file-versions-draft/sql/test.out)
→ NOTICE: ALL PASS · anon/authenticated sin EXECUTE ni SELECT · RLS activa en las 6 tablas · 0 funciones security definer
→ después: 0 familias, 0 comentarios y 0 recibos en la base (el rollback no dejó residuos)
```

La prueba psql cubre:

- **Versiones:** v1 implícita, `add_version` con nota recortada, repetición idéntica, mismo `actionId` con otro contenido (22023), revisión vieja (40001), adjuntar a través de cualquier miembro de la familia y adjuntos inválidos (archivo ya miembro, no listo, de otro trabajo, el mismo archivo, de otra cuenta, nota de 501 caracteres, claves de más o de menos, cliente).
- **Restaurar:** a la versión vigente, a una versión inexistente y en una familia implícita (todos rechazados). Una restauración válida crea v4 sin borrar nada.
- **Insignias:** las del índice y el límite de 20 archivos.
- **Comentarios del equipo:** crear con recorte, repetir, reutilizar un id, texto de 2001, vacío o de 2000 caracteres, CAS, editar, editar sin cambios, aislamiento entre cuentas, archivar, editar un archivado, restaurar e historial de 4 entradas.
- **Mezcla de hilos y paginación:** un archivo con su propia conversación no se puede adjuntar. Paginación de 20 más cursor.
- **Hilo del cliente:** exige una versión compartida. La publicación explícita con el `publish` existente comparte solo v2, y la lista existente del cliente queda igual. Lectura del cliente: v2 y versiones compartidas, una versión privada da null, otra cuenta da null.
- **Comentarios del cliente:** crear, repetir, mismo id con otro contenido, comentar una versión no compartida, otra cuenta, editar un comentario del dueño, CAS y editar. El hilo del equipo nunca se filtra al cliente. El dueño lee el hilo del cliente, no puede editar comentarios del cliente y sí puede archivarlos. El cliente deja de ver un comentario archivado y no puede archivar uno ya archivado.
- **Inmutabilidad:** el trigger rechaza modificar versiones, historial, recibos, miembros y el autor de un comentario.

## Borradores de la fase 2

Carpeta `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/file-versions-draft/`:

- `src/lib/pro/file-versions.ts`: esquemas zod estrictos y `compareFileVersions`.
- `src/app/api/pro/file-versions/route.ts`:
  - Usa `route-common`: solo `development`, `X-Pro-Expected-Actor`, escrituras same-origin, cuerpo de 16 KiB como máximo (413) y límite de 60 por minuto.
  - Las lecturas reciben combinaciones exactas de parámetros: estado, hilo, archivados, cursor, detalle de comentario, `index` y lado cliente.
  - No pasan bytes por esta ruta.
- `src/components/pro/work-file-versions.tsx`:
  - `useWorkFileVersionIndex` hace una sola petición por página de la lista.
  - `WorkFileVersionsEntry` muestra la insignia y el botón «Versiones y comentarios (n)».
  - El panel incluye:
    - subir una versión nueva, que reutiliza `createWorkFileUpload` y `continueWorkFileWrite` con un almacén en memoria;
    - usar un archivo ya subido;
    - la nota del cambio;
    - el historial;
    - descargar, restaurar (diálogo con nota opcional) y compartir esta versión (diálogo);
    - comparar dos versiones;
    - el hilo del equipo y el del cliente, con contador, versión de referencia, edición en línea, archivar y restaurar, ver archivados e historial.
  - `AppointmentFileDiscussion` es el lado del cliente.
  - Estados de carga, error con reintento y vacío.
  - `onStateChange` indica cambios sin guardar y trabajo en curso.
  - Tokens del brief, `min-h-11`, `break-words` y `min-w-0`, sin tablas con desplazamiento horizontal.
  - Textos completos en ES y EN.
- `apply-phase2.mjs`:
  - Todo o nada, con `--dry-run`, `--out` y `--base`.
  - Copia los 3 archivos nuevos y solo edita `src/components/pro/work-files.tsx`, que ninguno de los otros seis guiones toca:
    - la importación;
    - el estado del panel y el índice antes de `const dirty=…`, sumados a `dirty` y `busy`;
    - la entrada al final de la tarjeta del dueño;
    - la conversación al final de la tarjeta compartida del cliente.
  - Los anclajes son expresiones regulares tolerantes.
- `tsconfig.check.json` (propio) y `eslint.config.mjs`.

Comprobado con el encadenado completo (créditos → mediciones → tableros → contratos → licitaciones → notas y detalles → este módulo), usando `notes-details-draft/chain/final` como base:

```
node apply-phase2.mjs --dry-run                                  → 3 copy + edit work-files.tsx; nothing changed
node apply-phase2.mjs --base=$S/notes-details-draft/chain/final --out=$S/file-versions-draft/chain/final → 4 file(s) written
npx tsc --noEmit -p tsconfig.check.json                         → 0 errores (incluye tests/e2e/pro-file-versions.spec.ts)
npx eslint --max-warnings=0 chain/final/... (4 archivos)        → 0 errores, 0 advertencias
npx eslint --max-warnings=0 tests/e2e/pro-file-versions.spec.ts → 0
negativo: base con el anclaje de la tarjeta roto → "anchor found 0 times", no se escribe nada (neg/out no existe)
```

`tests/e2e/pro-file-versions.spec.ts` está redactada y **no se ha corrido**. Usa tipos locales, porque `src/lib/pro/file-versions.ts` todavía no existe en el repositorio. Contiene:

- **Una prueba de API:** 400, 409, 413, 403 por origen, 403 para el cliente y para un extraño, 404 en el aislamiento del cliente, repetición idempotente, restaurar, insignias, compartir explícito, hilos y ausencia de avisos.
- **Dos pruebas de interfaz (ES y EN):**
  - estado de error y reintento, vacío;
  - subir v2 con nota, restaurar v1 y comparar;
  - comentar, editar, ver historial y recargar para confirmar que persiste;
  - compartir v2, comentario del cliente y respuesta visible para el dueño;
  - sin desbordamiento en escritorio ni a 390 px, capturas y ausencia de `pageerror`.

## Límites conocidos

- Los colaboradores no participan en el hilo del equipo, porque no tienen acceso a los archivos del trabajo.
- Un archivo compartido no se puede «des-compartir». Si se comparten varias versiones, el cliente las ve todas. Es el contrato inmutable de la fila 26.
- Si la página se cierra entre la subida y la vinculación, el archivo queda suelto en la lista. Se puede vincular después con «O use un archivo ya subido a este trabajo». La subida se repite con el mismo id; la vinculación reutiliza el mismo `actionId` ante errores 503.
- La lista principal sigue mostrando todos los archivos, incluidas las versiones anteriores, con la insignia «Versión anterior».
- Una cuenta con citas pero sin membresía activa (`pro_appointment_enabled` sin `pro_private_work_tools_enabled`) ve los archivos, pero no las versiones: el panel muestra el error con reintento.
- No hay comparación visual de contenido ni versiones en la biblioteca de empresa.

## Pendiente para la fase 2

1. Con autorización del líder: `node $S/file-versions-draft/apply-phase2.mjs --dry-run` y luego sin opciones, después de los otros seis guiones.
2. `npx tsc --noEmit -p tsconfig.json`, más ESLint sobre los 4 archivos y la spec.
3. Playwright en `chromium-desktop` y `webkit-mobile`, con `pro-file-versions.spec.ts` y la regresión `pro-work-files.spec.ts`, `pro-work-files-headers.spec.ts`, `pro-company-files.spec.ts` y `pro-client-dashboard.spec.ts`. Revisar las capturas con Read.
4. Actualizar la fila 30 del registro solo con esa evidencia.


## Versiones en la biblioteca de la empresa (2026-11-12)

Reutiliza el modelo de este módulo (familia = primer archivo, versiones de solo inserción, restaurar = entrada nueva, puntero vigente, CAS por revisión de familia, recibos por `actionId`) sobre `pro_company_files`, **sin exposición a clientes** (no hay lector ni comentarios de cliente; la biblioteca es privada del dueño).

- **SQL** `docs/pro/sql/company-file-versions-local.sql` (manifiesto: después de `company-files-local.sql`, `file-versions-local.sql`, `appointment-requests-local.sql` y `private-work-tools-access-local.sql`). Tablas `pro_company_file_families`, `pro_company_file_family_members`, `pro_company_file_versions` y `pro_company_file_version_actions`; RPC `pro_company_file_versions_read`, `pro_company_file_versions_index` (insignias) y `pro_company_file_versions_mutate` (`add_version`, `restore`). Elegibilidad: la de la biblioteca (`pro_appointment_enabled`) y `pro_private_work_tools_enabled`.
- **Por qué ahora sí** (la fase 1 lo dejó fuera porque la revisión del archivo ya se usa para renombrar, mover y archivar): cada versión es una fila propia de `pro_company_files` subida por la ruta existente (misma normalización, hash y verificación de bytes almacenados), y la biblioteca **lista solo el archivo vigente** de cada familia. Para eso el módulo redefine `pro_company_files_read` con la misma firma y salida, agregando `pro_cfv_hidden` en los candidatos y en la comprobación del cursor. Abrir, descargar, ver foto y «Usar en trabajo» actúan así sobre la versión vigente sin tocar `company-files.tsx` en esas acciones. El archivo que pasa a vigente hereda carpeta y favorito; mover el vigente mueve a todos los miembros (disparador `pro_cfv_follow_folder`, cada uno con su revisión siguiente), así las versiones anteriores siguen descargables desde la misma carpeta. Si se vuelve a aplicar solo `company-files-local.sql`, la lista mostraría todas las versiones: aplicar el manifiesto completo.
- **Reglas**: familia archivada → primero restaurarla (22023); un archivo ya miembro, la raíz de otra familia, uno archivado, de otra cuenta o el mismo vigente no puede ser versión nueva (22023); restaurar la vigente o una versión inexistente → 22023; 100 versiones por familia (54000 → 429). Versiones, miembros y recibos inmutables; el puntero de familia solo avanza.
- **API** `/api/pro/company-file-versions` (solo desarrollo, `proActor`, mismo origen, 16 KiB → 413, 60/min). **UI** `company-file-versions.tsx`: «Versiones» en el menú «Más opciones» de cada archivo; historial (versión, tipo, «desde la versión N», nota, fecha, «Vigente»), «Subir una versión nueva» con nota, «Descargar» por versión y «Restaurar como vigente» con confirmación; insignia «Versión N» en la lista. Si la subida termina pero la vinculación queda incierta, «Reintentar» repite la misma operación sin duplicar.
- **Pruebas**: `$S/final-sql/company-versions-test.sql` (27 PASS + «ALL COMPANY FILE VERSION CHECKS PASSED», 0 funciones `security definer`, `authenticated`/`anon` → 42501, 0 familias tras el rollback); spec `tests/e2e/pro-company-file-versions.spec.ts` (ES/EN).
