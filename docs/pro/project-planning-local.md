# Planificación del proyecto y «Crear proyecto» — 2026-11-10

Solo checkout Pro, rama `local/pro-suite-no-push`. Sin commit, push, envíos ni proveedores externos. Referencia de estructura: `houzz-live-structure-2026-11-10.md` (grupo Planning > Estimates y botón Create Project). No se copian textos, marca ni diseño de Houzz.

## Qué se hizo

1. **Grupo Planificación / Planning** en el menú del proyecto (`JobWorkspace`), primero después de Resumen, con la vista **Cotizaciones / Estimates** (`vistaTrabajo=estimates`).
   - Dos listas paginadas de 20: «De este proyecto» y «Del cliente, sin proyecto asignado», con contador.
   - Cada fila muestra título, estado (Borrador, Compartida, Cambios solicitados, Aceptada, Rechazada, Retirada), importe con su moneda (CRC/USD), y avisos «Acuerdo de este proyecto» y «Tiene cambios sin compartir».
   - «Abrir cotización» abre el editor privado existente (`tab=quotes&estimacionPrivada=…&volverEstimacion=…`). Al cancelar o guardar vuelve a la vista de Cotizaciones del proyecto.
   - «Nueva cotización para este proyecto» reutiliza `PrivateEstimateAction`, con el origen `work` que ya existía (`pro_private_estimate_context` con `p_kind='work'`). El cliente queda precargado y bloqueado, el título toma el nombre del proyecto y la cotización guarda `source={kind:'work',id,fingerprint}`. No hizo falta un vínculo nuevo.
   - Un trabajo cancelado no ofrece cotización nueva, porque el contexto de origen lo rechaza.
   - El Resumen conserva sin cambios «Ver cotización» (cotización estándar o anterior vinculada al trabajo).
2. **Crear proyecto / Create project** en el centro de Proyectos (`project-create.tsx`), en lugar de «Nuevo trabajo».
   - El modal (`?crearProyecto=1`) pide cliente existente (`CatalogSelect`), nombre del proyecto o servicio y fechas opcionales: ambas o ninguna, con hora de Costa Rica.
   - Escribe con el **mismo** `PATCH /api/pro/agenda`, que pasa por `saveAppointment` y `pro_patch_core`. No se duplica lógica.
   - Etapa: sin fechas queda `new` (Abierto), como `manual-lead-work`; con fechas queda `scheduled`, con la validación de solapamiento del servidor.
   - «Crear un cliente nuevo» abre el flujo de clientes existente (`pro_clients&editar=new`). El borrador del modal queda en `sessionStorage` (por cuenta) y el paso del modal en el historial, así que al volver el modal reaparece con lo escrito.
   - Al crear, abre el proyecto.
   - **409**: mensaje de conflicto y «Reintentar», que lee la revisión actual.
   - **Respuesta perdida (5xx o red)**: el intento conserva su id. El reintento consulta primero `GET /api/pro/agenda?id=` y, si el trabajo ya existe, lo abre sin crear otro.
   - **400**: mensaje de revisión de datos y nuevo id.
3. **Volver a Proyectos.** Al abrir un proyecto desde el centro se agrega `volverProyectos=<ruta del centro>`. `closeDetail` de `business-panel.tsx` lo valida (`tab=pro_projects`) y usa `backPro`, igual que `volverDia` y `volverCitaSolicitud`. Así funciona también tras recargar, sin historial. Tras crear, el paso del modal se reemplaza antes de navegar, así Volver no reabre el modal.

## Criterio exacto de vínculo (sin inferencias)

SQL `docs/pro/sql/project-planning-local.sql`, solo lectura: `pro_project_estimate_rows` y `pro_project_estimates_page`, `security invoker`, solo `service_role`, con elegibilidad `pro_private_work_tools_enabled`. Una cotización privada no archivada del dueño es:

- **project** si se cumple alguna de estas condiciones:
  - `source.kind='work'` y `source.id` es este trabajo;
  - existe un acuerdo aceptado en `pro_private_estimate_work_agreements` para este trabajo y esa cotización;
  - su origen es una solicitud manual convertida en este trabajo (`pro_manual_lead_works.work_id`).
