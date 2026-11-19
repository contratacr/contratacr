# Cronograma, pendientes finales y horas (familias 13, 15, 21, 22; 79) — local

Fecha: 2026-11-11. Solo checkout Pro (`local/pro-suite-no-push`), base de loopback. Sin commit, push, stash ni ramas. No se envían correos, avisos ni cobros. Referencias funcionales de la ayuda pública de Houzz Pro (cronograma y línea base, lista de pendientes finales, registro de tiempo). No se copió texto, marca ni diseño: los textos son propios, en ES (usted) y EN.

## Qué se hizo

### 1. Cronograma del proyecto (Gestión › Cronograma)
- Vista nueva `schedule` en `job-workspace.tsx` (solo en el espacio Pro independiente, igual que Montos previstos, Selecciones y Órdenes de compra). Usa **los mismos datos del plan** existente (fases, período previsto, predecesoras y fechas clave). No crea otras entidades de tareas.
- **Gantt** (`src/components/pro/project-schedule.tsx`):
  - filas por fase, con barra del período y avance (completadas/total), y las tareas debajo; las tareas sin fase van en el grupo «Sin fase»;
  - fechas clave como rombos;
  - flechas de predecesoras en SVG. Si la tarea empieza antes de que termine su predecesora, la flecha sale punteada en rojo y se marca con «!»;
  - línea de «Hoy» con la fecha de Costa Rica que da el servidor;
  - escalas Días, Semanas y Meses;
  - desplazamiento horizontal dentro de su propia región, con columna de nombres fija y flechas del teclado. La página no se desborda;
  - botón «Hoy» que centra la vista.
- **Vista Lista** cronológica: es la vista inicial en pantallas de menos de 768 px y también se puede elegir en escritorio. Muestra tarjetas legibles de fases, tareas y fechas clave.
- **Edición por formulario:** se activa con Enter o clic en el nombre (las barras también responden al clic). Permite cambiar inicio, fin y fase de una tarea, y nombre y fecha de una fecha clave. Usa el escritor existente (`/api/pro/work-schedule`: `task_plan` y `milestone_save`), con la misma revisión CAS. Las predecesoras se conservan y se editan en el Plan. Mientras se edita, el formulario muestra la duración y la desviación. Las tareas sin fechas aparecen en «Tareas sin fechas», con la acción «Programar». No hay arrastre.
- **Línea base** (`docs/pro/sql/project-schedule-local.sql`):
  - «Guardar línea base» guarda una instantánea de las tareas con período y de las fechas clave activas, ligada a la revisión exacta del plan (CAS 40001→409);
  - recibo idempotente por `actionId`, con un máximo de 20 por trabajo. Si no hay nada que capturar, responde 400;
  - tablas inmutables: un disparador rechaza UPDATE y DELETE directos. Solo se permite el borrado en cascada por cuenta o trabajo (`pg_trigger_depth()>=2`);
  - se compara contra la línea base más reciente y la lista muestra las anteriores;
  - **desviación** en días civiles: inicio y fin por tarea, fin por fase (máximo de fin actual frente al de la línea base), fecha por fecha clave y fin del proyecto. Un valor positivo es atraso y uno negativo, adelanto.
- **Compartir con el cliente:** sección `show_schedule`, apagada por defecto. Usa el mismo patrón compatible que allowances y selections: columna con `default false` y clave opcional en `pro_client_dashboard_mutate`, de modo que los clientes viejos conservan el valor guardado. El cliente vinculado de una solicitud confirmada o completada ve:
  - fases con período, estado y avance;
  - un renglón «Otros trabajos» que agrupa las tareas sin fase;
  - las fechas clave.

  **Nunca** ve nombres de tareas, notas, responsables, predecesoras, líneas base, ids ni revisiones. Decisión: los títulos de tareas pueden ser internos («pagar a…»), por eso se agregan por fase.

### 2. Pendientes finales (Tareas › Pendientes finales)
- Tercera pestaña de Tareas (`vistaTareas=punch`) junto a Lista y Plan del trabajo.
- **Modelo:** cada pendiente **es una tarea existente** (`pro_work_tasks`) más un marcador 1:1, `pro_work_punch_items`, con foto opcional de los archivos del trabajo (`pro_work_files`, JPEG listo) y la regla «exigir foto antes de completar». Todo cambio de la tarea pasa por `pro_work_tasks_mutate`, con una identidad derivada y determinista por `actionId`. Por eso el historial de la tarea, los recibos, el CAS y el centro de tareas siguen siendo la única fuente. Los pendientes aparecen también en Lista y en el Centro de tareas.
- **Acciones:**
  - crear;
  - editar (CAS doble: revisión del pendiente y de la tarea);
  - completar y reabrir (completar con foto exigida y sin foto da 400);
  - archivar;
  - «Pasar una tarea» (marca una tarea abierta existente; repetirlo da 409).

  El historial y los recibos son inmutables.
