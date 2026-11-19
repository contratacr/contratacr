# Solicitudes con bandejas (local)

11 noviembre 2026, rama `local/pro-suite-no-push`. Sin commit, push, correos, notificaciones ni llamadas externas. Referencia funcional: `houzz-live-structure-2026-11-10.md` (Leads). No se copiaron textos, nombres ni diseño de Houzz.

## Qué se hizo

La sección Solicitudes (`tab=pro_leads`) ahora funciona como un administrador de solicitudes con bandejas. Se reutiliza todo lo que ya existía: etapas configurables, oportunidades manuales, canales, próximo contacto, conversión a cotización o trabajo, archivo/restauración y sus recibos.

1. **Bandejas con contadores del servidor.** En escritorio hay una barra lateral y en el teléfono un selector «Bandeja de solicitudes». Grupos:
   - Activas: «Todas las activas» y una por cada etapa visible, en el orden configurado.
   - Inactivas: Pospuestas y Archivadas.
   - Importadas: Historial de importación.

   Los contadores se calculan en `pro_lead_inbox_read` con los mismos filtros principales que la lista: búsqueda, tipo de servicio, canal y período.
2. **Posponer.** Desde el menú de la fila, «Posponer solicitud» abre una ventana con la fecha (calendario de Costa Rica, de mañana a un año), atajos y una nota privada opcional. La solicitud sale de las activas y vuelve sola el día elegido. El vencimiento se calcula al leer con `(now() at time zone 'America/Costa_Rica')::date`, sin cron. Cada cambio usa una revisión optimista (409 si cambió), un recibo idempotente por `actionId` y un historial inmutable que se ve en la misma ventana. «Reactivar solicitud» la devuelve a mano. Una solicitud archivada no se puede posponer (409); primero hay que restaurarla.
3. **Filtros combinables.** Búsqueda (la existente), tipo de servicio, canal (el filtro existente) y período «Recibidas desde/hasta». El tipo de servicio es el tipo de proyecto de la oportunidad manual, o su título si no lo tiene, y el servicio en una solicitud de ContrataCR. Sus opciones vienen del servidor. La etapa ya se editaba en línea desde la lista con CAS: se conserva el mismo selector, sus recibos y su recuperación ante 409.
4. **Importar archivo CSV.**
   - Hay una plantilla descargable ES/EN. Las cabeceras se aceptan en español o inglés, sin importar tildes ni mayúsculas. Se admiten hasta 200 filas y 300 KB.
   - El servidor hace una vista previa con validación por fila: nombre, servicio, correo o teléfono, formato, longitudes, caracteres de control, contacto repetido en el archivo y canal desconocido.
   - Los duplicados se detectan por correo o teléfono (los 8 dígitos, sin el prefijo 506) **solo contra los clientes del mismo profesional**. Si coincide un cliente, la solicitud se le asocia («Cliente existente»). Si ese cliente ya tiene una solicitud manual activa con el mismo servicio, o una solicitud de ContrataCR con el mismo servicio, la fila se omite como duplicada.
   - La importación es atómica: una sola transacción crea los clientes nuevos con `pro_mutate_catalog`, que es el escritor existente del catálogo, y cada oportunidad con `pro_lead_origin_create`, que es el escritor existente con canal opcional y sus recibos e historial.
   - Es idempotente: repetir el mismo `actionId` devuelve el mismo recibo, y reutilizarlo con otro archivo da 400. Si hay filas con errores no se importa nada. Los identificadores hijos son UUID deterministas derivados del `actionId`.
5. **Historial de importación y deshacer.** Muestra filas, solicitudes creadas, duplicadas omitidas, las que siguen activas y los clientes nuevos o existentes. «Deshacer importación» archiva (no borra) las solicitudes de esa importación que siguen activas **y sin cambios**, con `pro_lead_private_core_mutate` (`archive`) y una revisión de la importación. Se conservan las que ya se editaron (revisión distinta de la de creación, incluido un cambio de etapa), las que tienen cotización o trabajo vinculado, próximo contacto, posposición o un cambio de canal posterior; el aviso indica cuántas se conservaron (revisión QA 2026-11-11). Los clientes creados se conservan. Un segundo intento da 409 y otra cuenta recibe 404.
6. **Métricas** (botón «Métricas»). Embudo por etapa y conversión a trabajo en un período de Costa Rica (por defecto, el mes en curso):
   - Muestra recibidas, abiertas, convertidas en trabajo y tasa de conversión, más las solicitudes abiertas por etapa con su porcentaje.
   - Se reutiliza debajo `LeadOriginMetrics` (solicitudes por canal).
   - Solo se cuenta como conversión un vínculo explícito y vigente: una oportunidad manual con su trabajo privado (`pro_manual_lead_works`), o una solicitud de ContrataCR cuyo trabajo existe y no está cancelado. No se inventan montos ni previsiones.
7. **Formulario de contacto.** El formulario de solicitud del perfil público (`PublicReservations`) ya crea solicitudes que llegan aquí como solicitudes de ContrataCR. El botón explica eso y enlaza el perfil público (`/profesionales/{slug}`) y Citas y trabajos, donde se activa «Recibir solicitudes de citas». No se creó un constructor de formularios.

## Archivos

