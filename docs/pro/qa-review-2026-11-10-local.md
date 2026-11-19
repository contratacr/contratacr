# Revisión QA independiente — Proyectos, Planificación y Vista del cliente (2026-11-10)

Revisor independiente. Solo checkout Pro local: sin commit, push, stash, ramas ni worktrees. SQL aplicado solo en la base de loopback. No se envió nada real. Se conservaron los cambios ajenos y solo se hicieron inserciones mínimas.

## Hallazgos corregidos

| # | Gravedad | Archivo | Problema y cómo se reproduce | Corrección | Prueba |
|---|---|---|---|---|---|
| 1 | Media (exposición de texto vivo) | `docs/pro/sql/client-dashboard-local.sql` (`pro_client_dashboard_client_read`) | El mensaje de bienvenida es texto que el dueño edita en vivo, pero se entregaba a cualquier cliente cuya solicitud tuviera `work_id`, también si estaba cancelada. Al mismo tiempo, el editor del dueño decía «Todavía no hay un cliente confirmado…». Para reproducirlo: confirmar la solicitud, cancelarla y luego `GET /api/pro/client-dashboard?requestId=` como cliente. El mensaje seguía llegando. | El mensaje (`welcomeText`) solo se entrega si la solicitud está `confirmed` o `completed`. Las preferencias de secciones no cambian y no se toca ningún permiso de lo ya compartido. | `pro-client-dashboard.spec.ts`: se cancela la solicitud y se comprueba `recipientName=null` y `welcomeText=null`. **Antes de la corrección falló** en ambos idiomas: se recibía «Welcome! Here you will see…». |
| 2 | Media (cuenta cruzada o consulta ambigua) | `src/app/api/pro/projects/route.ts` | La interfaz envía `X-Pro-Expected-Actor`, pero la ruta lo ignoraba. Si una pestaña vieja quedaba abierta después de cambiar de cuenta, recibía los proyectos de la otra cuenta. Además, con `Object.fromEntries`, `status=all&status=completed` se aceptaba usando el último valor. | Se comprueba el actor esperado (403 si no coincide), como en `project-planning` y `client-dashboard`, y se rechazan las claves repetidas (400). | `pro-projects.spec.ts`: clave repetida → 400; actor ajeno o no UUID → 403; actor propio → 200. |
| 3 | Baja-media (pestaña vacía) | `src/components/pro/business-panel.tsx` (prop `estimates` de `<JobWorkspace>`) | En `/dashboard/profesional?tab=pro_agenda&cita=…`, el menú del trabajo mostraba «Planificación › Cotizaciones», pero `ProjectEstimates` devuelve `null` fuera de `/dashboard/pro`. El resultado era un panel en blanco. | La vista de Cotizaciones solo se pasa en el espacio Pro independiente (`proSpace`), con la misma regla que `ProjectEstimates` y `PrivateEstimateAction`. | `pro-job-workspace.spec.ts`: se cambió una expectativa a propósito. Antes exigía 8 botones con «Cotizaciones» también en la ruta `profesional`, lo que fijaba el panel vacío. Ahora exige 7 botones y ningún «Cotizaciones» en `profesional`, y 8 con «Cotizaciones» cuando `PRO_INDEPENDENT=1`. La aserción no se debilitó: ahora es más precisa. |

## Comandos y resultados

- `node $S/apply-one.mjs docs/pro/sql/client-dashboard-local.sql docs/pro/sql/client-dashboard-local.sql` → ok en ambas pasadas (idempotente).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 100 SQL modules, 101 ordered steps, 117 dependencies…`
- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0.
- `npx eslint` en los 6 archivos tocados → sin errores ni advertencias.
- Antes de la corrección SQL: `pro-client-dashboard.spec.ts` en chromium-desktop → 2 fallidas en la aserción nueva (línea 104). Se esperaba ese resultado.
- chromium-desktop, con las 4 specs (`pro-projects`, `pro-project-planning`, `pro-client-dashboard`, `pro-job-workspace`) → 8 pasaron y 1 falló: `pro-client-dashboard [es]` en la línea 90. La captura muestra «No pudimos verificar la sesión» en el contexto del cliente, un fallo transitorio del entorno antes de llegar al código revisado. Al volver a correr `pro-client-dashboard` → **2 pasaron**.
- webkit-mobile, con las 4 specs → **9 pasaron (2.7 min)**.

## Capturas revisadas (Read)

Se revisaron capturas de escritorio a 1366 px (`job-workspace` a 1440 px) y de móvil a 390 px, en ES y EN: `projects-*`, `project-menu-*`, `planning-seeded-*`, `planning-list-*`, `planning-empty-*`, `planning-created-*`, `create-project-*`, `owner-*`, `customer-*` y `job-workspace-*`. No hay desbordamiento horizontal, texto cortado ni elementos superpuestos. En `/dashboard/profesional` el menú del trabajo ya no muestra Planificación (3 grupos). Copias en `$S/qa-shots/{desktop,mobile}/`.

## Observaciones sin cambiar (decisiones discutibles, no bugs)

1. En Proyectos, el total («23 proyectos en total») y los conteos del selector de estado no consideran la búsqueda. Con «cocina» se ve 1 fila y «23». Es coherente como total de la cuenta, pero puede confundir. **→ Corregido (pulido P6):** con búsqueda activa el total dice «… · la búsqueda solo filtra la lista».
2. Si falla «Ver más proyectos» o «Ver más cotizaciones», «Reintentar» recarga la primera página y no reintenta la página siguiente. **→ Corregido (pulido P2).**
3. Al cambiar de filtro, la lista anterior queda visible sin indicador de carga hasta que llega la nueva (solo hay «Cargando…» cuando todavía no hay página). **→ Corregido (pulido P3).**
4. La tarjeta móvil de proyecto tiene `aria-label="Abrir proyecto: {nombre}"`, que reemplaza el contenido: el lector de pantalla no anuncia el cliente, el estado ni las fechas. Se descartó un respaldo para nombre vacío porque `service` es obligatorio (`text.min(1)`). **→ Corregido (pulido P4).**
5. En Crear proyecto, si una respuesta perdida sí guardó el trabajo y el usuario cambia campos antes de reintentar, se abre el trabajo con los datos del primer intento. Ya está documentado como límite. **→ Justificado:** límite documentado del recibo idempotente; cambiarlo exige otra regla de recuperación.
6. El estado `scheduled` con fecha se muestra como «En curso» aunque la fecha sea futura. Es una derivación de diseño. **→ Justificado:** decisión de diseño (derivación SQL compartida con los conteos).
7. Contraste: los encabezados `#68778d` en mayúsculas sobre `#f7f9fc` dan aproximadamente 4,3:1 a 12 px, apenas bajo AA. Es el mismo patrón del resto del panel (menú del trabajo y encabezados de tabla). **→ Corregido en Proyectos y Cotizaciones del proyecto (pulido P7):** `#52627a` (≈6,2:1), como ya usa Proveedores. El resto del panel queda igual (cambio transversal fuera de alcance).
8. En WebKit móvil, los `datetime-local` vacíos muestran en gris una fecha y hora de ejemplo que puede parecer ya cargada. Los `select` nativos se ven con esquinas casi rectas, frente a los inputs `rounded-xl`, igual que el selector «Sección Pro» existente. **→ Justificado:** apariencia nativa de WebKit en toda la app.
9. El mensaje de bienvenida en la vista del cliente no tiene un título visible que diga quién lo escribe (solo `aria-label`). **→ Corregido (pulido P8).**
10. Montos: «USD 24,72» frente a «₡24,72», según el formato de `Intl` es-CR, igual que en el resto de cotizaciones. **→ Justificado:** convención de moneda de toda la app.
11. En el modal del trabajo, el botón «Editar» del pie sigue visible en las vistas Cotizaciones y Vista del cliente, aunque se refiere al trabajo y no a esa vista. **→ Pendiente justificado:** el pie está en `business-panel.tsx` (compartido, con cambios previos sin commit) y varias specs lo ubican por nombre exacto; renombrarlo u ocultarlo es una decisión de producto con riesgo de regresión. **→ Corregido (estabilización E3):** en el trabajo el pie dice «Editar trabajo» / «Edit job».
12. `pro_client_dashboard_read`: `recipient_name … limit 1` no tiene orden. Si hubiera varias solicitudes confirmadas para el mismo trabajo, el nombre podría variar. **→ Corregido (pulido P9).**
13. Marca Houzz: no aparece en ningún texto visible. Solo está en comentarios de código como referencia de paridad. «Client dashboard» en `messages/en.json` (`dashboard.client.title`) es anterior y es un término genérico. **→ Info, sin acción.**

## Textos ES/EN

Español natural en trato de usted, sin mezclas ni claves sin traducir en las vistas revisadas. Detalle menor: «Final (opcional)» podría ser «Fin (opcional)». No se cambió. **→ Corregido (pulido P10):** «Fin (opcional) · hora de Costa Rica».

---

# Revisión QA independiente — Montos previstos / Allowances (familia 75) y mantenimiento de pruebas (2026-11-10)

Revisor independiente, sin confiar en el autor. Solo checkout Pro local (`local/pro-suite-no-push`): sin commit, push, stash ni ramas. SQL aplicado solo en loopback. Nada real enviado (la spec sigue comprobando que no hay filas nuevas en `notifications` ni en `notification_push_outbox`).

## Hallazgos corregidos

| # | Gravedad | Archivo | Problema y reproducción | Corrección | Prueba |
|---|---|---|---|---|---|
| A1 | Media (información falsa al dueño) | `src/components/pro/work-allowances.tsx` (`ItemCard`, vínculo `data-allowance-linked-change`), `docs/pro/sql/allowances-local.sql` (`pro_work_allowances_read`) | La tarjeta decía siempre «Extra propuesto por esta diferencia» aunque el extra vinculado se hubiera retirado, rechazado o aceptado en Extras y cambios. Reproducción: definir por encima de lo previsto → «Proponer extra» → retirar la propuesta en Extras y cambios → volver a Montos previstos. Seguía diciendo «propuesto». | La lectura del dueño agrega `changeStatuses` (`{changeId: status}`, solo de cambios propios del mismo trabajo que estén vinculados). No se tocó el JSON de la partida, así que el historial guardado no cambia. La tarjeta muestra el estado real: propuesto (espera al cliente), aceptado, rechazado o retirado (con «reabra y vuelva a definir» para proponer otro). Si no se puede consultar, muestra «No se pudo consultar su estado» en lugar de inventar uno. `allowanceDetailSchema` exige el campo. | `pro-allowances.spec.ts`: `data-allowance-linked-change="proposed"` → retiro real por `POST /api/pro/work-changes` → la API devuelve `changeStatuses={id:'withdrawn'}` → tras recargar, la tarjeta muestra `withdrawn` y «se retiró», y no muestra «Espera la respuesta». |
| A2 | Baja-media (pérdida silenciosa) | `work-allowances.tsx` (`ClientAllowancesSession`) | Si fallaba la lectura del cliente (503, red o esquema), la sección desaparecía sin aviso y no se podía distinguir de «apagada». | Un 404 se sigue tratando como «no disponible» (oculta). Cualquier otro fallo muestra `role="alert"` con «No se pudieron cargar los montos previstos.» / «Could not load the allowances.» y «Reintentar». Mientras carga sigue sin mostrarse nada, para que una sección apagada nunca aparezca y desaparezca. | La spec responde 503 a la primera lectura del cliente: se ve `[data-client-allowances-error]` → Reintentar → la sección aparece y el error desaparece. |
| A3 | Baja (UX engañosa) | `work-allowances.tsx` (`act`, diálogo «¿Reabrir esta partida?») | Reabrir quita el vínculo (`change_id`), pero el extra propuesto sigue pendiente para el cliente y el diálogo no lo decía. | Si el extra vinculado está `proposed`, el diálogo agrega: «El extra propuesto sigue pendiente en Extras y cambios. Retírelo allí si ya no aplica.» | La spec comprueba el texto con el extra propuesto y su ausencia después del retiro (se cancela con «Volver» en ambos casos, así que el orden del historial esperado no cambia). |

Textos nuevos revisados en ES (usted) y EN, sin mezclas.

## Tarea B: pruebas obsoletas (el producto es correcto)

Causa confirmada leyendo el componente y el error de cada corrida:

1. `pro-work-changes.spec.ts:22` y `pro-work-changes-english.spec.ts:23`: `TimeoutError: page.waitForResponse … 30000ms`. `job-workspace.tsx` solo monta un panel visitado (`visited.has(view)||view===active`), y «Extras y cambios» es la vista `changes`. Abrir `?tab=pro_agenda&cita=…` activa `summary`, así que el GET nunca ocurre. Es intencional («Keep visited panels mounted…»). **Cambio:** se navega con `&vistaTrabajo=changes`. Al avanzar aparecieron dos expectativas de texto viejas en el mismo flujo de guardado incierto. El componente (`work-changes.tsx:65`, 8 nov) ahora muestra «Compruebe el guardado antes de continuar.» / «Check the saved result before continuing.», y el botón se llama «Check saved result». **Cambio:** `getByText(/No se pudo comprobar el guardado/)` y `getByText(/Could not verify the save/)` pasan a `getByRole('alert').filter({hasText:<texto actual exacto>})`. Es más estricto, porque exige el rol `alert`, y evita la ambigüedad con el `status` que repite el texto. El botón EN pasa de «Check save» a «Check saved result». No se quitó ninguna aserción.
2. `pro-work-updates.spec.ts` (ES/EN): `locator.click: Timeout` en «Share with customer» (línea 69) y, en la siguiente corrida, en «Historial» (línea 80). Los botones del menú `<details>` hacen `closest('details')?.removeAttribute('open')` antes de actuar (`work-updates.tsx:95`), lo cual es correcto en un menú. **Cambio:** se vuelve a abrir `summary[aria-label="Opciones del avance"]` antes de cada uno de esos dos clics, igual que la spec ya hacía en la línea 79. En la primera corrida, ES falló en la línea 68 por un `apiRequestContext.get` de 15 s. Coincidió con una recarga en caliente mía y no se repitió.

## Comandos y resultados

- `node $S/apply-one.mjs docs/pro/sql/allowances-local.sql docs/pro/sql/allowances-local.sql` → `ok` en las dos pasadas.
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 101 SQL modules, 102 ordered steps, 121 dependencies…`.
- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0. `npx eslint` en `work-allowances.tsx`, `allowances.ts` y las 4 specs tocadas → sin errores ni advertencias.
- Antes (chromium-desktop, `pro-work-changes`, `pro-work-changes-english`, `pro-work-updates`) → 4 fallaron y 1 pasó (el caso API de work-updates), con las causas descritas arriba.
- Corrida intermedia (las 3 specs y `pro-allowances`): `pro-allowances [es]` falló una vez solo en `expect(runtime).toEqual([])` con `Unexpected end of input`. Yo había editado `work-allowances.tsx` durante la corrida (recarga en caliente) y en la repetición pasó. Es inestabilidad del entorno, no del producto.
- **Final, las 8 specs juntas** (`pro-allowances`, `pro-client-dashboard`, `pro-job-workspace`, `pro-project-planning`, `pro-projects`, `pro-work-changes`, `pro-work-changes-english`, `pro-work-updates`):
  - chromium-desktop → **16 passed (7.7m)**.
  - webkit-mobile → **16 passed (5.8m)**.
  - No hubo fallos aislados que repetir.

## Capturas revisadas (Read)

Escritorio 1366 px y móvil 390 px (WebKit), ES y EN: `allowances-empty`, `allowances-decided`, `allowances-withdrawn` (nueva), `allowances-restored`, `owner-editor`, `customer-on`, `customer-off`, `change-form`, `customer-approved-change` y `work-updates`. En escritorio, el texto del estado «retirado» va en ámbar, legible y sin cortes, y «Ver Extras y cambios» pasa a su propia línea. No hay desbordamiento horizontal (la spec lo comprueba). Copias en `$S/qa75/final-desktop/` y `$S/qa75/final-mobile/`.

## Observaciones sin cambiar

1. Tras rechazar o retirar el extra, la única forma de proponer otro es reabrir y volver a definir (`link_change` exige `change_id is null`). Ahora la tarjeta lo explica. Permitir volver a vincular sería un cambio de SQL y de reglas. **→ Justificado (regla de negocio).**
2. `link_change` no exige `status='proposed'` en el cambio, solo que sea del mismo trabajo y tenga el mismo `delta_cents`. La interfaz siempre crea uno nuevo. Exigirlo rompería el reintento si el cliente acepta entre la propuesta y el vínculo. **→ Justificado.**
3. Archivar una partida con un extra pendiente no lo avisa (mismo caso que A3, pero al archivar). **→ Corregido (pulido P11).**
4. Límite de 200 partidas (`54000` → 429): la interfaz lo trata como «guardado incierto» y ofrece reintentar, lo que vuelve a dar 429. En la práctica no se llega a ese límite. **→ Justificado:** límite no alcanzable en uso normal; requiere un código de error nuevo en la API.
5. Recibos de `pro_client_dashboard_mutate` guardados antes de la columna `show_allowances`: si se repite un `actionId` de antes de la migración, el resultado no trae `showAllowances` y el esquema estricto lo rechaza. Es un caso solo teórico en local. **→ Justificado (teórico, solo local).**
6. `proposeExtra` revisa si hay un cambio `proposed` solo en la primera página de `work-changes`. El índice único del SQL lo protege igual (409 → «El importe acordado o los pagos cambiaron», un mensaje poco preciso). **→ Justificado:** el SQL protege; mensaje mejorable sin riesgo de datos.
7. Vista del cliente: «Reabierta» va en azul, mientras que en la vista del dueño va en ámbar. Al cliente no se le marca «Vencida» (decisión del autor). **→ Justificado (decisión del autor).**
8. En móvil, el expediente es un modal a pantalla completa con desplazamiento interno, así que `fullPage` solo captura el inicio: las tarjetas debajo del resumen no salen en la captura móvil. Las aserciones de la spec sí las cubren. **→ Info (limitación de la captura).**
9. `colonesToCents` interpreta «1.500» como 1500 colones también en EN. En la elección hay vista previa de la diferencia, pero no en el monto previsto. **→ Justificado:** regla única de colones (CRC no usa 3 decimales); las cantidades ya siguen la misma regla por idioma (pulido P5).

# Revisión QA independiente — Selecciones (familia 62) (2026-11-11)

Revisé el SQL, la API (incluida `?image=`), los esquemas, la interfaz del profesional y del cliente, las integraciones (Vista del cliente, expediente, `business-panel`, solicitudes) y la spec. No hice commit, stash, cambios de SQL ni reinicio del servidor.

## Hallazgos corregidos

1. **Media, privacidad o claridad.** Publicar un ítem le muestra al cliente las fotos de sus opciones sin pasar por «Compartir con cliente», y el diálogo de publicación no lo decía (`work-selections.tsx`, `itemAction`). **Cambio:** cuando alguna opción tiene foto, el diálogo agrega: «Las fotos de sus opciones también quedan visibles para su cliente, aunque no las haya compartido en Archivos del trabajo.» / «The photos of its options also become visible to your customer, even if you have not shared them in Job files.» **Prueba:** la UI de la spec lo exige en el diálogo de publicar (ES/EN). Se mantiene la decisión del autor de no exigir el paso por «Compartir con cliente».
2. **Media, concurrencia.** Si el profesional retira la publicación o archiva el ítem (o apaga la sección) mientras el cliente responde, el SQL devuelve 403, porque el ítem ya no existe para el cliente. Antes la interfaz del cliente mostraba «No se pudo guardar su respuesta» y dejaba el ítem viejo con sus botones (`ClientSelectionsSession.send`). **Reproducción:** el cliente abre el ítem, el dueño hace `unpublish` y el cliente pulsa «Aprobar esta opción». **Cambio:** un 403 se trata como el 409: muestra «Este ítem cambió. Lo recargamos…» y recarga. **Prueba:** un paso nuevo en la UI del cliente. Retira la publicación por API, el cliente intenta aprobar y la prueba exige el mensaje, 0 ítems, el texto de vacío y el ítem `draft` sin aprobación. Después lo publica otra vez. Para confirmar que detecta el error, revertí el cambio de forma temporal y la prueba falló: «Expected "Este ítem cambió" / Received "No se pudo guardar su respuesta. Vuelva a intentarlo."». Luego restauré el cambio. La expectativa del orden del historial pasa a incluir `publish, unpublish, publish`, un cambio intencional del flujo de la prueba.
3. **Baja, estética.** En el resumen, «Waiting for customer» / «Pendientes del cliente» ocupa dos líneas y su número quedaba más abajo que los demás. **Cambio:** las tarjetas usan `flex flex-col justify-between`.
4. **Pruebas reforzadas (no son bugs):** la imagen exige `cache-control: no-store, private` y `x-content-type-options: nosniff`, además de `image/jpeg`. Apagar la sección en la Vista del cliente oculta la foto publicada (404) y encenderla la devuelve (200).

## Verificado sin cambios

- El cliente solo ve ítems publicados, no archivados, de un área activa, en una solicitud `confirmed`/`completed` y con `show_selections`. No recibe notas, `allowanceId`, `imageFileId` ni historial; solo `hasImage`.
- `pro_work_selection_image` reautoriza cada petición. Pertenencia: dueño con herramientas privadas, o cliente vinculado con ítem y área visibles. El archivo debe ser `ready` y JPEG, y `object_path` lo restringe el CHECK de `pro_work_files` más la regex de la ruta. No hay path traversal y el id de opción es un uuid. Otra cuenta recibe 404.
- Estados y transiciones: una sola aprobación por ítem (CHECK). El cliente puede aprobar después de pedir cambios. Reabrir limpia la respuesta y la deja en el historial. Las opciones quedan bloqueadas mientras el ítem está aprobado. No se puede quitar la última opción de un ítem publicado. Un área se archiva solo sin ítems activos. «Vencido» se calcula con `America/Costa_Rica`. Los totales son `round(cantidad×precio)` en céntimos.
- CAS: las dos RPC toman el mismo candado consultivo por trabajo y bloquean la fila del ítem con `FOR UPDATE`. Toda acción sobre opciones sube la revisión del ítem, así que la aprobación del cliente da 409 si el profesional editó algo, y 403 si retiró o archivó el ítem.
- Monto previsto: el SQL de allowances rechaza `decide` sobre una partida `decided` o archivada (400) y protege la revisión (409). El vínculo solo acepta partidas del mismo trabajo. El reintento reutiliza el `actionId` (no duplica). El botón se oculta si la partida está definida.

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0. `npx eslint src/components/pro/work-selections.tsx tests/e2e/pro-selections.spec.ts` → sin errores ni advertencias.
- `pro-selections` en chromium-desktop, con los cambios → **2 passed (1.3m)**.
- Prueba de detección (sin la corrección 403), chromium-desktop `[es]` → 1 failed con el mensaje esperado (ver punto 2). Restaurada la corrección.
- `pro-selections` en webkit-mobile → **2 failed por el entorno**. ES: `apiRequestContext.get: socket hang up (ECONNRESET)` en la línea 169 (GET de imagen de la cuenta rival). EN: `connect ECONNREFUSED 127.0.0.1:3185` al iniciar sesión (línea 37). El servidor de desarrollo de :3185 dejó de escuchar durante la corrida. No hay proceso escuchando en 3185 y siguió caído después de 10 minutes de espera. No lo reinicié, según el brief.
- **Pendiente por el entorno → resuelto en el pulido final:** `pro-selections`, `pro-allowances`, `pro-client-dashboard`, `pro-job-workspace` y `pro-projects` pasan en chromium-desktop y webkit-mobile (ver «Pulido final»). Texto original: la repetición de `pro-selections` en webkit-mobile y la regresión (`pro-allowances`, `pro-client-dashboard`, `pro-job-workspace`, `pro-project-planning`, `pro-projects`) en los dos proyectos. La corrección de las tarjetas del resumen (punto 3) se hizo después de la corrida verde de chromium y todavía no tiene corrida E2E. Es solo CSS; tsc y ESLint dan limpio.

## Capturas revisadas (Read)

Escritorio 1366 px (chromium), ES/EN: `selections-board`, `selections-approved-board`, `selections-approved-tracker`, `customer-changes`, `customer-approved`. Están en `$S/qa62/desktop/`. No hay cortes ni desbordes. El único defecto visto fue la alineación del resumen (punto 3). No hay capturas móviles nuevas por la caída del servidor: la última evidencia móvil es la del autor, en `$S/selections-shots/mobile*`.

## Observaciones sin cambiar

1. «Usar este total en el monto previsto» no comprueba en el servidor la revisión del ítem de selección. Con dos pestañas, si en una se reabre el ítem y se aprueba otra opción, la otra pestaña puede definir la partida con la opción vieja. La revisión de la partida no cambió, así que no hay 409. Es de baja probabilidad y la partida se puede reabrir. **→ Justificado (baja probabilidad, reversible; requiere contrato SQL nuevo).**
2. La FK `pro_work_selection_options(image_file_id)` es `on delete cascade`. Si algún día se borra un archivo del trabajo, se borra la opción, aunque sea la aprobada, y `approved_option_id` queda colgando. Hoy los archivos son inmutables y solo se usan los `ready`, así que no ocurre. Sería mejor `on delete set null (image_file_id)`. **→ Justificado:** hoy no ocurre (archivos inmutables); cambiar la FK es una migración de esquema a decidir con el módulo de archivos.
3. El SQL permite `publish` sobre un ítem aprobado y sin publicar (la UI lo oculta). Es inofensivo. **→ Justificado (inofensivo).**
4. El conmutador Tablero/Seguimiento usa `role="tablist"`/`tab` sin `tabpanel`, `aria-controls` ni navegación con flechas. Mejora de accesibilidad pendiente. **→ Corregido (pulido P12).**
5. Si el profesional apaga la sección mientras el cliente responde, la vista del cliente desaparece sin mensaje, porque `visible:false` no se renderiza. Es aceptable. **→ Justificado (aceptable).**
6. Cuando el cliente pide cambios, la recomendación y las opciones siguen editables y el estado queda en `changes_requested` hasta que el profesional reabre. Es coherente con el diseño. **→ Justificado (diseño).**

# Revisión QA independiente — Órdenes de compra y presupuesto (familias 51/52/54) y regresiones de Gastos y presupuesto (2026-11-11)

Revisor independiente; no se confió en el informe del autor. Solo checkout Pro, sin commit/push/stash, sin servicios externos. Copias previas de cada archivo tocado en `$S/backup/*.qa-po` (`S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`).

## Hallazgos corregidos

1. **Media — copia imprimible ilegible en el teléfono** (`src/lib/pro/purchase-order-print.tsx`, CSS de `th,td`). Con `overflow-wrap:anywhere` la tabla nunca se desbordaba en su carril y, a 390 px, partía las palabras letra por letra («Por/cela/nat/o», «Des/crip/tion», «b/a/g»; captura `po-print-en-mobile.png` antes del cambio). Cambio mínimo: `overflow-wrap:break-word`, `th{white-space:nowrap}` y `td:first-child{min-width:9rem}`. La tabla ahora se desplaza dentro de su `.table` (overflow-x:auto); en impresión (`@media print`) sigue visible completa. Prueba: la spec comprueba que la primera palabra de la descripción y del encabezado ocupa un solo rectángulo. Sonda en WebKit 390 px con el mismo HTML: CSS anterior → 11 rectángulos, CSS nuevo → 1.
2. **Baja — accesibilidad del formulario de entrega** (`work-purchase-orders.tsx`, campo `data-po-receive-line`). Todos los campos de cantidad se llamaban «Recibido» o «Received», sin indicar la línea. Ahora tienen `aria-label="Recibido: <descripción>"`. La spec lo ubica por rol y nombre. También se agregó `aria-label` al `tablist` Órdenes/Presupuesto, igual que en Selecciones.
3. **Baja — textos.** Los filtros «Emitidas desde/hasta» e «Issued from/to» filtran por fecha de emisión, que también tienen los borradores. Ahora dicen «Emisión desde/hasta» e «Issue date from/to», igual que la etiqueta «Emisión:» que el autor ya había corregido en la lista. En la copia imprimible, «Emitida por / Issued by» aparecía también en los borradores. Ahora dice «Preparada por / Prepared by», como el pie del documento.
4. **Cobertura de XSS en la impresión** (no había prueba). Se creó una orden con `<img onerror>`, `<script>`, comillas y `&` en el título, el proveedor, el contacto, las notas, la descripción y la unidad. La copia solo contiene las entidades escapadas y un único `<script>` (el del nonce). Pasa: el escape ya era correcto.

## Verificado sin cambios

- **Céntimos:** se compararon 1 356 casos aleatorios más los casos límite (2,5 × 199 999 al 13 %, 50 al 13 % = 6,5 → 7, 0,001 × 1, 1,005 × 100, 33,33 %…). Se comparó `poLineFigures` (JS) con la fórmula de las columnas generadas de Postgres. Resultado: **0 discrepancias**. Los productos intermedios son enteros menores que 2^53, y la mitad exacta (k + 0,5) se representa sin error. La orden suma las líneas; el saldo es el total menos (pagos − reversos).
- **Presupuesto:** comprometido incluye borradores y no las canceladas. Proyectado es `greatest(comprometido, real)` por partida; los grupos suman los proyectados de sus partidas; el bloque sin código se trata como una partida más. Las cifras de la captura del diálogo (60 850,55 comprometido; −19 850,55 de variación) cuadran a mano. Las asignaciones de costos reales solo pueden ir a partidas (`kind='item'`), así que no se pierde costo real en grupos. La limitación documentada (el máximo subestima si en una partida se mezclan compras con orden y gastos sin orden) se mantiene.
- **Numeración:** se asigna con bloqueo de la fila del contador dentro de la transacción. Un rechazo revierte el contador. Una repetición con el mismo `actionId` espera el bloqueo consultivo de la acción y devuelve el recibo. No hay interbloqueo entre trabajos: el único recurso compartido es el contador. La spec cubre 8 envíos concurrentes (4 pares repetidos).
- **Estados, entregas, pagos y reversos:** las transiciones, los límites de fecha (emisión ≤ fecha ≤ hoy en Costa Rica), el no superar lo pedido ni el saldo, el reverso único (índice parcial único) y la cancelación con pagado en cero coinciden con lo documentado. Vencida: `expected_date < (now() at time zone 'America/Costa_Rica')::date`, solo para emitidas o recibidas en parte.
- **Aislamiento:** toda lectura y escritura filtra por `owner_id`/`user_id` del actor. Las referencias (partida, opción, monto previsto, proveedor) se validan contra la misma cuenta y el mismo trabajo. La cuenta rival recibe 404/403 (cubierto por la spec).
- **Impresión:** `ContrataCRLogo` aprobado (marca + `wordmark-light.svg`, `gap:0`), CSP con nonce, `no-store`, `noindex`. Revisado en captura de escritorio y de móvil.

## Tarea B1 — Gastos: causa raíz (no es `modal.tsx`)

- Error (chromium, `pro-expenses.spec.ts:45` / `pro-expenses-english.spec.ts:44`): `waiting for getByRole('dialog',{name:'Nuevo gasto'}).getByRole('button',{name:'Guardar'})`.
- Evidencia de la traza (`3-trace.trace`, instantánea justo después del guardado incierto y **antes** de «Cerrar»): el pie del diálogo está montado y el botón `type="submit" form="pro-expense-write"` existe, habilitado, con el texto **«Reintentar guardado»**. El pie no se desmonta; solo cambió la etiqueta.
- Código: `src/components/pro/expenses-workspace.tsx` (sin seguimiento en git, mtime 8 nov 17:52, posterior a las dos specs de las 12:31) etiqueta el envío como `scope.attempt&&!rejected ? 'Reintentar guardado'/'Retry save' : 'Guardar'/'Save'`. La spec más reciente `pro-expense-write-recovery.spec.ts` (17:36) ya espera `retry:'Reintentar guardado'` y **pasa (2/2)**: no fallaba, al contrario de lo que se había reportado. El diff de `modal.tsx` contra HEAD solo agrega `manageFocus`, `className`, `ariaLabel`, `ref`/`tabIndex` y el manejo de foco de modales anidados; no toca el contenido ni el pie. Por eso no hizo falta cambiar `modal.tsx` por la versión de HEAD (copias en `$S/backup/modal.tsx.current-qa` y `$S/modal-head/modal.tsx`, fuera del repo; el archivo del repo no se tocó).
- Decisión: el producto es correcto. La etiqueta coincide con el aviso «Reintente sin cambiar los datos». Se actualizaron solo los dos clics posteriores al guardado incierto (ES líneas 45–46, EN 44–45) a «Reintentar guardado» / «Retry save». La aserción no se debilitó: ahora además exige la etiqueta nueva. Ambas pasan.

## Tarea B2 — `pro-work-budget-api.spec.ts`

Se revisó la spec. El «gate» abre `psql` nativo y bloquea filas o claves consultivas de cuentas desechables, y `nativeDatabase()` exige `PGHOST` localhost/127.0.0.1, `PGPORT=54322` y `PGDATABASE=postgres`. Se corrió con `PRO_LOCAL_PSQL=~/.supabase/cache/stack/slim-services/postgres/17.11.0.004-r1/darwin-arm64/bin/psql` y `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` derivados de `SUPABASE_DB_URL` de `.env.test`, sin imprimir la contraseña. Se comprobó que el destino era `127.0.0.1:54322/postgres`. Servidor: PostgreSQL 15.19. Resultado en chromium-desktop: **7 passed (33.1s)**. El fallo anterior era solo del entorno.

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0. `npx eslint src/components/pro/work-purchase-orders.tsx src/lib/pro/purchase-order-print.tsx tests/e2e/pro-purchase-orders.spec.ts tests/e2e/pro-expenses.spec.ts tests/e2e/pro-expenses-english.spec.ts` → 0 errores y 0 advertencias. No se tocó SQL.
- `pro-purchase-orders`, con las correcciones: chromium-desktop **2 passed (50.1s)**, webkit-mobile **2 passed (58.5s)**.
- `pro-expenses` + `pro-expenses-english`, chromium, tras actualizar la etiqueta → **2 passed (27.6s)**. Antes: 1 failed cada una en la línea 45/44.
- `pro-expense-write-recovery`, chromium, sola → **2 passed** (dos veces).
- Regresión final, 10 specs (`pro-purchase-orders`, `pro-work-budget-journey`, `pro-work-costs`, `pro-expenses`, `pro-expenses-english`, `pro-expense-write-recovery`, `pro-selections`, `pro-allowances`, `pro-job-workspace`, `pro-projects`), lanzadas con un arreglo de zsh:
  - chromium-desktop → **16 passed, 2 failed (7.4m)**: `pro-work-costs` (no apareció `[data-work-costs]` en 12 s) y `pro-expense-write-recovery [es]`. Repetidas juntas: `pro-work-costs` pasa. `pro-expense-write-recovery [es]` falla en la línea 67 (dos de tres corridas en par) y pasa sola. La traza muestra que el POST del gasto recibió **409** (revisión vieja), poco después del 200 del proveedor. Es una carrera de tiempo propia de Gastos: el formulario «Nuevo gasto» se abre con la revisión anterior al refresco. No tiene relación con las órdenes de compra ni con `modal.tsx`. Clasificación: intermitente, ya existía.
  - webkit-mobile → **16 passed, 2 failed (7.2m)**: `pro-purchase-orders [es]` (el diálogo «Presupuesto de costos (CRC)» no se abrió tras el clic en `[data-work-budget-trigger]`; la captura muestra Costos y pagos sin diálogo) y `pro-expense-write-recovery [es]`. Repetidas: `pro-purchase-orders` **2/2 passed** (intermitente de tiempo, clic durante la carga). `pro-expense-write-recovery [es]` vuelve a fallar en la línea 92: `pageerror` «…/api/pro/expenses?kind=expenses… due to access control checks». Es un `fetch` de la lista de Gastos que se cancela al recargar y que WebKit reporta como rechazo sin capturar. Clasificación: defecto de Gastos que ya existía y que solo se ve en WebKit; no viene de este módulo.
- El servidor :3185 respondió durante todas las corridas (no cayó).

## Capturas revisadas (Read)

Escritorio 1366 px (`$S/qa-po-shots/desktop/`): `po-form-es`, `po-detail-en`, `po-list-es`, `po-print-es`, `work-budget-committed-es`. Móvil WebKit 390 px (`$S/qa-po-shots/mobile/`): `po-form-es-mobile`, `po-detail-top-en-mobile`, `po-detail-es-mobile`, `po-list-es-mobile`, `po-print-en-mobile` (antes de la corrección: palabras partidas) y `po-print-es-mobile` (después: legible, la tabla se desplaza en su carril). Las capturas se tomaron desplazando dentro del modal. No hay cortes ni superposiciones, aparte del defecto de impresión ya corregido.

## Observaciones sin cambiar

1. La cantidad `1.000` se interpreta como 1 (`parsePoQuantity`), mientras que el costo `8.500` se interpreta como 8 500 (`colonesToCents`, separador de miles es-CR). Es ambiguo para un usuario de Costa Rica. Conviene definir una sola regla. **→ Corregido (pulido P5).**
2. Una orden **recibida en parte** se puede cancelar, y entonces todo su total sale de «Comprometido», aunque parte de la mercadería ya llegó. Está documentado como «cancelar en borrador, emitida o parcial». Es una decisión discutible. **→ Justificado (regla documentada; cambia el cálculo del presupuesto).**
3. `pro_purchase_orders_mutate` acepta una partida activa dentro de un **grupo archivado**, aunque las referencias de la interfaz la ocultan (en `work-budget` el `assign` sí lo rechaza). Es inocuo, pero inconsistente. **→ Justificado (inocuo; la UI no lo ofrece).**
4. Al editar una orden cuya línea apunta a una selección ya no aprobada o a una partida archivada, el `<select>` muestra «Sin vínculo», pero el valor viejo se conserva y el servidor rechaza con el mensaje genérico de validación. **→ Pendiente:** requiere decidir si se quita el vínculo al editar (cambia datos guardados). **→ Corregido (estabilización E4):** no se quita en silencio; el formulario lo muestra como «Vínculo anterior (ya no disponible)» y pide elegir otro o «Sin vínculo».
5. La ruta de impresión no repite la comprobación `role==='admin'` + `getApiAdmin()` de la API principal. La RPC exige `pro_private_work_tools_enabled`, así que no hay fuga. **→ Justificado (sin fuga).**
6. `PurchaseOrderBudgetTable` también aparece dentro del diálogo de presupuesto de `/dashboard/profesional`, donde la vista Órdenes de compra no está disponible (solo `proSpace`). **→ Justificado:** el presupuesto comprometido es información válida en ambos paneles.
7. Abrir «Registrar entrega» o «Registrar pago» marca el formulario como sucio de inmediato (cantidades o saldo precargados) y bloquea el menú hasta cancelar. **→ Corregido (pulido P13).**
8. El conmutador Órdenes/Presupuesto usa `tablist`/`tab` sin `tabpanel`, `aria-controls` ni navegación con flechas (igual que Selecciones). **→ Corregido (pulido P12).**
9. En WebKit móvil, los `input type=date` vacíos muestran la fecha de hoy en gris y el texto queda pegado arriba. Es un estilo nativo de toda la app, no de este módulo. **→ Justificado (nativo).**
10. En inglés los montos usan agrupación es-CR (`₡8.500`, `proMoney`) junto a cantidades `12.5`. Es una convención previa de la app. **→ Justificado (convención de colones de la app).**
11. El pie de la copia dice «no registra pagos», pero muestra «Pagado/Saldo». Sería más claro «no constituye comprobante de pago». **→ Corregido (pulido P14).**
12. Gastos: la carrera 409 al abrir «Nuevo gasto» justo después de guardar un proveedor, y el `fetch` sin `catch` al recargar en WebKit (ver regresión). Se reportan al equipo de Gastos. **→ Corregido (pulido P1 y P15).**

# Revisión QA independiente — Cronograma, pendientes finales y horas (familias 13, 15, 21, 22, 79) (2026-11-11)

Revisor independiente. Solo checkout Pro, base de loopback, sin commit/push/stash. Copias previas de lo que toqué: `$S/qa-time/*.before-qa` (`S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`).

## Hallazgos corregidos

1. **Alta — la foto obligatoria se podía saltar en el servidor.** `docs/pro/sql/work-punchlist-local.sql:114` (original) solo la revisaba en `pro_work_punchlist_mutate('complete')`. Como cada pendiente es una tarea, `POST /api/pro/work-tasks {action:'complete'}`, el Centro de tareas o un miembro del equipo la completaban sin foto. Reproducción: crear un pendiente con `photoRequired:true` y sin foto, y completarlo por `work-tasks`: devolvía **200 `status:'done'`**. Corrección: disparador `pro_work_punch_photo_guard` `before update of status on pro_work_tasks` (de no hecha a `done`), con código 22023 → 400 para todo escritor. Prueba: `pro-project-schedule.spec.ts:106-107`. Con el SQL viejo, la corrida falla con «Expected: 400, Received: 200».
2. **Media — una línea editada desde Costos aparecía «Anulada» en Horas, y los totales no coincidían.** Esto es un bug, no un límite. `edit_time` revierte la línea y crea otra (id = `requestId`). `pro_time_entry_json` y `pro_time_read` solo miraban si la línea original estaba revertida. Resultado: Horas marcaba la entrada como anulada y la sacaba de los totales, mientras Costos seguía contando los minutos nuevos. Además, «Anular» desde Horas daba 409 y no se podía revertir la línea vigente. Corrección acotada en `time-tracking-local.sql`:
   - `pro_time_live_line` sigue la cadena `edit_time` usando los recibos de `pro_work_cost_requests`, con un índice parcial nuevo;
   - la entrada lleva `adjusted` («Corregida en Costos» / «Adjusted in Costs») y toma minutos, monto facturable y costo de la línea vigente;
   - `void` revierte la línea vigente.

   Se agregaron `adjusted` al esquema zod y la etiqueta en `time-tracking.tsx`. Pruebas: `pro-time-tracking.spec.ts:69-79` (API: 45 min, ₡15.000 facturable, costo ₡4.500 en ambos módulos, y anulación posterior en cero) y `:156-163` (interfaz, recarga y captura). Con el SQL viejo, la corrida falla en la línea 75.
3. **Baja — el Gantt no centraba «Hoy» en móvil.** El cálculo de desplazamiento inicial y el botón «Hoy» no tenían en cuenta la columna fija de nombres. A 390 px, la línea de Hoy quedaba pegada al borde derecho con la etiqueta cortada («Tod»). Corrección: `todayScroll()` en `project-schedule.tsx`. Prueba: `pro-project-schedule.spec.ts` (`todayInView`, con `expect.poll`).
4. **Baja (estética) — etiqueta partida en dos líneas.** En la tabla de Horas de escritorio, la etiqueta de estado se partía dentro de la columna Descripción. Se corrigió con `inline-block whitespace-nowrap` en «Anulada» y «Corregida en Costos».

Se agregó una prueba de **concurrencia real** (`pro-time-tracking.spec.ts:80-89`):
- dos `start` simultáneos con distinto `entryId` dan exactamente `[200,409]` y una sola fila `running`;
- dos `stop` simultáneos con distinto `actionId` dan `[200,200]`, con `alreadyStopped` `[false,true]`, una sola línea de costo y 12 minutos en Costos.

## Verificado sin cambios

- **Horas:**
  - una sola sesión activa: índice único parcial más candado `pro-time:` por cuenta. Doble clic: `lock` en el cliente y recibo por `actionId`. Reintento: mismo `actionId` y misma respuesta;
  - el servidor mide la duración (`clock_timestamp()-started_at`, mínimo 1). Más de 24 h exige minutos ≤ `ceil(transcurrido)`;
  - el reloj del cliente se corrige con `serverNow`, y el día se toma en hora de Costa Rica;
  - redondeo: `round(min×tarifa/60)` por entrada, igual que `amount_cents` de Costos. Los totales suman los valores ya redondeados;
  - orden de candados (acción → `pro-time:` → `work-costs:`) sin ciclo con los escritores de Costos.
- **Cronograma:**
  - desviación con signo + = atraso, por tarea, fase, fecha clave y proyecto;
  - instantánea inmutable (disparador) ligada a la revisión exacta del plan;
  - la vista del cliente solo trae títulos de fase, períodos, conteos y fechas clave (título y fecha). La prueba busca nombres de tareas, notas, ids y línea base, y no los encuentra.
- **Pendientes:** la foto se reautoriza en cada petición; para el cliente exige `confirmed`/`completed` más `show_punchlist`, y la tarea no puede estar archivada.
- **`route-common.ts`:** la semántica es idéntica a `client-dashboard/route.ts`:
  - actor y `X-Pro-Expected-Actor` opcional pero exacto; admin solo con `getApiAdmin`;
  - origen comparado contra `protocol//host`;
  - cuerpo acotado que se corta al exceder el límite (413), con 16 KiB por defecto y 8/4 KiB en Horas/Cronograma;
  - `development`-only en cada GET y POST de las tres rutas.

  Diferencias que no son de seguridad: `23505` → 409 (antes 400) y `P0002`/`23503` → 400 (antes 503). Además, `proQuery` rechaza claves repetidas.
- **Teclado en el Gantt:** la región es enfocable y se mueve con ←/→. Los nombres de tarea y fecha clave son botones que se abren con Enter, y las barras quedan fuera del orden de tabulación (`tabIndex=-1`).

## Comandos y resultados

- SQL: `node $S/apply-one.mjs` con `time-tracking-local.sql` dos veces y `work-punchlist-local.sql` dos veces → `ok` ×4. Manifiesto: `PASS: 106 SQL modules, 107 ordered steps, 142 dependencies`.
- Detección: apliqué el SQL viejo (`$S/qa-time/*.before-qa`) y eliminé el disparador. `pro-project-schedule [es]` y `pro-time-tracking [es]` fallaron en las líneas nuevas. Luego volví a aplicar el SQL corregido dos veces.
- `npx tsc --noEmit` → 0 errores. ESLint de `time-tracking.ts`, `time-tracking.tsx`, `project-schedule.tsx` y las dos specs → limpio.
- Regresión con un arreglo de zsh (10 specs):
  - chromium-desktop: **23 passed (9.3m)**;
  - webkit-mobile: **21 passed, 2 failed (8.6m)**. Fallaron los dos casos de `pro-job-workspace`: `[data-job-workspace]` no apareció en 12 s y la página quedó en «Cargando…». Al repetirlo solo: **2 passed (1.2m)**. Lo clasifico como lentitud del entorno.
- Tras la corrección 3:
  - `pro-project-schedule` en webkit-mobile: es pasó y en falló en la línea 155 (no apareció el estado de error). Repetido: **1 passed**. Ver la observación 6;
  - `pro-project-schedule` + `pro-time-tracking` en chromium-desktop: **4 passed (2.4m)**.
- El servidor :3185 respondió durante todas las corridas.

## Capturas revisadas (Read)

- Escritorio 1366 px (`$S/qa-time/desktop/`, `desktop2/`): `time-running-en` y `time-adjusted-es`/`en` (son las capturas de Horas en escritorio que faltaban; la de antes de la corrección 4 muestra la etiqueta partida), `schedule-gantt-day-es`, `schedule-gantt-month-en`, `schedule-edit-es`, `punchlist-es`, `customer-schedule-en`.
- Móvil WebKit 390 px (`$S/qa-time/mobile/`, `mobile2/`): `time-adjusted-es-mobile`, `schedule-gantt-day-en-mobile` (antes: Hoy cortado) y `schedule-gantt-day-es-mobile` (después: centrado).

## Observaciones sin cambiar

1. El Gantt no dibuja la **fecha límite** (`dueDate`) de las tareas, y «Vencida» se calcula con el fin previsto, no con la fecha límite. **→ Pendiente (función nueva del Gantt, no un defecto de pulido).** **→ Corregido (estabilización E7).**
2. La desviación por fase usa la pertenencia a la fase guardada en la línea base. Si una tarea se mueve de fase después, la fase de origen puede mostrar «adelanto». **→ Justificado (diseño de la línea base).**
3. Una sesión que cruza la medianoche se registra completa en el día en que se detiene. Si en Costos se cambia la fecha de una línea, la entrada sigue en el período de su fecha original. Ambos casos están documentados. **→ Justificado (documentado).**
4. Si el trabajo se cancela o el cliente se archiva con un cronómetro en marcha, «Detener» da 400 («No se guardó») y solo queda «Descartar». El mensaje no explica la causa. **→ Pendiente:** necesita un código de error específico en la API de Horas. **→ Corregido (estabilización E5):** código `inactive_job`.
5. Completar desde la Lista o el Centro de tareas un pendiente con foto exigida ahora da 400, pero esas vistas muestran el mensaje genérico («No se guardó el cambio…») y no «Agregue una foto». **→ Pendiente:** igual que el 4 (código de error específico en `work-tasks`). **→ Corregido (estabilización E6):** código `photo_required`.
6. Prueba frágil en `pro-project-schedule.spec.ts:152-155`: la ruta falla solo la **primera** petición GET. Si esa petición se cancela por un remontaje, el estado de error no aparece. Se vio una vez en webkit. **→ Corregido (pulido P16).**
7. Una entrada facturable sin actividad ni tarifa suma a «Horas facturables», pero aporta ₡0 al monto facturable. **→ Justificado (coherente: horas sin tarifa).**
8. En `GanttChart`, `useMemo(()=>buildRows(data,c),[data,c])` no memoriza nada, porque `c` se recrea en cada render. Solo afecta el rendimiento. **→ Justificado (solo rendimiento, sin efecto visible).**

# Solicitudes con bandejas

Revisión independiente del 11 de noviembre de 2026 (QA, seguridad, estética e idiomas ES/EN) de `lead-inboxes-local.sql`, `api/pro/lead-inboxes/route.ts`, `lib/pro/lead-inboxes.ts`, `components/pro/lead-inboxes.tsx`, las inserciones en `leads-workspace.tsx` y `pro-space.tsx`, y las specs. Leí el código, no el informe. Sin commit, push ni stash.

## Hallazgos

| # | Severidad | Archivo:línea | Hallazgo | Estado |
|---|---|---|---|---|
| 1 | Media | `docs/pro/sql/lead-inboxes-local.sql:224-232` | «Deshacer importación» archivaba **todas** las solicitudes importadas que seguían activas, aunque el profesional ya las hubiera editado, movido de etapa, convertido en cotización o trabajo, o les hubiera puesto próximo contacto, posposición o canal. Se perdía trabajo comercial sin aviso. | Corregido: solo archiva si la revisión sigue en 1 y no hay vínculo en `pro_manual_lead_works`/`pro_manual_lead_quotes`, fila en `pro_lead_followups`/`pro_lead_snoozes` ni historial de canal distinto del de la creación. Nueva aserción en la spec (cambio de etapa → `archived:1`, `activeLeads:1`; la solicitud sigue sin archivar). |
| 2 | Baja (seguridad) | `src/app/api/pro/lead-inboxes/route.ts:58` | El límite de cuerpo era 1 MB para todas las acciones. El patrón del equipo es 16 KiB. | Corregido: 16 KiB → 413 para posponer, reactivar y deshacer; 1 MB solo para `preview`/`import` (archivo de 300 KB). Spec: nota de 17 000 caracteres → 413 y vista previa de 150 filas (más de 16 KiB) → 200. |
| 3 | Baja | `src/lib/pro/lead-inboxes.ts:53` | Cota de revisión de deshacer `2146483646`, distinta de la del SQL (`2147483646`). | Corregido. |
| 4 | Baja (idioma) | `src/components/pro/lead-inboxes.tsx:174,187,191` | En inglés el porcentaje salía «20 %». En inglés se escribe «20%». | Corregido con `pct()` (ES «20 %», EN «20%»). Se actualizó la expectativa de la spec por idioma: es un cambio intencional. |
| 5 | Baja (idioma) | `src/components/pro/lead-inboxes.tsx:145,148` | La confirmación en inglés era redundante («Active leads … that are still active»). Tampoco explicaba qué se conserva. | Corregido: textos ES/EN nuevos («activas y sin cambios (hasta N)»). El aviso final indica cuántas se conservaron, con plural correcto. |
| 6 | Baja (accesibilidad) | `src/components/pro/lead-inboxes.tsx:69` | Los atajos Mañana, En una semana y En un mes medían menos de 44 px. | Corregido con `min-h-11`. |
| 7 | Info | WebKit móvil | Los `<select>` nativos (Bandeja, Tipo de servicio y también «Sección de Pro», que ya existía) se ven con menos de 44 px, porque WebKit ignora `min-height`. El campo de fecha vacío muestra la fecha en gris. El botón del selector de archivo sale en el idioma del navegador. | Justificado (comportamiento nativo y anterior al módulo). |
| 8 | Info | `parseCatalogCsv` | Solo acepta coma como separador. Excel con configuración regional es-CR suele exportar con «;», y esos archivos dan «Columna no reconocida». | Corregido por Empresa (hallazgo 5 de esa revisión: detección automática de «;»). |

Verificado sin defectos:
- RLS activada y `revoke` a `public`/`anon`/`authenticated` en las 5 tablas. Todas las funciones son `security invoker` y solo `service_role` puede ejecutarlas. Las tablas de historial y recibos tienen disparadores que las hacen inmutables.
- La API comprueba `X-Pro-Expected-Actor` (403), el mismo origen (403), el límite de frecuencia 30/min en POST y que se ejecute solo en `development` con loopback. El aislamiento entre cuentas da 404 y recibo nulo.
- CAS con 40001→409 en posponer, reactivar y deshacer. `actionId` idempotente (reutilizarlo con otro contenido da 400).
- CSV:
  - quita el BOM, valida las comillas y admite hasta 200 filas y 300 KB;
  - normaliza correo y teléfono (los 8 dígitos sin el prefijo 506) y compara solo con los clientes propios;
  - la importación es todo o nada: si una fila tiene errores, no se importa ninguna;
  - la plantilla y las exportaciones pasan por `businessCsv`, que neutraliza `= + - @`.
- Posponer acepta de mañana a 366 días en hora de Costa Rica y el vencimiento se calcula al leer.
- Los contadores de bandeja usan los mismos filtros que la lista.
- Métricas: `open+archived=received` y la conversión solo cuenta vínculos vigentes.
- Las specs `pro-lead-center` y `pro-request-pipeline` se compararon con la copia de `$S/inbox-backup/`. Solo cambia la forma de navegar (bandeja en lugar del conmutador o el selector). No se quitó ni se debilitó ninguna aserción.

## Comandos y resultados

- `node $S/apply-one.mjs docs/pro/sql/lead-inboxes-local.sql docs/pro/sql/lead-inboxes-local.sql` → `ok` ×2.
- `npx tsc --noEmit -p tsconfig.json` → 0 errores.
- ESLint de `route.ts`, `lead-inboxes.ts`, `lead-inboxes.tsx` y `pro-leads-inboxes.spec.ts` → limpio.
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 107 SQL modules, 108 ordered steps, 146 dependencies`.
- `pro-leads-inboxes.spec.ts`: chromium-desktop **6 passed (1.4m)**; webkit-mobile **6 passed (1.3m)**.
- `pro-lead-center` + `pro-request-pipeline` (arreglo zsh, con `native-env.sh`): chromium-desktop **10 passed (1.7m)**; webkit-mobile **10 passed (1.6m)**.

## Capturas revisadas (Read)

- Escritorio (`$S/qa-inbox/shots-desktop/`): `es-stage-inbox`, `es-import-errors`, `es-import-history`, `en-insights` («20%» ya corregido), `en-snooze-dialog`.
- Móvil WebKit (`$S/qa-inbox/shots-mobile/`): `es-snoozed-inbox`, `en-snooze-dialog` (hoja inferior), `en-import-history`.
- Sin desbordamiento horizontal ni textos cortados. Sin mezcla de idiomas, salvo el botón nativo del selector de archivo.

---

# Empresa / Company — revisión QA independiente (2026-11-11)

Revisión de código (no del informe) de `company-vendors-local.sql`, `company-vendors.ts`, `api/pro/company-vendors/route.ts`, `company-vendors.tsx`, `company-hub.tsx`, integración en `pro-space.tsx` / `management-shell.tsx` / `simple-workspace.tsx` / `business-panel.tsx`, `catalog-import.ts(x)`, manifiesto y spec `pro-company.spec.ts`. Sin commit, push, stash ni envíos. `$S` = scratchpad de la sesión.

## Hallazgos

| # | Severidad | Archivo:línea | Hallazgo | Estado |
|---|---|---|---|---|
| 1 | Media (prueba) | `tests/e2e/pro-catalog-item-types.spec.ts:13,25-31` | Causa raíz de los fallos «siempre distintos»: **interferencia del entorno de desarrollo, no defecto del producto ni prueba obsoleta**. La spec no usaba `stabilizeLocalProRuntime` ni precalentaba rutas: (a) cada ruta API/página que toca por primera vez se compila a demanda en el servidor webpack y supera los 15 s de `actionTimeout` (traza: `POST /api/pro/quote-create` sin respuesta a los 15 s; `client-pending` y el historial del cliente pendientes >9 s); (b) los avisos de recompilación del HMR recargan la página y cierran diálogos abiertos; (c) tras una recompilación, un socket keep-alive reutilizado devuelve `ECONNRESET`. Cada corrida falla en la primera ruta todavía fría, por eso el error cambia. Con las rutas calientes la spec pasa sin cambios. | Corregido: `stabilizeLocalProRuntime` en `login`, precalentamiento de las 18 rutas usadas (reintento solo ante error de red en el precalentamiento, exige estado <500) y tiempo total 420 s. Ninguna aserción se tocó. |
| 2 | Baja | `docs/pro/sql/company-vendors-local.sql:150` | `pro_company_vendors_mutate` bloqueaba el proveedor con `for update`, que choca con el `for key share` que toman las FK de `pro_purchase_orders` y `pro_internal_expenses`: crear una OC con ese proveedor esperaba a la transacción del directorio. No había interbloqueo (orden de bloqueos: acción → `pro_expense_state` → proveedor → perfil, igual que `pro_expenses_save`; OC no bloquea filas de proveedor), pero la espera era innecesaria porque nunca cambia la clave. | Corregido: `for no key update`. SQL aplicado 2 veces `ok`. |
| 3 | Baja (prueba) | `tests/e2e/pro-company.spec.ts:266-273` | Faltaba cubrir `empresa=` inválido y la ausencia del centro en `/dashboard/profesional`. | Agregado: `empresa=no-existe` cae en Contactos con `aria-current` (escritorio) o valor del selector (móvil); en Mi panel no hay botón «Centro de empresa» ni `[data-company-hub]` con `tab=pro_company`. Se espera a que cargue la lista antes de salir, porque WebKit informa como `pageerror` («due to access control checks») los fetch cortados por la navegación. |
| 4 | Baja (texto) | `src/components/pro/company-hub.tsx:159` | ES «Se aceptan comas y puntos y comas» sonaba forzado; EN «Commas and semicolons are both accepted». | Corregido: «Las columnas pueden ir separadas por coma o por punto y coma…» / «Columns can be separated by commas or semicolons…». |
| 5 | Info | `src/lib/pro/lead-inboxes.ts:40` | `parseLeadImportCsv` usa `parseCatalogCsv` con detección automática: la importación de solicitudes ahora también acepta archivos con «;». Los archivos con coma no cambian (los encabezados válidos no contienen «;»). La coma decimal solo aplica a artículos. Está cubierto por la spec (API de vista previa). | Aceptado (mejora documentada en `company-hub-local.md`). |
| 6 | Info | `src/lib/pro/catalog-import.ts:59` | Antes del cambio, el filtro de fórmulas al importar ya rechazaba `= + @` pero no `-`. No es explotable al reexportar porque `businessCsv` neutraliza `= + - @` y los espacios iniciales. | Sin cambio (ya existía). |
| 7 | Info | `company-vendors-local.sql:45-47` | «Pagado» de OC suma también las órdenes canceladas, pero una OC solo se cancela con pagado neto 0 (`purchase-orders-local.sql:411`), así que no hay doble conteo ni descuadre. | Verificado. |

## Verificado sin defectos

- **Aislamiento**: RLS activa sin políticas en las 3 tablas nuevas; `revoke` a `public/anon/authenticated`; las 6 funciones son `security invoker` (`prosecdef=false`), y solo `postgres` y `service_role` pueden ejecutarlas o leer las tablas (consulta a `pg_proc`/`pg_class` en loopback). Toda lectura y escritura filtra por `p_actor`. Un detalle, archivo o edición de otra cuenta da 404, y un cursor ajeno da 400. Los ids son por cuenta, como en Gastos.
- **API**: solo `development`; `X-Pro-Expected-Actor` (403); mismo origen en POST (403); cuerpo ≤16 KiB (413); `content-type` JSON obligatorio; 60 escrituras/min por cuenta; parámetros repetidos dan 400; zod estricto.
- **Disparador** `pro_company_vendor_supplier_touch` (AFTER UPDATE): no corre en el INSERT del upsert de Gastos; no hace nada si no cambian nombre, contacto o archivo; la escritura del directorio lo evita con `pro.company_vendor_write` local a la transacción. Corre como `service_role` (que tiene permisos de escritura sobre los perfiles). No cambia columnas ni contratos de Gastos. Los recibos e idempotencia de Gastos y OC no se tocan. Las specs de gastos y OC pasan.
- **Totales**: OC no canceladas = Σ(subtotal + impuesto) de las líneas, con `count(distinct)` (sin multiplicar por líneas); pagos − reversos; gastos solo CRC (`check(currency='CRC')`); todo en céntimos `bigint`; filtrado por dueño.
- **CSV**: BOM, comillas con separador adentro y comillas dobles; el separador se decide solo con el encabezado; si hay empate gana la coma, como antes; la coma decimal solo con «;» y nunca con miles; las importaciones existentes con coma siguen pasando (`pro-catalog-import` ya cubierto, `pro-leads-inboxes` en verde).
- **Hub**: `nav` con `role=group` por grupo y `aria-current="page"`; en móvil, `select` con `optgroup` y etiqueta; controles `min-h-11`; foco visible; los cambios pasan por `navigatePro` (respeta los guardas de borradores). Sin desbordamiento horizontal en 1366 px ni en el móvil WebKit.
- **Marketing E**: las tarjetas «Aún no disponible» explican la razón y no tienen botones de envío. No hay texto, marca ni nombres de Houzz en la interfaz (búsqueda de «houzz» en los 4 archivos: 0 resultados).

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json | grep -c 'error TS'` → 0.
- `npx eslint` sobre los 13 archivos del módulo y las 2 specs → limpio.
- `node $S/apply-one.mjs docs/pro/sql/company-vendors-local.sql docs/pro/sql/company-vendors-local.sql` → `ok` ×2.
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 108 SQL modules, 109 ordered steps, 149 dependencies…`.
- `pro-catalog-item-types` chromium-desktop: antes de la corrección, 1.ª corrida falló (`waitForResponse quote-create` 15 s) y 2.ª corrida falló («Gestionar trabajo» sin abrir, rutas frías); 3.ª corrida con las rutas calientes → passed. Después de la corrección → `--repeat-each=2` **2 passed (1.2m)**.
- chromium-desktop: `pro-company` **3 passed (2.0m)** y, tras los ajustes finales, **3 passed (1.2m)**. Regresión (`pro-catalog-item-types`, `pro-expenses`, `pro-expenses-english`, `pro-expense-write-recovery`, `pro-purchase-orders`, `pro-leads-inboxes`) → **12 passed, 1 failed (4.0m)**. El único fallo fue `ECONNRESET` en el precalentamiento de item-types; se corrigió con el reintento de red (ver arriba).
- webkit-mobile (las 7 specs): **11 passed, 5 failed (5.4m)**. Fallos:
  - `pro-company` es/en: `pageerror` de WebKit por un fetch cortado en el paso nuevo del hallazgo 3; se corrigió la spec;
  - `pro-expense-write-recovery` es/en: el mismo `pageerror` de WebKit (`/api/pro/expenses… due to access control checks`), sin cambios de datos;
  - `pro-purchase-orders` es: el diálogo de presupuesto no se abrió a tiempo.
  - Reintento en secuencia de `pro-company` + `pro-expense-write-recovery` + `pro-purchase-orders` → **7 passed (2.5m)**. Los 2 últimos son intermitentes del entorno (con WebKit y el servidor de desarrollo) y no tienen relación con el módulo.

## Capturas revisadas (Read)

- Escritorio 1366 px (`$S/qa-company/desktop/`): `vendors-list-es` (tabla, totales ₡11.300 · pagado ₡3.000 y ₡2.500 · pagado ₡1.000, «1 orden», «1 gasto»), `vendor-editor-en`, `templates-en`, `catalogs-es`.
- Móvil WebKit (`$S/qa-company/mobile/`): `vendors-list-en` (tarjetas, «No purchase orders or expenses recorded.»), `vendor-editor-es` (pantalla completa, pie fijo), `contact-form-es`.
- Nada cortado ni superpuesto, sin mezcla de idiomas. Detalle menor sin cambiar: en la tabla de escritorio el texto «₡2.500 · pagado ₡1.000» se parte en dos líneas. **→ Corregido (pulido P17).**

## Pendientes

- WebKit informa los fetch abortados por la navegación como `pageerror`. Las specs que navegan con lecturas en curso (por ejemplo `pro-expense-write-recovery`) pueden fallar de forma intermitente. Conviene un criterio común, como esperar `networkidle` antes de navegar, en vez de corregir spec por spec. **→ Corregido (pulido P15).**
- `pro-purchase-orders` [es] en webkit-mobile falló una vez y pasó al repetir. Hay que vigilarlo. **→ Vigilado en el pulido (ver corridas).**

---

# Pulido final — defectos, UX, accesibilidad e i18n (2026-11-11)

Solo checkout Pro local, sin commit/push/stash, sin envíos reales. Copias previas de cada archivo tocado en `$S/polish/backup/`. Capturas revisadas en `$S/polish/shots/{desktop,mobile}/`.

| # | Pendiente | Corrección | Prueba |
|---|---|---|---|
| P1 | Gastos: 409 al abrir «Nuevo gasto»/«Nuevo proveedor» con revisión vieja (debounce de 150 ms tras guardar o cambiar de vista) | `expenses-workspace.tsx`: el botón «Nuevo…» queda deshabilitado hasta que la lista de la vista y del refresco actuales cargó (`listKey`/`loadedKey`); el gasto nuevo adopta revisiones más nuevas mientras no guardó nada. Si igual hay 409 en un registro **nuevo** (otra pestaña), se lee la revisión actual y se avisa «Los datos cambiaron mientras completaba el formulario. Ya se actualizaron; revise y pulse «Guardar» de nuevo.»; todo lo escrito se conserva. Las **ediciones** mantienen el 409 (no se sobrescribe nada). La lista usa `AbortController` y descarta abortos. | Nueva `pro-expense-revision-race.spec.ts` (ES/EN): botón deshabilitado mientras la lista está retenida; primer guardado 200 con la revisión vigente; 409 real → mismo formulario 200 (estados `[200,409,200]`, 1 gasto con los datos escritos); edición con 409 conserva el conflicto. **Con el código anterior falla** (segundo guardado vuelve a 409). |
| P2 | Proyectos y Cotizaciones del proyecto: «Reintentar» tras fallar «Ver más» recargaba la página 1 | `projects-workspace.tsx` guarda el cursor fallido y reintenta ese mismo; el aviso sale al pie de la lista («No se pudieron cargar más proyectos.») y se conservan las filas. `project-estimates.tsx` igual (`retry` con `failedAfter`). | `pro-projects.spec.ts`: 503 en `after` → 20 filas, sin «Ver más»; Reintentar → 23 filas, dos peticiones con el **mismo** cursor y ninguna de página 1. |
| P3 | Proyectos: sin indicador al cambiar filtro | `role="status"` «Actualizando proyectos…», lista anterior atenuada con `aria-busy`. | La spec retiene la respuesta y comprueba texto y `aria-busy`. |
| P4 | Tarjeta móvil con `aria-label` que ocultaba el contenido | Sin `aria-label`; prefijo `sr-only` «Abrir proyecto:» + contenido visible. | `toHaveAccessibleName(/^Abrir proyecto: Remodelación de cocina\s*En curso\s*Bruno Mora/)` en móvil. |
| P5 | Cantidad «1.000» ambigua | `allowances.ts`: `normalizeQuantityInput` (ES: «.» de miles como en colones; EN: «,» de miles), `quantityToInput` (sin ceros de relleno, coma decimal en ES) y `formatQuantity`. Usado en OC (edición, recepción, vista previa), Selecciones, Montos previstos y en las cantidades de solo lectura de borrador de factura, complementos de cotización, cambios solicitados y servicios frecuentes. | Nueva `pro-quantity-input.spec.ts` (ida y vuelta por idioma); `pro-purchase-orders`: valores de edición/recepción `12,5` (ES) / `12.5` (EN) — **cambio intencional** de la expectativa anterior `12.5`; `pro-invoice-drafts`: «Material original · 1,5» (antes `1.5`, intencional). |
| P6 | Total de Proyectos con búsqueda | «23 proyectos en total · la búsqueda solo filtra la lista». | Spec. |
| P7 | Contraste de encabezados | `#52627a` en tabla de Proyectos y títulos de Cotizaciones del proyecto. | Captura. |
| P8 | Bienvenida sin título visible | Encabezado visible «Mensaje de su profesional» y `aria-labelledby`. | `pro-client-dashboard.spec.ts`: heading y región con ese nombre. |
| P9 | `recipient_name … limit 1` sin orden | `order by ar.updated_at desc, ar.id desc`. SQL aplicado 2 veces (`ok`). | `pro-client-dashboard` en ambos proyectos. |
| P10 | «Final (opcional)» | «Fin (opcional) · hora de Costa Rica». | — |
| P11 | Archivar partida con extra pendiente sin aviso | El diálogo de archivar agrega el mismo aviso que reabrir. | `pro-allowances.spec.ts` (se cancela con «Volver»). |
| P12 | `tablist` sin `tabpanel` (Selecciones, OC) | `role="group"` + `aria-pressed` (conmutador segmentado). | Specs: `aria-pressed` y 0 `tablist`. |
| P13 | Registrar entrega/pago marcaba sucio al abrir | Lo precargado es el estado inicial. | `pro-purchase-orders`: «Resumen» habilitado al abrir, deshabilitado tras editar. |
| P14 | Pie de la copia de OC | «… ni un comprobante de pago» / «… or proof of payment». | — |
| P15 | Criterio común WebKit para fetch cancelados por navegación | `tests/e2e/helpers.ts`: `collectPageErrors(page)` y el mismo filtro en `installRuntimeGuards`; `isNavigationCancellation` admite `net::ERR_ABORTED`, `NS_BINDING_ABORTED`, `Load request cancelled` y `cancelled`. Solo se ignora el texto exacto «… due to access control checks.» de una URL **del mismo origen** y si la petición falló como cancelada o hubo una navegación del marco principal entre 1 s antes y 5 s después. Funciona también con el formato partido que entrega Playwright («/host:puerto/ruta due to …»). Usado en `pro-expense-write-recovery`, `pro-expense-revision-race`, `pro-projects`, `pro-company`. En producto: abortos de la lista de Gastos por desmontaje/cambio no generan error. | Nueva `pro-runtime-navigation-cancel.spec.ts` (chromium y webkit, ×3): fetch cortado por recarga no cuenta; excepción y rechazo reales sí; error CORS real (otro origen) sí; mismo texto de otro origen o fuera de la ventana sí. En webkit, `pro-company` falló antes con «/127.0.0.1:3185/api/pro/catalog?… due to access control checks.» (navegación de `gotoOK`) y pasa con el filtro. |
| P16 | Prueba frágil de Cronograma | La ruta falla todos los GET hasta pulsar Reintentar. | `pro-project-schedule` en ambos proyectos. |
| P17 | «₡2.500 · pagado ₡1.000» partido en escritorio | Tabla: total y «Pagado ₡…» en líneas propias `whitespace-nowrap`; las tarjetas móviles no cambian. | `pro-company.spec.ts`: cada línea ocupa un solo renglón (`getClientRects`). |

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → 0 errores. ESLint de los 28 archivos tocados → 0 problemas.
- `node $S/apply-one.mjs docs/pro/sql/client-dashboard-local.sql docs/pro/sql/client-dashboard-local.sql` → `ok` ×4 (dos corridas). Manifiesto → `PASS: 108 SQL modules, 109 ordered steps, 149 dependencies…`.
- chromium-desktop, bloque 1 (8 specs: navigation-cancel, quantity-input, expense-revision-race, expense-write-recovery, expenses, expenses-english, projects, company) → **13 passed (4.2m)**.
- chromium-desktop, bloque 2 (11 specs: purchase-orders, selections, allowances, client-dashboard, project-schedule, job-workspace, invoice-drafts, quote-choices, quote-change-requests, service-packages, service-packages-english) → 15 passed, 3 failed. `pro-invoice-drafts`: expectación `1.5` → `1,5` (intencional, P5); repetida → 1 passed. `pro-service-packages` ES/EN fallan en la línea 40/42 (clic en «Archivar») **también con `service-packages.tsx` original** → fallo previo, no causado aquí.
- webkit-mobile, bloque 1 → 10 passed, 3 failed: `pro-company` ES/EN por el pageerror de WebKit (motivó el ajuste de P15) y la sonda CORS (espera reforzada). Tras el ajuste: sonda ×3 en ambos proyectos → 3 passed / 3 passed.
- webkit-mobile, bloque 2 + `pro-company` → **18 passed, 1 failed**: `pro-invoice-drafts` falla en la línea 34 (no aparece el diálogo de sesión) **también con `invoice-draft.tsx` original** → fallo previo de WebKit, no relacionado.

## Quedan

- `pro-service-packages*` (chromium) y `pro-invoice-drafts` (webkit) fallan igual con los archivos originales: hay que revisarlos aparte. **→ Resuelto (estabilización E1 y E2).**
- Observaciones marcadas «Pendiente» o «Justificado» arriba: requieren decisión de producto, contrato SQL/API nuevo o son nativas de WebKit.

---

# Estabilización — fallos previos y pendientes del pulido (2026-11-11)

Solo checkout Pro local, sin commit/push/stash, sin envíos reales. Copias previas de cada archivo tocado en `$S/stab/backup/` (misma ruta relativa; `S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`). Capturas revisadas en `$S/stab/shots/`. Sin SQL nuevo (los dos códigos de error nuevos se resuelven en las rutas API).

| # | Tema | Causa raíz / decisión | Corrección | Prueba |
|---|---|---|---|---|
| E1 | `pro-service-packages*` fallaban en «Archivar» | **Prueba obsoleta.** «Archivar»/«Restaurar» viven desde el 8-nov en el menú «···» compartido (`CardActionsMenu`, `menuitem` en un portal de `body`), no como botón de la tarjeta. Igual con el `service-packages.tsx` original. | Las specs abren «Acciones del servicio frecuente» / «Frequent service actions», exigen que el menú tenga exactamente ese único ítem y lo pulsan. Ninguna aserción se quitó. | ES/EN pasan en chromium y webkit. |
| E2 | `pro-invoice-drafts` webkit (línea 34) | **Defecto de producto + entorno.** (a) Producto, `dashboard/profesional/page.tsx`: si `get_my_profile` llegaba antes que `professionals`, `cacheDashboardBootstrap({profile})` creaba una foto `{pro:null}`; para una cuenta con ficha pero metadatos sin `is_provider` (metadatos atrasados) esa foto se aceptaba, apagaba el cargador y el guardia de seguridad la mandaba a `tab=sent_projects&mode=use` («Mis proyectos»). Traza: la fila de `professionals` sí llegaba (200, 2 KB) y aun así se redirigía. (b) Entorno: el servidor de desarrollo se detiene varios segundos al compilar rutas frías; `session-mfa` supera los 8 s y aparece «No pudimos verificar la sesión». | (a) La foto solo se crea cuando la ficha se consultó; un perfil adelantado espera en un ref y se une cuando llega `pro`. (b) La spec usa `stabilizeLocalProRuntime`, precalienta las 25 rutas que toca, espera la carga inicial 60 s y, tras cada navegación/recarga, aplica la misma tolerancia a la pantalla de recuperación de sesión que ya tenía la línea 34 (pulsa «Reintentar», que es el camino del producto). Ninguna aserción de contenido cambió. | Webkit: antes falla en 34; después pasa. Chromium pasa. |
| E3 | Botón «Editar» del pie del trabajo | Decisión: el pie se queda (es la acción del trabajo en todas sus vistas), pero en el trabajo se llama **«Editar trabajo» / «Edit job»**; clientes y productos siguen con «Editar». Evita confundirlo con editar la cotización o la vista del cliente, sin ocultar nada. | `business-panel.tsx` (solo el texto del fallback cuando hay `appointment`). | Specs actualizadas de forma equivalente (mismo botón, nombre nuevo exacto): `pro-agenda-operations` (2), `pro-job-workspace`, `pro-manual-lead-work-journey` (2), `pro-daily-log-footer` (6 del trabajo; las 2 del cliente siguen con «Editar»), `pro-forms-ux`, `pro-navigation` (1 del trabajo; la del cliente sigue). |
| E4 | Vínculo obsoleto al editar una OC | Decisión conservadora: **no se cambia ningún dato guardado sin que el usuario lo decida.** El `<select>` muestra «Vínculo anterior (ya no disponible)» con `aria-invalid` y un aviso; al guardar sin cambiarlo se bloquea en el cliente con un mensaje claro (antes: 400 genérico). Elegir otro vínculo o «Sin vínculo» guarda normal. | `work-purchase-orders.tsx` (`staleLink`, copy ES/EN). | `pro-purchase-orders`: monto previsto archivado → opción y aviso visibles, «Guardar cambios» no envía nada (0 POST) y muestra el mensaje; con «Sin vínculo» 1 POST, 200 y `allowance_id` nulo en la base. |
| E5 | «Detener» en Horas con trabajo cancelado o cliente archivado | Nuevo código de API `inactive_job` (400). La ruta, solo ante 22023 en `stop`/`start`/`manual`, lee el estado del trabajo y del cliente del propio dueño. Mensajes: «No se registraron las horas: este trabajo está cancelado o su cliente está archivado. Si el cliente está archivado, restáurelo para registrarlas; si no, descarte el cronómetro.» / EN equivalente; variante para agregar horas. No promete «reactivar» el trabajo porque una cita cancelada no se reabre. | `api/pro/time-tracking/route.ts`, `time-tracking.tsx`. | `pro-time-tracking`: trabajo sin reserva cancelado → `stop` y `manual` dan `{code:'inactive_job'}`; cliente archivado → `stop` igual; otros 400 siguen sin código; UI con cliente archivado: alerta exacta, cronómetro visible, «Descartar» funciona y Costos no cambia. (Una cita reservada ya iniciada no se puede cancelar: lo impide el disparador de citas.) |
| E6 | Completar desde Lista/Centro de tareas un pendiente con foto obligatoria | Nuevo código `photo_required` (400) en `work-tasks` cuando el disparador `pro_work_punch_photo_guard` rechaza. `continueWorkTaskWrite` lo expone como `reason`. Mensajes: Lista «Este pendiente exige una foto. Agréguela en Pendientes finales antes de completarlo.»; Centro de tareas «… Agréguela dentro del trabajo, en Pendientes finales, …» (EN equivalentes). | `api/pro/work-tasks/route.ts`, `lib/pro/work-task-recovery.ts`, `work-tasks.tsx`, `task-center.tsx`. | `pro-project-schedule`: API devuelve exactamente `{error,code:'photo_required'}`; UI Lista muestra la alerta exacta y la tarea sigue abierta. El lote del Centro de tareas conserva su mensaje genérico de lote (no se tocó su formato persistido). |
| E7 | Fecha límite en el Gantt | Decisión: se dibuja como marca vertical al final del día límite (rombo arriba), roja si el plan termina después de la fecha límite o si está vencida; la etiqueta accesible de la barra y la vista Lista dicen «Fecha límite: …» y «Termina después de la fecha límite». «Vencida» ahora es: abierta y (fin previsto pasado **o** fecha límite pasada); solo amplía el caso anterior. El rango del gráfico incluye las fechas límite de tareas planificadas. | `project-schedule.tsx`. | `pro-project-schedule`: 2 marcas; B (+3…+8, límite +6) «tarde» con el texto en `aria-label` y en la Lista, y la marca cae dentro de su barra; A (límite ayer) «Vencida». |

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → 0 errores. ESLint de los 10 archivos de producto y 12 specs tocados → 0 problemas.
- SQL: no se tocó (manifiesto sin cambios).
- chromium-desktop (en secuencia): `pro-service-packages` + `-english` → **2 passed (1.8m)**. `pro-purchase-orders` ES/EN → 2 passed. `pro-time-tracking` + `pro-project-schedule` ES/EN → **4 passed (5.3m)** (la primera corrida tuvo fallos de la propia prueba nueva —una cita reservada iniciada no se puede cancelar; la marca de A también es «tarde»— y un timeout de compilación; corregidos). Bloque `pro-invoice-drafts`, `pro-task-center`, `pro-work-tasks`, `pro-job-workspace`, `pro-agenda-operations`, `pro-daily-log-footer`, `pro-manual-lead-work-journey` → 18 passed, 5 failed: 3 por nombres «Editar» del trabajo que faltaba actualizar (agenda-operations, forms-ux, navigation) y el resto páginas en blanco/esperas del servidor; repetidos con `pro-forms-ux` y `pro-navigation` → **11 passed, 1 failed** (`pro-navigation`, ver abajo).
- webkit-mobile (PLAYWRIGHT_WEBKIT=1): `pro-service-packages*`, `pro-time-tracking`, `pro-purchase-orders` → 6 passed; `pro-project-schedule` ES/EN + `pro-invoice-drafts` → **3 passed (2.0m)** al repetir (primera vez: timeout de 15 s en la primera API y `ECONNRESET`, del servidor). `pro-task-center`, `pro-work-tasks`, `pro-job-workspace`, `pro-agenda-operations`, `pro-daily-log-footer`, `pro-manual-lead-work-journey`, `pro-forms-ux`, `pro-navigation` → **24 passed, 1 failed** (`pro-navigation`).
- Capturas revisadas (Read): `$S/stab/shots/mobile/schedule-gantt-day-es-mobile.png` (marca roja de fecha límite en «Demolición», barra «Vencida», pie «Editar trabajo»), `tasks-photo-required-es-mobile.png` (alerta legible, la tarjeta conserva su «Editar» y el pie dice «Editar trabajo»). Sin cortes ni superposiciones.

## Quedan

- `pro-navigation.spec.ts:45` falla en chromium y webkit al volver a Inicio y buscar el botón «Clientes» (pantalla en blanco). **Fallo previo:** falla igual con `business-panel.tsx`, `dashboard/profesional/page.tsx` y la spec originales (A/B en chromium, mismo punto). La parte que cubre «Editar trabajo» (línea 41) pasa. Hay que revisarlo aparte.
- El servidor de desarrollo (≈5,7 GB de RSS, memoria libre del equipo muy baja) se detiene varios segundos al recompilar; varias corridas necesitaron repetirse. No se reinició (no murió).
- El lote del Centro de tareas sigue mostrando su mensaje genérico de lote cuando una tarea exige foto (el formato persistido del lote no se tocó).

# Fase 2 (2026-11-11)

Integración de `src/` de siete módulos con fase 1 lista. Solo checkout Pro local (`local/pro-suite-no-push`), sin commit/push/stash/merge, sin envíos ni cobros. Supabase solo loopback. `S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`. Respaldos de cada archivo antes de tocarlo en `$S/phase2-backup/` (`00-original/` y uno por paso: `01-credits` … `07-file-versions`, `08-fixes*`, `09-docs`). Registros de corrida en `$S/phase2-logs/`, capturas en `$S/phase2-shots/<perfil>/<spec>/` (129). `docs/test-selection-policy.md` no existe en el repositorio (se usó la política de AGENTS.md y el patrón de la regresión del 11-nov).

## Aplicación (orden obligatorio)

| # | Módulo (fila) | Script | Ajustes |
|---|---|---|---|
| 1 | Créditos y anticipos (50) | `credits-draft/apply-phase2.mjs` (`--dry-run` OK) | Guarda propuesta integrada como `docs/pro/sql/credits-retainers-guard-local.sql` + manifiesto (3 dependencias) y aplicada; `credits-retainers-local.sql` excluye `pro_credit_existing_guard` de la concesión a `service_role`. |
| 2 | Mediciones (66) | `takeoffs-draft/apply-phase2.py` (no tiene `--dry-run`: se simuló sobre copia en `$S/takeoffs-dry/`) | **+1 a mano** en `pro-job-workspace.spec.ts` (14→15) y aserción del botón «Mediciones/Measurements». Dos avisos de ESLint corregidos (`no-unused-expressions`, `<img>` privado). |
| 3 | Tableros de ideas (61) | `moodboards-draft/apply-phase2.mjs` | SQL reaplicado: `client-dashboard-local.sql` ×2 y `mood-boards-local.sql` ×2. |
| 4 | Contratos (40) | `contracts-draft/apply-phase2.mjs` | SQL: `client-dashboard-local.sql` ×2, `contracts-local.sql` ×2 y `mood-boards-local.sql` otra vez. |
| 5 | Licitaciones (53) | `bids-draft/apply-phase2.mjs` | `job-workspace.tsx` y `business-panel.tsx` idénticos a `$S/bids-draft/chain/final/`; la spec difiere solo por el +1 de mediciones. |
| 6 | Notas y detalles | `notes-details-draft/apply-phase2.mjs` | — |
| 7 | Versiones de archivos (30) | `file-versions-draft/apply-phase2.mjs` | — |

Ninguna ancla falló. Conteo final del menú del trabajo: **18** botones en el espacio Pro independiente (13 + créditos + mediciones + tableros + contratos + licitaciones) y **7** en el panel embebido; Notas y Detalles van en la barra superior (2 botones), comprobado por `pro-job-workspace` con `PRO_INDEPENDENT=1` y sin él en ambos perfiles.

## Correcciones durante las pruebas

| Tema | Causa | Corrección |
|---|---|---|
| Borrar la cuenta fallaba con licitaciones o detalles de proyecto (23503, «Database error deleting user»; las cuentas desechables quedaban) | **Producto (SQL).** FK sin acción hacia `pro_expense_suppliers` / `pro_bid_invitations` / `pro_project_types` con dos caminos de cascada desde el usuario en la misma sentencia | FKs `deferrable initially deferred` en `bids-local.sql` y `project-notes-details-local.sql` (la regla sigue: se verifica al confirmar). Reaplicado ×2; pruebas SQL de fase 1: bids 47/47 PASS iguales, notas `ALL PASS`. Las 3 cuentas que quedaron se borraron en loopback (0 restantes). |
| Licitación: el detalle no mostraba las partidas antes de la primera oferta | **Producto.** La lista solo existía dentro de la comparación | Sección «Partidas por cotizar / Items to quote» en el detalle cuando aún no hay ofertas. |
| Créditos: al volver a «Todos» se veía «Todavía no hay anticipos» con el contador en 1 | **Producto.** Se pintaba la lista del filtro anterior con el texto del filtro nuevo | Mientras carga un filtro distinto se muestra «Cargando créditos…»; el texto vacío usa el filtro con el que se cargó la lista (captura móvil EN lo confirma). |
| Mediciones: casilla «incluir» de 20 px | **Producto (táctil).** | Etiqueta de 44 × 44 alrededor de la casilla, sin cambiar el diseño. |
| Tableros (cliente): «versión» y su número partidos en dos líneas | Texto | Espacio no separable. |
| `pro-takeoffs`: exigía rechazar «sin escala» después de calibrar la página | **Spec.** La medición previa queda valorada al calibrar (correcto) | La comprobación de rechazo se hace antes de calibrar; después se exige `needsScale:false`. |
| `pro-contracts` | **Spec.** «No es una firma…» empieza en mayúscula; tras recargar el expediente seguía en «Vista del cliente» | Regex sin distinguir mayúsculas; volver a «Contratos» tras recargar. |
| `pro-bids` | **Spec.** Dos `status` a la vez (aviso + carga del detalle); dos `dialog` (expediente + confirmación) | Filtro por texto; `.last()` para la confirmación. |
| `pro-mood-boards` webkit | **Spec.** En el teléfono el lienzo quedaba fuera de vista y la nota girada tapaba la esquina | `scrollIntoViewIfNeeded` y punto de agarre visible de la propia foto (`elementFromPoint`); la aserción de movimiento no cambia. |
| `pro-project-deeplink` / `pro-project-read-lifecycle` webkit | **Entorno.** WebKit informa fetch del mismo origen cancelados por recarga («… due to access control checks») | Usan `collectPageErrors` de `helpers.ts` (solo ignora ese mensaje exacto, mismo origen, tras navegación). |

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → **0 errores** (los 9 de las specs de créditos/mediciones desaparecieron tras los pasos 1 y 2). ESLint de los 41 archivos de producto (lib, rutas y componentes) y 10 specs tocados → 0 problemas.
- SQL de créditos: `credits-retainers-test.sql` → `ALL CREDIT ASSERTIONS PASSED`; `guard-test.sql` → sin guarda −60 000, con guarda `22023` / `no error`. 2 triggers `pro_credit_existing_guard` en la base.
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 116 SQL modules, 117 ordered steps, 195 dependencies, guard/repeat contracts and negative cases; offline only.`
- **chromium-desktop** (resultado final de cada spec): `pro-credits-retainers` 2/2, `pro-takeoffs` 2/2, `pro-mood-boards` 2/2, `pro-contracts` 2/2, `pro-bids` 2/2, `pro-project-notes-details` 2/2, `pro-file-versions` 3/3, `pro-job-workspace` 2/2 y 2/2 (`PRO_INDEPENDENT=1`). Relacionadas: `pro-client-dashboard`, `pro-invoice-{beverages,detail,drafts,extras,management,payments,preparation,tax}`, `pro-purchase-orders`, `pro-work-files`, `pro-work-files-headers`, `pro-projects`, `pro-project-{card-style,deeplink,journey,planning,read-lifecycle,schedule}` → todas pasan. `pro-invoice-recurrence` falla (falta el campo «Nombre del servicio frecuente» en el diálogo): **fallo previo**, ya listado en `regression-2026-11-11-local.md`.
- **webkit-mobile** (`PLAYWRIGHT_WEBKIT=1`): las 7 specs nuevas pasan (`pro-mood-boards` tras el ajuste de la spec), `pro-job-workspace` 2/2 y 2/2 independiente, mismas relacionadas en verde. Repetidas por entorno con servidor reiniciado: `pro-invoice-management` (timeout 15 s de la primera API) → 1/1; `pro-work-files` y `pro-job-workspace` (recompilación HMR mientras se corregía `work-takeoffs.tsx`, página en blanco) → 3/3 y 2/2. `pro-invoice-recurrence` falla igual que en escritorio (previo).
- Servidor 3185 reiniciado 4 veces (RSS > 5 GB o chunk obsoleto «Invalid or unexpected token»); log en `$S/dev-3185.log`.

## Capturas revisadas (Read)

Escritorio: créditos lista/detalle ES y EN (₡1.500, «11 nov 2026», tabla de 8 columnas sin desborde), tableros editor ES y cliente EN, mediciones visor ES y cotización EN, contratos editor/cliente aceptado ES, licitación formulario ES (12,5 con coma), centro de Proyectos ES (color, código, tipo, etiquetas, filtros), detalles ES, notas EN, versiones de archivo ES. Móvil (WebKit): créditos lista EN (pestañas 2 × 2, «Cargando créditos…»), mediciones visor y envío ES (botones ≥ 44 px, «7,5 m», «69 m²»), comparación de licitación ES (₡118.750, «Más bajo»), detalles ES (casillas con etiqueta `min-h-11`), versiones móvil ES. Sin desbordes horizontales (todas las specs llaman `expectNoHorizontalOverflow`).

## Quedan

- `pro-invoice-recurrence` (previo, fuera de esta fase).
- Selector nativo de archivo muestra «Choose File / No file chosen» según el idioma del navegador (mismo comportamiento que Archivos existente).
- La etiqueta compartida «Tarifa general 13%» (`invoice-tax.ts`) no usa «13 %» en ES; no se tocó por ser texto compartido con facturación.
- Paridad visual con Houzz no evaluada (solo funciones y recorridos). El IVA predeterminado del proyecto todavía no se aplica a borradores nuevos (documentado en el módulo).
- Otras tablas antiguas podrían tener el mismo patrón de FK sin acción con doble cascada; solo se corrigieron las de esta fase.

# Corrección de fallos persistentes (2026-11-12)

Corrector sobre el triage de 44 specs (`$S/triage/persistent-failures-triage.md`, partes 1–4). Solo checkout Pro local (`local/pro-suite-no-push`); sin commit, push, stash, merge, ramas ni envíos. No se revirtió nada de fase 2. Respaldos previos: producto en `$S/fix-backup/*.orig`, specs en `$S/fix-backup/specs/`. Corridas serializadas con `$S/fix-run.zsh` / `$S/fix-run2.zsh` (cola FIFO, reinicio del servidor 3185 si RSS > 5,5 GB); logs en `$S/fix-logs/`, artefactos en `$S/fix-out/`.

## Defectos de producto corregidos

| # | Defecto (triage) | Archivo | Corrección | Evidencia |
|---|---|---|---|---|
| B1 | «Cerrar diálogo» de 32 px | `private-estimate-editor.tsx`, `private-estimate-preview.tsx`, `private-estimate-publication-review.tsx`, `work-accepted-estimate.tsx`, `discount-presets.tsx` | `import {ProModal as Modal} from './modal'` (44 px, `ariaLabel`, `manageFocus`). `ui/modal.tsx` no se tocó, así que los demás usos no cambian. | `pro-modal-localization-journey` 6/6 en ambos perfiles; captura de «Cotización aceptada» revisada sin cambios de diseño. |
| B2 | «Administrar canales» sin nombre accesible ni foco gestionado | `lead-origin-channels.tsx` | Migrado a ProModal (`aria-label` = título, Escape pasa por la guarda del borrador). | Misma spec: `dialog` «Administrar canales» con nombre, guarda conservada. |
| B3 | «Abrir cliente existente» abría «Nuevo cliente» + «¿Descartar cambios?» | `business-panel.tsx` | `openEdit(id, fromIdentification)`: sin confirmación solo si el único dato escrito a mano es la identificación (se ignoran los campos autocompletados por la consulta). Con texto manual sigue pidiendo confirmación. | `pro-client-identification` 2/2 en ambos perfiles, con caso nuevo: nombre escrito → aparece «¿Descartar cambios?», «Seguir editando» conserva el nombre y `editar=new`. |
| B5 | El foco no volvía a «Presupuesto» al cerrar en WebKit; tampoco a «Revisar versión aceptada» (cualquier navegador) | `src/lib/modal-focus.ts` | Se recuerda el último control presionado (`pointerdown`). Se usa como disparador cuando `activeElement` es `body` (WebKit no enfoca botones al hacer clic) o es el diálogo padre gestionado que recuperó el foco porque el botón se deshabilitó mientras cargaba. Lo confirmó una sonda: el foco terminaba en el `div` del expediente. | `pro-modal-localization-journey` 6/6 en webkit-mobile y en chromium-desktop. |
| B6 | «Trabajos y saldos» ausente hasta que llegaba la lista | `business-panel.tsx` | Se quitó `&& accountId` del montaje de `ClientOperations` (clave `operations:<cuenta‖pending>:<cliente>`). La recuperación sigue esperando la cuenta (`client-operations.tsx:57`). | `pro-client-recovery-scope` 2/2 en ambos perfiles, sin aviso falso ni lecturas de almacenamiento antes de la cuenta. |
| B4 | Salto de 8/52 px de «Comprobar guardado» en la bitácora | `daily-log-files.tsx` | Mientras no llega el contexto privado, el dueño ve «Desde biblioteca» deshabilitado (`aria-busy`, `data-daily-log-library-pending`), que reserva el hueco. | `pro-daily-log-file-reconcile` 6/6 en ambos perfiles (aserción < 2 px sin tocar). |
| e | `pro-invoice-recurrence`: faltaba «Nombre del servicio frecuente» | — (spec) | **Spec desactualizada, no defecto.** La spec (7 nov) mezclaba textos de servicios frecuentes con la recurrencia; el componente (10 nov) usa «Nombre de la plantilla», «Guardar plantilla», «Editar plantilla» y «Editar plantilla recurrente», igual que el resto de la spec («Nueva plantilla recurrente», «Pausar plantilla»). | 1/1 en ambos perfiles. |

No se corrigió (fuera de alcance, se documenta): tras un conflicto de revisión en Inventario el editor queda en «Guardando…» deshabilitado (`catalog-workspace.tsx`, `inventoryNotReady` por revisión obsoleta) y «Cerrar» no responde hasta recargar. El aviso «Recargue…» lo explica; la spec ahora lo afirma de forma explícita.
Durante las pruebas aparecieron dos defectos de producto **nuevos** que el triage no listaba. No se corrigieron (fuera del alcance de esta pasada); bloquean dos specs en WebKit:

- **N1. «Preparar visitas» dentro de `/dashboard/pro` pierde la guarda de cambios sin guardar.** Con «Tiempo entre visitas» modificado, «Volver» cierra el diálogo en vez de avisar «Guarde o cancele…». El mismo recorrido en `/dashboard/profesional?tab=pro_tools` sí avisa (lo confirmó una sonda temporal, ya borrada). Revisar `useProChildGuard` (`visit-preparation.tsx`), el diálogo de `simple-workspace.tsx` y `closeProStep`/`backPro` en `pro-space.tsx`. Bloquea `pro-tools-profile-menu` (webkit, ES y EN).
- **N2. En la app nativa, el `<main>` del espacio Pro tapa su propio encabezado.** La regla de `globals.css` (~l. 395) `body.ccr-native-app.ccr-native-bottom-nav-visible:not(.ccr-native-search-route) main {position:fixed; top:var(--ccr-native-header-height)}` también se aplica al `<main>` de `pro-space.tsx`, y «Volver a Mi panel» no recibe el clic. Bloquea `pro-native-section-scroll` (webkit, ES y EN).

## Specs desactualizadas (A) y de entorno (C)

Ninguna aserción de intención se borró ni se debilitó. Cuando una ya no aplicaba por diseño, se reemplazó por la equivalente actual y se dejó un comentario en la spec.

**Helpers compartidos** (al final de `tests/e2e/helpers.ts`): `PRO_SPACE_HOME_URL`, `proSpaceUrl(tab)`, `proSpace`, `proSpaceTitle` (h1 del encabezado propio), `proHubButton` (botón dentro de `[data-pro-tools]`, sin chocar con el menú lateral), `proSpaceBack` («Volver»/«Volver a Mi panel», el mismo contrato que `headerBack` de `pro-navigation`), `openProSpaceFromPanel` y `warmLocalRoutes`. Este último precalienta rutas en frío y exige estado < 500.

**Ojo:** `warmLocalRoutes` se debe llamar solo con rutas del idioma de la prueba, porque una petición a `/en/...` fija `NEXT_LOCALE` en el contexto. Así se rompió `pro-notifications-read-failure` (es) en una corrida intermedia.

**Cambios por grupo:**

- **Espacio Pro independiente** (simplified-navigation, billing, sales-workspace, section-scroll, native-section-scroll, tools-profile-menu, header-parity, panel-state, access-loading, client-english):
  - URLs `/dashboard/pro`, h1 «Inicio»/«Overview» y regreso con `proSpaceBack`.
  - Hub de 14 filas (4/2/8); se actualizó `docs/pro/tools-profile-menu-local.md`.
  - La campana se busca por su nombre.
  - En escritorio, el título es el h2 del panel.
  - Las cuatro specs de contrato solo móvil ya se saltaban en escritorio con su `test.skip` previo; no se agregó ninguno.
- **Textos renombrados:**
  - «Cerrar diálogo» (discount-presets).
  - Plantilla de recurrencia (invoice-recurrence).
  - «Editar trabajo» (private-estimates-journey).
  - «Productos y servicios» (usability, panel-ux).
  - En quote-ux y scoped-panels el heading de la tarjeta es el título de la cotización y el cliente va como subtítulo.
  - Identificación al inicio del formulario, con consulta simulada (panel-ux).
  - «Editar disponibilidad del día» (reservations).
- **Vistas del expediente:**
  - service-journey y client-english usan la vista «Costos y pagos» con `vistaTrabajo=costs`.
  - En scoped-panels, la cita guardada abre su detalle «Borrador aislado».
  - En reservations, la reserva se ve como tarjeta de la lista única (filtro «Todas») y el calendario está dentro de `<details data-availability-secondary>`.
- **Recuperación durable** (work-delivery, work-delivery-english, delivery-photo-reload, work-write-reload):
  - Los botones de recuperación son ahora «Comprobar subida» y «Comprobar guardado».
  - Las dos auditorías que fallaban a propósito (delivery-photo-reload, work-write-reload) verifican ya el comportamiento corregido: `expect.soft` pasan a estrictas, con un solo `actionId`, una fila y un objeto, y `toBeEnabled` reemplaza a `retry.count()`.
- **Contratos nuevos:**
  - local-integration:
    - El fallo inyectado pasa de `quote-link` a `quote-create`, porque la creación ahora es atómica; exige **exactamente 1** cotización.
    - La cita creada desde una cotización abre el trabajo guardado.
    - La agenda filtra con `estadoCitas`.
    - `/dashboard/pro` es el espacio propio y ya no redirige a la agenda.
  - direct-quote-write-recovery lee el recibo en `/api/pro/lead-private-quotes?view=action`.
  - catalog-storage:
    - Tras un conflicto, el editor queda bloqueado («Guardando…» deshabilitado) hasta recargar.
    - Después de recargar se comprueba que el borrador se conservó.
    - Se responde «¿Descartar cambios?».
- **Medición y alcance:**
  - modal-localization-journey mide el span visible del botón, no el indicador de carga oculto.
  - modal-keyboard-boundary solo corre con ancho ≤ 640 px.
- **Entorno (C):**
  - Se agregó `stabilizeLocalProRuntime` en notifications-read-failure, client-write-recovery, direct-project-quote-recovery, profile-routes-local, appointment-login, project-deeplink, access-loading, service-package-write-recovery, visit-preparation(-english) y task-center-actions.
  - Se precalientan las rutas API en frío (identity-lookup, daily-log-files/reconciliation, service-packages, invoice-drafts, `/dashboard/pro/equipo`, login, …).
  - client-write-recovery usa `gotoOK` para reintentar una vez la navegación tardía de WebKit, y `collectPageErrors` para ignorar solo el fetch del mismo origen cancelado por esa navegación.
  - En usability, `listReturned` se marca cuando llega la respuesta.

## Resultado por spec (antes → después)

Antes = triage del 11-nov (aislamiento). Después = última corrida aislada del 12-nov con `fix-run*.zsh` (workers 1, servidor 3185). «skip» = contrato solo móvil: el `test.skip` de escritorio ya existía antes (el «passed» del 11-nov en chromium eran saltos).

| Spec | Cat. | chromium-desktop | webkit-mobile |
|---|---|---|---|
| pro-simplified-navigation | A | falla → pasa | falla → pasa |
| pro-access-loading | A/C | falla 2/2 → pasa 2/2 | falla 1/2 → pasa 2/2 |
| pro-billing | A | falla → pasa | falla → pasa |
| pro-sales-workspace | A | falla → pasa | falla → pasa |
| pro-client-english | A | falla 2/2 → pasa 2/2 | falla 2/2 → pasa 2/2 |
| pro-section-scroll | A | skip previo (contrato móvil) | falla 2/2 → pasa 2/2 |
| pro-native-section-scroll | A + N2 | skip previo (contrato móvil) | falla 2/2 → **falla 2/2 (N2)** |
| pro-tools-profile-menu | A + N1 | skip previo (contrato móvil) | falla 2/2 → **falla 2/2 (N1)** |
| pro-header-parity | A | skip previo (contrato móvil) | falla 2/2 → pasa 2/2 |
| pro-panel-state | A | pasa 2/2 → pasa 2/2 | falla 2/2 → pasa 2/2 |
| pro-team | C | falla 1/6 → pasa 6/6 | pasa 6/6 → pasa 6/6 |
| pro-tool-form-layout | C | falla 1/2 → pasa 2/2 | intermitente → pasa 2/2 |
| pro-usability | C/A | falla → pasa | falla → pasa |
| pro-scoped-panels | A | falla → pasa | falla → pasa |
| pro-quote-ux | A | falla → pasa | falla → pasa |
| pro-client-identification | B3 | falla 2/2 → pasa 2/2 | falla 2/2 → pasa 2/2 |
| pro-client-recovery-scope | B6 | falla 2/2 → pasa 2/2 | falla 2/2 → pasa 2/2 |
| pro-catalog-storage | A | falla → pasa | falla → pasa |
| pro-discount-presets | A | falla → pasa | falla → pasa |
| pro-invoice-recurrence | A (e) | falla → pasa | falla → pasa |
| pro-panel-ux | A | falla → pasa | falla → pasa |
| pro-reservations | A | falla → pasa | falla → pasa |
| pro-service-package-write-recovery | C | falla 1/2 → pasa 2/2 | pasa → pasa 2/2 (1 intermitente en lote, aislada pasa) |
| pro-service-packages-english | C | falla → pasa | pasa → pasa |
| pro-service-journey | A | falla 1/3 → pasa 3/3 | falla 1/3 → pasa 3/3 |
| pro-visit-preparation | C | falla → pasa | pasa → pasa |
| pro-visit-preparation-english | C | falla → pasa | intermitente → pasa |
| pro-task-center-actions | C | falla 1/2 → pasa 2/2 | pasa → pasa |
| pro-work-delivery | A | falla → pasa | falla → pasa |
| pro-work-delivery-english | A | falla → pasa | falla → pasa |
| pro-delivery-photo-reload | A | falla 2/2 → pasa 2/2 | falla 2/2 → pasa 2/2 |
| pro-work-write-reload | A | falla 3/3 → pasa 3/3 | falla 3/3 → pasa 3/3 |
| pro-local-integration | A | falla → pasa | falla → pasa |
| pro-private-estimates-journey | A | falla 2/6 → pasa 6/6 | falla 2/6 → pasa 6/6 |
| pro-direct-quote-write-recovery (unit.) | A | 14/17 → 17/17 | 14/17 → 17/17 |
| pro-daily-log-file-reconcile | B4 | falla 1/6 → pasa 6/6 | falla 2/6 → pasa 6/6 |
| pro-modal-keyboard-boundary | A | falla → skip (escritorio) | pasa → pasa |
| pro-modal-localization-journey | B1/B2/B5 + A | falla 6/6 → pasa 6/6 | falla 6/6 → pasa 6/6 |
| pro-notifications-read-failure | C | falla 1/6 → pasa 6/6 | falla 1/3 → pasa 3/3 (3 skip de escritorio) |
| pro-client-write-recovery | C | pasa → pasa 2/2 | falla 1/2 → pasa 2/2 |
| pro-direct-project-quote-recovery | C | pasa → pasa 2/2 | falla 1/2 → pasa 2/2 |
| pro-profile-routes-local | C | pasa → pasa 2/2 | falla 1/2 → pasa 2/2 |
| pro-appointment-login | C | pasa → pasa 4/4 | falla 1/4 → pasa 4/4 |
| pro-project-deeplink | C | pasa → pasa 2/2 | falla 1/2 → pasa 2/2 |

**Fase 2 sin regresión** (después de todos los cambios, ambos perfiles): `pro-credits-retainers` 2/2, `pro-takeoffs` 2/2, `pro-mood-boards` 2/2, `pro-contracts` 2/2, `pro-bids` 2/2, `pro-project-notes-details` 2/2, `pro-file-versions` 3/3 y `pro-job-workspace` 2/2. Logs: `$S/fix-logs/p2-*.log`.

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → 0 errores.
- ESLint de los 9 archivos de producto tocados y de las 44 specs/helpers con respaldo → 0 problemas.
- Corridas: `zsh $S/fix-run2.zsh <chromium-desktop|webkit-mobile> <tag> <specs…>`, que equivale a `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185 npx playwright test --config=playwright.pro-local.config.ts <spec> --project=<perfil> --workers=1` (con `PLAYWRIGHT_WEBKIT=1` en webkit). El servidor se reinició automáticamente cuando el RSS pasó de 5,5 GB.

## Quedan

- N1 y N2 (defectos de producto nuevos, arriba): `pro-tools-profile-menu` y `pro-native-section-scroll` siguen fallando en webkit.
- Inventario tras conflicto de revisión: el editor queda bloqueado hasta recargar («Cerrar» no responde). Es comportamiento actual, no está corregido.
- Entorno WebKit:
  - Una navegación completa que sale de `/dashboard/pro?tab=quotes` antes de que cargue el chunk de ventas puede producir `ChunkLoadError` y una recarga. Las specs esperan la sección.
  - Un fetch de Supabase (otro origen) cancelado por una navegación tardía llegó a reportarse como `pageerror` en `pro-client-write-recovery` en una corrida. La siguiente pasó. No se relajó el filtro de otro origen de `collectPageErrors`.

# Correcciones QA fase 2 (2026-11-12)

Integrador/corrector único de `src/` y del servidor 3185. Solo checkout Pro local (`local/pro-suite-no-push`); sin commit, push, stash, merge, ramas, despliegues, envíos ni cobros. Supabase solo loopback. `S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`.

## Aplicación del borrador `$S/qafix-draft/`

- `node apply-phase2.mjs --dry-run`: 46 archivos, **ninguna ancla falló y ningún sha256 difería** de la referencia (los cambios del corrector previo no tocaban esos archivos). Aplicado; respaldo en `$S/qafix-backup/2026-11-12T08-50-09-244Z/` (incluye `created.json` con los 4 archivos nuevos: `pro-file-input.tsx`, `use-project-default-vat.ts`, `project-default-vat.ts`, `pro-phase2-qa-fixes.spec.ts`).
- Cubre P1-1 (pagos de factura restan notas de crédito aplicadas: lectura `creditNotesCents`, rechazo `22023`/`pro_credit_notes_balance`, mensaje y resumen «Notas de crédito»), P1-2 (cantidades de mediciones por idioma), P1-3 (tope propio del presupuesto previsto), P2-1/P2-2 (contrato imprimible: estado «versión anterior», montos/porcentajes por idioma), P2-3 (errores de contratos por idioma), P2-4 (botones de 44 px en notas, detalles, créditos, tableros y licitaciones), P2-5 (tamaño de licitaciones medido antes de enviar), P2-6 (`show_files` aplicado en servidor a versiones/comentarios del cliente) y los pendientes «13 %», selector de archivo localizado («Elegir archivo») e IVA predeterminado del proyecto.
- SQL reaplicado en orden con `apply-one.mjs`: `invoice-payments-local.sql`, `credits-retainers-guard-local.sql`, `file-versions-local.sql` (los tres sin error).
- `sql-tests/invoice-payments-credit-notes-test.sql` tenía un paréntesis de más en la línea 35 (error de la propia prueba, `syntax error at or near ")"`); corregido en el borrador (copia en `.bak`). Después: **ALL PASS** (8 aserciones, en transacción con rollback). `file-versions-show-files-test.sql` → ALL PASS. `credit-notes-pglite.mjs` y `show-files-pglite.mjs` → ALL PASS.
- `verify-invoice-payments-db.mjs` PASS; también PASS `verify-{invoice-drafts,invoice-management,invoice-recurrence,invoice-document-settings,payment-overview,payment-receipts,client-statement,work-delivery}-db.mjs`. `verify-local-preparation-manifest.mjs` → `PASS: 116 SQL modules, 117 ordered steps, 196 dependencies`.
- `tests/e2e/pro-zz-g1probe.spec.ts` ya no existía (otro agente la retiró); `tsc` daba 0 errores tras aplicar.

## Defectos corregidos

| # | Defecto | Archivo | Corrección |
|---|---|---|---|
| N1 | En `/dashboard/pro`, «Volver» de «Preparar visitas» cerraba con cambios sin guardar (en WebKit) | `simple-workspace.tsx` | Antes de `closeProStep('prepararVisita')` el cierre consulta las guardas síncronas (`PRO_BEFORE_PATH_CHANGE` con la URL sin el paso). La guarda de `VisitPreparationSettings` (`useProChildNavigationGuard`, clave `prepararVisita`) la cancela y muestra «Guarde o cancele la configuración…»; así ya no depende de que la guarda de `popstate` gane a la restauración del router de Next en la ruta independiente. No se cambió `closeProStep`/`backPro` (45 usos; una guarda síncrona podía bloquear flujos «guardar y cerrar» en el mismo tick). El botón atrás del navegador sigue con la guarda de `popstate` existente. |
| N2 | App nativa: el `<main>` de `pro-space.tsx` quedaba `position:fixed` bajo la cabecera oculta del marketplace y tapaba «Volver a Mi panel» | `globals.css` (bloque `:has([data-independent-pro])`, ≤1023 px) | Con `data-independent-pro` montado, `body` vuelve a `height:auto; overflow:visible` y su `<main>` a flujo normal (`position:static`, sin `inset`/`overflow` propios). Las reglas nativas de `/dashboard/profesional` no cambian (el selector exige el espacio Pro). |
| Inv | Tras conflicto de revisión (409/cambio concurrente) el editor de Inventario quedaba en «Guardando…» deshabilitado y «Cerrar» no respondía | `catalog-workspace.tsx`, `business-panel.tsx` | La revisión obsoleta deja de contar como guardado en curso (`inventoryNotReady` sin `!inventoryCoherent`); sigue el aviso «Recargue…» y el guardado sigue bloqueado por la comprobación de revisión de `saveInventory`. «Recargar datos» dentro del editor (solo error del catálogo, no de formulario) llama a `reloadCatalog`: recarga la lista y, si el registro abierto sigue desfasado, su detalle; el borrador del formulario se conserva. «Cerrar» pide «¿Descartar cambios?» como siempre. |
| % | Porcentajes sin espacio en ES | `purchase-order-print.tsx`, `private-estimate-export.ts`, `private-estimate-preview.tsx`, `private-estimate-publication-document.tsx`, `invoice-extras-fields.tsx` («Servicio 10 %», «Porcentaje del cargo: 10 %»), `discount-presets.tsx`, `invoice-print.tsx` (documento ES), `pro-workspace.tsx` (vista heredada ES) | ES «13 %», EN «13%». `contract-templates.tsx` ya lo hacía (`' %'`). Quedan sin espacio solo usos no textuales (anchos CSS, zoom «150%» del visor). |
| IVA | Editor heredado de cotizaciones («más IVA») | — | **Sin cambio de código**: ningún flujo abre `QuoteEditorModal` desde un trabajo (orígenes: cliente, solicitud de cita, proyecto del marketplace, solicitud manual). Las cotizaciones nuevas de un trabajo usan el editor privado, que ya toma el IVA del proyecto (`private-estimate-editor.tsx`, mismo patrón que `use-project-default-vat.ts`). Además el editor heredado solo admite 13 % (incluido/más IVA/exento), sin tarifas reducidas. |
| Texto | La ayuda de «IVA predeterminado» decía que las líneas nuevas «siguen eligiendo su IVA una por una» | `project-details.tsx` | Ahora explica que las líneas nuevas de cotizaciones privadas, detalles de factura y órdenes de compra del proyecto empiezan con ese IVA y que nunca cambia el IVA ya escrito (ES/EN). |

## Specs actualizadas (sin debilitar)

- `pro-catalog-storage.spec.ts`: la aserción del comportamiento viejo («Guardando…» deshabilitado) se reemplazó por la nueva: sin «Guardando…», «Guardar» habilitado, «Cerrar» → «¿Descartar cambios?» → «Seguir editando» conserva el borrador, «Recargar datos» quita el aviso y conserva «Borrador conservado». Lo que sigue (recarga, cierre con descarte, guardado sin cambios) no cambió.
- `pro-private-estimates-journey.spec.ts`: «Descuento: 12,5%» → «Descuento: 12,5 %».
- `pro-phase2-qa-fixes.spec.ts` (borrador): el editor del detalle de factura ahora es un acordeón (una línea abierta); el bucle abre cada línea (`aria-expanded`) antes de las mismas aserciones de IVA 08.

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → 0. ESLint de los 58 archivos tocados (lista en `$S/touched-lint.txt`) → 0.
- Playwright `playwright.pro-local.config.ts`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3185`, `--workers=1`, cola `$S/fix-run2.zsh` vía `$S/qa2-env.zsh` (hace `source` del entorno psql nativo sin mostrarlo; necesario para las 11 specs `*-api` que abren `PRO_LOCAL_PSQL`). Logs en `$S/fix-logs/qa2*-*.log`.

Resultado final por spec (pruebas que pasan / ejecutadas). «psql nativo»: la primera corrida de chromium no tenía el entorno psql nativo («Local PostgreSQL test gate credentials are required»), repetida con `qa2-env.zsh`. «reintento»: falló solo el idioma [es] esperando la primera compilación de la sección o la verificación de sesión del servidor dev (EN pasaba); repetida sin cambios y en verde. `pro-tools-profile-menu` y `pro-native-section-scroll` se omiten por diseño en escritorio (contrato móvil). N1 y N2 pasan en webkit: las líneas 44–49 de `pro-tools-profile-menu` (aviso «Guarde o cancele…» tras «Volver») ya pasaron en la primera corrida de webkit.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| `pro-phase2-qa-fixes` | 8/9 → 9/9 (spec ajustada) | 9/9 |
| `pro-catalog-storage` | 1/1 | 1/1 |
| `pro-tools-profile-menu` | 0/0 (+2 omitidas) | 1/2 → 2/2 (reintento) |
| `pro-native-section-scroll` | 0/0 (+2 omitidas) | 2/2 |
| `pro-inventory-write-recovery` | 2/2 | 2/2 |
| `pro-bids` | 2/2 | 2/2 |
| `pro-catalog-expected-actor` | 1/1 | 1/1 |
| `pro-catalog-import` | 3/3 | 3/3 |
| `pro-catalog-item-types` | 1/1 | 1/1 |
| `pro-catalog-organizations` | 1/1 | 1/1 |
| `pro-client-dashboard` | 2/2 | 2/2 |
| `pro-company-daily-log-files-api` | 4/5 → 5/5 (psql nativo) | 5/5 |
| `pro-company-daily-log-files` | 6/6 | 6/6 |
| `pro-company-file-management` | 2/2 | 2/2 |
| `pro-company-files-api` | 2/2 | 2/2 |
| `pro-company-files` | 2/2 | 2/2 |
| `pro-company` | 3/3 | 3/3 |
| `pro-contracts` | 2/2 | 2/2 |
| `pro-credits-retainers` | 2/2 | 2/2 |
| `pro-file-versions` | 3/3 | 3/3 |
| `pro-invoice-beverages` | 1/1 | 1/1 |
| `pro-invoice-detail` | 1/1 | 1/1 |
| `pro-invoice-drafts` | 1/1 | 1/1 |
| `pro-invoice-extras` | 1/1 | 1/1 |
| `pro-invoice-management` | 1/1 | 1/1 |
| `pro-invoice-payments` | 1/1 | 1/1 |
| `pro-invoice-preparation` | 0/1 → 1/1 (reintento) | 1/1 |
| `pro-invoice-recurrence` | 1/1 | 1/1 |
| `pro-invoice-tax` | 1/1 | 1/1 |
| `pro-job-workspace` | 2/2 | 2/2 |
| `pro-lead-center-api` | 5/6 → 6/6 (psql nativo) | 6/6 |
| `pro-lead-center` | 6/6 | 6/6 |
| `pro-lead-commercial-progress-api` | 3/4 → 4/4 (psql nativo) | 4/4 |
| `pro-lead-commercial-progress-journey` | 4/4 | 4/4 |
| `pro-lead-followups-api` | 3/4 → 4/4 (psql nativo) | 4/4 |
| `pro-lead-followups-journey` | 7/7 | 7/7 |
| `pro-lead-origin-create-api` | 4/5 → 5/5 (psql nativo) | 5/5 |
| `pro-lead-origin-create-journey` | 6/6 | 6/6 |
| `pro-lead-origins-api` | 3/4 → 4/4 (psql nativo) | 4/4 |
| `pro-lead-origins-journey` | 3/4 → 4/4 (reintento) | 4/4 |
| `pro-lead-private-quotes-api` | 4/4 | 4/4 |
| `pro-lead-private-quotes-journey` | 3/4 → 4/4 (reintento) | 4/4 |
| `pro-leads-inboxes` | 5/6 → 6/6 (reintento) | 6/6 |
| `pro-mood-boards` | 2/2 | 2/2 |
| `pro-private-estimate-commercial-list-api` | 2/2 | 2/2 |
| `pro-private-estimate-commercial-list-journey` | 2/2 | 2/2 |
| `pro-private-estimate-destination-copy-api` | 5/6 → 6/6 (psql nativo) | 6/6 |
| `pro-private-estimate-destination-copy-journey` | 3/3 | 3/3 |
| `pro-private-estimate-publication-copy-api` | 4/5 → 5/5 (psql nativo) | 5/5 |
| `pro-private-estimate-publication-copy-journey` | 2/2 | 2/2 |
| `pro-private-estimate-publications-api` | 4/5 → 5/5 (psql nativo) | 5/5 |
| `pro-private-estimate-publications-journey` | 2/2 | 2/2 |
| `pro-private-estimate-publications-pdf` | 2/2 (+2 omitidas) | 2/2 (+2 omitidas) |
| `pro-private-estimate-work-api` | 5/6 → 6/6 (psql nativo) | 6/6 |
| `pro-private-estimate-work-journey` | 2/2 | 2/2 |
| `pro-private-estimates-api` | 2/4 → 4/4 (psql nativo) | 4/4 |
| `pro-private-estimates-journey` | 6/6 | 6/6 |
| `pro-private-estimates-pdf` | 2/2 (+2 omitidas) | 2/2 (+2 omitidas) |
| `pro-project-notes-details` | 2/2 | 2/2 |
| `pro-purchase-orders` | 2/2 | 2/2 |
| `pro-takeoffs` | 2/2 | 2/2 |
| `pro-work-files-headers` | 1/1 | 1/1 |
| `pro-work-files` | 3/3 | 3/3 |
| `pro-job-workspace` (`PRO_INDEPENDENT=1`) | 2/2 | 2/2 |

## Capturas revisadas (Read) — `$S/qafix-shots/`

Escritorio y móvil: «Pagos del borrador» ES con «Notas de crédito ₡6.000 / Por aplicar ₡4.000» y la nota explicativa; detalles del proyecto con «08 · Tarifa general 13 %»; vista previa de cotización privada móvil «Descuento: 12,5 %» / «Impuesto: 13 %»; importación de solicitudes móvil con «Elegir archivo · errores.csv»; orden de compra imprimible ES; detalle de factura con la línea del trabajo en «₡5 650,00» (IVA 13 % aplicado). El aviso del presupuesto previsto se comprueba por texto en la spec; la captura queda desplazada fuera de él.

## Quedan

- El importe sugerido en «Pagos del borrador» se muestra «4000.00» también en ES (formato previo del campo; se acepta al guardar). No se tocó.
- En la orden de compra imprimible móvil la columna «Impuesto» queda recortada a la derecha (tabla ancha previa).

---

# Cierre de paridad — últimos pendientes (2026-11-12)

Solo checkout Pro local (`local/pro-suite-no-push`), sin commit/push/stash/ramas, sin envíos ni cobros reales. SQL aplicado solo en loopback. Copias previas de cada archivo tocado en `$S/final-backup/`; capturas en `$S/final-shots/{desktop,mobile}/` (`S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`).

| # | Tema | Cambio | Prueba |
|---|---|---|---|
| C1 | Importe sugerido «4000.00» en ES (pendiente de la revisión anterior) | `invoice-payments.tsx`: coma decimal en ES, punto en EN; `inputCents` acepta ambos y recorta espacios. | `pro-invoice-payments` (`400,00`, cambio intencional), `pro-phase2-qa-fixes` (ES/EN + equivalencia de separadores). |
| C2 | OC imprimible móvil recortaba «Impuesto» | `purchase-order-print.tsx`: ≤600 px en pantalla, una tarjeta etiquetada por línea; impresión sin cambios. | `pro-purchase-orders`: ninguna celda fuera del ancho; en móvil la celda «Impuesto/Tax» completa en pantalla. Captura `po-print-*-mobile.png`. |
| C3 | N1 con el botón atrás del navegador | Verificado: **fallaba** (WebKit, ES/EN). Corrección en `use-pro-search-params.ts`: guarda consultada en fase de captura de `popstate` antes del App Router. | `pro-tools-profile-menu` con `page.goBack()`: 2/2 falla antes, 2/2 pasa después. Detalle en `navigation-paths-local.md`. |
| C4 | Notas de crédito en estado de cuenta y Pagos recibidos | `credit-notes-statement-local.sql`, tipos, API y UI. | Nueva `pro-credit-notes-statement`; `verify-client-statement-db` y `verify-payment-overview-db` PASS. `pro-payment-overview`: expectativas de `summary` ampliadas con `creditNotesCents:0, creditNoteCount:0` (cambio de contrato intencional, 3 literales). |
| C5 | Mediciones sobre PDF (fila 66) | pdf.js 6.4.299 local, selector de página, misma ruta de imagen. | Nueva `pro-takeoffs-pdf`; `pro-takeoffs` (expectativa del PDF roto actualizada a propósito); `verify-pdfjs-vendor.mjs` PASS. |
| C6 | Portal de proveedores (fila 53) | `bid-vendor-portal-local.sql`, rutas `/api/pro/bid-portal(-links)`, página `/licitacion-proveedor`, UI dueño/proveedor. | `$S/final-sql/bid-portal-test.sql` 41 PASS; nueva `pro-bid-portal`. |
| C7 | Versiones en la biblioteca de la empresa (fila 30) | `company-file-versions-local.sql`, `/api/pro/company-file-versions`, `company-file-versions.tsx` (ProModal), insignias. | `$S/final-sql/company-versions-test.sql` 27 PASS; nueva `pro-company-file-versions`. Corrección tras WebKit: el diálogo usaba `Modal` y la X medía 32 px; ahora `ProModal` (≥44 px). |

## Comandos y resultados

- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 119 SQL modules, 120 ordered steps, 208 dependencies…`.
- `node $S/apply-one.mjs` de cada SQL nuevo, dos veces → `ok` ×2 (idempotente).
- `npx tsc --noEmit -p tsconfig.json` → 0. ESLint de los 38 archivos tocados → 0 errores, 0 advertencias (los dos `verify-*-db.mjs` conservan 6 advertencias previas de variables sin usar).
- Regresión (34 specs: nuevas + `pro-bids`, `pro-takeoffs`, `pro-company*`, `pro-file-versions`, `pro-credits-retainers`, `pro-invoice-*`, `pro-purchase-orders`, `pro-client-statement*`, `pro-payment*`, `pro-phase2-qa-fixes`, `pro-tools-profile-menu`, `pro-navigation`, `pro-expense-write-recovery`): chromium-desktop 33/34 en verde a la primera (`pro-tools-profile-menu` se omite en escritorio por diseño); webkit-mobile 32/34. Fallaron `pro-payment-overview` en los dos perfiles (literales de `summary`, ver C4) y `pro-company-file-versions` en WebKit (X de 32 px, ver C7). Corregidos y repetidos: 1/1 y 2/2 en ambos perfiles.
- `node scripts/ci/verify-app-surface-ownership.mjs` ya fallaba antes de estos cambios («Handler /api/pro/access has no regression owner»). No se tocó: las rutas Pro locales no tienen dueño de regresión en ese script.

## Quedan

- Portal: sin cuenta/directorio de proveedores, adjuntos, preguntas y respuestas ni cierre automático (pasada la fecha límite el envío sí se bloquea).
- PDF: una página por plano; sin detección automática ni sustracción de áreas.
- Si se vuelve a aplicar **solo** `client-statement-local.sql` o `company-files-local.sql`, sus funciones vuelven a la versión anterior. Aplicar el manifiesto completo.

# Seguridad del portal (2026-11-12)

Revisión de seguridad de solo lectura (`$S/sec-review/report.md`): 0 críticos o altos, 3 medios y 5 bajos, todos del portal de proveedores (fila 53) y todos detrás de `NODE_ENV==='development'`. Se aplicaron con `$S/secfix-draft/apply-phase2.mjs` (originales en `$S/secfix-backup/2026-11-13T00-50-54-926Z/`) y se reaplicó `docs/pro/sql/bid-vendor-portal-local.sql` en loopback. Detalle funcional en `bids-local.md` («Portal de proveedores»).

| # | Hallazgo | Corrección | Evidencia |
|---|---|---|---|
| M1 | El proveedor veía las notas internas del dueño (`pro_bid_responses`) | `pro_bid_portal_view` arma `offer` solo desde la última fila propia de `pro_bid_portal_submissions`. Aviso ES/EN en `bid-portal-links.tsx`: un envío del portal reemplaza la oferta tecleada a mano. | SQL y PGlite: «M1 … vendor still sees only its own submission». Spec: la nota «Oferta privada de Maderas» nunca aparece en el JSON ni en la página. |
| M2 | Clave del token derivada de `SUPABASE_SERVICE_ROLE_KEY` | Token aleatorio de 32 bytes. En la base solo queda su HMAC con `PRO_BID_PORTAL_SECRET`, que es obligatorio (≥32 bytes). Si falta, falla cerrado con 503 `config`. `dev-local-test-env.js` genera un secreto efímero. El reintento de creación responde sin token. | Spec: hash de 64 hex ≠ SHA-256 del token, `replayed:true` sin token. SQL: «M2 retried create …». |
| M3 | Rate limit por IP falsificable y sin tope por enlace | Tope de 50 envíos por enlace (`CR429` → 429 `limit`). Límites por sesión derivados de la cookie (60 lecturas y 30 envíos por minuto). | SQL: «M3 … cap», «M3 replay after the cap still answers». |
| B1 | Una sola cookie por navegador | Una cookie por enlace (`ccr_bid_portal_<linkId>`), `?link=`/`link` para elegirla, canje repetido desde el mismo dispositivo. | Spec: las dos cookies del portal conviven, `GET` sin `link` → 401 y con `link` → 200. |
| B2 | Cookie sin `Secure` | `Secure` cuando la petición llega por https (`X-Forwarded-Proto`). | Spec: `Set-Cookie … HttpOnly; SameSite=Strict; Max-Age=…; Secure`. |
| B3 | El `actionId` del proveedor compartía el espacio de recibos del dueño | Id interno derivado de enlace + `actionId` (`pro_bid_portal_action_id`, ver abajo). | SQL y PGlite: «B3 …» (3 + 3 comprobaciones). |
| B4 | Orden de locks frente a `uninvite` (deadlock) y pérdida del registro | Orden común: primero el advisory de la obra, después la fila del enlace. `uninvite` se rechaza si hay envíos del portal (400 `portal_submissions`, mensaje ES/EN). | Spec: `uninvite` → 400 `portal_submissions`, se conservan 3 envíos. SQL: `uninvite` rechazado. |
| B5 | 429 sin `no-store` | `tooMany()` en `rate-limit.ts` con `Cache-Control: no-store, private`. El portal añade además sus cabeceras a la 429. | Revisión de código. |

## Falla tras aplicar: la oferta del portal no aparecía en la comparación del dueño

- Síntoma: en `pro-bid-portal`, ES y EN, después de «Actualizar enlaces» el enlace figuraba `claimed` con 3 envíos, pero la tarjeta de Ferretería Central decía «Sin oferta todavía» en lugar de ₡111.000.
- Causa: B3. El id interno era `md5(…)::uuid`, que no trae los bits de versión ni de variante de RFC 9562 (por ejemplo `5d3b687a-8f96-2ea7-6c7f-…`). El envío **sí** escribía la oferta: en la traza, la respuesta de `GET /api/pro/bids?view=detail` traía `totalCents: 11100000` para Ferretería, y la recarga del detalle **sí** se disparaba. Lo que fallaba era el cliente: `bidDetailSchema` valida `history[].actionId` con `z.uuid()`, que rechaza ese id (`z.uuid()` da false y `z.guid()` da true con los ids de la traza). `loadDetail` caía en el `catch` y, como el detalle anterior seguía en pantalla, el error quedaba oculto. Los locks (B4) y M1 no intervenían.
- Arreglo (producto): nueva función inmutable `pro_bid_portal_action_id(link, action)`. Toma el md5 y fija la versión 8 y la variante 10, y `pro_bid_portal_submit` la usa. Con eso el id sigue siendo determinista (el reintento idempotente se mantiene) y es un UUID válido. Las pruebas SQL lo comprueban así: psql valida el formato y la igualdad con el md5 fuera de esos bits; PGlite calcula el id en JS sin usar el SQL y exige que todo el historial pase `z.uuid()`.
- Spec mal parcheada (segunda falla, línea 167): `vendorContext.cookies(url)` también devuelve las cookies del sitio con `Path=/` (`NEXT_LOCALE`, consentimiento). Ahora filtra las `ccr_bid_portal*` y además exige `Path=/api/pro/bid-portal`, HttpOnly y SameSite=Strict en cada una, así que la aserción queda más estricta que antes.
- Respaldo previo a esta depuración: `$S/secfix-debug-backup/`.

## Comandos y resultados

- `node $S/run-sql-test.mjs docs/pro/sql/bid-vendor-portal-local.sql` → exit 0, aplicado dos veces.
- `node $S/run-sql-test.mjs $S/secfix-draft/sql-tests/bid-portal-test.sql` → 53 PASS, 0 FAIL, «ALL BID PORTAL CHECKS PASSED» (`$S/secfix-debug-psql.out`).
- `node $S/secfix-draft/sql-tests/bid-portal-pglite.mjs` → 29 PASS, «ALL PASS» (`$S/secfix-debug-pglite.out`).
- Playwright (servidor dev 3185, `--workers=1`), `pro-bid-portal` y `pro-bids`: chromium-desktop 4/4 (`$S/secfix-debug-final-chromium.log`), webkit-mobile 4/4 (`$S/secfix-debug-final-webkit.log`). Una corrida de chromium lanzada menos de un minuto después de otra dio 429 en el reintento idempotente. Es un efecto del entorno: son 17 escrituras por idioma contra un límite por IP de 40/min, en memoria. Repetida después de un minuto: 4/4.
- `npx tsc --noEmit -p .` → 0. ESLint de los archivos del portal → 0 errores. `scripts/dev-local-test-env.js` conserva 3 `no-require-imports` previos (es CommonJS, igual que en el respaldo).
- Capturas revisadas (Read) en `$S/secfix-debug-out-{chromium,webkit}/`: dueño con el enlace abierto y 3 envíos, ES escritorio y EN móvil; proveedor con la oferta enviada, ES móvil; proveedor con la oferta vacía, EN escritorio. Sin desbordes y con los textos ES/EN correctos.

## Queda

- `work-bids.tsx`: si falla la recarga de un detalle que ya está en pantalla, no se avisa (el error solo se ve cuando no hay detalle). Eso ocultó esta falla. Conviene mostrar un aviso con «Reintentar» (no se cambió aquí).

# Ronda 1 tras recorrido manual (2026-11-12)

Insumo: recorrido manual frente a Houzz Pro (`$S/walkthrough/report.md`, capturas en `$S/walkthrough/shots/`). Alcance: B-1 (vincular/invitar cliente), cifras incoherentes y cabecera/agenda. Sin commits, envíos reales ni cobros. Respaldos previos a cada edición: `$S/round1-backup/`.

## 1. Vincular / invitar al cliente (bloqueante)

- **Causa.** Todos los lectores del cliente (vista del cliente, contratos, archivos y versiones, tableros, avances, bitácora, selecciones, montos previstos, cronograma, pendientes) autorizan al cliente por **una** fila confirmada de `pro_appointment_requests` del trabajo. Esa fila solo nacía al confirmar una cita pública. Un trabajo creado desde una solicitud manual o desde una cotización compartida por código nunca la tenía: aceptar la cotización ligaba la cuenta a la *publicación* (`pro_private_estimate_publication_recipients`), no al trabajo que el dueño crea después. Por eso «Mis proyectos» quedaba vacío y el trabajo decía «Todavía no hay un cliente confirmado con cuenta vinculado».
- **Cambio.** `docs/pro/sql/work-client-invitations-local.sql` (nuevo, en el manifiesto). Vincular = insertar esa misma fila con `origin='project_invite'` (columna nueva en `appointment-requests-local.sql`). No es una cita: no tiene hora, no genera avisos ni recordatorios, no aparece en el embudo/centro de solicitudes (`lead-center`, `request-pipeline`) ni en la lista de solicitudes del proveedor, y la sincronización de agenda (`pro_appointment_sync_work`) la ignora, así que el trabajo conserva su ciclo propio (cualquier etapa, fechas, servicio); solo bloquea cambiar el cliente del trabajo mientras hay cuenta vinculada. Un disparador impide editar esas filas fuera del módulo.
  - (a) **Invitación**: token aleatorio de 32 bytes (base64url, 43 caracteres) generado por la ruta; en la base solo queda `sha256('ccr-work-invite:v1:'+token)`. Vence (7 días por defecto, 1–30), es anulable, de un solo uso, y crear una nueva anula la anterior abierta. El dueño copia enlace (`/dashboard/unirse-proyecto#codigo=…`, el código va en el fragmento y la página lo borra de la barra) o código. El cliente autenticado ve profesional, trabajo y vencimiento, lo que se compartirá, y confirma con casilla + botón. Desvincular (con confirmación) quita el trabajo de su cuenta y no permite compartirle nada nuevo; lo ya compartido sigue en su historial, igual que en una cita cancelada.
  - (b) **Cotización aceptada con código**: tras aceptar, la cotización ofrece «Seguir el proyecto» (casilla + «Unirme al proyecto»). El consentimiento se guarda (`pro_work_client_link_consents`) y vincula en cuanto el dueño continúa esa cotización en un trabajo (disparador sobre `pro_private_estimate_work_agreements`; un fallo nunca bloquea al dueño), o al instante si el trabajo ya existe. Solo puede consentir el destinatario verificado y solo con la versión aceptada.
  - (c) Tras vincular, vista del cliente, contratos, archivos, tableros y avances usan esa cuenta, y el trabajo aparece en «Mis proyectos» → «Proyectos con profesionales» (abre la vista del cliente del trabajo).
  - Seguridad: rutas `/api/pro/work-client-invitations` (dueño) y `/api/pro/project-invitation` (cliente) con mismo origen en escrituras, actor esperado, zod estricto, cuerpo acotado, límite por cuenta y por IP, `actionId` idempotente (receipt sin token; reintento de creación no reexpone el token), CAS/40001→409, IDOR (lectura/escritura de trabajo ajeno → 403/null), el dueño no puede aceptar su propio código, código ajeno/usado/vencido/anulado → 404/410 con motivo, preview no revela datos del cliente.
  - UI: «Acceso del cliente» en el Resumen del trabajo y en la Vista del cliente (`work-client-invite.tsx`), «Acceso del cliente a sus trabajos» en la ficha del cliente, página `/dashboard/unirse-proyecto`, panel de consentimiento en la cotización recibida (`project-link-consent.tsx`). En la cita del cliente no se ofrecen acciones de cita para estas filas.
- **Pendiente.** Extras/cambios de alcance (`work-changes-local.sql`) siguen exigiendo `bookingClientId` (cliente de cita); un cliente vinculado por invitación no los ve todavía. Si el cliente no ha iniciado sesión, el enlace lleva al acceso y el código del fragmento se pierde: debe pegarlo (la página lo pide).

## 2. Cifras coherentes

- (a) **Horas.** Causa: había un solo libro (`pro_work_cost_entries`), pero «Horas» (`pro_time_read`) solo listaba lo creado desde el propio módulo. Cambio: `time-tracking-local.sql` suma y lista de solo lectura (origen «Costos y pagos») las líneas de tiempo vivas del libro que no vienen del módulo; anuladas no cuentan.
- (b) **Importe acordado.** Causa: `pro_work_account` solo leía el acuerdo manual o la cotización de una cita, nunca la cotización privada aceptada y continuada. Cambio (`client-balance-local.sql`, supersede de `pro_work_account` con mismas claves + nuevas): acuerdo manual ▸ cotización de cita ▸ cotización aceptada (CRC). «Cambiar importe» sigue disponible y gana.
- (c) **Resultado.** Cambio en `pro_work_costs_read`: si el acuerdo viene de la cotización aceptada se conoce el IVA y el resultado usa el importe **sin IVA** (costos se anotan sin IVA); si no, el texto dice que compara el importe tal como se acordó. Lo comprometido en órdenes de compra no canceladas (subtotal sin IVA) se muestra aparte, con «Resultado restando lo comprometido», sin sumarlo a los costos registrados.
- (d) **Saldo del cliente — fórmula única** (documentada en `client-balance-local.sql`): por trabajo, `max(acordado − abonos − notas de crédito aplicadas, 0)`; abonos = pagos − anulaciones del libro; un anticipo recibido **es** un abono del libro y aplicarlo a una factura solo asigna ese mismo dinero, por eso se cuenta una vez; dinero a favor = `max(abonos − acordado, 0)` (una nota nunca es dinero). La ficha (`summary.customerBalanceCents`), el estado de cuenta (`pro_client_statement_page`, misma cifra) y el borrador de factura («Saldo actual del cliente en este trabajo», en vivo por `/api/pro/client-balance`) muestran lo mismo. Causa de las tres cifras del recorrido: la ficha no restaba notas de crédito y el borrador mostraba solo el saldo guardado al prepararlo (ahora rotulado así, junto al saldo actual). `balanceCents` (acordado − abonos) se conserva para las validaciones de abonos existentes.
- (e) **«Detalle del registro — No se pudo cargar el registro».** No es un enlace: «Abono del libro» es texto en la ficha del anticipo. No se reprodujo. Causa probable por código: un cambio de URL dentro del trabajo vuelve a pedir el registro (`openDetail`); si esa recarga fallaba (revisión de agenda más nueva tras registrar el anticipo, o un reinicio del servidor), el modal del trabajo se reemplazaba por el error. Cambio: la recarga del registro que ya está en pantalla es silenciosa y un fallo conserva el trabajo abierto (`business-panel.tsx`); la lectura de agenda reintenta una vez si la revisión quedó atrás (`agenda-workspace.tsx`).

## 3. Cabecera y agenda

- Causa: la cabecera solo mostraba `stage` y las fechas propias del trabajo; la lista de «Citas y trabajos» marcaba todo trabajo propio como «Confirmada», por eso no aparecía en «Pendientes».
- Cambio: `work-header-local.sql` (fase derivada: cancelada, finalizada, en curso, agendada, contrato aceptado, cotización aceptada, contrato enviado, en cotización, nuevo; rango del plan = tareas no archivadas) y supersede de `pro_appointment_inbox`: los trabajos por programar (sin fechas ni plan) están en «Pendientes» y los programados/en curso en «Confirmadas». `work-header.tsx` muestra la fase, hitos («Cotización aceptada · Contrato aceptado») y «Plan: 12 nov – 28 nov» cuando no hay fechas propias. `pro-private-estimate-work-journey.spec.ts` se actualizó: tras continuar una cotización aceptada la cabecera dice «Cotización aceptada» (antes «Nuevo»).

## Archivos

SQL: `work-client-invitations-local.sql`, `client-balance-local.sql`, `work-header-local.sql` (nuevos); `appointment-requests-local.sql`, `appointment-reschedule-local.sql`, `lead-center-local.sql`, `request-pipeline-local.sql`, `appointment-list-local.sql`, `time-tracking-local.sql`, `work-costs-local.sql`; `scripts/pro/local-sql-manifest.mjs`. Rutas: `work-client-invitations`, `project-invitation`, `client-balance`, `work-header`; página `[locale]/dashboard/unirse-proyecto`. Lib: `work-client-invitations(.ts|-server.ts)`, `appointment-requests.ts`, `time-tracking.ts`, `work-costs.ts`, `work-cost-write-recovery.ts`, `client-operations.ts`. Componentes: `work-client-invite.tsx`, `project-invitation-accept.tsx`, `project-link-consent.tsx`, `job-customer-balance.tsx`, `work-header.tsx` (nuevos); `business-panel.tsx`, `client-dashboard.tsx`, `private-estimate-publications.tsx`, `client-activity.tsx`, `appointment-requests-workspace.tsx`, `time-tracking.tsx`, `work-costs.tsx`, `client-operations.tsx`, `invoice-draft.tsx`, `agenda-workspace.tsx`. Specs: `pro-work-client-invite.spec.ts`, `pro-work-figures.spec.ts` (nuevas), `pro-private-estimate-work-journey.spec.ts`.

## Comandos y resultados

- SQL (loopback, `node $S/run-sql-test.mjs`, todo en `rollback`): `$S/round1-sql/invite-test.sql` → 47 PASS + «ALL WORK CLIENT INVITATION CHECKS PASSED» (`invite-test.out`); `$S/round1-sql/figures-test.sql` → 20 PASS + «ALL FIGURE/HEADER CHECKS PASSED» (cifras del recorrido: ₡1.508.550 con IVA ₡173.550, abonos, anticipo, nota de crédito, 6 h, OC ₡516.000 sin IVA, fases de cabecera y filtro de agenda) (`figures-test.out`). Módulos aplicados al entorno local: `work-client-invitations-local.sql`, `client-balance-local.sql`, `work-header-local.sql` y las funciones modificadas (delta en `$S/round1-sql/`).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → PASS (122 módulos). PGlite: `verify-work-costs-db`, `verify-client-operations-db`, `verify-client-statement-db`, `verify-invoice-drafts-db`, `verify-payment-overview-db`, `verify-appointment-requests-db`, `verify-appointment-reschedule-db`, `verify-request-quotes-db`, `verify-lead-center-recovery`, `verify-request-pipeline-recovery` → PASS.
- `npx tsc --noEmit -p tsconfig.json` → 0. ESLint de lo tocado → 0 errores (2 avisos previos en `client-activity.tsx`, idénticos en el respaldo).
- Playwright (3185, workers 1): specs nuevas `pro-work-client-invite` (3) y `pro-work-figures` (2) → chromium-desktop 5/5 y webkit-mobile 5/5. Relacionadas (41 specs: pro-client-*, pro-work-cost*, pro-work-budget*, pro-invoice-*, pro-credit*, pro-payment-overview, pro-contracts, pro-mood-boards, pro-file-versions, pro-client-dashboard, pro-job-workspace, pro-time-tracking, pro-private-estimate-work-*, pro-appointment-*, pro-manual-lead-work-journey, pro-project-planning) → webkit-mobile 41/41; chromium-desktop 40/41 tras corregir y repetir (`pro-client-dashboard` texto duplicado, `pro-client-operations`/`pro-request-quote-journey` resumen estricto con las claves nuevas, `pro-manual-lead-work-journey` etiqueta «Agendada»; `pro-invoice-recurrence`, `pro-work-budget-journey`, `pro-appointment-requests` fallaron por ECONNRESET/servidor saturado y pasan al repetir). `pro-job-workspace` con `PRO_INDEPENDENT=1` → 1/1 en ambos perfiles.
- `pro-work-cost-write-recovery`: falla intermitente previa a esta ronda («route.fulfill: Route is already handled!» en la retención de la lista de clientes del propio spec; misma falla en `$S/fix-logs/finreg-iso2-chromium-desktop.log` de esta mañana). Pasó en la corrida completa webkit; no se tocó.
- Capturas revisadas (Read) en `$S/round1-shots/` (ES/EN, escritorio y móvil): dueño antes/lista/vinculado, cliente con vista previa/unido/Mis proyectos/trabajo, consentimiento en la cotización, costos con importe de la cotización y base sin IVA, horas, cabecera, agenda y ficha.

## Quedan

- Extras/cambios (`work-changes`) para clientes vinculados por invitación; reintentar la vinculación desde el consentimiento si falló al continuar la cotización (hoy queda `request_id` nulo y el cliente ve «aceptó unirse»); conservar el código tras iniciar sesión; aviso en la app al dueño cuando el cliente acepta (no se generan notificaciones).
- Costos de gastos con IVA incluido no se separan: el texto de «Resultado» lo explica cuando el acuerdo no trae IVA.

# Ronda 2 UX tras recorrido manual (2026-11-12)

Insumo: lista «Molestos (UX)» de `$S/walkthrough/report.md` (capturas en `$S/walkthrough/shots/`). Solo funciones y flujos (sin marca, textos ni diseño de Houzz). Sin commits, envíos reales ni cobros. Respaldos previos a cada edición: `$S/round2-backup/` (misma ruta relativa). Textos/plurales/formatos quedan para la Ronda 3; widgets de proyecto, costo/margen/grupos en cotización, facturación por líneas, comprobantes de gasto, responsables del Equipo, edición desde el Gantt, adjuntos del portal y estado de cuenta imprimible, para la Ronda 4.

## 1. Modal que pierde la cabecera y deja el pie flotando (capturas 09 y 31)

- **Causa (reproducida).** Un control visualmente oculto (`sr-only` = `position:absolute`, p. ej. el selector de archivo de Mediciones) tomaba como bloque contenedor el **diálogo** y no el cuerpo desplazable: escapaba del recorte del cuerpo, el diálogo `overflow-hidden` quedaba 252 px más alto que la pantalla (WebKit móvil, `scrollHeight 1096 / clientHeight 844`) y al enfocarlo el navegador desplazaba el diálogo entero.
- **Cambio general en `ProModal`** (`src/components/pro/modal.tsx`): el cuerpo es `relative` (contiene a sus descendientes posicionados) y el diálogo usa `overflow: clip` (no se puede desplazar ni por programa). No cambia el `Modal` compartido del resto del sitio.

## 2. «¿Salir del sitio?» falso tras solo mirar o reemplazar el código

- **Causa.** En `private-estimate-publications.tsx`, una escritura ya **confirmada** (publicar / reemplazar código, pendiente solo de «Listo») contaba como cambio sin guardar, aunque está guardada en `localStorage` y se restaura al volver. Además, leer una versión, su historial o los clientes vinculados usaba el mismo `busy` de las escrituras.
- **Cambio.** La escritura confirmada ya no activa la protección de salida. Las lecturas siguen deshabilitando los botones (`busy`, igual que antes, para no cambiar cierre ni devolución del foco) pero se informan además como `reading`, y la protección de salida de la sección Cotizaciones (`private-estimates-workspace.tsx`) no cuenta una lectura sola. Las escrituras en curso o dudosas y los datos escritos sin enviar siguen protegidos. (Un primer intento que quitaba `busy` a las lecturas rompía la devolución del foco al cerrar «Cotización compartida»: detectado por `pro-modal-localization-journey`, corregido así.)

## 3. Errores y avisos a la vista, junto al botón que los causó

- `use-reveal.ts` (nuevo): al aparecer un error o un aviso, lo trae a la vista dentro de su propio desplazamiento (el cuerpo del modal) sin mover el foco.
- Licitaciones (`work-bids.tsx`): con un formulario abierto, el error/aviso se muestra **encima de sus botones** (antes arriba de todo, fuera de vista) y se revela; la fecha límite pasada se ve junto a «Guardar licitación».
- Portal del proveedor (`bid-vendor-portal.tsx`): «Oferta recibida…» y los errores van junto a los botones y se revelan; «Actualizar» pasa a **«Recargar solicitud» / «Reload request»**, distinto de «Actualizar oferta».
- Mediciones (`work-takeoffs.tsx`): al terminar la línea de escala, el formulario se trae a la vista y el cursor queda en «Longitud real»; igual con el formulario de medición.

## 4. Cotización

- **IVA 13 % por defecto** en cada línea nueva (`private-estimate-editor.tsx`, `PRIVATE_ESTIMATE_DEFAULT_VAT`); si el trabajo tiene IVA propio (Detalles del proyecto) lo sustituye. El resumen de cada línea muestra «IVA 13 % · descuento 10 %» sin abrir sus opciones.
- **Descuento para todas las líneas**: un campo y «Aplicar a todas» (0–100, hasta 2 decimales; error junto al campo). Usa el descuento por línea existente: los totales y el servidor no cambian.
- **Correo del cliente precargado** al compartir (de la ficha del cliente), con la nota «Tomado de la ficha del cliente. Puede cambiarlo.»; no cuenta como cambio sin enviar hasta que se edita.
- **Código de acceso legible**: 20 símbolos Crockford base32 = **100 bits aleatorios**, mostrado `XXXXX-XXXXX-XXXXX-XXXXX`; se acepta escrito en minúsculas, con espacios o guiones (O→0, I/L→1). La seguridad no baja: sigue siendo un segundo factor ligado al correo verificado del cliente, de un solo uso, vence en 72 h, con límite de intentos, y la base solo guarda SHA-256 del código normalizado. Los códigos anteriores (64 hex) siguen sirviendo. El enlace del cliente sigue sin incluir el código (canal separado, como antes). `src/lib/pro/private-estimate-publications.ts`.
- **Nombres de estado** coherentes: lo compartido y aún no abierto por el cliente es «Compartida · esperando al cliente» (antes «Pendiente de vincular al cliente» en una pantalla y «Compartidas» en el filtro).
- **Perfil suspendido (403)**: la lista de cotizaciones y la solicitud explican «Las cotizaciones no están disponibles porque su perfil profesional está suspendido o su membresía Pro no está activa…» en lugar de «No se pudieron cargar…» con reintento inútil (`src/lib/pro/access-copy.ts`, `private-estimates-workspace.tsx`, `leads-workspace.tsx`).
- **Selector vacío sin búsqueda** (`paged-select.tsx`): «Todavía no hay opciones para elegir.»; «No hay opciones que coincidan con la búsqueda.» solo cuando hay búsqueda.

## 5. Resumen del trabajo

- `work-summary-blocks.tsx` (nuevo): tres bloques con las mismas fuentes que la cabecera y el saldo (`/api/pro/work-header`, `/api/pro/client-balance`): **Próximos pasos** (cotización, contrato, fechas, cada uno con su acceso), **Cifras** (importe acordado, abonos, saldo; «Costos y pagos») y **Cronograma** (fechas, plan o «Todavía sin programar»; «Abrir cronograma»).
- «Finalizar trabajo» es secundario (contorno) mientras el trabajo no tiene fechas; con fechas vuelve a ser la acción principal (`business-panel.tsx`).

## 6. Archivos

- Versiones del trabajo (`work-file-versions.tsx`): tras guardar la v2 el formulario se limpia de verdad (el selector se vuelve a montar; antes seguía mostrando el archivo) y la nota aparece en la versión.
- PNG/WebP → JPG: se dice antes de guardar («Las fotos PNG y WebP se guardan como JPG: quedará como «plano cocina v2.jpg».») y en la ayuda (`storedPhotoNotice` en `src/lib/pro/work-files.ts`).
- Archivos de la empresa (`company-files.tsx`): «Versiones» es un botón visible en cada archivo (ya no solo en «…») y «Nueva carpeta» está junto a «Subir archivo».

## 7. Herramientas del trabajo

- Mediciones: «Usar un archivo del trabajo» crea el plano desde una imagen JPG ya subida en Archivos (sin volver a subirla; se excluyen las que ya son plano); el texto aclara a qué cotizaciones se puede enviar (borradores del proyecto sin compartir o una nueva).
- Tableros de ideas (`work-mood-boards.tsx`): **guardado automático** de la página 4 s después del último cambio (mismo `page_save` con CAS); conserva deshacer/rehacer; un error o conflicto lo detiene hasta que la persona actúe; se indica «Los cambios se guardan automáticamente.».
- Contratos (`contract-clauses.tsx`): el campo combinable se inserta en el **cursor** (se recuerda la posición al escribir o seleccionar; WebKit la perdía al pasar al selector).
- Licitaciones: proveedor/subcontratista **en el lugar** («Agregar proveedor o subcontratista» → queda en Empresa › Proveedores y marcado), y la licitación abierta queda en la URL (`?licitacion=…`, reemplazando la entrada para que cerrar el trabajo siga siendo un paso).
- Órdenes de compra: filtros plegados en el teléfono detrás de «Filtros» (indica «activos»); en Presupuesto, «Crear el presupuesto en Costos y pagos» lleva a donde se crea.
- Gantt (`project-schedule.tsx`): la marca «Hoy» tiene su propia fila en la cabecera (68 px) y ya no tapa el mes.

## 8. Empresa y catálogo

- «Proveedores» (barra lateral y tarjetas del espacio Pro) abre el directorio de proveedores y subcontratistas de Empresa (con tipo y su propio estado vacío), no «Gastos y proveedores». En el panel incrustado sin Centro de empresa conserva la vista de proveedores de Gastos. El alta se hace ahora en ese directorio, que al guardar cierra solo el formulario y deja el aviso en la misma lista (la vuelta automática a la pantalla anterior era del alta desde Gastos, que sigue igual).
- Catálogo (`business-panel.tsx`): código corto legible para artículos nuevos sin código (`P-0001`… con el catálogo completo; `P-K7Q2MX` con el catálogo paginado, para no chocar con el índice único por cuenta); estado vacío con «Nuevo producto o servicio»; **«Por reponer» solo si el artículo tiene mínimo** (stock sin seguimiento ya no aparece). Mismo criterio en SQL: `catalog-pages-draft.sql` (`filter='low'` exige `minimum>0`), aplicado al entorno local.

## 9. Inicio del espacio Pro

- `src/lib/pro/hub-sections.ts` (nuevo): **una sola lista** para la barra lateral (`management-shell.tsx`) y las tarjetas (`simple-workspace.tsx`): mismas 17 entradas y orden (Empresa 4, Biblioteca 3, Gestión 10, incluidas Citas, Preparar visitas y Borradores de facturación). Las tarjetas usan la misma cuadrícula de dos columnas en todos los grupos, así que quedan alineadas.

## 10. Factura y vista del cliente

- Borrador de factura: si el emisor no tiene nombre guardado, empieza con el nombre de la empresa (`professionals.business_name`, luego el nombre de la cuenta); sigue editable y no se guarda nada hasta guardar el borrador (`/api/pro/invoice-drafts`).
- Vista del cliente: el historial vacío ya no dice «Todas las secciones se muestran por defecto»: explica que las básicas (avances, resúmenes del día y archivos compartidos) se ven y las demás empiezan ocultas, como dicen sus ayudas.

## Comandos y resultados

- `npx tsc --noEmit -p tsconfig.json` → 0. ESLint de los 50 archivos tocados → 0 errores, 0 avisos. `node scripts/pro/verify-local-preparation-manifest.mjs` → PASS (122 módulos). PGlite `node scripts/pro/verify-catalog-db.mjs` → PASS (incluye el filtro de existencias bajas). `catalog-pages-draft.sql` aplicado al entorno local con `node $S/apply-one.mjs`.
- Reproducción del punto 1 antes del cambio (sonda WebKit móvil): diálogo `scrollHeight 1096 / clientHeight 844`, `scrollTop 252` al enfocar `[data-takeoff-upload]`; después `0/0` y `scrollTop 0` (aserción en la spec nueva).
- Spec nueva `tests/e2e/pro-round2-ux.spec.ts` (+ `pro-round2-fixture.ts`), 3 pruebas × ES/EN: trabajo (modal, plano desde Archivos, escala a la vista, resumen, OC, licitaciones), cotización (IVA 13 %, descuento para todas, catálogo vacío, correo precargado, código legible, estados, sin «¿Salir?», reclamo del cliente con el código en minúsculas y espacios) y empresa (Inicio = barra lateral, proveedores, catálogo, carpeta, emisor, vista del cliente, 403). Final: chromium-desktop 6/6, webkit-mobile 6/6.
- Regresión (38 specs relacionadas, workers 1, 3185) en ambos perfiles; specs ajustadas sin debilitar (nuevos valores esperados por el cambio pedido + aserciones nuevas): `pro-company-file-versions` (Versiones visible), `pro-file-versions` (formulario limpio, aviso PNG→JPG), `pro-contracts` (campo en el cursor), `pro-project-schedule` («Hoy» sin tapar el mes), `pro-bid-portal` (aviso a la vista, «Recargar solicitud»), `pro-bids` (licitación en la URL tras recargar), `pro-purchase-orders` (filtros plegados en móvil), `pro-tools-profile-menu` (17 entradas), `pro-job-workspace` (Proveedores del Centro de empresa en el espacio Pro), `pro-private-estimate-publications-journey` y `-commercial-list-journey` (código legible, «Compartida · esperando al cliente»), `pro-private-estimates-journey` (IVA 13 % → total ₡1 413,07), `pro-catalog-item-types`/`pro-inventory-write-recovery` (código corto), `pro-usability` («Por reponer» solo con mínimo), `pro-manual-lead-quotes-journey` (catálogo vacío sin búsqueda).
- Resultado final por spec (tras repetir las fallas de infraestructura): todas en verde en ambos perfiles salvo `pro-lead-private-quotes-journey` [es] en webkit-mobile (2 de 2 corridas): `pageerror` de WebKit «… due to access control checks» de peticiones globales (notificaciones, perfil, `direct-chat`) canceladas al navegar a `/registro/profesional`; no toca código de esta ronda (las otras 3 pruebas del archivo y chromium pasan). Fallas transitorias repetidas en verde: `pro-simplified-navigation` (ERR_ABORTED), `pro-independent-space` (timeouts), `pro-file-versions` [es], `pro-purchase-orders` (cambio de día a medianoche), `pro-round2-ux` (sesión no verificada una vez).
- Detectados y corregidos por la regresión: nombre accesible duplicado «Nuevo cliente» (el botón del estado vacío ahora dice «Agregar el primer cliente / producto o servicio»); `getByText('Opciones de la línea')` exacto (texto en su propio `span`); devolución del foco al cerrar «Cotización compartida» (ver punto 2).
- Capturas revisadas en `$S/round2-shots/` (ES/EN, chromium-desktop y webkit-mobile): Inicio, proveedores, catálogo vacío y artículo, cotización (IVA/descuento, código), cotizaciones con perfil suspendido, resumen del trabajo, escala de mediciones, error de licitación junto al botón, proveedor en el lugar, filtros de OC en móvil.

## Pendiente y por qué

- **Etapa que avanza al compartir** (solicitud manual): la etapa automática de las oportunidades manuales solo conoce «Nueva/Ganada»; sumar «Cotización enviada» toca `pro_lead_commercial_progress`, la página y los conteos del centro de solicitudes y su esquema estricto (los conteos se validan contra las etapas). Requiere un cambio SQL coordinado con sus pruebas PGlite.
- **Cliente creado desde la solicitud que quede elegido**: «Agregar cliente» navega a Clientes sin un regreso con el id creado; hace falta un contrato de retorno entre `leads-workspace` y el alta de clientes del catálogo paginado.
- **Dirección del proveedor**: el directorio ya tiene tipo (proveedor/subcontratista); la dirección necesita columna y contrato nuevos en `company-vendors-local.sql` (claves estrictas en crear/editar e historial).
- **Contrato vinculado a una cotización compartida pendiente**: el contrato solo toma la cotización aceptada; enlazar una compartida aún sin respuesta cambia las reglas de `work-contracts`.
- **Mediciones a una cotización ya compartida**: solo se listan borradores sin compartir (las versiones compartidas son inmutables); se explica en pantalla.
- Límite de 3 MB, «Avances» vs «Resumen del día», plantillas que deben guardarse antes de aplicarse, foto de pendientes y «Responsable» libre: fuera de este alcance (Rondas 3/4).

## Ronda 3 textos (2026-11-13)

Pasada de textos y formato sobre la interfaz Pro; no cambia comportamiento. Respaldos de cada archivo editado en `$S/round3-backup/` (misma ruta relativa).

### Cambios
- **Tratamiento (usted):** el código Pro ya usaba usted casi en su totalidad. Único residuo real: «Tus cotizaciones» (quote-choices) -> «Sus cotizaciones». Voseo: 0 antes / 0 después. Tuteo (tu/tus/tienes/puedes…): 1 antes / 0 después (conteo grep sobre `src/components/pro`, `src/lib/pro` y páginas Pro).
- **Plurales:** nuevo helper `src/lib/pro/plural.ts` (`proCount`). Aplicado a plantillas de plan («1 fecha clave», «1 fase», «1 tarea»), plantillas de tareas, importación de catálogo («1 registro · 1 error»), progreso de lotes, archivos comprobados, unidades de inventario, vigencia de invitación al cliente y resumen de listas de verificación. No se encontró en el código el origen exacto de «3 día» (las etiquetas de días ya usan singular/plural o ICU `plural`); queda pendiente de reproducir con datos.
- **Una sola denominación por sección** (fuente: `hub-sections.ts`): Citas/Appointments, Gastos/Expenses, Estadísticas/Statistics en el título del espacio Pro y en los textos que las nombran (project-create, projects-workspace, lead-inboxes, company-hub, work-costs). Se eliminaron «Citas y trabajos», «Gastos y proveedores» y «Métricas» (esta última como nombre de sección; la pestaña «Métricas» de solicitudes es otra función).
- **EN:** «estimate(s)» -> «quote(s)» en 143 textos visibles (dominaban 152 vs 106, pero navegación y mensajes del sitio ya usan Quotes); «Followed Up / Meeting Scheduled / Proposal/Estimate Sent» -> «Followed up / Meeting scheduled / Quote sent»; «before Hacienda» -> «with the Costa Rican tax authority (Hacienda)»; «Received estimates» del panel del cliente -> «Received quotes».
- **Dinero:** un solo formateador, `proMoney(valor, en?)` en `src/lib/pro/money.ts`: ES «₡1.508.550» / «₡1.508.550,50»; EN «₡1,508,550» / «₡1,508,550.50»; negativos «−₡300.000»; centavos solo si existen. Por defecto toma el idioma de `<html lang>`. Redirigidos: work-budget, private-estimate-work-action, private-estimate-preview (`privateEstimateMoney`, CRC), work-accepted-estimate, pro-workspace, `formatDraftUnits`, `contractMoney` (signo), recibos/órdenes/facturas impresas (sin sufijo «CRC»). USD conserva su formato.
- **Teléfono:** `src/lib/pro/phone.ts` (`proPhone`) muestra «+506 8888-7777» (solo visualización) en proveedores, clientes, factura, recibo, vista previa y exportación de cotización privada.
- **Porcentaje:** ES con espacio («10 %», «100 %») en mensajes y etiquetas de invoice-extras, invoice-detail y discount-presets; EN sin espacio (ya era así).
- **Texto técnico:** introducción del cronograma reescrita en lenguaje natural; «Cambio de cotización guardado» -> «Cotización actualizada.» / «Quote updated.».

### Specs ajustados (solo cadenas esperadas)
pro-simplified-navigation (título «Gastos»), pro-request-pipeline, pro-catalog-import («1 error»), pro-expenses-english, pro-work-costs-english, pro-work-budget-journey, pro-private-estimate-work-journey, pro-purchase-orders, pro-project-planning (ver nota), pro-company, pro-phase2-qa-fixes, pro-bid-portal, y las cadenas EN estimate -> quote en 27 specs Pro.

### Verificación
Ver tabla en el informe final de la ronda. `tsc` 0 errores; eslint 0 errores en los archivos tocados (2 avisos previos en `client-activity.tsx`, no introducidos aquí).

### Pendiente
- «3 día»: origen no localizado.
- Etiqueta «Hoy» que tapa el mes en el Gantt (maquetación, no se tocó).
- Ítem 9 (controles que parecen texto, orden «Otro»/«Recomendación», total por línea): no era trivial; sin cambios.
- `pro-simplified-navigation.spec.ts` falla en chromium-desktop con `net::ERR_ABORTED` en `gotoOK('/es/dashboard/profesional?tab=home')` (paso previo a cualquier texto modificado); sin resolver.
- `pro-project-planning`: el total esperado era ₡150.000 pero la cotización muestra ₡169.500 (150.000 + IVA 13 %); se corrigió el esperado, conviene confirmar que el IVA por defecto es intencional.

### Resultados de pruebas (Ronda 3)
| Proyecto | Primera pasada | Tras ajustar esperados y reintentar |
|---|---|---|
| chromium-desktop (36 specs, 102 tests) | 78 ok / 20 fallos / 4 omitidos | todos ok salvo `pro-simplified-navigation` (`ERR_ABORTED` en `gotoOK`, sin resolver) |
| webkit-mobile (35 specs) | 89 ok / 8 fallos / 4 omitidos (fallos de entorno: cursor, 500, ruta ya manejada…) | reintento de los 8: 31 ok / 2 omitidos / 0 fallos |
Capturas ES/EN en `$S/round3-shots/` (revisadas: hub EN, clientes ES con «+506 8888-7777»).

### Corrección navegación atrás
- **Síntoma:** `pro-simplified-navigation` fallaba siempre en chromium-desktop con `net::ERR_ABORTED` en `gotoOK('/es/dashboard/profesional?tab=home')`, justo después de recargar en una cita, cerrar, volver a abrir y pulsar Atrás.
- **Causa raíz (error del producto, no de la prueba ni de las rondas 1-3):** Next 16 guarda su árbol de ruta en cada entrada del historial. Las entradas creadas antes de una recarga llevan el árbol del documento anterior, que el documento nuevo no tiene en caché. Al volver a una de ellas, Next pedía otra vez el RSC, y cada pantalla Pro abierta después con `pushState` copiaba ese árbol viejo y también hacía una petición. Si el usuario pulsaba Atrás mientras una de esas peticiones seguía en curso, Next registraba dos desajustes seguidos y recurría a una **carga completa de la URL anterior** unos 250 ms más tarde. El usuario que ya había pulsado Atrás, o que ya iba a otra página, terminaba de vuelta en Citas. Se reprodujo sin la prueba: tras Atrás y 4 s sin hacer nada aparecía un GET de documento `?tab=pro_agenda&estadoCitas=confirmed`. Bastaba recargar; no hacía falta quitar `ccrProNavigation`. Los respaldos `round1/2/3-backup` no contienen `src/lib/pro/navigation.ts`, así que ninguna ronda lo introdujo.
- **Corrección:** `src/lib/pro/navigation.ts`. El envoltorio de historial existente ahora también envuelve `pushState` y guarda el último árbol que Next escribió en este documento. Un listener de `popstate` en fase de captura, que se ejecuta antes del de Next, sustituye ese árbol en `event.state` solo en recorridos dentro del mismo pathname `/dashboard/profesional`, una página cliente cuyas pantallas por query no necesitan datos del servidor. `/dashboard/pro` conserva el comportamiento de Next porque sus secciones usan el router público. Después de la corrección, recargar, cerrar, abrir y pulsar Atrás ya no genera peticiones RSC ni recargas.
- **Verificación:** `tsc` 0; eslint del archivo 0. `pro-simplified-navigation`: chromium-desktop 2 pasadas ok con el código final (más 1 ok antes de acotar la ruta). En la primera corrida falló un paso posterior: `tab=jobs` volvió a `home`, una carrera de rol en `setTab` ajena a Atrás. webkit-mobile 2/2 ok. `pro-independent-space`, `pro-agenda-operations` y `pro-job-workspace`: 5/5 ok en cada perfil. Logs en `$S/navfix2-*.log`; respaldo en `$S/navfix-backup/`.


## Ronda 4A (2026-11-13)

Paridad funcional con Houzz Pro (solo funciones y flujos; sin marca, textos ni diseño de Houzz). Sin commits, envíos reales, cobros ni emisión fiscal. Respaldos previos a cada edición: `$S/round4a-backup/` (misma ruta relativa). Insumo: «Brechas vs Houzz» 2, 3, 4 y 10 de `$S/walkthrough/report.md`.

### 1. Página de proyecto con widgets (Resumen)
- `src/components/pro/work-overview.tsx` (nuevo; sustituye a `work-summary-blocks.tsx`, borrado) y `JobWorkspace` (`overview`, arriba del Resumen). Seis widgets en cuadrícula (1 columna en teléfono, 2 en tableta, 3 desde 1280 px): **Cliente** (nombre, teléfono `proPhone`, correo, dirección, estado de la cuenta vinculada / invitación pendiente / sin cuenta; → Vista del cliente), **Próximos pasos** (los de la Ronda 2), **Cronograma y tareas** (fechas o plan, 5 próximas tareas abiertas con vencidas, 3 fechas clave; → cronograma, tareas), **Finanzas** (acordado, facturado, abonos, saldo de la fórmula única, a favor, costos registrados, comprometido en OC, resultado con su base; → Costos y pagos), **Actividad reciente** (últimos archivos, resúmenes del día, avances y extras; cada uno abre su sección) y **Pendientes** (tareas abiertas/vencidas, pendientes finales, selecciones esperando al cliente, extras propuestos, contratos sin respuesta, cotizaciones sin respuesta, montos previstos sin definir; cada línea abre su sección).
- Cada widget hace su propia petición (`/api/pro/work-overview?workId&part=client|schedule|finance|activity|open`) y tiene sus propios estados de carga, error con «Reintentar» y vacío; se refresca al volver a la ventana y al cambiar de sección. Conserva los marcadores de la Ronda 2 (`data-work-summary-blocks`, `data-work-summary-block=next|figures|schedule`, `data-work-summary-step`, `data-work-summary-balance`).
- SQL `docs/pro/sql/work-overview-local.sql` (`pro_work_overview_read(p_actor,p_work,p_part)`, solo lectura, security invoker, solo `service_role`): reutiliza `pro_work_header_facts`, `pro_work_client_link_json`, `pro_work_account` (fórmula única, sin bifurcarla) y el resumen de `pro_work_costs_read` (mismos costos/resultado que Costos y pagos). «Facturado» = documentos de cobro (borradores de factura) no archivados del trabajo: no hay facturas emitidas en el entorno local.

### 2. Vista previa real del cliente
- «Vista del cliente › Vista previa» ya no es una lista: renderiza `ClientWorkSections` (`src/components/pro/client-work-sections.tsx`, nuevo), el mismo árbol que ve el cliente en «Mis proyectos» (`appointment-requests-workspace.tsx` ahora lo usa también), dentro de un `fieldset disabled` (no se puede aprobar, comentar ni descargar en nombre del cliente) y se vuelve a montar en cada revisión guardada. Muestra la configuración **guardada**; si hay cambios sin guardar lo dice. Sin cliente vinculado conserva la lista de secciones con una explicación.
- Mismos datos: cada lector del cliente (`?requestId=`) pasa por `proCustomerReader` (`src/lib/pro/route-common.ts`) → SQL `pro_client_preview_actor`: si quien pide es el cliente, sigue igual; si es la dueña del trabajo de esa solicitud (con Pro activo), el lector corre **como ese cliente**; en otro caso, nada cambia. Solo en GET (avances, resúmenes del día y sus archivos publicados, archivos, montos previstos, selecciones, tableros, cronograma, pendientes finales y su imagen, contratos, extras, constancia, cotizaciones de la solicitud, vista del cliente, finanzas). Las escrituras del cliente siguen con el actor real y se rechazan para la dueña.

### 3. Finanzas en la vista del cliente
- Nueva sección opcional **Finanzas** (`show_finances`, **apagada por defecto** como todas las opcionales; ayuda «Apagada por defecto…» coherente con el historial vacío). `src/components/pro/client-finances.tsx`, `/api/pro/client-finances`, `src/lib/pro/client-finances.ts` (esquema estricto). SQL `docs/pro/sql/client-view-finances-local.sql`: columna, `pro_client_dashboard_settings_json/_read/_mutate` con `showFinances` opcional (las llamadas antiguas conservan el valor; CAS 40001→409; `actionId` idempotente) y `previewRequestId`; `pro_client_finances_client_read`: cotizaciones compartidas con **ese** cliente para el proyecto (título, versión, estado, total), documentos de cobro (título, fecha, total), abonos (fecha, medio, anulado) y resumen con `pro_work_account`. Nunca devuelve costos, márgenes, notas, etiquetas ni referencias.

### 4. Estado de cuenta imprimible
- `/api/pro/client-statement-print?clientId&lang` + `src/lib/pro/client-statement-print.tsx` (mismo patrón que la OC/recibo impresos: HTML con CSP y nonce, logo aprobado, ES/EN, móvil en tarjetas, `@media print`). Mismas cifras y movimientos que la pantalla (`pro_client_statement_page`, hasta 50 páginas = 1.000 movimientos; si la versión cambia entre páginas responde 409 en lugar de mezclar). En el estado de cuenta: «Imprimir o guardar PDF» y «Copiar enlace» (aclara que el enlace solo abre con la sesión del dueño). No se envía nada.

### 5. Cotizaciones: costo interno, margen, secciones y total por línea
- Línea con dos claves **opcionales**: `unitCostCents` (solo dueño) y `group` (sección). `src/lib/pro/private-estimates.ts` (`privateEstimateLineMargin`, `privateEstimateGroups`, tipo `PrivateEstimateCustomerLine`); SQL `docs/pro/sql/private-estimate-line-cost-local.sql` (relaja solo la comprobación de claves de `pro_private_estimate_totals` y valida las dos nuevas; los totales no cambian; `pro_work_takeoff_line` conserva costo y sección al reenviar una medición).
- Editor: campo «Sección (opcional)» (una línea nueva hereda la sección anterior), **total por línea**, «Costo unitario interno (opcional)» dentro de opciones con la nota «Solo usted lo ve…», franja interna por línea (costo, margen y %), «Subtotales por sección» y bloque «Interno (solo usted lo ve)» con costo, margen y cuántas líneas no tienen costo.
- Vista previa del dueño (= lo que verá el cliente) y PDF del borrador: total por línea, cabecera y subtotal por sección; **sin costo** (el PDF elimina `unitCostCents` antes de maquetar; el tipo del documento lo excluye). Publicaciones y sus copias se construyen campo a campo en SQL: nunca llevan el costo (probado en SQL y E2E); el esquema TS de la publicación lo omite.
- «Otro» antes de «Recomendación»: no es de la cotización; son los canales de origen, ordenados por `id` (`advertising, direct, other, referral…`) con paginación por cursor sobre `id`. Cambiar el orden exige cambiar el cursor de `pro_lead_origin_channels_page`: no es trivial, queda pendiente.

### Specs ajustadas (sin debilitar)
- `pro-client-dashboard.spec.ts`: la vista previa ya no refleja el borrador sin guardar (cambio pedido). Ahora exige `fieldset` deshabilitado, aviso de cambios sin guardar, mensaje guardado real, y tras guardar el mensaje nuevo + el avance compartido real y la ausencia de archivos; cierra la vista previa antes de contar el historial.
- `pro-private-estimates-api.spec.ts`: la Ronda 3 cambió «estimate»→«quote» solo en el valor esperado de un título que la propia spec escribe («Source changed while private estimate waited»); se alineó el esperado con lo escrito (fallaba antes de esta ronda).

### Specs nuevas
- `tests/e2e/pro-round4a.spec.ts` (4 pruebas × ES/EN): (1) widgets vacíos, con datos (₡600.000 facturado, saldo ₡1.100.000 = `/api/pro/client-balance`, costos ₡0, cuenta vinculada, «1 cotización esperando respuesta» que abre Cotizaciones), un widget que falla (500 simulado) sin afectar a los demás y se recupera con «Reintentar», columnas 1/2/3 según ancho; guardas 403/400. (2) Vista previa real: avance compartido real visible, Finanzas ausente mientras está apagada, controles deshabilitados, aviso de cambios sin guardar; tras guardar Finanzas aparece con las mismas cifras. (3) El cliente ve las mismas finanzas; la respuesta JSON es exactamente el resumen esperado y no contiene costo, valor del costo, margen, etiquetas ni notas; la dueña obtiene el mismo JSON (vista previa); un tercero 404. (4) Estado de cuenta: enlace de impresión, copiar enlace, HTML 200 con saldo y sin costo, tercero sin acceso, cero notificaciones. (5) Cotización: costo inválido → 400; editor con total por línea ₡226.000, costo ₡123.456,70, margen ₡76.543,30 (38,3 %), subtotales ₡282.500/₡113.000, «2 líneas sin costo no se incluyen»; cambiar el costo actualiza el margen (₡50.000, 25 %) y se guarda (fila con `unitCostCents` 1500000 y secciones); vista previa con totales y secciones sin costo/margen; ninguna publicación almacenada contiene el costo.
- SQL `$S/round4a-sql/round4a-test.sql` (psql loopback, `begin … rollback`): 45 PASS / 0 FAIL (`round4a-test.out`): actor de vista previa (cliente, dueña, otra dueña, otro cliente, solicitud inexistente, dueña sin Pro), lectores con el actor resuelto, interruptor de Finanzas (por defecto apagado, tipo inválido 22023, CAS 40001, llamada antigua sin la clave lo conserva, recibo idempotente), totales con costo/sección (inválidos 22023, clave desconocida sigue rechazada), **publicación real (`pro_private_estimate_publication_mutate`) sin la clave ni el valor del costo ni la sección**, finanzas del cliente (fórmula única = `pro_work_account`, facturado, abono anulado marcado, cotización compartida, **sin costo/margen/etiquetas/notas**, la vista previa de la dueña idéntica, terceros nulos, lector de cotizaciones del cliente sin el costo) y resumen por partes (IDOR nulo, cliente 42501, parte inválida 22023, sin permisos para anon/authenticated).

### Comandos y resultados
- `npx tsc --noEmit -p tsconfig.json` → 0. ESLint de los 38 archivos tocados (`$S/round4a-touched.txt`) → 0 errores, 0 avisos.
- `node scripts/pro/local-sql-manifest.mjs --check` → 0; `node scripts/pro/verify-local-preparation-manifest.mjs` → PASS (125 módulos, 126 pasos, 258 dependencias); `node scripts/pro/verify-local-preparation-db.mjs` (PGlite, instala y reaplica todo) → PASS. `verify-private-estimates`, `-publication-copy`, `-destination-copy`, `-work-contracts`, `verify-client-statement-db` → PASS. `verify-private-estimate-publications.mjs` falla en «raw code is exactly 32 bytes of hexadecimal»: espera el código de 64 hex anterior a la Ronda 2 (código legible); no lo toca esta ronda (solo se agregó el `omit` del costo).
- Módulos aplicados al entorno local con `node $S/apply-one.mjs`: `client-view-finances-local.sql`, `work-overview-local.sql`, `private-estimate-line-cost-local.sql`.

| Spec (workers 1, 127.0.0.1:3185) | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round4a (nueva, 4) | 4/4 | 4/4 |
| pro-client-dashboard (ajustada) | 2/2 | 2/2 |
| pro-work-client-invite | 3/3 | 3/3 |
| pro-round2-ux | 5/6 (licitaciones, compilación en frío) → repetición 5/6 (otro caso: `invoice-drafts` >15 s) → «Round 2 company» solo 2/2; las 6 pruebas pasaron al menos una vez | 6/6 |
| pro-job-workspace | 2/2 | 2/2 |
| pro-client-operations | 1/1 | 1/1 |
| pro-client-statement / -english | 1/1 · 1/1 | 1/1 · 1/1 |
| pro-invoice-drafts | 1/1 | 1/1 |
| pro-private-estimates-journey | ok | ok |
| pro-private-estimates-api | 3/4 (texto Ronda 3) → con el esperado corregido 4/4 | 4/4 |
| pro-private-estimate-publications-journey / -api | 2/2 · 5/5 | ok · ok |
| pro-private-estimate-work-journey | 2/2 | ok |
| pro-private-estimates-pdf | 2/2 | ok |
| pro-takeoffs | 2/2 | ok |
| pro-allowances / pro-selections / pro-contracts | 2/2 · 2/2 · 2/2 | ok · ok · ok |
| pro-work-figures | 2/2 | ok |
| pro-appointment-requests | 1/1 | ok |

Notas de infraestructura: el servidor de desarrollo (≈5 GB RSS, no iniciado por esta ronda, no se reinició) tuvo compilaciones en frío de 10–15 s; en las primeras corridas de `pro-round4a` aparecieron «No se pudo comprobar el acceso a Pro» y la puerta de sesión (8 s) del cliente; la spec precalienta `session-mfa`/`registration-state` de la cuenta cliente como ya hace el fixture con la dueña. La falla de `pro-round2-ux` [es] en chromium fue «No se pudieron cargar las licitaciones» en la primera compilación de `/api/pro/bids` (ruta no tocada).

### Capturas revisadas (Read) — `$S/round4a-shots/`
Resumen (escritorio 3 columnas ES/EN, teléfono apilado), vista previa real con Finanzas, Finanzas del cliente (WebKit móvil EN), estado de cuenta con «Imprimir o guardar PDF»/«Copiar enlace» y su copia impresa EN, editor de cotización (total por línea, costo/margen, subtotales por sección, bloque interno) y vista previa de la cotización con secciones y sin costo.

### Pendiente y por qué
- **Secciones en la versión compartida**: la instantánea publicada es inmutable y se compara byte a byte (hash) en tres módulos SQL (`private-estimate-publications`, `-publication-copy`, `-work`) y dos TS; agregar `group` exige reescribir esas proyecciones juntas con sus pruebas. Hoy el cliente ve las líneas sin encabezado de sección. El documento compartido en pantalla (`private-estimate-publication-document.tsx`) tampoco muestra aún el total por línea (el PDF compartido sí): se deja para no romper las búsquedas exactas de importes de las specs de publicación sin volver a validarlas.
- **Editor de disposición de widgets** (mover/ocultar) y widgets de clima/fotos: fuera del núcleo.
- **Facturas por cliente opt-in individual**: Finanzas muestra todos los documentos de cobro no archivados del trabajo (no existen facturas emitidas en local); falta un interruptor por documento.
- **Enlace compartible sin sesión** del estado de cuenta: exigiría un token público con vencimiento; por ahora solo imprimir/guardar PDF y copiar el enlace autenticado.
- **«Otro» antes de «Recomendación»** (canales de origen ordenados por `id` con cursor por `id`): cambiar el orden requiere un cursor nuevo en `lead-origins-local.sql`; no trivial.
- **Extras y cambios** del cliente vinculado por invitación siguen respondiendo 404 (pendiente de la Ronda 1); la vista previa muestra lo mismo que el cliente.
- `verify-private-estimate-publications.mjs` desactualizado respecto del código legible de la Ronda 2.

## Ronda 4B (2026-11-13)

Paridad funcional con Houzz Pro (solo funciones y flujos; sin marca, textos ni diseño de Houzz). Sin commits, envíos reales, cobros, avisos ni emisión fiscal. Respaldos previos a cada edición: `$S/round4b-backup/` (implementación) y `$S/round4b-fix-backup/` (correcciones de QA), misma ruta relativa. Seis puntos; los SQL nuevos están registrados en `scripts/pro/local-sql-manifest.mjs` y se aplicaron al entorno local con `node $S/apply-one.mjs`.

### 1. Facturar desde el trabajo (líneas, avance, horas y gastos)
- SQL `docs/pro/sql/work-billing-local.sql` (nuevo; registrado en el manifiesto después de `private-estimate-line-cost-local.sql`, 13 dependencias). `pro_invoice_billing_sources(owner, work)` devuelve, para un trabajo propio: importe acordado, saldo del cliente y abonos **de `pro_work_account`** (fórmula única, sin bifurcar), líneas de la cotización privada aceptada que continuó en el trabajo (con total por línea y % ya facturado), o el importe acordado cuando no hay cotización aceptada; horas facturables (`pro_time_entries` detenidas, facturables y con tarifa; minutos de la **línea viva** del libro único `pro_work_cost_entries`) y gastos facturables vinculados al trabajo; huella (`fingerprint`) y borradores creados desde el trabajo.
- `pro_invoice_billing_create` (idempotente por `requestId`, mismo candado de dueño que todos los escritores de factura, huella distinta → 40001/409): arma las líneas y llama a la **misma cadena de escritura de la factura directa** (`pro_invoice_extras_save` `create_direct`: receptor, datos fiscales, totales e IVA) y vincula el borrador al trabajo (`work_id`; la restricción `direct_check` ahora admite trabajo, el resto del contrato directo no cambia). Línea de cotización con %: cantidad igual, precio × %, descuento e IVA de la línea; avance del acordado: «Trabajo — 40 %» con IVA «Por definir»; horas: «Actividad · persona · fecha · h min», IVA predeterminado del proyecto si existe; gasto: concepto · proveedor · fecha, con IVA separado cuando el gasto lo incluye.
- Doble facturación imposible: `pro_invoice_billing_items` (activo mientras el borrador no esté archivado); índice único parcial para horas y gastos; disparador que limita cada línea / el acordado a 100 % entre borradores activos y no mezcla «por líneas» con «por acordado» en un mismo trabajo. Archivar el borrador (el «Archivar» existente) **libera** sus orígenes; restaurarlo vuelve a comprobar y se rechaza (23505) si otro borrador ya los facturó. Una copia (duplicar) no arrastra orígenes. Las horas y gastos facturados quedan **fijos**: anular/editar la hora en Costos, desvincular el gasto o cambiar su importe/fecha/concepto/IVA/facturable responde 400 con motivo claro hasta archivar el borrador.
- API `src/app/api/pro/work-billing/route.ts` (route-common, mismo origen, límite de tamaño y de frecuencia; 409 «lo que se puede facturar cambió»). Lib `src/lib/pro/work-billing.ts`. UI `src/components/pro/work-billing.tsx` («Facturar desde el trabajo», junto a «Preparar factura» en Costos y pagos del trabajo, `client-operations.tsx`): resumen (acordado, ya facturado del contrato, por facturar, saldo del cliente), líneas con casilla y % por línea, «Avance: mismo % para todas las líneas», avance del acordado, horas y gastos sin facturar (avisa cuántos están en otro borrador), título/notas, estimado y lista de borradores del trabajo (archivado = no cuenta). Al crear abre el borrador en el editor existente.
- Totales e IVA: el borrador calcula con el motor de facturas existente (el estimado de la ventana usa el mismo redondeo). El saldo del cliente **no** cambia por crear borradores (prueba SQL).

### 2. Gastos facturables y horas por persona
- Gasto: `pro_expense_billing` (facturable, medio de pago: efectivo, transferencia, tarjeta, SINPE Móvil, cheque, otro; IVA incluido 13/4/2/1/0,5 %), escrito por `pro_expense_meta_save` (envuelve sin cambiar `pro_expenses_save`: mismo recibo, revisión y CAS). `pro_expense_summary` reemplazado solo con claves añadidas (facturable, medio, neto/IVA, trabajo, borrador que lo factura, comprobante).
- Comprobante: `pro_expense_receipts` + cubo privado `pro-expense-receipts` (3 MB, JPG/PDF, política restrictiva), ruta `src/app/api/pro/expense-receipts/route.ts` con la misma normalización/límites de archivos (`normalizeCompanyFile`, `canonicalWorkFileName`, base64 acotado); cada descarga se reautoriza en SQL (solo el dueño), sin URL de almacenamiento. UI `src/components/pro/expense-billing.tsx` en el detalle del gasto (adjuntar/reemplazar/quitar, descarga) y campos en el formulario (`expenses-workspace.tsx`; nombres añadidos a la recuperación del borrador `expense-write-recovery.ts`).
- Horas: actividad ya existía; persona nueva (`pro_time_entry_people`, `pro_time_people`: dueño + miembros activos del Equipo del trabajo; `pro_time_mutate_person` guarda la persona en la misma transacción que la hora). `pro_time_entry_json` reemplazado con claves añadidas (persona, borrador que la factura). UI `time-tracking.tsx`: selector «Persona» (Sin indicar / Yo — nombre / miembros) en cronómetro y hora manual; persona y «En borrador de factura» en la lista; sin «Anular» mientras está facturada.

### 3. Responsable de la tarea desde el Equipo
- SQL `docs/pro/sql/work-tasks-gantt-local.sql` (parte 1): `pro_work_task_assignees(actor, work, tasks[])`, solo lectura, security invoker, solo `service_role`: miembros del Equipo **de ese trabajo** (`grantId`, nombre, rol, vigente, `canAssign` = colaborador vigente con cuenta habilitada), personas del equipo de **otros** trabajos sin acceso a este (solo nombre, se muestran deshabilitadas: «invítelos desde Equipo») y la asignación real de las tareas listadas (máx. 20; trabajo ajeno → nulo; sin Pro → 42501). La columna legada `assignee` (texto libre) no se toca.
- La asignación real la escribe el escritor existente del Equipo (`pro_team_task_assign`: CAS por revisión de la tarea, `actionId` idempotente, sin avisos, no concede permisos). `work-tasks.tsx`: el campo «Responsable (opcional)» es ahora un selector (Sin responsable / Equipo de este trabajo / Otros miembros deshabilitados); el texto anterior se muestra «Texto anterior (solo referencia)» con «Quitar texto anterior»/«Conservarlo»; guardar solo el responsable usa el escritor del Equipo, guardar campos y responsable escribe la tarea y luego asigna.
- **Corrección QA (esta ronda):** si la respuesta del guardado se perdía, la recuperación «Comprobar guardado» confirmaba la tarea pero descartaba en silencio el responsable elegido. Ahora `recover()` aplica, tras confirmar la escritura de crear/editar de ese mismo borrador, la misma elección por el escritor del Equipo (CAS con la revisión confirmada).

### 4. Gantt: crear y arrastrar
- SQL `work-tasks-gantt-local.sql` (parte 2): `pro_work_timeline_task_create` crea la tarea y su período previsto en **una transacción** con los dos escritores existentes (`pro_work_tasks_mutate` `create` y `pro_work_schedule_mutate` `task_plan`), con `actionId` internos derivados del del llamador (un reintento reproduce los dos recibos), CAS por revisión del plan (40001 → 409, sin tarea huérfana). Ninguna tabla nueva ni aviso.
- `work-timeline.tsx` / `work-plan.tsx` / `work-schedule.ts` / rutas `work-tasks` y `work-schedule`: «Nueva tarea» en el cronograma (título, inicio, fin, fase), arrastrar la barra mueve el período, arrastrar un borde cambia inicio o fin (nunca cruza el otro extremo; `draggedPeriod`), el clic que termina un arrastre no abre el editor, plan cambiado en otra pestaña → 409 y nada cambia; ruta por teclado a fechas y predecesoras. Solo el dueño edita; el equipo sigue con lectura.

### 5. Portal de licitaciones: adjuntos del proveedor y aviso de adjudicación
- SQL `docs/pro/sql/bid-portal-files-local.sql` (sobre `bid-vendor-portal-local.sql`): mismo contrato de archivos que los del trabajo (cubo privado propio `pro-bid-portal-files`, JPG recodificado ≤ 2 MB o PDF ≤ 3 MB, nombre canónico, SHA-256 del original y de lo guardado, reserva → subida → verificación → listo). Lectura **solo** del dueño de la licitación y del proveedor de esa invitación (sesión de portal válida, no revocada ni vencida); otro proveedor, otro dueño o anónimo no ven nada. El proveedor sube/quita los suyos mientras la licitación está abierta y antes del cierre (día de Costa Rica); 10 activos por proveedor y paquete, 50 reservas por enlace. Un proveedor con adjuntos no se puede quitar del paquete (como con las ofertas). Aviso de adjudicación: total, algunas partidas (con su total) o no seleccionado; cancelada lo dice. Nunca otros proveedores, precios ni comparación. Nada se envía.
- Rutas `src/app/api/pro/bid-portal/files/route.ts`, `bid-portal/route.ts`, `bid-portal-links/route.ts`; `bid-vendor-portal.tsx` (adjuntar/quitar, aviso), `bid-portal-links.tsx` (archivos del proveedor para el dueño), `bid-portal-server.ts`, `bid-portal.ts`.
- **Corrección QA (esta ronda):** el control de archivo del portal medía 42 px (cubría solo el interior del botón de 44 px con borde); ahora cubre el botón completo, borde incluido (`pro-bid-portal` exige ≥ 44 px en todos los controles).

### 6. Pendientes menores
- **Dirección del proveedor** (`company-vendors-local.sql`: columna opcional ≤ 300, en lectura, búsqueda y escritura; un cliente antiguo sin la clave conserva la guardada) y campo en `company-vendors.tsx` / `company-vendors.ts`.
- **Etapa de la oportunidad manual al compartir su cotización** (`lead-shared-quote-stage-local.sql`, reemplaza `pro_lead_commercial_progress`/`_sources` con las mismas firmas): pasa a «Cotización enviada» cuando una cotización creada desde la oportunidad se comparte (enviada/aceptada/rechazada, no borrada), igual que las solicitudes públicas; convertir en trabajo sigue siendo «Ganada»; la huella incluye esa evidencia.
- **Cliente creado desde la oportunidad elegido al volver** (`src/lib/pro/created-customer.ts`, `manual-lead-editor.tsx`, `business-panel.tsx`): marca en `sessionStorage` (misma cuenta, misma pestaña, ≤ 2 h), nada en el servidor.
- **Extras y cambios para el cliente vinculado por invitación** (`work-changes-invite-local.sql`, reemplaza `pro_work_changes_page`/`_mutate` con las mismas firmas): `pro_work_change_client` resuelve el cliente de la cita o, si no hay, el de la invitación confirmada (cuenta habilitada). Antes respondía 404. Las pruebas `pro-work-changes`/`-english` (cliente de cita) pasan sin cambios: la falla anotada al cerrar la implementación era del servidor compartido por tres agentes, no del SQL.
- **Carrera `?tab=jobs`** (`src/app/[locale]/dashboard/profesional/page.tsx`): si el registro profesional llega vacío una vez, el enlace directo ya no se reescribe a «Mis proyectos»; «Empleos» abre al llegar.
- `scripts/pro/verify-private-estimate-publications.mjs` actualizado al código legible de la Ronda 2 (acepta también el de 64 hex anterior).

### Specs ajustadas (sin debilitar)
- `pro-work-tasks.spec.ts`: el campo «Responsable (opcional)» ya no es texto libre. La spec crea un colaborador real del trabajo (invitación + aceptación por la API de Equipo con la sesión del miembro), lo elige en el selector, exige que el borrador y la recarga conserven la elección, que la escritura perdida cree la tarea **sin** texto legado y que «Comprobar guardado» aplique luego la asignación real (`pro_team_task_assignments`, revisión 2, aviso «Responsable asignado.»); el historial suma esa actualización (5 filas, revisión final 7). Además agrega el caso legado: una tarea con texto anterior creada por la API muestra «Texto anterior…», conserva el texto al editar solo el título y nunca se convierte en asignación.
- `pro-work-cost-write-recovery.spec.ts`: la espera retenida de la lista de clientes también retenía la lectura del historial del cliente; si la página la abandona y la vuelve a pedir, Playwright rechaza responder la retenida («Route is already handled!»). Solo ese caso se tolera; cualquier otro error sigue fallando (falla intermitente desde la Ronda 1).

### Specs y pruebas nuevas
- `pro-round4b-billing` (4), `pro-round4b-tasks` (2), `pro-round4b-portal` (2), `pro-round4b-leftovers` (7).
- SQL (psql loopback, `begin … rollback`): `$S/round4b-sql/round4b-billing-test.sql` 36 PASS, `round4b-portal-test.sql` 58 PASS y **nuevo** `round4b-tasks-gantt-test.sql` 28 PASS / 0 FAIL (opciones de responsable: miembros del trabajo, colaborador asignable, lector/deshabilitado/revocado no, otros trabajos solo por nombre, sin asignación ajena, dueño ajeno, trabajo inexistente nulo, sin Pro 42501, >20 tareas o id nulo 22023, asignación del Equipo reflejada sin tocar el texto legado, lector/deshabilitado rechazados, revisión vieja 40001; creación desde el Gantt: tarea + plan, cabeza del plan +1, reintento idéntico idempotente, mismo `actionId` con otro título 22023, revisión vieja 40001 sin tarea, fin antes del inicio rechazado sin tarea, claves de más/de menos 22023, otro dueño solo en su trabajo, trabajo inexistente, sin Pro 42501, sin permisos para anon/authenticated).

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint de los 48 archivos TS/MJS tocados en la Ronda 4B (`$S/r4bf-touched.txt`) → 0 errores, 0 avisos.
- `node scripts/pro/local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (130 módulos, 131 pasos, 288 dependencias); `verify-local-preparation-db.mjs` (PGlite, instala y reaplica los 130 módulos) → PASS.
- SQL de la ronda repetidas al final: billing 36 PASS, portal 58 PASS, tareas/Gantt 28 PASS (0 FAIL).
- Corrida completa secuencial (69 specs; servidor reiniciado solo cuando superaba ~4,8 GB o lo hacía Next por umbral de memoria). Primera pasada: chromium-desktop 147/154, webkit-mobile 149/154; toda falla se repitió una vez y pasó (las reales se corrigieron antes de repetir, ver abajo). `pro-round4b-billing` se repitió además tras ajustar la captura: 4/4 en ambos perfiles.

| Spec (workers 1, 127.0.0.1:3185) | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-bid-portal | 2/2 | 2/2 |
| pro-bids | 2/2 | 2/2 |
| pro-client-operations | 1/1 | 0/1 → repetición 1/1 |
| pro-company-daily-log-files-api | 5/5 | 5/5 |
| pro-company-daily-log-files | 6/6 | 6/6 |
| pro-company-file-management | 2/2 | 2/2 |
| pro-company-file-versions | 2/2 | 2/2 |
| pro-company-files-api | 2/2 | 2/2 |
| pro-company-files | 2/2 | 2/2 |
| pro-company | 3/3 | 3/3 |
| pro-direct-invoice | 1/1 | 1/1 |
| pro-expense-revision-race | 2/2 | 2/2 |
| pro-expense-write-recovery | 2/2 | 2/2 |
| pro-expenses-english | 1/1 | 1/1 |
| pro-expenses | 1/1 | 1/1 |
| pro-independent-space | 2/2 | 2/2 |
| pro-invoice-beverages | 1/1 | 1/1 |
| pro-invoice-detail | 1/1 | 1/1 |
| pro-invoice-drafts | 1/1 | 1/1 |
| pro-invoice-extras | 1/1 | 1/1 |
| pro-invoice-management | 1/1 | 1/1 |
| pro-invoice-payments | 1/1 | 1/1 |
| pro-invoice-preparation | 1/1 | 1/1 |
| pro-invoice-recurrence | 1/1 | 1/1 |
| pro-invoice-tax | 1/1 | 1/1 |
| pro-job-workspace | 2/2 | 2/2 |
| pro-lead-commercial-progress-api | 4/4 | 4/4 |
| pro-lead-commercial-progress-journey | 4/4 | 4/4 |
| pro-navigation | 2/2 | 2/2 |
| pro-project-planning | 3/3 | 3/3 |
| pro-request-pipeline-api | 5/5 | 5/5 |
| pro-request-pipeline | 4/4 | 3/4 → repetición 4/4 |
| pro-round2-ux | 6/6 | 6/6 |
| pro-round4a | 4/4 | 2/4 → repetición 4/4 |
| pro-round4b-billing | 4/4 | 4/4 |
| pro-round4b-leftovers | 7/7 | 7/7 |
| pro-round4b-portal | 2/2 | 2/2 |
| pro-round4b-tasks | 1/2 → repetición 2/2 | 2/2 |
| pro-simplified-navigation | 1/1 | 0/1 → repetición 1/1 |
| pro-task-center-actions | 0/2 → repetición 2/2 | 2/2 |
| pro-task-center-batch | 4/4 | 4/4 |
| pro-task-center-planning-api | 1/1 | 1/1 |
| pro-task-center-planning | 0/2 → repetición 2/2 | 2/2 |
| pro-task-center | 3/3 | 3/3 |
| pro-team-api | 1/1 | 1/1 |
| pro-team-assignments-api | 1/1 | 1/1 |
| pro-team-assignments | 2/2 | 2/2 |
| pro-team-task-discussion-api | 1/1 | 1/1 |
| pro-team-task-discussion | 2/2 | 2/2 |
| pro-team-task-mentions-api | 1/1 | 1/1 |
| pro-team-task-mentions | 2/2 | 2/2 |
| pro-team | 6/6 | 6/6 |
| pro-time-tracking | 2/2 | 2/2 |
| pro-work-budget-journey | 3/3 | 3/3 |
| pro-work-changes-english | 1/1 | 1/1 |
| pro-work-changes | 1/1 | 1/1 |
| pro-work-client-invite | 3/3 | 3/3 |
| pro-work-cost-write-recovery | 1/2 → repetición 2/2 | 2/2 |
| pro-work-cost-write-reload | 1/1 | 1/1 |
| pro-work-costs-english | 0/1 → repetición 1/1 | 1/1 |
| pro-work-costs | 1/1 | 1/1 |
| pro-work-figures | 2/2 | 2/2 |
| pro-work-milestones-api | 1/1 | 1/1 |
| pro-work-milestones | 2/2 | 2/2 |
| pro-work-schedule-api | 1/1 | 1/1 |
| pro-work-schedule | 4/4 | 4/4 |
| pro-work-tasks | 3/3 | 3/3 |
| pro-work-timeline-api | 1/1 | 1/1 |
| pro-work-timeline | 2/2 | 2/2 |

Fallas de la primera pasada y causa: `pro-task-center-actions` y `pro-task-center-planning` (chromium, ambas ES/EN) eran **regresiones reales de la Ronda 4B** (borrador de tarea reescrito con las claves nuevas; aserción del texto libre obsoleta) → corregidas, ver «Regresiones». `pro-work-cost-write-recovery` → corrección de producto y de la espera retenida de la spec. `pro-work-costs-english` falló durante la recarga en caliente de `business-panel.tsx` (edición en curso). `pro-round4b-tasks` [es] y `pro-simplified-navigation`, `pro-client-operations`, `pro-request-pipeline` [es], `pro-round4a` (webkit) fallaron justo después de un reinicio del servidor (compilación en frío: `aria-busy` del cronograma, botón deshabilitado mientras carga, peticiones >15 s); todas pasaron al repetir sin cambios.

### Regresiones encontradas y corregidas en esta revisión
1. **Borrador de tarea guardado antes de la Ronda 4B reescrito** (`work-tasks.tsx`): al restaurar, el borrador se volvía a escribir con `assigneeGrantId`/`baseGrant`, rompiendo la conservación exacta del borrador que exige el Centro de tareas. Ahora, si el borrador guardado se lee como el mismo editor, se conservan sus bytes.
2. **Responsable elegido perdido tras «Comprobar guardado»** (`work-tasks.tsx`, `recover()`), ver punto 3.
3. **Costos del trabajo visibles antes de conocer la cuenta** (`business-panel.tsx`): «Operaciones del cliente» se montaba con la identidad de cuenta vacía mientras la lista de clientes seguía cargando; ahora espera la cuenta (como ya hacía la Agenda).
4. **Control de archivo del portal a 42 px** (`bid-vendor-portal.tsx`), ver punto 5.
5. Specs con comportamiento obsoleto: `pro-work-tasks` y `pro-task-center-planning` (el responsable ahora es el miembro real: el selector muestra el `grantId` y el texto anterior queda en «Texto anterior…»); `pro-round4b-billing` tomaba la captura del borrador mientras cargaba (ahora espera «Editar detalle de factura»).
- No regresión: `pro-work-changes`/`-english` (sospecha sobre `work-changes-invite-local.sql`) y `pro-work-milestones` [en], `pro-project-planning` [en], `pro-company` (plantillas «Cargando…»), `pro-expenses` (/es), `pro-invoice-detail`, `pro-time-tracking` [en], `pro-work-budget-journey`: pasan solos; las fallas anotadas venían de tres agentes compartiendo el servidor y de reinicios de Next por umbral de memoria a mitad de prueba («Server is approaching the used memory threshold, restarting...» en el registro).

### Capturas revisadas (Read) — `$S/round4b-shots/`
Retomadas en esta revisión: `tasks-gantt-dragged-*` y `tasks-gantt-dependency-*` (escritorio EN y teléfono ES/EN: barra movida al 15–18 nov, predecesora «Después: Instalar gabinetes 4B (cocina)» en la fila y la tarjeta) y `billing-draft-*` (borrador cargado: total ₡312.500, «Editar detalle de factura», receptor; antes mostraba «Preparando datos…»). Revisadas también `portal-vendor-files-es-webkit-mobile` («Agregar adjunto» a 44 px, dos adjuntos) y el resto de la serie de la ronda (facturación, gasto/comprobante, persona de la hora, pendientes menores, portal).

### Pendiente y por qué
- La predecesora de una tarea sin período previsto no dibuja flecha (no tiene barra en el cronograma); se ve como texto «Después: …».
- Facturación: solo borradores (sin emisión fiscal ni envío); sin calendario de cuotas por hitos.
- Horas: sin fichaje de terceros ni vista global entre trabajos (fuera de alcance).
- El servidor de desarrollo se reinicia solo por umbral de memoria de Next; las corridas largas siguen expuestas a compilaciones en frío (ver repeticiones).

## Ronda 5 Plan de pagos (2026-11-13)

Paridad funcional con la «financiación al cliente» y el «calendario de pagos / hitos» de Houzz Pro, resuelta con una **decisión propia**: Houzz integra un prestamista; ContrataCR **no presta, no cobra intereses ni involucra terceros**. El plan de pagos es el calendario que el profesional ofrece a su propio cliente para el saldo de un trabajo. Sin marca, textos ni diseño de Houzz. Sin commits, envíos reales, cobros, avisos por correo/SMS ni emisión fiscal. Respaldos previos a cada edición en `$S/round5-backup/` (misma ruta relativa).

### Qué hace
- **Crear** (Costos y pagos del trabajo → «Plan de pagos»): total (por defecto el saldo actual del cliente de `pro_work_account`), prima opcional con fecha y cuotas **iguales** (semanal, quincenal, mensual; colones enteros y la **última cuota absorbe el redondeo**; mes a mes conserva el día o usa el último día del mes) o **a la medida** (monto por cuota y vencimiento en una fecha, en una **fecha clave** del cronograma o **al completar una tarea**). «Personalizar estas cuotas» copia el cálculo automático; «Ajustar la última cuota» cierra la diferencia. Prima + cuotas deben sumar **exactamente** el total (servidor y pantalla). Cargo fijo y recargo por cuota vencida opcionales, como montos simples que se muestran como condiciones (no se suman solos al saldo). Texto de condiciones para el cliente.
- **Editar** = nueva **revisión inmutable** (la anterior y su aceptación se conservan); **cancelar** con motivo (se conserva en el historial). Un plan activo por trabajo; CAS por revisión (40001 → 409), `actionId` idempotente, historial inmutable (`pro_payment_plan_history`).
- **Abonos aplicados (derivado, nunca guardado):** abonado al plan = abonos del libro `pro_client_entries` después de crear el plan (`paidCents` actual − `paidCents` al crear, mínimo 0, máximo el total), repartidos **a la cuota más antigua primero**. Un abono anulado se reasigna solo. La **fórmula del saldo no cambia** (prueba SQL y E2E). Estado por cuota: pendiente, abonada en parte, pagada, vencida (fecha de vencimiento anterior a hoy en **America/Costa_Rica**; el día del vencimiento no está vencida). Fecha clave: vence en su fecha; tarea: vence el día de Costa Rica en que se completó.
- **Borrador de factura por cuota** (opcional): misma cadena de la factura directa de la Ronda 4B (`pro_invoice_extras_save` `create_direct`, vinculada al trabajo) con una fila `installment` en `pro_invoice_billing_items`. Una cuota se factura **una sola vez** mientras su borrador esté activo (índice único); un trabajo se factura **por cuotas o por líneas/avance, nunca ambos** (disparador nuevo, ambos sentidos); archivar el borrador lo libera; restaurar un borrador de una versión anterior del plan se rechaza. Editar o cancelar el plan se rechaza (400 «Una cuota tiene un borrador de factura activo…») hasta archivarlo.
- **Vista del cliente:** nueva sección opcional «Plan de pagos» (`show_payment_plan`, **apagada por defecto**, ayuda «Apagada por defecto…»; llamadas antiguas sin la clave conservan el valor). El cliente vinculado ve total, abonado, por pagar, cuotas con estado, condiciones; nunca la base interna, ids de borradores, ids/nombres de tareas ni el saldo interno (esquema estricto). **Acepta explícitamente** la versión vigente (confirmación en dos pasos; se guarda fecha y hora, revisión, hash SHA-256 del contenido, solicitud y cuenta). Solo el cliente vinculado verificado (solicitud confirmada/completada, cuenta habilitada, sección activa) puede aceptar; la dueña (vista previa) y terceros reciben 403; un hash o revisión distintos → 409. La vista previa de la dueña usa el mismo lector (`proCustomerReader`) y queda deshabilitada.
- **Avisos en la app (sin correo/SMS):** el widget «Pendientes» del Resumen del trabajo (Ronda 4A) muestra «N cuota(s) vencida(s) del plan de pagos · ₡…», «N cuota(s) vence(n) en los próximos 7 días» y «Plan de pagos esperando la aceptación del cliente»; cada línea abre Costos y pagos. La sección del plan repite el aviso.
- **Copia imprimible ES/EN** (`/api/pro/payment-plan-print?workId&lang`, solo la dueña, CSP con nonce, sin enviar ni guardar): mismo logo compartido que el estado de cuenta, resumen, tabla de cuotas (tarjetas en teléfono), condiciones, estado de aceptación y la aclaración «Sin intereses ni terceros… No es una factura ni un comprobante fiscal».

### Archivos
- SQL nuevo `docs/pro/sql/payment-plans-local.sql` (registrado en `scripts/pro/local-sql-manifest.mjs` al final, 10 dependencias): tablas `pro_payment_plans`, `_revisions`, `_items`, `_acceptances`, `_history`, `_actions` (RLS activo, solo `service_role`, revisiones/cuotas/aceptaciones/historial/recibos inmutables); funciones `security invoker` con `pro_private_work_tools_enabled`: `pro_payment_plan_split`, `_due`, `_state`, `_read`, `_notices`, `_mutate` (create/edit/cancel/invoice), `_client_read`, `_client_mutate`; disparador `pro_payment_plan_billing_guard` y la restricción `source_type` de `pro_invoice_billing_items` ampliada con `installment`. Reemplaza `pro_client_dashboard_settings_json`/`_mutate` (de `client-view-finances-local.sql`) con las mismas firmas y solo la clave añadida `showPaymentPlan`. Aplicado al entorno local con `node $S/apply-one.mjs`.
- API `src/app/api/pro/payment-plan/route.ts` (route-common: solo desarrollo, `X-Pro-Expected-Actor`, mismo origen, 16 KiB, límite de frecuencia; GET dueña `?workId`, avisos `?workId&part=notices`, cliente `?requestId` vía `proCustomerReader`; POST dueña y `accept` del cliente) y `src/app/api/pro/payment-plan-print/route.ts`.
- Lib `src/lib/pro/payment-plan.ts` (esquemas estrictos, mismo reparto y fechas que el servidor, montos según idioma), `src/lib/pro/payment-plan-print.tsx`; `src/lib/pro/client-statement-print.tsx` solo exporta su `logo()` para reutilizarlo.
- UI `src/components/pro/work-payment-plan.tsx` (sección, editor `ProModal`, cancelación), `src/components/pro/client-payment-plan.tsx` (cliente), y cambios en `client-operations.tsx` (montaje), `client-work-sections.tsx`, `client-dashboard.tsx` + `src/lib/pro/client-dashboard.ts` (interruptor), `work-overview.tsx` + `src/lib/pro/work-overview.ts` + `src/app/api/pro/work-overview/route.ts` (avisos en «Pendientes»).

### Pruebas nuevas
- SQL `$S/round5-sql/round5-payment-plan-test.sql` (psql loopback, `begin … rollback`): **83 PASS / 0 FAIL** (`round5-payment-plan-test.out`): reparto y redondeo (900.000/7, 700.000/3, mínimo ₡1), fechas semanal/quincenal/mensual con fin de mes, invariante de suma, base de abonos previos no aplicada, saldo idéntico antes/después, vencidas por fecha CR (día del vencimiento no vence), próximas 7 días, asignación a la más antigua, parcial, abono anulado reasignado, prima exacta, validaciones a la medida (diferencia de 1 céntimo con su pista, fecha y hito a la vez, hito de otro trabajo, prima ≥ total, fechas hacia atrás, clave desconocida), CAS 40001, idempotencia y reuso de `actionId`, segundo plan activo 40001, sección del cliente apagada por defecto / interruptor / llamada antigua / tipo inválido, copia del cliente sin datos internos e idéntica a la vista previa, terceros y otra dueña sin lectura, aceptación (hash erróneo 40001, dueña y tercero 42501, idempotente, segunda 40001, inmutable), borrador por cuota (directo, trabajo, monto exacto, título «Cuota 1 de 3 · vence…», sin cambiar el saldo, repetida 23505, mezcla con avance 23505, editar/cancelar con borrador activo 22023 + pista, cuota inexistente), archivo libera, nueva revisión a la medida con fecha clave y tarea, revisión 1 intacta, inmutabilidad 23514, nueva aceptación requerida, restauración del borrador viejo 23505, contenido idéntico 22023, tarea completada → vence hoy CR, otra dueña 42501, cliente sin Pro 42501, cancelación con motivo, historial `create, accept, invoice, edit, cancel`, nuevo plan tras cancelar, trabajo cancelado 22023, sin permisos para anon/authenticated, RLS y security invoker.
- E2E `tests/e2e/pro-round5-payment-plan.spec.ts` (2 pruebas × ES/EN): (1) crear desde la UI (prima ₡200.000 + 3 mensuales; vista previa ₡333.333/₡333.333/₡333.334), estados vencida/pendiente, abono de ₡250.000 aplicado (prima pagada, cuota 1 con ₡50.000 y vencida, por pagar = saldo ₡950.000), borrador de la cuota 2 (₡333.333, trabajo, directo), segundo intento 409, cancelar con borrador 400 `invoiced`, «Abrir borrador», avisos del Resumen y su enlace, sección del cliente apagada por defecto → encendida, vista previa con «Aceptar» deshabilitado, JSON del cliente sin claves internas e igual a la vista previa, tercero 404, aceptación de dueña/tercero 403, aceptación del cliente en su página (fila guardada con hash, revisión y hora), dueña ve «Aceptado…», impresión 200 (tercero no) con total y aceptación, archivar → editar a la medida con «Ajustar la última cuota» → versión 2 «Esperando…», revisiones `[[2,false],[1,true]]`, restaurar el borrador viejo rechazado (sigue archivado), cero notificaciones, sin errores de página. (2) Guardas de API (origen, actor, clave extra, suma, tamaño), idempotencia, plan único 409, revisión vieja 409, abono anulado reasignado, avisos.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` de los 16 archivos TS/MJS tocados (`$S/round5-touched.txt`) → 0 errores, 0 avisos.
- `node scripts/pro/local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (131 módulos, 132 pasos, 298 dependencias); `verify-local-preparation-db.mjs` (PGlite, instala y reaplica los 131 módulos) → PASS (`$S/round5-sql/verify-prep-db.out`).
- SQL `round5-payment-plan-test.sql` → 83 PASS / 0 FAIL.
- E2E secuencial (workers 1, 127.0.0.1:3185, `$S/r5-logs/reg-*.log`); **sin fallas en la primera pasada, sin repeticiones**:

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round5-payment-plan (nueva) | 4/4 | 4/4 |
| pro-client-operations | 1/1 | 1/1 |
| pro-client-statement | 1/1 | 1/1 |
| pro-client-statement-english | 1/1 | 1/1 |
| pro-invoice-drafts | 1/1 | 1/1 |
| pro-invoice-payments | 1/1 | 1/1 |
| pro-direct-invoice | 1/1 | 1/1 |
| pro-round4a | 4/4 | 4/4 |
| pro-round4b-billing | 4/4 | 4/4 |
| pro-client-dashboard | 2/2 | 2/2 |
| pro-work-client-invite | 3/3 | 3/3 |
| pro-job-workspace | 2/2 | 2/2 |
| pro-work-costs | 1/1 | 1/1 |

### Capturas revisadas (Read) — `$S/round5-shots/`
Editor (teléfono ES, escritorio EN: vista previa ₡333.333/₡333.333/₡333.334), plan de la dueña (escritorio ES, teléfono EN), edición a la medida con «suman exactamente» (teléfono ES), avisos del Resumen (teléfono ES), vista del cliente antes y después de aceptar (teléfono ES, escritorio EN) y copia imprimible (escritorio ES, teléfono EN en tarjetas). **Corrección durante la QA:** en teléfono, el estado y el botón «Crear borrador de factura» apretaban la columna de texto de cada cuota (una palabra por línea); ahora el texto ocupa todo el ancho y el estado y el botón bajan a la línea siguiente (`basis-full sm:flex-1`). Se repitió en WebKit (2/2) y se volvió a revisar la captura.

### Pendiente y por qué
- Sin cobro en línea, enlaces ni SINPE (fila 49) ni emisión fiscal (fila 58): el plan solo programa y registra. Sin recordatorios por correo/SMS (solo avisos en la app, por decisión).
- El cargo fijo y el recargo por atraso son condiciones informativas: no se suman solos al saldo (cambiaría la fórmula única); si se cobran, se registran como cambio del importe acordado.
- La cuota ligada a una tarea usa la última actualización de la tarea completada (`updated_at` en Costa Rica) porque la tabla de tareas no guarda fecha de cierre.
- La asignación parte de lo abonado en el libro después de crear el plan: anular un abono hecho ANTES del plan también reduce lo abonado al plan (es correcto para el saldo, pero se ve así).

## Ronda 6A Integraciones fiscales y cobros (2026-11-13)

Isaac autorizó construir todas las integraciones con terceros; como él no puede probarlas, se construyó una **capa de adaptadores** con un simulador local determinista (modo predeterminado y totalmente probado) y adaptadores de pruebas reales que solo se activan cuando existen las variables de entorno (no existe ninguna: no se crearon). **Cero llamadas reales** a Hacienda, procesadores o terceros; solo se leyó documentación pública (Anexos y Estructuras v4.4 de Hacienda, ComprobantesElectronicosAPI, OpenAPI público de Tilopay). No se leyeron `.env.local`, secretos ni `native-env.sh`. Sin commits, envíos ni despliegues. Respaldos previos a cada edición en `$S/round6a-backup/`. Guía para el dueño: [integrations-setup-guide-local.md](integrations-setup-guide-local.md).

### 0. Marco de integraciones
- `src/lib/pro/integrations/`: registro de proveedores (`registry.ts`: `hacienda`, `tilopay`; variables por modo, opciones no secretas validadas), resolución de modo (`server.ts`: `mock` por defecto; `sandbox` solo con todas sus variables; `production` nunca automática: modo guardado + `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, si no → «production_refused»), registro de llamadas **redactado** (`redact.ts`, `logOutbound`), firmas de webhook HMAC con tolerancia ±5 min y comparación en tiempo constante (`webhook.ts`), reintentos con espera creciente 30 s × 2^(n−1) ≤ 1 h (`retry.ts`, espejo SQL).
- SQL `docs/pro/sql/integrations-local.sql`: `pro_integration_connections` (proveedor, modo, estado, config **sin secretos**: CHECK `pro_integration_config_safe` rechaza claves tipo password/token/key/pin/p12, PEM, blobs base64 y números de tarjeta), historial inmutable, recibos `actionId`, CAS por revisión, log de salida inmutable (sin query strings), bandeja de webhooks idempotente por (proveedor, id de evento) con guardia de estado y rechazos (firma inválida) aparte para que un id falsificado nunca bloquee el evento real.
- UI: **Empresa › Configuración › Integraciones** (`company-integrations.tsx`): tarjeta por proveedor con modo, estado, variables del servidor (solo nombre + configurada/no), «Probar conexión» (simulado: XML firmado y aceptado por el ATV simulado; cobro de prueba con evento firmado), opciones de cobro (teléfono SINPE), datos del emisor y registro técnico.

### 1. Factura electrónica de Hacienda v4.4
- `hacienda/document.ts`: modelo normalizado desde el borrador (detalle editado, impuestos especiales, exoneraciones, otros cargos, condición y medio de pago, receptor por tipo de identificación) con la misma aritmética entera del borrador (5 decimales); **validación antes de reservar** (CAByS 13 dígitos, IVA definido, unidad de la nota 15, receptor válido para FE, medio de pago, emisor completo, total igual al borrador). Resumen gravado/exento/exonerado/no sujeto, desglose por impuesto y tarifa.
- `hacienda/xml.ts`: FacturaElectronica / TiqueteElectronico / NotaCreditoElectronica en el orden de los Anexos v4.4 (ProveedorSistemas, CodigoActividadEmisor, Emisor/Receptor, DetalleServicio, OtrosCargos, ResumenFactura con MedioPago, InformacionReferencia), ya en forma canónica.
- `hacienda/clave.ts` + SQL: consecutivo 20 (sucursal+terminal+tipo+número sin saltos) y clave 50 (506 + fecha CR + emisor a 12 + consecutivo + situación + código de seguridad) compuestos en la base.
- `hacienda/signer.ts`: XAdES-EPES envuelta (RSA-SHA256, exc-C14N, política de Hacienda). Simulada en mock (marcada «SIMULACION»); real con `.p12` + PIN de variables de entorno mediante `pkcs12.ts` propio (3DES, RC2-40/128 en JS, PBES2-AES, MAC) — **sin dependencias nuevas**.
- `hacienda/atv.ts` (simulado, determinista: 999999999 rechaza, 888888888 falla una vez y luego acepta, el resto acepta) y `atv-remote.ts` (OAuth password grant + `/recepcion` + `/recepcion/{clave}`; no activo).
- SQL `einvoice-local.sql`: datos del emisor (CAS), secuencias, documentos con **máquina de estados** borrador → firmado → enviado → recibido → aceptado/rechazado (+ error con reintento), XML/firma/totales/clave congelados al firmar, finales inmutables, eventos inmutables, un FE/TE vivo por borrador, **bloqueo del borrador al emitir** (hint `pro_einvoice_emitted`), notas de crédito solo sobre aceptados y sin superar el original.
- API `/api/pro/einvoice` (emit, poll, credit_note, save_settings; GET con validación por tipo) y `/api/pro/einvoice-file` (XML firmado, respuesta, representación imprimible con banda «SIMULACIÓN»). UI: botón «Comprobante electrónico» en el borrador (`invoice-einvoice.tsx`); datos del emisor en Integraciones.

### 2. Cobros en línea / enlaces de pago / SINPE Móvil
- SQL `online-payments-local.sql`: enlaces (solo hash SHA-256 del token; monto fijo = lo pendiente del borrador o de la cuota, nunca más que el saldo del trabajo; uno activo por borrador/cuota), intentos (solo últimos 4 dígitos), transacciones **exactamente una vez** (id de libro derivado de proveedor+evento, únicos por evento y por intento), reembolsos = **anulación** en `pro_client_entries`, excepciones conservadas para conciliar, `pro_payment_reconciliation`.
- Procesador genérico (`payments/processor.ts`), **simulado** (`mock.ts`: 4242… aprobada, …0002 rechazada, …9995 fondos insuficientes, …3220 verificación del banco; SINPE 8–25 dígitos, «000…» no encontrado) que emite eventos firmados que pasan por la misma bandeja que un webhook real; esqueleto **Tilopay** (`tilopay.ts`: login, processPayment, consult, processModification) sin activar — confirma cada aviso consultando el API porque el `orderHash` no es público.
- Página pública `/pagar#enlace=…` (`payment-link-portal.tsx`, ruta reservada como el portal de licitaciones en `middleware.ts` y `site-routes.ts`), API pública `/api/pro/pay`, webhook `/api/pro/integrations/webhooks/tilopay`, API del dueño `/api/pro/payment-links` (crear, anular, reembolsar, conciliación). UI: «Cobro en línea» en el borrador, «Enlace de pago» por cuota en el plan, **Empresa › Cobros en línea** (conciliación).

### 3. Corrección pendiente de la Ronda 5
`payment-plans-local.sql`: el plan guarda la posición del libro al crearse (`base_position`, con relleno para planes existentes) y asigna `pro_payment_plan_paid_since` = abonos posteriores **netos de sus propias anulaciones**. Anular un abono previo al plan ya no toca el plan; anular uno posterior se reasigna. La prueba SQL de la Ronda 5 sigue 83/83.

### Pruebas y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` sobre los 45 archivos tocados (`$S/round6a-touched.txt`) → 0 errores, 0 avisos.
- `node scripts/pro/local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (134 módulos, 135 pasos, 310 dependencias); `verify-local-preparation-db.mjs` (PGlite instala y reaplica los 134) → PASS (`$S/round6a-sql/verify-prep-db.out`). Los 3 módulos nuevos se registraron al final del manifiesto y se aplicaron al entorno local con `apply-one.mjs`.
- SQL `$S/round6a-sql/round6a-integrations-test.sql` (psql loopback, `begin … rollback`): **117 PASS / 0 FAIL** — corrección del plan (abono previo anulado no toca el plan, posterior sí se reasigna), marco (mock por defecto, producción rechazada sin bandera 42501, sin confirmación 22023, nunca automática, CAS 40001, `actionId` idempotente y reuso 22023, secretos rechazados en config/log/webhook y por CHECK, historial y log inmutables, backoff), e-factura (emisor CAS y formato, clave 50 y consecutivo 20 con fecha CR y relleno, idempotencia, un FE vivo, **borrador bloqueado**, otra dueña sin acceso, transiciones inválidas 23514, firma con resumen erróneo rechazada, error→reintento, eventos en orden, final inmutable, nota de crédito que no supera el original / anulación total / original no aceptado, rechazado libera el borrador y siguiente consecutivo), cobros (sin trabajo, un enlace activo, vista pública sin ids internos, tarjeta completa rechazada, **exactamente una vez** ante re-aplicación, reentrega y segundo evento de éxito, carga distinta con mismo id 22023, transacciones inmutables, reembolso = anulación una sola vez, nada se borra, 3-D Secure rechazado, diferencia de monto → excepción, conciliación, evento desconocido o de otro modo ignorado, cuota por SINPE aplicada al plan, otra dueña sin lectura ni reembolso), postura (RLS, sin grants anon/authenticated, security invoker, sin columnas secretas). La prueba de la Ronda 5 repetida: 83/83.
- Unitarias `tests/e2e/pro-round6a-einvoice-unit.spec.ts` (8 pruebas, sin navegador ni red): clave/consecutivo, totales gravado/exento/exonerado/descuento, orden de elementos v4.4, 5 decimales, validación, nota de crédito, firma simulada (resumen = SHA-256 del XML canónico, `xmllint` bien formado), **.p12 de prueba** generado con LibreSSL (llave 3DES + certificado RC2-40, y PBES2-AES) abierto sin dependencias y firma XAdES verificada con la llave pública, ATV simulado, redacción, backoff, firmas de webhook y tarjetas de prueba.
- E2E secuencial (workers 1, 127.0.0.1:3185, `$S/r6a-logs/`):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round6a-einvoice-unit (nueva) | 8/8 | 8/8 |
| pro-round6a-integrations (nueva, 2 pruebas × ES/EN) | 4/4 | 4/4 |
| pro-invoice-drafts | 1/1 | 1/1 |
| pro-invoice-payments | 1/1 | 1/1 |
| pro-invoice-detail | 1/1 | 1/1 |
| pro-invoice-management | 1/1 | 1/1 |
| pro-invoice-preparation | 1/1 | 1/1 |
| pro-direct-invoice | 1/1 | 1/1 |
| pro-round5-payment-plan | 4/4 | 4/4 |
| pro-client-operations | 1/1 | 1/1 |
| pro-client-statement | 1/1 | 1/1 |
| pro-client-statement-english | 1/1 | 1/1 |
| pro-round4b-billing | 4/4 | 4/4 |
| pro-credit-notes-statement | 1/2 (EN falla, repetida: igual) | 1/2 (igual) |
| pro-credits-retainers | 1/2 (EN falla, repetida: igual) | 1/2 (igual) |

Las dos fallas en inglés son **previas y ajenas a esta ronda**: el ayudante `money()` de esos specs llama `proMoney()` sin idioma (en Node da formato español «₡1.500») mientras la pantalla en inglés muestra «₡1,500». No se tocó `money.ts`, esos specs ni sus módulos; se repitieron una vez en ambos perfiles con el mismo resultado. Queda como corrección de prueba pendiente.

### Capturas revisadas (`$S/round6a-shots/`, ES/EN, escritorio y teléfono)
Integraciones (teléfono ES), comprobante aceptado (EN escritorio, ES teléfono), representación imprimible (ES teléfono), página de pago con tarjeta (ES teléfono), SINPE (EN escritorio), enlace del dueño (EN teléfono), conciliación (ES teléfono). **Corrección durante la revisión:** en la representación imprimible todos los datos del recuadro de identificación salían en letra monoespaciada; ahora solo la clave y el consecutivo.

### Pendiente y por qué
- Activar pruebas reales: Isaac debe crear la cuenta de pruebas del ATV y la de Tilopay y poner sus variables (guía). Los adaptadores reales están escritos según la documentación pública pero **no se han ejecutado contra los proveedores** (por regla: cero llamadas reales).
- El XSD oficial v4.4 no se pudo descargar (403 en `cdn.comprobanteselectronicos.go.cr`); la estructura se verificó contra el orden de los Anexos v4.4 y con `xmllint` (bien formado), no contra el XSD.
- Reembolsos solo por el monto completo (la anulación del libro es por el abono entero); reembolso parcial queda pendiente.
- Enlace de pago solo para borradores vinculados a un trabajo (el pago necesita el libro del trabajo). Sin QR todavía.
- Datos del receptor: la ubicación del receptor no se envía (es opcional; los datos fiscales guardan nombres, no códigos).
- Notas de débito, factura de compra/exportación y recibo electrónico de pago no se implementaron (no los pide el flujo actual).
- Las rutas siguen siendo solo de desarrollo; producción requiere un cambio aparte y autorización.
- `scripts/ci/verify-app-surface-ownership.mjs` ya fallaba antes de esta ronda (`/api/pro/access has no regression owner`); no se tocó.

## Ronda 6B Firma, correo/calendario y contabilidad (2026-11-13)

Se reutilizó el marco de la Ronda 6A (registro de proveedores, modos `mock|sandbox|production`, producción solo con acción explícita + `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, registro de llamadas redactado, bandeja de webhooks HMAC idempotente, reintentos). **Cero llamadas reales** a Google, Microsoft, Intuit, DocuSign ni ningún tercero: solo adaptadores simulados; los adaptadores de pruebas reales están escritos y solo se activan con todas sus variables (no existe ninguna; no se crearon). Solo se leyó documentación pública (DocuSign Connect HMAC). No se leyeron `.env.local`, secretos ni `native-env.sh`. Sin commits, envíos ni despliegues. Respaldos en `$S/round6b-backup/`. Guía para el dueño ampliada: [integrations-setup-guide-local.md](integrations-setup-guide-local.md) (secciones 4–9).

### 0. Marco: proveedores nuevos
- `registry.ts`: `esign`, `google`, `microsoft`, `quickbooks` (variables por modo, opciones no secretas validadas). SQL `integrations-providers-local.sql`: lista única `pro_integration_provider_ids()`, CHECK de proveedor ampliados en conexiones/log/webhooks y `pro_integration_read/mutate` re-creadas con la misma lógica de 6A. «Probar conexión» de los nuevos (`self-test.ts`): en simulación verifica PDF + aviso firmado (firma) o PKCE + intercambio de código + cifrado (OAuth); en modos reales no llama a nada.

### 1. Firma electrónica (fila 41)
- SQL `esign-local.sql`: `pro_esign_requests` (copia congelada + SHA-256 del contrato compartido, la publicación de cotización o el cambio propuesto/aceptado), máquina de estados creada → enviada → abierta → firmada / rechazada / vencida / anulada (+ error con reintento) con trigger de transición, identidad/copia/firmante inmutables, finales congelados, **una solicitud viva por documento**, eventos y artefactos **solo-anexar** (ni UPDATE ni DELETE salvo la cascada de borrado de cuenta), «firmada» exige PDF firmado + certificado guardados en la misma transacción (bytea + SHA-256 comprobado por CHECK), `actionId` idempotente, CAS al anular, vencimiento por sistema.
- Avisos del proveedor por la bandeja 6A (`provider='esign'`): mismo id = duplicado; mismo id con otro contenido = 409 sin aplicar; fuera de orden = ignorado; otro modo = ignorado. Ruta `/api/pro/integrations/webhooks/esign` (simulado con `X-CCR-Signature`; DocuSign Connect con `X-DocuSign-Signature-1` = base64 HMAC-SHA256 del cuerpo, inactivo).
- Proveedor simulado: página del firmante `/api/pro/esign/mock-sign` (abrir = «abierta»; firmar con nombre escrito + consentimiento; rechazar con motivo); PDF propio sin dependencias (`esign/pdf.ts`), PDF firmado y certificado de auditoría (`esign/document.ts`, horas de Costa Rica, huellas, aviso Ley 8454). Adaptador **DocuSign eSignature** (`esign/docusign.ts`: JWT RS256, sobre con ancla `/firma1/`, vencimiento/recordatorios, Connect, anular, descargar combinado + certificado) sin activar. Elección y consideraciones de Firma Digital CR/BCCR en la guía; validez legal a confirmar por abogado.
- UI: recuadro «Firma electrónica» (`esign-requests.tsx`) en el contrato compartido, en «Cotización compartida» y en cada cambio propuesto del lado del profesional (se oculta si la cuenta no tiene herramientas Pro). La aceptación autenticada existente no se tocó y se ofrece como alternativa.
- **Corrección durante la ronda:** la redacción enmascara secuencias de 13–19 dígitos (números de tarjeta) y el CHECK `pro_integration_config_safe` las rechaza; los ids hexadecimales simulados (sobre/evento) y la huella SHA-256 en el detalle del evento podían contenerlas al azar (≈1 de cada 10 solicitudes fallaba con 400). Ahora los ids simulados usan letras a–p y la huella vive solo en la fila de la solicitud.

### 2. Correo, calendario y archivos (filas 10 y 72)
- SQL `connectors-local.sql`: estado OAuth (solo SHA-256 del `state`, verificador PKCE **cifrado**, 10 min, un solo uso), conexiones con tokens **solo como sobres AES-256-GCM** `v1.<llave>.<iv>.<tag>.<datos>` (CHECK `pro_oauth_box_ok`: un token en claro no puede guardarse), revocar borra ambos sobres (CHECK), historial inmutable, recibos `actionId`; bandeja de salida con **confirmación obligatoria** y CHECK `modo mock ⇔ «simulado»` (un correo simulado nunca puede quedar como enviado), contenido inmutable; enlaces de calendario con conflicto y ambas versiones, eventos externos como «ocupado», calendario simulado local.
- TS: `oauth/vault.ts` (AES-256-GCM, llave `PRO_OAUTH_TOKEN_KEY`; en simulación una llave fija pública que solo abre tokens falsos), `oauth/mock.ts` (servidor de autorización simulado: código firmado con el reto S256, caduca en 5 min), `oauth/service.ts` (inicio, retorno con estado de un solo uso y dueño = sesión, intercambio, refresco, revocación), `workspace/adapters.ts` (Gmail API / Graph `sendMail`, Google Calendar / Graph events, Drive/OneDrive metadatos — inactivos; simulados activos), `workspace/service.ts` (sincronización: nuevo/cambiado → calendario; fecha de **tarea** movida → ContrataCR con CAS de revisión; **cita** movida, borrada o cambio en ambos lados → conflicto; terminado/cancelado → se quita el evento).
- Rutas: `/api/pro/connectors`, `/api/pro/oauth/callback` (redirect URI), `/api/pro/oauth/mock-authorize` (solo redirige a nuestro callback; PKCE S256 obligatorio). UI **Empresa › Configuración › Correo y calendario** (`company-connectors.tsx`): conectar/desconectar, redactar con proyecto y adjuntos del selector, diálogo de confirmación por correo, bandeja de salida, calendario con conflictos y botones de simulación.

### 3. QuickBooks y CSV (fila 56)
- SQL `accounting-sync-local.sql`: mapeo (artículo de ingresos, cuenta de depósito, código de impuesto por IVA CR 01/02/03/04/08/09/10/11, alcance «emitidas»/«todas») con CAS + idempotencia + historial inmutable; `pro_accounting_sources` (clientes, borradores con líneas e IVA, «emitida» = FE/TE aceptada por Hacienda, pagos aplicados no anulados, huella md5); vínculos con id remoto, SyncToken y huella; empresa QuickBooks simulada.
- TS `accounting/` (modelo y desglose por tarifa, adaptador simulado y REST v3 inactivo con SyncToken, sincronización clientes → facturas → pagos: solo QuickBooks cambió → se conserva; ambos → conflicto; registro borrado → conflicto; «Stale Object» → conflicto), `csv.ts` (Excel CR `;` + coma decimal + BOM o estándar; base e IVA por tarifa; neutraliza fórmulas). Rutas `/api/pro/accounting`, `/api/pro/accounting-export`. UI **Empresa › Configuración › Contabilidad** (`company-accounting.tsx`).

### 4. `verify-app-surface-ownership.mjs`
Fallaba con «/api/pro/access has no regression owner». Se agregó un dueño exacto por cada uno de los 133 manejadores `/api/pro/*` (Rondas 1–6B), cada uno apuntando al spec que usa esa ruta. Al pasar ese punto apareció la segunda verificación del script: `pro-preview` no estaba en `RUTAS_DEL_SITIO`; se declaró en `src/lib/site-routes.ts` (el middleware ya la reescribía en desarrollo). Resultado: **PASS** («80 pages and 240 route handlers»).

### Pruebas y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` sobre los 45 archivos TS tocados (`$S/round6b-touched.txt`) → 0.
- `local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (138 módulos, 139 pasos, 327 dependencias); `verify-local-preparation-db.mjs` → PASS (138 módulos instalados y reaplicados en PGlite, `$S/round6b-sql/verify-prep-db.out`); `verify-app-surface-ownership.mjs` → PASS. Los 4 módulos nuevos se aplicaron al entorno local con `apply-one.mjs`.
- SQL `$S/round6b-sql/round6b-test.sql` (psql loopback, `begin … rollback`): **88 PASS / 0 FAIL** — producción rechazada sin bandera para esign/quickbooks/google y sin confirmación con bandera; secretos en config rechazados; documentos firmables y no firmables; otra dueña (P0002) y cliente sin Pro (42501) sin acceso; creación idempotente, reuso de `actionId` 22023, una viva por documento 23505; transiciones inválidas 23514; copia/firmante/sobre inmutables; webhooks duplicados, conflicto de id, fuera de orden, otro modo, sobre desconocido; «firmada» sin documentos 22023 y con documentos guarda ambos con SHA-256 correcto; artefactos y eventos sin UPDATE/DELETE; rechazo con motivo, error → reintento, CAS 40001, vencimiento por sistema; sobres OAuth (texto plano rechazado por función y por CHECK), estado de un solo uso/vencido/desconocido, revocar (CAS, idempotente, borra sobres, no puede volver a guardar token), correo sin confirmación / sin conexión / modo distinto / simulado nunca «enviado» / inmutable / idempotente / otra dueña; CAS de fecha de tarea; mapeo CAS e IVA inválido; alcance emitidas/todas; postura (RLS, sin grants anon/authenticated, security invoker, sin columnas de token en claro).
- Unitarias `tests/e2e/pro-round6b-unit.spec.ts` (6 pruebas, sin navegador ni red): bóveda AES-GCM (no contiene el token, detecta alteración, llave equivocada, la llave simulada no abre sobres reales), PKCE y servidor simulado (verificador incorrecto, otro proveedor, MAC falsificado, código vencido), PDF válido con xref correcto y determinista, PDF firmado y certificado con huellas y hora CR, eventos firmados, HMAC de DocuSign Connect y mapa de estados, desglose de IVA, huecos del mapeo, CSV CR/estándar con inyección neutralizada, registro y confirmación obligatoria del correo.
- E2E secuencial (workers 1, 127.0.0.1:3185, `$S/r6b-logs/`; el script reinició el servidor una vez por memoria):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round6b-unit (nueva) | 6/6 | 6/6 |
| pro-round6b-esign (nueva, ES/EN) | 2/2 (1.ª pasada 1/2 por el fallo aleatorio de ids, corregido; repetida 2/2) | 2/2 (y 2/2 repetida tras las correcciones finales) |
| pro-round6b-connectors (nueva, ES/EN) | 2/2 | 2/2 |
| pro-round6b-accounting (nueva, ES/EN) | 2/2 (y 2/2 repetida) | 2/2 (y 2/2 repetida) |
| pro-round6a-einvoice-unit | 8/8 | 8/8 |
| pro-round6a-integrations | 4/4 (1.ª pasada 2/4 durante recompilación/alta memoria; repetida 4/4) | 4/4 |
| pro-contracts | 2/2 | 2/2 |
| pro-private-estimate-publications-journey | 2/2 | 2/2 |
| pro-private-estimate-publications-api | 4/5 (repetida: igual; necesita credenciales psql nativas no cargadas por regla) | 4/5 (igual) |
| pro-work-changes | 1/1 | 1/1 |
| pro-work-changes-english | 1/1 | 1/1 |
| pro-agenda-operations | 1/1 | 1/1 |
| pro-appointment-schedule | 2/2 | 2/2 |
| pro-work-tasks | 3/3 | 3/3 |
| pro-work-files | 3/3 (1.ª pasada 2/3, recuperación de subida; repetida 3/3) | 3/3 |
| pro-company-files | 2/2 | 2/2 |
| pro-invoice-drafts | 1/1 | 1/1 |
| pro-company | 3/3 (1.ª pasada 1/3: el spec esperaba 12 botones de Empresa y ya había 14 desde la 6A; ahora 16 con el grupo Configuración, expectativa actualizada; repetida 3/3) | 3/3 |

### Capturas revisadas (`$S/round6b-shots/`, ES/EN, escritorio y teléfono)
Firma enviada y firmada (contrato), página del firmante, tarjeta de Integraciones con la prueba simulada, permiso OAuth simulado, selector de Drive, bandeja de salida, conflicto de calendario, mapeo contable, conflicto de QuickBooks y vista sincronizada. **Correcciones durante la revisión:** resúmenes de sincronización con singular/plural correcto («1 conflicto»), el firmante ya no ve «Total: -» cuando el contrato no tiene cotización vinculada, la etiqueta de pagos sincronizados muestra moneda («CRC 500,000.00»), botón «Cancelar» del diálogo de confirmación en inglés («Cancel»).

### Pendiente y por qué
- Activar pruebas reales: Isaac debe crear la cuenta de desarrollador de DocuSign, el proyecto de Google Cloud, el registro de Microsoft Entra y la app de Intuit, y poner sus variables + `PRO_OAUTH_TOKEN_KEY` (guía, secciones 4–8). Los adaptadores reales **no se han ejecutado** contra ningún proveedor (por regla).
- Legal: la firma electrónica no es la Firma Digital certificada del BCCR (Ley 8454); un abogado debe confirmar su uso. Validar PDFs firmados con Firma Digital dentro de la aplicación queda como trabajo futuro.
- La firma electrónica registra su propio estado; no cambia automáticamente el estado de aceptación del contrato, la cotización o el cambio (siguen con su aceptación autenticada o «registrar aprobación recibida»).
- Correo: solo envío (sin bandeja de entrada sincronizada, plantillas ni registro de conversaciones); el correo de proyecto se compone desde Empresa, todavía no desde el expediente del trabajo. Adjuntos reales se envían como enlace al archivo del proveedor, no como archivo binario.
- Calendario: sincronización manual («Sincronizar»), sin suscripción a cambios (webhooks/push de Google/Graph) ni reuniones en línea.
- QuickBooks: sin importar cambios de QuickBooks hacia ContrataCR (solo se conservan allá); sin notas de crédito ni anulaciones de pago (las anulaciones dejan de exportarse/sincronizarse, pero no se borran en QuickBooks).
- Los mensajes de «Probar conexión» vienen del servidor en español también con la interfaz en inglés (igual que en la Ronda 6A).
- `pro-private-estimate-publications-api`: 1 de 5 pruebas exige credenciales nativas de psql (`PRO_LOCAL_PSQL`/`PGPASSWORD`) que por regla no se cargaron; falla igual antes y después (no relacionado).
- Las rutas siguen siendo solo de desarrollo; producción requiere un cambio aparte y autorización.

## Ronda 6C IA y seguimiento 6B (2026-11-13)

Se reutilizó el marco de las Rondas 6A/6B (registro de proveedores, modos `mock|sandbox|production`, producción solo con acción explícita + `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, registro de llamadas redactado). **Cero llamadas reales** a Anthropic, OpenAI ni ningún tercero: solo adaptadores simulados deterministas; los adaptadores reales están escritos y solo se activan con su clave (no existe ninguna; no se crearon). No se leyeron `.env.local`, secretos ni `native-env.sh`. Sin commits, envíos ni despliegues. Sin dependencias nuevas (HTTP con `fetch`). Respaldos en `$S/round6c-backup/`. Guía para el dueño ampliada: [integrations-setup-guide-local.md](integrations-setup-guide-local.md) (secciones 10–12).

### 0. Marco: proveedores de IA y transcripción y barreras centrales
- `registry.ts`: proveedores `ai` (Anthropic Claude, `PRO_ANTHROPIC_API_KEY`, modelo `claude-sonnet-5-5` por defecto, configurable en la tarjeta o con `PRO_ANTHROPIC_MODEL`) y `transcription` (API compatible con OpenAI `/v1/audio/transcriptions`, `PRO_TRANSCRIPTION_API_KEY`, `whisper-1` por defecto; elección documentada: Anthropic no transcribe audio y el formato OpenAI lo ofrecen varios proveedores).
- `src/lib/pro/ai/`: `adapters.ts` (simulado determinista; **Claude Messages API** por HTTP: `anthropic-version: 2026-10-21`, salida `output_config.format` JSON Schema estricto, `effort` bajo/medio, respaldo de servidor ante rechazo en los modelos que lo admiten, PDF/imagen como bloque `document`/`image`; transcriptor compatible con OpenAI multipart `verbose_json`; `fetch` inyectable para probar sin red), `prompts.ts` (system prompt fijo: el contenido va en bloques `<untrusted_document>` que no se pueden cerrar desde dentro y es **datos, nunca instrucciones**), `privacy.ts` (oculta correos, teléfonos, cédulas, tarjetas, IBAN y nombres conocidos antes de cualquier línea del registro; el registro solo guarda conteos), `validate.ts` (toda respuesta se valida otra vez con zod y se quitan enlaces), `service.ts` (orden: modo → `pro_ai_begin` → adaptador → registro → validación → `pro_ai_finish`).
- SQL `ai-assistant-local.sql`: proveedores ampliados; `pro_ai_settings` (autorización de tratamiento de datos **por empresa, apagada por defecto**, versión y fecha; límite mensual 1–5000, 100 por defecto; CAS 40001; `actionId` idempotente; historial inmutable); `pro_ai_usage` (contador mensual atómico por empresa y por función); `pro_ai_suggestions` (cada resultado aparte e **inmutable**, estado pendiente → lista/fallida, revisión «usada/descartada» una sola vez; sin DELETE para `service_role`); grabaciones y notas de reunión. Con la autorización apagada **toda** llamada se rechaza (42501 `pro_ai_consent_required`); en el límite, 54000 `pro_ai_cap_reached` (429); el mismo `actionId` devuelve la misma sugerencia sin contar otra vez.
- Ruta `/api/pro/ai` (ajustes, `suggest`, `read_plan`, `review`, y multipart para comprobante/nota de voz) y `/api/pro/ai-meetings`. UI: tarjeta **Asistente de IA** en Empresa › Integraciones con el texto de autorización, interruptor, uso del mes y límite (`ai-assistant.tsx`).

### 1. Redacción asistida (fila 46)
«✦ Sugerir con IA» (`AiDraftAssist`) en la **línea de cotización** (editor privado), la **cláusula de contrato** (contrato y plantillas), el **resumen de la bitácora** (solo el dueño) y el **avance para el cliente**. La sugerencia aparece editable con la etiqueta «Generado con IA · revise y edite antes de guardar»; «Usar este texto» solo la copia al campo y el registro se guarda con el «Guardar» de siempre. Contexto mínimo del trabajo (`pro_ai_job_context`: servicio, etapa, fechas, primer nombre del cliente, últimas bitácoras/tareas/avances; sin correo ni teléfono).

### 2. Planos → mediciones (fila 67)
En Mediciones, con un plano que ya está en Archivos (imagen o PDF; huella SHA-256 verificada al descargarlo), «✦ Leer plano con IA» devuelve áreas (m²), longitudes (m) y conteos (u) como **borrador editable** con confianza y el aviso «sin precisión estructural ni de ingeniería». Solo las filas marcadas se crean como mediciones manuales con el escritor existente `measurement_create` (convierte a pies si la página está en pies).

### 3. Gasto desde comprobante o nota de voz (fila 77)
En «Nuevo gasto», «✦ Capturar con IA»: foto del comprobante (JPG/PNG/WebP ≤ 5 MB) o nota de voz (grabada con `MediaRecorder` o archivo ≤ 8 MB → transcripción → extracción). Propone proveedor, fecha, monto, IVA (tarifas CR) y medio de pago; «Usar en el formulario» llena los campos de la Ronda 4B (concepto, importe, fecha, medio de pago, IVA y proveedor nuevo) y el dueño guarda. Ni la foto ni el audio se guardan.

### 4. Reuniones y llamadas (fila 76)
En «Notas y llamadas» del trabajo (`work-meetings.tsx`): subir o grabar solo tras marcar «informé a todas las personas… y todas dieron su consentimiento» (el texto y la fecha quedan en la grabación; CHECK en la tabla). Audio privado del dueño (otra cuenta 404, sin sesión 401), inmutable y **borrable**. «✦ Transcribir y resumir con IA» → transcripción + resumen + decisiones + pendientes editables; las notas existen solo al pulsar «Guardar en el trabajo» (CAS + `actionId` + historial inmutable). Cada pendiente → «Crear tarea» con el escritor de tareas existente y queda vinculado.

### 5. Seguimiento de la Ronda 6B
- **Firma → aceptación automática** (`esign-acceptance-local.sql`): al quedar «firmada», `pro_esign_event_apply` (mismo cuerpo de 6B + una llamada) aplica la aceptación por el **escritor de cada documento**: cambio → `pro_work_changes_mutate(record_acceptance)` (nota en el idioma de la solicitud con firmante y sobre), cotización → `pro_private_estimate_publication_mutate(accept)` como el destinatario, contrato → `pro_contracts_client_mutate(accept)` como el cliente vinculado. Exactamente una vez: fila inmutable por solicitud en `pro_esign_acceptances` + `actionId` determinista en el recibo del escritor. Guardas: la huella firmada debe seguir siendo la vigente y, en contrato/cotización, quien firmó debe ser el cliente; si no, queda «para revisar» con el motivo, visible en el recuadro de firma. Un error ahí nunca impide guardar la firma.
- **Correo de proyecto desde el trabajo** (`work-project-email.tsx`): mismo redactor de Empresa con el proyecto fijo, confirmación por mensaje y bandeja del trabajo; sin cuenta conectada muestra «Conectar cuenta».
- **«Probar conexión» en inglés**: todas las pruebas devuelven el texto ES y EN (`messageEn`).
- **Sincronización automática del calendario** (`calendar-autosync-local.sql`): intervalo por calendario (apagado, 15/30/60/120 min); un programador dentro de la app (uno por pestaña) pide al servidor ejecutar lo vencido y `pro_calendar_autosync_claim` reserva cada ventana de forma atómica (dos pestañas nunca la ejecutan dos veces); cada ejecución queda registrada (inmutable).

### Pruebas y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` sobre los 39 archivos tocados (`$S/round6c-touched.txt`) → 0.
- `local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (141 módulos, 142 pasos, 340 dependencias); `verify-local-preparation-db.mjs` → PASS (141 módulos instalados y reaplicados en PGlite, `$S/round6c-sql/verify-prep-db.out`); `verify-app-surface-ownership.mjs` → PASS (80 páginas, 242 manejadores; `/api/pro/ai` → `pro-round6c-ai.spec.ts`, `/api/pro/ai-meetings` → `pro-round6c-meetings.spec.ts`). Los 3 módulos nuevos (`ai-assistant`, `esign-acceptance`, `calendar-autosync`) se registraron al final del manifiesto y se aplicaron con `apply-one.mjs`.
- SQL `$S/round6c-sql/round6c-test.sql` (psql loopback, `begin … rollback`): **75 PASS / 0 FAIL** — 8 proveedores en simulación, producción rechazada sin bandera, clave en config rechazada; autorización apagada por defecto bloquea toda llamada sin contar nada, CAS 40001, `actionId` idempotente/reuso 22023, historial inmutable, autorización por empresa (B sigue apagada), cliente sin Pro 42501; **sugerencias de las 8 funciones no escriben nada** en cotizaciones, cláusulas, bitácoras, avances, tareas, mediciones, gastos ni reuniones (ni al marcarlas «usadas»), salida/identidad inmutables (23514), revisión una sola vez, fallida sin salida, otra dueña P0002, contexto sin correo/teléfono; límite mensual (54000 al llegar, nada contado, reintento con el mismo `actionId` sin unidad nueva); grabaciones: bloqueadas sin autorización, sin consentimiento de todas las partes (22023 y CHECK 23514), huella y tamaño, idempotente, audio íntegro solo para la dueña (B P0002, cliente 42501), inmutables, borrables; notas solo al guardar, CAS, enlace a tarea real, historial inmutable; **firma → aceptación exactamente una vez** (cambio aceptado por su escritor con una sola entrada de acuerdo nueva, aviso repetido y llamada repetida sin efecto, fila inmutable, contrato firmado por otro correo queda «para revisar» y no se acepta); reclamo atómico de la sincronización automática; postura (RLS, sin grants anon/authenticated, sin DELETE de `service_role` en sugerencias/aceptaciones, security invoker).
- Unitarias `tests/e2e/pro-round6c-unit.spec.ts` (8 pruebas, **sin red**: los adaptadores reales reciben un `fetch` falso): redacción de datos personales, bloque `<untrusted_document>` que no se puede cerrar, fixtures deterministas que validan, enlaces y formas inválidas descartadas, petición exacta a la Messages API (URL, `x-api-key`, `anthropic-version`, `output_config.format`, `fallbacks`, sin `temperature`, imagen/PDF), rechazo/truncado/529, esquemas estrictos, petición multipart de transcripción, registro y esquemas.
- E2E secuencial (workers 1, 127.0.0.1:3185, `$S/r6c-logs/`; el script reinició el servidor una vez por memoria en WebKit):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round6c-unit (nueva) | 8/8 | 8/8 |
| pro-round6c-ai (nueva, ES/EN) | 2/2 | 2/2 |
| pro-round6c-meetings (nueva, ES/EN) | 2/2 | 2/2 |
| pro-round6c-followups (nueva, ES/EN) | 2/2 (repetida 2/2 tras localizar la nota de aceptación en EN) | 2/2 |
| pro-private-estimates-journey | 6/6 | 6/6 |
| pro-private-estimates-api | 2/4 (las 2 exigen credenciales nativas de psql no cargadas por regla; igual que en 6B) | 2/4 (igual) |
| pro-contracts | 2/2 | 2/2 |
| pro-daily-logs | 6/6 | 6/6 |
| pro-daily-logs-api | 2/2 | 2/2 |
| pro-takeoffs | 2/2 | 2/2 |
| pro-takeoffs-pdf | 2/2 | 2/2 |
| pro-expenses | 1/1 | 1/1 |
| pro-expenses-english | 1/1 | 1/1 |
| pro-round4b-billing | 4/4 | 4/4 |
| pro-round6a-einvoice-unit | 8/8 | 8/8 |
| pro-round6a-integrations | 4/4 | 4/4 |
| pro-round6b-unit | 5/6 → 6/6 (la lista de proveedores ahora incluye `ai` y `transcription`; expectativa actualizada) | 5/6 → 6/6 (igual) |
| pro-round6b-esign | 2/2 | 2/2 |
| pro-round6b-connectors | 2/2 | 2/2 |
| pro-round6b-accounting | 2/2 | 2/2 |
| pro-work-tasks | 2/3 (EN: el responsable no se mostró a tiempo; repetida 3/3) | 3/3 |
| pro-work-updates | 3/3 | 3/3 |
| pro-work-changes | 1/1 | 1/1 |
| pro-project-notes-details | 2/2 | 2/2 |
| pro-company | 3/3 | 3/3 |

### Capturas revisadas (`$S/round6c-shots/`, 40 capturas ES/EN, escritorio y teléfono)
Autorización y límite, sugerencia de avance con etiqueta, borrador de mediciones con aviso, captura de gasto por voz, grabación con consentimiento, sugerencia de reunión, notas con tarea creada, aceptación automática en el cambio firmado, correo desde el trabajo y sincronización automática. **Corrección durante la revisión:** la nota de aceptación del cambio salía en español con la solicitud en inglés; ahora usa el idioma de la solicitud («Electronically signed by … · envelope …»).

### Pendiente y por qué
- Activar pruebas reales: Isaac debe crear la cuenta de Anthropic (workspace de pruebas con límite de gasto) y la del proveedor de transcripción, poner `PRO_ANTHROPIC_API_KEY` / `PRO_TRANSCRIPTION_API_KEY` y dar su OK por escrito para cada activación (guía §10–12). Los adaptadores reales **no se han ejecutado** contra ningún proveedor (por regla).
- Exactitud: falta la evaluación en datos ficticios (textos, planos contra mediciones manuales, comprobantes, notas de voz, reuniones). Las salidas simuladas son fijas y no miden calidad.
- Legal: el texto de autorización, el de consentimiento de grabación, la retención del audio y el aviso de privacidad (Ley 8968) deben pasar por un abogado.
- Aceptación automática del contrato requiere que el cliente tenga su cuenta vinculada al trabajo y vea contratos en su panel; si no, queda «para revisar» (se registra la aprobación a mano). La cotización se acepta como el destinatario vinculado.
- La foto del comprobante usada por la IA no se adjunta al gasto (se puede subir aparte como hasta ahora). La lectura de PDF por la IA usa la página guardada del plano.
- Sincronización automática solo mientras la app está abierta (no hay tarea programada del servidor ni avisos push de Google/Graph).
- La prueba SQL de la Ronda 6B esperaba 6 proveedores; con la 6C son 8 (cambio esperado, no se tocó ese archivo).
- `pro-private-estimates-api`: 2 de 4 pruebas exigen credenciales nativas de psql que por regla no se cargaron (igual antes y después).
- Las rutas siguen siendo solo de desarrollo; producción requiere un cambio aparte y autorización.

## Ronda 6D Sitio, marketing, catálogo y planos (2026-11-13)

Herramientas para que **cada profesional** promocione su propio negocio dentro de Pro (filas 60, 63–65, 69–71). No se tocaron cuentas de anuncios ni la configuración de correo/marketing de ContrataCR (`src/lib/email` intacto; las campañas de profesionales usan otro proveedor/clave). **Cero llamadas reales** a Brevo, Meta, Google, Cloudflare ni tiendas; ningún correo, campaña, anuncio ni publicación real: solo adaptadores simulados; los reales están escritos y solo se activan con sus variables (no existe ninguna; no se crearon). Métricas simuladas siempre rotuladas «Simulado». No se leyeron `.env.local`, secretos ni `native-env.sh`. Sin dependencias nuevas, sin cambios en `android/` ni `ios/`, sin commits/envíos/despliegues. Respaldos en `$S/round6d-backup/`. Guía ampliada: [integrations-setup-guide-local.md](integrations-setup-guide-local.md) §13–18.

### 0. Marco: cinco proveedores nuevos
`registry.ts` + `marketing-providers-local.sql`: `marketing_email` (Brevo, `marketing/brevo.ts` con `List-Unsubscribe` de un clic), `meta_ads` y `google_ads` (importadores de costo documentados, `ads/stubs.ts`), `product_clipper` (lector público OG/schema.org, `clipper/`), `site_domain` (Cloudflare for SaaS, `domain/cloudflare.ts`). Todos `mock` por defecto, producción solo con bandera + confirmación; «Probar conexión» simulado ES/EN (`testRound6dProvider`).

### 1. Sitio web (fila 69) — Empresa › Marketing › Sitio web
- SQL `pro-sites-local.sql`: un sitio por dueño (dirección única, estilo, borrador con CAS + `actionId`), **versiones publicadas inmutables** (sin UPDATE ni DELETE), historial y recibos inmutables; lector público `pro_site_public(slug)` que devuelve **solo la última versión publicada** (sin id de dueño, correo ni ids internos) + reseñas **publicadas** de ContrataCR en vivo (nombre + inicial); fotos del portafolio validadas contra las del perfil al publicar; `pro_site_submit` crea cliente + solicitud con `pro_lead_origin_create` (origen website/advertising/social), atribución y consentimiento solo si se marcó; idempotente por envío.
- UI `company-site.tsx` (secciones portada, servicios, trabajos, reseñas, zona, formulario; 4 estilos ContrataCR; SEO título/descripción; vista previa con el mismo componente y formulario desactivado; publicar/despublicar con confirmación; versiones; dominio propio anotado «No activo»). Página pública `src/app/[locale]/sitio/[slug]/page.tsx` (SSR, `generateMetadata` con título, descripción, canónica, alternos ES/EN, OG), `site-page.tsx` accesible (un h1, saltar al contenido, etiquetas, foco visible, honeypot, aviso Ley 8968), ruta reservada en `site-routes.ts` y `middleware.ts` como `/pagar`. Mapa local `/api/pro/site-public?sitemap=1`.
### 2. Correo masivo y automatizaciones (fila 71) — Empresa › Marketing › Correo masivo
SQL `email-marketing-local.sql`: contactos con consentimiento (fuente, texto, fecha), eventos de consentimiento inmutables, **supresión** (SHA-256, solo agregar), tokens de baja (solo huella), plantillas, campañas (borrador/programada/enviada/cancelada), automatizaciones «pedir reseña» y «seguimiento de cotización» que crean **borradores pendientes de aprobación**, bandeja de salida inmutable. **El trigger `pro_mkt_message_guard` rechaza** cualquier mensaje de campaña/automatización a quien no tiene consentimiento vigente o está suprimido (42501), y la prueba solo puede ir al correo del dueño; CHECK `mock ⇒ simulado`. Programadas: `pro_mkt_run_due` con `skip locked` (una vez). Página pública de baja `/baja-pro#t=…`. UI `company-marketing.tsx` (métricas simuladas rotuladas, bandeja de salida).
### 3. Seguimiento de anuncios (fila 70) — Empresa › Marketing › Resultados de marketing
SQL `ads-tracking-local.sql`: campañas con UTM y código, visitas por día, atribución inmutable (primer contacto) ligada al registro del centro de solicitudes, costos solo-agregar con anulación única, reporte `pro_ad_report` con datos reales (solicitudes, conversiones vigentes `pro_manual_lead_works`, monto acordado/pagado de `pro_work_account`, costo, costo por solicitud, ROI). UI `company-ads-tracking.tsx` (enlaces copiables, costos, asignación manual de solicitudes sin campaña).
### 4. Agregar desde enlace (fila 60)
SQL `catalog-clipper-local.sql` (recorte inmutable, revisión «guardado/descartado» una vez, «guardado» exige el artículo en `pro_products`). `product-clipper.tsx` en Mis artículos: lector simulado con el mismo analizador real, robots.txt (RFC 9309) respetado, URL https sin IP/nombres locales, revisión y guardado con el escritor del catálogo. Extensión MV3 de andamiaje en `extensions/clipper/` (no publicada; `activeTab`; solo prellena `?clip=`, nada se lee hasta «Leer enlace»).
### 5. Planos 2D/3D y escaneo (filas 63–65) — trabajo › Mediciones
SQL `floor-plans-local.sql`: planos por trabajo con resumen calculado **en SQL** (área por shoelace, perímetro, largo de paredes, puertas/ventanas), CAS, historial inmutable, vínculo verificado con Mediciones, escaneos inmutables (huella, tamaño, analizador). `floor-plan.ts` (geometría, SVG, **PDF vectorial propio**, caras 3D), `work-floor-plans.tsx` (paredes, puertas, ventanas, ambientes, cotas, cuadrícula, ambiente rectangular por medidas, deshacer, PNG/PDF, **vista 3D extruida en lienzo 2D** sin dependencias, «Enviar áreas a Mediciones» por el escritor existente). `room-scan.ts`: JSON propio/RoomPlan (exacto), OBJ (envolvente), USDZ **simulado**; `room-scan-native.ts`: interfaz Capacitor `ContrataRoomScan` documentada, sin código nativo.
### 6. Correcciones pequeñas
- `$S/round6b-sql/round6b-test.sql` y `$S/round6c-sql/round6c-test.sql`: expectativa de proveedores «8+» (ahora 13). `pro-round6b-unit`/`pro-round6c-unit`: primeros 8 proveedores.
- Foto del comprobante leída por la IA: se **adjunta al gasto** al guardarlo (ruta de comprobantes de la Ronda 4B), con casilla para no adjuntarla (≤ 3 MB).
- `pro-company.spec.ts`: Correo masivo ya no es un estado bloqueado (expectativa actualizada).

### Pruebas y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` sobre los 46 archivos tocados (`$S/round6d-touched.txt`) → 0.
- `local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest.mjs` → PASS (147 módulos, 148 pasos, 357 dependencias); `verify-local-preparation-db.mjs` → PASS (147 módulos instalados y reaplicados en PGlite, `$S/round6d-sql/verify-prep-db.out`; los lectores del perfil quedaron en plpgsql porque el esquema mínimo de PGlite no tiene esas columnas); `verify-app-surface-ownership.mjs` → PASS (82 páginas, 249 manejadores; dueños `pro-round6d-site`, `pro-round6d-marketing`, `pro-round6d-clipper-plans`). Los 6 módulos nuevos (`marketing-providers`, `email-marketing`, `ads-tracking`, `pro-sites`, `catalog-clipper`, `floor-plans`) se registraron al final del manifiesto y se aplicaron con `apply-one.mjs`.
- SQL `$S/round6d-sql/round6d-test.sql` (psql loopback, `begin … rollback`): **75 PASS / 0 FAIL** — 13 proveedores en simulación, producción rechazada, clave en config rechazada; sitio: sin sitio nada público, contenido inválido/dirección reservada, idempotencia y reuso 22023, CAS 40001, dirección única entre dueños 23505, **publicar = versión pública; borrador nuevo invisible hasta publicar**, versión inmutable y sin DELETE, foto ajena rechazada, versión anterior intacta, **sin id de dueño/correo/reseña oculta en lo público**, otra dueña y cliente sin acceso, sin formulario → P0002, despublicado → nada; formulario → cliente + solicitud con origen «advertising» y etiqueta de campaña, atribución con UTM inmutable, **sin casilla no hay contacto de marketing**, mismo envío sin duplicar; con casilla consentimiento con texto y evento; **consentimiento obligatorio en la base** (42501 a quien no consintió, prueba solo al dueño, mock ⇒ simulado), audiencia solo con consentimiento, programada enviada una sola vez, mensajes inmutables, baja por token (vista previa sin cambios, supresión, repetición inocua, token desconocido/mal formado), suprimido no se puede volver a agregar, **automatización = borrador pendiente; aprobación una vez**, otra dueña no aprueba; costos solo-agregar, anulación única, reporte (1 visita, 1 solicitud, ₡20 000, costo por solicitud ₡20 000, ROI −100 %, fila «sin campaña»); recortes inmutables y revisados una vez; planos con área 12 / perímetro 14 / paredes 7 calculados en SQL, contenido inválido, CAS, historial inmutable, otra dueña sin acceso, vínculo a Mediciones inexistente, escaneo → plano; postura (RLS, sin grants anon/authenticated, sin DELETE en versiones/mensajes/supresión/eventos/costos/atribuciones, security invoker). Repetidas: Ronda 6B **88/88** y Ronda 6C **75/75** con la expectativa «8+ proveedores».
- Unitarias `tests/e2e/pro-round6d-unit.spec.ts` (7 pruebas, **sin red**: `fetch` falso): analizador OG/schema.org, robots.txt (RFC 9309), seguridad de URL, lector simulado y real (robots primero, solo HTML), petición Brevo con baja de un clic, stubs Meta/Google/Cloudflare, registro, geometría + SVG + **PDF con xref verificado** + caras 3D, analizadores de escaneo (JSON propio, RoomPlan, OBJ, USDZ simulado), contenido del sitio, texto de consentimiento, honeypot y enlaces UTM.
- E2E secuencial (workers 1, 127.0.0.1:3185, `$S/r6d-logs/`):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-round6d-unit (nueva) | 7/7 | 7/7 |
| pro-round6d-site (nueva, ES/EN) | 2/2 (y 2/2 repetida con fotos servidas localmente) | 2/2 (y 2/2 repetida) |
| pro-round6d-marketing (nueva, ES/EN) | 2/2 (y 2/2 repetida) | 2/2 (y 2/2 repetida) |
| pro-round6d-clipper-plans (nueva, ES/EN) | 2/2 | 0/2 → 2/2 (la prueba tocaba el lienzo fuera de la vista; ahora desplaza y usa toque) |
| pro-lead-center | 3/6 → 4/6 repetida | 4/6 (repetida 4/6) |
| pro-request-pipeline | 4/4 | 4/4 |
| pro-lead-origins-journey | 3/4 → 4/4 repetida | 4/4 |
| pro-leads-inboxes | 6/6 | 6/6 |
| pro-catalog-item-types | 0/1 → 1/1 repetida | 1/1 |
| pro-catalog-import | 3/3 | 3/3 |
| pro-takeoffs | 2/2 | 2/2 |
| pro-takeoffs-pdf | 2/2 | 2/2 |
| pro-expenses / pro-expenses-english | 1/1 · 1/1 | 1/1 · 1/1 |
| pro-round6a-einvoice-unit / pro-round6a-integrations | 8/8 · 4/4 | 8/8 · 4/4 |
| pro-round6b-unit / esign / connectors / accounting | 6/6 · 2/2 · 2/2 · 2/2 | 6/6 · 2/2 · 2/2 · 2/2 |
| pro-round6c-unit / ai / meetings / followups | 8/8 · 2/2 · 2/2 · 2/2 | 8/8 · 2/2 · 2/2 · 2/2 |
| pro-company | 3/3 | 3/3 |
| pro-client-dashboard | 2/2 | 2/2 |
| pro-profile-routes-local | 2/2 | 2/2 |
| pro-tools-profile-menu | 2/2 | 2/2 |

`pro-lead-center` «existing customer editor returns to the same unsent opportunity» (ES/EN) falla en ambos perfiles **también con la versión anterior de `catalog-workspace.tsx`** (único archivo de esta ronda en ese recorrido; prueba de línea base en `$S/r6d-logs/baseline-chromium-desktop.log`): el spec espera el borrador sin cliente al volver y la app ya selecciona el cliente creado. Previa y ajena; no se tocó.

### Capturas revisadas (`$S/round6d-shots/`, 52 capturas ES/EN, escritorio y teléfono)
Editor y vista previa del sitio, sitio público y solicitud enviada, reporte de anuncios, enlaces UTM, contactos y consentimiento, borrador de automatización, bandeja de salida «simulado», página de baja, recorte de producto, plano 2D, vista 3D y escaneo. **Correcciones durante la revisión:** anidación inválida en el pie del sitio (logo dentro de `<p>`, error de hidratación); «1 reseñas» → «1 reseña»; las fotos de prueba ya no se piden a un tercero (se sirven localmente en el spec); textos predeterminados de las automatizaciones en inglés con la interfaz en inglés; el enlace de la extensión ya no se lee solo (solo se prellena).

### Pendiente y por qué
- Activaciones reales (Brevo, Cloudflare for SaaS, Meta/Google Ads, lector de enlaces): requieren cuentas, abogado (Ley 8968, términos) y el OK de Isaac por activación (guía §13–18). Ningún adaptador real se ejecutó (por regla).
- Correo real: falta el despachador de mensajes «en cola» y el webhook de rebotes/quejas; métricas reales de apertura/clic no existen (las mostradas son simuladas y rotuladas).
- Sitio: rutas solo de desarrollo; dominio propio y entrada en `sitemap.ts` de producción quedan para su activación. El contenido de la portada sigue siendo texto; sin galería por servicio ni páginas múltiples.
- Planos: sin mobiliario/objetos, niveles ni render/AR; el analizador USDZ es simulado; el complemento nativo RoomPlan/ARCore no está programado (requiere compilación de tienda autorizada).
- Lector de enlaces: antes de producción falta la protección SSRF por resolución DNS en el borde; la extensión no está publicada.
- La altura de pared se muestra con punto decimal también en español; menor.
- `pro-lead-center` (2 pruebas) previa y ajena a esta ronda (ver arriba).

## Revisión de seguridad (2026-11-13)

Revisión de todo lo agregado en las rondas 1–6D, leyendo el código y probando cada sospecha contra la base local (127.0.0.1, `begin … rollback`) o con pruebas unitarias sin red. Cero llamadas a terceros; no se leyeron `.env.local`, secretos ni `native-env.sh`. Respaldos en `$S/security-backup/`. Sin commits, envíos ni despliegues.

### Hallazgos corregidos
- **Media · Lector de enlaces (SSRF).** `clipperUrlSchema` aceptaba `https://localhost./`, `https://metadata.google.internal./`, `https://foo.local./`, puertos no estándar (`:8443`) y nombres que resuelven a direcciones privadas (`127.0.0.1.nip.io`). Era latente (el lector real está inactivo), pero es la condición previa a producción. Corrección: el esquema rechaza los nombres que terminan en punto y cualquier puerto que no sea el 443; nuevo `clipper/safe-fetch.ts` (sin dependencias nuevas) resuelve el nombre y se conecta **solo** a la dirección revisada (la revisión ocurre dentro del `lookup` del socket, así que no hay una segunda respuesta DNS que aprovechar), rechaza las redes privadas, de bucle local, de enlace local, CGNAT, de metadatos, de multidifusión y reservadas, además de las IPv6 mapeadas, 6to4 y Teredo; no sigue redirecciones y limita el cuerpo a 1,5 MB (un cuerpo mayor da `too_large`). `service.ts` usa este lector en lugar de `fetch`.
- **Media · Formulario público del sitio sin tope.** El único límite estaba en memoria y por IP, y la IP sale de `X-Forwarded-For`, que se puede falsificar. Se probó que 30 solicitudes desde la misma dirección entraban todas como clientes y prospectos nuevos. Corrección en `pro_site_submit`: un máximo de 200 solicitudes por día por dueño y de 5 por día por correo. Al pasarse responde `54000` / `pro_site_submit_cap`, que la ruta convierte en 429. Repetir una solicitud ya aceptada sigue devolviendo la misma respuesta.
- **Baja · Dirección dada de baja.** Si alguien que se había dado de baja volvía a marcar el consentimiento, `pro_mkt_grant` devolvía 42501 y la ruta 503: esa persona no podía pedir una cotización, y la diferencia en la respuesta revelaba quién se había dado de baja. Ahora la solicitud se acepta con `marketing_consent=false`, el contacto sigue suprimido y la respuesta es idéntica a la de cualquier otra persona.

### Verificado sin hallazgo (con evidencia)
Vista previa del cliente (`pro_client_preview_actor` solo para el dueño del trabajo vinculado; los 18 lectores que usa son STABLE y solo se llaman desde GET); invitaciones (32 bytes aleatorios, solo el hash, un solo uso, de 1 a 30 días, 50 por día, consentimiento solo del destinatario verificado); enlaces de pago (monto fijado por el servidor, token HMAC de 32 bytes, límite por enlace, el pago se registra solo desde la bandeja del webhook, comprobación `amount_mismatch` e idempotencia por evento); portal de licitación (token aleatorio y HMAC con `PRO_BID_PORTAL_SECRET`, límites por sesión que no dependen de cabeceras, archivos normalizados y verificados con SHA-256); OAuth (estado de un solo uso ligado a la cuenta con sesión, PKCE S256, sobres AES-256-GCM, tokens que nunca vuelven al navegador, registro redactado); compuerta de producción (modo guardado + «ACTIVAR PRODUCCION» + `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`; las únicas escrituras de `mode` están en `pro_integration_mutate`); IA (autorización apagada por defecto, tope mensual con bloqueo en la base, solo sugerencias); firma (huella del documento comparada, `document_changed` pasa a «para revisar»); postura de la base (ninguna función `pro_` ejecutable por anon/authenticated salvo 3 ayudantes puros sin privilegios, ninguna DEFINER `pro_` sin search_path, RLS en todas, anon sin privilegios, authenticated sin escritura, vistas con security_invoker).

### Pendiente y por qué
- **Media · decisión de Isaac y de un abogado:** el consentimiento de marketing del formulario no tiene doble confirmación, así que cualquiera puede suscribir un correo ajeno. Antes de producción conviene un correo de confirmación (Ley 8968).
- Baja: `src/lib/rate-limit.ts` (compartido con producción) confía en el primer valor de `X-Forwarded-For` cuando no viene `cf-connecting-ip`. Las rutas públicas Pro tienen además límites por token o sesión y ahora un tope en la base.
- Baja: la confirmación SINPE real de Tilopay consulta `orderNumber=attemptId`, que elige el navegador, y no compara el monto. Debe corregirse antes de activar el modo real; hoy está inactivo.
- Baja: la baja de un clic (`List-Unsubscribe-Post`) apunta a `/baja-pro#t=…`. El fragmento no viaja en el POST y `proSameOrigin` lo bloquearía, así que falta un endpoint POST con el token en la consulta.
- Baja: los enlaces de correo, el `redirect_uri` y las redirecciones se arman con la cabecera Host (`proRequestOrigin`). En producción debe usarse un origen fijo.
- Baja: los formularios multipart (IA, reuniones y firma simulada) solo limitan el tamaño por `Content-Length`. Solo existen en desarrollo.
- Baja, aceptada: la firma de los webhooks simulados usa un valor fijo y público, lo que solo afecta a registros en modo simulado y en desarrollo.
- Fuera de alcance (main): `notify_on_proposal_created` es SECURITY DEFINER sin `search_path`.

### Archivos
`src/lib/pro/integrations/clipper/safe-fetch.ts` (nuevo), `clipper/parse.ts`, `clipper/adapters.ts`, `clipper/service.ts`, `src/app/api/pro/site-public/route.ts`, `docs/pro/sql/pro-sites-local.sql` (reaplicado), `tests/e2e/pro-security-unit.spec.ts` (nuevo), `$S/security-sql/security-test.sql`.

### Comandos y resultados
- SQL `$S/security-sql/security-test.sql`: **22 PASS / 0 FAIL**. `round6d-test.sql` repetido: **75 PASS / 0 FAIL**.
- `npx tsc --noEmit -p .` → 0; eslint en los archivos tocados → 0; `local-sql-manifest.mjs --check` → 0; `verify-local-preparation-manifest` → PASS (147/148/357); `verify-local-preparation-db` → PASS; `verify-app-surface-ownership` → 82 páginas / 249 rutas.
- Playwright (`pro-security-unit`, `pro-round6d-unit`, `pro-round6d-site`, `pro-round6d-clipper-plans`): chromium-desktop 16/16, webkit-mobile 16/16; `pro-round6d-marketing`: 2/2 en cada proyecto.
- Incidente durante la revisión: una prueba de «antes de la corrección» incluyó con `\i` el respaldo de `pro-sites-local.sql`, que trae su propio `begin/commit`, y dejó guardados los datos de prueba de 6D (3 usuarios `*6d11111-…` y sus filas). Se borraron por completo (búsqueda en todas las columnas uuid/texto de public/auth/storage: 0 filas) y se volvió a aplicar el SQL corregido.

## Ronda de correcciones post-seguridad (2026-11-13)

Seis pendientes de la «Revisión de seguridad» y de la Ronda 6D. Todo local y en simulación: cero llamadas a terceros, ningún correo ni cobro real. No se leyeron `.env.local`, secretos ni `native-env.sh`. Sin commits, envíos ni despliegues. Respaldos en `$S/fixround-backup/` (rutas relativas; los SQL de prueba en `sqltests/`).

### 1. Baja de un clic (RFC 8058)
- Nuevo `POST /api/pro/marketing-unsubscribe/one-click?t=<token>`: acepta **solo** el cuerpo exacto `List-Unsubscribe=One-Click` (form-urlencoded o multipart, ≤ 512 bytes); solo en ese caso no exige el mismo origen (cualquier otro cuerpo: 403 de otro origen, 400 del mismo). Idempotente (`pro_mkt_unsubscribe`), límite por dirección (60/min) y por token (10/min), y la respuesta es **idéntica** (`200 OK`) para token válido, repetido, desconocido o mal formado; solo una base caída da 503. `GET` nunca da de baja: redirige (303) a `/baja-pro#t=…`.
- `marketing/unsubscribe-links.ts` (puro) arma la URI del encabezado desde el enlace de la página; `brevo.ts` pone `List-Unsubscribe: <…/one-click?t=…>` + `List-Unsubscribe-Post`; sin token válido no se envía `List-Unsubscribe-Post`. Autoprueba del proveedor actualizada. Dueño de regresión: `pro-round6d-marketing.spec.ts`.

### 2. Confirmación SINPE con Tilopay
- La ruta `/api/pro/pay` genera la referencia `ccr_sinpe_<32 hex>` en el **servidor**, guarda el intento «pendiente» con ella **antes** de preguntar al procesador y consulta esa referencia guardada con el monto y la moneda del intento (no el `attemptId` del navegador). Si el procesador no confirma, el intento se cierra con `pro_payment_attempt_fail` (nuevo, `online-payments-local.sql`: solo intentos SINPE pendientes del mismo enlace).
- `payments/tilopay-consult.ts` (puro): aprobado solo con una única fila, `code=1`, nuestro número de orden si viene, y **monto y moneda iguales**; si falta un campo no hay coincidencia → `amount_mismatch` (el mismo motivo de la bandeja de avisos, que sigue sin registrar un aviso con otro monto). Mensaje ES/EN para el pagador. La simulación usa la misma referencia del servidor.

### 3. Límites reales en formularios multipart
- `src/lib/pro/bounded-body.ts` (nuevo, puro): `readBoundedBody` lee el cuerpo como flujo y corta al pasar el límite aunque `Content-Length` falte o mienta; `proBoundedJson` (route-common.ts) ahora lo reutiliza. `proBoundedForm`: tope total, lista cerrada de campos (cada uno una vez), máximo de archivos y tamaño por archivo. `sniffImage`/`sniffAudio`: tipo por los primeros bytes.
- IA (`/api/pro/ai`): 1 archivo, campos fijos, tope 8 MB + 64 KB; foto ≤ 5 MB JPEG/PNG/WebP real; audio ≤ 8 MB con contenedor reconocido; el tipo que se usa es el detectado. Reuniones (`/api/pro/ai-meetings`): igual; el tipo guardado es el detectado. Firma simulada (`/api/pro/esign/mock-sign`): 8 KB, sin archivos, solo `t/action/typedName/consent/reason`.
- Specs: los audios de prueba llevan cabecera WebM real; `pro-round6c-meetings` comprueba que un «audio/webm» falso y un campo extra se rechazan.

### 4. Spec desactualizada de `pro-lead-center`
Solo el spec: al volver del editor de cliente el borrador es el mismo salvo `clientId`, que ahora es el cliente recién creado (comportamiento de la Ronda 2) y el selector ya lo muestra. App sin cambios. **6/6** en ambos perfiles.

### 5. Altura de paredes con decimales del idioma
`work-floor-plans.tsx`: campo `DecimalInput` que muestra `2,4` en español y `2.4` en inglés, acepta coma o punto al escribir y respeta 1–20 m. `pro-round6d-clipper-plans` lo comprueba.

### 6. Doble confirmación del marketing (Ley 8968), por defecto
- `email-marketing-local.sql`: estado `pending`, columnas `confirmation_requested_at`/`confirmed_at`, CHECK `pro_mkt_contacts_double_optin` (un contacto del formulario no puede quedar «con consentimiento» sin confirmar) y `pro_mkt_contacts_pending`; eventos `requested`/`confirmed` (fuente `confirmation_link`). Tabla `pro_mkt_confirmations`: borrador del correo del adaptador **simulado** (CHECK `mode='mock'`, `delivery='simulado'`), clave = SHA-256 del token, vence en 7 días, de un solo uso (trigger: solo `used_at`, una vez); **ningún lector del dueño la expone**. `pro_mkt_request_confirmation` (silencioso si la dirección está dada de baja o ya consintió; como mucho un correo por dirección cada 24 h) y `pro_mkt_confirm` (vista previa sin cambios; confirmar una vez; vencido o dado de baja → no concede). El trigger `pro_mkt_message_guard` también rechaza a un contacto del formulario sin confirmar; `pro_mkt_grant` ya no acepta la fuente `site_form`.
- `pro-sites-local.sql`: la casilla llama a `pro_mkt_request_confirmation` (la huella de la solicitud ignora `confirmBase` y `language`). Se mantiene la respuesta idéntica y silenciosa para direcciones dadas de baja.
- Público: página `/[locale]/confirmar-pro` (`marketing-confirm.tsx`, el token va en el fragmento; abrirla no confirma) y `POST /api/pro/marketing-confirm` (mismo origen, límites por dirección y por token). Reservada en `middleware.ts` y `site-routes.ts`; dueños `pro-round6d-site.spec.ts`. En Correo masivo el contacto pendiente se muestra como «falta que lo confirme».
- El consentimiento que registra el dueño con evidencia sigue igual.

### Archivos
Nuevos: `src/lib/pro/bounded-body.ts`, `src/lib/pro/integrations/payments/tilopay-consult.ts`, `src/lib/pro/integrations/marketing/unsubscribe-links.ts`, `src/app/api/pro/marketing-unsubscribe/one-click/route.ts`, `src/app/api/pro/marketing-confirm/route.ts`, `src/app/[locale]/confirmar-pro/page.tsx`, `src/components/pro/marketing-confirm.tsx`. Modificados: `route-common.ts`, `api/pro/ai`, `api/pro/ai-meetings`, `api/pro/esign/mock-sign`, `api/pro/pay`, `api/pro/site-public`, `payments/{processor,mock,tilopay,api}.ts`, `marketing/brevo.ts`, `self-test.ts`, `marketing.ts`, `company-marketing.tsx`, `work-floor-plans.tsx`, `middleware.ts`, `site-routes.ts`, `verify-app-surface-ownership.mjs`, SQL `email-marketing-local.sql`, `pro-sites-local.sql`, `online-payments-local.sql` (los tres reaplicados con `apply-one.mjs`), specs `pro-security-unit`, `pro-round6d-unit`, `pro-round6a-einvoice-unit`, `pro-round6d-site`, `pro-round6d-marketing`, `pro-round6d-clipper-plans`, `pro-round6c-ai`, `pro-round6c-meetings`, `pro-lead-center`; guía [integrations-setup-guide-local.md](integrations-setup-guide-local.md) §2 y §14.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 35 archivos tocados → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (147 módulos, 148 pasos, 357 dependencias). `verify-local-preparation-db` → PASS (147 módulos instalados y reaplicados en PGlite). `verify-app-surface-ownership` → 83 páginas / 251 rutas.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round6d-sql/round6d-test.sql` **79 PASS / 0 FAIL** (antes 75: el formulario con casilla ahora deja «pendiente»; +4: enlace personal con solo su huella, vista previa sin cambios, confirmar → «con consentimiento» con evento, token de un solo uso). `$S/security-sql/security-test.sql` **45 PASS / 0 FAIL** (antes 22: doble confirmación — pendiente fuera de la audiencia, 42501 del trigger, CHECK 23514, `pro_mkt_grant` 22023, el lector del dueño no expone el enlace, sin segundo correo en 24 h, confirmación inmutable, token desconocido/mal formado, vencido, dado de baja después, un solo uso; SINPE — intento pendiente con la referencia del servidor, cierre solo con el mismo token y código válido, `amount_mismatch` visible para el pagador, no se cierra dos veces, aviso con el id del navegador → `unknown_reference`, aviso con otro monto → `amount_mismatch` sin abono). Verificado después: 0 filas de prueba persistidas.
- Playwright (workers 1, 127.0.0.1:3185, `$S/fix-logs/`):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| pro-security-unit (9, 4 nuevas) | 9/9 | 9/9 |
| pro-round6d-unit / 6a-einvoice-unit / 6b-unit / 6c-unit | 7/7 · 8/8 · 6/6 · 8/8 | 7/7 · 8/8 · 6/6 · 8/8 |
| pro-round6d-site (doble confirmación) | 0/2 → 2/2 (el spec navegaba solo por el fragmento; se corrigió el spec) | 2/2 |
| pro-round6d-marketing (un clic) | 2/2 | 2/2 |
| pro-round6d-clipper-plans (altura 2,4) | 2/2 | 2/2 |
| pro-round6c-meetings / pro-round6c-ai | 2/2 · 1/2 → 2/2 (botón «Nuevo gasto» aún deshabilitado al cargar, antes de subir nada) | 2/2 · 2/2 |
| pro-round6b-esign | 2/2 | 2/2 |
| pro-round6a-integrations (SINPE simulado) | 4/4 | 4/4 |
| pro-lead-center | 6/6 | 6/6 |

### Pendiente y por qué
- SINPE real: falta confirmar en el sandbox de Tilopay los nombres de los campos de `/consult` y crear allí la orden SINPE con la misma referencia al abrir `/pagar` (hoy el modo real está inactivo; regla: sin llamadas reales).
- Correo real: el envío del correo de confirmación y de las campañas sigue sin despachador (solo borradores simulados); el token de la baja de un clic va en la consulta de la URL, así que el servidor real no debe registrar consultas completas.
- Siguen igual (fuera de este encargo): `X-Forwarded-For` en `src/lib/rate-limit.ts` (compartido con producción), enlaces armados con la cabecera Host, firma fija de los webhooks simulados.
- Incidente durante la ronda: un script mío cargó `$S/qa2-env.zsh` pasándole sus argumentos y ese archivo ejecutó otro runner del scratchpad (`qa2-run.zsh` → `fix-run2.zsh`), que reinició el servidor 3185 y lanzó Playwright con argumentos inválidos («No tests found»). Se detuvo con TaskStop, se levantó de nuevo el servidor y desde entonces el entorno se carga sin argumentos.

## Ronda 7A Circuito cotización-trabajo-finanzas (2026-11-13)

Objetivo: que cotización → trabajo → cliente → finanzas sea un solo circuito, como en Houzz (un solo flujo de cotización; la cotización aceptada manda sobre el trabajo). Base: recorrido 2 (`$S/walkthrough2/report.md`, capturas por número). Todo local: sin llamadas a terceros, correos, cobros ni facturas reales; sin commits, envíos ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh`. Respaldos en `$S/round7a-backup/` (rutas relativas; `NEW.txt` lista los archivos nuevos). El servidor 3185 se reinició una vez (RSS 6,0 GB > 5,5 GB).

### 1. Un solo flujo de cotización (bug 3; capturas 23–26, 52 vs 91)
- En el espacio Pro se retiró «Preparar cotización con enlace» (`leads-workspace.tsx`; solo queda «Completar perfil público» cuando falta el perfil). La URL antigua `?tab=quotes&nueva=1` (solicitud, ficha del cliente, «Crear cotización»…) abre el **editor completo** con el mismo cliente, y con la oportunidad manual como origen si venía de ella (`sales-workspace.tsx`). En el panel del marketplace (`/dashboard/profesional`) el editor antiguo no cambia.
- Datos existentes: las cotizaciones con enlace anteriores siguen en la lista y se abren igual, marcadas «Compartida · cotización anterior con enlace».
- Un solo juego de nombres de estado para el dueño (`src/lib/pro/quote-status.ts`): Borrador, Compartida, Cambios solicitados, Aceptada, Rechazada, Retirada, Archivada. Se usa en Cotizaciones, Cotizaciones del trabajo, la versión compartida, la lista antigua y la ficha del cliente (antes «Borrador privado» siempre; ahora el estado comercial real, `private-estimate-related.tsx`).
- `pro-manual-lead-quotes-journey.spec.ts` probaba justo la creación retirada: queda marcado `test.skip` con el motivo (no se borró).

### 2. Compartir con el cliente vinculado sin código (bug 2; 27, 28, 34, 37)
- `private-estimate-publications-local.sql`: una cuenta vinculada al trabajo por **invitación** (`origin='project_invite'`, sin reserva) ya es destinatario «vinculado» válido, en la lista de destinatarios y en el escritor (mismo control de bloqueo, mismo cliente, trabajo no cancelado). Cualquier otra cuenta → 40001.
- UI: si el trabajo tiene cuenta vinculada, «Compartir» la propone primero («Cuenta vinculada al proyecto: … (sin código)») y explica que aparece de inmediato; el correo + código sigue para clientes sin cuenta.
- El cliente la ve al instante: nueva sección «Cotizaciones» del proyecto (`client-project-quotes.tsx`, lector `pro_client_project_quotes_read`; en la vista previa del dueño se lee como ese cliente) con «Revisar y responder», que abre esa versión en Cotizaciones (`#publicacion=<id>`, solo en el fragmento). También en Finanzas (si está activa).
- El enlace del cliente nombra la cotización: `…/dashboard/cotizaciones#cotizacion=<nombre-de-la-cotizacion>` y la etiqueta «Enlace del cliente para «título»». El código nunca va en el enlace.

### 3. La aceptación se propaga (bug 4, 8; 39, 40, 42, 43, 52)
- `quote-circuit-local.sql` (nuevo, registrado en el manifiesto): cuando el cliente acepta una versión compartida a la **cuenta vinculada** de un trabajo (directo o por la firma simulada), un disparador sobre los recibos inmutables continúa esa versión en **ese** trabajo con el libro existente `pro_private_estimate_work_agreements` (las mismas reglas de «Continuar en el trabajo»: mismo cliente, trabajo activo, sin otro acordado ni movimientos antiguos). Con eso, de una sola fila: importe acordado (fórmula única `pro_work_account`, sin doble conteo), fase del trabajo «Cotización aceptada», siguiente paso, líneas para facturar y vínculo del cliente. Nunca espera ni bloquea la aceptación (try-lock / NOWAIT; si algo no cuadra no crea nada y el dueño continúa a mano). Una versión reclamada por correo + código conserva la decisión explícita del dueño (contrato existente verificado en `verify-local-preparation-db`); el Resumen lo dice: «El cliente aceptó la cotización: continúela en este trabajo» (`work-header-local.sql`, `estimateAwaitingContinue`). Relleno único de las aceptadas anteriores con las mismas reglas.
- Ficha del cliente: el trabajo muestra la fase derivada («Trabajos por coordinar · Cotización aceptada», `WorkPhaseText`) y la cotización su estado («Aceptada»).
- Solicitud: la evidencia «Cotización enviada» de una oportunidad manual cuenta también la cotización completa creada desde ella y compartida (`lead-shared-quote-stage-local.sql`); convertir sigue siendo «Ganada».
- El cliente ya vinculado al trabajo de la cotización no vuelve a ver «Seguir el proyecto: unirme»; ve «Ya se unió a este trabajo» y «Abrir el trabajo» (`work-client-invitations-local.sql`).

### 4. El código de invitación sobrevive al inicio de sesión (bug 1; 12, 13)
- `/dashboard/unirse-proyecto` ya no lo redirige el middleware (agregado a las rutas públicas locales; la página comprueba la sesión). Sin sesión, guarda el código del fragmento en `sessionStorage` de esa pestaña (30 min), lo borra de la barra y va a iniciar sesión; al volver se lee una vez y se borra (`project-invite-handoff.ts`, `project-invitation-login.tsx`). El código nunca viaja en la consulta ni a los registros del servidor (el spec lo comprueba en todas las peticiones).

### 5. Contratos desde la cotización y plantillas iniciales (29)
- Una cotización compartida que espera respuesta ya se puede vincular (además de aceptada o borrador); sus montos salen de la versión congelada (`contracts-local.sql`). En las cotizaciones del trabajo, «Crear contrato» (aceptada o compartida) abre el formulario con la cotización elegida; si no se indica, se preselecciona la aceptada.
- Tres plantillas iniciales de ContrataCR ES/EN además del contrato en blanco: Remodelación (anticipo 30 %, 7 cláusulas), Servicio puntual (4) y Mantenimiento (4), redacción propia con campos combinables válidos. Al usarla se instala una vez como plantilla editable de la cuenta y el contrato se crea con el escritor existente (`pro_contract_starter_create`, recibo idempotente; identificador UUID v4 determinista).

### 6. Facturación por líneas de la cotización (47, 49)
- Al quedar la cotización aceptada en el trabajo, «Facturar desde el trabajo» ofrece sus líneas; nuevo campo «Cantidad a facturar» por línea (se convierte en el % que registra el servidor). Lo facturado por líneas excluye el avance del acordado y viceversa (disparador existente; probado).
- Emisor: todo borrador nuevo sin datos de emisor guardados empieza con el nombre de la empresa (o de la cuenta), también los creados desde el trabajo (`invoice-document-settings-local.sql`). Teléfono del receptor con `proPhone` (`invoice-draft.tsx`).

### 7. «Resultado» igual con igual (59)
- Finanzas del Resumen: «Importe acordado (IVA incluido)», «Acordado sin IVA», «Costos y comprometido» (con órdenes de compra) y debajo la base escrita («Acordado sin IVA menos costos registrados y lo comprometido…»); si el acordado se escribió a mano, lo advierte (`work-overview-local.sql` expone `agreedNetCents`/`agreedTaxCents`).

### 8. Siguiente paso de un trabajo nuevo (10)
- Sin fechas: «Prepare y comparta la cotización…» con «Abrir cotizaciones»; «Finalizar trabajo» sale del bloque («¿Ya terminó este trabajo?», contorno).

### 9. Filas huérfanas
- `pro_appointment_requests`: **0** huérfanas (todas sus columnas de cuenta y profesional tienen FK; el aviso del recorrido era la FK bloqueando el borrado, no filas huérfanas).
- Barrido de columnas de cuenta sin FK en tablas `pro_*` (`$S/round7a-sql/orphans.sql`): `pro_time_history` **1237** filas (114 dueños inexistentes) y `pro_contract_history` **699** filas (90 dueños; dueño y actor inexistentes). Se borraron solo esas. Las cuentas desechables de las pruebas de esta ronda dejaron otras 30 + 110 al limpiarse; también se borraron al final (`$S/round7a-sql/orphans-deleted.txt`). Barrido final: 0; `pro_appointment_requests` huérfanas: 0. No se puede atribuir cuáles eran del recorrido y cuáles de pruebas anteriores: no guardan correo.

### Archivos
Nuevos: `docs/pro/sql/quote-circuit-local.sql`, `src/lib/pro/quote-status.ts`, `src/lib/pro/project-invite-handoff.ts`, `src/components/pro/client-project-quotes.tsx`, `src/components/pro/project-invitation-login.tsx`, `tests/e2e/pro-round7a-circuit.spec.ts`. Modificados: SQL `private-estimate-publications`, `contracts`, `work-client-invitations`, `lead-shared-quote-stage`, `invoice-document-settings`, `work-overview`, `work-header`; `scripts/pro/local-sql-manifest.mjs`; `src/middleware.ts`; rutas `api/pro/contracts`, `api/pro/private-estimate-publications`, página `unirse-proyecto`; componentes `business-panel`, `client-operations`, `client-pending`, `client-work-sections`, `connected-quotes`, `invoice-draft`, `leads-workspace`, `private-estimate-client-inbox`, `private-estimate-publication-document`, `private-estimate-publications`, `private-estimate-related`, `private-estimates-workspace`, `project-estimates`, `project-invitation-accept`, `sales-workspace`, `work-billing`, `work-contracts`, `work-header`, `work-overview`; `lib/pro/contracts.ts`, `private-estimate-publications.ts`, `work-overview.ts`; spec `pro-manual-lead-quotes-journey` (skip).

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 30 archivos TS/TSX tocados → 0 (`$S/round7a-eslint.txt`). `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (148 módulos, 149 pasos, 365 dependencias). `verify-local-preparation-db` → PASS (148 módulos instalados y reaplicados en PGlite; `$S/round7a-sql/verify-prep-db.out`). `verify-app-surface-ownership` → 83 páginas / 251 rutas (no se agregó ninguna ruta `/api/pro`; las vistas nuevas van en rutas existentes con dueño).
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round7a-sql/round7a-test.sql` **44 PASS / 0 FAIL** (cuenta por invitación como destinatario vinculado, otra cuenta 40001, el cliente la ve en el proyecto y en Cotizaciones, aceptación → acuerdo único, importe, fase, sin «unirse», réplica idempotente, inmutable; facturar 50 % de una línea, emisor de la empresa, >100 % y avance → 40001; contrato desde compartida pendiente; plantillas iniciales ES/EN, réplica, una sola plantilla instalada, UUID v4, 22023/42501; código por correo sin continuación automática; trabajo cancelado sin acuerdo y sin error; evidencia de la solicitud; postura). Sin regresión: round1 invite 49, figures 22, round4a 45, round4b billing 36, round5 83, round6b 88, round6c 75, round6d 79 (todos 0 FAIL).
- Playwright (workers 1, 127.0.0.1:3185, `$S/r7a-logs/`):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round7a-circuit** (nuevo, ES/EN) | 2/2 | 2/2 |
| pro-private-estimates-journey · publications-api · work-journey · work-api · commercial-list-journey | 6/6 · 5/5 · 2/2 · 6/6 · 2/2 | 6/6 · 5/5 · 2/2 · 6/6 · 2/2 |
| pro-private-estimate-publications-journey | 0/2 → 2/2 (el spec esperaba el enlace genérico; ahora espera `#cotizacion=<nombre>`) | 2/2 |
| pro-project-planning · sales-workspace · quotes-unified · lead-private-quotes-journey | 3/3 · 1/1 · 1/1 · 4/4 | 3/3 · 1/1 · 1/1 · 4/4 |
| pro-manual-lead-quotes-journey | 4 omitidas (flujo retirado) | 4 omitidas |
| pro-work-client-invite · client-dashboard · round4a | 3/3 · 2/2 · 4/4 | 3/3 · 2/2 · 4/4 |
| pro-contracts | 2/2 | 0/2 → 2/2 al repetir (campo combinable en el cursor en WebKit; archivo no tocado) |
| pro-round4b-billing | 3/4 → 4/4 al repetir (dos «Preparando datos…» a la vez: bug 6 del recorrido) | 4/4 |
| pro-invoice-drafts · invoice-preparation | 1/1 · 0/1 → 1/1 (el respaldo del emisor quedó solo para borradores directos) | 1/1 · 1/1 |
| pro-round5-payment-plan · credit-notes-statement | 4/4 · 2/2 | 4/4 · 2/2 |
| pro-credits-retainers | 2/2 | 1/2 → 2/2 al repetir (petición `connectors?autosync=1` cancelada al navegar) |
| pro-lead-center · lead-center-api | 6/6 · 6/6 | 5/6 → 6/6 al repetir (opción del cliente aún sin cargar) · 6/6 |
| pro-round2-ux | 6/6 | 6/6 |
| pro-round6a-einvoice-unit · 6b-unit · 6c-unit · 6d-unit | 8/8 · 6/6 · 8/8 · 7/7 | 8/8 · 6/6 · 8/8 · 7/7 |

### Capturas revisadas (`$S/round7a-shots/`, 40, ES/EN, escritorio y teléfono)
Siguiente paso, compartir con cuenta vinculada, cotizaciones del proyecto del cliente, cliente tras aceptar, Resumen con la cotización aceptada, ficha del cliente, contrato desde plantilla inicial, editor del contrato, facturar por cantidad e invitación tras iniciar sesión. Sin desbordes horizontales (comprobado); textos en usted. Observación: en el selector de destinatario el texto largo se corta en pantallas angostas (lo completa la nota debajo).

### Pendiente y por qué
- Una versión reclamada por correo + código **no** se continúa sola en el trabajo: el verificador `verify-local-preparation-db` fija ese contrato (el dueño decide «Continuar en el trabajo»). El Resumen lo pide de forma explícita. Si Isaac quiere que también sea automático, hay que cambiar ese contrato y sus pruebas.
- Solicitudes públicas (marketplace) con cuenta: su cotización también abre el editor completo; se comparte con la cuenta cuando la solicitud ya es trabajo con esa cuenta (destinatario vinculado). La cotización antigua del marketplace sigue en `/dashboard/profesional`.
- Facturar por cantidad: el servidor sigue registrando % de la línea (la línea del borrador muestra la cantidad total con precio proporcional y «(50 %)»); no se cambió el escritor de facturas.
- Nombres de estado del lado del cliente: se mantienen en su perspectiva («Pendiente de su respuesta»).
- Fuera de alcance y vistos al repetir: borrador de factura duplicado (bug 6), inserción del campo combinable en WebKit, autosync del calendario cancelado al navegar y carga lenta de la lista de clientes en Solicitudes; pasaron al repetir, no se corrigieron.
- No se pudo atribuir qué filas huérfanas eran del recorrido (las tablas de historial no guardan correo); se borraron todas las probadas como huérfanas.

## Ronda 7B (2026-11-13)

Base: recorrido 2 (`$S/walkthrough2/report.md`, capturas por número) y lo pendiente de 7A. Todo local: sin llamadas a terceros, correos, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Respaldos en `$S/round7b-backup/` (rutas relativas; `NEW.txt` lista los nuevos). El servidor 3185 se reinició una vez (RSS 6,96 GB > 5,5 GB, con pruebas agotando tiempos de 15 s).

### A. Errores del recorrido 2
- **Bug 5 «Cargando…» infinito (17, 48, 72, 88, 89, 94).** No se reprodujo en un servidor estable (sonda Playwright: Estadísticas 4 s, Equipo 13 s). Evidencia en `dev-3185.log`: lecturas `/api/pro/*` de 10–20 s «next.js» (compilación en caliente con ediciones concurrentes de otros agentes), `ChunkLoadError`, «Failed to fetch RSC payload… Falling back», sockets `ECONNRESET`. Causa: lecturas `fetch` sin plazo; una que nunca se resuelve deja el texto para siempre y ocupa una de las 6 conexiones por origen (HTTP/1.1), y las siguientes lecturas hacen cola detrás. **No** era `navigation.ts` (el árbol del router se reutiliza solo en `/dashboard/profesional` y no participa en `/dashboard/pro`). Corrección: `src/lib/pro/fetch-watchdog.ts` (instalado en el layout de `/dashboard/*`, `pro-fetch-watchdog.tsx`): toda lectura GET same-origin `/api/pro/*` tiene plazo de 25 s, un reintento silencioso y después el error + «Reintentar» propio de cada pantalla; las escrituras no se tocan ni se reintentan; respeta la señal del llamador. Transición de sección: si «Abriendo sección…» dura más de 30 s se abre la misma dirección como carga normal (`use-pro-section-navigation.ts`). «Cargando registro…» móvil ~20 s (92): mismo origen (compilación); no se cambió la navegación móvil por secciones (cambiar la cuadrícula por un selector rompería decenas de pruebas que pulsan esos botones).
- **Bug 6 borrador de factura duplicado.** Causa: cada `InvoiceDraftAction` montada (diálogo del trabajo, ficha del cliente, cada cotización conectada) abría su propio editor con solo ver `?factura=`. Ahora la dirección nombra el origen (`facturaOrigen=work:<id>`) y solo esa acción abre el editor; sin origen (borradores existentes abiertos desde Facturación o Plan de pagos) lo abre solo la primera montada. Cerrar quita ambos parámetros.
- **Bug 7 invitar proveedor creado en el lugar.** Carrera: «Invitar a los seleccionados» seguía activo mientras «Agregar y seleccionar» guardaba; con la compilación lenta se enviaba una selección vacía → «No se pudo guardar». Ahora el botón espera a la creación, el proveedor queda seleccionado antes de recargar el directorio, las recargas del directorio tienen secuencia (una vieja no pisa a la nueva) y una selección vacía da un mensaje claro.
- **Bug 9 panel en blanco al cambiar de sección.** Al cambiar de sección del trabajo, si el contenido quedó por encima de la vista, el cuerpo del diálogo vuelve al inicio de la sección (`job-workspace.tsx`).
- **Inestables.** Campo combinable en WebKit: el cursor se recuerda también en `keyup`, `mouseup` y `blur` (WebKit no siempre emite `select` con cursor colapsado). Autosincronización del calendario: la lectura `?autosync=1` se aborta al salir (`pagehide`/desmontaje) en vez de quedar cancelada por la navegación.

### B. Textos y cosmética
- «Todavía no has pedido ningún profesional» bajo un proyecto vinculado: con proyectos vinculados y sin publicaciones se muestra «No ha publicado solicitudes. ¿Necesita otro profesional?» + «Publicar proyecto» (16, 41).
- Fecha de aceptación del contrato con el mismo formato que el resto («13 nov 2026, 5:58 p. m.», `cr-stamp.ts`) (36).
- Próximas tareas con período planificado muestran el período, no «Sin fecha» (`work-overview-local.sql`) (59).
- Tarjeta de archivo: tamaño con un solo formato (`proFileSize`: B/KB/MB) y versión («Versión 1 · la vigente es la 2») (62). Selector de etapa de Solicitudes más ancho (04).
- Versión compartida: conserva el encabezado de sección (el *snapshot* guarda `group`; nunca costo ni catálogo), «Impuesto» y colones con `proMoney` (38). Precio unitario del borrador de factura con `proMoney` cuando no tiene más de 2 decimales (28).
- Integraciones: ya no se muestra `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`; dice «requiere habilitación del administrador» (UI y mensaje de la ruta) (83).
- Contratos: «Abrir Empresa › Plantillas» junto al aviso de biblioteca vacía (`openProSection`).
- `/es/...` explícito gana a la cookie inglesa: el salto 308 a la raíz deja `NEXT_LOCALE=es` en navegación real (no en precargas) y no se guarda en caché (`middleware.ts`).
- «Inventario guardado.» → «Artículo guardado.» (86).
- Usted en las pantallas cliente señaladas: «Lo que pidió y quién le respondió», vacío de proyectos y Estadísticas («Su perfil», «Sus publicaciones»…) (16, 88). El resto del marketplace conserva su voz de tú (no se cambió en esta ronda).
- Hub: «Contactos» del Centro de empresa se llama «Clientes»; «Archivos de la empresa» tiene una sola entrada (menú lateral; `?empresa=archivos` sigue abriendo para enlaces viejos). Equipo se abre dentro del armazón Pro (cabecera, título y menú lateral; `team-shell.tsx`, `TeamSpace embedded`); colaboradores sin Pro mantienen la página simple (89).
- PNG→JPG: aviso en archivos del trabajo, tableros, discusión de tareas y mediciones (la versión ya lo tenía).
- EN tareas de ejemplo en español (90): son datos del usuario creados con la interfaz en español (el ejemplo sí se crea en el idioma de la interfaz); no se traducen datos guardados.

### C. Paridad Houzz
- **Reportes** (nuevo): en Estadísticas, «Financiero» (facturado, cobrado, pendiente por antigüedad 0–30/31–60/61–90/90+ días por día CR, resultado por trabajo) y «Trabajos» (etapa, fechas, acordado, facturado, cobrado, saldo), con período y «Exportar CSV» (BOM, decimales planos, celdas tipo fórmula neutralizadas). `pro-reports-local.sql` (`pro_reports_read`, security invoker, solo service_role, 42501 sin Pro, 22023 período inválido; cifras por trabajo con `pro_work_overview_read(...,'finance')`, sin fórmula nueva), `/api/pro/reports` (dueño de regresión `pro-round7b-suite.spec.ts`), `pro-reports.tsx`, `lib/pro/reports.ts`.
- **Extras/cambios**: cantidad, costo unitario y recargo por línea (el importe se calcula y el servidor exige `round(cant × costo × (1+recargo))` exacto; los tres juntos), impacto en el cronograma 0–365 días; al aprobarse (cliente o aprobación registrada) las tareas que terminan de último se extienden una vez y sube la revisión del plan; días y desplazamiento inmutables; réplica idempotente. `work-change-details-local.sql` (disparadores sobre el mutador existente, sin cambiar firmas), `work-changes.ts/tsx`, ruta `work-changes` (lee días con `pro_work_change_schedule_read`).
- **Plantillas del plan**: «Guardar y aplicar a este trabajo» (también desde los ejemplos) pasa directo a fecha de inicio + vista previa (55). **Lista de tareas en el orden del plan** (inicio previsto → vencimiento, cursor con la misma clave; `private-work-tools-access-local.sql`).
- **Solicitudes**: valor estimado (ingreso previsto de oportunidades manuales) y última actividad por fila.
- **Catálogo**: margen (monto y %) en la ficha del artículo.

### No hecho en 7B (honesto)
- Gantt: agregar en línea, arrastrar para mover/redimensionar, filtro por responsable, deshacer.
- Fusionar «Avances» y «Resumen del día» en una Bitácora con migración.
- Un solo formulario «Registrar tiempo» (actividad, persona, facturable) y una sola entrada de costos.
- Catálogo: imagen y proveedor por artículo.
- Equipo: roles Administrador/Gerente/Miembro/Solo lectura aplicados en el servidor a las rutas de escritura Pro; invitación por correo (borrador simulado).
- Solicitudes: filtro «asignado a» (no hay modelo de asignación).
- Tableros: texto libre, flechas, dibujo.
- Límite de archivos 3 MB → 25 MB: el almacenamiento local tiene tope global `file_size_limit = "20MiB"` (`supabase/config.toml`, no se toca la pila) y seis módulos fijan 3 MiB en tabla, bucket y verificación; requiere migración coordinada.
- Hub: «Clientes» del menú (fichas, `pro_clients`) y «Clientes» del Centro de empresa (directorio editable/importación) siguen siendo dos pantallas sobre los mismos datos; «Proveedores» del menú es atajo a la misma vista del Centro (decisión de Ronda 2, con pruebas).
- Watchdog: protege lecturas; no acelera la compilación en desarrollo. La comprobación de acceso Pro conserva su propio límite de 8 s (en compilación fría puede mostrar «No se pudo comprobar el acceso… Reintentar»; el spec 7B lo reintenta como un usuario).

### Archivos
Nuevos: `docs/pro/sql/pro-reports-local.sql`, `docs/pro/sql/work-change-details-local.sql`, `src/lib/pro/fetch-watchdog.ts`, `src/lib/pro/reports.ts`, `src/lib/pro/cr-stamp.ts`, `src/lib/pro/file-size.ts`, `src/app/api/pro/reports/route.ts`, `src/components/pro/pro-fetch-watchdog.tsx`, `src/components/pro/pro-reports.tsx`, `src/components/pro/team-shell.tsx`, `tests/e2e/pro-round7b-suite.spec.ts`. Modificados: SQL `work-overview`, `private-estimate-publications`, `private-work-tools-access`; `scripts/pro/local-sql-manifest.mjs`, `scripts/ci/verify-app-surface-ownership.mjs`; `src/middleware.ts`, layout `dashboard/layout.tsx`, página `pro/equipo`; rutas `api/pro/integrations`, `api/pro/work-changes`; `lib/pro/navigation.ts`, `work-overview.ts`, `private-estimate-publications.ts`, `work-changes.ts`, `work-change-recovery.ts`; componentes `invoice-draft`, `use-pro-section-navigation`, `pro-space`, `job-workspace`, `work-bids`, `contract-clauses`, `company-connectors`, `project-link-consent`, `dashboard/client-activity`, `appointment-contracts`, `work-contracts`, `work-overview`, `work-files`, `work-file-versions`, `company-integrations`, `catalog-workspace`, `private-estimate-publication-document`, `company-hub`, `management-shell`, `team-space`, `work-mood-boards`, `team-task-discussion`, `work-takeoffs`, `manual-lead-editor`, `lead-stages-editor`, `schedule-templates`, `leads-workspace`, `business-panel`, `work-changes`; `messages/es.json`; specs `pro-company` (Clientes, 15 botones), `pro-contracts` (cursor en WebKit tras enfocar), `statistics-dashboard` («Su perfil»). Prueba SQL de 4A en `$S` actualizada al nuevo contrato (la sección se conserva; el costo nunca).

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 54 archivos TS/TSX tocados → 0 errores; 2 avisos **preexistentes** en `dashboard/client-activity.tsx` (líneas 201/216, presentes en el original; comprobado con la copia de respaldo). `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (150 módulos, 151 pasos, 377 dependencias). `verify-local-preparation-db` → PASS (150 módulos instalados y reaplicados en PGlite; `$S/round7b-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (83 páginas / 252 rutas; `/api/pro/reports` → `pro-round7b-suite.spec.ts`).
- SQL (loopback, `begin … rollback`, sin `\i`): `$S/round7b-sql/round7b-test.sql` **35 PASS / 0 FAIL** (reportes: facturado, cobrado, pendiente, antigüedad, período CR, archivado excluido, otro dueño 0, sin Pro 42501, período invertido 22023, solo service_role; lista de tareas por plan y cursor; próximas tareas con período; extras: fórmula exacta, parciales/desconocidos/días fuera de rango 22023, nada guardado al rechazar, días guardados, aprobación mueve una vez las últimas tareas, revisión del plan, acordado único, réplica sin doble desplazamiento, inmutable, lector y postura; versión compartida con sección y sin costo). Sin regresión: round1 figures 22, invite 49, round4a 45 (tras actualizar su aserción de sección), round4b billing 36, tasks-gantt 28, round5 83, round6b 88, round6c 75, round6d 79, round7a 44, security 45 (todos 0 FAIL).
- Playwright (workers 1, 127.0.0.1:3185, `$S/r7b-logs/`):

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round7b-suite** (nuevo, ES/EN + unidad del watchdog) | 3/3 (primera pasada 2 fallos por compilación fría: acceso Pro 8 s y precalentamiento con saldo nulo → corregido) | 3/3 |
| pro-round7a-circuit | 2/2 | 2/2 |
| pro-round6b-unit · 6c-unit · 6d-unit | 6/6 · 8/8 · 7/7 | 6/6 · 8/8 · 7/7 |
| pro-invoice-drafts · round4b-billing | 1/1 · 4/4 | 1/1 · 4/4 |
| pro-work-changes · work-changes-english · work-change-write-recovery | 1/1 · 1/1 · 2/2 | 1/1 · 1/1 · 2/2 |
| pro-contracts | 2/2 | 1/2 → 2/2 tras estabilizar el cursor del spec |
| pro-company · round2-ux · tools-profile-menu | 3/3 · 6/6 · 2 omitidas (solo móvil) | 3/3 · 6/6 · 2/2 |
| pro-job-workspace · round4a · private-estimate-publications-journey | 2/2 · 4/4 · 2/2 | 2/2 · 4/4 · 2/2 |
| pro-team | 5/6 → 6/6 al repetir (navegación a `/equipo` > 15 s en compilación fría) | 6/6 |
| pro-bids · schedule-templates · work-tasks · work-files | 2/2 · 1/2 → 2/2 · 2/3 → 3/3 · 3/3 | 2/2 · 2/2 · 3/3 · 3/3 |
| pro-lead-center | 1/6 → 6/6 al repetir (servidor con API > 15 s tras el reinicio) | 6/6 |
| pro-credits-retainers | 2/2 | 2/2 |
| statistics-dashboard | no ejecutado: no entra en `playwright.pro-local.config.ts` (solo `pro-*.spec.ts`); se actualizó su texto esperado | — |

### Capturas revisadas (`$S/round7b-shots/`, 24, ES/EN, escritorio y teléfono)
Reportes (financiero y trabajos), Equipo dentro del armazón (sin cabecera duplicada tras la corrección), un solo borrador de factura, extra con «2 × ₡100 + 15 %» e «Impacto en el cronograma: +4 días · se aplicará al aprobarse», formulario del extra con cantidad/costo/recargo. Sin desbordes horizontales (comprobado en reportes); textos en usted.

## Ronda 7C (2026-11-13)

Base: lista «No hecho en 7B». Todo local: sin llamadas a terceros, correos, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Respaldos en `$S/round7c-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local y `supabase/config.toml` sin tocar. Servidor 3185 sin reiniciar.

### 1. Roles de la empresa (hecho, con límites)
- Matriz y modelo en [team-roles-local.md](team-roles-local.md). SQL `team-roles-local.sql`: integrantes, invitaciones con **borrador de correo no enviado** (`delivery='draft_not_sent'`, ES/EN), eventos y actividad inmutables, recibos idempotentes, CAS. Helper único `pro_role_require` (dueño = Administrador implícito), capacidad por ruta `pro_role_route_capability`, puerta `pro_team_route_authorize`.
- Servidor: `src/lib/pro/workspace-gate.ts` desde `middleware.ts` para **todo** `/api/pro/*` (borra encabezados internos falsificados; 403 `pro_role` antes de la ruta); `src/lib/pro/workspace-user.ts` sustituye la cuenta efectiva en las 57 rutas/ayudantes que usan `safeGetUser`; `requirePro` deja entrar al espacio Pro de la empresa elegida. Ruta nueva `/api/pro/team-roles` (unirse, entrar, salir, invitar, cambiar rol, quitar).
- UI: Equipo › «Roles de la empresa» (integrantes, invitar, borrador + código, matriz, cambios hechos por integrantes, unirse, empresas donde participa); aviso «Trabajando en … como …» en el espacio Pro; controles clave marcados `data-pro-write` se ocultan según el rol (Gantt agregar/deshacer, Bitácora, registrar tiempo/costo, nuevo gasto, nueva factura, agregar solicitud, catálogo, invitar). El resto de controles siguen visibles; el servidor responde 403.
- Solicitudes: «Asignado a» por fila y filtro antes de paginar.
- Límites: la autoría interna de registros escritos por un integrante es la del dueño (quién lo hizo queda en `pro_company_team_activity`); las rutas personales de colaboradores por trabajo (`team`, `team-task-*`) no se sustituyen; un integrante que además sea cliente debe «Volver a mi cuenta» para ver sus proyectos de cliente.

### 2. Gantt (hecho)
`work-timeline.tsx`: agregar en línea, deshacer último cambio (fechas o tarea creada; la tarea se archiva con el escritor existente), teclado ←/→ (Mayús final, Alt inicio), filtro por responsable real del período cargado. Escritores y CAS existentes (`timeline_task_create`, `task_plan`). Arrastre con puntero/táctil ya existía.

### 3. Bitácora (hecho, con límite)
`work-journal-local.sql`: columnas `client_visible`, `crew_count`, `crew_minutes`, `source_update_id` en `pro_daily_logs`; migración única (marcador) de cada avance a una entrada (misma fecha CR, título, texto; visible si estaba compartido) y de los resúmenes compartidos a visibles; disparadores para avances nuevos y publicaciones nuevas; escritor `journal_set` (CAS, idempotente, historial). UI: pestaña «Bitácora/Daily log», interruptor «Visible al cliente», «Personal y horas»; los avances quedan como «notas rápidas» dentro (originales conservados). Cliente: `ClientJournal` muestra solo entradas visibles; las versiones compartidas formalmente siguen debajo con su conversación (no se duplican en la lista visible). Límite: desmarcar «Visible» no retira una versión ya compartida formalmente (es inmutable).

### 4. Tiempo y costos (hecho en el espacio Pro; parcial en el panel del marketplace)
«Registrar tiempo» de Costos y pagos abre el formulario de Horas (actividad, persona, facturable, fecha, horas) en el trabajo del espacio Pro; en `/dashboard/profesional` (sin sección Horas) se conserva el registro anterior. «Registrar costo» (Costos) y «Nuevo gasto» (Gastos) tienen los mismos campos: proveedor, categoría (nueva, `pro_expense_billing.category`), importe, IVA incluido, facturable, medio de pago y comprobante (`cost-entry-local.sql`, `cost-fields.tsx`). Siguen siendo dos pantallas (ficha del gasto vs. costo del trabajo) con campos iguales.

### 5. Catálogo (hecho)
`catalog-details-local.sql` + `/api/pro/catalog-details`: imagen privada (JPG/PNG/WebP → JPEG, ≤20 MiB, SHA-256, bucket `pro-catalog-images`) y proveedor preferido del directorio; ficha del artículo (`catalog-item-extras.tsx`).

### 6. Tableros (hecho)
Elementos `text`, `arrow` (6 direcciones, color) y `drawing` (puntero/táctil, ≤120 puntos por trazo) validados en `pro_mood_board_elements`; mismo guardado automático y deshacer/rehacer; vista del cliente los dibuja.

### 7. Límite de archivos (hecho)
20 MiB en los seis módulos (tabla, bucket, escritor; `file-size-limits-local.sql` migra los CHECK existentes) y en las constantes/verificadores TS (`file-limit.ts`; `verify-*-recovery.mjs`, `verify-delivery-photo-base64.mjs`). Validación base64 lineal (la expresión regular desbordaba la pila con 20 MiB). Aviso único «PNG y WebP se guardan como JPG». **Producción: objetivo 25 MB; requiere que el dueño suba `file_size_limit` global de Storage antes.** Fotos de constancia siguen en 3 MiB de entrada / 2 MiB normalizadas.

### 8. Mensajes (hecho, sin adjuntos)
`work-messages-local.sql` + `/api/pro/work-messages`: hilo por solicitud vinculada, lado decidido en el servidor, inmutables, idempotentes, contador sin leer y marcador de lectura, sin envío externo. Pestaña «Mensajes» con insignia en el trabajo; sección «Mensajes» en el proyecto del cliente (y en la vista previa del dueño). Adjuntos: no.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 151 archivos TS/TSX/MJS tocados → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (156 módulos, 157 pasos, 400 dependencias). `verify-local-preparation-db` → PASS (156 módulos instalados y reaplicados en PGlite; `$S/round7c-sql/verify-prep-db.out`; la primera pasada falló porque la migración de la Bitácora cambiaba filas al reinstalar → marcador de una sola vez + disparador). `verify-app-surface-ownership` → PASS (83 páginas / 256 rutas; `/api/pro/{team-roles,work-journal,catalog-details,work-messages}` → `pro-round7c-suite.spec.ts`). Verificadores TS de archivos (`verify-work-file-recovery`, `verify-company-file-recovery`, `verify-daily-log-file-recovery`, `verify-delivery-photo-base64`) → PASS con 20 MiB.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round7c-sql/round7c-test.sql` **107 PASS / 0 FAIL** (matriz; cada rol × 7 escrituras representativas por la puerta, más lecturas; actividad inmutable; invitación con borrador, réplica, correo distinto 42501, código usado P0002; CAS de rol; quitar; dueño sin Pro; asignación de solicitudes + filtro antes de paginar; migración de avances a la Bitácora, visibilidad, personal/horas, CAS, lector del cliente; costo con categoría/IVA/facturable; imagen ≤20 MiB y proveedor del artículo; límites en tablas y buckets; tableros texto/flecha/dibujo; mensajes por lado, sin leer, inmutables, 42501). Sin regresión: figures 22, invite 49, round4a 45, round4b billing 36, tasks-gantt 28, round4b portal 58 (copia con la aserción de tamaño a 20 MiB: `round4b-portal-test-20mib.sql`), round5 83, round6b 88, round6c 75, round6d 79, round7a 44, security 45, round7b 35 (todos 0 FAIL).
- Playwright (workers 1, 127.0.0.1:3185, `$S/r7c-logs/`; resúmenes `summary-*.txt`). Resultado final por spec (chromium-desktop / webkit-mobile):

| Spec | chromium | webkit |
|---|---|---|
| **pro-round7c-suite** (nuevo, ES/EN) | 4/4 | 4/4 |
| pro-work-timeline · work-timeline-api · work-tasks · project-planning | 2/2 · 1/1 · 3/3 · 3/3 | 2/2 · 1/1 · 3/3 · 3/3 |
| pro-daily-logs · daily-logs-api · daily-log-files · daily-log-files-api · daily-log-discussion | 6/6 · 2/2 · 4/4 · 2/2 · 6/6 | 6/6 · 2/2 · 4/4 · 2/2 · 6/6 |
| pro-work-updates (ajustado: «Avances» como notas rápidas dentro de la Bitácora) | 3/3 | 3/3 |
| pro-time-tracking · expenses · expenses-english | 2/2 · 1/1 · 1/1 | 2/2 · 1/1 · 1/1 |
| pro-work-costs · work-costs-english (etiqueta «Registrar costo») · work-cost-write-recovery · work-cost-write-reload | 1/1 · 1/1 · 2/2 · 1/1 | 1/1 · 1/1 · 2/2 · 1/1 |
| pro-catalog-item-types · catalog-storage | 1/1 · 1/1 | 1/1 · 1/1 |
| pro-mood-boards (cuerpo máximo 64 KiB) | 2/2 | 2/2 |
| pro-work-files · company-files · company-files-api · file-versions · team-task-discussion-api · round4b-portal (límites a 20 MiB) | 3/3 · 2/2 · 2/2 · 3/3 · 1/1 · 2/2 | 3/3 · 2/2 · 2/2 · 3/3 · 1/1 · 2/2 |
| pro-team · team-api | 6/6 · 1/1 | 6/6 · 1/1 |
| pro-client-dashboard · allowances (Bitácora en lugar de avances del cliente) | 2/2 · 2/2 | 2/2 · 2/2 |
| pro-round7a-circuit · round7b-suite | 2/2 · 3/3 | 2/2 · 3/3 |
| pro-lead-center · lead-center-api · leads-inboxes | 6/6 · 6/6 · 6/6 | 6/6 · 6/6 · 6/6 |
| pro-job-workspace · round6c-ai · private-work-tools-journey · delivery-photo-recovery | 2/2 · 2/2 · 2/2 · 2/2 | 2/2 · 2/2 · 2/2 · 2/2 |

  Historia honesta: la primera pasada completa tuvo fallos reales (corregidos): resumen migrado con forma de *snapshot* inválida, interruptor «Visible» sin estado optimista, revisión vieja al guardar personal tras el interruptor, expiración de la cookie en WebKit, trazo táctil, expresión regular base64 que desbordaba la pila con 20 MiB, `sizeBytes` limitado a 7 dígitos en cuatro escritores SQL (20971520 tiene 8), y **el proxy de Next recortaba cuerpos a 10 MB** (`experimental.proxyClientMaxBodySize: "30mb"` en `next.config.ts`). Otros fallos eran de specs que esperaban textos/límites anteriores (actualizados) o del servidor: se cayó una vez (ECONNREFUSED; se reinició con el comando indicado) y hubo tiempos de compilación en frío; esos specs pasaron al repetir. Los specs del grupo 7C/archivos/avances se repitieron después de las últimas correcciones; el resto pasó en la pasada anterior a los cambios finales (pequeños: disparador de republicación, regex de 8 dígitos, revisión en controles de la Bitácora, `next.config.ts`).

### Capturas revisadas (`$S/round7c-shots/`, 44, ES/EN, escritorio y teléfono)
Equipo con borrador de invitación y matriz, aviso del integrante, solicitudes con «Asignado a», Gantt con agregar en línea, Bitácora con personal y horas, formularios únicos de tiempo y costo, artículo con imagen y proveedor, tablero con texto/flecha/dibujo, mensajes del profesional y proyecto del cliente con Bitácora y Mensajes. Sin desbordes horizontales (comprobado en cada captura); textos en usted. Observación: en el proyecto del cliente de prueba aparece «No se pudieron cargar los cambios» en «Acuerdo y cambios del trabajo» (solicitud creada directamente en la base para la prueba; no se tocó ese módulo).

### No hecho / parcial (honesto)
- Roles: no se ocultan **todos** los controles de escritura por rol (solo los marcados); la autoría interna de lo que escribe un integrante es la del dueño; las vistas de cliente de un integrante requieren volver a su cuenta.
- Tiempo/costo: en el panel del marketplace (`/dashboard/profesional`, sin sección Horas) «Registrar tiempo» sigue con el registro anterior; «Nuevo gasto» y «Registrar costo» comparten campos pero son dos pantallas.
- Bitácora: desmarcar «Visible» no retira una versión ya compartida formalmente; los avances siguen existiendo como notas rápidas (no se eliminaron).
- Mensajes: sin adjuntos ni avisos fuera de la app.
- Límite: 25 MB en producción requiere que el dueño suba el límite global de Storage (y valorar `proxyClientMaxBodySize`).

### Archivos
Nuevos: SQL `team-roles-local.sql`, `work-journal-local.sql`, `cost-entry-local.sql`, `catalog-details-local.sql`, `file-size-limits-local.sql`, `work-messages-local.sql`; doc `team-roles-local.md`; rutas `api/pro/team-roles`, `work-journal`, `catalog-details`, `work-messages`; lib `workspace-gate.ts`, `workspace-user.ts`, `team-roles.ts`, `work-journal.ts`, `catalog-details.ts`, `work-messages.ts`, `file-limit.ts`; componentes `company-team.tsx`, `work-journal.tsx`, `cost-fields.tsx`, `catalog-item-extras.tsx`, `work-messages.tsx`; spec `pro-round7c-suite.spec.ts`. Modificados (principales): `middleware.ts`, `next.config.ts`, `lib/pro/server-access.ts`, 57 rutas/ayudantes Pro (import de `safeGetUser`), `mood-boards`, `work-billing`, `work-files`, `daily-log-files`, `company-files`, `team-task-discussion`, `bid-portal-files`; manifiesto y verificador de dueños; componentes `work-timeline`, `daily-logs`, `work-updates`, `client-work-sections`, `job-workspace`, `business-panel`, `pro-space`, `team-shell`, `leads-workspace`, `work-costs`, `expenses-workspace`, `time-tracking`, `mood-board-canvas`, `work-mood-boards`, `appointment-mood-boards`, textos de límite en 10 componentes; specs ajustados listados arriba. Respaldos de todo en `$S/round7c-backup/`.


## Verificación final (2026-11-14)

Todo local: sin llamadas a terceros, correos, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Supabase local y `supabase/config.toml` sin tocar. Respaldos en `$S/final-backup/r8-2026-11-14/` (rutas relativas; `NEW.txt` lista los nuevos). El servidor 3185 se reinició dos veces con el comando indicado (RSS 7,08 GB y 5,58 GB > 5,5 GB).

### 1. Revisión de seguridad de los roles (Ronda 7C)

| Severidad | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| **Alta** | Encabezados internos falsificados aceptados fuera de `/api/pro`. `/api/quotes` y `/api/admin/pro` usan `proApiAccess` → `workspace-user.safeGetUser`, pero el middleware solo limpiaba y reenviaba encabezados en `/api/pro/*`; en el resto `NextResponse.next()` pasaba los del cliente. Con `x-pro-workspace-owner=<dueño Pro ajeno>` y `x-pro-workspace-member=<propio>` cualquier profesional actuaba como ese dueño. | HTTP: mismo cuerpo a `POST /api/quotes` → sin encabezados `403 «Se requiere Pro activo»`; con ellos `404 «Cotización o solicitud no disponible.»` (pasó la comprobación Pro y llegó a `pro_request_quote_create` con `p_actor` del dueño ajeno) (`$S/r8-logs/secroles-before.txt`). `/api/admin/pro` lo frenaba `getApiAdmin`. Solo en `development` (la función responde 404 fuera de desarrollo). | **Corregido.** La puerta **firma** owner/member/role (HMAC-SHA256, clave derivada de la clave de servicio) y `workspace-user` solo sustituye con firma válida; el middleware borra los encabezados en **toda** petición y reenvía los encabezados limpios en todo `/api/*`. Ahora la respuesta es idéntica con y sin encabezados (también con la forma interna `x-middleware-request-*`). |
| Baja | La cuenta sustituida conservaba el correo del integrante: una acción ligada al correo de la persona (reclamar con código una cotización enviada a su correo) quedaba en la cuenta de la empresa. | Código: `private-estimate-publications` pasa `email_confirmed_at/email` como `p_verified_email` con `p_actor`=dueño. | **Corregido:** la cuenta sustituida no lleva correo ni teléfono. |
| Baja | Administrar el equipo como Administrador integrante quedaba registrado solo con el dueño como actor (`pro_company_team_events.actor_id`), sin fila en `pro_company_team_activity`. | SQL `round8-roles-test.sql` («team event … names the owner as actor»). | **Corregido:** `/api/pro/team-roles` autoriza con `pro_team_route_authorize(…,'POST','/api/pro/team-roles')` (mismo helper; registra `team.manage` con la identidad del integrante). Spec: fila de actividad del integrante. |
| — | Sin hallazgo (probado): rutas `/api/pro` con `%70ro`, `%77ork-tasks`, `%2F`, mayúsculas → 404 o 403 (nunca llegan a una ruta); `//`, barra final, `/es/api/pro/…` → 308 a la ruta canónica (que pasa por la puerta); `x/../` y `./` se normalizan antes de la puerta → 403; GET/HEAD/OPTIONS = `read` y ningún GET de `/api/pro` escribe (autosync, OAuth callback y lectores revisados); Solo lectura no escribe ni con `x-pro-workspace-role: admin`; entrar a una empresa ajena → 403 y una cookie escrita a mano se ignora; integrante quitado, desactivado o dueño sin Pro → `not_member` (actúa como sí mismo, sin datos de la empresa); cruce de empresas; funciones de la puerta sin EXECUTE para anon/authenticated. | Spec `pro-security-roles.spec.ts`, SQL `round8-roles-test.sql`. | — |
| Justificado | `team`, `team-task-discussion`, `team-task-mentions` quedan fuera de la puerta: no hay sustitución, usan la identidad real y sus permisos salen de las concesiones por trabajo; un integrante no gana nada en ellas por estar en la empresa. | `team-roles-local.md` punto 7. | Documentado. |
| Nota | POST que solo lee (por ejemplo `identity-lookup`, para no poner la cédula en la URL) se clasifica como escritura (`sales.write`): Miembro y Solo lectura no pueden consultar. Falla cerrado. | `pro_role_route_capability`. | Sin cambio. |

**Deriva de la base local (encontrada al repetir los SQL).** La Ronda 7C reaplicó `company-files-local.sql` y `team-task-discussion-local.sql` sueltos y pisó funciones que redefinen módulos posteriores: `pro_company_files_read` (la biblioteca volvía a listar versiones viejas: `company-versions-test` FAIL «library lists only the current version») y `pro_team_task_comment_json` (sin menciones). Comprobador nuevo `$S/r8-sql/drift.mjs` (cuerpo vivo de cada función contra el último módulo del manifiesto que la define): se reaplicaron `company-file-versions-local.sql`, `team-task-mentions-local.sql` y `private-team-access-local.sql` → **1017/1023 iguales, 0 obsoletas**, 6 con parche dinámico esperado (`appointment-schedule`/`appointment-opt-in`). No hubo cambios de módulos SQL.

### 2. «No se pudieron cargar los cambios» (Acuerdo y cambios del trabajo)
Artefacto de los datos de prueba de 7C: la solicitud se insertó directamente con `work_id` y el trabajo no tenía `bookingClientId` ni `origin='project_invite'`; `pro_work_changes_page` solo autoriza al cliente por esas dos vías → 404. Con un flujo normal (invitación al trabajo por API y aceptación del cliente): `GET /api/pro/work-changes?requestId=…` **200**, `clientLinked:true`, y la pantalla muestra «Importe acordado / Pagos registrados / Todavía no hay cambios propuestos» (`$S/final-shots-r8/changes-normal.png`); con la forma de 7C: **404** «Trabajo no disponible.». La confirmación de una cita también crea el trabajo con `bookingClientId`. Sin cambio de producto.

### 3. Regresión completa
- Playwright, **todas** las `tests/e2e/pro-*.spec.ts` (277 archivos, 743 pruebas por proyecto, workers 1, 127.0.0.1:3185; portales de licitación aparte con 65 s entre sí; `$S/r8-reg/`):

| Proyecto | 1.ª pasada | Tras repetir fallos (1 vez) y corregir | Persisten |
|---|---|---|---|
| chromium-desktop | 667 ✓ / 54 ✗ / 22 omitidas | **719 ✓ / 2 ✗ / 22 omitidas** | `pro-client-recovery-scope` (2) |
| webkit-mobile | 677 ✓ / 53 ✗ / 13 omitidas | **723 ✓ / 6 ✗ / 14 omitidas** | `pro-client-recovery-scope` (2), `pro-appointment-reminders` (2), `pro-local-integration` (1), `pro-round6d-site` (1) |

- La mayoría de los fallos de la 1.ª pasada eran tiempos agotados de compilación en caliente / servidor cargado y pasaron al repetir. Prueba A/B: `pro-local-integration`, `pro-navigation`, `pro-payment-metadata`, `pro-round6a-integrations` y `pro-sales-workspace` pasan **con y sin** el código de esta ronda (9/9 y 9/9).
- **Errores de la app corregidos:** (a) `work-tasks.tsx`: tras «Responsable asignado.» el editor se abría con el responsable anterior (la lista del equipo se recargaba sin esperar); ahora se recarga antes del aviso. (b) `ai-expense-capture.tsx` (Ronda 6C): los botones «Foto del comprobante»/«Archivo de audio» tenían un `input` `sr-only`: el foco del teclado caía en un control invisible (`pro-form-keyboard`); ahora el `input` cubre la píldora (transparente) y la píldora muestra el anillo de foco.
- **Specs desactualizadas (cambio intencional, con la ronda citada en el spec):** `pro-client-english` (montos en inglés «₡12,000»/«₡7,000», Ronda 3 textos; entrada repetida en el menú lateral del negocio); `pro-visit-preparation` y `-english` (menú lateral repite la entrada → se usa la cuadrícula «Herramientas»); `pro-team-assignments` («Volver» sin cabecera propia: Equipo dentro del armazón Pro, Ronda 7B); `pro-issuer-settings` (emisor inicial con el nombre de la empresa, Ronda 7A §6); `pro-client-fiscal` (teléfono del receptor con `proPhone`, Ronda 7A §6); `pro-lead-commercial-progress-journey` («Avances» = notas rápidas dentro de la Bitácora, Ronda 7C §3); `pro-forms-ux` (código legible `P-0001`/`P-K7Q2MX`, Ronda 2); `pro-server` (el arnés esbuild sustituye también `workspace-user`, que `api-access` usa desde 7C).
- **Persistentes y por qué:** `pro-client-recovery-scope` (ambos): con la lista de clientes retenida, la ficha abre (lecturas `option=1` y `client-pending` 200) pero `[data-client-operations]` no aparece; falla **también sin** el código de esta ronda (A/B) y pasaba el 12-nov; causa no determinada dentro de esta ronda (pendiente). WebKit: `pro-appointment-reminders` (WebKit registra como error de consola «… due to access control checks» las lecturas canceladas por `reload`/navegación, y una navegación interrumpida), `pro-local-integration` y `pro-round6d-site` («navigation … is interrupted by another navigation», en distintos puntos); pasan en chromium; son carreras del arnés en WebKit, no se cambió la app.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos), 18 archivos de `$S/*-sql/`: **1005 PASS / 0 FAIL**. Nuevo `$S/final-sql/round8-roles-test.sql` **24/0**. `round4b-portal` con la copia de 20 MiB (58/0). Tres pruebas antiguas esperaban contratos ya cambiados a propósito y se repitieron con una copia `-current`: `round6a-integrations-test-current.sql` (13 proveedores desde 6B–6D) 117/0; `bid-portal-test-current.sql` (`actionId` del proveedor derivado, B3 del 12-nov) 42/0; `company-versions-test.sql` 28/0 tras corregir la deriva.

### 4. `experimental.proxyClientMaxBodySize: "30mb"`
Necesario: con el valor por defecto (10 MB) el registro del servidor muestra 22 avisos «Request body exceeded 10MB … Only the first 10MB will be available» en `bid-portal/files`, `company-files`, `daily-log-files`, `team-task-discussion` y `work-files` (un archivo de 20 MiB en base64 JSON ≈ 28 MB). Next 16 solo lo admite **global** (`resolve-routes.js` lo aplica a toda petición que pasa por el middleware; no hay opción por ruta) y sacar esas rutas del `matcher` dejaría sin la puerta de roles y sin cabeceras de seguridad, así que no se acotó. Impacto en producción: toda petición con cuerpo que pase por el middleware puede guardar en memoria hasta 30 MB (antes 10 MB) antes de que la ruta aplique su propio tope; sobre 30 MB el cuerpo se corta sin error y la ruta responde 400. Antes de producción se recomienda subir archivos directo a Storage con URL firmada y volver al valor por defecto (además del límite global de Storage ya anotado en 7C). `next.config.ts` no se tocó en esta ronda.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 17 archivos tocados → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (156 módulos, 157 pasos, 400 dependencias). `verify-local-preparation-db` → PASS (156 módulos instalados y reaplicados en PGlite; `$S/r8-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (83 páginas / 256 rutas; `/api/pro/team-roles` → `pro-security-roles.spec.ts`).
- `pro-security-roles.spec.ts` (nuevo): 1/1 chromium-desktop, 1/1 webkit-mobile (pasada completa y repetición).

### Archivos
Nuevos: `tests/e2e/pro-security-roles.spec.ts`; `$S/final-sql/round8-roles-test.sql`, `$S/r8-sql/drift.mjs`, copias `-current` de dos pruebas SQL. Modificados: `src/lib/pro/workspace-gate.ts`, `src/lib/pro/workspace-user.ts`, `src/middleware.ts`, `src/app/api/pro/team-roles/route.ts`, `src/components/pro/work-tasks.tsx`, `src/components/pro/ai-expense-capture.tsx`, `scripts/ci/verify-app-surface-ownership.mjs`, `docs/pro/team-roles-local.md`, este registro; specs `pro-server`, `pro-client-english`, `pro-client-fiscal`, `pro-visit-preparation`, `pro-visit-preparation-english`, `pro-team-assignments`, `pro-issuer-settings`, `pro-lead-commercial-progress-journey`, `pro-forms-ux`. Base local: reaplicados `company-file-versions-local.sql`, `team-task-mentions-local.sql`, `private-team-access-local.sql` (sin cambios en los archivos).

## Ronda 8 (2026-11-15)

Paridad Houzz Pro: trabajo como página, resumen editable, archivos con carpetas y papelera, adjuntos en mensajes, cronómetro por persona y acceso de subcontratista. Todo local: sin llamadas a terceros, correos, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Respaldos en `$S/round8-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local, `supabase/config.toml` y `next.config.ts` sin tocar. El servidor 3185 no se reinició a mano (Next se reinició solo por su umbral de memoria durante las pruebas). La máquina estaba compartida con otras suites (SG Solutions) en paralelo: hubo tiempos agotados de carga que no son de esta ronda (ver tabla).

### 0. `pro-client-recovery-scope` (corregido)
**Ronda que lo rompió: Ronda 4B** (revisión del 13-nov, «Regresiones encontradas y corregidas», punto 3 «Costos del trabajo visibles antes de conocer la cuenta»): volvió a poner `catalog && accountId &&` delante de `<ClientOperations>` en `business-panel.tsx`, deshaciendo la corrección **B6** del 12-nov (que lo había quitado para que «Trabajos y saldos» se viera mientras la lista de clientes carga). Las dos intenciones eran válidas y chocaban: B6 (la sección visible) y 4B (los costos del trabajo no se montan con la cuenta vacía; lo prueba `pro-work-cost-write-recovery`). Corrección en la app (sin tocar la spec): mientras la cuenta no llega se muestra la sección «Trabajos y saldos» con «Cargando trabajos…» (`data-client-operations`, sin lecturas de recuperación ni aviso falso) y `ClientOperations` se monta solo con la cuenta, como pidió 4B. Un primer intento (montar `ClientOperations` siempre y esperar la cuenta dentro) rompía `pro-work-cost-write-recovery` (A/B: con los archivos originales 2/2) y se descartó. Resultado: `pro-client-recovery-scope` 2/2 en ambos perfiles; `pro-work-cost-write-recovery` y `pro-client-operations` verdes. Nota: `pro-work-costs` falla también con el `business-panel.tsx` original (A/B, chromium), en otro punto; no se tocó.

### 1. Trabajo como página (hecho, con límite)
- En el espacio Pro el trabajo ocupa toda la pantalla (tamaño `page` de `Modal`), con flecha «Volver» que **sale del trabajo** (a su origen, o a Citas como paso nuevo del historial, así Atrás del navegador vuelve al trabajo); cambiar de sección sigue siendo un paso del historial (`pushProParams`, `navigation.ts` sin cambios) y Atrás/Adelante funcionan.
- Enlace legible `/[es|en]/dashboard/pro/trabajo/<id>[/<sección>]` (`src/app/[locale]/dashboard/pro/trabajo/[id]/[[...vista]]/page.tsx`) que redirige a la dirección canónica `?tab=pro_agenda&cita=<id>&vistaTrabajo=<sección>`.
- Columna derecha (`work-sidebar.tsx`, `/api/pro/work-sidebar`, `pro_work_sidebar_read`): estado/fase y fechas, ubicación (dirección del proyecto o de la visita), cliente y si tiene cuenta vinculada, colaboradores del trabajo y subcontratistas, próximas citas (solicitudes por confirmar/confirmadas) y fechas clave futuras, etiquetas, y el cronómetro. Escritorio ≥ xl: tres columnas; teléfono/tableta: la columna va debajo del Resumen.
- Mi panel (`/dashboard/profesional`): el diálogo del trabajo ofrece «Abrir página del trabajo» (abre la página en el espacio Pro).
- Límite honesto: es un diálogo de página completa sobre el documento del espacio Pro (mantiene el control de foco y las guardas de cambios sin guardar), no una ruta Next con su propio documento; el enlace legible redirige a la dirección con parámetros.

### 2. Resumen editable (hecho)
«Personalizar resumen»: subir/bajar y mostrar/ocultar los seis widgets (al menos uno visible), «Guardar disposición», «Restablecer predeterminado». Se guarda en el servidor **por persona**: el dueño, o cada integrante por separado (identidad del integrante solo desde los encabezados firmados de la puerta). CAS por revisión (409), `actionId` idempotente, historial inmutable con antes/después (`job-page-local.sql`, `overview-layout.tsx`, `/api/pro/overview-layout`). Guardar la propia disposición es `read` para la puerta (también Solo lectura).

### 3. Archivos (hecho en el trabajo; parcial en la biblioteca de la empresa)
- Nueva vista «Archivos» del trabajo (`work-file-organizer.tsx`, `/api/pro/work-file-organizer`, `work-file-organizer-local.sql`): carpetas y subcarpetas (hasta 5 niveles, sin ciclos), mover, renombrar (nombre visible; misma extensión; el archivo original no cambia), favoritos, búsqueda en todas las carpetas, **papelera recursiva** (una carpeta se va con todo su contenido) con restaurar y aviso «Se puede restaurar hasta el …» (+30 días, fecha de Costa Rica), carga múltiple (hasta 20, secuencial con progreso; cada archivo por el escritor existente de `work-files`, idempotente).
- Datos: los archivos subidos (`pro_work_files`) y sus bytes nunca se modifican ni borran; el organizador guarda metadatos aparte (los archivos existentes aparecen en «Inicio» sin migración). Sin purga automática (no se pierden datos; una purga requeriría autorización).
- Versiones y compartir con el cliente: sin cambios (siguen en Bitácora › Archivos); lo ya compartido sigue compartido aunque vaya a la papelera.
- **No hecho**: en la biblioteca de la empresa no se agregó carga múltiple ni papelera recursiva (sigue archivar/restaurar, carpetas solo vacías).

### 4. Adjuntos en mensajes (hecho)
`work-message-files-local.sql`, `/api/pro/work-message-files`, `work-messages.tsx`: foto (PNG/WebP → JPG, sin EXIF) o PDF ≤ 20 MiB en el bucket privado `pro-work-message-files`; el mensaje y su archivo se escriben juntos por el escritor existente de mensajes (mismo lado, límite y marcador de lectura), idempotente; inmutables. Solo las dos partes del hilo listan y descargan (reautorización en SQL en cada descarga; nunca URL pública ni firmada). Se ven en el hilo de ambas partes (miniatura de la foto, enlace del PDF).

### 5. Cronómetro por persona (hecho)
`work-timers-local.sql`, `/api/pro/work-timers`, `work-timer.tsx`: iniciar/detener por trabajo y actividad (facturable, nota) para el dueño y cada integrante, **uno abierto por persona** en el servidor (409), al detener se **revisa y corrige** (minutos, fecha, actividad, facturable, nota) antes de guardar; guardar llama al escritor único de horas (`pro_time_mutate 'manual'`: una entrada y una línea de costo) y registra la persona; descartar conserva el registro. Indicador del cronómetro en la cabecera del espacio Pro (con «Detener»/«Revisar»). Solo lectura no puede fichar (`work.write`).

### 6. Acceso de subcontratista (hecho)
`subcontractor-access-local.sql`, `/api/pro/subcontractors` (dueño; `team.manage`), `/api/pro/sub-portal` (subcontratista; fuera de la sustitución de la puerta, siempre identidad real), `work-subcontractors.tsx` (vista «Subcontratistas» del trabajo), `subcontractor-portal.tsx` + página `/dashboard/subcontratista`.
- Invitación desde el directorio de proveedores (proveedor del dueño), correo de la persona y código de un solo uso de 72 h (solo su SHA-256 en la base; **no se envía nada**: el dueño lo copia). Acepta la cuenta con ese correo verificado.
- Por trabajo vinculado ve solo: servicio, nombre del cliente, fechas, **sus tareas asignadas** (con fechas planificadas), fechas clave y **archivos compartidos**; comenta y marca hechas/reabre sus tareas (CAS, historial de la tarea y evento con su identidad). Nunca finanzas, contacto del cliente, otras tareas, notas, mensajes ni otros trabajos. El dueño asigna/quita tareas, comparte archivos, comenta, quita del trabajo o revoca (en todos los trabajos).
- Todo se decide en SQL; probado cruzando trabajos y empresas (matriz en `round8-test.sql`) y en E2E (descarga del archivo compartido 200, del no compartido 404; rutas Pro y de finanzas rechazadas).

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 32 archivos tocados → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (161 módulos, 162 pasos, 422 dependencias). `verify-local-preparation-db` → PASS (161 módulos instalados y reaplicados en PGlite; `$S/round8-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (85 páginas / 263 rutas; nuevas rutas y páginas → `pro-round8-suite.spec.ts`). Deriva (`$S/r8-sql/drift.mjs`) → 1057 funciones, 1051 iguales, **0 obsoletas**, 6 con parche dinámico esperado.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round8-sql/round8-test.sql` **85 PASS / 0 FAIL** (columna del trabajo y capacidades de la puerta; disposición por persona, CAS, réplica, inválidos, restablecer, historial; cronómetro uno por persona, integrante con el suyo, detener/revisar/guardar por el escritor único, una línea de costo, réplica, descartar, cruce de empresa; adjuntos de 20 MiB, réplica, lados, intruso, cerrado; organizador con subcarpetas, mover, renombrar, favoritos, búsqueda, profundidad, papelera recursiva con fecha de restauración, restaurar, cruce de empresa; **matriz del subcontratista**: invitación/réplica/correo ajeno/código usado, alcance por tareas y archivos, claves permitidas en la proyección, escritura en tarea no asignada o de otra empresa 42501, cruce de trabajos (agregar/quitar), cruce de empresas (misma cuenta en dos empresas), revocar, dueño sin Pro, inmutables y permisos). Sin regresión: round7c 107/0, round8-roles 24/0, security 45/0, round7b 35/0, round4a 45/0, round4b-billing 36/0.
- Playwright (workers 1, 127.0.0.1:3185, `$S/r8b-logs/`, resumen `summary.txt`): spec nueva `pro-round8-suite.spec.ts` (3 pruebas × ES/EN) y regresión relacionada. 1.ª pasada: chromium-desktop 57/64, webkit-mobile 62/64; tras repetir una vez los fallos: **64/64 y 64/64**.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round8-suite** (nueva, ES/EN) | 6/6 (1.ª 5/6) | 6/6 |
| pro-job-workspace (nav del trabajo 18→20 a propósito: Archivos y Subcontratistas) | 2/2 (1.ª 0/2) | 2/2 (1.ª 1/2) |
| pro-round4a | 4/4 (1.ª 1/4) | 4/4 |
| pro-work-files · work-files-headers · file-versions | 3/3 · 1/1 · 3/3 | 3/3 · 1/1 · 3/3 |
| pro-company-files · company-files-api · company-file-versions | 2/2 · 2/2 · 2/2 | 2/2 · 2/2 · 2/2 |
| pro-round7c-suite (mensajes) · time-tracking | 4/4 · 2/2 | 4/4 · 2/2 |
| pro-team · team-api · security-roles · security-unit | 6/6 · 1/1 · 1/1 · 9/9 | 6/6 (1.ª 5/6) · 1/1 · 1/1 · 9/9 |
| pro-client-dashboard · round7a-circuit · round7b-suite | 2/2 · 2/2 · 3/3 | 2/2 · 2/2 · 3/3 |
| pro-client-recovery-scope · work-cost-write-recovery · client-operations | 2/2 · 2/2 · 1/1 | 2/2 · 2/2 · 1/1 |
| pro-navigation · projects | 2/2 (1.ª 1/2) · 2/2 | 2/2 · 2/2 |

  Historia honesta: los fallos de la 1.ª pasada fueron tiempos agotados (`page.goto`, `apiRequestContext` 15 s, «No pudimos verificar la sesión») mientras otra suite ajena corría en la misma máquina (carga 8–9) y Next se reiniciaba por memoria; pasaron al repetir sin cambios. `pro-team` webkit falló dos veces seguidas en la recuperación del comentario y luego pasó 6/6 con el código de esta ronda (y 6/6 con la puerta original): inestable, no causado por esta ronda. Durante el desarrollo, la spec nueva encontró defectos reales corregidos: «Volver» de la página volvía a la sección anterior en vez de salir del trabajo (ahora sale), y los diálogos de «Revisar tiempo» y del organizador no tenían nombre accesible fuera del trabajo (ahora `ariaLabel`).
- `pro-work-costs` (fuera de esta lista, visto al corregir el punto 0): falla también con el `business-panel.tsx` original (A/B); pendiente aparte.

### Capturas revisadas (`$S/round8-shots/`, 52, ES/EN, escritorio y teléfono)
Página del trabajo con columna derecha (escritorio) y menú/columna apilados (teléfono), editor del resumen y resumen personalizado, cronómetro en marcha en la columna, revisión antes de guardar, indicador en la cabecera, Archivos con carpetas/miga de pan/favorito/progreso y papelera con «se puede restaurar hasta», adjuntos en el hilo del profesional y del cliente (miniatura de foto, enlace del PDF), invitación de subcontratista con código, alcance del dueño (tareas y archivos marcados) y portal del subcontratista (cronograma, tarea hecha con comentario, archivo compartido). Sin desbordes horizontales (comprobado en cada captura de la spec); textos en usted. Observación estética: en la página del trabajo la cabecera repite cliente/fase/fechas en tres líneas encima del menú (heredado del diálogo); en el teléfono el menú de 20 secciones ocupa la primera pantalla.

### No hecho / parcial (honesto)
- Página del trabajo: es un diálogo a pantalla completa en el documento del espacio Pro (no una ruta con documento propio); el enlace legible redirige a la dirección con parámetros.
- Archivos: biblioteca de la empresa sin carga múltiple ni papelera recursiva; sin purga automática a los 30 días (solo aviso y fecha); sin Word/Excel/video.
- Cronómetro: sin vista global de horas entre trabajos; el cronómetro anterior por cuenta (Horas) sigue existiendo junto al nuevo por persona.
- Subcontratista: sin adjuntos en sus comentarios ni avisos fuera de la app; el código se muestra una sola vez (no se puede reenviar, hay que crear otra invitación).
- Mensajes: un adjunto por mensaje.

### Archivos
Nuevos: SQL `job-page-local.sql`, `subcontractor-access-local.sql`, `work-timers-local.sql`, `work-message-files-local.sql`, `work-file-organizer-local.sql`; rutas `api/pro/{work-sidebar,overview-layout,work-timers,work-message-files,work-file-organizer,subcontractors,sub-portal}`; páginas `[locale]/dashboard/pro/trabajo/[id]/[[...vista]]`, `[locale]/dashboard/subcontratista`; lib `round8.ts`; componentes `work-sidebar.tsx`, `work-timer.tsx`, `overview-layout.tsx`, `work-file-organizer.tsx`, `work-subcontractors.tsx`, `subcontractor-portal.tsx`; spec `pro-round8-suite.spec.ts`; `$S/round8-sql/round8-test.sql`, `$S/apply-one.mjs` (faltaba en el scratchpad; aplica un módulo por loopback con `ON_ERROR_STOP`). Modificados: `business-panel.tsx` (punto 0, página del trabajo, columna, «Abrir página del trabajo»), `job-workspace.tsx`, `work-overview.tsx`, `work-messages.tsx`, `pro-space.tsx`, `ui/modal.tsx` (tamaño `page`), `lib/pro/workspace-gate.ts` (solo la lista de rutas sin sustitución: `sub-portal`; firma intacta), `scripts/pro/local-sql-manifest.mjs`, `scripts/ci/verify-app-surface-ownership.mjs`, `tests/e2e/pro-job-workspace.spec.ts` (18→20), `docs/pro/team-roles-local.md`, `docs/pro/houzz-parity-register-local.md`, este registro.

## Ronda 9 (2026-11-15)

Paridad Houzz Pro: trabajo como ruta propia, cabecera y menú compactos, biblioteca de la empresa con carga múltiple y papelera recursiva, horas de todos los trabajos, adjuntos en comentarios de subcontratistas, centro de tareas con filtros/reasignación, centro de avisos con preferencias, selecciones desde el catálogo y documentos impresos con la marca de la empresa. Todo local: sin llamadas a terceros, correos, notificaciones push, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Respaldos en `$S/round9-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local, `supabase/config.toml` y `next.config.ts` sin tocar. Servidor 3185: reinicios solo por el umbral de memoria del ejecutor (RSS > 5,5 GB), nunca a mano. Otras suites ajenas corrían en la misma máquina.

### A1. Trabajo como página con ruta y documento propios (hecho)
- `/[es|en]/dashboard/pro/trabajo/<id>[/<sección>]` es ahora una página Next real (`src/app/[locale]/dashboard/pro/trabajo/[id]/[[...vista]]/page.tsx`): carga el espacio Pro y muestra el trabajo **directamente en la página** (`job-page-frame.tsx`: flecha «Volver», nombre del trabajo como `h1`, contenido y pie fijo con «Editar trabajo»), sin diálogo, sin la lista de citas debajo y sin el menú lateral del espacio Pro.
- Enlaces antiguos `?tab=pro_agenda&cita=<id>[&vistaTrabajo=<sección>]` del espacio Pro **redirigen en el servidor** a la ruta (se conservan los demás parámetros, p. ej. `?vistaTareas=plan`); `/trabajo/<id>/summary` y `?vistaTrabajo=` sobre la ruta se normalizan; sección desconocida → página no encontrada. Mi panel (`/dashboard/profesional`) no cambia.
- `navigation.ts` sigue siendo la única puerta: las pantallas leen la dirección en forma de consulta (`proCanonicalPath`) y cada movimiento se traduce a la forma de ruta (`proRoutedPath`); entrar o salir del trabajo es una carga de documento; cambiar de sección dentro del trabajo es un paso del historial en el mismo documento (Atrás/Adelante sin recargar, comprobado con un marcador en `window`). Las guardas (`PRO_BEFORE_PATH_CHANGE`, editores con cambios) reciben siempre la forma de consulta. La traducción solo acepta rutas locales (`//host/…`, `\` y URLs completas se devuelven intactas para que la validación existente las rechace; lo detectó `verify-pro-navigation-routes`).
### A2. Cabecera y menú en el teléfono (hecho)
- Cliente · fase (chip) · fechas en **una línea** (`data-job-header-line`, `WorkHeader compact`) en lugar de tres.
- Menú de 20 secciones: en teléfono/tableta una **tira compacta agrupada** (Planificación / Gestión / Finanzas) que se desplaza de lado y mantiene visible la sección activa (< 90 px de alto, comprobado); desde `lg` sigue el menú lateral agrupado.
### A3. Biblioteca de la empresa: carga múltiple y papelera recursiva (hecho)
- «Subir varios» (hasta 20; foto JPG/PNG/WebP → JPG o PDF ≤ 20 MiB): uno tras otro con progreso, **cada archivo por el escritor durable existente** (se guarda primero en IndexedDB; si uno no se confirma se detiene y queda en la recuperación habitual; los anteriores quedan guardados).
- «Enviar a la papelera con su contenido» (carpeta + subcarpetas + archivos) y «Papelera» con «Restaurar» y «Se puede restaurar hasta el …» (+30 días, fecha CR). Restaurar devuelve **exactamente** lo que se llevó (lo archivado antes sigue archivado); si la carpeta padre ya no está disponible vuelve a Inicio. Nada se borra (solo la marca de archivado con la siguiente revisión); sin purga automática. `company-file-trash-local.sql`, `/api/pro/company-file-trash` (`company.write`).
### A4. Horas de todos los trabajos (hecho)
Sección «Horas» del espacio Pro (`time-report.tsx`, `/api/pro/time-report`, `time-report-local.sql`): período (≤ 366 días), trabajo, persona (dueño, integrante del cronómetro o persona registrada), facturable; totales (horas, horas facturables, monto facturable, costo, minutos sin costo), por persona, por trabajo y filas; **CSV para Excel** de exactamente las filas filtradas (`;`, BOM, fórmulas neutralizadas, ES/EN). Un solo libro: entradas de Horas/cronómetro con su línea viva de Costos (ediciones seguidas, anuladas fuera) más horas registradas directamente en Costos (origen «Costos»), igual que la vista Horas del trabajo (comprobado en SQL que ambos totales coinciden).
### A5. Adjuntos en comentarios de subcontratistas (hecho)
Ambos lados (`subcontractor-comment-files-local.sql`, `/api/pro/subcontractors/files` dueño por la puerta = `team.manage`, `/api/pro/sub-portal/files` subcontratista fuera de la sustitución, `sub-comment-files.tsx`): foto (PNG/WebP → JPG) o PDF ≤ 20 MiB en el bucket privado `pro-sub-comment-files`; el comentario lo escriben **los escritores existentes** (`pro_sub_owner_mutate` / `pro_sub_portal_mutate`, mismo límite, eventos y recibos) con id = actionId = archivo, idempotente; inmutables. Cada lista y descarga se **reautoriza en SQL** (`pro_sub_comment_scope`: dueño, o subcontratista activo con el trabajo vinculado y ESA tarea asignada); quitar la tarea, el trabajo o revocar corta las descargas al instante (probado en SQL y E2E: 200 → 404).
### A6. `pro-work-costs` (corregido; causa raíz)
No era un defecto de la app: la spec esperaba `[data-work-costs]` con el tiempo por defecto (12 s) justo después de abrir Mi panel › Clientes, y en ese momento el servidor de desarrollo **compila bajo demanda** `/api/pro/catalog` y `/api/pro/connectors` (el registro mostraba «Compiling /api/pro/catalog/route …» y la petición quedaba pendiente, `ECONNRESET` al vencer la prueba); `onDemandEntries.pagesBufferLength: 20` (next.config.ts) descarta rutas compiladas cuando una suite toca muchas. La misma spec pasó 1/1 (1,6 min) en cuanto esas rutas estaban compiladas. Cambio en la spec (citado aquí): `toBeVisible({timeout:45000})` como las demás specs del trabajo (también en `pro-work-costs-english`) y `timeout:60000` en el `POST /api/pro/invoice-drafts` (primer uso, también compilación en frío).
### B7. Centro global de tareas (hecho para el alcance pedido)
Filtros por trabajo y por responsable (`~none` = sin responsable; mayúsculas indiferentes) además de estado/fecha/búsqueda, aplicados **en SQL antes de paginar** con los mismos conteos (`task-center-filters-local.sql`: `pro_task_center_filtered_read`, `pro_task_center_filter_options`); **atrasadas resaltadas** (fondo y borde naranja, `data-task-center-overdue`); **reasignar seleccionadas** (hasta 100) una por una por el escritor único de tareas (`pro_work_tasks_mutate 'update'`: revisión, historial); un conflicto detiene el lote sin sobrescribir. Completar/reabrir en lote ya existía.
### B8. Avisos y recordatorios configurables (hecho, solo dentro de la app)
Campana con contador en la cabecera del espacio Pro (cada 60 s y al volver a la pestaña) y sección «Avisos» (`notification-center.tsx`, `/api/pro/notifications`, `pro-notifications-local.sql`): Sin leer/Todos, abrir (marca leído y lleva al trabajo/sección), marcar leído/no leído, marcar todo. Por persona (dueño o integrante desde los encabezados firmados). Eventos derivados de forma idempotente de registros existentes: tarea asignada (por «Responsable»), tarea por vencer/vencida (ventana configurable 0–14 días; las sin responsable van al dueño), mensaje del cliente, cotización aceptada / cambios pedidos, pago registrado en factura, cuota vencida del plan de pagos (días de gracia 0–30), oferta de proveedor recibida. Preferencias por evento: «En la app» y «Borrador de correo»; el correo **solo guarda un borrador** (`delivery='draft_not_sent'`, inmutable): nada se envía, no hay push. CAS 409 en preferencias, recibos por `actionId`, historial inmutable; marcar leído y las preferencias son personales (`read` para la puerta: también Solo lectura).
### B9. Selecciones desde el catálogo (hecho; parcial respecto de Houzz)
«Agregar desde el catálogo» en cada ítem (búsqueda por nombre/código, cantidad): la opción se crea por el **escritor existente** de selecciones (opción = actionId, sin duplicar) con nombre, precio (CRC, céntimos) y proveedor preferido del artículo, y una **copia privada** de la imagen del catálogo (`pro-selection-catalog-images`, SHA-256) que el cliente ve como cualquier foto de opción (`selection-catalog-local.sql`). Marca «Del catálogo» para el dueño. En el bloque del monto previsto se muestra para cada opción si **excede / queda por debajo / es igual** al monto previsto (solo lectura; el monto solo se registra con «Definir monto previsto», que ya existía: sin doble conteo, comprobado en SQL). Aprobación/rechazo (pedir cambios) del cliente por producto: ya existía y no cambió.
### B10. Documentos impresos con la marca de la empresa (hecho para 6 documentos; parcial)
Empresa › «Documentos con su marca» (`document-branding.tsx`, `/api/pro/document-branding` = `settings.write`, `document-branding-local.sql`): 4 colores al estilo ContrataCR (celeste, azul marino, verde bosque, terracota; sin colores libres), nombre y línea de la empresa, pie y logo (JPG ≤ 1 MiB normalizado en el servidor, bucket privado `pro-document-logos`, incrustado en la copia). Se aplica a las próximas impresiones de **facturas, contratos (dueño y cliente), estados de cuenta, planes de pagos, recibos y órdenes de compra**, ES/EN (`applyDocumentBranding`: color de acento, bloque de empresa bajo el encabezado y pie; la marca ContrataCR no se altera; todo texto escapado). **No hecho:** cotizaciones (exportación PDF en el navegador, `private-estimate-export.ts`) y órdenes de cambio (no tienen copia imprimible).
### Cambios de specs (intencionales, por la ruta del trabajo)
Las specs que esperaban la dirección `?vistaTrabajo=` / `cita=` o el diálogo del trabajo en el espacio Pro aceptan ahora también la ruta (`/trabajo/<id>/<sección>`) sin debilitar el resto: `toHaveURL(/vistaTrabajo=X/)` → `(?:vistaTrabajo=|/trabajo/<id>/)X` (7 specs), lectura de `cita` desde la consulta o la ruta (12 specs), `/tab=pro_agenda/` o ruta (3), Round 8 (página = `h1` sin diálogo; «Abrir página del trabajo» llega a la ruta), `pro-team` (salir con la flecha de la página: la ruta no tiene menú lateral), `pro-task-center(-planning,-actions)` (la tarea original se abre en la página del trabajo y «Volver» regresa al centro de tareas), `pro-work-files` (una página no atrapa el foco; Mi panel conserva el diálogo y su comprobación), `pro-tools-profile-menu` (17→18 entradas por «Horas»), `pro-work-costs(-english)` (punto A6). Ruido de WebKit en desarrollo (no de la app): `helpers.ts` ignora solo (a) el `TypeError: Type error` de las pistas de rendimiento de React en desarrollo (`flushComponentPerformance`/`flushInitialRenderPerformance`, sin marcos de `src/`) y (b) peticiones canceladas por una navegación de documento hacia el Supabase **local** (127.0.0.1:54321), con la misma ventana de 5 s que ya se usaba para el mismo origen; los colectores propios de 27 specs usan ahora `onAppPageError` con esas mismas reglas. Cualquier otro error se sigue contando.
### Defectos encontrados y corregidos durante la ronda
- La traducción de direcciones convertía `//host/dashboard/pro` en una ruta local (lo detectó `verify-pro-navigation-routes`): ahora solo traduce rutas locales.
- Tres componentes (cotizaciones del proyecto, acción y relacionados de estimaciones) y «Registrar tiempo» en Costos comprobaban `/dashboard/pro$` y se ocultaban o tomaban otro camino en la ruta del trabajo: ahora reconocen la ruta.
- El buscador del organizador de archivos desbordaba en el teléfono al no estar dentro de un diálogo (`basis-full`).
- Las consultas de horas y avisos usaban tablas temporales (falla de lectura por la API): ahora una sola consulta sin tablas temporales.
- La papelera: el guardián del recibo leía un campo inexistente (42703); corregido.
- La opción del catálogo devolvía un campo extra y la pantalla no confirmaba el guardado; ahora devuelve la misma forma que el escritor.
- Las opciones de filtros del centro de tareas se piden después de la primera lectura (la lista mantiene su error/reintento).
### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 101 archivos `.ts/.tsx/.mjs` tocados (incluidas las specs) → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (169 módulos, 170 pasos, 452 dependencias). `verify-local-preparation-db` → PASS (169 módulos instalados y reaplicados en PGlite; `$S/round9-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (85 páginas / 269 rutas; nuevas rutas → `pro-round9-features.spec.ts`, página del trabajo → `pro-round8-suite`/`pro-round9-suite`). Deriva (`$S/r8-sql/drift.mjs`) → 1094 funciones, 1088 iguales, **0 obsoletas**, 6 con parche dinámico esperado. `verify-pro-navigation-routes`: la primera parte (rutas, historial, rechazo de rutas inseguras) **PASS**; la segunda parte falla igual con el `navigation.ts` original (`window.addEventListener is not a function` en su entorno simulado; comprobado con la copia de respaldo): preexistente, no de esta ronda.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round9-sql/round9-test.sql` **52 PASS / 0 FAIL** (horas: libro único, filtros, persona, totales en céntimos, línea de Costos contada una vez e igual a Horas del trabajo, período inválido, aislamiento; avisos: por persona, idempotencia, preferencias CAS/réplica/validación, ventana de recordatorio, borrador de correo no enviado, leído/todo leído, intruso, inmutabilidad; centro de tareas: filtros por trabajo y responsable, `~none`, conteos, opciones, aislamiento; papelera: CAS, recursiva, réplica, otro dueño, restauración exacta, doble restauración, padre no disponible → Inicio; adjuntos del subcontratista: matriz de alcance, ruta antes de bytes, escritores existentes, réplica, 20 MiB, ambos lados, intruso/otra empresa, quitar la tarea corta el acceso, inmutables; marca: valores por omisión, logo, réplica, CAS, colores libres y rutas ajenas rechazados, quitar logo, bucket privado; selecciones del catálogo: precio/proveedor/imagen, réplica sin duplicar, artículo archivado, ruta de imagen ajena, vista del cliente con imagen, sin doble conteo; puerta: capacidades de las rutas nuevas y Solo lectura/Miembro). Regresión SQL: `round8-test` 85/0, `round8-roles-test` 24/0, `round7c-test` 101/0, `round7b-test` 35/0, `round7a-test` 44/0, `round6d-test` 79/0, `round4a-test` 45/0, `round4b-billing-test` 36/0, `security-test` 45/0.
- Playwright (workers 1, 127.0.0.1:3185, `$S/r9-logs/`, resumen `$S/r9-summary.txt`): specs nuevas `pro-round9-suite.spec.ts` (ruta del trabajo, 1 prueba × ES/EN) y `pro-round9-features.spec.ts` (horas + centro de tareas + avisos; biblioteca + marca + selecciones del catálogo; adjuntos del subcontratista: 3 pruebas × ES/EN). Resultado final: **chromium-desktop 107/107** (40 specs) y **webkit-mobile 80/80** (29 specs). Historia honesta: en la 1.ª pasada fallaron, por los cambios de esta ronda, las aserciones de dirección/diálogo listadas arriba y los defectos corregidos; tras corregir se repitieron. `pro-navigation` (chromium) falló 2 veces en pasos distintos (inventario/cotización, fuera de la ruta del trabajo) y pasó en la 3.ª sin cambios: inestable, ya lo era en la Ronda 8. `pro-contracts` webkit falló una vez en «Clicking the checkbox did not change its state» de la Vista del cliente y pasó al repetir. `pro-task-center-batch` en chromium (3/4 en la 1.ª, un resumen que no apareció a tiempo en EN) pasó al repetir sin cambios.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round9-suite** (nueva) | 2/2 | 2/2 (1.ª 0/2: espera de carga antes de «Volver») |
| **pro-round9-features** (nueva) | 6/6 (1.ª 4/6) | 6/6 |
| pro-round8-suite · job-workspace · round4a | 6/6 · 2/2 · 4/4 | 6/6 · 2/2 · 4/4 |
| pro-navigation · projects | 2/2 (inestable) · 2/2 | 2/2 · 2/2 |
| pro-work-files · work-files-headers · file-versions | 3/3 · 1/1 · 3/3 | 3/3 · — · — |
| pro-company-files · company-files-api · company-file-versions | 2/2 · 2/2 · 2/2 | 2/2 · 2/2 · 2/2 |
| pro-round7c-suite · time-tracking | 4/4 · 2/2 | 4/4 · 2/2 |
| pro-team · team-api · security-roles · security-unit | 6/6 · 1/1 · 1/1 · 9/9 | 6/6 · — · 1/1 · — |
| pro-client-dashboard · round7a-circuit · round7b-suite | 2/2 · 2/2 · 3/3 | 2/2 · 2/2 · 3/3 |
| pro-client-recovery-scope · work-cost-write-recovery · client-operations | 2/2 · 2/2 · 1/1 | — |
| pro-work-costs · work-costs-english (A6) | 1/1 · 1/1 | 1/1 · — |
| pro-allowances · selections · catalog-item-types | 2/2 · 2/2 · 1/1 | 2/2 · 2/2 · — |
| pro-contracts · round4b-billing · round5-payment-plan (impresos) | 2/2 · 4/4 · 4/4 | 2/2 · — · 4/4 |
| pro-tools-profile-menu · work-updates · work-milestones | 2/2 · 3/3 · 2/2 | 2/2 · 3/3 · 2/2 |
| pro-task-center · -planning · -batch · -actions | 3/3 · 2/2 · 4/4 · 2/2 | 3/3 · 2/2 · 4/4 · — |

### Capturas revisadas (`$S/round9-shots/`, 52, ES/EN, escritorio y teléfono)
Página del trabajo (escritorio con columna derecha; teléfono con tira de secciones y cabecera en una línea), Horas con filtros y totales, centro de tareas con atrasadas y selección, avisos y preferencias, papelera de la biblioteca con «se puede restaurar hasta», Documentos con su marca y estado de cuenta impreso con color/logo/pie, opción del catálogo con imagen y marca «Del catálogo», adjuntos del subcontratista en ambos lados. Sin desbordes horizontales (comprobado en las specs). Ajustes estéticos hechos tras revisarlas: sin contorno de foco visible en el título del trabajo en Safari, sin punto separador suelto al partir la línea de cabecera en el teléfono, título «Trabajo» mientras carga (antes «Detalle del registro»).

### No hecho / parcial (honesto)
- B10: cotizaciones (PDF generado en el navegador) y órdenes de cambio (no tienen copia imprimible) **sin marca**; las demás 6 copias sí.
- B9: siguen faltando varias selecciones por ítem, aprobación masiva, ocultar precio/enlace, pedido/entrega, margen y PDF de selecciones; la comparación con el monto previsto es solo informativa (el monto lo registra la acción explícita existente).
- B8: solo dentro de la app; correo = borradores no enviados; sin push. Los eventos se derivan al abrir la campana o los avisos (cada 60 s), no hay proceso en segundo plano.
- B7: sin centro global para colaboradores por trabajo; la reasignación en lote está limitada por el límite de 60 escrituras/minuto de tareas (un lote mayor se detiene con aviso, sin perder lo hecho).
- A1: Mi panel conserva el diálogo del trabajo (fuera del alcance pedido). Entrar o salir del trabajo es una carga de documento (más lenta en desarrollo que el diálogo).
- A3: sin purga automática a los 30 días (solo aviso y fecha); sin Word/Excel/video.
- `verify-pro-navigation-routes` parte 2 preexistente (ver arriba).

### Archivos
Nuevos: SQL `time-report-local.sql`, `pro-notifications-local.sql`, `notification-branding-capabilities-local.sql`, `task-center-filters-local.sql`, `company-file-trash-local.sql`, `subcontractor-comment-files-local.sql`, `document-branding-local.sql`, `selection-catalog-local.sql`; rutas `api/pro/{time-report,notifications,company-file-trash,document-branding,subcontractors/files,sub-portal/files}`; lib `round9.ts`, `job-route.ts`, `pro-space-profile.ts`, `document-branding.ts`, `document-branding-server.ts`, `sub-comment-files-route.ts`; componentes `job-page-frame.tsx`, `time-report.tsx`, `notification-center.tsx`, `sub-comment-files.tsx`, `document-branding.tsx`; specs `pro-round9-suite.spec.ts`, `pro-round9-features.spec.ts`; `$S/round9-sql/round9-test.sql`. Modificados: `navigation.ts`, `use-pro-search-params.ts`, `use-pro-child-guard.ts`, páginas `[locale]/dashboard/pro/page.tsx` y `trabajo/[id]/[[...vista]]/page.tsx`, `pro-space.tsx`, `business-panel.tsx`, `job-workspace.tsx`, `work-header.tsx`, `work-tasks.tsx`, `work-costs.tsx`, `work-file-organizer.tsx`, `company-files.tsx`, `company-hub.tsx`, `task-center.tsx`, `work-selections.tsx`, `work-subcontractors.tsx`, `subcontractor-portal.tsx`, `project-estimates.tsx`, `private-estimate-action.tsx`, `private-estimate-related.tsx`, `hub-sections.ts`, `management-shell.tsx`, `task-center.ts` (lib), las 6 rutas de impresión, `api/pro/task-center`, `api/pro/selections`, `local-sql-manifest.mjs`, `verify-app-surface-ownership.mjs`, `tests/e2e/helpers.ts` y las specs citadas; documentos: este registro, `houzz-parity-register-local.md` (filas 02, 15, 24, 28, 31, 45, 62, sin cambiar estados), `team-roles-local.md` (punto 9).

## Ronda 10 (2026-11-15)

Paridad Houzz Pro: importación y organización de clientes, tablero de solicitudes con motivos de ganada/perdida, conversión por canal y campaña, dependencias del cronograma con reprogramación y ruta crítica, cronograma de todos los trabajos, bitácora automática y recordatorio, plantillas de tareas (inicio, duplicar, responsables), cotizaciones y órdenes de cambio impresas con la marca, y seguimiento de selecciones. Todo local: sin llamadas a terceros, correos, push, cobros ni facturas reales; sin commits, envíos, `stash` ni despliegues. No se leyeron `.env.local`, secretos ni `native-env.sh` (entorno con `qa2-envonly.zsh`). Respaldos en `$S/round10-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local, `supabase/config.toml` y `next.config.ts` sin tocar. No se crearon sub-agentes. Servidor 3185: reinicios solo por el umbral de memoria del ejecutor.

### 1. Clientes: importar y organizar (fila 05) — hecho, parcial frente a Houzz
Clientes › menú › «Importar y organizar (CSV, vCard, duplicados, etiquetas)» (`round10-sales.tsx`, `/api/pro/client-contacts` = `sales.write`, `sales-contacts-board-local.sql`).
- CSV con «,» o «;» (Excel es-CR) o **vCard** (.vcf: FN/N, EMAIL, TEL, ORG, ADR, NOTE, CATEGORIES→etiquetas), ≤ 20 MiB y 500 filas. **Mapeo de columnas** (se propone por el encabezado y la persona lo confirma con un ejemplo por columna) y **vista previa en servidor**: nuevo / ya existe (correo en minúsculas o teléfono CR normalizado, 506 opcional; solo contra los clientes propios) / repetido en el archivo / con errores (motivo por fila).
- Importa solo los nuevos por el **escritor del catálogo** (`pro_mutate_catalog`, revisión del espacio: pantalla vieja → 409), ids deterministas por `actionId` (repetir no duplica), etiquetas e historial inmutable por cliente.
- **Etiquetas** por cliente (≤ 10, sin «;»/«,»), contador por etiqueta; los **grupos** ya existían.
- **Duplicados** (mismo correo o teléfono) y **combinar**: el conservado recibe los datos que le faltan, las notas y las etiquetas; el otro queda **archivado** (no se borra) y marcado «combinado en», con historial de ambos. Un cliente con trabajos, cotizaciones, facturas, oportunidades u otros registros **nunca** se archiva (400 `merge_records`: se debe conservar ese): así ningún trabajo queda con un cliente archivado. **No** se trasladan trabajos ni documentos al conservado.
- **Exportar** CSV para Excel (`;`, BOM, fórmulas neutralizadas) filtrado por etiqueta y grupo.

### 2. Tablero de solicitudes y motivos (fila 07) — hecho
Solicitudes › «Tablero» (`?tablero=1`): columnas por las etapas configuradas (la configuración —agregar, renombrar, ordenar, ocultar con reasignación— ya existía en `request-pipeline`), tarjetas de oportunidades manuales y solicitudes de ContrataCR con cliente, valor estimado (`proMoney`) y origen. Mover: **arrastrar** con puntero o toque (asa con `touch-action:none`), **teclado** (← → sobre el asa) o «Mover a». Cada movimiento usa el **escritor existente** de su fuente (`pro_lead_center_mutate` / `pro_request_pipeline_mutate`: recibos, CAS 409 e historial). **Ganada/perdida con motivo** (precio, plazos, otra empresa, sin respuesta, alcance, otro / calidad, recomendación, rapidez, relación…) y nota: CAS, recibo, historial inmutable; «Ocultar perdidas». Al pasar a «Trabajo ganado» se pide (opcional) el motivo. No hubo datos que migrar: las solicitudes existentes aparecen en su etapa efectiva. Límite: 50 tarjetas por columna (el resto en la lista).

### 3. Conversión por canal y campaña (fila 08) — hecho
Solicitudes › «Conversión por canal» (`/api/pro/lead-board?view=conversion`): período CR, por **canal** o por **campaña** (atribución de la Ronda 6D): recibidas, llegaron a reunión, a cotización, ganadas, perdidas, convertidas en trabajo (solo vínculos explícitos vigentes, la misma regla del embudo) y %; total, tendencia mensual y **CSV para Excel**. Límites: «llegaron a» se calcula con la etapa actual (no hay historial de transiciones); la campaña solo existe para oportunidades manuales.

### 4. Dependencias, reprogramación y ruta crítica (fila 13) — hecho
Gestión › Cronograma › «Dependencias y reprogramación» (`round10-jobsite.tsx`, `/api/pro/schedule-links` = `work.write`, `jobsite-links-autofill-local.sql`).
- Cada predecesora (que se sigue agregando en Tareas › Plan del trabajo) puede ser **fin→inicio** o **inicio→inicio** con **desfase** −60…365 días (tabla lateral con revisión; las existentes **migradas una vez** como fin→inicio + 0, el mismo significado).
- **Mover una tarea**: vista previa de todas las dependientes que deben correrse (solo hacia adelante, conservan duración), nada cambia hasta «Aplicar»; aplicar es una transacción con la revisión del cronograma (409 si cambió) y registro inmutable; **Deshacer** devuelve exactamente las fechas anteriores, una sola vez y solo si nada cambió después (si no, 409 sin sobrescribir).
- **Ruta crítica**: la cadena de dependencias ajustadas que termina en la tarea que acaba de último, listada y **resaltada en rojo** en el Gantt (`data-schedule-critical`).
- **Cronograma de todos los trabajos**: Tareas › «Cronograma de todos los trabajos» (2–12 semanas, filtro por responsable, abre el trabajo).
- Límites: sin calendario laboral/feriados; no se tiran hacia atrás las dependientes; las reglas no viajan aún en las plantillas de cronograma.

### 5. Comentarios/adjuntos/asignación de tareas (fila 16) — **no hecho**
No se trabajó en esta ronda (sigue faltando editar/enviar a la papelera adjuntos de tarea y avisos fuera de la app).

### 6. Bitácora automática y recordatorio (fila 20) — hecho, parcial
- Editor de la Bitácora › «Rellenar con los datos del día» (`/api/pro/daily-log-autofill`, solo lectura): personal y minutos del libro de horas y cronómetros de esa fecha, tareas **completadas ese día** (historial de tareas) y **en curso** (plan), y **clima de ejemplo** del adaptador **simulado** (determinista, rotulado «Clima de ejemplo (simulado, sin proveedor conectado)»). Llena resumen, clima y secciones; la persona revisa y guarda con el escritor existente.
- **Recordatorio** en el centro de avisos (Ronda 9): evento nuevo «Falta la bitácora de ayer» (`daily_log_missing`) cuando ayer (CR) hubo horas, cronómetro o tareas completadas en un trabajo y no hay entrada; solo para el dueño, idempotente, con su preferencia y borrador de correo (nunca enviado).
- Límites: personal/horas van al texto del resumen (los campos «personal y horas» de la Bitácora siguen siendo manuales); el aviso se deriva al abrir la campana (sin proceso en segundo plano).

### 7. Plantillas reutilizables (filas 78, 79) — hecho para tareas; cronograma sin cambios
Plantillas de tareas: **tres plantillas de inicio** ES/EN redactadas por ContrataCR (cocina, baño, pintura interior; se copian al editor y se guardan con el escritor existente), **Duplicar**, y **aplicar con asignación de responsables** (cada cargo/nombre de la plantilla → persona de la empresa, dejar igual o sin responsable) en una transacción (`/api/pro/task-templates-apply`: aplicación existente + escritor de tareas por cada tarea, recibo propio, historial de tareas). «Crear desde el trabajo» (captura) y la fecha de inicio ya existían. Plantillas de cronograma: ya tenían duplicar, ejemplos ES/EN y fecha de inicio; **no** se añadió asignación de responsables ni reglas FS/SS.

### 8. Cotizaciones y órdenes de cambio con la marca (fila 45) — hecho
Impresión en el servidor como las demás copias (CSP con nonce, `applyDocumentBranding`): **cotización** (`/api/pro/quote-print`, botón «Imprimir con su marca» en la vista previa; secciones con subtotal, descuentos e impuestos, firma de aceptación; **nunca** el costo interno) y **orden de cambio** (`/api/pro/work-changes-print`, enlace en cada extra/cambio; número dentro del trabajo, líneas sin costo/margen, acuerdo antes/después, días de cronograma). ES/EN.

### 9. Selecciones (fila 62) — hecho, parcial
Debajo de Selecciones (`round10-selections.tsx`, `/api/pro/selections-tracking` = `sales.write`, `selection-tracking-documents-local.sql`): **estado de pedido** de cada selección aprobada (sin pedir / pedido / entregado / instalado, fechas CR, referencia del proveedor; entrega no antes del pedido; solo aprobadas), **cambio en lote**, **costo interno y margen** por opción y total aprobado (solo dueño; nunca en la vista del cliente ni impreso) y **hoja de selecciones imprimible** con la marca. **Aprobación en lote del cliente**: «Aprobar las N recomendadas» en su vista, una transacción por el escritor del cliente existente (recibos e historial por ítem); el dueño o un integrante reciben 403. Varias opciones por ítem con elección única ya existían. Falta: ocultar precio/enlace por elemento, órdenes de compra desde selecciones.

### Defectos encontrados y corregidos durante la ronda
- Los disparadores de inmutabilidad nuevos impedían borrar cuentas en cascada (la limpieza de cuentas desechables fallaba con «Immutable record»): ahora usan `when (pg_trigger_depth()=0)` como los de la Ronda 9; las dos cuentas de prueba que quedaron se borraron.
- Combinar archivando un cliente con trabajos dejaba ese trabajo «inactivo» para horas y pagos (lo detectó la prueba SQL): ahora el servidor rechaza archivar un cliente con registros.
- El tablero ensanchaba la página: las etiquetas `sr-only` (posición absoluta) escapaban del carril con desplazamiento; el carril ahora es `relative` y el tablero `contain:inline-size`.
- El seguimiento de selecciones se recargaba al terminar cada guardado y borraba las casillas marcadas (prueba WebKit): la recarga ya no depende del estado de guardado.
- En el teléfono el cronograma abre en lista: la prueba cambia a Gantt antes de comprobar el resaltado.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 30 archivos `.ts/.tsx/.mjs` tocados (incluidas las 3 specs) → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (172 módulos, 173 pasos, 484 dependencias). `verify-local-preparation-db` → PASS (172 módulos instalados y reaplicados en PGlite; `$S/round10-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (85 páginas / 278 rutas; las 9 rutas nuevas → `pro-round10-features.spec.ts`). Deriva (`$S/r8-sql/drift.mjs`) → 1124 funciones, 1118 iguales, **0 obsoletas**, 6 con parche dinámico esperado.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round10-sql/round10-test.sql` **63 PASS / 0 FAIL** (clientes: vista previa nuevo/existe/en archivo/errores, correo y teléfono CR normalizados, aislamiento, importación por el escritor del catálogo con revisión, réplica, 22023/40001, historial inmutable, etiquetas, duplicados, rechazo de archivar con registros, combinar, exportar; tablero: columnas, tarjetas, mover por ambos escritores, 40001/P0002, ganada/perdida con CAS/réplica/motivo inválido, ocultar perdidas; conversión por canal y campaña, totales, meses, período inválido; dependencias: migración FS+0, SS+1, vista previa FS/SS, sin tirar hacia atrás, 40001, aplicar, deshacer exacto, deshacer rechazado tras otro cambio, inmutable, vista conjunta y aislamiento; bitácora: personal de horas y cronómetros, completadas, 42501; recordatorio solo dueño, idempotente y en preferencias; plantilla con responsables, historial, réplica; selecciones: pedir no aprobada → 22023, aprobación en lote del cliente por el escritor existente, réplica, intruso 42501, margen en céntimos, totales, lote «pedido» con fecha CR, fechas inválidas, 40001, historial inmutable, cliente sin costo, hoja sin costo; orden de cambio impresa sin costo/margen, otro dueño; puerta: capacidades de las rutas nuevas y Miembro/Solo lectura). Regresión SQL: `round4a` 45/0, `round4b-billing` 36/0, `round4b-tasks-gantt` 28/0, `round5-payment-plan` 83/0, `round6a-integrations` 117/0, `round6b` 88/0, `round6c` 75/0, `round6d` 79/0, `round7a` 44/0, `round7b` 35/0, `round7c` 107/0, `round8` 85/0, `round8-roles` 24/0, `round9` 52/0, `security` 45/0 (líneas PASS de cada salida en `$S/round10-sql/reg/`).
- Playwright (workers 1, 127.0.0.1:3185, `$S/r10-logs/`): spec nueva `pro-round10-features.spec.ts` (3 pruebas × ES/EN: clientes + tablero + conversión; dependencias + cronograma conjunto + bitácora + plantillas; selecciones + aprobación en lote del cliente en su vista + impresos). Resultado final: **chromium-desktop 104 aprobadas / 2 fallidas preexistentes / 2 omitidas** (30 specs) y **webkit-mobile 52/52** (15 specs). Historia honesta: en la 1.ª pasada de la spec nueva fallaron el desborde del tablero y la limpieza de cuentas (disparadores) y, en WebKit, el Gantt en modo lista y la recarga del seguimiento (todo corregido arriba). En la regresión: `pro-company` esperaba 15 secciones de Empresa y hay 16 desde la Ronda 9 («Documentos con su marca»; la Ronda 9 no la volvió a correr): spec actualizada 15→16. `pro-daily-logs` esperaba la trampa de foco del diálogo del trabajo, que en el espacio Pro es página desde la Ronda 9: misma adaptación que la Ronda 9 hizo en `pro-work-files` (en la ruta: sin diálogo; Mi panel conserva la comprobación); en WebKit su colector propio contaba el ruido `Type error` de React en desarrollo: ahora usa `onAppPageError` (mismas reglas que las 27 specs de la Ronda 9). `pro-work-updates` (chromium, ECONNRESET por compilación en frío) y `pro-round9-suite` (WebKit, «Atrás» del historial) pasaron al repetir sin cambios. **`pro-private-estimates-journey` (chromium) 4/6**: los 2 recorridos de recuperación fallan con «No resource with given identifier» al leer una respuesta tras navegar; **también fallan con el `private-estimate-preview.tsx` original** (prueba A/B, `$S/r10-logs/ab-chromium-desktop.log`): no es de esta ronda y queda pendiente. `pro-notifications-parity`: 2 omitidas por la propia spec.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round10-features** (nueva) | 6/6 | 6/6 (1.ª 2/6) |
| pro-leads-inboxes · lead-center · request-pipeline · lead-origins-journey | 6/6 · 6/6 · 4/4 · 4/4 | 6/6 · — · 4/4 · — |
| pro-company · client-operations | 3/3 (1.ª 1/3, spec 15→16) · 1/1 | — |
| pro-project-schedule · work-tasks | 2/2 · 3/3 | 2/2 · — |
| pro-task-center · -planning · -batch | 3/3 · 2/2 · 4/4 | 3/3 · — · — |
| pro-task-templates · task-template-management · schedule-templates | 2/2 · 2/2 · 2/2 | 2/2 · — · — |
| pro-daily-logs · work-updates | 6/6 (1.ª 4/6) · 3/3 (1.ª 2/3) | 6/6 (1.ª 4/6) · 3/3 |
| pro-private-estimates-journey · -pdf | **4/6 (preexistente, A/B)** · 2/2 | — |
| pro-work-changes · selections · allowances | 1/1 · 2/2 · 2/2 | 1/1 · 2/2 · 2/2 |
| pro-notifications-parity | 2 omitidas | — |
| pro-round7c-suite · round8-suite · round9-suite · round9-features | 4/4 · 6/6 · 2/2 · 6/6 | — · 6/6 · 2/2 (1.ª 1/2) · 6/6 |
| pro-security-roles · security-unit · team | 1/1 · 9/9 · 6/6 | 1/1 · — · — |

### Capturas revisadas (`$S/round10-shots/`)
56 capturas ES/EN, escritorio y teléfono: vista previa de importación (estados por fila), combinar duplicados, tablero (escritorio con columnas y carril propio; teléfono con columnas deslizables), conversión por canal, cronograma con reglas/ruta crítica/vista previa y deshacer, cronograma conjunto, bitácora rellenada, asignación de responsables de la plantilla, seguimiento de selecciones con margen, aprobación en lote del cliente, y las tres copias impresas con color/nombre/pie de la empresa (verde bosque). Sin desbordes horizontales (comprobado en la spec). Ajuste tras revisarlas: el carril del tablero ya no ensancha la página.

### No hecho / parcial (honesto)
- Fila 16: no se trabajó.
- Fila 05: sin campos personalizados; combinar no traslada trabajos/documentos (por diseño se rechaza archivar un cliente con registros).
- Fila 07: 50 tarjetas por columna en el tablero.
- Fila 08: «llegaron a» por etapa actual, sin historial de transiciones; campañas solo en oportunidades manuales.
- Fila 13: sin calendario laboral/feriados; dependientes solo hacia adelante; reglas no incluidas en plantillas de cronograma.
- Fila 20: clima solo simulado; personal/horas al texto (no a los campos de la Bitácora); aviso solo para el dueño.
- Filas 78/79: sin asignación de responsables ni reglas FS/SS en plantillas de cronograma; sin etiquetas de plantillas.
- Fila 62: sin ocultar precio/enlace, sin órdenes de compra desde selecciones.
- `pro-private-estimates-journey` (chromium) 2 recorridos fallan también sin los cambios de esta ronda (A/B): pendiente.

### Archivos
Nuevos: SQL `sales-contacts-board-local.sql`, `jobsite-links-autofill-local.sql`, `selection-tracking-documents-local.sql`; rutas `api/pro/{client-contacts,lead-board,schedule-links,daily-log-autofill,task-templates-apply,selections-tracking,quote-print,work-changes-print,selections-print}`; lib `round10.ts`, `round10-print.ts`; componentes `round10-sales.tsx`, `round10-jobsite.tsx`, `round10-selections.tsx`; spec `pro-round10-features.spec.ts`; `$S/round10-sql/round10-test.sql`. Modificados: `business-panel.tsx`, `leads-workspace.tsx`, `project-schedule.tsx`, `task-center.tsx`, `task-templates.tsx`, `daily-logs.tsx`, `work-selections.tsx`, `work-changes.tsx`, `private-estimate-preview.tsx`, `notification-center.tsx`, `round9.ts` (evento nuevo), specs `pro-company.spec.ts` (15→16) y `pro-daily-logs.spec.ts` (página del trabajo, `onAppPageError`), `local-sql-manifest.mjs`, `verify-app-surface-ownership.mjs`; documentos: este registro, `houzz-parity-register-local.md` (filas 05, 07, 08, 13, 16, 20, 45, 62, 78, 79; estados sin cambiar: siguen P), `team-roles-local.md` (punto 10).

## Ronda 11 (2026-11-15)

Paridad Houzz Pro en Finanzas (identidad fiscal del emisor, reportes contables, saldos coherentes, órdenes de compra desde el trabajo, recordatorios del plan de pagos) y pendientes de la Ronda 10 (adjuntos de tareas, ocultar precio/enlace de selecciones, `pro-private-estimates-journey`). Todo local: sin facturas reales, proveedor fiscal, cobros, correos, mensajes ni llamadas a terceros; sin commits, envíos, `stash` ni despliegues. Entorno con `qa2-envonly.zsh` (no se leyeron `.env.local`, `native-env.sh` ni secretos). Respaldos en `$S/round11-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local, `supabase/config.toml` y `next.config.ts` sin tocar; sin sub-agentes. `docs/test-selection-policy.md` no existe en el repositorio (se siguió AGENTS.md y el patrón de las rondas anteriores). Antes de construir se revisó lo existente: varias piezas pedidas ya estaban (ver «ya existía») y no se duplicaron.

### 1. Facturación por hitos/cuotas y por avance (fila 42/44) — ya existía; sin duplicar
«Facturar desde el trabajo» (líneas aceptadas con % o cantidad, % del acordado, horas y gastos facturables; Ronda 4B/7A) y borrador por cuota del plan de pagos (Ronda 5) ya cubren el flujo. Esta ronda solo corrige el emisor de esos borradores (punto 2). Sigue P: sin emisión fiscal.

### 2. Datos fiscales y emisor automático (fila 43) — hecho
- `pro_company_fiscal_identity` (`finance-identity-reports-local.sql`): cada campo vacío del emisor sale de la empresa — nombre comercial (o de la cuenta), cédula de la cuenta con su tipo (jurídica 3-…, física 9 dígitos, DIMEX 11–12), correo de contacto (validado), teléfono con el formato de `proPhone` («+506 XXXX-XXXX») y dirección. Lo guardado en «Emisor» gana campo por campo.
- Lo usan **todos** los borradores nuevos (`pro_invoice_configured_save` redefinido: directo, desde origen, «Facturar desde el trabajo», cuota del plan) y los valores iniciales del formulario (`/api/pro/invoice-drafts`). Corrige el «emisor vacío» (antes solo se copiaba el nombre).
- Detalle de factura: una línea nueva empieza con **IVA 13 %** si el proyecto no tiene otro predeterminado (13/4/2/1/0,5/0 %, exenta y no sujeta por línea ya existían). Datos fiscales del cliente y teléfono del receptor ya existían (`client-fiscal-local.sql`, Ronda 7A).

### 3. Anticipos, créditos y reembolsos con saldos coherentes (fila 50) — hecho para reportes
La antigüedad de saldos (general y por cliente) usa ahora el saldo de cada factura después de pagos **y** notas de crédito aplicados (`pro_credit_draft_balance`, el mismo número del borrador); antes restaba solo pagos. Prueba SQL: con una nota de crédito aplicada coinciden el Resumen del trabajo, el saldo del cliente en el trabajo (`pro_client_job_balance`) y el borrador. «Pagos recibidos» separa pagos revertidos y suma reembolsos no anulados.

### 4. Órdenes de compra desde partidas (filas 51/52) — hecho
Órdenes de compra › «Desde cotización, selecciones o presupuesto» (`round11-finance.tsx`, `/api/pro/purchase-order-sources`, `pro_purchase_order_sources`): líneas de la cotización aceptada (con costo interno de la Ronda 4A), selecciones aprobadas (costo interno de la Ronda 10 y cantidad ya pedida) y códigos de presupuesto (previsto y comprometido). Lo marcado abre el formulario de siempre con esas líneas (precio del proveedor = costo interno, **nunca** el precio al cliente; vínculo «sel:» y código), y la orden la crea el **escritor existente** (numeración, CAS, recibos, historial). Recepción parcial/total y crear el presupuesto desde la pestaña Presupuesto ya existían.

### 5. Presupuesto por códigos: previsto vs comprometido vs real (fila 54) — ya existía
`pro_purchase_order_budget` ya da previsto, comprometido (órdenes no canceladas, con impuesto), real, proyectado = mayor(comprometido, real) y desviación. Nuevo: un código propone una línea de orden por lo previsto aún no comprometido.

### 6. Reportes contables (filas 23/55) — hecho
Estadísticas › Reportes suma pestañas **Por cliente** (0–30/31–60/61–90/90+, facturas con saldo, días de la más antigua), **Pagos recibidos** (fecha, cliente, trabajo, método, referencia; revertidos tachados y aparte; reembolsos) e **IVA** (base, IVA y exonerado por tarifa desde las líneas; borradores sin detalle por línea aparte con su propio IVA), cada una con **CSV para Excel** (BOM, decimales planos, fórmulas neutralizadas). Corrección «Resultado»: la columna mostraba «Costos y comprometido» pero el resultado no restaba lo comprometido; ahora usa `resultWithCommittedCents` y avisa «IVA no desglosado» cuando el acordado no trae IVA (no se inventa un 13 %). `pro_reports_read` redefinido con las mismas claves más estas dos.

### 7. Plan de pagos del profesional (fila 57) — hecho, solo dentro de la app
Evento nuevo **«Cuota del plan de pagos por vencer»** (`payment_plan_due`) en el centro de avisos (dueño; según sus «días por vencer»; idempotente; borrador de correo solo si la persona lo eligió, nunca enviado). En la vista del cliente, aviso de **próxima cuota** y de **cuotas vencidas** calculado del mismo plan. Calendario, vista del cliente, aceptación y borrador por cuota ya existían. ContrataCR no financia: es el plan del profesional, sin intereses ni terceros.

### 8. Filas 23 y 75 — 23 ver punto 6; 75 sin cambios

### 9. Comentarios, adjuntos y asignación de tareas (fila 16) — hecho lo que faltaba
Lo que faltaba era editar/papelera de adjuntos: **cambiar el nombre visible**, **enviar a la papelera** y **restaurar** (`round11-tasks.tsx`, acciones `file_rename/file_trash/file_restore` en `/api/pro/team-task-discussion`, `task-files-selection-visibility-local.sql`). Solo quien subió el archivo o el dueño, con concesión de colaborador; el objeto guardado, su nombre de descarga y su huella no cambian; CAS (409), `actionId` y historial inmutable. Límite 20 MiB (`file-limit.ts`) y aviso de asignación dentro de la app (`task_assigned`) ya existían.

### 10. `pro-private-estimates-journey` (2 fallas preexistentes) — corregido en la spec (causa raíz)
Desde la Ronda 9 el trabajo es un **documento propio** (`/dashboard/pro/trabajo/<id>/<sección>`), así que «Preparar cotización» y «Guardar» hacen una navegación real. La spec leía el cuerpo de la respuesta después de navegar («No resource with given identifier» / «Execution context was destroyed») y esperaba un diálogo del trabajo. La app hace lo correcto (vuelve a `/trabajo/<id>/costs` con `h1`, comprobado en la traza). Cambios en la spec: el cuerpo de la consulta del origen se guarda en la intercepción antes de navegar; el sondeo del diario tolera la navegación; el regreso se comprueba en la página del trabajo (ruta, «Preparar cotización», `h1`) en vez del diálogo.

### 11. Selecciones: ocultar precio/enlace y orden desde selecciones (fila 62) — hecho
Selecciones › «Qué ve el cliente» (`round11-selections.tsx`, `/api/pro/selections-visibility`): por selección, ocultar precio y/o enlace; la lectura del cliente devuelve nulos (nunca llegan al navegador) y su vista muestra «El profesional le indicará el precio aparte»; el dueño sigue viéndolos. CAS por ítem, `actionId`, historial inmutable. Órdenes de compra desde selecciones: punto 4. Límite: la hoja imprimible de selecciones todavía no respeta «ocultar precio».

### Defectos encontrados y corregidos durante la ronda
- Reportes: «Resultado» no restaba lo comprometido mostrado al lado; la antigüedad no restaba notas de crédito (ver puntos 3 y 6).
- `pro-round10-features` (selecciones impresas): comprobaba que el HTML no tuviera «35», pero el `nonce` CSP aleatorio puede contenerlo (falla intermitente, no de la app): ahora se comprueba sin el `nonce`.
- Los módulos SQL nuevos se nombraron primero con dígitos y `verify-local-preparation-manifest` los rechazó (`^[a-z][a-z-]+\.sql$`): renombrados a `finance-identity-reports-local.sql` y `task-files-selection-visibility-local.sql`.
- En la prueba SQL, una comprobación con `AND` dependía del orden de evaluación (restaurar y contar en la misma expresión): separada en dos pasos.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 28 archivos `.ts/.tsx/.mjs` tocados (incluidas 3 specs) → 0. `local-sql-manifest.mjs --check` → 0. `verify-local-preparation-manifest` → PASS (174 módulos, 175 pasos, 509 dependencias). `verify-local-preparation-db` → PASS (174 módulos instalados y reaplicados en PGlite; `$S/round11-sql/verify-prep-db.out`). `verify-app-surface-ownership` → PASS (85 páginas / 281 rutas; las 3 rutas nuevas → `pro-round11-features.spec.ts`). Deriva (`$S/r8-sql/drift.mjs`) → 1133 funciones, 1127 iguales, **0 obsoletas**, 6 con parche dinámico esperado.
- SQL (loopback, `begin … rollback`, sin `\i` de módulos): `$S/round11-sql/round11-test.sql` **45 PASS / 0 FAIL** (teléfono como `proPhone`; identidad de la empresa, cuenta sin empresa, cédula física/jurídica; borrador nuevo por «Facturar desde el trabajo» con el emisor completo; lo guardado gana por campo; saldo de factura con pagos y nota de crédito; antigüedad igual al borrador; resultado con comprometido; Resumen = saldo del cliente en el trabajo; IVA 13 % con descuento, 4 %, exento y «sin detalle»; totales; por cliente; pagos; período; archivada; aislamiento/42501/22023; solo service_role; ocultar precio/enlace en la lectura del cliente, el dueño sí lo ve, réplica/40001/42501/historial inmutable; orígenes de orden con costo interno y presupuesto; orden por el escritor existente y comprometido por código; recordatorio de cuota por vencer, idempotente, solo dueño, sin correo; adjuntos: renombrar, réplica/22023/40001, permisos, papelera/restaurar, historial inmutable, concesión de lector → 42501; puerta de roles). Regresión SQL: `round4a` 45/0, `round4b-billing` 36/0, `round4b-tasks-gantt` 28/0, `round5-payment-plan` 83/0, `round6a-integrations` 117/0, `round6b` 88/0, `round6c` 75/0, `round6d` 79/0, `round7a` 44/0, `round7b` 35/0, `round7c` 107/0, `round8` 85/0, `round8-roles` 24/0, `round9` 52/0, `round10` 63/0, `security` 45/0 (`$S/round11-sql/reg/`).
- Playwright (workers 1, 127.0.0.1:3185, `$S/r11-logs/`): spec nueva `pro-round11-features.spec.ts` (3 pruebas × ES/EN: emisor + reportes + aviso de cuota; orden desde selección/presupuesto + precio oculto en la vista del cliente; adjuntos de tarea) **6/6 en chromium-desktop y 6/6 en webkit-mobile** a la primera. Regresión: chromium-desktop 31 specs, 1.ª pasada 3 fallas aisladas (la prueba de adjuntos de la spec nueva con «/equipo en blanco» mientras se reaplicaban los módulos SQL; `pro-private-estimates-journey` «directo (en)» tras recargar; `pro-round10-features` por el `nonce`) → al repetir **6/6, 6/6, 6/6**; resto verde (2 omitidas por `pro-private-estimates-pdf` y 2 por `pro-notifications-parity`, propias de esas specs). webkit-mobile 14 specs: 1.ª pasada `pro-round7b-suite` 1/3 y `pro-round10-features` 5/6 por inestabilidad del servidor (RSS > 6 GB, reinicio del ejecutor, `ECONNRESET`/tiempo de espera) → al repetir **3/3 y 6/6**. `pro-private-estimates-journey` en WebKit (nunca formó parte de la regresión WebKit) queda **4/6**: los 2 recorridos «solicitud manual y trabajo convertido» fallan en el teléfono (el menú del trabajo en el teléfono es la tira compacta de la Ronda 9 y no expone el botón «Costos y pagos» que busca la spec; y el colector propio de la spec cuenta el ruido de desarrollo de WebKit). No se adaptó para WebKit en esta ronda.

| Spec | chromium-desktop | webkit-mobile |
|---|---|---|
| **pro-round11-features** (nueva) | 6/6 (en regresión 5/6 → 6/6) | 6/6 |
| pro-private-estimates-journey | **6/6** (antes 4/6) | 4/6 (fuera de alcance previo) |
| pro-private-estimates-pdf | 2/2 (+2 omitidas) | — |
| pro-round7b-suite · purchase-orders · selections · allowances | 3/3 · 2/2 · 2/2 · 2/2 | 3/3 (1.ª 1/3) · 2/2 · 2/2 · — |
| pro-credits-retainers · round5-payment-plan · round4b-billing | 2/2 · 4/4 · 4/4 | 2/2 · 4/4 · 4/4 |
| pro-invoice-drafts · phase2-qa-fixes · document-settings · billing | 1/1 · 9/9 · 1/1 · 1/1 | 1/1 · 9/9 · — · — |
| pro-client-statement · credit-notes-statement · client-operations | 1/1 · 2/2 · 1/1 | — |
| pro-invoice-beverages · service-packages · round6a-integrations | 1/1 · 1/1 · 4/4 | — |
| pro-team-task-discussion · -api · team-task-mentions | 2/2 · 1/1 · 2/2 | 2/2 · — · — |
| pro-notifications-parity · round9-features · round10-features | 2 omitidas · 6/6 · 6/6 (1.ª 5/6) | — · 6/6 · 6/6 (1.ª 5/6) |
| pro-company · round8-suite · security-roles · security-unit · team | 3/3 · 6/6 · 1/1 · 9/9 · 6/6 | — · — · 1/1 · — · — |

### Capturas revisadas (`$S/round11-shots/`)
44 capturas ES/EN, escritorio y teléfono (390 px): reportes Financiero/Por cliente/Pagos recibidos/IVA, centro de avisos con la cuota por vencer, «Qué ve el cliente», selección con precio oculto en la vista del cliente, orígenes de la orden y formulario prellenado, adjunto renombrado y papelera de la tarea. Montos con `proMoney` (₡40.000 / ₡40,000), sin desbordes horizontales (comprobado en la spec). Ajuste tras revisarlas: la captura del cliente ahora se desplaza hasta la selección. Observación ajena a la ronda: en la vista del cliente aparece «No se pudieron consultar los cambios de horario» con la solicitud sembrada por la prueba (no se tocó).

### No hecho / parcial (honesto)
- Sin emisión fiscal, firma ni envío a Hacienda; el IVA del reporte es un resumen interno (impuestos específicos y otros cargos fuera; redondeo por línea).
- «IVA no desglosado»: si el acordado no trae IVA no se estima la base sin IVA.
- La prueba SQL no cubre líneas de cotización aceptada como origen de orden (sí selecciones y presupuesto); el código lee la publicación aceptada y el costo interno de sus ítems.
- Hoja imprimible de selecciones todavía no respeta «ocultar precio».
- Adjuntos de tarea: sin borrado definitivo; avisos solo dentro de la app.
- Recordatorios del plan: solo dentro de la app; el cliente no recibe un aviso en la campana (lo ve en su vista del plan).
- `pro-private-estimates-journey` en WebKit 4/6 (ver arriba).

### Archivos
Nuevos: SQL `finance-identity-reports-local.sql`, `task-files-selection-visibility-local.sql`; rutas `api/pro/{finance-reports,purchase-order-sources,selections-visibility}`; lib `round11.ts`; componentes `round11-finance.tsx`, `round11-tasks.tsx`, `round11-selections.tsx`; spec `pro-round11-features.spec.ts`; `$S/round11-sql/round11-test.sql`. Modificados: `invoice-drafts/route.ts`, `team-task-discussion/route.ts`, `team-task-discussion.ts`, `reports.ts`, `selections.ts`, `round9.ts`, `pro-reports.tsx`, `work-purchase-orders.tsx`, `work-selections.tsx`, `team-task-discussion.tsx`, `client-payment-plan.tsx`, `invoice-detail-editor.tsx`, `notification-center.tsx`, `business-panel.tsx`, specs `pro-private-estimates-journey.spec.ts` y `pro-round10-features.spec.ts`, `local-sql-manifest.mjs`, `verify-app-surface-ownership.mjs`; documentos: este registro, `houzz-parity-register-local.md` (filas 16, 23, 42, 43, 44, 50, 51, 52, 54, 55, 57, 62, 75; todas siguen P: ninguna es igual en flujo a Houzz de punta a punta), `team-roles-local.md` (punto 11).

## Ronda 12 (2026-11-15)

Paridad Houzz Pro en el panel del cliente (filas 33, 24 y relacionadas 22/28–31), pendientes de la Ronda 11, diseño (filas 61 y 63) y primeros pasos (fila 74). Todo local: sin facturas reales, cobros, correos, mensajes, push ni llamadas a terceros; sin commits, envíos, `stash` ni despliegues. Entorno con `qa2-envonly.zsh` (no se leyeron `.env.local`, `native-env.sh` ni secretos). Respaldos en `$S/round12-backup/` (rutas relativas; `NEW.txt` lista los nuevos). Supabase local, `supabase/config.toml` y `next.config.ts` sin tocar; sin sub-agentes. `docs/test-selection-policy.md` no existe (se siguió AGENTS.md y el patrón de rondas anteriores). ContrataCR no financia: el plan de pagos es del profesional, sin intereses ni terceros.

### 1. Panel del cliente: «Resumen de su proyecto» (fila 33) — hecho
- Arriba del proyecto del cliente (y en la vista previa «Vista del cliente» del dueño, que corre como el cliente vinculado): **Pendiente de su aprobación** (cotización compartida, contrato por firmar, selección por elegir con «Decidir antes del…» y aviso de fecha vencida, cambio/extra propuesto, plan de pagos por aceptar), **Pagos** (abonado, saldo, cuotas vencidas y próxima cuota), **Cronograma** (avance de tareas, próxima fecha clave, fin previsto), **Mensajes** (sin leer y último mensaje) y **Archivos recientes**; una tira «Secciones del proyecto» y cada bloque saltan a su sección (anclas en `client-work-sections.tsx`; si una sección de arriba termina de cargar después del salto, se vuelve a colocar).
- `pro_client_project_overview` (`client-portal-overview-local.sql`) se arma **solo** con los lectores del cliente existentes (`pro_client_project_quotes_read`, `pro_contracts_client_read`, `pro_work_selections_client_read`, `pro_work_changes_page`, `pro_payment_plan_client_read`, `pro_client_finances_client_read`, `pro_work_schedule_client_read`, `pro_work_files_client_read`, mensajes): lo que el profesional oculta llega nulo; nunca costos internos (comprobado en SQL). Ruta `GET /api/pro/client-project-overview` (`read`), esquema estricto (`round12.ts`).
- En escritorio el proyecto del cliente se abre en un diálogo ancho (`xl`) y el resumen usa consultas de contenedor (2 columnas solo si cabe).
- Corregido (observación de la Ronda 11): «No se pudieron consultar los cambios de horario» aparecía en un trabajo vinculado que no es una cita (la lectura devuelve 404 «no aplica»); el panel de reprogramación del cliente ahora es opcional como en el panel del dueño. Comprobado en la spec con la misma solicitud sembrada.
- Filas 22, 28, 29, 30, 31: sin cambios de alcance (el resumen muestra los archivos compartidos recientes).

### 2. Pendientes de la Ronda 11 — hechos
- **Hoja imprimible de selecciones** respeta «ocultar precio»: `pro_work_selection_print_read` redefinido devuelve unidad/total nulos y `priceHidden`; la hoja muestra «Precio indicado aparte», no lo suma al «Total aprobado» y lo aclara. El enlace del producto nunca se imprimió.
- **Campana del cliente**: aviso por cuota que vence en 3 días y por cuota vencida (tabla `notifications`, tipo nuevo `pro_payment_plan_client`, datos validados por restricción, `push_suppressed` → la bandeja de push queda «suppressed»), una vez por plan/revisión/cuota/fecha/acción (recibos `pro_client_installment_notices`, inmutables; borrar el aviso no lo reemite), solo si el cliente vinculado ve la sección «Plan de pagos». Se generan cuando el cliente abre su proyecto (solo para él) o cuando el dueño abre su espacio Pro (contador de avisos). Texto localizado ES/EN con «usted» (`payment-plan-client-notification.ts`, `localized-notification.ts`, `notification-link.ts`).
- **Prueba SQL de orden de compra desde líneas de la cotización aceptada**: la línea aparece con su costo interno, precio y cantidad; la orden la crea el escritor existente con el costo interno (₡240.000 + IVA ₡31.200), nunca con el precio al cliente.
- **`pro-private-estimates-journey` en webkit-mobile 6/6**: el botón «Costos y pagos» de la tira compacta sí funciona; las 2 fallas eran del colector propio de la spec, que contaba el «Type error» de las pistas de rendimiento de React en desarrollo de WebKit. La spec usa ahora el colector compartido `onAppPageError` (mismas reglas estrechas que el resto de la suite; cualquier otro error sigue fallando).

### 3. Diseño — filas 63 y 61 hechas en parte; 39 y 66 no
- **Planos (63):** nivel por plano (nombre y orden; la lista se ordena por nivel; «Nivel nuevo con estas paredes» empieza el piso siguiente con las mismas paredes y altura) y **objetos** (15 tipos: cama, sofá, mesa, silla, escritorio, clóset, mueble, cocina, refrigeradora, fregadero, inodoro, ducha, tina, lavadora, escalera) con ancho/fondo, giro de 90°, en el editor, PNG y PDF; no cuentan como área. Validación estricta en la ruta (zod) y en SQL (`design-levels-local.sql`, `pro_floor_content_ok`), mismo escritor (CAS, `actionId`, historial).
- **Tableros (61):** al crear un tablero, «Empezar con» una plantilla (Cocina, Baño, Sala, Paleta de materiales): título, 4 muestras de color, 3 notas y una flecha, guardados por el escritor de páginas existente y editables. Texto libre, flechas, dibujo, tamaño y guardado automático ya existían (Rondas 2 y 7C).
- **No hecho:** fila 39 (propuesta visual con aprobación por partida) y fila 66 (sustracción de áreas en Mediciones; el vínculo con cotizaciones ya existía).

### 4. Perfil público y portafolio (filas 59, 68, 03) — no hecho
Sin cambios en esta ronda (prioridad a D/E/A/C). La fila 03 ya estaba en V; 59 sigue sin imagen/proveedor por artículo; 68 sin portafolio por proyecto (el sitio de la Ronda 6D usa las fotos del perfil y las reseñas publicadas).

### 5. Ayuda y primeros pasos (fila 74) — hecho
«Primeros pasos en Pro» en Inicio del espacio Pro independiente: 9 pasos que se marcan solos desde los datos propios (`pro_getting_started_read`, `getting-started-local.sql`; nada se guarda): perfil de empresa, documentos, primer cliente, cotización, proyecto, cliente invitado, vista del cliente, cobro (factura o plan) y equipo. Cada paso tiene una explicación breve ES/EN («usted») y el botón que abre su lugar; barra de avance; desaparece al completarse. Límite: no es ayuda contextual en cada pantalla ni chat de soporte.

### Recorrido manual como cliente (spec «customer walkthrough», ES/EN, escritorio y 390 px)
Cuenta invitada al trabajo con enlace de un solo uso → abre el proyecto: el resumen muestra la cotización por responder (₡452.000), el plan por aceptar y «Su profesional todavía no ha compartido archivos» → «Revisar y responder» lleva a Cotizaciones del proyecto → responde un mensaje → acepta el plan de pagos → «Actualizar» y el resumen ya no pide el plan y no hay mensajes sin leer.
Problemas de experiencia encontrados:
1. El proyecto del cliente se abre dentro de un diálogo titulado «Solicitud de cita» / «Appointment request» aunque sea un proyecto (en uno por invitación dice «Proyecto vinculado»). Se ensanchó el diálogo en escritorio; el título no se cambió porque 10 specs lo usan como nombre del diálogo. **Pendiente:** página propia «Mi proyecto».
2. En el resumen, la «próxima cuota» era la vencida: ahora dice «Cuota pendiente más antigua…, venció el…» cuando está vencida.
3. Al saltar a una sección que aún carga, la página se movía después: el salto se vuelve a colocar.
4. Página larga en el teléfono (muchas secciones apiladas); la tira de secciones del resumen lo mitiga. Pendiente: pestañas por sección como página propia.
5. Montos con `proMoney` (₡452.000 / ₡452,000) en resumen, campana y hoja; sin desborde horizontal (comprobado en cada paso).

### Verificación (al momento de este registro)
- `tsc` 0; ESLint `--max-warnings=0` en los archivos tocados 0; `local-sql-manifest --check` 0; `verify-local-preparation-manifest` PASS (177 módulos, 178 pasos, 535 dependencias); `verify-local-preparation-db` PASS; `verify-app-surface-ownership` PASS (85 páginas / 282 rutas); deriva 1137 funciones, 0 obsoletas, 6 parches dinámicos esperados.
- SQL `$S/round12-sql/round12-test.sql` 35 PASS / 0 FAIL; regresión SQL round4a…round11, round8-roles y security 0 FAIL (`$S/round12-sql/reg/`).
- Playwright: spec nueva 4/4 en chromium-desktop y 4/4 en webkit-mobile (antes de agregar el recorrido del cliente y la plantilla de tableros, que siguen en la repetición en curso). `pro-private-estimates-journey` webkit-mobile 6/6. Regresión chromium 37 specs: 32 verdes; 5 con fallas (round5-payment-plan por cambio intencional de avisos → spec actualizada; invoice-drafts 500, team-task-discussion «/equipo en blanco», client-operations carga lenta, client-dashboard EN) con el servidor cerca de 6 GB. WebKit 15 specs: 12 verdes; round7b, round5 y round9 por tiempos de espera. Las repeticiones estaban en curso al cerrar este registro (`$S/r12-logs/rc-*`, `rw-*`).
- Capturas en `$S/round12-shots/` (ES/EN, 1366 px y 390 px).

### Verificación de la repetición de la Ronda 12 (logs `$S/r12-logs/`, cerrada el 2026-11-15 23:40)
- Primera pasada chromium-desktop (`regc`, 37 specs): 31 specs verdes; fallaron round5-payment-plan 2/4 (avisos cambiados a propósito; spec actualizada), invoice-drafts 0/1, team-task-discussion 1/2, client-operations 0/1 y client-dashboard 1/2, con el servidor cerca de 6 GB.
- Primera pasada webkit-mobile (`regw`, 15 specs): 12 verdes; round7b 2/3, round5-payment-plan 2/4 y round9 5/6.
- Repetición chromium (`rc`, servidor reiniciado por RSS): round5 4/4, invoice-drafts 1/1, team-task-discussion 2/2, client-operations 1/1, client-dashboard 2/2, mood-boards 2/2; **round12-features 4/6** (el recorrido del cliente ES/EN falla al escribir el «Mensaje»).
- Repetición webkit (`rw`): round5 4/4, round9 6/6, mood-boards 2/2; **round12-features 4/6** (misma causa) y **round7b 1/3** («/es/dashboard/pro/equipo» en blanco y POST de retiro > 15 s).
- Ambas fallas pendientes se resolvieron en la Ronda de correcciones 13 (abajo).

## Ronda de correcciones 13 (2026-11-16)

Entradas: revisión de seguridad R10–R11 (8 puntos), recorrido manual R9–R11 (M1–M7, C1–C4) y auditoría de textos ES/EN. Copias de respaldo en `$S/fix13-backup/` (archivos nuevos en `NEW.txt`).

### 1. Fallas de pruebas
- **Recorrido del cliente (round12, ES/EN, ambos navegadores).** Causa raíz: la conversación del cliente está plegada («Abrir conversación») y «Abrir mensajes» del resumen solo desplazaba a la sección, sin abrirla; la spec buscaba el campo «Mensaje» que no existe plegado. Corrección en la app: el resumen emite `ccr-client-section-open` y `ClientMessages` se abre al recibirlo; el salto a una sección que todavía carga sigue intentando hasta 6 s (WebKit cargaba Cotizaciones después del salto). La spec usa ahora «Abrir mensajes» y comprueba que la conversación queda abierta; luego envía el mensaje, acepta el plan y el resumen se actualiza.
- **round7b webkit.** Con servidor reiniciado pasa 3/3. «Equipo en blanco»: mientras cargaba la sesión, `TeamShell` mostraba el árbol del colaborador sin estado visible; ahora muestra «Cargando equipo…» (`role=status`, `aria-busy`). El POST de retiro > 15 s era compilación en frío del servidor viejo (no se repitió con servidor nuevo); no se subieron tiempos.

### 2. Seguridad (puntos 1–8)
1. **CSP de impresiones (media).** `next.config.ts` (no editable en esta ronda) reemplaza la CSP de las rutas que no están en su lista. Las rutas `quote-print`, `work-changes-print`, `selections-print`, `contract-print`, `payment-plan-print`, `purchase-order-print` y `client-statement-print` reciben ahora el nonce y la política estricta desde el middleware (`src/lib/pro/print-csp.ts`; un encabezado de nonce enviado por el cliente se descarta) y la ruta usa ese mismo nonce. Prueba: la respuesta trae `default-src 'none'` + `script-src 'nonce-…'` y el HTML usa ese nonce; un nonce falsificado no aparece.
2. **IVA del reporte (media).** `pro_invoice_vat_lines` repite por línea el cálculo de `pro_invoice_extras_totals` (montos a 5 decimales, base del IVA con impuestos específicos 02/04/05/12, exoneración sobre esa base); el reporte agrupa por tarifa y reparte los céntimos de cada borrador por mayor residuo, así el total del reporte es igual al IVA de las facturas.
3. Totales de pagos sin el límite de 500 de la lista (`paymentsTruncated` solo con más de 500).
4. Costo interno, margen, reportes financieros y exportar clientes: solo dueño, Administrador y Gerente (403 `pro_role` a Integrante y Solo lectura; seguimiento de selecciones sin costo ni margen). Documentado en `team-roles-local.md` (punto 13).
5. Emisor: solo datos del perfil profesional/empresa (nombre comercial, correo de contacto, teléfono de llamadas o WhatsApp, dirección); nunca correo de acceso, cédula ni teléfono personal de `profiles`. La cédula se escribe en la configuración del emisor. Se ajustaron las expectativas de round11 (SQL y spec).
6. `pg_advisory_xact_lock` por solicitud (ganada/perdida) y por archivo de tarea antes de leer la revisión: dos primeras escrituras simultáneas → una 200 y una 409 (comprobado por API).
7. El historial de ganada/perdida nombra al integrante que actuó (solo si es integrante activo de esa empresa).
8. Índices de expresión por correo y teléfono en `pro_clients`; exportación acotada a 5000; límite de frecuencia en reportes, orígenes de orden de compra, exportación de clientes, vista previa de reglas del cronograma y datos del día.

### 3. Recorrido M1–M7
- M1: un producto del catálogo entra con el IVA de la línea nueva (predeterminado del proyecto, si no 13 %); la línea de avance toma el IVA predeterminado del proyecto y, sin él, queda «por definir» con aviso claro (el acuerdo puede incluir IVA, por eso no se suma 13 % a ciegas).
- M2: criterio explicado en Estadísticas (pendiente de cobro = borradores menos pagos y notas de crédito) y en el estado de cuenta (importe acordado menos abonos).
- M3: tablero con «N etapas», flechas ← → y degradado cuando hay etapas ocultas; la tarjeta movida se centra y conserva el foco; botón «Ganada…» visible.
- M4: el clima de ejemplo ya no se escribe en la entrada; se sugiere aparte y solo se copia con «Usar este clima de ejemplo», con la nota «simulado, no es el clima real».
- M5: el cliente ve un estado vacío («todavía no tiene un acuerdo formal ni cambios») en lugar de un error.
- M6: el bloque de roles de la empresa queda debajo del encabezado y del título «Equipo»; se explica la diferencia entre el código de empresa y «Usar código» (acceso a un trabajo).
- M7: la aprobación del cliente se muestra al instante (estado optimista) y la recarga la confirma.

### 4. C1–C4 y textos
C1 subtotal de sección sin duplicar en 390 px; C2 las impresiones sin marca muestran el nombre de la empresa; C3 hoja de selecciones con precios ocultos dice «Precio indicado aparte» y lo explica en lugar de ₡0; C4: dependencias con un solo nombre y la indicación de dónde mueven fechas, «Responsable anotado antes», menú de clientes con un solo «Importar» («Organizar clientes…» para vCard/duplicados/etiquetas), importador reconoce «Nombre completo», selector de archivo propio, catálogo vacío explica cómo crear, total del detalle explica el problema, fechas de pagos formateadas y «SINPE Móvil», nota de crédito «Disponible: aplíquela a una factura», canales integrados traducidos en conversión, «Formulario de contacto» como botón, «Tablero» activo distinto de «+ Agregar solicitud», recuperación de tarea explicada, cuota de ₡65.000 en 3 = 21.666 + 21.666 + 21.668 (correcto: el residuo va a la última). Textos: plurales con `proCount`, «solicitud» como término único en el tablero, «Intente de nuevo.», «Overdue», «Mark as read», marca con mensaje propio, «color», «Hours logged», «Horas sin costo asignado», CSV «(CRC)», VAT en inglés, unidades por idioma, rótulos de pedidos iguales a `trackingLabel`, «Días de espera»/«Delay», «Elija una tarea», ruta crítica sin jerga.

### 5. Proyecto del cliente
Mínimo hecho: para el cliente, una solicitud vinculada a un trabajo abre el diálogo «Mi proyecto» / «My project» (sigue en la dirección `citaSolicitud=…`, así Atrás lo cierra). Seis specs actualizadas. **Pendiente:** página propia con URL dedicada.


### Defectos encontrados durante la ronda
- El tablero recalculaba el aviso de etapas ocultas en cada render (bucle de renders): en WebKit el botón «Guardar» del diálogo ganada/perdida no respondía. Corregido (solo actualiza si cambia; efecto con dependencias). El centrado de la tarjeta movida desplaza solo la tira del tablero (en WebKit `scrollIntoView` desplazaba también la página) y no actúa con un diálogo abierto.
- La primera versión de la CSP solo en el middleware no bastaba (la tabla de `next.config.ts` la reemplazaba); la prueba nueva lo detectó y se pasó a nonce emitido por el middleware.

### Verificación
- `tsc` 0; ESLint `--max-warnings=0` en los archivos tocados 0; `local-sql-manifest --check` 0; `verify-local-preparation-manifest` PASS (177 módulos, 178 pasos, 535 dependencias); `verify-local-preparation-db` PASS; `verify-app-surface-ownership` PASS (85 páginas / 283 rutas, sin rutas nuevas); deriva 1138 funciones, 0 obsoletas, 6 parches dinámicos esperados.
- SQL: `$S/fix13-sql/fix13-test.sql` 20 PASS / 0 FAIL; regresión round4a, round4b (billing, tasks-gantt), round5, round6a–d, round7a–c, round8, round8-roles, round9, round10, round11 (expectativas del emisor actualizadas), round12 y security: todas 0 FAIL (`$S/fix13-sql/reg/summary.txt`).
- Playwright primera pasada (`$S/fix13-logs/regc-*`, `regw-*`): chromium-desktop 48 specs → 45 verdes; fallaron round10 (3: la spec esperaba que «Nombre completo» no se reconociera → spec actualizada; impresión de selecciones > 15 s), company (2, «Cargando…» con servidor cargado) y appointment-reminders (2: el diálogo del cliente ahora es «Mi proyecto» → spec actualizada); notifications-parity 2 omitidas (preexistente). webkit-mobile 19 specs → 17 verdes; round12 (1, clic en plano > 15 s) y round10 (2, bucle de renders del tablero → corregido).
- Repeticiones con servidor nuevo: chromium round10 6/6, company 3/3, appointment-reminders 2/2, fix13 3/3; webkit round12 6/6, round10 6/6, fix13 3/3.
- Capturas en `$S/fix13-shots/` (ES/EN, 1440 px y 390 px): tablero, tarjeta movida, clima de ejemplo, «Mi proyecto» y cambios vacíos, equipo del colaborador. Revisadas.

### Pendiente (honesto)
- Página propia «Mi proyecto» con URL dedicada (hoy diálogo retitulado).
- Gantt: barra que tapa «Hoy», panel «Sin fechas» frente a plan con fechas, orden inverso del plan, tarea en edición duplicada, aviso de cambios sin guardar lejos de la campana; «Costo unitario (₡)» queda fijo (las selecciones solo usan colones).
- El caso exacto del recorrido M5 (404) quedó cubierto en código; la prueba E2E cubre el trabajo invitado sin acuerdo, que responde con datos vacíos.
- Reglas del cronograma truncadas en móvil: no revisado.

## Ronda de correcciones 14 (2026-11-16)

Entradas: revisión de las capturas de la Ronda 13, página propia «Mi proyecto», restos del Gantt y filas 39, 66, 59 y 68 del [registro](houzz-parity-register-local.md). Respaldos en `$S/fix14-backup/` (archivos nuevos en `NEW.txt`); registros en `$S/fix14-logs/`; capturas ES/EN 1440 px y 390 px en `$S/fix14-shots/`.

### 1. Fallas vistas en las capturas
- **a. Conteos del tablero.** Los conteos de la lista («Nueva 2 / Cita agendada 0») sí miden lo mismo que el tablero (etapa efectiva de cada solicitud), pero solo se recargaban al volver a la pestaña. Ahora el tablero avisa a la bandeja (`onChanged`) después de mover y de guardar ganada/perdida, y la lista se recarga: tras mover, «Nueva 1 / Cita agendada 1». La prueba lo comprueba en la barra lateral (escritorio) y en el selector (teléfono).
- **b. «Perdida…» / «Ganada…».** Ahora son botones con borde y color (rojo / verde), altura mínima de 36 px.
- **c. «Mensajes» duplicado.** El resumen ya no tiene su propia tarjeta de mensajes: queda el chip «Mensajes» (con el número sin leer) que abre la única tarjeta de conversación, que ahora muestra «No tiene mensajes sin leer / Tiene N mensajes sin leer» y el último mensaje.
- **d. Indicador «1 Issue» de Next.** No se reprodujo en las capturas de esta ronda. La prueba guarda la consola del tablero (`$S/fix14-logs/console-board-*.txt`): solo hay avisos de precarga de fuentes de `next/font` (propios del modo desarrollo, no de nuestro código) y ningún `console.error`. En la página del cliente el navegador registra un 403 de `/api/pro/access` (la cuenta del cliente no tiene Pro; es la respuesta esperada de la comprobación de acceso y no se cambió) y un aviso de tamaño de imagen del ícono de Android de la barra pública (fuera de Pro). No se tocó nada por este punto.

### 2. «Mi proyecto» como página propia
- Ruta `/[locale]/dashboard/mi-proyecto/[id]` (solo en desarrollo, como la página del trabajo). El servidor comprueba con el mismo lector del detalle (`pro_appointment_detail`) que la cuenta es **el cliente** de esa solicitud y que está vinculada a un trabajo; el profesional, otra cuenta, una cuenta deshabilitada o un id inválido reciben 404; sin sesión, redirección al inicio de sesión.
- La lista «Mis citas» abre la página (Atrás vuelve a la lista, Adelante y recargar la conservan). La dirección vieja del diálogo (`?tab=appointments&citaSolicitud=…`, usada por notificaciones e invitaciones) se reemplaza por la página y conserva `returnTo=/notificaciones`. El botón «Volver a Mis citas» usa el historial solo si se llegó desde la app en este mismo documento; un enlace directo vuelve a la lista.
- `src/lib/pro/navigation.ts` quedó sin cambios: una primera versión hacía aceptar la nueva ruta a `proDashboardPath`; mientras se investigaba una falla de `pro-navigation` (Atrás desde «Importar CSV» del inventario) se revirtió por precaución. La falla resultó depender del orden: la spec pasa sola con el servidor caliente (`navexp`, `navexp2`) y falla cuando corre después de otras specs en el mismo servidor, también sin ese cambio (`fin-c`); queda abierta. Las secciones del cliente no usan pasos internos del espacio Pro (los que existen en Cambios y Pendientes finales son del profesional). Specs actualizadas: round12, fix13, appointment-reminders, appointment-reschedule, daily-logs, request-followups, work-client-invite, work-files, work-updates. Propiedad: `scripts/ci/verify-app-surface-ownership.mjs` → `pro-fix14.spec.ts`.

### 3. Gantt
- La línea «Hoy» se dibuja encima de las barras (capa propia `z-15`, sin capturar clics), así una tarea que cruza hoy ya no la tapa.
- Panel lateral: un trabajo sin fechas propias muestra «Plan: …» con el período del cronograma en lugar de «Sin fechas» (mismo lector que el encabezado; se actualiza al cambiar el cronograma).
- Ruta crítica: «¿Qué es la ruta crítica?» lo explica sin jerga (cadena sin margen; las demás tareas tienen margen).
- Plan del trabajo: tareas por fecha de inicio (las sin fecha al final); al editar una tarea su formulario ocupa el lugar de su tarjeta (ya no aparece dos veces).
- Cambios sin guardar: si la campana (o cualquier paso del espacio Pro) queda bloqueada por un editor, aparece un aviso fijo justo debajo del encabezado («Tiene cambios sin guardar…», «Ver cambios», cerrar).
- Reglas de dependencias a 390 px: opciones cortas («Al terminar la otra» / «Al empezar la otra») y la regla completa escrita debajo («Enchape empieza cuando Tubería termina (fin → inicio)»).

### 4. Filas del registro
- **66 (hecho):** huecos restados de un área — SQL `takeoff-deductions-local.sql`, detalle en [takeoffs-local.md](takeoffs-local.md#huecos-restados-de-un-área-ronda-14-2026-11-16).
- **39 (tajada vertical):** propuesta por partidas con aprobación del cliente por partida — SQL `quote-line-decisions-local.sql`, ruta `/api/pro/quote-line-decisions`, componente `quote-line-decisions.tsx` dentro de la versión compartida (cliente y profesional). Falta convertir lo aprobado en versión/acuerdo y el diseño tipo tablero.
- **59:** el registro estaba desactualizado (imagen y proveedor por artículo existen desde 7C). Sin código nuevo; falta especificaciones visuales y códigos de costo.
- **68:** no implementado (ver registro): publicar un trabajo terminado en el portafolio requiere copiar fotos privadas a almacenamiento público y decidir el consentimiento del cliente.

### Defectos encontrados durante la ronda
- El historial de decisiones por partida bloqueaba también `delete`, y con eso la limpieza en cascada de cuentas de prueba falló una vez («Database error deleting user»). Ahora solo bloquea `update` (igual que los demás historiales Pro); la cuenta de prueba que quedó se eliminó a mano en la base local.
- En la página del cliente, un clic antes de la hidratación no hacía nada (la página se pinta en el servidor); la prueba espera a que cargue el resumen.
- La primera versión del resultado de Mediciones agregaba `deductFrom: null` a todas las mediciones y rompía la igualdad estricta de `pro-takeoffs`; ahora una medición sin huecos devuelve exactamente las claves de antes.
- En WebKit, volver a la lista con una carga completa de documento producía «Loading chunk app/[locale]/layout failed» en el servidor de desarrollo; ahora es navegación interna (`router.replace`).

### Verificación
- `tsc` EXIT 0; ESLint `--max-warnings=0` en los 36 archivos tocados EXIT 0; `local-sql-manifest --check` EXIT 0; `verify-local-preparation-manifest` PASS (179 módulos, 180 pasos, 542 dependencias); `verify-local-preparation-db` PASS (179 módulos en PGlite); `verify-app-surface-ownership` «Verified regression ownership for 86 pages and 284 route handlers.»; deriva 1148 funciones, `stale: []`, 6 parches esperados.
- SQL: `$S/fix14-sql/fix14-test.sql` 44 PASS / 0 FAIL; regresión fix13, round4a–round12, round8-roles y security: todas 0 FAIL (`$S/fix14-sql/reg/summary.txt`).
- Playwright `pro-fix14` (servidor nuevo): chromium-desktop 4/4 (`regc`, `rerc`, `fin-c`); webkit-mobile 4/4 (`fin-w`, después de pasar a navegación interna; `regw`/`rerw` 3/4 por el error de carga de chunk descrito arriba).
- Regresión chromium-desktop (`regc`, 21 specs): 17 verdes. Repetidas: appointment-reminders 2/2 (`rerc`, `fin-c`; se subió a 60 s la espera del diálogo del profesional), takeoffs 2/2 (`rerc`, tras corregir el resultado). Abiertas: `pro-project-planning` (espera `vistaTrabajo` en la consulta y el diálogo del trabajo; el trabajo es página propia desde la Ronda 9 y esta spec no se corría desde la 7A: falla previa, no se tocó) y `pro-navigation` (pasa sola, falla tras otras specs; ver arriba).
- Regresión webkit-mobile (`regw`, 14 specs): 11 verdes. work-files repetida 3/3 (`rerw`). appointment-reminders: el recorrido completo pasa; la comprobación final de errores recibe avisos de WebKit «… due to access control checks» de peticiones de `/notificaciones` canceladas al navegar (es/en alternan; esta spec no tenía corridas previas en WebKit para comparar). round12 6/6 en `regw`; en `fin-w` 5/6 por un clic de «Planos de planta» (dueño, sin cambios en esta ronda).
- Capturas revisadas en `$S/fix14-shots/` (ES/EN, 1440 y 390 px): tablero tras mover, Gantt con «Hoy», reglas a 390 px, plan en edición, aviso de cambios sin guardar, Mediciones con hueco, «Mi proyecto» y su tarjeta de mensajes, propuesta por partidas.

### Pendiente (honesto)
- Fila 68 (portafolio desde trabajos y métricas del perfil) y la parte visual de la fila 59: no implementadas.
- Fila 39: convertir lo aprobado por partida en versión o acuerdo; varias fotos por partida.
- Fila 66: recortar el hueco dibujándolo dentro del área.
- `pro-project-planning` desactualizada desde la Ronda 9; `pro-navigation` dependiente del orden; avisos de WebKit en appointment-reminders.
- «1 Issue» de Next: no reproducido; sin cambios.

## Ronda de cierre (2026-11-16)

Entradas: puntos abiertos de la Ronda de correcciones 14, regresión completa de todas las specs Pro en chromium-desktop y webkit-mobile, regresión SQL completa y los hallazgos de la revisión de seguridad paralela (M1, M2, B1–B4). Respaldos en `$S/close-backup/`; registros en `$S/close-logs/` (matriz: `$S/close-logs/matrix.md`); SQL en `$S/close-sql/`.

### 1. Puntos abiertos de la Ronda 14
- **a. `pro-project-planning` (spec desactualizada).** Desde la Ronda 9 el trabajo es página propia (`/dashboard/pro/trabajo/<id>/<sección>`) con su propio «Atrás» (`data-native-back="page"`). Se actualizó la spec: la sección se lee de la ruta (o de `vistaTrabajo` en la forma vieja) y «Atrás» acepta el botón de la página. Sin cambios en la app.
- **b. `pro-navigation` dependía del orden — causa real en la app.** El traza mostró que «Cerrar» del importador CSV se ignoraba: `CatalogImport` no cerraba mientras `saving` era verdadero, y en Productos y servicios `saving` incluye la recarga de la lista (`loading`), que tras Atrás/Adelante tarda varios segundos con el servidor recién iniciado (con el servidor caliente terminaba antes del clic; por eso pasaba sola). Corrección (`catalog-import.tsx`): cerrar solo espera la escritura propia del importador (`lock`), y «Cancelar» se deshabilita solo durante esa escritura. Pasa después de `pro-fix14` en servidor nuevo (chromium y webkit).
- **c. Avisos de WebKit «… due to access control checks».** Las peticiones ya se atrapan en la app (`use-direct-message-unread` usa `.catch`); WebKit las reporta como `pageerror` cuando una recarga cancela peticiones en vuelo, y una recarga de documento no desmonta React (no hay `AbortController` que aplique). No es corregible en la fuente; la spec usa ahora el filtro estrecho existente `onAppPageError` (solo el mensaje exacto de WebKit, mismo origen o el Supabase local, y solo cerca de una navegación). El mismo cambio se aplicó mecánicamente a 58 specs Pro que coleccionaban `pageerror` a mano (en WebKit también recibían el «Type error» de las métricas de React en desarrollo, que el mismo helper ya ignora solo con esa pila exacta).
- **d. `pro-round12` en WebKit — causa real en la app.** No era el clic de «Planos de planta»: tras «Guardar plano», la recarga posterior (`load(id)`) terminaba después de «Nivel nuevo…» y reemplazaba el nivel nuevo por el plano guardado (botón «Guardar plano» deshabilitado, nombre del nivel perdido). Corrección (`work-floor-plans.tsx`): cada edición incrementa un contador y una recarga que empezó antes de una edición refresca la lista pero ya no reemplaza lo que el usuario está dibujando.

### 2. Revisión de seguridad (M1, M2, B1–B4)
- **M1:** `GET /api/pro/accounting-export` ahora exige dueño, Administrador o Gerente (`proInternalFinanceDenied`, 403 `pro_role`) y tiene límite de 10/min por cuenta. No se agregó una capacidad nueva a la matriz de la puerta (`pro_role_allows`): la regla vive en la ruta, como en la Ronda 13.
- **M2:** 403 para Integrante y Solo lectura en `work-costs`, `work-budget`, `GET purchase-orders` y `purchase-order-print`; respuestas sin costo en `work-overview?part=finance` (`costCents`, `committedCents`, `resultCents`, `resultWithCommittedCents` = `null`, `costsHidden`), `time-report` (sin columna «Costo (CRC)» en el CSV), `time-tracking` (costo por hora, por registro y total en `null`; `activity_save` → 403 para no sobrescribir un costo que no ven) y `private-estimates` (todas las vistas `GET` sin `unitCostCents`). Interfaz: aviso «Su rol en esta empresa no permite ver costos internos, márgenes ni órdenes de compra» (ES/EN) en Costos y pagos y Órdenes de compra, el resumen del trabajo explica en lugar de «₡0», Horas oculta la tarjeta de costo y las actividades. Documentado en `docs/pro/team-roles-local.md` (punto 13).
- **B1:** `revoke delete, truncate` a `service_role` en `pro_quote_line_decisions`, `pro_quote_line_decision_history`, `pro_quote_line_decision_actions` y `pro_work_takeoff_deduction_actions` (más `update` en esta última). El borrado de cuentas sigue en cascada (las acciones referenciales corren como dueño de la tabla); las limpiezas de cuentas de prueba de toda la regresión lo ejercitan.
- **B2:** «un hueco no se cotiza solo» se comprueba dentro de `pro_work_takeoffs_mutate` (rama `send_estimate`, hint `pro_takeoff_opening`) bajo el bloqueo por trabajo; `pro_work_takeoff_deduction_mutate` toma ese mismo bloqueo. La ruta ya no hace la comprobación aparte.
- **B3:** `POST /api/pro/quote-line-decisions` responde 403 `pro_workspace_member` cuando quien decide trabaja dentro del espacio de otra empresa.
- **B4:** los límites nuevos (reportes, reportes financieros, exportación de clientes y contable, fuentes de órdenes de compra, seguimiento de selecciones, vista previa de cronograma, autocompletar bitácora, decisiones por partida) usan `proAccountRateLimit` (cuenta + integrante firmados por la puerta), no la IP que manda el navegador.
- Prueba: `tests/e2e/pro-close-security.spec.ts` (Solo lectura e Integrante → 403 / `null`; Gerente y dueño sin cambios; B3; B4 con `X-Forwarded-For` variable) y `$S/close-sql/close-test.sql`.

### 3. Defectos encontrados por la regresión completa
- **Confirmaciones sin nombre accesible fuera del espacio Pro.** `useAppDialog` oculta el encabezado y el `Modal` solo ponía el título como `aria-label` cuando administraba el foco; en «Mi proyecto» del cliente y en la página del trabajo las confirmaciones («¿Aceptar el nuevo total?», «¿Enviar a firmar?») no tenían nombre. Ahora siempre se nombran por su título (`src/hooks/use-app-dialog.tsx`). Lo detectaron `pro-round4b-leftovers` y `pro-round6b-esign`.
- **Opciones de una tarea tapadas por el pie fijo (390 px).** En la página del trabajo, el menú «⋯» de la última tarea se abría hacia abajo bajo el pie fijo («Editar trabajo») y «Historial» quedaba inalcanzable. Ahora se abre hacia arriba y por encima del pie (`work-tasks.tsx`). Lo detectó `pro-work-tasks` en WebKit.
- **Centro de tareas negado a cuentas Pro sin perfil del directorio.** `pro_task_center_filtered_read` y `pro_task_center_filter_options` (Ronda 9, `task-center-filters-local.sql`) usaban `pro_appointment_enabled`; el resto de herramientas del trabajo usa `pro_private_work_tools_enabled` desde `private-work-tools-access-local.sql`. Se alinearon (dependencia agregada al manifiesto). Lo detectó `pro-private-work-tools-journey` (403 en `/api/pro/task-center?view=planning`).

### 4. Specs actualizadas por estar desactualizadas (no por fallas de la app)
- «Mi proyecto» (Fix 14): `pro-appointment-requests`, `pro-appointment-notices`, `pro-client-english`, `pro-delivery-acknowledge-recovery`, `pro-request-quote-journey`.
- IVA 13 % en líneas nuevas de factura (Ronda 11) y emisor prellenado (Ronda 7A): `pro-catalog-item-types`, `pro-client-fiscal`, `pro-invoice-tax` (las líneas que la prueba quiere «Por definir» se marcan así), `pro-invoice-preparation`.
- Trabajo como página (Ronda 9) y tarjeta «Horas»: `pro-round2-ux`.
- Fecha fija ya pasada: `pro-scoped-panels` (franja disponible 2026-11-15 → 2030).
- Carreras de la prueba (medir dos cajas en momentos distintos, buscar antes de que el formulario se monte, compilación en frío del servidor de desarrollo): `pro-catalog-organizations`, `pro-scoped-panels`, `pro-modal-localization-journey`, `pro-round4a`, `pro-quote-change-requests` (recarga del cliente por compilación).
- `tests/e2e/helpers.ts`: el overlay de desarrollo de Next (`<nextjs-portal>`) se oculta del diseño en las pruebas (`hideNextDevOverlay`; en 390 px tapaba botones de pie, no es UI de la app) y `retryInterruptedNavigation` repite una vez un `page.goto` interrumpido por la navegación tardía de la página anterior en WebKit (misma regla que `gotoOK`); se usan en `pro-quote-ux`, `pro-local-integration`, `pro-scoped-panels` y `pro-usability`. `pro-simplified-navigation` reintenta el clic que WebKit pierde antes de la hidratación; `pro-appointment-reminders` reintenta su `goto` igual que `gotoOK`.

### 5. Verificación
- Regresión E2E completa (286 specs `tests/e2e/pro-*.spec.ts`, `playwright.pro-local.config.ts`, `--workers=1`, servidor reiniciado cada 9 specs): matriz en `$S/close-logs/matrix.md`. Resultado final por spec: **chromium-desktop 262 PASS / 24 FAIL; webkit-mobile 262 PASS / 24 FAIL**. Las 24 que quedan en cada proyecto son exactamente las specs con una prueba que exige el entorno psql nativo (`PRO_LOCAL_PSQL`/`PGPASSWORD`; «Local PostgreSQL test gate credentials are required»), que esta ronda no podía cargar (solo `qa2-envonly.zsh`); el resto de las pruebas de esas specs pasa (lista en `$S/close-logs/gated.txt`). No se repitieron porque fallan por entorno de forma determinista (salvo `pro-private-work-tools-access-api` en chromium, que además fallaba por el centro de tareas y tras la corrección quedó 4 pasan / 1 del entorno). Toda otra falla se repitió en servidor nuevo (`rer1`…`rer6`) hasta quedar verde.
- Las specs mapeadas en `verify-app-surface-ownership.mjs` que no son `pro-*` (p. ej. `admin-smoke`, `public-smoke`, `direct-chat`) quedan fuera de `testMatch` de `playwright.pro-local.config.ts`; no se corrieron con esta configuración.
- SQL (`$S/close-sql/summary.txt`): `close-test` 27 PASS / 0 FAIL (B1, B2, centro de tareas), fix14, fix13, round4a–round12, round8-roles y security: todas `exit 0`, 0 FAIL.
- Deriva: 1148 funciones, 1142 ok, `stale: []`, 6 parches esperados. `verify-local-preparation-manifest` PASS (179 módulos, 180 pasos, 543 dependencias); `verify-local-preparation-db` PASS (179 módulos en PGlite); `local-sql-manifest --check` EXIT 0; `verify-app-surface-ownership` «Verified regression ownership for 86 pages and 284 route handlers.»; `tsc` EXIT 0; ESLint `--max-warnings=0` en los 115 archivos tocados EXIT 0.
- Entorno: al reiniciar, `next dev` a veces imprime un aviso de actualización de seguridad de Next y se detiene una vez; el script de la regresión (`$S/close-pw.zsh`) ahora comprueba que quede un servidor estable y lo vuelve a iniciar. Varias specs de WebKit fallaron por eso (`ECONNREFUSED`) y pasaron al repetir. No se actualizó Next.

### Pendiente (honesto)
- 24 specs con pruebas del entorno psql nativo sin ejecutar en esta ronda (ver arriba); necesitan el entorno nativo para cerrarse.
- Capacidad propia «finance.read» en la puerta de roles (hoy la regla de costos vive en cada ruta).
- Varias specs dependen de tiempos del servidor de desarrollo en frío (se subieron esperas puntuales); en WebKit, la navegación tardía de la página anterior se maneja con un reintento (`retryInterruptedNavigation`, igual que `gotoOK`).
- Siguen abiertos los pendientes de la Ronda 14 (filas 68, 59 visual, 39 y 66 parciales).

## Ronda F1-A (2026-11-19)

Fila 55 del registro (informes contables y antigüedad de deuda). Línea de prueba `local/launch-directorio`, Pro apagado en producción (`PRO_ENABLED=false` sin cambios). Referencia funcional: informes financieros, cuentas por pagar y flujo de caja de Houzz Pro (solo el modelo; sin copiar textos ni diseño). Nada se paga, envía ni declara.

### Qué se construyó
- **Cuentas por pagar** (Estadísticas › Reportes): reutiliza lo existente sin duplicar montos. Los gastos (`pro_internal_expenses`) ya son facturas de proveedor con vencimiento y pagos propios; una orden de compra emitida pasa a por pagar cuando se registra la factura del proveedor (número, fecha, vencimiento). La tabla nueva `pro_payable_bills` guarda solo número, fechas de la factura de la orden, nota y el estado anulada (con motivo). Estados pendiente/parcial/pagada/anulada; vencida = con saldo y vencimiento antes del día CR. Antigüedad 0–30/31–60/61–90/90+ por proveedor o subcontratista (días desde la fecha de la factura o del gasto, igual que las cuentas por cobrar) más lo vencido. «Registrar pago» valida la factura y delega en los escritores existentes (`pro_expense_meta_save` 'payment' y `pro_purchase_orders_mutate` 'pay') con el mismo actionId: saldos, recibos e historial siguen en su módulo; los reversos se hacen en Gastos u Órdenes de compra. Anular solo sin pagos (motivo, se puede restaurar). Filtros estado/proveedor/solo vencidas, lista de órdenes sin factura, CSV por proveedor y de la lista.
- **Flujo de caja**: por semana (lunes) o mes. Entradas reales = pagos recibidos (sin revertidos, el mismo «cobrado» de los reportes); esperadas = saldo de cada borrador de factura en su vencimiento (fecha prevista o de creación + días de crédito) y cuotas abiertas de planes de pago (los borradores de cuota no se cuentan dos veces). Salidas reales = pagos de gastos y de órdenes (un reverso resta en su día) y devoluciones a clientes; esperadas = cuentas por pagar. Lo vencido se ubica hoy y se resalta en el período actual y en «Vencido a hoy». Saldo acumulado con saldo inicial opcional (solo en pantalla). CSV.
- **Estado de resultados**: por mes/trimestre/año y por trabajo. Ingresos = borradores de factura no archivados sin IVA por su fecha de creación; costos = gastos sin IVA cuando se conoce la tarifa (por categoría, anulados fuera), costo interno de horas registradas y facturas de órdenes sin impuesto; cobrado aparte (informativo). Rotulado como reporte de gestión, no declaración de impuestos. CSV.
- Solo CRC: el modelo de gastos y órdenes es CRC (`currency='CRC'`); no se inventó USD.

### Archivos
- SQL `docs/pro/sql/payables-cashflow-local.sql` (en el manifiesto tras `pro-work-activity-local.sql`, 12 dependencias). Lectores `pro_payables_read`, `pro_cash_flow_read`, `pro_income_statement_read` y escritor `pro_payables_mutate`: security invoker, `search_path` fijo, solo service_role, RLS en las tablas, recibos por actionId, CAS por revisión, historial y recibos inmutables (y sin update/delete para service_role).
- Rutas `src/app/api/pro/{payables,cash-flow,income-statement}/route.ts` (desarrollo; dueño, Administrador y Gerente por `proInternalFinanceDenied`; límites por cuenta; mismo origen en POST); dueño de regresión `pro-payables-cashflow.spec.ts` en `verify-app-surface-ownership.mjs`.
- `src/lib/pro/payables.ts`, `src/components/pro/payables-cashflow.tsx`, pestañas nuevas en `src/components/pro/pro-reports.tsx` (la barra de pestañas se desplaza en el teléfono en lugar de ocupar tres filas).
- Pruebas: `scripts/pro/verify-payables-cashflow-db.mjs` (PGlite en memoria con todo el manifiesto), `tests/e2e/pro-payables-cashflow.spec.ts`.
- Migración: no se creó `supabase/migrations/291_pro_payables_cashflow.sql`. Ningún módulo Pro vive en `supabase/migrations` (las tablas `pro_purchase_orders`, `pro_internal_expenses`, etc. no existen en producción), así que esa migración fallaría al desplegarse; el módulo sigue el patrón de sus vecinos (`docs/pro/sql` + manifiesto). Aplicado solo a la Supabase local (loopback 127.0.0.1:54322, `exit 0`).

### Verificación
- SQL `node scripts/pro/verify-payables-cashflow-db.mjs`: **132 PASS / 0 FAIL** (estados, antigüedad, vencidas, filtros, recibos/CAS/historial, pagos por los escritores de Gastos y Órdenes, anular/restaurar, flujo real vs esperado, vencido hoy, saldo acumulado, semana/mes, estado de resultados por período y trabajo, 42501 sin Pro, lectores sin escrituras, solo service_role, reaplicación).
- E2E `pro-payables-cashflow` ES/EN: **chromium-desktop 2/2, webkit-mobile 2/2** (servidor de desarrollo propio en 3201 sobre una copia de `src`, Supabase local). Cubre API (200/409/400/403, réplica idéntica), registrar factura y pagar desde la UI, filtros, CSV (BOM, montos planos), flujo de caja con saldo inicial y por semana, estado de resultados, Solo lectura → 403.
- `tsc` EXIT 0; `verify-display-quotes` PASS; `text:check`, `lint:i18n`, `lint:vocabulario`, `audit-browser-storage` PASS; `test:surface-ownership` 128 páginas / 340 rutas; `verify-local-preparation-manifest` PASS (211 módulos); ESLint sin avisos en los archivos tocados.
- Capturas revisadas (escritorio e iPhone): `$S/ux/pro-fin/payables/` (`payables-*`, `payables-bill-dialog-*`, `payables-pay-dialog-*`, `cashflow-*`, `income-*`). Ajustes tras revisarlas: etiquetas de los selectores sin partirse, montos del estado de resultados sin cortar el signo en el teléfono, campo de saldo inicial más ancho.

### Pendiente (honesto)
- `verify-local-preparation-db.mjs` falla hoy por `cost-codes-local.sql` (Ronda F1-B: espera 10 funciones `pro_work_budget_%` y encuentra 17); no depende de este módulo.
- Si la misma compra se registra como gasto y como factura de una orden, el estado de resultados la cuenta dos veces (se avisa en pantalla); no hay enlace gasto↔orden.
- Las entradas reales usan los pagos de factura (`pro_invoice_payments`); un abono del libro del trabajo sin pago de factura no aparece como entrada.
- Sin USD, sin libro mayor, conciliación bancaria ni declaración (fuera de alcance por decisión).

## Ronda F1-B (2026-11-19)

Alcance: fila 54 del [registro](houzz-parity-register-local.md) («Presupuesto por códigos y desviaciones previstas»). Referencia funcional: «Budget» y códigos de costo de Houzz Pro, sin copiar textos ni diseño. Pro sigue apagado en producción (`PRO_ENABLED=false`); las rutas nuevas conservan el segundo candado `NODE_ENV==='development'` + Supabase local.

### 1. Qué se construyó
- **Biblioteca de códigos de costo de la empresa** (Empresa › Categorías › «Códigos de costo», `cost-code-library.tsx`): grupos y códigos de dos niveles con unidad, tarifa de IVA (13 % general, 4, 2, 1, 0,5, 0 %, exenta, 0 % sin crédito — las tarifas de cotizaciones/facturas) y markup predeterminados. Crear, editar, archivar (los códigos de un grupo antes que el grupo) y restaurar (el grupo antes que sus códigos); búsqueda; capacidad 500. **Lista inicial propia** de 55 códigos para construcción y remodelación en Costa Rica (10 grupos: preliminares y trámites, obra gris, techos, eléctrica, mecánica, acabados, carpintería, cocina y baños, exteriores, indirectos), en ES o EN, con selección por código; el grupo se agrega solo; un código que ya existe se omite. **Copia desde un proyecto** (`import_work`): los códigos del presupuesto de un trabajo pasan a la biblioteca y quedan vinculados.
- **Aplicar códigos a un presupuesto** (Finanzas › «Presupuesto y previsión» › «Aplicar códigos de la biblioteca»): crea los que faltan con costo previsto ₡0 **a través de `pro_work_budget_mutate`** (misma validación, revisión, capacidad e historial inmutable que el diálogo existente); un código que ya existe con el mismo número se **vincula** sin cambiar su nombre, grupo, monto previsto ni costos asignados; tipo distinto o archivado se omite. Identidades derivadas con forma RFC 9562 (los lectores estrictos de UUID las aceptan) y reintento idempotente.
- **Markup e IVA por partida** (`pro_work_budget_line_settings`): costo, markup (% y ₡), IVA (tarifa y ₡), venta sin IVA y total con IVA por partida, grupo y total; edición en línea con vista previa y «Aplicar a todas las partidas activas». Redondeo por línea (medio hacia afuera), igual en SQL y en la vista previa.
- **Previsión integral** (pestaña «Previsión»): comprometido (órdenes de compra no canceladas), real (fuentes del presupuesto), estimado al terminar = mayor(comprometido, real) + lo previsto por gastar, «Previsto − estimado», % consumido con barra y estados En rango / Cerca del límite (≥ 90 %) / Sobre lo previsto / Tiempo sin valorar (desviación incompleta) / Sin movimiento; avisos arriba; órdenes y costos sin código se suman al total. La desviación sigue siendo sobre costo.
- **Resumen para el cliente**: «Compartir con el cliente» (confirmación: «ContrataCR no envía nada») guarda una foto inmutable con los grupos activos y los totales de venta (subtotal, IVA, total). El cliente vinculado lo ve en «Mi proyecto» (`client-budget-summary.tsx`, misma audiencia que los demás lectores: solicitud confirmada/completada, también en la vista previa «Vista del cliente»). Nunca recibe costo, markup, comprometido, real ni nombres de partidas. Si el presupuesto cambia, el dueño ve «El cliente sigue viendo la versión anterior» y «Actualizar lo que ve el cliente»; «Dejar de compartir» lo oculta; historial con «Reemplazado» / «Se dejó de compartir». Sin correos, mensajes ni notificaciones.
- Roles: costos, markup y biblioteca solo para dueño, Administrador y Gerente (`proInternalFinanceDenied`, aviso `ProRoleCostNotice`); el lector del cliente usa `proCustomerReader`.

### 2. Archivos
- SQL: `docs/pro/sql/cost-codes-local.sql` (aditiva; no cambia tablas ni funciones de `work-budget-local.sql`; funciones nuevas con prefijo `pro_cost_code_*`, así `pro_work_budget_%` sigue con sus 10). Solo módulo Pro local: no va en `supabase/migrations` (las tablas Pro no existen en test/producción). Manifiesto `scripts/pro/local-sql-manifest.mjs` (paso + 5 dependencias). Aplicada solo al Supabase local (repetida, idempotente).
- API: `src/app/api/pro/cost-codes/route.ts`, `src/app/api/pro/work-budget-forecast/route.ts`; contratos `src/lib/pro/cost-codes.ts`.
- UI: `src/components/pro/cost-code-library.tsx`, `work-budget-forecast.tsx`, `client-budget-summary.tsx`; inserciones puntuales en `job-workspace.tsx` (vista `budget`), `business-panel.tsx`, `company-hub.tsx` (tarjeta en Categorías en lugar del aviso «se definen dentro de cada proyecto»), `client-work-sections.tsx`, `src/lib/pro/job-route.ts` (sección `budget` de la ruta del trabajo).
- Pruebas: `scripts/pro/verify-pro-cost-codes-db.mjs` (PGlite, manifiesto completo, parsea cada lectura con los esquemas estrictos de la API), `tests/e2e/pro-cost-codes.spec.ts`; dueños de regresión de las dos rutas en `scripts/ci/verify-app-surface-ownership.mjs`; `pro-job-workspace.spec.ts` (+1 botón intencional en el espacio Pro independiente).

### 3. Verificación
- `npx tsc --noEmit -p .` EXIT 0; ESLint `--max-warnings=0` en los archivos nuevos y tocados: 0.
- `verify-display-quotes` PASS; `text:check` PASS; `lint:i18n` PASS (presupuesto bilingüe sin cambios, 398 en 60 archivos); `lint:vocabulario` PASS; `audit-browser-storage` PASS (106 archivos; la función nueva no usa almacenamiento del navegador); `test:surface-ownership` «128 pages and 340 route handlers».
- SQL: `scripts/pro/verify-pro-cost-codes-db.mjs` **8/8 grupos PASS** (PGlite con el manifiesto completo; cada lectura se parsea con los esquemas estrictos de la API); `verify-local-preparation-manifest` PASS (211 módulos, 212 pasos, 653 dependencias); `verify-local-preparation-db` PASS (211 módulos instalados y reaplicados; `pro_work_budget_%` = 10); `verify-work-budget.mjs` 11/11.
- E2E `tests/e2e/pro-cost-codes.spec.ts`: **4/4 PASS** (ES/EN × chromium-desktop y webkit-mobile), servidor `next dev` con Pro de desarrollo en una copia de trabajo temporal (el candado de `next dev` impide un segundo servidor en el mismo directorio). Cubre: contrato y acceso (400, 401, 403 de otra empresa y del cliente, origen), biblioteca (lista inicial, nuevo código, duplicado, archivar/restaurar), aplicar con vínculo, markup/IVA con vista previa, previsión con orden de compra y horas, compartir/obsoleto/actualizar/revocar, vista del cliente sin costos y sin notificaciones.
- `pro-job-workspace.spec.ts`: se actualizó el conteo intencional (+1, «Presupuesto y previsión»), pero la spec falla antes, en la línea 49 (encabezados «Empresa / Biblioteca / Gestión» de `?tab=pro_tools`), una pantalla que esta ronda no toca: deriva previa, no corregida aquí.
- Capturas (escritorio y iPhone, ES/EN): `$S/ux/pro-fin/budget/` (48 archivos: biblioteca, lista inicial, editor, tarjeta de Empresa, aplicar, precio de venta, editor de markup, previsión, compartido y vista del cliente).

### Pendiente (honesto)
- **Sincronización documental** (única brecha que deja la fila en P): crear o actualizar el presupuesto desde una cotización aceptada u orden de cambio, y llevar el markup de vuelta a la cotización.
- La biblioteca no edita en lote ni importa CSV; los montos previstos se siguen editando en el diálogo existente (Costos y pagos › Presupuesto), al que lleva «Editar códigos y costos previstos».
- El resumen del cliente es una foto: no se actualiza solo (decisión intencional; el dueño decide cuándo compartir de nuevo).

## Ronda F1-C (2026-11-19)

Filas 43 y 45 del registro. Referencia funcional: estimaciones de Houzz Pro con costo/recargo/margen y plantillas de documento (sin copiar textos ni diseño). Sin commits, envíos, cobros ni emisión fiscal; `PRO_ENABLED` sin cambios (producción sigue con Pro apagado). Respaldos previos: `$S/f1c/backup/`.

### 1. Costo interno, ganancia, margen y recargo por línea (fila 43) — hecho
- El costo unitario interno y el margen por línea ya existían (Ronda 4A). Nuevo en el editor (`private-estimate-editor.tsx`): por línea costo, **ganancia**, margen % y **recargo %**; ayudante "Recargo sobre el costo (%)" con "Usar como precio unitario" (precio = costo × (1 + recargo), antes del descuento de la línea); por **sección** costo y ganancia (margen %) bajo cada subtotal; total interno "Costo de las líneas con costo" y "Ganancia y margen (antes de impuestos)".
- Roles: solo dueño, Administrador y Gerente (`useProInternalFinance`, la misma regla que Costos y pagos). Integrante y Solo lectura no ven campos de costo, ganancia ni recargo (la API ya les quitaba `unitCostCents`). Defensa adicional en `POST /api/pro/private-estimates`: si un rol sin finanzas llegara a guardar, el servidor ignora el costo que envíe y conserva el costo guardado de cada línea (misma id), y la respuesta no trae `unitCostCents` (hoy la puerta solo da `sales.write` a Administrador y Gerente, así que esos roles reciben 403; probado).
- Nunca al cliente: la versión compartida se arma campo a campo en SQL sin costo; probado en SQL (contenido guardado, lectura del cliente, propuesta por partidas de ambos lados, cotizaciones del proyecto, finanzas, lista de versiones del cliente) y E2E (texto de la página del cliente, **todas** las respuestas JSON que la página del cliente lee, el impreso y el contenido guardado).

### 2. Secciones en las versiones compartidas (fila 43) — hecho
- Las líneas ya llevaban su sección en la versión compartida (arreglo del 2026-11-17). Ahora el documento del cliente (`private-estimate-publication-document.tsx`, también en "Cotización aceptada" del trabajo) muestra el total de cada línea y el **subtotal de cada sección**, como el PDF y el impreso.
- La propuesta por partidas (`quote-line-decisions.tsx`) agrupa las tarjetas por sección con su subtotal y lo aprobado de la sección; la aprobación por línea no cambió. SQL: `pro_quote_line_decisions_read` devuelve `group` (o null) por línea.

### 3. Plantillas de documento (fila 45) — hecho
- "Documentos con su marca" (`document-branding.tsx`) agrega "Plantilla de sus documentos": diseño **Clásica / Moderna / Compacta**, posición del logo (izquierda, centro, derecha), **color de acento** de los mismos 4 colores (o igual al color de sus documentos), papel (según la impresora = como hasta ahora, Carta, A4), mostrar/ocultar códigos de línea y CABYS, precios unitarios, desglose de impuestos, espacio para la firma, condiciones de pago y notas, y **condiciones y notas predeterminadas por tipo de documento** (cotizaciones, facturas, órdenes de cambio y de compra, contratos, estados de cuenta, planes de pagos, recibos, hojas de selecciones), y "Volver a la plantilla predeterminada".
- **Vista previa antes de guardar**: las plantillas impresas reales (`quotePrintHtml`, `invoicePrintHtml`) con datos de ejemplo (`document-template-preview.ts`) pasan por el mismo `applyDocumentBranding`, en un iframe aislado (sin scripts). Se quitó el texto HTML "ContrataCR Pro" de la vista previa anterior: ahora se ve la marca aprobada del impreso (contrato de marca).
- Aplicación (`applyDocumentTemplate` en `document-branding.ts`): CSS adicional por diseño/logo/papel, campos marcados con `data-doc-field` en las plantillas (factura, cotización, orden de cambio, orden de compra, hoja de selecciones), las filas de ancho completo reducen su `colspan` cuando se oculta una columna, y las condiciones/notas del tipo van antes de la firma o del pie (texto escapado). Las 9 rutas de impresión pasan su tipo de documento.
- **Lo predeterminado imprime exactamente igual**: sin opciones (o con opciones que no tocan ese documento) el HTML es idéntico byte a byte; E2E compara la cotización y la factura impresas antes de guardar marca y después de guardar la plantilla predeterminada (iguales salvo el nonce aleatorio). Las plantillas solo agregan marcadores `data-doc-field`/`data-invoice-print` sin efecto visual.
- SQL `docs/pro/sql/quote-cost-templates-local.sql` (aditivo; módulo Pro local, no va en supabase/migrations porque las tablas Pro no existen en test/producción): columna `pro_document_branding.template` (objeto JSON, por defecto `{}`), `pro_document_branding_template_json` (validación estricta, 22023, devuelve la plantilla completa), `pro_document_branding_json`/`_save` (clave `template` opcional; las llamadas de la Ronda 9 conservan la guardada; mismo CAS 40001, recibos idempotentes e historial inmutable) y `pro_quote_line_decisions_read` con `group`. Registrado en `scripts/pro/local-sql-manifest.mjs`; aplicado solo al Supabase local.

### Comandos y resultados
- `npx tsc --noEmit -p .` → 0. ESLint `--max-warnings=0` en los 25 archivos tocados → 0. `verify-display-quotes` PASS; `text:check`, `lint:i18n` (398 en 60 archivos), `lint:vocabulario`, `audit-browser-storage` (106 archivos) y `verify-brand-wordmark` PASS. `test:surface-ownership`: "Verified regression ownership for 128 pages and 340 route handlers" (esta ronda no agrega rutas; a media ronda falló por una ruta `cash-flow` de la fila 55, en curso en paralelo). `local-sql-manifest --check` → 0; `verify-local-preparation-manifest` PASS (211 módulos, 212 pasos, 653 dependencias). `verify-local-preparation-db` (PGlite) se detuvo en una comprobación de la fila 54 en curso en paralelo (`pro_work_budget_%` 17 funciones, esperaba 10); no es de esta ronda. La herramienta de deriva `$S/r8-sql/drift.mjs` ya no existe.
- SQL (loopback, `begin … rollback`): `$S/f1c/sql/f1c-test.sql` **25 PASS / 0 FAIL** (plantilla predeterminada, guardado de la Ronda 9 sin plantilla, normalización, conservar la plantilla, lector de impresión, 22023 por diseño/logo/acento/papel/clave/campo/tipo/texto largo/carácter de control, rechazo sin cambios, 40001, réplica e historial inmutable, aislamiento y 42501, permisos solo `service_role`, restricción de la columna; costo visible solo al dueño; secciones en la versión del cliente y en la propuesta por partidas; **el costo nunca llega al cliente** en la versión guardada, la lectura del cliente, la propuesta de ambos lados, cotizaciones y finanzas del proyecto y la lista de versiones; aprobación por línea con secciones). Regresión: `fix14-test` 44/0. `round9-test` 50/1: la falla es la matriz de capacidades de la puerta (`pro_role_route_capability`, p. ej. `POST /api/pro/notifications` = `work.write`), que este módulo no toca.
- Migración aplicada solo al Supabase local (`node $S/f1c/apply-one.mjs`), y reaplicada sin error (idempotente).
- Playwright (`playwright.pro-local.config.ts`, workers 1, servidor de desarrollo con Pro de una copia en `$S/f1c/mirror`, porque `next dev` no admite un segundo servidor en el mismo directorio y el de 3198 corre con Pro apagado): **`pro-quote-margin-templates` (nueva, 5 pruebas: 1 unitaria + 2 × ES/EN) chromium-desktop 5/5, webkit-mobile 5/5**. Primeras pasadas: el editor no abría por un enlace directo (ahora con "Editar"), el Integrante no abre el editor (la puerta no le da escritura; la prueba lo admite y revisa la lista sin costo) y la prueba unitaria encontró que una plantilla con textos de otro tipo marcaba el documento (corregido: queda idéntico).
- Regresión de las specs tocadas: chromium-desktop `pro-close-security` 1/1, `pro-fix14` 4/4, `pro-invoice-management` 1/1, `pro-round9-features` 6/6, `pro-round10-features` 6/6, `pro-round4a` 4/4, `pro-private-estimate-publications-journey` 2/2, `pro-purchase-orders` 2/2; webkit-mobile `pro-round9-features` 6/6, `pro-fix14` 4/4, `pro-round4a` 4/4. Las 3 últimas fijan el puerto 3185 en su fixture: en 3203 fallaron por el origen y pasaron en 3185 con el mismo código.

### Capturas revisadas (`$S/ux/pro-fin/quotes/`)
60 capturas ES/EN en escritorio y iPhone (WebKit 390 px): editor con costo/ganancia/recargo por línea, ayudante de recargo, totales internos y por sección; editor de un Integrante sin costos; cotización compartida del cliente con secciones y subtotales; propuesta por partidas por sección; vista previa de la plantilla (clásica, moderna, factura); cotización y factura impresas en Clásica, Moderna y Compacta. Ajustes tras revisarlas: al ocultar precios unitarios las filas de sección quedaban una columna más anchas (ahora se reduce el `colspan`); las condiciones quedaban después de la firma (ahora antes); "aprobado ₡0" ya no se muestra.

### Pendiente (honesto)
- El PDF que descarga el cliente (`private-estimate-export.ts`, generado en el navegador) ya tenía secciones pero no usa la marca ni las plantillas; las plantillas aplican a las copias impresas del servidor.
- Las condiciones/notas predeterminadas se imprimen como bloque del documento; no se copian a las notas propias de cada cotización/factura al crearlas.
- "finance.read" sigue sin capacidad propia en la puerta de roles (regla por ruta y en la interfaz).
