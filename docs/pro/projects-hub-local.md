# Centro de Proyectos y menú de proyecto — 2026-11-10

Solo checkout Pro, rama `local/pro-suite-no-push`. Sin push, despliegue ni envíos. Referencia: estructura observada en `houzz-live-structure-2026-11-10.md`.

## Objetivo acordado con Isaac

Replicar Houzz Pro en ContrataCR por ingeniería inversa: **misma estructura, mismas funciones y mismos recorridos**, adaptados a Costa Rica. No se copian la marca, los logotipos, los íconos, los textos literales ni el diseño gráfico exacto de Houzz. Se usan componentes, marca y redacción propios de ContrataCR.

## Implementado y verificado localmente

- **Proyectos** (`?tab=pro_projects`): primera entrada de Gestión en el menú de Pro, en Inicio y en el selector móvil.
  - Lista de los trabajos existentes como proyectos, más recientes primero.
  - Filtro de estado con contadores; por defecto «Abiertos y en curso», como el «Open, In Progress» de Houzz.
  - Búsqueda por proyecto o cliente, con 300 ms de espera mientras se escribe.
  - Tabla en escritorio y tarjetas en móvil; paginación de 20.
  - Indicadores de cliente con acceso, vista personalizada y cotización vinculada.
  - Abrir un proyecto lleva a su expediente.
- **Estado derivado** sin escribir datos: cancelado → Cancelado; etapa completada → Terminado; agendado con fecha → En curso; el resto → Abierto. `pro_work` no tiene fecha de creación, así que no se inventa: se ordena por la posición estable.
- SQL `projects-local.sql`: solo lectura, una función de estado y una página. Elegibilidad con `pro_private_work_tools_enabled`. Sin tablas nuevas. Se aplicó dos veces a la base de 127.0.0.1 sin error.
- **Menú del proyecto** (`JobWorkspace`): Resumen y los grupos **Gestión** (Tareas, Avances, Vista del cliente, Constancia) y **Finanzas** (Costos y pagos, Extras y cambios). En escritorio es una columna lateral; en móvil, una cuadrícula. Los nombres de los botones no cambian.

## Verificación

- TypeScript: 0 errores. ESLint de los archivos tocados: 0 errores y 0 advertencias. Manifiesto: PASS (99 módulos, 100 pasos, 111 dependencias).
- `pro-projects.spec.ts`: 4/4 PASS (ES/EN en Chromium escritorio y WebKit móvil). Cubre:
  - conteos y estados derivados, paginación 20+3 sin duplicados, filtros, búsqueda y consultas inválidas (400);
  - aislamiento: otra cuenta solo ve lo suyo;
  - en la interfaz: filtros, «Ver más», búsqueda, estado vacío, abrir el proyecto, tres grupos en el menú, abrir la Vista del cliente y ausencia de desbordamiento horizontal;
  - `pro_work` queda sin cambios.
  - Capturas revisadas en WebKit móvil ES.
- `pro-client-dashboard.spec.ts`: 6/6 en los tres perfiles.
- Regresión del expediente (`pro-job-workspace`, `pro-work-costs`, `pro-work-tasks`, `pro-work-files`, `pro-work-schedule`, Chromium escritorio): 11 PASS. Los únicos fallos fueron 2 en `pro-job-workspace`, que esperaba 6 pestañas. Se actualizó a 7 por la nueva Vista del cliente, que es un cambio intencional, y pasa en Chromium escritorio y WebKit móvil.
- Fallo previo no relacionado: los casos de interfaz de `pro-work-updates.spec.ts` (ver `client-dashboard-local.md`).

## Pendiente dentro de esta familia

- El grupo **Planificación** ya tiene Cotizaciones y el centro ya permite «Crear proyecto» (ver `project-planning-local.md`). Faltan mediciones, planos, tableros, selecciones y licitaciones.
- Etiquetas, responsables, ubicación, fecha de consulta y vista de tablero, como en Houzz.
- Que el expediente se abra dentro de Proyectos, conservando ese menú, en lugar de pasar a Citas.