- SQL: `docs/pro/sql/lead-inboxes-local.sql`, registrado en `scripts/pro/local-sql-manifest.mjs` con 4 aristas de dependencia.
  - Tablas: `pro_lead_snoozes`, `pro_lead_snooze_history`, `pro_lead_inbox_actions`, `pro_lead_imports`, `pro_lead_import_rows`.
  - RLS cerrada y funciones `security invoker` solo para `service_role`. La elegibilidad usa `pro_lead_origin_owner`. Las tablas de historial y recibos tienen triggers que las hacen inmutables.
- API: `src/app/api/pro/lead-inboxes/route.ts`.
  - Solo en `development` con Supabase de loopback.
  - Comprueba el actor, `X-Pro-Expected-Actor`, el origen, el límite de frecuencia y el tamaño del cuerpo: 16 KiB (413) para posponer, reactivar y deshacer, y hasta 1 MB solo para la vista previa y la importación del CSV.
  - Vistas: `list`, `funnel`, `imports`, `snooze` y `action`. Acciones POST: `snooze`, `wake`, `preview`, `import` y `undo_import`.
- Esquemas: `src/lib/pro/lead-inboxes.ts` (reutiliza `leadCommercialPageSchema` y `parseCatalogCsv`).
- Interfaz:
  - `src/components/pro/lead-inboxes.tsx`, que contiene la navegación, las ventanas de posponer, importar, métricas y formulario de contacto, y el historial.
  - Inserciones en `src/components/pro/leads-workspace.tsx`: la lista lee `/api/pro/lead-inboxes` con el mismo sobre de página, contexto y etapas, y además las bandejas, filtros, acciones de la fila y ventanas.
  - `src/components/pro/pro-space.tsx` pasa el `slug`.
- Pruebas: `tests/e2e/pro-leads-inboxes.spec.ts`. Ajustes intencionales en `tests/e2e/pro-lead-center.spec.ts` y `tests/e2e/pro-request-pipeline.spec.ts`, descritos en «Evidencia».

## Decisiones

- **Responsable:** no existe asignación de solicitudes a personas. El equipo actual (`team.ts`) otorga acceso por trabajo, no por cuenta ni por solicitud. No se inventó ese filtro. Falta un modelo de responsables de solicitud.
- La bandeja Archivadas incluye las archivadas aunque tuvieran una posposición. Al restaurarlas, si la fecha sigue en el futuro, vuelven a Pospuestas.
- El conmutador anterior Activas/Archivadas y el selector «Etapa» se sustituyeron por las bandejas, porque se volvieron redundantes. Por eso se actualizaron dos specs (ver abajo).
- La lista conserva el mismo sobre que `pro_lead_commercial_read` (página, contexto y etapas), así que los editores, selectores y recibos existentes no cambiaron. Las funciones viejas quedan intactas.
- Deshacer no borra nada: archivar es reversible desde Archivadas.

## Evidencia

- SQL aplicado dos veces en loopback (`apply-one.mjs`): ok/ok. Manifiesto: PASS (107 módulos, 146 dependencias). `tsc`: 0 errores. ESLint de los archivos tocados: limpio.
- `pro-leads-inboxes.spec.ts`: 6/6 en chromium-desktop y 6/6 en webkit-mobile (ES y EN). Cubre:
  - API: 400, 401, 403 (actor y origen), 404, 409, idempotencia y reutilización de `actionId`, aislamiento con una segunda cuenta Pro, vencimiento CR forzando `until_date=hoy`, filtros combinados y contadores.
  - Importación: errores por fila, duplicados, atomicidad, deshacer y embudo calculado a mano (5 recibidas, 1 convertida, 20 %).
  - Interfaz completa con recarga, sin desbordamiento horizontal y sin errores de página.
- Regresión: 24 specs de solicitudes, pedidos, seguimiento, canales y etapas, más `pro-projects` y `pro-job-workspace` (102 casos por perfil). En la primera corrida, 93 pasaron y 9 fallaron por perfil:
  - 8 por falta del entorno nativo `PRO_LOCAL_PSQL`/`PG*` de esas specs.
  - 1 intermitente por perfil: `pro-request-quote-journey` en Chromium y `pro-lead-followups-journey` en WebKit, por tiempo de espera.

  Repetidos con ese entorno de loopback: Chromium 8 de 10 y luego 3 de 3 (`pro-lead-origins-api` y `pro-request-quote-journey` fallaron una vez por carga concurrente y pasaron en aislamiento); WebKit 9/9. Nada falla por este cambio.
- Ajustes intencionales de specs existentes, porque las bandejas reemplazan los controles anteriores:
  - `pro-lead-center.spec.ts` elige las bandejas Archivadas y Activas en lugar del conmutador.
  - `pro-request-pipeline.spec.ts` elige la bandeja de la etapa «Nueva» en lugar del selector «Etapa».

  Las aserciones no cambian.
- Capturas revisadas en `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/inbox-shots/` (escritorio y móvil).

## Límites

- Falta el filtro por responsable, por falta de un modelo de asignación.
- No hay integración con Zapier ni con correo.
- No hay mapeo manual de columnas: solo las cabeceras conocidas.
- El embudo muestra la distribución actual por etapa de lo recibido en el período, no el historial de pasos entre etapas.
- La vista previa compara solo con los clientes propios. No consulta perfiles de otras cuentas, así que no detecta un cliente de ContrataCR sin ficha privada con correo.
- En WebKit, el campo de fecha vacío muestra la fecha actual en gris (comportamiento nativo). El botón nativo del selector de archivo usa el idioma del navegador.