- **client** si su `client_id` es el cliente del trabajo y **no** tiene ninguno de esos vínculos con **ningún** trabajo. Una cotización de otro proyecto del mismo cliente no aparece.
- Las archivadas, las de otros clientes y las de otros proyectos se excluyen.

Estado e importe:

- Se toman de la última publicación (`version` mayor), con el mismo mapeo que la lista comercial:
  - `awaiting_claim`, `shared` y `changes_requested` → `sent`;
  - `withdrawn` y `superseded` → `withdrawn`.
- Sin publicación, se toma el borrador.
- `unpublishedChanges` indica que el borrador tiene una revisión posterior a la publicada.

API `GET /api/pro/project-planning?workId=&scope=project|client&after=`: usa `proApiAccess`, comprueba `X-Pro-Expected-Actor` si viene, rechaza parámetros repetidos o extra y usa zod a la entrada y a la salida. Errores: 400 validación, 403 sin Pro o con otra cuenta, 404 trabajo ajeno o inexistente, 409 cursor obsoleto y 503 en el resto.

## Decisiones

- La vista de Cotizaciones es de solo lectura y no tiene estado sucio. Por eso no suma estado a `baseNestedBlocked`, pero sí respeta `nestedBlocked` y los estados de guardado o edición para deshabilitar acciones.
- El nombre visible de la pestaña es «Cotizaciones / Estimates», como la sección global. El grupo es «Planificación / Planning».
- El borrador del modal usa `sessionStorage` solo como comodidad. Todo funciona sin él.

## Evidencia

- `npx tsc --noEmit`: 0 errores. ESLint de los archivos tocados: 0 errores y 0 advertencias.
- SQL aplicado dos veces en 127.0.0.1 sin error. Manifiesto: PASS (100 módulos, 101 pasos, 117 dependencias).
- `tests/e2e/pro-project-planning.spec.ts`: 3/3 en `chromium-desktop` y 3/3 en `webkit-mobile` (API más UI ES y UI EN).
  - API: criterio exacto con siete casos sembrados (borrador del trabajo, acuerdo continuado en el trabajo, aceptada con origen en el trabajo, borrador y compartida del cliente, otro proyecto, otro cliente y archivada), estados, moneda, paginación 20+2 sin duplicados, lecturas idénticas sin escrituras, 400, 404, 409, 403 y aislamiento con otra cuenta Pro (404).
  - UI:
    - el menú tiene 4 grupos, con Planificación segundo;
    - la vista muestra las listas, los estados, el acuerdo y la moneda;
    - «Abrir cotización» y luego Cancelar vuelven a la vista;
    - Volver regresa a Proyectos;
    - en Crear proyecto se comprueban la validación de cliente y de fechas, el 409 y el reintento, y la respuesta perdida con reintento, con una sola fila en `pro_work` (`stage new`, sin fechas);
    - en la vista de Cotizaciones se comprueban el error con reintento, el estado vacío y la cotización nueva con cliente bloqueado, título precargado y `source.kind='work'`;
    - al guardar se vuelve a la vista, recargar la conserva y Volver lleva a Proyectos, con el proyecto en la lista;
    - en ambos idiomas no hay desbordamiento horizontal ni errores de página.
- Capturas revisadas con Read (escritorio y móvil, ES y EN): menú con Planificación, listas, modal Crear proyecto y vista vacía o creada.

## Límites

- Solo cotizaciones **privadas**. Las cotizaciones estándar o anteriores siguen en «Ver cotización» del Resumen.
- Falta el resto de Planning de Houzz: contratos, mediciones, planos, tableros de ideas y de selección, seguimiento de selecciones y licitaciones.
- «Crear un cliente nuevo» abre la sección de Clientes. Al guardar, el profesional vuelve con Volver y busca el cliente. No se selecciona solo.
- Si un intento con respuesta perdida sí se guardó y luego se cambian los campos antes de reintentar, el reintento abre el trabajo ya creado, con los datos del primer intento. Es la opción segura para no duplicar.