- **Foto exigida en el servidor para todo escritor:** un disparador en `pro_work_tasks` (`pro_work_punch_photo_guard`) impide pasar a `done` un pendiente con «exigir foto» sin una foto JPEG lista, también desde la Lista de tareas, el Centro de tareas o un miembro del equipo (corrección de la revisión QA del 2026-11-11).
- **Contador** «X de Y completados» con barra, y filtros Todos / Pendientes / Completados. El responsable es el campo textual existente de la tarea.
- **Compartir:** se decidió una **sección configurable** `show_punchlist` en la Vista del cliente (apagada por defecto), como «Publicar» en Houzz, en lugar de mezclarla con la constancia final. Es más limpio: la constancia es un documento de cierre con su propio flujo de acuse. El cliente ve título, estado, fecha límite y foto; nunca las notas ni el responsable. La foto se sirve con `GET /api/pro/work-punchlist?image=<tarea>&requestId=` y se reautoriza en cada petición: `no-store`, `nosniff` y CSP sandbox.

### 3. Horas (Finanzas › Horas)
- Vista `time` en `job-workspace.tsx` (espacio Pro independiente y trabajo con cliente).
- **Actividades** de la cuenta, con:
  - tarifa al cliente por hora (CRC en céntimos);
  - costo interno por hora (opcional);
  - facturable por defecto;
  - archivo y restauración, con CAS por revisión.
- **Cronómetro propio:** una sola sesión activa por cuenta para todos los trabajos (índice único parcial `status='running'`). La sesión se guarda en el servidor:
  - aguanta recargas: el reloj se calcula con `started_at` y el desfase con `serverNow`;
  - es visible desde otra pestaña o trabajo;
  - la sincronizan `BroadcastChannel`, el foco y `visibilitychange`.

  Iniciar con otra sesión activa da 409.
- **Detener es idempotente:** el mismo `actionId` repite el recibo, y otra pestaña con otro `actionId` recibe 200 con `alreadyStopped:true`, sin crear una segunda línea. Los minutos redondeados son como mínimo 1. Si pasaron más de 24 h, se exigen los minutos (1–1440, no más que lo transcurrido). «Descartar» cierra la sesión sin registrar nada.
- **Entradas manuales:** fecha (hasta hoy, en hora de Costa Rica), horas («1,5»), actividad, facturable y nota.
- **Sin doble conteo:** al detener o al guardar una entrada manual se crea **exactamente una** línea `time` del modelo existente de Costos y pagos, con `pro_work_costs_mutate('add_time')`. Se usa el costo interno de la actividad, el mismo candado `work-costs:` y la revisión vigente. La entrada de horas guarda `cost_entry_id`, con índice único. Anular usa `void_time` (reverso existente, no borra). Si la línea se anula desde Costos, la entrada aparece como «Anulada» y sale de los totales de Horas. Si se **edita** desde Costos (`edit_time` revierte y crea una línea nueva), la entrada aparece como «Corregida en Costos» y Horas sigue la línea vigente (minutos y costo); «Anular» desde Horas revierte esa línea vigente (corrección de la revisión QA del 2026-11-11).
- **Totales por período** (este mes, mes anterior o rango de hasta 366 días): horas, horas facturables, monto facturable (tarifa × horas facturables), costo interno, minutos sin costo y desglose por actividad.
- No hay nómina, fichaje de terceros, facturación desde horas ni gravable.

## Archivos
- SQL nuevo:
  - `docs/pro/sql/project-schedule-local.sql`;
  - `docs/pro/sql/work-punchlist-local.sql`;
  - `docs/pro/sql/time-tracking-local.sql`.

  Se registraron en `scripts/pro/local-sql-manifest.mjs`: 3 pasos y 11 aristas.
- SQL modificado: `docs/pro/sql/client-dashboard-local.sql`, que agrega `show_schedule` y `show_punchlist` de forma aditiva y compatible. `pro_client_dashboard_client_read` no cambió.
- API (solo `development`, con actor esperado, origen, cuerpo acotado y límite de frecuencia):
  - `src/app/api/pro/project-schedule/route.ts`;
  - `src/app/api/pro/work-punchlist/route.ts`;
  - `src/app/api/pro/time-tracking/route.ts`;
  - un ayudante común, `src/lib/pro/route-common.ts`.
- Esquemas:
  - `src/lib/pro/project-schedule.ts`;
  - `src/lib/pro/work-punchlist.ts`;
  - `src/lib/pro/time-tracking.ts`;
  - `src/lib/pro/client-dashboard.ts`, con las claves opcionales nuevas.
- Interfaz nueva:
  - `src/components/pro/project-schedule.tsx`;
  - `src/components/pro/work-punchlist.tsx`;
  - `src/components/pro/time-tracking.tsx`.
- Inserciones mínimas en archivos existentes:
  - `job-workspace.tsx`: vistas y grupos;
  - `business-panel.tsx`: montaje, más `scheduleState` y `timeState` en `baseNestedBlocked`;
  - `work-tasks.tsx`: pestaña de pendientes finales;
  - `client-dashboard.tsx`: dos interruptores con ayuda;
  - `appointment-requests-workspace.tsx`: secciones del cliente.
- Pruebas:
  - `tests/e2e/pro-project-schedule.spec.ts`;
  - `tests/e2e/pro-time-tracking.spec.ts`;
  - `tests/e2e/pro-schedule-time-fixture.ts`;
  - `tests/e2e/pro-job-workspace.spec.ts`, con un cambio de expectativa intencional: el menú independiente pasa de 11 a 13 botones y se verifican Cronograma y Horas.
- Copias previas de los archivos tocados: `$S/*.before-schedule`, con `S=/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad`.

## Evidencia
Ver el informe de entrega del implementador; resumen:
- Los tres SQL nuevos y `client-dashboard-local.sql` se aplicaron dos veces en loopback con `apply-one.mjs` y dieron `ok`. El manifiesto dio `PASS: 106 SQL modules, 107 ordered steps, 142 dependencies`.
- TypeScript sin errores. ESLint sin errores ni advertencias en los archivos tocados.
- `pro-project-schedule` y `pro-time-tracking`, ES y EN, pasaron en chromium-desktop y en webkit-mobile.
- La cobertura incluye:
  - 400 por validación y claves repetidas o desconocidas; 404 y 403 para otras cuentas o para el cliente;
  - 409 por revisión vieja, segunda sesión activa, marcado repetido y anulación repetida; idempotencia por `actionId`;
  - línea base inmutable: UPDATE y DELETE rechazados, la instantánea no se mueve tras replanificar, y la desviación es +3, +1, 0 y −2 días;
  - una sola sesión activa y «detener» idempotente;
  - costos sin doble conteo: 90 → 150 → 90 → 0 → 480 minutos en `work-costs`;
  - anulación desde Costos reflejada en Horas;
  - secciones del cliente sin datos internos, que se ocultan si la solicitud se cancela;
  - en la interfaz: Gantt con barras, rombo, «Hoy», flecha y línea base; cambio de escala; edición de fecha con desviación «2 días de atraso» que persiste al recargar; lista móvil; pendientes finales con contador y recarga; cronómetro que sigue activo tras recargar, visible en otra pestaña y detenido allí sin doble registro; entradas manuales; estados vacío y de error con reintento;
  - sin desbordamiento horizontal, sin errores de página y sin filas nuevas en `notifications` ni en `notification_push_outbox`.

## Límites y pendientes honestos
- El Gantt no permite arrastrar barras, a propósito. No hay vista de calendario ni filtros por responsable o tipo. No hay jornadas laborables ni feriados, y la duración se cuenta en días civiles. Las dependencias siguen siendo informativas: no reprograman a las sucesoras.
- La línea base compara contra la más reciente. No se puede elegir una anterior como referencia.
- Pendientes finales: el responsable es el texto existente de la tarea, no la asignación real del equipo. El cliente no puede crear pendientes. No hay exportación PDF/CSV. Los pendientes también aparecen en la Lista general de tareas, porque son tareas; no hay un filtro para excluirlos.
- Horas:
  - si en Costos se cambia la **fecha** de la línea, la entrada sigue en el período de su fecha original en Horas (los minutos y el costo sí siguen la línea vigente);
  - una sesión que cruza la medianoche se registra completa en el día en que se detiene (hora de Costa Rica);
  - no se crea una factura desde las horas;
  - el cronómetro no está en una sección global de Pro, solo dentro de cada trabajo (aunque muestra la sesión activa de otro trabajo).
- Las vistas Cronograma y Horas no aparecen en `/dashboard/profesional`, igual que las demás vistas exclusivas del espacio independiente.
